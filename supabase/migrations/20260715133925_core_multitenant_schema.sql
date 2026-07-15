-- MenuInterattivo core schema.
-- Draft data is normalized and tenant-scoped; public reads use immutable snapshots.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create type public.membership_role as enum ('owner', 'editor');
create type public.organization_status as enum ('onboarding', 'active', 'suspended');
create type public.location_status as enum ('draft', 'active', 'archived');
create type public.translation_status as enum ('missing', 'machine_draft', 'approved', 'stale', 'error');
create type public.translation_origin as enum ('machine', 'manual');
create type public.media_approval_status as enum ('draft', 'approved', 'rejected');
create type public.onboarding_status as enum (
  'materials_missing', 'ready', 'importing', 'review', 'awaiting_customer', 'published'
);
create type public.ai_job_kind as enum ('menu_import', 'translation');
create type public.ai_job_status as enum ('pending', 'queued', 'running', 'review', 'completed', 'failed', 'cancelled');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  timezone text not null default 'Europe/Rome',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.profiles (id, full_name)
select user_account.id, coalesce(user_account.raw_user_meta_data ->> 'full_name', '')
from auth.users user_account
on conflict (id) do nothing;

create table public.platform_staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'operator' check (role = 'operator'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status public.organization_status not null default 'onboarding',
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.membership_role not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  unique (organization_id, user_id)
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status public.location_status not null default 'draft',
  name text not null check (char_length(btrim(name)) between 1 and 160),
  tagline_it text not null default '',
  description_it text not null default '',
  address text not null default '',
  city text not null default '',
  phone text not null default '',
  email text,
  whatsapp_url text,
  reservation_url text,
  map_url text,
  instagram_url text,
  opening_hours jsonb not null default '[]'::jsonb check (jsonb_typeof(opening_hours) = 'array'),
  logo_url text,
  cover_url text,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  unique (organization_id, id)
);

create table public.menus (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid not null,
  name text not null default 'Menu principale' check (char_length(btrim(name)) between 1 and 160),
  currency text not null default 'EUR' check (currency = 'EUR'),
  source_locale text not null default 'it' check (source_locale = 'it'),
  active_locales text[] not null default array['it','en','fr','de','es']::text[],
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  constraint menus_active_locales_check check (
    cardinality(active_locales) between 1 and 6
    and active_locales @> array['it']::text[]
    and active_locales <@ array['it','en','fr','de','es']::text[]
  ),
  unique (organization_id, id),
  unique (organization_id, location_id, id),
  foreign key (organization_id, location_id)
    references public.locations (organization_id, id) on delete cascade
);

create table public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  menu_id uuid not null,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name_it text not null check (char_length(btrim(name_it)) between 1 and 160),
  description_it text,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  unique (organization_id, id),
  unique (menu_id, slug),
  foreign key (organization_id, menu_id)
    references public.menus (organization_id, id) on delete cascade
);

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  category_id uuid not null,
  name_it text not null check (char_length(btrim(name_it)) between 1 and 200),
  description_it text,
  ingredients_it text,
  price numeric(10,2) not null default 0 check (price >= 0),
  available boolean not null default true,
  vegetarian boolean not null default false,
  vegan boolean not null default false,
  gluten_free boolean not null default false,
  image_url text,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  unique (organization_id, id),
  foreign key (organization_id, category_id)
    references public.menu_categories (organization_id, id) on delete cascade
);

create table public.item_variants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  item_id uuid not null,
  name_it text not null check (char_length(btrim(name_it)) between 1 and 160),
  price_delta numeric(10,2) not null default 0,
  available boolean not null default true,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  unique (organization_id, id),
  foreign key (organization_id, item_id)
    references public.menu_items (organization_id, id) on delete cascade
);

create table public.allergens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  code text not null check (code ~ '^[a-z0-9_]+$'),
  name_it text not null check (char_length(btrim(name_it)) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, code)
);

create table public.item_allergens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  item_id uuid not null,
  allergen_id uuid not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (item_id, allergen_id),
  foreign key (organization_id, item_id)
    references public.menu_items (organization_id, id) on delete cascade,
  foreign key (organization_id, allergen_id)
    references public.allergens (organization_id, id) on delete cascade
);

create table public.translations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  entity_type text not null check (entity_type in ('category', 'item', 'variant', 'location')),
  entity_id uuid not null,
  locale text not null check (locale in ('en', 'fr', 'de', 'es')),
  field_name text not null,
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  translated_text text,
  status public.translation_status not null default 'missing',
  origin public.translation_origin not null default 'machine',
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, entity_type, entity_id, locale, field_name),
  check ((status <> 'approved') or (translated_text is not null and btrim(translated_text) <> '')),
  check ((approved_at is null and approved_by is null) or status = 'approved')
);

create table public.themes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid not null,
  theme_key text not null default 'editorial' check (theme_key in ('editorial', 'minimal')),
  background text not null default '#f4eee4',
  surface text not null default '#fffaf1',
  text text not null default '#24231f',
  muted text not null default '#6d685f',
  accent text not null default '#9d3d2e',
  accent_text text not null default '#fffaf1',
  heading_font text not null default 'var(--font-serif)',
  body_font text not null default 'var(--font-sans)',
  radius text not null default '1.5rem',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  unique (organization_id, id),
  foreign key (organization_id, location_id)
    references public.locations (organization_id, id) on delete cascade
);

create unique index themes_one_active_per_location_idx
  on public.themes (location_id) where is_active;

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid,
  menu_id uuid,
  bucket_id text not null check (bucket_id in ('intake', 'public-media')),
  object_path text not null,
  media_kind text not null default 'gallery' check (media_kind in ('logo', 'cover', 'gallery', 'menu_item', 'intake')),
  mime_type text,
  alt_text text,
  approval_status public.media_approval_status not null default 'draft',
  is_public boolean not null default false,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  unique (organization_id, id),
  unique (bucket_id, object_path),
  foreign key (organization_id, location_id)
    references public.locations (organization_id, id) on delete cascade,
  foreign key (organization_id, menu_id)
    references public.menus (organization_id, id) on delete cascade,
  check (location_id is not null or menu_id is not null),
  check (not is_public or (bucket_id = 'public-media' and approval_status = 'approved'))
);

create table public.qr_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid not null,
  menu_id uuid not null,
  short_code text not null unique check (short_code ~ '^[A-Z0-9]{6,16}$'),
  destination_path text not null check (destination_path ~ '^/r/[a-z0-9]+(?:-[a-z0-9]+)*(?:/(?:it|en|fr|de|es))?$'),
  locale text check (locale is null or locale in ('it', 'en', 'fr', 'de', 'es')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  unique (organization_id, id),
  foreign key (organization_id, location_id)
    references public.locations (organization_id, id) on delete cascade,
  foreign key (organization_id, location_id, menu_id)
    references public.menus (organization_id, location_id, id) on delete cascade
);

