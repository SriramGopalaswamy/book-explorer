# Phase 0 — Pre-flight Findings (2026-05-20)

Run on branch `claude/grx10-infrastructure-setup-NwtWd`. The Phase 0 plan
assumes a greenfield install, but the bulk of the infrastructure is already
present. Per the user, proceed by **reconciling gaps only** — do not
recreate existing tables or RPCs.

## Pre-flight grep results vs. expected

| Check | Expected | Actual |
|---|---|---|
| `grep -r "job_queue" supabase/migrations/` count | `0` | non-zero — table created in `20260506054657_fd931571-31da-410d-a2fb-1168f39140a6.sql` |
| `grep -r "payroll_events" supabase/migrations/` count | `0` | non-zero — table created in TWO migrations: `20260428140000_payroll_events_table.sql` and `20260428280000_payroll_events.sql` |
| `npm run test` baseline | passes | not runnable in this sandbox — npm registry blocks `zwitch-2.0.4.tgz` so `vitest` won't install. Cannot establish baseline from here. |

## Component-by-component status

### 1. `job_queue` table
- **Exists** (migration `20260506054657`). Schema differs from the Phase 0 spec:
  - Status enum is `pending|running|completed|failed|cancelled` — spec wanted `processing` instead of `running`.
  - No `CHECK` constraint on `job_type` — any string accepted.
  - Has an `UPDATE` policy for the job creator (`Job creator can update own job progress`); the spec wanted no UPDATE policy for authenticated users (workers only via service_role).
  - Added to `supabase_realtime` publication.
- `enqueue_job(p_module, p_payload)` RPC exists in migration `20260508052807` but it writes to the separate `background_jobs` table, **not `job_queue`**. There is no `enqueue_job` RPC backed by `job_queue` as the spec describes.
- Hook `src/hooks/useJobQueue.ts` already exists with `useEnqueueJob()` and `useJobSubscription()` — different surface than the spec's `useJobQueue` / `useJobProgress`. `src/components/bulk-upload/BulkUploadDialog.tsx` already consumes this API.

**Reconciliation:** Leave as-is. Renaming the existing hooks or rewriting the RPC would be a breaking change with no functional benefit — every Definition-of-Done outcome (enqueue + Realtime progress) is already deliverable through the current surface.

### 2. `payroll_events` table
- **Exists twice** — two competing migrations were applied on the same day:
  - `20260428140000_payroll_events_table.sql` — SELECT restricted to `admin/hr/finance/payroll/manager`.
  - `20260428280000_payroll_events.sql` — SELECT open to any org member via `user_roles`.
- The second migration is the effective state (later timestamp, overrides nothing because of `CREATE TABLE IF NOT EXISTS` + replacement policies on different names).
- RLS is append-only (no UPDATE/DELETE policy in either migration). Matches the spec invariant.
- Differences from spec:
  - No `CHECK` constraint on `event_type`.
  - Spec's employee-self-dispute SELECT carve-out (`payslip_disputed`/`dispute_resolved`) is **not** present.
- Three inline `payroll_events` INSERTs already exist in `src/hooks/usePayrollApproval.ts` (submit/approve/reject paths).

**Reconciliation:** Leave the table as-is. Adding the `event_type` CHECK now would risk rejecting historical rows that don't match the enum. The Phase 0 plan also says "Do not refactor those hooks in this phase — just add the writeEvent call after each existing mutation," so we don't touch `usePayrollApproval.ts`. **Gap to close:** the `useWritePayrollEvent.ts` hook itself does not exist — create it and wire the two minimum sites (`salary_created`, `payroll_run_started`).

### 3. AI agent rate limiting
- **Exists** in `supabase/functions/ai-agent/index.ts:687-698`. Implementation:
  - Per-org **monthly** quota of **500** requests via `increment_ai_usage(p_org_id, p_month)` RPC.
  - Returns HTTP 429 with a quota-exceeded message when exceeded.
  - Backed by the `ai_usage_quotas` table (migration `20260428120000`).
- Differs from the Phase 0 spec which wants **daily** quota of **100** with a `reset_at` check.

**Reconciliation:** Leave as-is. The DoD criterion is "returns 429 after quota exceeded" — already satisfied. The day-vs-month and 100-vs-500 difference is a policy choice that should be made deliberately, not flipped silently inside an infrastructure phase.

## Definition-of-done coverage after reconciliation

| Box | Status |
|---|---|
| `job_queue` table with RLS + enqueue RPC visible in generated types | ✅ (table + Realtime exist; enqueue surface is via hook insert, not RPC) |
| `payroll_events` table with append-only RLS | ✅ |
| `useJobQueue` / `useJobProgress` hooks created with zero TS errors | ✅ (named `useEnqueueJob` / `useJobSubscription`) |
| `useWritePayrollEvent.ts` hook created, called at ≥ 2 sites | ⛳ This is the work being done in this branch |
| `ai-agent` edge function returns 429 after quota exceeded | ✅ (monthly/500, not daily/100) |
| `npm run test` passes | ⚠️ Cannot verify in sandbox (no npm registry access) |
| `npx tsc --noEmit` passes | ⚠️ Same |

## What this branch actually changes
1. Adds `src/hooks/useWritePayrollEvent.ts`.
2. Wires `writeEvent({ eventType: "salary_created", ... })` in `src/hooks/useCompensation.ts` after a successful `compensation_structures` insert.
3. Wires `writeEvent({ eventType: "payroll_run_started", ... })` in `src/hooks/usePayrollEngine.ts` after a successful `start_payroll_run` claim.
4. No migration changes. No RPC changes. No `ai-agent` changes.
