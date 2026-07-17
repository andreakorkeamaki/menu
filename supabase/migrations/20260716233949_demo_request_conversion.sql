-- A qualified pre-tenant enquiry becomes traceable to the organization and
-- onboarding case created from it. The full handoff runs in the same database
-- transaction as provisioning, so operators never need to reconcile partial
-- conversion state manually.

alter table public.demo_requests
  add column organization_id uuid references public.organizations (id) on delete restrict,
  add column onboarding_case_id uuid,
  add column converted_at timestamptz,
  add column converted_by uuid references auth.users (id) on delete set null;

alter table public.demo_requests
  add constraint demo_requests_conversion_case_fkey
    foreign key (organization_id, onboarding_case_id)
    references public.onboarding_cases (organization_id, id) on delete restrict,
  add constraint demo_requests_conversion_fields_check check (
    (organization_id is null and onboarding_case_id is null and converted_at is null and converted_by is null)
    or (organization_id is not null and onboarding_case_id is not null and converted_at is not null)
  ) not valid,
  add constraint demo_requests_converted_status_check check (
    status <> 'converted'
    or (organization_id is not null and onboarding_case_id is not null and converted_at is not null)
  ) not valid,
  add constraint demo_requests_link_requires_converted_check check (
    organization_id is null or status = 'converted'
  ) not valid;

create index demo_requests_organization_idx
  on public.demo_requests (organization_id) where organization_id is not null;
create index demo_requests_onboarding_case_idx
  on public.demo_requests (onboarding_case_id) where onboarding_case_id is not null;
create index demo_requests_converted_by_idx
  on public.demo_requests (converted_by) where converted_by is not null;

create or replace function private.provision_restaurant(
  p_name text,
  p_slug text,
  p_location_name text,
  p_location_slug text,
  p_owner_user_id uuid,
  p_contact_name text,
  p_contact_email text,
  p_city text,
  p_demo_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  provisioned jsonb;
  organization_value uuid;
  location_value uuid;
  onboarding_value uuid;
  lead_row public.demo_requests%rowtype;
begin
  if nullif(btrim(coalesce(p_city, '')), '') is null or char_length(btrim(p_city)) > 120 then
    raise exception 'A valid city is required' using errcode = '22023';
  end if;

  provisioned := private.provision_organization(
    p_name, p_slug, p_location_name, p_location_slug, p_owner_user_id,
    p_contact_name, p_contact_email
  );
  organization_value := (provisioned ->> 'organization_id')::uuid;
  location_value := (provisioned ->> 'location_id')::uuid;
  onboarding_value := (provisioned ->> 'onboarding_case_id')::uuid;

  update public.locations
  set city = btrim(p_city), updated_at = now()
  where id = location_value and organization_id = organization_value;

  if p_demo_request_id is not null then
    select * into lead_row
    from public.demo_requests
    where id = p_demo_request_id
    for update;

    if lead_row.id is null then
      raise exception 'Demo request not found' using errcode = 'P0002';
    end if;
    if lead_row.status = 'closed' then
      raise exception 'A closed demo request cannot be converted' using errcode = 'P0001';
    end if;
    if lead_row.status = 'converted' then
      if lead_row.organization_id = organization_value
         and lead_row.onboarding_case_id = onboarding_value then
        return provisioned;
      end if;
      raise exception 'Demo request already belongs to another onboarding' using errcode = 'P0001';
    end if;

    update public.demo_requests
    set status = 'converted',
        organization_id = organization_value,
        onboarding_case_id = onboarding_value,
        converted_at = now(),
        converted_by = (select auth.uid()),
        updated_at = now()
    where id = lead_row.id;

    insert into public.audit_logs (
      organization_id, actor_user_id, action, entity_type, entity_id, changed_fields, context
    ) values (
      organization_value, (select auth.uid()), 'convert', 'demo_request', lead_row.id::text,
      array['status', 'organization_id', 'onboarding_case_id'],
      jsonb_build_object('onboarding_case_id', onboarding_value)
    );
  end if;

  return provisioned;
end;
$$;

create or replace function public.provision_restaurant(
  p_name text,
  p_slug text,
  p_location_name text,
  p_location_slug text,
  p_owner_user_id uuid,
  p_contact_name text,
  p_contact_email text,
  p_city text,
  p_demo_request_id uuid default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.provision_restaurant(
    p_name, p_slug, p_location_name, p_location_slug, p_owner_user_id,
    p_contact_name, p_contact_email, p_city, p_demo_request_id
  );
$$;

revoke all on function private.provision_restaurant(text, text, text, text, uuid, text, text, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.provision_restaurant(text, text, text, text, uuid, text, text, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.provision_restaurant(text, text, text, text, uuid, text, text, text, uuid)
  to authenticated;
grant execute on function public.provision_restaurant(text, text, text, text, uuid, text, text, text, uuid)
  to authenticated;