create table public.menu_publications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid not null,
  menu_id uuid not null,
  location_slug text not null,
  version integer not null check (version > 0),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  snapshot_hash text not null check (snapshot_hash ~ '^[0-9a-f]{64}$'),
  is_current boolean not null default false,
  published_at timestamptz not null default now(),
  published_by uuid references auth.users (id) on delete set null,
  restored_from_id uuid references public.menu_publications (id) on delete restrict,
  unique (organization_id, id),
  unique (menu_id, version),
  foreign key (organization_id, location_id)
    references public.locations (organization_id, id) on delete restrict,
  foreign key (organization_id, location_id, menu_id)
    references public.menus (organization_id, location_id, id) on delete restrict
);

alter table public.menus add column current_publication_id uuid;
alter table public.menus add constraint menus_current_publication_fkey
  foreign key (organization_id, current_publication_id)
  references public.menu_publications (organization_id, id) on delete restrict;

create unique index menu_publications_one_current_per_menu_idx
  on public.menu_publications (menu_id) where is_current;
create index menu_publications_public_lookup_idx
  on public.menu_publications (location_slug) where is_current;

create table public.onboarding_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid,
  status public.onboarding_status not null default 'materials_missing',
  assigned_to uuid references auth.users (id) on delete set null,
  contact_name text,
  contact_email text,
  source_file_path text,
  notes text,
  checklist jsonb not null default '{}'::jsonb check (jsonb_typeof(checklist) = 'object'),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  unique (organization_id, id),
  foreign key (organization_id, location_id)
    references public.locations (organization_id, id) on delete cascade
);

create table public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  onboarding_case_id uuid,
  menu_id uuid,
  kind public.ai_job_kind not null,
  job_type public.ai_job_kind,
  model text not null,
  prompt_version text not null,
  response_id text,
  status public.ai_job_status not null default 'queued',
  attempts integer not null default 0 check (attempts >= 0),
  input jsonb not null default '{}'::jsonb check (jsonb_typeof(input) = 'object'),
  input_file_path text,
  output jsonb,
  error jsonb,
  usage jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  unique (organization_id, id),
  foreign key (organization_id, onboarding_case_id)
    references public.onboarding_cases (organization_id, id) on delete cascade,
  foreign key (organization_id, menu_id)
    references public.menus (organization_id, id) on delete cascade
);

create unique index ai_jobs_response_id_idx on public.ai_jobs (response_id) where response_id is not null;
create index ai_jobs_queue_idx on public.ai_jobs (status, created_at)
  where status in ('pending', 'queued', 'running');

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  ai_job_id uuid not null,
  webhook_id text not null unique,
  event_type text not null,
  response_id text,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error jsonb,
  unique (organization_id, id),
  foreign key (organization_id, ai_job_id)
    references public.ai_jobs (organization_id, id) on delete cascade
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  changed_fields text[] not null default '{}'::text[],
  context jsonb not null default '{}'::jsonb check (jsonb_typeof(context) = 'object'),
  created_at timestamptz not null default now()
);

-- Foreign-key and policy indexes. PostgreSQL does not create these automatically.
create index platform_staff_created_by_idx on public.platform_staff (created_by) where created_by is not null;
create index organizations_created_by_idx on public.organizations (created_by) where created_by is not null;
create index memberships_user_id_idx on public.memberships (user_id);
create index memberships_created_by_idx on public.memberships (created_by) where created_by is not null;
create index locations_organization_id_idx on public.locations (organization_id);
create index locations_created_by_idx on public.locations (created_by) where created_by is not null;
create index menus_organization_location_idx on public.menus (organization_id, location_id);
create index menus_created_by_idx on public.menus (created_by) where created_by is not null;
create index menus_current_publication_idx on public.menus (current_publication_id)
  where current_publication_id is not null;
create index menu_categories_organization_menu_idx on public.menu_categories (organization_id, menu_id, sort_order);
create index menu_categories_created_by_idx on public.menu_categories (created_by) where created_by is not null;
create index menu_items_organization_category_idx on public.menu_items (organization_id, category_id, sort_order);
create index menu_items_created_by_idx on public.menu_items (created_by) where created_by is not null;
create index item_variants_organization_item_idx on public.item_variants (organization_id, item_id, sort_order);
create index item_variants_created_by_idx on public.item_variants (created_by) where created_by is not null;
create index allergens_organization_id_idx on public.allergens (organization_id);
create index item_allergens_organization_item_idx on public.item_allergens (organization_id, item_id);
create index item_allergens_organization_allergen_idx on public.item_allergens (organization_id, allergen_id);
create index translations_entity_idx on public.translations (organization_id, entity_type, entity_id);
create index translations_review_queue_idx on public.translations (organization_id, status, updated_at)
  where status in ('missing', 'machine_draft', 'stale', 'error');
create index translations_approved_by_idx on public.translations (approved_by) where approved_by is not null;
create index themes_organization_location_idx on public.themes (organization_id, location_id);
create index themes_created_by_idx on public.themes (created_by) where created_by is not null;
create index media_assets_organization_location_idx on public.media_assets (organization_id, location_id) where location_id is not null;
create index media_assets_organization_menu_idx on public.media_assets (organization_id, menu_id) where menu_id is not null;
create index media_assets_created_by_idx on public.media_assets (created_by) where created_by is not null;
create index media_assets_approved_by_idx on public.media_assets (approved_by) where approved_by is not null;
create index media_assets_public_idx on public.media_assets (organization_id, sort_order)
  where is_public and approval_status = 'approved' and bucket_id = 'public-media';
create index qr_codes_organization_location_idx on public.qr_codes (organization_id, location_id);
create index qr_codes_organization_menu_idx on public.qr_codes (organization_id, menu_id);
create index qr_codes_created_by_idx on public.qr_codes (created_by) where created_by is not null;
create index menu_publications_organization_menu_idx on public.menu_publications (organization_id, menu_id, version desc);
create index menu_publications_organization_location_idx on public.menu_publications (organization_id, location_id);
create index menu_publications_published_by_idx on public.menu_publications (published_by) where published_by is not null;
create index menu_publications_restored_from_idx on public.menu_publications (restored_from_id) where restored_from_id is not null;
create index onboarding_cases_organization_location_idx on public.onboarding_cases (organization_id, location_id);
create index onboarding_cases_assigned_to_idx on public.onboarding_cases (assigned_to) where assigned_to is not null;
create index onboarding_cases_created_by_idx on public.onboarding_cases (created_by) where created_by is not null;
create index ai_jobs_organization_case_idx on public.ai_jobs (organization_id, onboarding_case_id) where onboarding_case_id is not null;
create index ai_jobs_organization_menu_idx on public.ai_jobs (organization_id, menu_id) where menu_id is not null;
create index ai_jobs_created_by_idx on public.ai_jobs (created_by) where created_by is not null;
create index webhook_events_organization_job_idx on public.webhook_events (organization_id, ai_job_id);
create index webhook_events_response_id_idx on public.webhook_events (response_id) where response_id is not null;
create index audit_logs_organization_created_idx on public.audit_logs (organization_id, created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_user_id) where actor_user_id is not null;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'organizations', 'locations', 'menus', 'menu_categories', 'menu_items',
    'item_variants', 'allergens', 'translations', 'themes', 'media_assets', 'qr_codes',
    'onboarding_cases', 'ai_jobs'
  ]
  loop
    execute format(
      'create trigger %I_set_updated_at before update on public.%I for each row execute function private.set_updated_at()',
      table_name, table_name
    );
  end loop;
