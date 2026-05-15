## Skipped (with reason)

| Issue | Reason |
|---|---|
| **KAN-767** Currency inversion | Already implemented. `src/lib/currency.ts::convertToBase` multiplies, has guards, has passing tests (`src/test/currency-conversion.test.ts`). No-op. |
| **KAN-768** Admin delete adjustments | `inventory_adjustments` table doesn't exist in this project. The closest table follows the Draft/Approved/Posted count workflow (`mem://features/inventory/integrity-rules`); needs separate clarification before any policy work. |
| **GBC-78** Payslip server math + sync trigger | Direct conflict with project memory. There is no `payslips` / `payslip_line_items` table; `payroll_entries` already has `gross_earnings`, `total_deductions`, `net_pay` columns, populated by the engine. Adding the prompted parallel write path violates the payroll-consolidation rule we just locked in. The valid sub-parts (dispute window + privacy mask + pagination) I will fold into a smaller GBC-78-lite if you ask. |
| **GBC-89** Reimbursement → expense | `reimbursement_requests` already has `expense_id`; `mem://features/reimbursement/workflow-and-accounting-sync` documents auto-creation with atomic rollback in the application hook. The data shows 2/7 rows already linked. Risk of double-creating expenses if I add a trigger today. Will instead audit & fix the inconsistent rows in a follow-up if you confirm. |

## Will implement (8 issues, 2 sprints, real schema)

### Sprint A — DB migrations (one combined file)

1. **GBC-9 / GBC-71 / GBC-77 — Timezone + canonical attendance write**
   - Add `organizations.tenant_timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata'`.
   - Index `attendance_records(organization_id, date DESC)`.
   - View `attendance_daily_summary` over `attendance_records` (real cols: `profile_id`, `date`, `check_in`, `check_out`) joined to `organizations.tenant_timezone`. Status = `complete | check_out_missing | absent_unconfirmed`.
   - View `attendance_pending_review` joining `profiles` (real cols: `full_name`, `is_deleted`).
   - Table `attendance_corrections` (profile_id, work_date, corrected_check_in/out, reason, status, RLS on org).
   - RPC `submit_attendance_correction(...)`.
   - Audit `cron.job` and any triggers that auto-insert "absent" rows; drop if found.

2. **GBC-72 — Leave overlap + LOP + gender eligibility**
   - Pre-flight overlap probe on existing `leave_requests` (real cols: `from_date`/`to_date`, `profile_id`, `leave_type` text). Report any conflicts; only then add `prevent_leave_overlap` BEFORE INSERT/UPDATE trigger.
   - Table `payroll_lop_flags(profile_id, organization_id, month_year, lop_days, leave_request_id)` + UNIQUE constraint + RLS.
   - Function `flag_lop_on_approval` keyed off `leave_types.key` matching configured unpaid types (since `leave_types` has no `is_paid` column — will use `key IN ('lop','lwp','unpaid')` plus configurable list).
   - RLS policy `leave_gender_eligible` calling helper `leave_type_gender_eligible(leave_type text, profile_id uuid)` that reads `leave_types.gender_eligibility` (real text col, values: `all|male|female`) and `profiles` gender (will be looked up via `employee_details` table; verify in implementation).

3. **GBC-74 — Holiday → payroll staleness**
   - Add `payroll_runs.working_days_stale BOOLEAN DEFAULT false`.
   - Trigger `holiday_payroll_sync` AFTER INSERT/UPDATE/DELETE on `holidays`, marks open `payroll_runs` overlapping the holiday date as stale.

4. **GBC-70 — Circular manager guard**
   - Run D12 cycle probe on `profiles.manager_id` first; halt + report if any cycles exist.
   - Add `prevent_circular_manager` BEFORE INSERT/UPDATE on `profiles` with bounded recursive CTE + CYCLE detection.

5. **GBC-86 — Bulk vendor payment**
   - Table `bill_payment_lines(vendor_payment_id, bill_id, amount_applied)` + RLS + `validate_payment_line_total` trigger preventing over-application.

### Sprint B — Frontend changes

