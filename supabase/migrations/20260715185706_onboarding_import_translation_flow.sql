-- Complete the operator -> import review -> restaurant publication workflow.
-- External Auth/OpenAI calls intentionally stay outside database transactions; all draft writes
-- caused by an approved staging record happen in one short transaction.

create table public.variant_allergens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  variant_id uuid not null,
  allergen_id uuid not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (variant_id, allergen_id),
  foreign key (organization_id, variant_id)
    references public.item_variants (organization_id, id) on delete cascade,
  foreign key (organization_id, allergen_id)
    references public.allergens (organization_id, id) on delete cascade
);

create index variant_allergens_organization_variant_idx
  on public.variant_allergens (organization_id, variant_id);
create index variant_allergens_organization_allergen_idx
  on public.variant_allergens (organization_id, allergen_id);

create table public.menu_import_staging (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  onboarding_case_id uuid not null,
  menu_id uuid not null,
  ai_job_id uuid not null,
  source_bucket text not null check (source_bucket = 'intake'),
  source_path text not null,
  source_filename text not null,
  source_mime_type text not null,
  parser text not null check (parser in ('csv', 'xlsx', 'openai')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  status text not null default 'review' check (status in ('review', 'approved')),
  revision integer not null default 1 check (revision > 0),
  approval_summary jsonb,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (ai_job_id),
  unique (source_bucket, source_path),
  foreign key (organization_id, onboarding_case_id)
    references public.onboarding_cases (organization_id, id) on delete cascade,
  foreign key (organization_id, menu_id)
    references public.menus (organization_id, id) on delete cascade,
  foreign key (organization_id, ai_job_id)
    references public.ai_jobs (organization_id, id) on delete cascade,
  check (
    (status = 'review' and approved_by is null and approved_at is null)
    or (status = 'approved' and approved_at is not null)
  )
);

create index menu_import_staging_organization_case_idx
  on public.menu_import_staging (organization_id, onboarding_case_id, created_at desc);
create index menu_import_staging_review_queue_idx
  on public.menu_import_staging (status, created_at desc) where status = 'review';
create index menu_import_staging_approved_by_idx
  on public.menu_import_staging (approved_by) where approved_by is not null;

-- A storage object represents exactly one menu import job.
create unique index ai_jobs_menu_import_source_idx
  on public.ai_jobs (onboarding_case_id, input_file_path)
  where kind = 'menu_import' and input_file_path is not null;

alter table public.variant_allergens enable row level security;
alter table public.menu_import_staging enable row level security;

create policy variant_allergens_select on public.variant_allergens
for select to authenticated
using ((select private.can_view_organization(organization_id)));
create policy variant_allergens_insert on public.variant_allergens
for insert to authenticated
with check ((select private.can_edit_organization(organization_id)));
create policy variant_allergens_update on public.variant_allergens
for update to authenticated
using ((select private.can_edit_organization(organization_id)))
with check ((select private.can_edit_organization(organization_id)));
create policy variant_allergens_delete on public.variant_allergens
for delete to authenticated
using ((select private.can_edit_organization(organization_id)));

create policy menu_import_staging_select_operator on public.menu_import_staging
for select to authenticated
using ((select private.is_operator()));
create policy menu_import_staging_update_operator on public.menu_import_staging
for update to authenticated
using ((select private.is_operator()))
with check ((select private.is_operator()));

grant select, insert, update, delete on public.variant_allergens to authenticated;
grant select on public.menu_import_staging to authenticated;
grant update (payload) on public.menu_import_staging to authenticated;
grant all on public.variant_allergens, public.menu_import_staging to service_role;

-- Once a human has taken ownership of a translation, a machine process cannot
-- downgrade it to machine origin, even if it attempts a two-step overwrite.
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
     and new.origin = 'machine' then
    raise exception 'A machine translation cannot overwrite a manual translation'
      using errcode = 'P0001';
  end if;

  if new.status = 'approved' then
    new.approved_at := coalesce(new.approved_at, now());
    if (select auth.uid()) is not null then
      new.approved_by := (select auth.uid());
    end if;
  else
    new.approved_at := null;
    new.approved_by := null;
  end if;
  return new;
end;
$$;

create trigger menu_import_staging_set_updated_at
before update on public.menu_import_staging
for each row execute function private.set_updated_at();

create trigger variant_allergens_audit
after insert or update or delete on public.variant_allergens
for each row execute function private.write_audit_log();
create trigger menu_import_staging_audit
after insert or update or delete on public.menu_import_staging
for each row execute function private.write_audit_log();

create or replace function private.increment_staging_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.payload is distinct from old.payload then
    if old.status <> 'review' then
      raise exception 'Approved staging cannot be edited' using errcode = 'P0001';
    end if;
    new.revision := old.revision + 1;
  end if;
  return new;
end;
$$;

create trigger menu_import_staging_revision
before update of payload on public.menu_import_staging
for each row execute function private.increment_staging_revision();

create or replace function private.slugify(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(
      trim(both '-' from regexp_replace(lower(btrim(coalesce(p_value, ''))), '[^a-z0-9]+', '-', 'g')),
      ''
    ),
    'sezione'
  );
$$;

create or replace function private.sync_translation_entity(
  p_organization_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_field_name text,
  p_source_text text,
  p_active_locales text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_hash text;
begin
  if nullif(btrim(coalesce(p_source_text, '')), '') is null then
    delete from public.translations translation
    where translation.organization_id = p_organization_id
      and translation.entity_type = p_entity_type
      and translation.entity_id = p_entity_id
      and translation.field_name = p_field_name;
    return;
  end if;

  current_hash := encode(extensions.digest(p_source_text, 'sha256'), 'hex');

  insert into public.translations (
    organization_id, entity_type, entity_id, locale, field_name, source_hash,
    translated_text, status, origin
  )
  select
    p_organization_id, p_entity_type, p_entity_id, locale.value, p_field_name,
    current_hash, null, 'missing', 'machine'
  from unnest(coalesce(p_active_locales, array['it']::text[])) locale(value)
  where locale.value <> 'it'
  on conflict (organization_id, entity_type, entity_id, locale, field_name)
  do update set
    source_hash = excluded.source_hash,
    status = case
      when public.translations.source_hash = excluded.source_hash then public.translations.status
      when nullif(btrim(coalesce(public.translations.translated_text, '')), '') is null then 'missing'::public.translation_status
      else 'stale'::public.translation_status
    end,
    approved_by = case
      when public.translations.source_hash = excluded.source_hash then public.translations.approved_by
      else null
    end,
    approved_at = case
      when public.translations.source_hash = excluded.source_hash then public.translations.approved_at
      else null
    end,
    updated_at = case
      when public.translations.source_hash = excluded.source_hash then public.translations.updated_at
      else now()
    end
  where public.translations.source_hash is distinct from excluded.source_hash;

  delete from public.translations translation
  where translation.organization_id = p_organization_id
    and translation.entity_type = p_entity_type
    and translation.entity_id = p_entity_id
    and translation.field_name = p_field_name
    and not (translation.locale = any (coalesce(p_active_locales, array['it']::text[])));
end;
$$;

create or replace function private.sync_source_translations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  entity_type_value text;
  locales_value text[];
begin
  case tg_table_name
    when 'locations' then
      entity_type_value := 'location';
      select coalesce(array_agg(distinct locale.value), array['it']::text[])
      into locales_value
      from public.menus menu
      cross join lateral unnest(menu.active_locales) locale(value)
      where menu.organization_id = new.organization_id and menu.location_id = new.id;
      perform private.sync_translation_entity(new.organization_id, entity_type_value, new.id, 'tagline', new.tagline_it, locales_value);
      perform private.sync_translation_entity(new.organization_id, entity_type_value, new.id, 'description', new.description_it, locales_value);
    when 'menu_categories' then
      entity_type_value := 'category';
      select menu.active_locales into locales_value
      from public.menus menu
      where menu.organization_id = new.organization_id and menu.id = new.menu_id;
      perform private.sync_translation_entity(new.organization_id, entity_type_value, new.id, 'name', new.name_it, locales_value);
      perform private.sync_translation_entity(new.organization_id, entity_type_value, new.id, 'description', new.description_it, locales_value);
    when 'menu_items' then
      entity_type_value := 'item';
      select menu.active_locales into locales_value
      from public.menu_categories category
      join public.menus menu
        on menu.organization_id = category.organization_id and menu.id = category.menu_id
      where category.organization_id = new.organization_id and category.id = new.category_id;
      perform private.sync_translation_entity(new.organization_id, entity_type_value, new.id, 'name', new.name_it, locales_value);
      perform private.sync_translation_entity(new.organization_id, entity_type_value, new.id, 'description', new.description_it, locales_value);
      perform private.sync_translation_entity(new.organization_id, entity_type_value, new.id, 'ingredients', new.ingredients_it, locales_value);
    when 'item_variants' then
      entity_type_value := 'variant';
      select menu.active_locales into locales_value
      from public.menu_items item
      join public.menu_categories category
        on category.organization_id = item.organization_id and category.id = item.category_id
      join public.menus menu
        on menu.organization_id = category.organization_id and menu.id = category.menu_id
      where item.organization_id = new.organization_id and item.id = new.item_id;
      perform private.sync_translation_entity(new.organization_id, entity_type_value, new.id, 'name', new.name_it, locales_value);
    else
      raise exception 'Unsupported translation source table: %', tg_table_name;
  end case;
  return new;
end;
$$;

drop trigger if exists locations_stale_translations on public.locations;
drop trigger if exists categories_stale_translations on public.menu_categories;
drop trigger if exists items_stale_translations on public.menu_items;
drop trigger if exists variants_stale_translations on public.item_variants;

create trigger locations_sync_translations
after insert or update of tagline_it, description_it on public.locations
for each row execute function private.sync_source_translations();
create trigger categories_sync_translations
after insert or update of name_it, description_it on public.menu_categories
for each row execute function private.sync_source_translations();
create trigger items_sync_translations
after insert or update of name_it, description_it, ingredients_it on public.menu_items
for each row execute function private.sync_source_translations();
create trigger variants_sync_translations
after insert or update of name_it on public.item_variants
for each row execute function private.sync_source_translations();

create or replace function private.delete_entity_translations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  entity_type_value text;
begin
  entity_type_value := case tg_table_name
    when 'locations' then 'location'
    when 'menu_categories' then 'category'
    when 'menu_items' then 'item'
    when 'item_variants' then 'variant'
  end;
  delete from public.translations translation
  where translation.organization_id = old.organization_id
    and translation.entity_type = entity_type_value
    and translation.entity_id = old.id;
  return old;
end;
$$;

create trigger locations_delete_translations
after delete on public.locations
for each row execute function private.delete_entity_translations();
create trigger categories_delete_translations
after delete on public.menu_categories
for each row execute function private.delete_entity_translations();
create trigger items_delete_translations
after delete on public.menu_items
for each row execute function private.delete_entity_translations();
create trigger variants_delete_translations
after delete on public.item_variants
for each row execute function private.delete_entity_translations();

create or replace function private.sync_menu_translations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_value record;
  location_locales text[];
begin
  for row_value in
    select location.* from public.locations location
    where location.organization_id = new.organization_id and location.id = new.location_id
  loop
    select coalesce(array_agg(distinct locale.value), array['it']::text[])
    into location_locales
    from public.menus menu
    cross join lateral unnest(menu.active_locales) locale(value)
    where menu.organization_id = row_value.organization_id and menu.location_id = row_value.id;
    perform private.sync_translation_entity(row_value.organization_id, 'location', row_value.id, 'tagline', row_value.tagline_it, location_locales);
    perform private.sync_translation_entity(row_value.organization_id, 'location', row_value.id, 'description', row_value.description_it, location_locales);
  end loop;

  for row_value in
    select category.* from public.menu_categories category
    where category.organization_id = new.organization_id and category.menu_id = new.id
  loop
    perform private.sync_translation_entity(new.organization_id, 'category', row_value.id, 'name', row_value.name_it, new.active_locales);
    perform private.sync_translation_entity(new.organization_id, 'category', row_value.id, 'description', row_value.description_it, new.active_locales);
  end loop;

  for row_value in
    select item.*
    from public.menu_items item
    join public.menu_categories category
      on category.organization_id = item.organization_id and category.id = item.category_id
    where item.organization_id = new.organization_id and category.menu_id = new.id
  loop
    perform private.sync_translation_entity(new.organization_id, 'item', row_value.id, 'name', row_value.name_it, new.active_locales);
    perform private.sync_translation_entity(new.organization_id, 'item', row_value.id, 'description', row_value.description_it, new.active_locales);
    perform private.sync_translation_entity(new.organization_id, 'item', row_value.id, 'ingredients', row_value.ingredients_it, new.active_locales);
  end loop;

  for row_value in
    select variant.*
    from public.item_variants variant
    join public.menu_items item
      on item.organization_id = variant.organization_id and item.id = variant.item_id
    join public.menu_categories category
      on category.organization_id = item.organization_id and category.id = item.category_id
    where variant.organization_id = new.organization_id and category.menu_id = new.id
  loop
    perform private.sync_translation_entity(new.organization_id, 'variant', row_value.id, 'name', row_value.name_it, new.active_locales);
  end loop;
  return new;
end;
$$;

create or replace function private.sync_source_translations_for_location(p_location_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  location_row public.locations%rowtype;
  locales_value text[];
begin
  select location.* into location_row from public.locations location where location.id = p_location_id;
  if not found then return; end if;
  select coalesce(array_agg(distinct locale.value), array['it']::text[])
  into locales_value
  from public.menus menu
  cross join lateral unnest(menu.active_locales) locale(value)
  where menu.organization_id = location_row.organization_id and menu.location_id = location_row.id;
  perform private.sync_translation_entity(location_row.organization_id, 'location', location_row.id, 'tagline', location_row.tagline_it, locales_value);
  perform private.sync_translation_entity(location_row.organization_id, 'location', location_row.id, 'description', location_row.description_it, locales_value);
end;
$$;

-- The helper above is referenced by the trigger function; recreate it after both helpers exist so
-- PostgreSQL validates every call target at execution time without exposing either helper.
create trigger menus_sync_translations
after insert or update of active_locales on public.menus
for each row execute function private.sync_menu_translations();

do $$
declare
  row_value record;
begin
  for row_value in select id from public.locations loop
    perform private.sync_source_translations_for_location(row_value.id);
  end loop;
  for row_value in
    select category.*, menu.active_locales
    from public.menu_categories category
    join public.menus menu
      on menu.organization_id = category.organization_id and menu.id = category.menu_id
  loop
    perform private.sync_translation_entity(row_value.organization_id, 'category', row_value.id, 'name', row_value.name_it, row_value.active_locales);
    perform private.sync_translation_entity(row_value.organization_id, 'category', row_value.id, 'description', row_value.description_it, row_value.active_locales);
  end loop;
  for row_value in
    select item.*, menu.active_locales
    from public.menu_items item
    join public.menu_categories category
      on category.organization_id = item.organization_id and category.id = item.category_id
    join public.menus menu
      on menu.organization_id = category.organization_id and menu.id = category.menu_id
  loop
    perform private.sync_translation_entity(row_value.organization_id, 'item', row_value.id, 'name', row_value.name_it, row_value.active_locales);
    perform private.sync_translation_entity(row_value.organization_id, 'item', row_value.id, 'description', row_value.description_it, row_value.active_locales);
    perform private.sync_translation_entity(row_value.organization_id, 'item', row_value.id, 'ingredients', row_value.ingredients_it, row_value.active_locales);
  end loop;
  for row_value in
    select variant.*, menu.active_locales
    from public.item_variants variant
    join public.menu_items item
      on item.organization_id = variant.organization_id and item.id = variant.item_id
    join public.menu_categories category
      on category.organization_id = item.organization_id and category.id = item.category_id
    join public.menus menu
      on menu.organization_id = category.organization_id and menu.id = category.menu_id
  loop
    perform private.sync_translation_entity(row_value.organization_id, 'variant', row_value.id, 'name', row_value.name_it, row_value.active_locales);
  end loop;
end;
$$;

alter table public.menu_items add column source_id text;
create unique index menu_items_source_id_idx
  on public.menu_items (organization_id, category_id, source_id)
  where source_id is not null;

create or replace function private.provision_organization(
  p_name text,
  p_slug text,
  p_location_name text,
  p_location_slug text,
  p_owner_user_id uuid,
  p_contact_name text,
  p_contact_email text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization_id_value uuid;
  location_id_value uuid;
  menu_id_value uuid;
  onboarding_case_id_value uuid;
  qr_code_value text;
  created_value boolean := true;
  qr_attempt integer;
begin
  if not private.is_operator() then
    raise exception 'Only a platform operator can provision organizations' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 2 and 160
     or char_length(btrim(coalesce(p_location_name, ''))) not between 2 and 160 then
    raise exception 'Organization and location names are invalid' using errcode = '23514';
  end if;
  if p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or p_location_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Invalid organization or location slug' using errcode = '23514';
  end if;
  if not exists (
    select 1 from auth.users user_account
    where user_account.id = p_owner_user_id
      and lower(user_account.email) = lower(btrim(p_contact_email))
  ) then
    raise exception 'Owner user does not match the requested email' using errcode = '23503';
  end if;

  select organization.id into organization_id_value
  from public.organizations organization
  where organization.slug = p_slug
  for update;

  if found then
    created_value := false;
    if not exists (
      select 1 from public.memberships membership
      where membership.organization_id = organization_id_value
        and membership.user_id = p_owner_user_id
        and membership.role = 'owner'
    ) then
      raise exception 'Slug already belongs to another provisioning request' using errcode = '23505';
    end if;

    select location.id into location_id_value
    from public.locations location
    where location.organization_id = organization_id_value and location.slug = p_location_slug;
    select menu.id into menu_id_value
    from public.menus menu
    where menu.organization_id = organization_id_value and menu.location_id = location_id_value
    order by menu.created_at
    limit 1;
    select onboarding.id into onboarding_case_id_value
    from public.onboarding_cases onboarding
    where onboarding.organization_id = organization_id_value and onboarding.location_id = location_id_value
    order by onboarding.created_at
    limit 1;
    select code.short_code into qr_code_value
    from public.qr_codes code
    where code.organization_id = organization_id_value
      and code.location_id = location_id_value
      and code.menu_id = menu_id_value
    order by code.created_at
    limit 1;

    if location_id_value is null or menu_id_value is null
       or onboarding_case_id_value is null or qr_code_value is null then
      raise exception 'Existing provisioning is incomplete and requires operator review' using errcode = 'P0001';
    end if;

    update public.onboarding_cases onboarding
    set contact_name = nullif(btrim(p_contact_name), ''),
        contact_email = lower(btrim(p_contact_email))
    where onboarding.id = onboarding_case_id_value
      and onboarding.organization_id = organization_id_value;
  else
    organization_id_value := gen_random_uuid();
    location_id_value := gen_random_uuid();
    menu_id_value := gen_random_uuid();
    onboarding_case_id_value := gen_random_uuid();

    insert into public.organizations (id, name, slug, created_by)
    values (organization_id_value, btrim(p_name), p_slug, (select auth.uid()));
    insert into public.memberships (organization_id, user_id, role, created_by)
    values (organization_id_value, p_owner_user_id, 'owner', (select auth.uid()));
    insert into public.locations (
      id, organization_id, name, slug, status, email, created_by
    ) values (
      location_id_value, organization_id_value, btrim(p_location_name), p_location_slug,
      'active', lower(btrim(p_contact_email)), (select auth.uid())
    );
    insert into public.menus (
      id, organization_id, location_id, name, created_by
    ) values (
      menu_id_value, organization_id_value, location_id_value, 'Menu principale', (select auth.uid())
    );
    insert into public.themes (organization_id, location_id, created_by)
    values (organization_id_value, location_id_value, (select auth.uid()));

    for qr_attempt in 1..5 loop
      qr_code_value := upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 12));
      begin
        insert into public.qr_codes (
          organization_id, location_id, menu_id, short_code, destination_path, created_by
        ) values (
          organization_id_value, location_id_value, menu_id_value, qr_code_value,
          '/r/' || p_location_slug, (select auth.uid())
        );
        exit;
      exception when unique_violation then
        qr_code_value := null;
      end;
    end loop;
    if qr_code_value is null then
      raise exception 'Unable to allocate a unique QR code' using errcode = '23505';
    end if;

    insert into public.onboarding_cases (
      id, organization_id, location_id, assigned_to, contact_name, contact_email, created_by
    ) values (
      onboarding_case_id_value, organization_id_value, location_id_value, (select auth.uid()),
      nullif(btrim(p_contact_name), ''), lower(btrim(p_contact_email)), (select auth.uid())
    );
  end if;

  return jsonb_build_object(
    'organization_id', organization_id_value,
    'location_id', location_id_value,
    'menu_id', menu_id_value,
    'onboarding_case_id', onboarding_case_id_value,
    'qr_code', qr_code_value,
    'created', created_value
  );
end;
$$;

create or replace function public.provision_organization(
  p_name text,
  p_slug text,
  p_location_name text,
  p_location_slug text,
  p_owner_user_id uuid,
  p_contact_name text,
  p_contact_email text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.provision_organization(
    p_name, p_slug, p_location_name, p_location_slug, p_owner_user_id,
    p_contact_name, p_contact_email
  );
$$;

create or replace function public.record_menu_import_staging(
  p_job_id uuid,
  p_payload jsonb,
  p_parser text,
  p_usage jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.ai_jobs%rowtype;
  staging_id_value uuid;
  existing_status text;
begin
  if p_parser not in ('csv', 'xlsx', 'openai') then
    raise exception 'Unsupported import parser' using errcode = '23514';
  end if;
  if jsonb_typeof(p_payload) <> 'object'
     or jsonb_typeof(p_payload -> 'categories') <> 'array' then
    raise exception 'Invalid menu staging payload' using errcode = '23514';
  end if;

  select job.* into job_row
  from public.ai_jobs job
  where job.id = p_job_id and job.kind = 'menu_import'
  for update;
  if not found then
    raise exception 'Menu import job not found' using errcode = 'P0002';
  end if;
  if job_row.onboarding_case_id is null or job_row.menu_id is null
     or job_row.input_file_path is null then
    raise exception 'Menu import job is missing tenant or source relationships' using errcode = '23514';
  end if;

  select staging.status into existing_status
  from public.menu_import_staging staging
  where staging.ai_job_id = job_row.id;
  if existing_status = 'approved' then
    raise exception 'Approved staging cannot be replaced' using errcode = 'P0001';
  end if;

  insert into public.menu_import_staging (
    organization_id, onboarding_case_id, menu_id, ai_job_id,
    source_bucket, source_path, source_filename, source_mime_type,
    parser, payload, status, created_by
  ) values (
    job_row.organization_id, job_row.onboarding_case_id, job_row.menu_id, job_row.id,
    coalesce(job_row.input ->> 'storage_bucket', 'intake'),
    job_row.input_file_path,
    coalesce(job_row.input ->> 'filename', 'menu'),
    coalesce(job_row.input ->> 'mime_type', 'application/octet-stream'),
    p_parser, p_payload, 'review', job_row.created_by
  )
  on conflict (ai_job_id) do update
  set payload = excluded.payload,
      parser = excluded.parser,
      status = 'review',
      approved_by = null,
      approved_at = null,
      approval_summary = null
  returning id into staging_id_value;

  update public.ai_jobs job
  set status = 'review', output = p_payload, usage = p_usage, error = null,
      completed_at = now(), updated_at = now()
  where job.id = job_row.id;
  update public.onboarding_cases onboarding
  set status = 'review', source_file_path = job_row.input_file_path, updated_at = now()
  where onboarding.organization_id = job_row.organization_id
    and onboarding.id = job_row.onboarding_case_id;
  return staging_id_value;
end;
$$;

create or replace function private.upsert_staged_allergen(
  p_organization_id uuid,
  p_allergen jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  allergen_id_value uuid;
  code_value text;
  name_value text;
begin
  code_value := trim(both '_' from regexp_replace(lower(coalesce(p_allergen ->> 'code', '')), '[^a-z0-9]+', '_', 'g'));
  name_value := nullif(btrim(p_allergen ->> 'name'), '');
  if code_value = '' or name_value is null then
    raise exception 'Invalid staged allergen' using errcode = '23514';
  end if;
  insert into public.allergens (organization_id, code, name_it)
  values (p_organization_id, code_value, name_value)
  on conflict (organization_id, code) do update set name_it = excluded.name_it
  returning id into allergen_id_value;
  return allergen_id_value;
end;
$$;

create or replace function private.approve_menu_import(
  p_staging_id uuid,
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  staging_row public.menu_import_staging%rowtype;
  category_value jsonb;
  item_value jsonb;
  variant_value jsonb;
  allergen_value jsonb;
  category_position bigint;
  item_position bigint;
  variant_position bigint;
  category_id_value uuid;
  item_id_value uuid;
  variant_id_value uuid;
  allergen_id_value uuid;
  category_slug_value text;
  category_slug_base text;
  category_slug_suffix integer;
  category_count integer := 0;
  item_count integer := 0;
  variant_count integer := 0;
  summary_value jsonb;
begin
  if not private.is_operator() then
    raise exception 'Only a platform operator can approve menu imports' using errcode = '42501';
  end if;
  select staging.* into staging_row
  from public.menu_import_staging staging
  where staging.id = p_staging_id and staging.organization_id = p_organization_id
  for update;
  if not found then
    raise exception 'Menu staging not found in organization' using errcode = 'P0002';
  end if;
  if staging_row.status = 'approved' then
    return staging_row.approval_summary;
  end if;
  if jsonb_array_length(staging_row.payload -> 'categories') = 0 then
    raise exception 'The staging menu has no categories' using errcode = 'P0001';
  end if;
  if jsonb_path_exists(staging_row.payload, '$.**.issues[*] ? (@.severity == "error")') then
    raise exception 'Resolve all blocking staging issues before approval' using errcode = 'P0001';
  end if;
  if jsonb_path_exists(staging_row.payload, '$.categories[*].items[*] ? (@.price == null)') then
    raise exception 'Every menu item needs a reviewed price before approval' using errcode = 'P0001';
  end if;
  if jsonb_path_exists(staging_row.payload, '$.categories[*].items[*].variants[*] ? (@.price_delta == null)') then
    raise exception 'Every variant needs a reviewed price delta before approval' using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(staging_row.payload -> 'categories') with ordinality
      as category_entry(value, position)
    cross join lateral jsonb_array_elements(category_entry.value -> 'items')
      as item_entry(value)
    where nullif(btrim(item_entry.value ->> 'source_id'), '') is not null
    group by category_entry.position, lower(btrim(item_entry.value ->> 'source_id'))
    having count(*) > 1
  ) then
    raise exception 'Duplicate source IDs must be resolved before approval' using errcode = 'P0001';
  end if;

  update public.menus menu
  set name = btrim(staging_row.payload ->> 'menu_name'), updated_at = now()
  where menu.id = staging_row.menu_id and menu.organization_id = staging_row.organization_id;
  if not found then
    raise exception 'Target menu not found in organization' using errcode = '23503';
  end if;

  delete from public.menu_categories category
  where category.organization_id = staging_row.organization_id
    and category.menu_id = staging_row.menu_id;

  for category_value, category_position in
    select entry.value, entry.ordinality
    from jsonb_array_elements(staging_row.payload -> 'categories') with ordinality entry(value, ordinality)
  loop
    category_slug_base := private.slugify(category_value ->> 'name');
    category_slug_value := category_slug_base;
    category_slug_suffix := 1;
    while exists (
      select 1 from public.menu_categories category
      where category.menu_id = staging_row.menu_id and category.slug = category_slug_value
    ) loop
      category_slug_suffix := category_slug_suffix + 1;
      category_slug_value := category_slug_base || '-' || category_slug_suffix::text;
    end loop;

    insert into public.menu_categories (
      organization_id, menu_id, slug, name_it, description_it, sort_order, created_by
    ) values (
      staging_row.organization_id, staging_row.menu_id, category_slug_value,
      btrim(category_value ->> 'name'), nullif(btrim(category_value ->> 'description'), ''),
      greatest(coalesce((category_value ->> 'position')::integer, category_position::integer - 1), 0),
      (select auth.uid())
    ) returning id into category_id_value;
    category_count := category_count + 1;

    for item_value, item_position in
      select entry.value, entry.ordinality
      from jsonb_array_elements(category_value -> 'items') with ordinality entry(value, ordinality)
    loop
      insert into public.menu_items (
        organization_id, category_id, source_id, name_it, description_it, ingredients_it,
        price, available, vegetarian, vegan, gluten_free, sort_order, created_by
      ) values (
        staging_row.organization_id, category_id_value,
        nullif(btrim(item_value ->> 'source_id'), ''), btrim(item_value ->> 'name'),
        nullif(btrim(item_value ->> 'description'), ''),
        nullif(btrim(item_value ->> 'ingredients'), ''),
        (item_value ->> 'price')::numeric,
        coalesce((item_value ->> 'available')::boolean, true),
        coalesce((item_value ->> 'vegetarian')::boolean, false),
        coalesce((item_value ->> 'vegan')::boolean, false),
        coalesce((item_value ->> 'gluten_free')::boolean, false),
        item_position::integer - 1, (select auth.uid())
      ) returning id into item_id_value;
      item_count := item_count + 1;

      for allergen_value in
        select value from jsonb_array_elements(coalesce(item_value -> 'allergens', '[]'::jsonb))
      loop
        allergen_id_value := private.upsert_staged_allergen(staging_row.organization_id, allergen_value);
        insert into public.item_allergens (organization_id, item_id, allergen_id)
        values (staging_row.organization_id, item_id_value, allergen_id_value)
        on conflict (item_id, allergen_id) do nothing;
      end loop;

      for variant_value, variant_position in
        select entry.value, entry.ordinality
        from jsonb_array_elements(coalesce(item_value -> 'variants', '[]'::jsonb)) with ordinality entry(value, ordinality)
      loop
        insert into public.item_variants (
          organization_id, item_id, name_it, price_delta, available, sort_order, created_by
        ) values (
          staging_row.organization_id, item_id_value, btrim(variant_value ->> 'name'),
          (variant_value ->> 'price_delta')::numeric,
          coalesce((variant_value ->> 'available')::boolean, true),
          variant_position::integer - 1, (select auth.uid())
        ) returning id into variant_id_value;
        variant_count := variant_count + 1;

        for allergen_value in
          select value from jsonb_array_elements(coalesce(variant_value -> 'allergens', '[]'::jsonb))
        loop
          allergen_id_value := private.upsert_staged_allergen(staging_row.organization_id, allergen_value);
          insert into public.variant_allergens (organization_id, variant_id, allergen_id)
          values (staging_row.organization_id, variant_id_value, allergen_id_value)
          on conflict (variant_id, allergen_id) do nothing;
          -- The current public snapshot exposes allergens at item level. Keep the exact variant
          -- relation and also include its allergen in the parent item's public warning list.
          insert into public.item_allergens (organization_id, item_id, allergen_id)
          values (staging_row.organization_id, item_id_value, allergen_id_value)
          on conflict (item_id, allergen_id) do nothing;
        end loop;
      end loop;
    end loop;
  end loop;

  summary_value := jsonb_build_object(
    'menu_id', staging_row.menu_id,
    'categories', category_count,
    'items', item_count,
    'variants', variant_count,
    'revision', staging_row.revision
  );

  update public.menu_import_staging staging
  set status = 'approved', approved_by = (select auth.uid()), approved_at = now(),
      approval_summary = summary_value
  where staging.id = staging_row.id;
  update public.ai_jobs job
  set status = 'completed', completed_at = now(), updated_at = now()
  where job.id = staging_row.ai_job_id and job.organization_id = staging_row.organization_id;
  update public.onboarding_cases onboarding
  set status = 'awaiting_customer', updated_at = now()
  where onboarding.id = staging_row.onboarding_case_id
    and onboarding.organization_id = staging_row.organization_id;
  return summary_value;
end;
$$;

create or replace function public.approve_menu_import(
  p_staging_id uuid,
  p_organization_id uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.approve_menu_import(p_staging_id, p_organization_id);
$$;

create or replace function private.review_translation(
  p_translation_id uuid,
  p_organization_id uuid,
  p_translated_text text,
  p_action text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  translation_row public.translations%rowtype;
  source_value text;
  current_hash text;
begin
  if not private.can_edit_organization(p_organization_id) then
    raise exception 'Not authorized to review translations' using errcode = '42501';
  end if;
  if p_action not in ('save', 'approve') then
    raise exception 'Unsupported translation review action' using errcode = '23514';
  end if;
  if nullif(btrim(coalesce(p_translated_text, '')), '') is null then
    raise exception 'Translation text cannot be empty' using errcode = '23514';
  end if;
  select translation.* into translation_row
  from public.translations translation
  where translation.id = p_translation_id
    and translation.organization_id = p_organization_id
  for update;
  if not found then
    raise exception 'Translation not found in organization' using errcode = 'P0002';
  end if;

  source_value := private.translation_source_value(
    translation_row.organization_id, translation_row.entity_type,
    translation_row.entity_id, translation_row.field_name
  );
  current_hash := encode(extensions.digest(source_value, 'sha256'), 'hex');

  update public.translations translation
  set translated_text = btrim(p_translated_text),
      source_hash = current_hash,
      status = case when p_action = 'approve' then 'approved'::public.translation_status else 'machine_draft'::public.translation_status end,
      origin = case
        when p_action = 'save' or btrim(p_translated_text) is distinct from translation_row.translated_text
          then 'manual'::public.translation_origin
        else translation_row.origin
      end,
      updated_at = now()
  where translation.id = translation_row.id;
  return translation_row.id;
end;
$$;

create or replace function public.review_translation(
  p_translation_id uuid,
  p_organization_id uuid,
  p_translated_text text,
  p_action text
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.review_translation(
    p_translation_id, p_organization_id, p_translated_text, p_action
  );
$$;

create or replace function private.mark_onboarding_published()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.onboarding_cases onboarding
  set status = 'published', completed_at = coalesce(onboarding.completed_at, now()), updated_at = now()
  where onboarding.organization_id = new.organization_id
    and onboarding.location_id = new.location_id
    and onboarding.status <> 'published';
  return new;
end;
$$;

create trigger menu_publications_complete_onboarding
after insert on public.menu_publications
for each row execute function private.mark_onboarding_published();

revoke all on function public.provision_organization(text, text, text, text, uuid, text, text) from public, anon;
revoke all on function public.approve_menu_import(uuid, uuid) from public, anon;
revoke all on function public.review_translation(uuid, uuid, text, text) from public, anon;
revoke all on function public.record_menu_import_staging(uuid, jsonb, text, jsonb) from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;

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
grant execute on function private.provision_organization(text, text, text, text, uuid, text, text) to authenticated;
grant execute on function private.approve_menu_import(uuid, uuid) to authenticated;
grant execute on function private.review_translation(uuid, uuid, text, text) to authenticated;
grant execute on function public.provision_organization(text, text, text, text, uuid, text, text) to authenticated;
grant execute on function public.approve_menu_import(uuid, uuid) to authenticated;
grant execute on function public.review_translation(uuid, uuid, text, text) to authenticated;
grant execute on function public.record_menu_import_staging(uuid, jsonb, text, jsonb) to service_role;
grant execute on all functions in schema public to service_role;
grant execute on all functions in schema private to service_role;
