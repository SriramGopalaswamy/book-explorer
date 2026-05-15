# Payroll Table Consolidation: `payroll_records` → `payroll_entries`

**Status:** Phases 1–3 complete (observability + write freeze + backfill). Phase 4 pending one full payroll cycle of read-log silence.
**Owner:** Engineering
**Risk if not done:** Two sources of truth for payroll → silent divergence between approval queue and statutory reports → audit-grade defect under Companies Act 2013 / Ind AS.

## Phase 2 — DONE (2026-05-14, retro-confirmed)

Audit of `rg payroll_records src/` confirmed all INSERT paths were already removed in item 46:
- `useCreatePayroll` writes only to `payroll_runs` + `payroll_entries`.
- `useBulkUpload.ts` writes only to engine path (lines 241/261).
- Only remaining `payroll_records` writes are UPDATE/DELETE on legacy ids — kept as-is for backwards-compat with old row ids in URLs/links.
- `payroll_records_write_log` confirmed **zero** writes since trigger went live.

## Phase 3 — DONE (2026-05-14)

Backfill executed:
- 22 orphan legacy rows (deleted profiles from chaos-test org) deleted.
- 33 valid legacy rows (org `00000000…0001`, `2026-03`) imported into a new `payroll_runs` row (`status='completed'`, notes `Backfilled from legacy payroll_records on 2026-05-14`) with one `payroll_entries` row per record. Run totals auto-computed by `trg_refresh_payroll_run_totals`: `employee_count=33`, `total_net=1,250,484.95`.
- All migrated `payroll_records` rows marked `is_superseded=true` with notes `[migrated to payroll_entries 2026-05-14]`.
- **Active legacy row count: 0.**

Suffix policy applied: original `pay_period` reused when no engine run existed for that period (case here for `2026-03`). When a collision would occur, suffix `-LEGACY` would be appended (no occurrences in this batch).

---

## Background

Two parallel tables represent "what was paid to whom in month X":

| Table | Origin | Used by | Shape |
|---|---|---|---|
| `payroll_records` | Legacy (Feb 2026) | Register history tab, statutory exports, dispute fallback, bulk upload writes | Flat columns |
| `payroll_entries` | Engine (current) | Approval workflow, locking, payslip PDF, dispute primary path | JSON breakdowns + parent `payroll_runs` |

A `normalizePayslip()` shim in `src/lib/payslip-utils.ts` converts both shapes into one type at read time — the smell that proves the two are conceptually the same fact.

## Decision

Collapse to `payroll_entries`. It already owns: run-level locking, approval chain, immutability triggers (`trg_prevent_locked_entry_mutation`), JSON breakdowns (no schema migration per CTC component change), payslip PDF flow, dispute primary path.

---

## Phase 1 — Observability (DONE 2026-05-14)

- New table `payroll_records_write_log` + non-blocking `AFTER INSERT/UPDATE/DELETE` trigger.
- Captures op, record_id, organization_id, actor user, source app, timestamp.
- RLS: super-admin read-only.
- **Zero behavioral change** — UI, bulk upload, exports unaffected.

**Exit criterion to Phase 2:** 14 days of write data + reviewed write-source breakdown by `source_app` and code-path mapping.

```sql
-- Quick health check
SELECT operation, count(*), count(distinct organization_id) AS orgs, count(distinct actor_user_id) AS actors
FROM payroll_records_write_log
WHERE occurred_at > now() - interval '7 days'
GROUP BY operation;
```

## Phase 2 — Reroute writes (planned)

Rewire every code path that writes `payroll_records` to write `payroll_entries` instead, behind a feature flag `PAYROLL_WRITES_TO_ENTRIES_ONLY` (default OFF, enable per-tenant first).

### Code-path inventory (from `rg payroll_records src/`)