end;
$$;

-- Authorization helpers are declared before policies. Their definitions are repeated below with
-- the trigger/RPC block so a schema dump remains readable; CREATE OR REPLACE preserves grants.
create or replace function private.is_operator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_staff staff
    where staff.user_id = (select auth.uid()) and staff.role = 'operator' and staff.active
  );
$$;

create or replace function private.is_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships member
    where member.organization_id = p_organization_id and member.user_id = (select auth.uid())
  );
$$;

create or replace function private.shares_organization_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships own_membership
    join public.memberships other_membership
      on other_membership.organization_id = own_membership.organization_id
    where own_membership.user_id = (select auth.uid())
      and other_membership.user_id = p_user_id
  );
$$;

create or replace function private.has_membership_role(
  p_organization_id uuid,
  p_roles public.membership_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships member
    where member.organization_id = p_organization_id
      and member.user_id = (select auth.uid())
      and member.role = any (p_roles)
  );
$$;

create or replace function private.can_view_organization(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select private.is_operator() or private.is_member(p_organization_id) $$;

create or replace function private.can_edit_organization(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.is_operator() or private.has_membership_role(
    p_organization_id, array['owner','editor']::public.membership_role[]
  )
$$;

create or replace function private.can_admin_organization(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.is_operator() or private.has_membership_role(
    p_organization_id, array['owner']::public.membership_role[]
  )
$$;

create or replace function private.publish_menu(p_menu_id uuid, p_organization_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$ begin raise exception 'Publication RPC is not initialized'; end; $$;
create or replace function private.restore_menu_publication(p_publication_id uuid, p_organization_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$ begin raise exception 'Restore RPC is not initialized'; end; $$;
create or replace function private.provision_organization(
  p_name text, p_slug text, p_location_name text, p_location_slug text, p_owner_user_id uuid
)
returns jsonb language plpgsql security definer set search_path = ''
as $$ begin raise exception 'Provisioning RPC is not initialized'; end; $$;

create or replace function public.publish_menu(p_menu_id uuid, p_organization_id uuid)
returns uuid language sql security invoker set search_path = ''
as $$ select private.publish_menu(p_menu_id, p_organization_id) $$;
create or replace function public.restore_menu_publication(p_publication_id uuid, p_organization_id uuid)
returns uuid language sql security invoker set search_path = ''
as $$ select private.restore_menu_publication(p_publication_id, p_organization_id) $$;
create or replace function public.provision_organization(
  p_name text, p_slug text, p_location_name text, p_location_slug text, p_owner_user_id uuid
)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.provision_organization(p_name, p_slug, p_location_name, p_location_slug, p_owner_user_id) $$;

-- Row-level security is enabled on every Data API table.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'platform_staff', 'organizations', 'memberships', 'locations', 'menus',
    'menu_categories', 'menu_items', 'item_variants', 'allergens', 'item_allergens',
    'translations', 'themes', 'media_assets', 'qr_codes', 'menu_publications',
    'onboarding_cases', 'ai_jobs', 'webhook_events', 'audit_logs'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end;
$$;

create policy profiles_select_self_or_operator on public.profiles
for select to authenticated
using (
  id = (select auth.uid())
  or (select private.is_operator())
  or (select private.shares_organization_with(id))
);
create policy profiles_update_self on public.profiles
for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy platform_staff_select on public.platform_staff
for select to authenticated
using (user_id = (select auth.uid()) or (select private.is_operator()));

create policy organizations_select on public.organizations
for select to authenticated
using ((select private.can_view_organization(id)));
create policy organizations_insert_operator on public.organizations
for insert to authenticated
with check ((select private.is_operator()));
create policy organizations_update_owner on public.organizations
for update to authenticated
using ((select private.can_admin_organization(id)))
with check ((select private.can_admin_organization(id)));
create policy organizations_delete_operator on public.organizations
for delete to authenticated
using ((select private.is_operator()));

create policy memberships_select on public.memberships
for select to authenticated
using ((select private.can_view_organization(organization_id)));
create policy memberships_insert_owner on public.memberships
for insert to authenticated
with check ((select private.can_admin_organization(organization_id)));
create policy memberships_update_owner on public.memberships
for update to authenticated
using ((select private.can_admin_organization(organization_id)))
with check ((select private.can_admin_organization(organization_id)));
create policy memberships_delete_owner on public.memberships
for delete to authenticated
using ((select private.can_admin_organization(organization_id)));

do $$
declare
  table_name text;
begin
  foreach table_name in array array['locations', 'themes', 'qr_codes']
  loop
    execute format(
      'create policy %I_select on public.%I for select to authenticated using ((select private.can_view_organization(organization_id)))',
      table_name, table_name
    );
    execute format(
      'create policy %I_insert on public.%I for insert to authenticated with check ((select private.can_admin_organization(organization_id)))',
      table_name, table_name
    );
    execute format(
      'create policy %I_update on public.%I for update to authenticated using ((select private.can_admin_organization(organization_id))) with check ((select private.can_admin_organization(organization_id)))',
      table_name, table_name
    );
    execute format(
      'create policy %I_delete on public.%I for delete to authenticated using ((select private.can_admin_organization(organization_id)))',
      table_name, table_name
    );
  end loop;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'menus', 'menu_categories', 'menu_items', 'item_variants', 'allergens',
    'item_allergens', 'translations'
  ]
  loop
    execute format(
      'create policy %I_select on public.%I for select to authenticated using ((select private.can_view_organization(organization_id)))',
      table_name, table_name
    );
    execute format(
      'create policy %I_insert on public.%I for insert to authenticated with check ((select private.can_edit_organization(organization_id)))',
      table_name, table_name
    );
    execute format(
      'create policy %I_update on public.%I for update to authenticated using ((select private.can_edit_organization(organization_id))) with check ((select private.can_edit_organization(organization_id)))',
      table_name, table_name
    );
    execute format(
      'create policy %I_delete on public.%I for delete to authenticated using ((select private.can_edit_organization(organization_id)))',
      table_name, table_name
    );
  end loop;
end;
$$;

create policy media_assets_select_members on public.media_assets
for select to authenticated
using ((select private.can_view_organization(organization_id)));
create policy media_assets_insert_members on public.media_assets
for insert to authenticated
with check (
  (select private.is_operator())
  or (
    (select private.can_edit_organization(organization_id))
    and bucket_id = 'intake' and approval_status = 'draft' and not is_public
  )
);
create policy media_assets_update_members on public.media_assets
for update to authenticated
using ((select private.can_view_organization(organization_id)))
with check (
  (select private.is_operator())
  or (
    (select private.can_edit_organization(organization_id))
    and bucket_id = 'intake' and approval_status = 'draft' and not is_public
  )
);
create policy media_assets_delete_members on public.media_assets
for delete to authenticated
using (
  (select private.is_operator())
  or (
    (select private.can_edit_organization(organization_id))
    and bucket_id = 'intake' and approval_status = 'draft' and not is_public
  )
);
create policy media_assets_public_metadata on public.media_assets
for select to anon
using (is_public and approval_status = 'approved' and bucket_id = 'public-media');

create policy menu_publications_select_members on public.menu_publications
for select to authenticated
using ((select private.can_view_organization(organization_id)));
create policy menu_publications_select_current on public.menu_publications
for select to anon
using (is_current);

create policy qr_codes_select_active on public.qr_codes
for select to anon
using (is_active);

do $$
declare
  table_name text;
begin
  foreach table_name in array array['onboarding_cases', 'ai_jobs']
  loop
    execute format(
      'create policy %I_select on public.%I for select to authenticated using ((select private.can_view_organization(organization_id)))',
      table_name, table_name
    );
    execute format(
      'create policy %I_insert_operator on public.%I for insert to authenticated with check ((select private.is_operator()))',
      table_name, table_name
    );
    execute format(
      'create policy %I_update_operator on public.%I for update to authenticated using ((select private.is_operator())) with check ((select private.is_operator()))',
      table_name, table_name
    );
    execute format(
      'create policy %I_delete_operator on public.%I for delete to authenticated using ((select private.is_operator()))',
      table_name, table_name
    );
  end loop;
end;
$$;

create policy webhook_events_operator_select on public.webhook_events
for select to authenticated using ((select private.is_operator()));
create policy webhook_events_operator_insert on public.webhook_events
for insert to authenticated with check ((select private.is_operator()));
create policy webhook_events_operator_update on public.webhook_events
for update to authenticated
using ((select private.is_operator())) with check ((select private.is_operator()));
create policy webhook_events_operator_delete on public.webhook_events
for delete to authenticated using ((select private.is_operator()));

create policy audit_logs_owner_select on public.audit_logs
for select to authenticated
using ((select private.is_operator()) or (select private.can_admin_organization(organization_id)));

-- Storage object paths are always `<organization UUID>/...`.
create or replace function private.storage_organization_id(p_object_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
declare
  first_segment text := split_part(p_object_name, '/', 1);
begin
  if first_segment ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return first_segment::uuid;
  end if;
  return null;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('intake', 'intake', false, 52428800, array[
    'application/pdf', 'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg', 'image/png', 'image/webp'
  ]::text[]),
  ('public-media', 'public-media', true, 15728640, array[
    'image/jpeg', 'image/png', 'image/webp', 'image/avif'
  ]::text[])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy intake_select_members on storage.objects
for select to authenticated
using (
  bucket_id = 'intake'
  and (select private.can_view_organization(private.storage_organization_id(name)))
);
create policy intake_insert_members on storage.objects
for insert to authenticated
with check (
  bucket_id = 'intake'
  and (select private.can_edit_organization(private.storage_organization_id(name)))
);
create policy intake_update_members on storage.objects
for update to authenticated
using (
  bucket_id = 'intake'
  and (select private.can_edit_organization(private.storage_organization_id(name)))
)
with check (
  bucket_id = 'intake'
  and (select private.can_edit_organization(private.storage_organization_id(name)))
);
create policy intake_delete_members on storage.objects
for delete to authenticated
using (
  bucket_id = 'intake'
  and (select private.can_edit_organization(private.storage_organization_id(name)))
);

create policy public_media_select_members on storage.objects
for select to authenticated
using (
  bucket_id = 'public-media'
  and (select private.can_view_organization(private.storage_organization_id(name)))
);
create policy public_media_insert_operator on storage.objects
for insert to authenticated
with check (bucket_id = 'public-media' and (select private.is_operator()));
create policy public_media_update_operator on storage.objects
for update to authenticated
using (bucket_id = 'public-media' and (select private.is_operator()))
with check (bucket_id = 'public-media' and (select private.is_operator()));
create policy public_media_delete_operator on storage.objects
for delete to authenticated
using (bucket_id = 'public-media' and (select private.is_operator()));

-- Explicit Data API privileges. RLS still applies to every granted operation.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;

grant select on public.menu_publications, public.qr_codes, public.media_assets to anon;

grant select, update on public.profiles to authenticated;
grant select on public.platform_staff to authenticated;
grant select, insert, update, delete on public.organizations, public.memberships to authenticated;
grant select, insert, update, delete on
  public.locations, public.menus, public.menu_categories, public.menu_items, public.item_variants,
  public.allergens, public.item_allergens, public.translations, public.themes, public.media_assets,
  public.qr_codes, public.onboarding_cases, public.ai_jobs, public.webhook_events
to authenticated;
revoke update on public.menus from authenticated;
grant update (name, currency, source_locale, active_locales, is_active) on public.menus to authenticated;
grant select on public.menu_publications, public.audit_logs to authenticated;

grant execute on function private.is_operator() to authenticated;
grant execute on function private.is_member(uuid) to authenticated;
grant execute on function private.shares_organization_with(uuid) to authenticated;
grant execute on function private.has_membership_role(uuid, public.membership_role[]) to authenticated;
grant execute on function private.can_view_organization(uuid) to authenticated;
grant execute on function private.can_edit_organization(uuid) to authenticated;
grant execute on function private.can_admin_organization(uuid) to authenticated;
grant execute on function private.storage_organization_id(text) to authenticated;
grant execute on function private.publish_menu(uuid, uuid) to authenticated;
grant execute on function private.restore_menu_publication(uuid, uuid) to authenticated;
grant execute on function private.provision_organization(text, text, text, text, uuid) to authenticated;
grant execute on function public.publish_menu(uuid, uuid) to authenticated;
grant execute on function public.restore_menu_publication(uuid, uuid) to authenticated;
grant execute on function public.provision_organization(text, text, text, text, uuid) to authenticated;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
grant execute on all functions in schema private to service_role;

create or replace function private.localized_text(
  p_organization_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_field_name text,
  p_source_text text,
  p_active_locales text[]
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('it', coalesce(p_source_text, '')) || coalesce(
    (
      select jsonb_object_agg(translation.locale, translation.translated_text order by translation.locale)
      from public.translations translation
      where translation.organization_id = p_organization_id
        and translation.entity_type = p_entity_type
        and translation.entity_id = p_entity_id
        and translation.field_name = p_field_name
        and translation.locale = any (p_active_locales)
        and translation.status = 'approved'
        and translation.translated_text is not null
    ),
    '{}'::jsonb
  );
$$;

create or replace function private.publish_menu(
  p_menu_id uuid,
  p_organization_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  menu_row public.menus%rowtype;
  location_row public.locations%rowtype;
  organization_row public.organizations%rowtype;
  publication_id uuid := gen_random_uuid();
  publication_version integer;
  published_time timestamptz := clock_timestamp();
  missing_translations integer;
  category_snapshot jsonb;
  theme_snapshot jsonb;
  full_snapshot jsonb;
begin
  select menu.* into menu_row
  from public.menus menu
  where menu.id = p_menu_id and menu.organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Menu not found' using errcode = 'P0002';
  end if;
  if not private.can_edit_organization(p_organization_id) then
    raise exception 'Not authorized to publish this menu' using errcode = '42501';
  end if;

  select location.* into strict location_row
  from public.locations location
  where location.id = menu_row.location_id
    and location.organization_id = p_organization_id;

  select organization.* into strict organization_row
  from public.organizations organization
  where organization.id = p_organization_id;

  with required_source as (
    select 'location'::text as entity_type, location_row.id as entity_id,
      required.field_name, required.source_text
    from (values
      ('tagline'::text, location_row.tagline_it),
      ('description'::text, location_row.description_it)
    ) required(field_name, source_text)
    union all
    select 'category', category.id, required.field_name, required.source_text
    from public.menu_categories category
    cross join lateral (values
      ('name'::text, category.name_it),
      ('description'::text, category.description_it)
    ) required(field_name, source_text)
    where category.organization_id = p_organization_id and category.menu_id = p_menu_id
    union all
    select 'item', item.id, required.field_name, required.source_text
    from public.menu_items item
    join public.menu_categories category
      on category.organization_id = item.organization_id and category.id = item.category_id
    cross join lateral (values
      ('name'::text, item.name_it),
      ('description'::text, item.description_it),
      ('ingredients'::text, item.ingredients_it)
    ) required(field_name, source_text)
    where item.organization_id = p_organization_id and category.menu_id = p_menu_id
    union all
    select 'variant', variant.id, 'name', variant.name_it
    from public.item_variants variant
    join public.menu_items item
      on item.organization_id = variant.organization_id and item.id = variant.item_id
    join public.menu_categories category
      on category.organization_id = item.organization_id and category.id = item.category_id
    where variant.organization_id = p_organization_id and category.menu_id = p_menu_id
  ), required_translation as (
    select source.entity_type, source.entity_id, source.field_name, source.source_text, locale.value as locale
    from required_source source
    cross join unnest(menu_row.active_locales) locale(value)
    where locale.value <> 'it'
      and nullif(btrim(coalesce(source.source_text, '')), '') is not null
  )
  select count(*) into missing_translations
  from required_translation required
  left join public.translations translation
    on translation.organization_id = p_organization_id
    and translation.entity_type = required.entity_type
    and translation.entity_id = required.entity_id
    and translation.field_name = required.field_name
    and translation.locale = required.locale
    and translation.status = 'approved'
    and translation.translated_text is not null
    and translation.source_hash = encode(extensions.digest(required.source_text, 'sha256'), 'hex')
  where translation.id is null;

  if missing_translations > 0 then
    raise exception 'Translations are missing, stale, or unapproved (%)', missing_translations
      using errcode = 'P0001';
  end if;

  select coalesce(max(publication.version), 0) + 1 into publication_version
  from public.menu_publications publication
  where publication.menu_id = p_menu_id;

  select jsonb_build_object(
    'key', theme.theme_key,
    'background', theme.background,
    'surface', theme.surface,
    'text', theme.text,
    'muted', theme.muted,
    'accent', theme.accent,
    'accentText', theme.accent_text,
    'headingFont', theme.heading_font,
    'bodyFont', theme.body_font,
    'radius', theme.radius
  ) into theme_snapshot
  from public.themes theme
  where theme.organization_id = p_organization_id
    and theme.location_id = location_row.id
    and theme.is_active
  order by theme.created_at desc
  limit 1;

  theme_snapshot := coalesce(theme_snapshot, jsonb_build_object(
    'key', 'editorial',
    'background', '#f4eee4',
    'surface', '#fffaf1',
    'text', '#24231f',
    'muted', '#6d685f',
    'accent', '#9d3d2e',
    'accentText', '#fffaf1',
    'headingFont', 'var(--font-serif)',
    'bodyFont', 'var(--font-sans)',
    'radius', '1.5rem'
  ));

  select coalesce(
    jsonb_agg(
      jsonb_strip_nulls(jsonb_build_object(
        'id', category.id,
        'slug', category.slug,
        'name', private.localized_text(
          p_organization_id, 'category', category.id, 'name', category.name_it, menu_row.active_locales
        ),
        'description', case
          when nullif(btrim(coalesce(category.description_it, '')), '') is null then null
          else private.localized_text(
            p_organization_id, 'category', category.id, 'description', category.description_it,
            menu_row.active_locales
          )
        end,
        'items', coalesce((
          select jsonb_agg(
            jsonb_strip_nulls(jsonb_build_object(
              'id', item.id,
              'name', private.localized_text(
                p_organization_id, 'item', item.id, 'name', item.name_it, menu_row.active_locales
              ),
              'description', case
                when nullif(btrim(coalesce(item.description_it, '')), '') is null then null
                else private.localized_text(
                  p_organization_id, 'item', item.id, 'description', item.description_it,
                  menu_row.active_locales
                )
              end,
              'ingredients', case
                when nullif(btrim(coalesce(item.ingredients_it, '')), '') is null then null
                else private.localized_text(
                  p_organization_id, 'item', item.id, 'ingredients', item.ingredients_it,
                  menu_row.active_locales
                )
              end,
              'price', item.price,
              'available', item.available,
              'vegetarian', item.vegetarian,
              'vegan', item.vegan,
              'gluten_free', item.gluten_free,
              'allergens', coalesce((
                select jsonb_agg(allergen.name_it order by allergen.name_it)
                from public.item_allergens relation
                join public.allergens allergen
                  on allergen.organization_id = relation.organization_id
                  and allergen.id = relation.allergen_id
                where relation.organization_id = p_organization_id and relation.item_id = item.id
              ), '[]'::jsonb),
              'image_url', item.image_url,
              'variants', coalesce((
                select jsonb_agg(jsonb_build_object(
                  'id', variant.id,
                  'name', private.localized_text(
                    p_organization_id, 'variant', variant.id, 'name', variant.name_it,
                    menu_row.active_locales
                  ),
                  'price_delta', variant.price_delta
                ) order by variant.sort_order, variant.id)
                from public.item_variants variant
                where variant.organization_id = p_organization_id
                  and variant.item_id = item.id
                  and variant.available
              ), '[]'::jsonb)
            )) order by item.sort_order, item.id
          )
          from public.menu_items item
          where item.organization_id = p_organization_id and item.category_id = category.id
        ), '[]'::jsonb)
      )) order by category.sort_order, category.id
    ),
    '[]'::jsonb
  ) into category_snapshot
  from public.menu_categories category
  where category.organization_id = p_organization_id and category.menu_id = p_menu_id;

  full_snapshot := jsonb_build_object(
    'schema_version', 1,
    'organization_id', p_organization_id,
    'location', jsonb_strip_nulls(jsonb_build_object(
      'id', location_row.id,
      'slug', location_row.slug,
      'name', location_row.name,
      'tagline', private.localized_text(
        p_organization_id, 'location', location_row.id, 'tagline', location_row.tagline_it,
        menu_row.active_locales
      ),
      'description', private.localized_text(
        p_organization_id, 'location', location_row.id, 'description', location_row.description_it,
        menu_row.active_locales
      ),
      'address', location_row.address,
      'city', location_row.city,
      'phone', location_row.phone,
      'email', location_row.email,
      'whatsapp_url', location_row.whatsapp_url,
      'reservation_url', location_row.reservation_url,
      'map_url', location_row.map_url,
      'instagram_url', location_row.instagram_url,
      'opening_hours', location_row.opening_hours,
      'logo_url', location_row.logo_url,
      'cover_url', location_row.cover_url
    )),
    'menu', jsonb_build_object(
      'id', menu_row.id,
      'name', menu_row.name,
      'currency', menu_row.currency,
      'source_locale', menu_row.source_locale,
      'active_locales', to_jsonb(menu_row.active_locales),
      'categories', category_snapshot
    ),
    'theme', theme_snapshot,
    'published_at', published_time,
    'version', publication_version
  );

  update public.menu_publications publication
  set is_current = false
  where publication.menu_id = p_menu_id and publication.is_current;

  insert into public.menu_publications (
    id, organization_id, location_id, menu_id, location_slug, version, snapshot,
    snapshot_hash, is_current, published_at, published_by
  ) values (
    publication_id, p_organization_id, location_row.id, p_menu_id, location_row.slug,
    publication_version, full_snapshot, repeat('0', 64), true, published_time, (select auth.uid())
  );

  update public.menus menu
  set current_publication_id = publication_id, updated_at = now()
  where menu.id = p_menu_id and menu.organization_id = p_organization_id;

  update public.qr_codes code
  set destination_path = '/r/' || location_row.slug ||
      case when code.locale is null or code.locale = 'it' then '' else '/' || code.locale end,
      updated_at = now()
  where code.organization_id = p_organization_id
    and code.location_id = location_row.id
    and code.menu_id = p_menu_id;

  update public.locations set status = 'active' where id = location_row.id;
  update public.organizations set status = 'active' where id = p_organization_id;
  return publication_id;
end;
$$;

create or replace function public.publish_menu(
  p_menu_id uuid,
  p_organization_id uuid
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.publish_menu(p_menu_id, p_organization_id);
$$;

create or replace function private.restore_menu_publication(
  p_publication_id uuid,
  p_organization_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_row public.menu_publications%rowtype;
  location_slug_value text;
  new_id uuid := gen_random_uuid();
  new_version integer;
  restored_time timestamptz := clock_timestamp();
  restored_snapshot jsonb;
begin
  select publication.* into source_row
  from public.menu_publications publication
  where publication.id = p_publication_id
    and publication.organization_id = p_organization_id;

  if not found then
    raise exception 'Publication not found' using errcode = 'P0002';
  end if;
  if not private.can_edit_organization(p_organization_id) then
    raise exception 'Not authorized to restore this publication' using errcode = '42501';
  end if;

  perform 1 from public.menus menu where menu.id = source_row.menu_id for update;
  select location.slug into strict location_slug_value
  from public.locations location where location.id = source_row.location_id;
  select coalesce(max(publication.version), 0) + 1 into new_version
  from public.menu_publications publication where publication.menu_id = source_row.menu_id;

  restored_snapshot := jsonb_set(
    jsonb_set(
      jsonb_set(source_row.snapshot, '{location,slug}', to_jsonb(location_slug_value), true),
      '{published_at}', to_jsonb(restored_time), true
    ),
    '{version}', to_jsonb(new_version), true
  );

  update public.menu_publications publication
  set is_current = false
  where publication.menu_id = source_row.menu_id and publication.is_current;

  insert into public.menu_publications (
    id, organization_id, location_id, menu_id, location_slug, version, snapshot,
    snapshot_hash, is_current, published_at, published_by, restored_from_id
  ) values (
    new_id, p_organization_id, source_row.location_id, source_row.menu_id, location_slug_value,
    new_version, restored_snapshot, repeat('0', 64), true, restored_time, (select auth.uid()), source_row.id
  );

  update public.menus menu
  set current_publication_id = new_id, updated_at = now()
  where menu.id = source_row.menu_id and menu.organization_id = p_organization_id;

  update public.qr_codes code
  set destination_path = '/r/' || location_slug_value ||
      case when code.locale is null or code.locale = 'it' then '' else '/' || code.locale end,
      updated_at = now()
  where code.organization_id = p_organization_id
    and code.location_id = source_row.location_id
    and code.menu_id = source_row.menu_id;
  return new_id;
end;
$$;

create or replace function public.restore_menu_publication(
  p_publication_id uuid,
  p_organization_id uuid
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.restore_menu_publication(p_publication_id, p_organization_id);
$$;

create or replace function private.provision_organization(
  p_name text,
  p_slug text,
  p_location_name text,
  p_location_slug text,
  p_owner_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization_id_value uuid := gen_random_uuid();
  location_id_value uuid := gen_random_uuid();
  menu_id_value uuid := gen_random_uuid();
  onboarding_case_id_value uuid := gen_random_uuid();
  qr_code_value text := upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 12));
begin
  if not private.is_operator() then
    raise exception 'Only a platform operator can provision organizations' using errcode = '42501';
  end if;
  if p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or p_location_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Invalid organization or location slug' using errcode = '23514';
  end if;
  if not exists (select 1 from auth.users user_account where user_account.id = p_owner_user_id) then
    raise exception 'Owner user does not exist' using errcode = '23503';
  end if;

  insert into public.organizations (id, name, slug, created_by)
  values (organization_id_value, btrim(p_name), p_slug, (select auth.uid()));
  insert into public.memberships (organization_id, user_id, role, created_by)
  values (organization_id_value, p_owner_user_id, 'owner', (select auth.uid()));
  insert into public.locations (
    id, organization_id, name, slug, status, created_by
  ) values (
    location_id_value, organization_id_value, btrim(p_location_name), p_location_slug, 'active',
    (select auth.uid())
  );
  insert into public.menus (
    id, organization_id, location_id, name, created_by
  ) values (
    menu_id_value, organization_id_value, location_id_value, 'Menu principale', (select auth.uid())
  );
  insert into public.themes (organization_id, location_id, created_by)
  values (organization_id_value, location_id_value, (select auth.uid()));
  insert into public.qr_codes (
    organization_id, location_id, menu_id, short_code, destination_path, created_by
  ) values (
    organization_id_value, location_id_value, menu_id_value, qr_code_value,
    '/r/' || p_location_slug, (select auth.uid())
  );
  insert into public.onboarding_cases (
    id, organization_id, location_id, assigned_to, created_by
  ) values (
    onboarding_case_id_value, organization_id_value, location_id_value, (select auth.uid()),
    (select auth.uid())
  );

  return jsonb_build_object(
    'organization_id', organization_id_value,
    'location_id', location_id_value,
    'menu_id', menu_id_value,
    'onboarding_case_id', onboarding_case_id_value,
    'qr_code', qr_code_value
  );
end;
$$;

create or replace function public.provision_organization(
  p_name text,
  p_slug text,
  p_location_name text,
  p_location_slug text,
  p_owner_user_id uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.provision_organization(
    p_name, p_slug, p_location_name, p_location_slug, p_owner_user_id
  );
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger auth_user_created_profile
after insert on auth.users
for each row execute function private.handle_new_user();

create or replace function private.is_operator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_staff staff
    where staff.user_id = (select auth.uid())
      and staff.role = 'operator'
      and staff.active
  );
$$;

create or replace function private.is_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships member
    where member.organization_id = p_organization_id
      and member.user_id = (select auth.uid())
  );
$$;

create or replace function private.has_membership_role(
  p_organization_id uuid,
  p_roles public.membership_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships member
    where member.organization_id = p_organization_id
      and member.user_id = (select auth.uid())
      and member.role = any (p_roles)
  );
$$;

create or replace function private.can_view_organization(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_operator() or private.is_member(p_organization_id);
$$;

create or replace function private.can_edit_organization(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_operator()
    or private.has_membership_role(
      p_organization_id,
      array['owner','editor']::public.membership_role[]
    );
$$;

create or replace function private.can_admin_organization(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_operator()
    or private.has_membership_role(
      p_organization_id,
      array['owner']::public.membership_role[]
    );
$$;

create or replace function private.prevent_last_owner_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'owner'
     and (
       tg_op = 'DELETE'
       or new.role <> 'owner'
       or new.organization_id is distinct from old.organization_id
     )
     and not private.is_operator()
     and not exists (
       select 1
       from public.memberships other_owner
       where other_owner.organization_id = old.organization_id
         and other_owner.role = 'owner'
         and other_owner.id <> old.id
     ) then
    raise exception 'An organization must retain at least one owner' using errcode = 'P0001';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger memberships_retain_owner_update
before update of role, organization_id on public.memberships
for each row execute function private.prevent_last_owner_removal();
create trigger memberships_retain_owner_delete
before delete on public.memberships
for each row execute function private.prevent_last_owner_removal();

create or replace function private.translation_source_value(
  p_organization_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_field_name text
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  source_value text;
begin
  case p_entity_type
    when 'location' then
      if p_field_name not in ('tagline', 'description') then
        raise exception 'Unsupported location translation field: %', p_field_name using errcode = '23514';
      end if;
      select case p_field_name
        when 'tagline' then location.tagline_it
        when 'description' then location.description_it
      end into source_value
      from public.locations location
      where location.organization_id = p_organization_id and location.id = p_entity_id;
    when 'category' then
      if p_field_name not in ('name', 'description') then
        raise exception 'Unsupported category translation field: %', p_field_name using errcode = '23514';
      end if;
      select case p_field_name
        when 'name' then category.name_it
        when 'description' then category.description_it
      end into source_value
      from public.menu_categories category
      where category.organization_id = p_organization_id and category.id = p_entity_id;
    when 'item' then
      if p_field_name not in ('name', 'description', 'ingredients') then
        raise exception 'Unsupported item translation field: %', p_field_name using errcode = '23514';
      end if;
      select case p_field_name
        when 'name' then item.name_it
        when 'description' then item.description_it
        when 'ingredients' then item.ingredients_it
      end into source_value
      from public.menu_items item
      where item.organization_id = p_organization_id and item.id = p_entity_id;
    when 'variant' then
      if p_field_name <> 'name' then
        raise exception 'Unsupported variant translation field: %', p_field_name using errcode = '23514';
      end if;
      select variant.name_it into source_value
      from public.item_variants variant
      where variant.organization_id = p_organization_id and variant.id = p_entity_id;
    else
      raise exception 'Unsupported translation entity: %', p_entity_type using errcode = '23514';
  end case;

  if not found then
    raise exception 'Translation target does not exist in organization' using errcode = '23503';
  end if;
  return coalesce(source_value, '');
end;
$$;

create or replace function private.validate_translation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_value text;
  current_hash text;
begin
  source_value := private.translation_source_value(
    new.organization_id, new.entity_type, new.entity_id, new.field_name
  );
  current_hash := encode(extensions.digest(source_value, 'sha256'), 'hex');

  if new.status = 'approved' and new.source_hash <> current_hash then
    raise exception 'Approved translation source hash is stale' using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE'
     and old.origin = 'manual'
     and new.origin = 'machine'
     and new.translated_text is distinct from old.translated_text then
    raise exception 'A machine translation cannot overwrite an approved manual translation'
      using errcode = 'P0001';
  end if;

  if new.status = 'approved' then
    new.approved_at := coalesce(new.approved_at, now());
    if (select auth.uid()) is not null then
      new.approved_by := (select auth.uid());
    end if;
  elsif new.status <> 'approved' then
    new.approved_at := null;
    new.approved_by := null;
  end if;
  return new;
end;
$$;

create trigger translations_validate_target
before insert or update on public.translations
for each row execute function private.validate_translation();

create or replace function private.mark_source_translations_stale()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  entity_type_value text;
  field_value text;
  old_json jsonb := to_jsonb(old);
  new_json jsonb := to_jsonb(new);
  source_column text;
  field_names text[];
  source_columns text[];
  field_index integer;
begin
  case tg_table_name
    when 'locations' then
      entity_type_value := 'location';
      field_names := array['tagline', 'description'];
      source_columns := array['tagline_it', 'description_it'];
    when 'menu_categories' then
      entity_type_value := 'category';
      field_names := array['name', 'description'];
      source_columns := array['name_it', 'description_it'];
    when 'menu_items' then
      entity_type_value := 'item';
      field_names := array['name', 'description', 'ingredients'];
      source_columns := array['name_it', 'description_it', 'ingredients_it'];
    when 'item_variants' then
      entity_type_value := 'variant';
      field_names := array['name'];
      source_columns := array['name_it'];
    else
      return new;
  end case;

  for field_index in 1..cardinality(field_names)
  loop
    source_column := source_columns[field_index];
    field_value := field_names[field_index];
    if old_json -> source_column is distinct from new_json -> source_column then
      update public.translations translation
      set status = 'stale', approved_at = null, approved_by = null, updated_at = now()
      where translation.organization_id = new.organization_id
        and translation.entity_type = entity_type_value
        and translation.entity_id = new.id
        and translation.field_name = field_value
        and translation.status <> 'stale';
    end if;
  end loop;
  return new;
end;
$$;

create trigger locations_stale_translations
after update of tagline_it, description_it on public.locations
for each row execute function private.mark_source_translations_stale();
create trigger categories_stale_translations
after update of name_it, description_it on public.menu_categories
for each row execute function private.mark_source_translations_stale();
create trigger items_stale_translations
after update of name_it, description_it, ingredients_it on public.menu_items
for each row execute function private.mark_source_translations_stale();
create trigger variants_stale_translations
after update of name_it on public.item_variants
for each row execute function private.mark_source_translations_stale();

create or replace function private.apply_theme_preset()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.theme_key is distinct from old.theme_key then
    if new.theme_key = 'minimal' then
      new.background := '#f4f6f3';
      new.surface := '#ffffff';
      new.text := '#16211b';
      new.muted := '#637067';
      new.accent_text := '#ffffff';
      new.heading_font := 'var(--font-sans)';
      new.body_font := 'var(--font-sans)';
      new.radius := '0.75rem';
      if tg_op = 'INSERT' then new.accent := '#1f6a4f'; end if;
    else
      new.background := '#f4eee4';
      new.surface := '#fffaf1';
      new.text := '#24231f';
      new.muted := '#6d685f';
      new.accent_text := '#fffaf1';
      new.heading_font := 'var(--font-serif)';
      new.body_font := 'var(--font-sans)';
      new.radius := '1.5rem';
      if tg_op = 'INSERT' then new.accent := '#9d3d2e'; end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger themes_apply_preset_insert
before insert on public.themes
for each row execute function private.apply_theme_preset();
create trigger themes_apply_preset_update
before update of theme_key on public.themes
for each row execute function private.apply_theme_preset();

create or replace function private.sync_ai_job_compatibility()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind is not null and new.job_type is not null and new.kind <> new.job_type then
    raise exception 'kind and job_type must identify the same AI workflow' using errcode = '23514';
  end if;
  new.kind := coalesce(new.kind, new.job_type);
  new.job_type := coalesce(new.job_type, new.kind);
  if new.kind is null then
    raise exception 'An AI job kind is required' using errcode = '23502';
  end if;
  if new.input_file_path is not null then
    new.input := coalesce(new.input, '{}'::jsonb) || jsonb_build_object('input_file_path', new.input_file_path);
  end if;
  return new;
end;
$$;

create trigger ai_jobs_sync_compatibility_insert
before insert on public.ai_jobs
for each row execute function private.sync_ai_job_compatibility();
create trigger ai_jobs_sync_compatibility_update
before update of kind, job_type, input_file_path on public.ai_jobs
for each row execute function private.sync_ai_job_compatibility();

create or replace function private.protect_publication()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Menu publications are append-only' using errcode = 'P0001';
  end if;
  if (to_jsonb(new) - 'is_current') is distinct from (to_jsonb(old) - 'is_current') then
    raise exception 'Published snapshot content is immutable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger menu_publications_immutable
before update or delete on public.menu_publications
for each row execute function private.protect_publication();

create or replace function private.validate_publication_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.snapshot ->> 'schema_version' is distinct from '1'
     or new.snapshot ->> 'organization_id' is distinct from new.organization_id::text
     or new.snapshot #>> '{location,id}' is distinct from new.location_id::text
     or new.snapshot #>> '{location,slug}' is distinct from new.location_slug
     or new.snapshot #>> '{menu,id}' is distinct from new.menu_id::text
     or new.snapshot ->> 'version' is distinct from new.version::text then
    raise exception 'Publication snapshot metadata does not match its row' using errcode = '23514';
  end if;
  new.snapshot_hash := encode(extensions.digest(new.snapshot::text, 'sha256'), 'hex');
  return new;
end;
$$;

create trigger menu_publications_validate_snapshot
before insert on public.menu_publications
for each row execute function private.validate_publication_snapshot();

create or replace function private.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_before jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  row_after jsonb := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  organization_value uuid;
  entity_value text;
  changed text[];
begin
  organization_value := coalesce(
    nullif(row_after ->> 'organization_id', '')::uuid,
    nullif(row_before ->> 'organization_id', '')::uuid
  );
  entity_value := coalesce(row_after ->> 'id', row_before ->> 'id', 'unknown');

  select coalesce(array_agg(keys.key order by keys.key), '{}'::text[])
  into changed
  from (
    select field.key
    from jsonb_object_keys(row_before || row_after) as field(key)
    where row_before -> field.key is distinct from row_after -> field.key
      and field.key not in ('updated_at', 'created_at')
  ) keys;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, changed_fields
  ) values (
    organization_value, (select auth.uid()), lower(tg_op), tg_table_name, entity_value, changed
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'memberships', 'locations', 'menus', 'menu_categories', 'menu_items', 'item_variants',
    'allergens', 'item_allergens', 'translations', 'themes', 'media_assets', 'qr_codes',
    'menu_publications', 'onboarding_cases', 'ai_jobs'
  ]
  loop
    execute format(
      'create trigger %I_audit after insert or update or delete on public.%I for each row execute function private.write_audit_log()',
      table_name, table_name
    );
  end loop;
end;
$$;

-- Functions created after the initial grant block must not inherit PostgreSQL's default PUBLIC
-- execute privilege. Only the reviewed RPC entrypoints and policy helpers are callable by clients.
revoke all on all functions in schema private from public, anon, authenticated;
revoke all on function public.publish_menu(uuid, uuid) from public, anon;
revoke all on function public.restore_menu_publication(uuid, uuid) from public, anon;
revoke all on function public.provision_organization(text, text, text, text, uuid) from public, anon;

grant execute on function private.is_operator() to authenticated;
grant execute on function private.is_member(uuid) to authenticated;
grant execute on function private.shares_organization_with(uuid) to authenticated;
grant execute on function private.has_membership_role(uuid, public.membership_role[]) to authenticated;
grant execute on function private.can_view_organization(uuid) to authenticated;
grant execute on function private.can_edit_organization(uuid) to authenticated;
grant execute on function private.can_admin_organization(uuid) to authenticated;
grant execute on function private.storage_organization_id(text) to authenticated;
grant execute on function private.publish_menu(uuid, uuid) to authenticated;
grant execute on function private.restore_menu_publication(uuid, uuid) to authenticated;
grant execute on function private.provision_organization(text, text, text, text, uuid) to authenticated;
grant execute on function public.publish_menu(uuid, uuid) to authenticated;
grant execute on function public.restore_menu_publication(uuid, uuid) to authenticated;
grant execute on function public.provision_organization(text, text, text, text, uuid) to authenticated;

grant execute on all functions in schema public to service_role;
grant execute on all functions in schema private to service_role;
