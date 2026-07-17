-- Complete the existing menu_item media kind with an explicit tenant-scoped
-- target. Originals stay private; only an operator-approved derivative is
-- attached to the normalized draft and later copied into an immutable snapshot.

alter table public.media_assets
  add column menu_item_id uuid;

alter table public.media_assets
  add constraint media_assets_organization_menu_item_fkey
  foreign key (organization_id, menu_item_id)
  references public.menu_items (organization_id, id)
  on delete cascade;

alter table public.media_assets
  add constraint media_assets_menu_item_target_check
  check (media_kind <> 'menu_item' or (menu_item_id is not null and menu_id is not null));

create index media_assets_organization_menu_item_idx
  on public.media_assets (organization_id, menu_item_id, created_at desc)
  where menu_item_id is not null;

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
  item_menu_id uuid;
  destination_valid boolean;
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
     or asset_row.media_kind not in ('logo', 'cover', 'menu_item') then
    raise exception 'Media is not awaiting review' using errcode = 'P0001';
  end if;

  if asset_row.media_kind = 'menu_item' then
    select category.menu_id
    into item_menu_id
    from public.menu_items item
    join public.menu_categories category
      on category.organization_id = item.organization_id
      and category.id = item.category_id
    where item.id = asset_row.menu_item_id
      and item.organization_id = asset_row.organization_id;
    if not found or asset_row.menu_id is distinct from item_menu_id then
      raise exception 'Dish media target is invalid' using errcode = 'P0001';
    end if;
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

  destination_valid := case
    when asset_row.media_kind = 'menu_item' then
      p_public_path ~ (
        '^' || asset_row.organization_id::text || '/menu-items/'
        || asset_row.menu_item_id::text || '/[0-9a-f-]+\.webp$'
      )
    else
      p_public_path ~ (
        '^' || asset_row.organization_id::text || '/branding/(logo|cover)/[0-9a-f-]+\.webp$'
      )
  end;

  if nullif(btrim(coalesce(p_public_path, '')), '') is null
     or nullif(btrim(coalesce(p_public_url, '')), '') is null
     or not coalesce(destination_valid, false)
     or p_public_url !~ '^https?://[^[:space:]]+$' then
    raise exception 'Approved media destination is invalid' using errcode = '22023';
  end if;

  update public.media_assets
  set is_public = false,
      updated_at = now()
  where organization_id = asset_row.organization_id
    and media_kind = asset_row.media_kind
    and id <> asset_row.id
    and is_public
    and (
      (asset_row.media_kind = 'menu_item' and menu_item_id = asset_row.menu_item_id)
      or (asset_row.media_kind <> 'menu_item' and location_id = asset_row.location_id)
    );

  update public.media_assets
  set bucket_id = 'public-media',
      object_path = p_public_path,
      mime_type = 'image/webp',
      approval_status = 'approved',
      is_public = true,
      approved_by = (select auth.uid()),
      approved_at = now(),
      updated_at = now()
  where id = asset_row.id and organization_id = asset_row.organization_id;

  if asset_row.media_kind = 'menu_item' then
    update public.menu_items
    set image_url = p_public_url,
        updated_at = now()
    where id = asset_row.menu_item_id
      and organization_id = asset_row.organization_id;
  else
    update public.locations
    set logo_url = case when asset_row.media_kind = 'logo' then p_public_url else logo_url end,
        cover_url = case when asset_row.media_kind = 'cover' then p_public_url else cover_url end,
        updated_at = now()
    where id = asset_row.location_id
      and organization_id = asset_row.organization_id;
  end if;

  return asset_row.id;
end;
$$;

revoke all on function private.review_brand_media(uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function private.review_brand_media(uuid, uuid, text, text, text)
  to authenticated;

create or replace function private.remove_menu_item_image(
  p_organization_id uuid,
  p_menu_item_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_url text;
begin
  if not private.can_edit_organization(p_organization_id) then
    raise exception 'Not allowed to edit this organization' using errcode = '42501';
  end if;

  select item.image_url
  into previous_url
  from public.menu_items item
  where item.id = p_menu_item_id
    and item.organization_id = p_organization_id
  for update;
  if not found then
    raise exception 'Menu item not found' using errcode = 'P0002';
  end if;

  update public.menu_items item
  set image_url = null,
      updated_at = now()
  where item.id = p_menu_item_id
    and item.organization_id = p_organization_id;

  -- The public object remains in Storage because an immutable older snapshot may
  -- still reference it. It is only retired as the current draft attachment.
  update public.media_assets asset
  set is_public = false,
      updated_at = now()
  where asset.organization_id = p_organization_id
    and asset.menu_item_id = p_menu_item_id
    and asset.media_kind = 'menu_item'
    and asset.is_public;

  return previous_url is not null;
end;
$$;

create or replace function public.remove_menu_item_image(
  p_organization_id uuid,
  p_menu_item_id uuid
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.remove_menu_item_image(p_organization_id, p_menu_item_id)
$$;

revoke all on function private.remove_menu_item_image(uuid, uuid) from public, anon;
revoke all on function public.remove_menu_item_image(uuid, uuid) from public, anon;
grant execute on function private.remove_menu_item_image(uuid, uuid) to authenticated;
grant execute on function public.remove_menu_item_image(uuid, uuid) to authenticated;
