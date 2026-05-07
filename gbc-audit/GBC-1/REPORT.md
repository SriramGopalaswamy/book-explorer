# GBC-1: Hooks doing business logic in browser (move to RPCs)

**Severity:** High · **Category:** Cross-cutting — Frontend Architecture · **Status:** needs-input
**Branch:** `claude/execute-code-prompt-txEjJ` · **Jira:** https://grx10.atlassian.net/browse/GBC-1

## Root cause

Issue lists `useBulkUpload.ts`, `usePayrollEngine.ts`, `useLeaves.ts`, `useManufacturing.ts` as hooks that perform business-critical computation (CSV parsing, statutory deductions, leave-balance math, BOM explosion) in the browser. Spot-check confirms: `src/hooks/useBulkUpload.ts` is 53KB and contains the full bulk-upload validation pipeline (PF/PT/TDS reconciliation, net-pay cross-check) per CLAUDE.md's bulk upload invariants section. The whole class is "client-side as the source of truth" — fragile under concurrency, bypassable by an attacker hitting Supabase REST directly with a forged payload.

## Council verdict (compressed)

- *Contrarian:* Some browser logic is fine when it's UX-only (preview a CSV before upload, surface validation errors). Distinguish *advisory* from *authoritative* logic; only the latter must move.
- *First-Principles:* For multi-tenant ERP, the database is the only honest authority. Authoritative business rules (deduction math, balance arithmetic, atomicity around inventory) must be expressed as Postgres functions or stored-proc-style edge functions; the browser is purely a thin client.
- *Expansionist:* The pattern repeats far beyond the four named hooks. Most `src/hooks/use*.ts` files contain at least *some* normalisation/business logic.
- *McKinsey:* Highest blast radius first: payroll engine (PF/PT/TDS — directly affects compensation), manufacturing (concurrency on stock), leaves (balance integrity). Defer bulk-upload validation (already best-effort and re-validated in DB triggers per CLAUDE.md).
- *Executor:* Per-hook, write the equivalent Postgres function or RPC, change the hook to call it, keep the JS as fallback only for offline-style preview. Add a feature-flagged cutover.

**Chosen approach (deferred under directive (b)):** Pure code refactor across 4+ hooks plus new RPCs. Status `needs-input`.

## What changed
Nothing on this branch.

## What didn't change (needs-input — per-hook plan)

| Hook | Move-to-DB target | Atomicity concern |
|---|---|---|
| `useBulkUpload.ts` | A `bulk_upload_validate(payload jsonb)` RPC + `bulk_upload_apply(...)` RPC, both with full per-row error reporting. The reconciliation rules in CLAUDE.md (`pf+pt+tds+other_ded ≤ total_deductions`) are the spec. | None — read-only validation; apply is per-row insert. |
| `usePayrollEngine.ts` | Existing `payroll_entries.earnings_breakdown / deductions_breakdown` JSON should be computed by a `payroll_compute(period, profile_id)` SQL function. | Must run inside a transaction with `payroll_records` to preserve invariants. |
| `useLeaves.ts` | `leave_balance(profile_id, leave_type, as_of date)` SQL function; carry-forward via cron job rather than client recompute. | Idempotency on apply. |
| `useManufacturing.ts` | `consume_materials(work_order_id, jsonb_lines)` RPC with `SELECT … FOR UPDATE` on stock rows. | Concurrent "Start Production" → row-level lock. |

## Risks
1. Mass refactor — at least one regression bug per hook is likely. Stage behind feature flags.
2. Tax/statutory rules differ by FY; current JS calculators encode behaviour; replicate test cases against the SQL implementations before cutover.
3. Lint/build/test could not run in this sandbox.
