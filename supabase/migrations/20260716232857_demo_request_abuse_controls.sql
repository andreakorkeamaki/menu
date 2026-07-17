-- Public lead intake is pre-tenant and therefore cannot use organization-scoped
-- rate rows. Keep quota state and security events in the unexposed private
-- schema, retain only keyed hashes, and expose narrowly granted RPCs.

create table private.public_form_rate_limits (
  form_key text not null check (form_key = 'demo_request'),
  scope text not null check (scope in ('ip', 'email')),
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  updated_at timestamptz not null default now(),
  primary key (form_key, scope, key_hash)
);

create table private.public_form_events (
  id bigint generated always as identity primary key,
  form_key text not null check (form_key = 'demo_request'),
  event_type text not null check (event_type in ('accepted', 'duplicate', 'rate_limited', 'honeypot')),
  key_hash text check (key_hash is null or key_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

create index public_form_rate_limits_updated_idx
  on private.public_form_rate_limits (updated_at);
create index public_form_events_created_idx
  on private.public_form_events (created_at desc);
create index public_form_events_type_created_idx
  on private.public_form_events (event_type, created_at desc);

comment on table private.public_form_rate_limits is
  'Fixed-window public form quotas keyed only by a server-side HMAC.';
comment on table private.public_form_events is
  'Privacy-minimized public form outcomes for operator health reporting.';

create or replace function private.submit_demo_request(
  p_ip_hash text,
  p_email_hash text,
  p_restaurant_name text,
  p_city text,
  p_contact_name text,
  p_email text,
  p_phone text,
  p_contact_role text,
  p_current_menu_url text,
  p_desired_languages text[],
  p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_email_attempts integer;
  v_email_window timestamptz;
  v_ip_attempts integer := 0;
  v_ip_window timestamptz := v_now;
  v_retry_after integer := 0;
  v_duplicate boolean;
begin
  if p_email_hash is null or p_email_hash !~ '^[0-9a-f]{64}$'
     or (p_ip_hash is not null and p_ip_hash !~ '^[0-9a-f]{64}$') then
    raise exception 'Invalid public form fingerprint' using errcode = '22023';
  end if;

  -- The upsert serializes concurrent submissions for the same fingerprint, so
  -- quota consumption and duplicate suppression cannot race one another.
  insert into private.public_form_rate_limits as limiter (
    form_key, scope, key_hash, window_started_at, attempts, updated_at
  ) values (
    'demo_request', 'email', p_email_hash, v_now, 1, v_now
  )
  on conflict (form_key, scope, key_hash) do update set
    window_started_at = case
      when limiter.window_started_at <= v_now - interval '1 hour' then v_now
      else limiter.window_started_at
    end,
    attempts = case
      when limiter.window_started_at <= v_now - interval '1 hour' then 1
      else limiter.attempts + 1
    end,
    updated_at = v_now
  returning attempts, window_started_at into v_email_attempts, v_email_window;

  if p_ip_hash is not null then
    insert into private.public_form_rate_limits as limiter (
      form_key, scope, key_hash, window_started_at, attempts, updated_at
    ) values (
      'demo_request', 'ip', p_ip_hash, v_now, 1, v_now
    )
    on conflict (form_key, scope, key_hash) do update set
      window_started_at = case
        when limiter.window_started_at <= v_now - interval '15 minutes' then v_now
        else limiter.window_started_at
      end,
      attempts = case
        when limiter.window_started_at <= v_now - interval '15 minutes' then 1
        else limiter.attempts + 1
      end,
      updated_at = v_now
    returning attempts, window_started_at into v_ip_attempts, v_ip_window;
  end if;

  if v_email_attempts > 3 then
    v_retry_after := greatest(
      v_retry_after,
      greatest(1, ceil(extract(epoch from (v_email_window + interval '1 hour' - v_now)))::integer)
    );
  end if;
  if v_ip_attempts > 6 then
    v_retry_after := greatest(
      v_retry_after,
      greatest(1, ceil(extract(epoch from (v_ip_window + interval '15 minutes' - v_now)))::integer)
    );
  end if;

  if v_retry_after > 0 then
    insert into private.public_form_events (form_key, event_type, key_hash)
    values ('demo_request', 'rate_limited', p_email_hash);
    return jsonb_build_object(
      'accepted', false,
      'duplicate', false,
      'retry_after_seconds', v_retry_after
    );
  end if;

  select exists (
    select 1
    from public.demo_requests request
    where lower(request.email) = lower(p_email)
      and request.created_at >= v_now - interval '15 minutes'
  ) into v_duplicate;

  if v_duplicate then
    insert into private.public_form_events (form_key, event_type, key_hash)
    values ('demo_request', 'duplicate', p_email_hash);
    return jsonb_build_object('accepted', true, 'duplicate', true, 'retry_after_seconds', 0);
  end if;

  insert into public.demo_requests (
    restaurant_name, city, contact_name, email, phone, contact_role,
    current_menu_url, desired_languages, notes, consented_at
  ) values (
    p_restaurant_name, p_city, p_contact_name, lower(p_email), nullif(p_phone, ''),
    p_contact_role, nullif(p_current_menu_url, ''), coalesce(p_desired_languages, '{}'::text[]),
    nullif(p_notes, ''), v_now
  );

  insert into private.public_form_events (form_key, event_type, key_hash)
  values ('demo_request', 'accepted', p_email_hash);

  -- Bound privacy-sensitive operational state without requiring a separate cron
  -- dependency during the pilot phase.
  delete from private.public_form_rate_limits where updated_at < v_now - interval '7 days';
  delete from private.public_form_events where created_at < v_now - interval '90 days';

  return jsonb_build_object('accepted', true, 'duplicate', false, 'retry_after_seconds', 0);
end;
$$;

create or replace function private.record_demo_request_honeypot(p_key_hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid public form fingerprint' using errcode = '22023';
  end if;
  insert into private.public_form_events (form_key, event_type, key_hash)
  values ('demo_request', 'honeypot', p_key_hash);
end;
$$;

create or replace function private.demo_request_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not (select private.is_operator()) then
    raise exception 'Platform operator access required' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'accepted_24h', count(*) filter (where event_type = 'accepted' and created_at >= now() - interval '24 hours'),
    'accepted_7d', count(*) filter (where event_type = 'accepted' and created_at >= now() - interval '7 days'),
    'duplicate_24h', count(*) filter (where event_type = 'duplicate' and created_at >= now() - interval '24 hours'),
    'blocked_24h', count(*) filter (where event_type in ('rate_limited', 'honeypot') and created_at >= now() - interval '24 hours'),
    'last_accepted_at', max(created_at) filter (where event_type = 'accepted')
  ) into result
  from private.public_form_events;
  return result;
end;
$$;

create or replace function public.submit_demo_request(
  p_ip_hash text,
  p_email_hash text,
  p_restaurant_name text,
  p_city text,
  p_contact_name text,
  p_email text,
  p_phone text,
  p_contact_role text,
  p_current_menu_url text,
  p_desired_languages text[],
  p_notes text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.submit_demo_request(
    p_ip_hash, p_email_hash, p_restaurant_name, p_city, p_contact_name,
    p_email, p_phone, p_contact_role, p_current_menu_url, p_desired_languages, p_notes
  );
$$;

create or replace function public.record_demo_request_honeypot(p_key_hash text)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.record_demo_request_honeypot(p_key_hash); $$;

create or replace function public.demo_request_health()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$ select private.demo_request_health(); $$;

revoke all on private.public_form_rate_limits, private.public_form_events
  from public, anon, authenticated, service_role;

revoke all on function private.submit_demo_request(text, text, text, text, text, text, text, text, text, text[], text)
  from public, anon, authenticated, service_role;
revoke all on function private.record_demo_request_honeypot(text)
  from public, anon, authenticated, service_role;
revoke all on function private.demo_request_health()
  from public, anon, authenticated, service_role;
revoke all on function public.submit_demo_request(text, text, text, text, text, text, text, text, text, text[], text)
  from public, anon, authenticated, service_role;
revoke all on function public.record_demo_request_honeypot(text)
  from public, anon, authenticated, service_role;
revoke all on function public.demo_request_health()
  from public, anon, authenticated, service_role;

grant usage on schema private to service_role;
grant execute on function private.submit_demo_request(text, text, text, text, text, text, text, text, text, text[], text)
  to service_role;
grant execute on function private.record_demo_request_honeypot(text)
  to service_role;
grant execute on function public.submit_demo_request(text, text, text, text, text, text, text, text, text, text[], text)
  to service_role;
grant execute on function public.record_demo_request_honeypot(text)
  to service_role;

grant execute on function private.demo_request_health() to authenticated;
grant execute on function public.demo_request_health() to authenticated;

-- The public review wrapper invokes the private definer; grant the authenticated
-- role execute on the unexposed implementation while keeping it outside PostgREST.
grant execute on function private.review_brand_media(uuid, uuid, text, text, text)
  to authenticated;
