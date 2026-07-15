-- All OpenAI-inferred allergens are suggestions until an operator confirms them.
-- Keep the enforcement inside the same transaction that writes the draft menu.
create or replace function public.approve_menu_import(
  p_staging_id uuid,
  p_organization_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  staging_payload jsonb;
  staging_parser text;
  result_value jsonb;
begin
  select staging.payload, staging.parser
  into staging_payload, staging_parser
  from public.menu_import_staging staging
  where staging.id = p_staging_id
    and staging.organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Menu staging not found in organization' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from (
      select allergen_entry.value as allergen
      from jsonb_array_elements(coalesce(staging_payload -> 'categories', '[]'::jsonb)) category_entry(value)
      cross join lateral jsonb_array_elements(coalesce(category_entry.value -> 'items', '[]'::jsonb)) item_entry(value)
      cross join lateral jsonb_array_elements(coalesce(item_entry.value -> 'allergens', '[]'::jsonb)) allergen_entry(value)
      union all
      select allergen_entry.value as allergen
      from jsonb_array_elements(coalesce(staging_payload -> 'categories', '[]'::jsonb)) category_entry(value)
      cross join lateral jsonb_array_elements(coalesce(category_entry.value -> 'items', '[]'::jsonb)) item_entry(value)
      cross join lateral jsonb_array_elements(coalesce(item_entry.value -> 'variants', '[]'::jsonb)) variant_entry(value)
      cross join lateral jsonb_array_elements(coalesce(variant_entry.value -> 'allergens', '[]'::jsonb)) allergen_entry(value)
    ) staged_allergens
    where case
      when staged_allergens.allergen ? 'confirmed'
        then coalesce((staged_allergens.allergen ->> 'confirmed')::boolean, false) is not true
      else staging_parser = 'openai'
    end
  ) then
    raise exception 'Every AI-inferred allergen must be confirmed or rejected before approval'
      using errcode = 'P0001';
  end if;

  result_value := private.approve_menu_import(p_staging_id, p_organization_id);
  return result_value;
end;
$$;

revoke all on function public.approve_menu_import(uuid, uuid) from public, anon;
grant execute on function private.approve_menu_import(uuid, uuid) to authenticated;
grant execute on function public.approve_menu_import(uuid, uuid) to authenticated;
