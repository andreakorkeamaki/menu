-- Restaurant branding enters through the private intake bucket. Only a platform
-- operator can promote a reviewed image to the public bucket and attach its URL
-- to the draft location record. Published snapshots remain immutable.

create or replace function private.review_brand_media(
  p_asset_id uuid,
  p_organization_id uuid,
  p_action text,
  p_public_path text default null,
  p_public_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  asset_row public.media_assets%rowtype;
begin
  if not (select private.is_operator()) then
    raise exception 'Platform operator access required' using errcode = '42501';
  end if;

  if p_action not in ('approve', 'reject') then
    raise exception 'Unsupported media review action' using errcode = '22023';
  end if;

  select * into asset_row
  from public.media_assets
  where id = p_asset_id
    and organization_id = p_organization_id
  for update;

  if asset_row.id is null
     or asset_row.bucket_id <> 'intake'
     or asset_row.approval_status <> 'draft'
     or asset_row.is_public
     or asset_row.media_kind not in ('logo', 'cover') then
    raise exception 'Brand media is not awaiting review' using errcode = 'P0001';
  end if;

  if p_action = 'reject' then
    update public.media_assets
    set approval_status = 'rejected',
        is_public = false,
        approved_by = null,
        approved_at = null,
        updated_at = now()
    where id = asset_row.id and organization_id = asset_row.organization_id;
    return asset_row.id;
  end if;

  if nullif(btrim(coalesce(p_public_path, '')), '') is null
     or nullif(btrim(coalesce(p_public_url, '')), '') is null
     or p_public_path !~ ('^' || asset_row.organization_id::text || '/branding/(logo|cover)/[0-9a-f-]+\.(jpg|png|webp)$')
     or p_public_url !~ '^https?://[^[:space:]]+$' then
    raise exception 'Approved media destination is invalid' using errcode = '22023';
  end if;

  -- A location has one current approved asset per branding role. Historical
  -- approved files remain auditable, but are no longer advertised as current.
  update public.media_assets
  set is_public = false,
      updated_at = now()
  where organization_id = asset_row.organization_id
    and location_id = asset_row.location_id
    and media_kind = asset_row.media_kind
    and id <> asset_row.id
    and is_public;

  update public.media_assets
  set bucket_id = 'public-media',
      object_path = p_public_path,
      approval_status = 'approved',
      is_public = true,
      approved_by = (select auth.uid()),
      approved_at = now(),
      updated_at = now()
  where id = asset_row.id and organization_id = asset_row.organization_id;

  update public.locations
  set logo_url = case when asset_row.media_kind = 'logo' then p_public_url else logo_url end,
      cover_url = case when asset_row.media_kind = 'cover' then p_public_url else cover_url end,
      updated_at = now()
  where id = asset_row.location_id
    and organization_id = asset_row.organization_id;

  return asset_row.id;
end;
$$;

create or replace function public.review_brand_media(
  p_asset_id uuid,
  p_organization_id uuid,
  p_action text,
  p_public_path text default null,
  p_public_url text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.review_brand_media(
    p_asset_id,
    p_organization_id,
    p_action,
    p_public_path,
    p_public_url
  );
$$;

revoke all on function private.review_brand_media(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.review_brand_media(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.review_brand_media(uuid, uuid, text, text, text) to authenticated;
