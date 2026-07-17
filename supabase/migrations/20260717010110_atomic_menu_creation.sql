-- Appending draft entities must stay deterministic when multiple editors work at
-- once. Normalize legacy gaps/duplicates, enforce the ordering invariant, and
-- serialize every append on the same parent menu used by reorder/move RPCs.

with ranked as (
  select category.id,
    row_number() over (
      partition by category.menu_id
      order by category.sort_order, category.created_at, category.id
    ) - 1 as normalized_order
  from public.menu_categories category
)
update public.menu_categories category
set sort_order = ranked.normalized_order
from ranked
where category.id = ranked.id
  and category.sort_order is distinct from ranked.normalized_order;

with ranked as (
  select item.id,
    row_number() over (
      partition by item.category_id
      order by item.sort_order, item.created_at, item.id
    ) - 1 as normalized_order
  from public.menu_items item
)
update public.menu_items item
set sort_order = ranked.normalized_order
from ranked
where item.id = ranked.id
  and item.sort_order is distinct from ranked.normalized_order;

alter table public.menu_categories
  add constraint menu_categories_menu_sort_order_key
  unique (menu_id, sort_order)
  deferrable initially deferred;

alter table public.menu_items
  add constraint menu_items_category_sort_order_key
  unique (category_id, sort_order)
  deferrable initially deferred;

create or replace function private.create_menu_category(
  p_organization_id uuid,
  p_menu_id uuid,
  p_name text,
  p_slug text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_id uuid;
  next_order integer;
begin
  if not private.can_edit_organization(p_organization_id) then
    raise exception 'Not allowed to edit this organization' using errcode = '42501';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 160 then
    raise exception 'Invalid category name' using errcode = '22023';
  end if;
  if p_slug is null or p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Invalid category slug' using errcode = '22023';
  end if;

  perform 1
  from public.menus menu
  where menu.id = p_menu_id
    and menu.organization_id = p_organization_id
  for update;
  if not found then
    raise exception 'Menu not found' using errcode = 'P0002';
  end if;

  select coalesce(max(category.sort_order) + 1, 0)
  into next_order
  from public.menu_categories category
  where category.organization_id = p_organization_id
    and category.menu_id = p_menu_id;

  insert into public.menu_categories (
    organization_id, menu_id, slug, name_it, sort_order, created_by
  ) values (
    p_organization_id, p_menu_id, p_slug, btrim(p_name), next_order, auth.uid()
  )
  returning id into created_id;

  return created_id;
end;
$$;

create or replace function private.create_menu_item(
  p_organization_id uuid,
  p_category_id uuid,
  p_name text,
  p_price numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_id uuid;
  menu_value uuid;
  next_order integer;
begin
  if not private.can_edit_organization(p_organization_id) then
    raise exception 'Not allowed to edit this organization' using errcode = '42501';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 160 then
    raise exception 'Invalid menu item name' using errcode = '22023';
  end if;
  if p_price is null or p_price < 0 or p_price > 99999 then
    raise exception 'Invalid menu item price' using errcode = '22023';
  end if;

  select category.menu_id
  into menu_value
  from public.menu_categories category
  where category.id = p_category_id
    and category.organization_id = p_organization_id;
  if not found then
    raise exception 'Category not found' using errcode = 'P0002';
  end if;

  perform 1
  from public.menus menu
  where menu.id = menu_value
    and menu.organization_id = p_organization_id
  for update;
  if not found then
    raise exception 'Menu not found' using errcode = 'P0002';
  end if;

  select coalesce(max(item.sort_order) + 1, 0)
  into next_order
  from public.menu_items item
  where item.organization_id = p_organization_id
    and item.category_id = p_category_id;

  insert into public.menu_items (
    organization_id, category_id, name_it, price, sort_order, created_by
  ) values (
    p_organization_id, p_category_id, btrim(p_name), p_price, next_order, auth.uid()
  )
  returning id into created_id;

  return created_id;
end;
$$;

create or replace function public.create_menu_category(
  p_organization_id uuid,
  p_menu_id uuid,
  p_name text,
  p_slug text
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_menu_category(p_organization_id, p_menu_id, p_name, p_slug)
$$;

create or replace function public.create_menu_item(
  p_organization_id uuid,
  p_category_id uuid,
  p_name text,
  p_price numeric
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_menu_item(p_organization_id, p_category_id, p_name, p_price)
$$;

revoke all on function private.create_menu_category(uuid, uuid, text, text) from public, anon;
revoke all on function private.create_menu_item(uuid, uuid, text, numeric) from public, anon;
revoke all on function public.create_menu_category(uuid, uuid, text, text) from public, anon;
revoke all on function public.create_menu_item(uuid, uuid, text, numeric) from public, anon;
grant execute on function private.create_menu_category(uuid, uuid, text, text) to authenticated;
grant execute on function private.create_menu_item(uuid, uuid, text, numeric) to authenticated;
grant execute on function public.create_menu_category(uuid, uuid, text, text) to authenticated;
grant execute on function public.create_menu_item(uuid, uuid, text, numeric) to authenticated;
