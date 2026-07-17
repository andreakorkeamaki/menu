-- Preserve image-generation lineage while replacing a private draft only after
-- the new object has been generated and safely uploaded. The public wrapper is
-- tenant-authorized and the private function performs the metadata transition
-- and AI job completion in one database transaction.

alter table public.media_assets
  add column supersedes_asset_id uuid,
  add column superseded_at timestamptz;

alter table public.media_assets
  add constraint media_assets_organization_supersedes_fkey
  foreign key (organization_id, supersedes_asset_id)
  references public.media_assets (organization_id, id)
  on delete set null (supersedes_asset_id),
  add constraint media_assets_not_self_superseding_check
  check (supersedes_asset_id is null or supersedes_asset_id <> id);

create index media_assets_organization_supersedes_idx
  on public.media_assets (organization_id, supersedes_asset_id)
  where supersedes_asset_id is not null;

create index media_assets_active_menu_item_review_idx
  on public.media_assets (organization_id, menu_id, menu_item_id, created_at desc)
  where media_kind = 'menu_item'
    and approval_status = 'draft'
    and not is_public
    and superseded_at is null;

comment on column public.media_assets.supersedes_asset_id is
  'Previous asset used as provenance for a successful regeneration.';
comment on column public.media_assets.superseded_at is
  'Set only after a private draft has been safely replaced by a newer generated draft.';

create or replace function private.complete_menu_image_generation(
  p_job_id uuid,
  p_organization_id uuid,
  p_menu_id uuid,
  p_menu_item_id uuid,
  p_replaces_asset_id uuid,
  p_object_path text,
  p_mime_type text,
  p_alt_text text,
  p_model text,
  p_response_id text,
  p_usage jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.ai_jobs%rowtype;
  previous_row public.media_assets%rowtype;
  generated_asset_id uuid := gen_random_uuid();
  archived_object_path text;
  current_source jsonb;
begin
  if not (
    (select private.is_operator())
    or (select private.can_edit_organization(p_organization_id))
  ) then
    raise exception 'Image generation completion is not allowed' using errcode = '42501';
  end if;

  if nullif(btrim(coalesce(p_object_path, '')), '') is null
     or p_object_path !~ (
       '^' || p_organization_id::text || '/menu-items/'
       || p_menu_item_id::text || '/[0-9a-f-]+\.webp$'
     )
     or p_mime_type <> 'image/webp'
     or nullif(btrim(coalesce(p_model, '')), '') is null then
    raise exception 'Generated image metadata is invalid' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_organization_id::text || ':' || p_menu_item_id::text, 0)
  );

  select * into job_row
  from public.ai_jobs job
  where job.id = p_job_id
    and job.organization_id = p_organization_id
  for update;

  if job_row.id is null
     or job_row.kind <> 'image_generation'
     or job_row.status <> 'running'
     or job_row.menu_id is distinct from p_menu_id
     or job_row.created_by is distinct from (select auth.uid())
     or job_row.input ->> 'item_id' is distinct from p_menu_item_id::text
     or nullif(job_row.input ->> 'source_hash', '') is null
     or nullif(job_row.input ->> 'prompt_hash', '') is null
     or nullif(job_row.input ->> 'prompt', '') is null
     or jsonb_typeof(job_row.input -> 'source') is distinct from 'object'
     or jsonb_typeof(job_row.input -> 'provenance') is distinct from 'object' then
    raise exception 'Image generation job provenance is invalid' using errcode = 'P0001';
  end if;

  select jsonb_build_object(
    'item_id', item.id,
    'name', btrim(item.name_it),
    'category', btrim(category.name_it),
    'description', case when item.description_it is null then null else btrim(item.description_it) end,
    'ingredients', case when item.ingredients_it is null then null else btrim(item.ingredients_it) end,
    'vegetarian', item.vegetarian,
    'vegan', item.vegan,
    'gluten_free', item.gluten_free
  )
  into current_source
    from public.menu_items item
    join public.menu_categories category
      on category.organization_id = item.organization_id
      and category.id = item.category_id
    where item.organization_id = p_organization_id
      and item.id = p_menu_item_id
      and category.menu_id = p_menu_id
  for share of item, category;
  if current_source is null or job_row.input -> 'source' is distinct from current_source then
    raise exception 'Generated image source is stale' using errcode = 'P0001';
  end if;

  if p_replaces_asset_id is not null then
    select * into previous_row
    from public.media_assets asset
    where asset.id = p_replaces_asset_id
      and asset.organization_id = p_organization_id
      and asset.menu_id = p_menu_id
      and asset.menu_item_id = p_menu_item_id
      and asset.media_kind = 'menu_item'
      and asset.superseded_at is null
    for update;
    if previous_row.id is null then
      raise exception 'Regeneration source is invalid' using errcode = 'P0001';
    end if;
  end if;

  if exists (
    select 1
    from public.media_assets asset
    where asset.organization_id = p_organization_id
      and asset.menu_id = p_menu_id
      and asset.menu_item_id = p_menu_item_id
      and asset.media_kind = 'menu_item'
      and asset.approval_status = 'draft'
      and not asset.is_public
      and asset.superseded_at is null
      and asset.id is distinct from p_replaces_asset_id
  ) then
    raise exception 'Another image is already awaiting review' using errcode = 'P0001';
  end if;

  if previous_row.id is not null and previous_row.approval_status = 'draft' then
    if previous_row.bucket_id <> 'intake' or previous_row.is_public then
      raise exception 'Private regeneration source is invalid' using errcode = 'P0001';
    end if;
    archived_object_path := previous_row.object_path;
    update public.media_assets asset
    set approval_status = 'rejected',
        superseded_at = now(),
        approved_by = null,
        approved_at = null,
        updated_at = now()
    where asset.id = previous_row.id
      and asset.organization_id = previous_row.organization_id;
  end if;

  insert into public.media_assets (
    id,
    organization_id,
    menu_id,
    menu_item_id,
    ai_job_id,
    supersedes_asset_id,
    bucket_id,
    object_path,
    media_kind,
    mime_type,
    alt_text,
    approval_status,
    is_public,
    created_by,
    created_at,
    updated_at
  ) values (
    generated_asset_id,
    p_organization_id,
    p_menu_id,
    p_menu_item_id,
    p_job_id,
    p_replaces_asset_id,
    'intake',
    p_object_path,
    'menu_item',
    p_mime_type,
    nullif(btrim(coalesce(p_alt_text, '')), ''),
    'draft',
    false,
    (select auth.uid()),
    pg_catalog.clock_timestamp(),
    pg_catalog.clock_timestamp()
  );

  update public.ai_jobs job
  set model = p_model,
      response_id = p_response_id,
      status = 'completed',
      output = jsonb_build_object(
        'asset_id', generated_asset_id,
        'replaced_asset_id', p_replaces_asset_id,
        'storage_bucket', 'intake',
        'storage_path', p_object_path,
        'mime_type', p_mime_type
      ),
      usage = p_usage,
      completed_at = now(),
      updated_at = now()
  where job.id = job_row.id
    and job.organization_id = job_row.organization_id;

  return jsonb_build_object(
    'asset_id', generated_asset_id,
    'archived_object_path', archived_object_path
  );
