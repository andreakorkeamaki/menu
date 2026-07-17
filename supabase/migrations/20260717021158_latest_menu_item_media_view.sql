-- Resolve one latest review record per dish without imposing an application
-- row cap. SECURITY INVOKER makes the underlying media_assets RLS policies
-- authoritative for both tenant members and platform operators.

create view public.latest_menu_item_media_assets
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
  asset.created_at
from public.media_assets asset
where asset.media_kind = 'menu_item'
  and asset.menu_item_id is not null
order by asset.organization_id, asset.menu_item_id, asset.created_at desc, asset.id desc;

revoke all on public.latest_menu_item_media_assets from public, anon;
grant select on public.latest_menu_item_media_assets to authenticated;

comment on view public.latest_menu_item_media_assets is
  'Latest tenant-visible media review record for each menu item; underlying RLS is enforced.';