6. **GBC-9 / 71 / 77 — `useAttendance.ts` + `useMyAttendance` (Attendance.tsx + MyAttendance.tsx)**
   - Switch check-in/out writes to standard insert against real schema (no RPC needed since project uses one row/day with check_in/check_out columns, not event log). Validate night-shift duration with `+86_400_000` adjustment.
   - Add Pending Review tab to `Attendance.tsx` querying `attendance_pending_review` view.
   - Use `submit_attendance_correction` RPC from a new "Request Correction" dialog in MyAttendance.

7. **GBC-72 — `useLeaves.ts`**
   - Translate `LEAVE_OVERLAP` exception to toast. Translate gender-eligibility RLS denial to a clear toast.
   - HR all-leaves view: server-side `.range()` pagination (already partially via `usePagination`; verify).

8. **GBC-74 — `Holidays.tsx`**
   - Show "Recalculate" banner on payroll runs flagged stale.
   - Add "Clone from previous year" action using safe `Date.setFullYear`.

9. **GBC-70 — `Employees.tsx` / `usePaginatedEmployees.ts`**
   - Already paginated — verify `placeholderData: prev`, `count: 'exact'`, search via `ilike`. Add Finance-role PII mask in select string for sensitive cols on `employee_details`.
   - Bulk upload dry-run flag (already exists per `mem://features/hrms/employee-management`; verify and surface preview UI if missing).
   - Surface BE `CIRCULAR_MANAGER` errors as toasts.

10. **GBC-75 — `OrgChart.tsx`**
    - Audit current implementation (already exists — DO NOT rewrite blind per project Regression Prevention Protocol).
    - If it loads the entire tree, refactor to incremental: single `useDirectReports(managerId|null)` hook in `src/hooks/useOrgChart.ts`. Remove email/phone from tooltip. Auto-expand max 2 levels. Render "Data error" badge if a node trips the manager guard.

11. **GBC-86 — `Bills.tsx`**
    - Multi-select checkboxes on unpaid bill rows. Disable when selection spans multiple `vendor_id`s. "Pay Selected (₹X)" button creates one `vendor_payments` row + N `bill_payment_lines`, marks bills paid, invalidates queries.

## Sequencing

```text
Sprint A (single migration file, ~200 LOC SQL)
   pre-flight probes (overlap + cycle) ───►  pause if data dirty, report
                                                         │
                                                         ▼
                          all 5 DB migrations run together
                                                         │
                                                         ▼
Sprint B (per-issue frontend PRs, no cross-file dependencies)
   GBC-9/71/77  ─┐
   GBC-72       ─┤
   GBC-74       ─┼─►  npm run test  ─►  tsc --noEmit
   GBC-70       ─┤
   GBC-75       ─┤
   GBC-86       ─┘
```

## Guardrails I will enforce

- No new write path to `payroll_records` / `payroll_entries` (memory rule).
- Every new mutation explicitly injects `organization_id` (Core rule).
- Every new RLS policy uses `is_admin_in_org` / org-scoped subquery — no `auth.uid()` recursion.
- `e.stopPropagation()` on every new table action cell.
- Pre-flight probes (D12 cycle, leave overlap) run as `read_query` before migration; abort + report if dirty data present.
- `mem://` updated for: timezone column, attendance_corrections, payroll_lop_flags, bill_payment_lines, holiday staleness, circular-manager guard.

## Final verification (per prompt)

After everything: run the 11 verification SELECTs from the prompt, plus `npm run test` and `tsc --noEmit`. Report any failure before closing.

## Risks & open questions

- **Profile gender field**: `profiles` has no `gender` column — it lives on `employee_details`. Will JOIN in `leave_type_gender_eligible`. Confirm before merge.
- **`leave_types.is_paid` absent**: Will key LOP detection on `leave_types.key IN ('lop','lwp','unpaid')`. If you have an explicit unpaid flag elsewhere, tell me.
- **Existing manager cycles** (D12): if probe returns rows, I stop and surface them — won't auto-fix.
- **Inferred-absence cron** (D15): if the `cron` extension isn't installed, I'll grep edge functions and DB triggers instead.

Approve and I'll proceed Sprint A → Sprint B in that order, pausing only if a pre-flight probe reports dirty data.