end;
$$;

create or replace function public.complete_menu_image_generation(
  p_job_id uuid,
  p_organization_id uuid,
  p_menu_id uuid,
  p_menu_item_id uuid,
  p_replaces_asset_id uuid,
  p_object_path text,
  p_mime_type text,
  p_alt_text text,
  p_model text,
  p_response_id text,
  p_usage jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.complete_menu_image_generation(
    p_job_id,
    p_organization_id,
    p_menu_id,
    p_menu_item_id,
    p_replaces_asset_id,
    p_object_path,
    p_mime_type,
    p_alt_text,
    p_model,
    p_response_id,
    p_usage
  )
$$;

revoke all on function private.complete_menu_image_generation(
  uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, jsonb
) from public, anon, authenticated;
revoke all on function public.complete_menu_image_generation(
  uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, jsonb
) from public, anon;
grant execute on function private.complete_menu_image_generation(
  uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, jsonb
) to authenticated;
grant execute on function public.complete_menu_image_generation(
  uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, jsonb
) to authenticated;

create or replace view public.latest_menu_item_media_assets
with (security_invoker = true)
as
select distinct on (asset.organization_id, asset.menu_item_id)
  asset.id,
  asset.organization_id,
  asset.menu_item_id,
  asset.bucket_id,
  asset.object_path,
  asset.approval_status,
  asset.is_public,
  asset.created_at,
  asset.ai_job_id,
  asset.supersedes_asset_id,
  asset.superseded_at
from public.media_assets asset
where asset.media_kind = 'menu_item'
  and asset.menu_item_id is not null
  and asset.superseded_at is null
order by asset.organization_id, asset.menu_item_id, asset.created_at desc, asset.id desc;

revoke all on public.latest_menu_item_media_assets from public, anon;
grant select on public.latest_menu_item_media_assets to authenticated;

comment on view public.latest_menu_item_media_assets is
  'Latest non-archived tenant-visible media review record for each menu item, including generation lineage; underlying RLS is enforced.';
