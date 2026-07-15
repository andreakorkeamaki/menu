-- Keep individual and bulk approvals auditable. The private implementation is
-- security definer because the public wrapper is callable through the Data API;
-- authorization is checked against memberships before any tenant row changes.
create or replace function private.review_translation(
  p_translation_id uuid,
  p_organization_id uuid,
  p_translated_text text,
  p_action text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  translation_row public.translations%rowtype;
  source_value text;
  current_hash text;
begin
  if not private.can_edit_organization(p_organization_id) then
    raise exception 'Not authorized to review translations' using errcode = '42501';
  end if;
  if p_action not in ('save', 'approve') then
    raise exception 'Unsupported translation review action' using errcode = '23514';
  end if;
  if nullif(btrim(coalesce(p_translated_text, '')), '') is null then
    raise exception 'Translation text cannot be empty' using errcode = '23514';
  end if;

  select translation.* into translation_row
  from public.translations translation
  where translation.id = p_translation_id
    and translation.organization_id = p_organization_id
  for update;
  if not found then
    raise exception 'Translation not found in organization' using errcode = 'P0002';
  end if;

  source_value := private.translation_source_value(
    translation_row.organization_id,
    translation_row.entity_type,
    translation_row.entity_id,
    translation_row.field_name
  );
  current_hash := encode(extensions.digest(source_value, 'sha256'), 'hex');

  update public.translations translation
  set translated_text = btrim(p_translated_text),
      source_hash = current_hash,
      status = case
        when p_action = 'approve' then 'approved'::public.translation_status
        else 'machine_draft'::public.translation_status
      end,
      origin = case
        when p_action = 'save'
          or btrim(p_translated_text) is distinct from translation_row.translated_text
          then 'manual'::public.translation_origin
        else translation_row.origin
      end,
      approved_by = case when p_action = 'approve' then (select auth.uid()) else null end,
      approved_at = case when p_action = 'approve' then now() else null end,
      updated_at = now()
  where translation.id = translation_row.id;

  return translation_row.id;
end;
$$;

create or replace function private.approve_translation_drafts(
  p_organization_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  approved_count integer;
begin
  if not private.can_edit_organization(p_organization_id) then
    raise exception 'Not authorized to approve translations' using errcode = '42501';
  end if;

  update public.translations translation
  set status = 'approved'::public.translation_status,
      approved_by = (select auth.uid()),
      approved_at = now(),
      updated_at = now()
  where translation.organization_id = p_organization_id
    and translation.status = 'machine_draft'
    and nullif(btrim(coalesce(translation.translated_text, '')), '') is not null;

  get diagnostics approved_count = row_count;
  return approved_count;
end;
$$;

create or replace function public.approve_translation_drafts(
  p_organization_id uuid
)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.approve_translation_drafts(p_organization_id);
$$;

revoke all on function private.approve_translation_drafts(uuid) from public, anon, authenticated;
revoke all on function public.approve_translation_drafts(uuid) from public, anon;

grant execute on function private.approve_translation_drafts(uuid) to authenticated;
grant execute on function public.approve_translation_drafts(uuid) to authenticated;
grant execute on function private.approve_translation_drafts(uuid) to service_role;
grant execute on function public.approve_translation_drafts(uuid) to service_role;
