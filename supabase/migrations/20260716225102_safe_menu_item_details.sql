create or replace function private.save_menu_item_details(
  p_item_id uuid,
  p_organization_id uuid,
  p_name text,
  p_description text,
  p_ingredients text,
  p_price numeric,
  p_available boolean,
  p_vegetarian boolean,
  p_vegan boolean,
  p_gluten_free boolean,
  p_allergen_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_allergens uuid[] := coalesce(p_allergen_ids, '{}'::uuid[]);
begin
  if not private.can_edit_organization(p_organization_id) then
    raise exception 'Not allowed to edit this organization' using errcode = '42501';
  end if;

  if p_name is null or char_length(btrim(p_name)) not between 1 and 160 then
    raise exception 'Invalid menu item name' using errcode = '23514';
  end if;
  if p_price is null or p_price < 0 or p_price > 99999 then
    raise exception 'Invalid menu item price' using errcode = '23514';
  end if;

  if exists (
    select 1
    from unnest(requested_allergens) requested(id)
    left join public.allergens allergen
      on allergen.id = requested.id
      and allergen.organization_id = p_organization_id
    where allergen.id is null
  ) then
    raise exception 'Allergen does not belong to this organization' using errcode = '23503';
  end if;

  if p_gluten_free and exists (
    select 1
    from public.allergens allergen
    where allergen.organization_id = p_organization_id
      and allergen.id = any(requested_allergens)
      and allergen.code in ('gluten', 'glutine')
  ) then
    raise exception 'A gluten-free item cannot declare gluten as an allergen' using errcode = '23514';
  end if;

  update public.menu_items item
  set name_it = btrim(p_name),
      description_it = nullif(btrim(coalesce(p_description, '')), ''),
      ingredients_it = nullif(btrim(coalesce(p_ingredients, '')), ''),
      price = p_price,
      available = p_available,
      vegetarian = p_vegetarian or p_vegan,
      vegan = p_vegan,
      gluten_free = p_gluten_free
  where item.id = p_item_id
    and item.organization_id = p_organization_id;

  if not found then
    raise exception 'Menu item does not exist in this organization' using errcode = '23503';
  end if;

  delete from public.item_allergens relation
  where relation.organization_id = p_organization_id
    and relation.item_id = p_item_id;

  insert into public.item_allergens (organization_id, item_id, allergen_id)
  select p_organization_id, p_item_id, requested.id
  from (select distinct unnest(requested_allergens) as id) requested;
end;
$$;

create or replace function public.save_menu_item_details(
  p_item_id uuid,
  p_organization_id uuid,
  p_name text,
  p_description text,
  p_ingredients text,
  p_price numeric,
  p_available boolean,
  p_vegetarian boolean,
  p_vegan boolean,
  p_gluten_free boolean,
  p_allergen_ids uuid[]
)
returns void
language sql
set search_path = ''
as $$
  select private.save_menu_item_details(
    p_item_id, p_organization_id, p_name, p_description, p_ingredients,
    p_price, p_available, p_vegetarian, p_vegan, p_gluten_free, p_allergen_ids
  );
$$;

revoke all on function private.save_menu_item_details(
  uuid, uuid, text, text, text, numeric, boolean, boolean, boolean, boolean, uuid[]
) from public, anon;
revoke all on function public.save_menu_item_details(
  uuid, uuid, text, text, text, numeric, boolean, boolean, boolean, boolean, uuid[]
) from public, anon;
grant execute on function private.save_menu_item_details(
  uuid, uuid, text, text, text, numeric, boolean, boolean, boolean, boolean, uuid[]
) to authenticated, service_role;
grant execute on function public.save_menu_item_details(
  uuid, uuid, text, text, text, numeric, boolean, boolean, boolean, boolean, uuid[]
) to authenticated, service_role;
