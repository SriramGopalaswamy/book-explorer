# GBC-11: State synchronisation lag (no Supabase Realtime)

**Severity:** Low · **Category:** Cross-cutting — Performance & Reliability · **Status:** needs-input

## Root cause
Long-running operations (Generate Payroll, Bulk Upload, Year-End Closing) run server-side without a frontend live channel. Users wait blindly, click "Generate" again, trigger duplicate jobs.

## Council verdict (compressed)
- *Contrarian:* Add idempotency at the RPC level (single-flight per org+period). Realtime is a UX nicety; idempotency is the *correctness* fix.
- *First-Principles:* Long-running work needs a job table + status; UI subscribes via `supabase.channel()` for status updates.
- *Expansionist:* Same pattern needed for payroll, manufacturing WO, year-end close, bulk upload.
- *McKinsey:* Both: idempotency (correctness, MUST) + realtime updates (UX, SHOULD). Do idempotency first.
- *Executor:* Add `job_runs(id, kind, org_id, status, created_by, started_at, finished_at, error)` table with RLS; per-job RPC inserts a job_run, returns id immediately, runs in background; UI subscribes to `postgres_changes` on `job_runs WHERE id = $1`.

## Status
needs-input — schema + RPC + realtime channel + UI.

## Risks
1. Realtime adds Supabase costs; restrict subscription scope.
2. Idempotency requires job_runs unique key on (kind, org_id, period) — pick correctly per job kind.
3. Lint/build/test could not run in this sandbox.
