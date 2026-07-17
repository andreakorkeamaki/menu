-- Failed imports keep their source in the private intake bucket. Claiming a retry
-- must be atomic so double clicks cannot launch two OpenAI responses for one job.

create or replace function private.claim_menu_import_retry(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job_row public.ai_jobs%rowtype;
  next_attempt integer;
begin
  if not private.is_operator() then
    raise exception 'Only platform operators can retry import jobs' using errcode = '42501';
  end if;

  select job.*
  into job_row
  from public.ai_jobs job
  where job.id = p_job_id and job.kind = 'menu_import'
  for update;
  if not found then
    raise exception 'Menu import job not found' using errcode = 'P0002';
  end if;

  if job_row.status not in ('failed', 'cancelled') then
    raise exception 'Only failed imports can be retried' using errcode = 'P0001';
  end if;
  if greatest(job_row.attempts, 1) >= 3 then
    raise exception 'Import retry limit reached' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.menu_import_staging staging
    where staging.ai_job_id = job_row.id
  ) then
    raise exception 'An import with review data cannot be retried' using errcode = 'P0001';
  end if;
  if job_row.onboarding_case_id is null
     or job_row.menu_id is null
     or job_row.input_file_path is null
     or coalesce(job_row.input ->> 'storage_bucket', '') <> 'intake'
     or coalesce(job_row.input ->> 'filename', '') = ''
     or coalesce(job_row.input ->> 'parser', '') not in ('csv', 'xlsx', 'openai') then
    raise exception 'Import job source metadata is incomplete' using errcode = '23514';
  end if;

  next_attempt := greatest(job_row.attempts, 1) + 1;
  update public.ai_jobs job
  set status = 'queued',
      attempts = next_attempt,
      response_id = null,
      output = null,
      error = null,
      usage = null,
      started_at = null,
      completed_at = null,
      input = job.input - 'openai_file_id',
      updated_at = now()
  where job.id = job_row.id;

  update public.onboarding_cases onboarding
  set status = 'importing',
      source_file_path = job_row.input_file_path,
      updated_at = now()
  where onboarding.id = job_row.onboarding_case_id
    and onboarding.organization_id = job_row.organization_id;

  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, changed_fields, context
  ) values (
    job_row.organization_id,
    (select auth.uid()),
    'ai_job.retry_claimed',
    'ai_job',
    job_row.id::text,
    array['status', 'attempts', 'response_id'],
    jsonb_build_object('attempt', next_attempt)
  );

  return jsonb_build_object(
    'job_id', job_row.id,
    'organization_id', job_row.organization_id,
    'onboarding_case_id', job_row.onboarding_case_id,
    'menu_id', job_row.menu_id,
    'attempt', next_attempt,
    'source_path', job_row.input_file_path,
    'source', job_row.input
  );
end;
$$;

create or replace function public.claim_menu_import_retry(p_job_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select private.claim_menu_import_retry(p_job_id) $$;

revoke all on function private.claim_menu_import_retry(uuid) from public, anon;
revoke all on function public.claim_menu_import_retry(uuid) from public, anon;
grant execute on function private.claim_menu_import_retry(uuid) to authenticated;
grant execute on function public.claim_menu_import_retry(uuid) to authenticated;
