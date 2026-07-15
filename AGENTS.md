# MenuInterattivo engineering guide

## Architecture

- Next.js App Router renders the public restaurant site and the authenticated dashboards.
- Supabase is the source of truth for Auth, Postgres and Storage.
- Every tenant-owned row carries `organization_id`; authorization is enforced by RLS, never only in React.
- Draft menu rows are normalized. Public pages read immutable `menu_publications.snapshot` records only.
- OpenAI calls are server-only, persisted as `ai_jobs`, schema-validated and always reviewed before publication.
- `AppOrdini` is a separate product. Do not import it at runtime or modify its repository.

## Security rules

- Never expose secret/service keys or OpenAI keys through `NEXT_PUBLIC_*` variables.
- Never authorize with `user_metadata`; tenant roles come from `memberships` and platform access from `platform_staff`.
- New exposed tables require RLS, explicit grants, indexed policy columns and cross-tenant pgTAP coverage.
- Security-definer helpers live in the unexposed `private` schema with an empty `search_path`.
- Intake documents stay private. Only approved restaurant media may be public.

## Commands

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
supabase db reset
npm run db:test
```

## Conventions

- Use server components for public data and client components only for interaction.
- Keep feature components small; do not create a monolithic dashboard.
- Mutations validate input with Zod and return a typed action result.
- Any source-text edit must update translation freshness; manual translations are never overwritten silently.
- Every bug fix adds a regression test at the lowest useful layer.
