-- Keep publication history meaningful: publishing an unchanged draft should
-- not create a second immutable version with only new metadata. The menu row
-- still points at the previous publication while the new snapshot is inserted,
-- so the trigger can compare both versions atomically.

create or replace function private.reject_duplicate_menu_publication()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_snapshot jsonb;
begin
  -- Restoring an older version is an explicit recovery action and must remain
  -- possible even if its content happens to match the current draft.
  if new.restored_from_id is not null then
    return new;
  end if;

  select publication.snapshot
  into current_snapshot
  from public.menus menu
  join public.menu_publications publication
    on publication.organization_id = menu.organization_id
    and publication.id = menu.current_publication_id
  where menu.organization_id = new.organization_id
    and menu.id = new.menu_id;

  if current_snapshot is not null
     and current_snapshot - 'published_at' - 'version'
       = new.snapshot - 'published_at' - 'version' then
    raise exception 'The draft is identical to the current publication'
      using errcode = 'P0003';
  end if;

  return new;
end;
$$;

revoke all on function private.reject_duplicate_menu_publication() from public, anon, authenticated;

create trigger menu_publications_reject_duplicate
before insert on public.menu_publications
for each row execute function private.reject_duplicate_menu_publication();
