-- Pre-tenant sales enquiries are platform-owned records. They intentionally have no
-- organization_id until an operator qualifies and provisions the restaurant.
create table public.demo_requests (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'new'
    check (status in ('new', 'contacted', 'qualified', 'converted', 'closed')),
  restaurant_name text not null check (char_length(restaurant_name) between 2 and 160),
  city text not null check (char_length(city) between 2 and 120),
  contact_name text not null check (char_length(contact_name) between 2 and 160),
  email text not null check (char_length(email) between 5 and 320),
  phone text check (phone is null or char_length(phone) between 5 and 40),
  contact_role text not null
    check (contact_role in ('owner', 'manager', 'consultant', 'other')),
  current_menu_url text check (current_menu_url is null or char_length(current_menu_url) <= 2000),
  desired_languages text[] not null default '{}'
    check (desired_languages <@ array['en', 'fr', 'de', 'es']::text[]),
  notes text check (notes is null or char_length(notes) <= 2000),
  source text not null default 'website' check (char_length(source) between 2 and 80),
  consented_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.demo_requests is
  'Platform-owned demo enquiries captured before a tenant organization exists.';

create index demo_requests_status_created_idx
  on public.demo_requests (status, created_at desc);
create index demo_requests_email_created_idx
  on public.demo_requests (lower(email), created_at desc);

create trigger demo_requests_set_updated_at
before update on public.demo_requests
for each row execute function private.set_updated_at();

alter table public.demo_requests enable row level security;

create policy demo_requests_select_operator on public.demo_requests
for select to authenticated
using ((select private.is_operator()));

create policy demo_requests_update_operator on public.demo_requests
for update to authenticated
using ((select private.is_operator()))
with check ((select private.is_operator()));

revoke all on public.demo_requests from public, anon, authenticated;
grant select, update on public.demo_requests to authenticated;
grant all on public.demo_requests to service_role;
