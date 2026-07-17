-- Structural menu edits are draft-only but still need deterministic ordering,
-- tenant authorization and race-safe moves. Serialize them on the parent menu.

create or replace function private.reorder_menu_entity(
  p_organization_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_direction text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  menu_value uuid;
  category_value uuid;
  current_order integer;
  neighbor_id uuid;
  order_delta integer;
begin
  if not private.can_edit_organization(p_organization_id) then
    raise exception 'Not allowed to edit this organization' using errcode = '42501';
  end if;
  if p_direction not in ('up', 'down') then
    raise exception 'Unsupported ordering direction' using errcode = '22023';
  end if;
  order_delta := case when p_direction = 'up' then -1 else 1 end;

  if p_entity_type = 'category' then
    select category.menu_id
    into menu_value
    from public.menu_categories category
    where category.id = p_entity_id
      and category.organization_id = p_organization_id;
    if not found then
      raise exception 'Category not found' using errcode = 'P0002';
    end if;

    perform 1 from public.menus menu
    where menu.id = menu_value and menu.organization_id = p_organization_id
    for update;

    with ranked as (
      select category.id, row_number() over (order by category.sort_order, category.id) - 1 as normalized_order
      from public.menu_categories category
      where category.organization_id = p_organization_id and category.menu_id = menu_value
    )
    update public.menu_categories category
    set sort_order = ranked.normalized_order
    from ranked
    where category.id = ranked.id and category.sort_order is distinct from ranked.normalized_order;

    select category.sort_order into current_order
    from public.menu_categories category where category.id = p_entity_id;
    select category.id into neighbor_id
    from public.menu_categories category
    where category.organization_id = p_organization_id
      and category.menu_id = menu_value
      and category.sort_order = current_order + order_delta;

    if neighbor_id is null then return false; end if;
    update public.menu_categories category
    set sort_order = case when category.id = p_entity_id then current_order + order_delta else current_order end
    where category.id in (p_entity_id, neighbor_id);
    return true;
  elsif p_entity_type = 'item' then
    select item.category_id, category.menu_id
    into category_value, menu_value
    from public.menu_items item
    join public.menu_categories category
      on category.organization_id = item.organization_id and category.id = item.category_id
    where item.id = p_entity_id and item.organization_id = p_organization_id;
    if not found then
      raise exception 'Menu item not found' using errcode = 'P0002';
    end if;

    perform 1 from public.menus menu
    where menu.id = menu_value and menu.organization_id = p_organization_id
    for update;

    with ranked as (
      select item.id, row_number() over (order by item.sort_order, item.id) - 1 as normalized_order
      from public.menu_items item
      where item.organization_id = p_organization_id and item.category_id = category_value
    )
    update public.menu_items item
    set sort_order = ranked.normalized_order
    from ranked
    where item.id = ranked.id and item.sort_order is distinct from ranked.normalized_order;

    select item.sort_order into current_order
    from public.menu_items item where item.id = p_entity_id;
    select item.id into neighbor_id
    from public.menu_items item
    where item.organization_id = p_organization_id
      and item.category_id = category_value
      and item.sort_order = current_order + order_delta;

    if neighbor_id is null then return false; end if;
    update public.menu_items item
    set sort_order = case when item.id = p_entity_id then current_order + order_delta else current_order end
    where item.id in (p_entity_id, neighbor_id);
    return true;
  end if;

  raise exception 'Unsupported menu entity' using errcode = '22023';
end;
$$;

create or replace function private.move_menu_item(
  p_organization_id uuid,
  p_item_id uuid,
  p_target_category_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_category_id uuid;
  source_menu_id uuid;
  target_menu_id uuid;
  target_order integer;
begin
  if not private.can_edit_organization(p_organization_id) then
    raise exception 'Not allowed to edit this organization' using errcode = '42501';
  end if;

  select item.category_id, category.menu_id
  into source_category_id, source_menu_id
  from public.menu_items item
  join public.menu_categories category
    on category.organization_id = item.organization_id and category.id = item.category_id
  where item.id = p_item_id and item.organization_id = p_organization_id;
  if not found then raise exception 'Menu item not found' using errcode = 'P0002'; end if;

  select category.menu_id into target_menu_id
  from public.menu_categories category
  where category.id = p_target_category_id and category.organization_id = p_organization_id;
  if not found then raise exception 'Target category not found' using errcode = 'P0002'; end if;
  if source_menu_id <> target_menu_id then
    raise exception 'A dish cannot move to another menu' using errcode = 'P0001';
  end if;
  if source_category_id = p_target_category_id then return false; end if;

  perform 1 from public.menus menu
  where menu.id = source_menu_id and menu.organization_id = p_organization_id
  for update;

  select coalesce(max(item.sort_order) + 1, 0)
  into target_order
  from public.menu_items item
  where item.organization_id = p_organization_id and item.category_id = p_target_category_id;

  update public.menu_items item
  set category_id = p_target_category_id, sort_order = target_order
  where item.id = p_item_id and item.organization_id = p_organization_id;

  with ranked as (
    select item.id, row_number() over (order by item.sort_order, item.id) - 1 as normalized_order
    from public.menu_items item
    where item.organization_id = p_organization_id and item.category_id = source_category_id
  )
  update public.menu_items item
  set sort_order = ranked.normalized_order
  from ranked
  where item.id = ranked.id and item.sort_order is distinct from ranked.normalized_order;

  return true;
end;
$$;

create or replace function public.reorder_menu_entity(
  p_organization_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_direction text
)
returns boolean
language sql
security invoker
set search_path = ''
as $$ select private.reorder_menu_entity(p_organization_id, p_entity_type, p_entity_id, p_direction) $$;

create or replace function public.move_menu_item(
  p_organization_id uuid,
  p_item_id uuid,
  p_target_category_id uuid
)
returns boolean
language sql
security invoker
set search_path = ''
as $$ select private.move_menu_item(p_organization_id, p_item_id, p_target_category_id) $$;

revoke all on function private.reorder_menu_entity(uuid, text, uuid, text) from public, anon;
revoke all on function private.move_menu_item(uuid, uuid, uuid) from public, anon;
revoke all on function public.reorder_menu_entity(uuid, text, uuid, text) from public, anon;
revoke all on function public.move_menu_item(uuid, uuid, uuid) from public, anon;
grant execute on function private.reorder_menu_entity(uuid, text, uuid, text) to authenticated;
grant execute on function private.move_menu_item(uuid, uuid, uuid) to authenticated;
grant execute on function public.reorder_menu_entity(uuid, text, uuid, text) to authenticated;
grant execute on function public.move_menu_item(uuid, uuid, uuid) to authenticated;
