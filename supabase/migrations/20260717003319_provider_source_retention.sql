-- OpenAI receives a temporary working copy of private menu sources. Keep the
-- canonical intake object in Supabase, but record and remove the provider copy
-- as soon as the response reaches a terminal state.

alter table public.ai_jobs
add column if not exists provider_file_released_at timestamptz;

create or replace function public.mark_ai_source_file_released(
  p_job_id uuid,
  p_file_id text
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  with released as (
    update public.ai_jobs job
    set input = case
          when job.input ->> 'openai_file_id' = p_file_id
            then job.input - 'openai_file_id'
          else job.input
        end,
        provider_file_released_at = now(),
        updated_at = now()
    where job.id = p_job_id
      and job.kind = 'menu_import'
      and (
        job.input ->> 'openai_file_id' = p_file_id
        or not (job.input ? 'openai_file_id')
      )
    returning true
  )
  select coalesce((select true from released limit 1), false)
$$;

revoke all on function public.mark_ai_source_file_released(uuid, text)
from public, anon, authenticated;
grant execute on function public.mark_ai_source_file_released(uuid, text)
to service_role;
