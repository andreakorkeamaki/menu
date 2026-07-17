-- Track generated dish imagery through the same tenant-scoped AI and private
-- media review pipeline used by imports and translations.

alter type public.ai_job_kind add value if not exists 'image_generation';

alter table public.media_assets
  add column ai_job_id uuid;

alter table public.media_assets
  add constraint media_assets_organization_ai_job_fkey
  foreign key (organization_id, ai_job_id)
  references public.ai_jobs (organization_id, id)
  on delete set null (ai_job_id);

create unique index media_assets_ai_job_idx
  on public.media_assets (ai_job_id)
  where ai_job_id is not null;

comment on column public.media_assets.ai_job_id is
  'Originating image_generation job; null for restaurant-uploaded media.';

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
  asset.ai_job_id
from public.media_assets asset
where asset.media_kind = 'menu_item'
  and asset.menu_item_id is not null
order by asset.organization_id, asset.menu_item_id, asset.created_at desc, asset.id desc;

revoke all on public.latest_menu_item_media_assets from public, anon;
grant select on public.latest_menu_item_media_assets to authenticated;

comment on view public.latest_menu_item_media_assets is
  'Latest tenant-visible media review record for each menu item, including generated-image provenance; underlying RLS is enforced.';