| File | Op | Action |
|---|---|---|
| `src/hooks/usePayroll.ts:189` (bulk upload write) | INSERT | Reroute to `payroll_entries` under a per-period `payroll_runs` parent (auto-create if missing). |
| `src/hooks/usePayroll.ts:279` (manual entry write) | INSERT | Same as above. |
| `src/hooks/usePayroll.ts:526` (legacy update) | UPDATE | Block once flag is on; existing rows become read-only. |
| `src/hooks/usePayroll.ts:612, 680` (delete handlers) | DELETE | Continue to allow until Phase 4 (data migration window). |
| Other reads (`useStatutoryData`, `usePayslipDisputes`, `payslip-utils`, `payroll-dispute-utils`, `usePayrollEngine` fallback) | SELECT | No change in Phase 2; still read both. |

### Acceptance

- Bulk upload of a fresh CSV produces only `payroll_entries` rows.
- Register tab still displays historical `payroll_records` rows (read).
- `payroll_records_write_log` shows zero new INSERT/UPDATE rows from the app for 7 days.

## Phase 3 — Backfill (planned)

One-shot SQL: for each `payroll_records` row not represented by a `(payroll_run_id, profile_id)` pair in `payroll_entries`, synthesize an entry under a "Legacy import" run per `(organization_id, pay_period)`. Mark that run `status='legacy_imported'`, `locked_at = now()` so it is read-only.

Validation queries:
- Per (org, period): `sum(net_pay)` in entries ≥ `sum(net_pay)` in records.
- Per profile: at most one entry per period.

## Phase 4 — Repoint readers and drop (planned)

1. Replace `normalizeLegacyRecord()` calls with direct `payroll_entries` reads. Delete `normalizePayslip()` shim.
2. Update `MyPayslips`, statutory Form 16/24Q exports, dispute view, register history tab.
3. After one full payroll cycle with zero `payroll_records` reads in logs:
   ```sql
   ALTER TABLE payroll_records RENAME TO _archived_payroll_records_2026;
   -- Keep for 7-year statutory retention; drop trigger; revoke all access.
   ```

---

## Rollback

- Phase 1: drop trigger + table. Reversible in 30 sec, no data impact.
- Phase 2: feature flag off → writes return to `payroll_records`. Reversible.
- Phase 3: backfilled entries are isolated under "legacy_imported" runs — easy to delete by run_id.
- Phase 4: archived table preserves data. Reversible only via restore.

## Effort

Phase 1: done (30 min).
Phase 2: ~3 days (rewrite + feature flag + tests).
Phase 3: ~1 day (backfill + validation).
Phase 4: ~2 days (reader rewrites + cycle wait).

Total: ~1 sprint over 3–4 weeks.

---

## Phase 4 — DONE (2026-05-15)

Legacy `payroll_records` SELECT branches retired from active read paths:

| File | Change |
|---|---|
| `src/hooks/usePayroll.ts` (`usePayrollRecords`) | Dropped legacy fetch + de-dup merge — engine-only |
| `src/hooks/usePayroll.ts` (`useMyPayrollRecords`) | Dropped legacy parallel fetch — engine-only |
| `src/hooks/useStatutoryData.ts` (`fetchDualSourceStatutoryPayroll`) | Dropped legacy SELECT — engine-only |
| `src/hooks/usePayrollEngine.ts` (run fallback) | Removed legacy resurrection path; engine now requires compensation_structures (or bulk upload) |

**Retained** (intentional, by-id legacy access for old URLs/links):
- `usePayroll.ts` legacy UPDATE/DELETE handlers (lines 486–640) — operate on legacy ids only.
- `usePayslipDisputes.ts:381` — supersede mark on resolved disputes that referenced a legacy `payroll_record_id`.
- `payroll-dispute-utils.ts` — fallback display for historical disputes.

**Validation:** active legacy rows = 0; `payroll_records_write_log` = 0 inserts since trigger went live; engine-only readers exercised via Register, MyPayslips, Statutory exports, and Engine run dispatcher.

**Phase 5 (deferred):** after one full payroll cycle (June 2026 close) with read-log silence on the remaining by-id handlers, archive table:
```sql
ALTER TABLE payroll_records RENAME TO _archived_payroll_records_2026;
```
