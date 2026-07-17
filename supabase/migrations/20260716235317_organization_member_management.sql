-- Owners need to be able to maintain access after the initial invitation. Keep
-- the authorization check, self-lockout guard, last-owner invariant and audit
-- record in one transactional operation instead of coordinating them in React.

create or replace function private.manage_organization_member(
  p_organization_id uuid,
  p_membership_id uuid,
  p_action text,
  p_role public.membership_role
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_row public.memberships%rowtype;
begin
  if actor_id is null or not private.has_membership_role(
    p_organization_id,
    array['owner']::public.membership_role[]
  ) then
    raise exception 'Only an organization owner can manage members' using errcode = '42501';
  end if;

  -- Serialize access changes for the organization so two owners cannot race a
  -- demotion/removal decision.
  perform 1
  from public.organizations organization
  where organization.id = p_organization_id
  for update;

  select membership.*
  into target_row
  from public.memberships membership
  where membership.id = p_membership_id
    and membership.organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Membership not found' using errcode = 'P0002';
  end if;

  if target_row.user_id = actor_id then
    raise exception 'Owners cannot change their own access' using errcode = 'P0001';
  end if;

  if p_action = 'update_role' then
    if p_role is null then
      raise exception 'A role is required' using errcode = '22023';
    end if;

    if target_row.role = 'owner' and p_role <> 'owner' and not exists (
      select 1
      from public.memberships other_owner
      where other_owner.organization_id = p_organization_id
        and other_owner.role = 'owner'
        and other_owner.id <> target_row.id
    ) then
      raise exception 'An organization must retain at least one owner' using errcode = 'P0001';
    end if;

    update public.memberships
    set role = p_role
    where id = target_row.id;

    insert into public.audit_logs (
      organization_id, actor_user_id, action, entity_type, entity_id, changed_fields, context
    ) values (
      p_organization_id,
      actor_id,
      'membership.role_changed',
      'membership',
      target_row.id::text,
      array['role'],
      jsonb_build_object('previous_role', target_row.role, 'new_role', p_role)
    );

    return jsonb_build_object('action', 'updated', 'role', p_role);
  elsif p_action = 'remove' then
    if target_row.role = 'owner' and not exists (
      select 1
      from public.memberships other_owner
      where other_owner.organization_id = p_organization_id
        and other_owner.role = 'owner'
        and other_owner.id <> target_row.id
    ) then
      raise exception 'An organization must retain at least one owner' using errcode = 'P0001';
    end if;

    delete from public.memberships where id = target_row.id;

    insert into public.audit_logs (
      organization_id, actor_user_id, action, entity_type, entity_id, changed_fields, context
    ) values (
      p_organization_id,
      actor_id,
      'membership.removed',
      'membership',
      target_row.id::text,
      array['access'],
      jsonb_build_object('previous_role', target_row.role)
    );

    return jsonb_build_object('action', 'removed');
  end if;

  raise exception 'Unsupported member action' using errcode = '22023';
end;
$$;

create or replace function public.manage_organization_member(
  p_organization_id uuid,
  p_membership_id uuid,
  p_action text,
  p_role public.membership_role
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.manage_organization_member(
    p_organization_id,
    p_membership_id,
    p_action,
    p_role
  )
$$;

revoke all on function private.manage_organization_member(uuid, uuid, text, public.membership_role) from public, anon;
revoke all on function public.manage_organization_member(uuid, uuid, text, public.membership_role) from public, anon;
grant execute on function private.manage_organization_member(uuid, uuid, text, public.membership_role) to authenticated;
grant execute on function public.manage_organization_member(uuid, uuid, text, public.membership_role) to authenticated;
