# GRX10 ERP — Claude Working Rules

## Regression Prevention Protocol (applies to ALL changes)

### Before any multi-file rewrite or redesign:
1. For each file you will touch, use Read/Grep to LIST current fields, handlers,
   route registrations, and UI sections.
2. Write the list explicitly before coding — do not rely on memory.
3. After the rewrite, compare your list against the new code.
4. Run: `npm run test`

### Before committing ANY change:
- Review your own diff: `git diff HEAD -- <file> | grep "^-"` — read every deletion.
- If you removed a UI field, constant, or handler: document why in the commit message.
- If deletion was unintentional: restore it before committing.

---

## Payslip Field Registry

### PaySlipDialog employee grid (`src/components/payroll/PaySlipDialog.tsx`)

| Must appear | Source |
|---|---|
| Employee ID | `profiles.employee_id` / `employee_details.employee_id_number` |
| Pay Period | `record.pay_period` (computed via `periodLabel()`) |
| Designation | `profiles.job_title` |
| Department | `profiles.department` |
| Gender | `employee_details.gender` |
| Location | `profiles.location` |
| Date of Joining | `profiles.join_date` / `employee_details.date_of_joining` |
| Working Days | `slip.workingDays` |
| Paid Days | `slip.paidDays` |
| LOP Days | `slip.lopDays` |
| PAN No | `employee_details.pan_number` |
| UAN No | `employee_details.uan_number` |
| Bank A/C No | `employee_details.bank_account_number` |
| IFSC Code | `employee_details.bank_ifsc` |

### INTENTIONALLY REMOVED — do not add back:
- **Bank Name** (removed in b9fe75f: was blank/unreliable; Bank A/C No is sufficient)
- **PF A/C No** (removed in redesign; UAN serves compliance purpose)
- **Authorized Signatory line** (removed by design; replaced with IT Act 2000 statutory notice)

### Payslip deduction column mapping (`src/lib/payslip-utils.ts`)
- `pf_deduction` → "PF Contribution"
- `tax_deduction` → "TDS"
- `other_deductions` → "Professional Tax" + "Other Deductions" combined; split on display
  using Karnataka PT slab (>₹15k → ₹200, >₹10k → ₹150); excess over PT shown as
  "Other Deductions" line item
- `transport_allowance` → "Incentives" (repurposed field — excluded from LOP base calculation)

### Back-calculation logic (legacy path, when only `net_pay` stored)
Derives PF = 12% of min(basic, 15000) or ₹1,800 ceiling + PT (Karnataka slab: >₹15k → ₹200)
with ±₹1 tolerance. Falls back to "Salary Deductions" catch-all when pattern doesn't match
(e.g. TDS-heavy records from old bulk upload template — re-upload to fix).

### Bulk upload invariants (`src/hooks/useBulkUpload.ts`)
- Consistency check: `pf + pt + tds + other_ded` must not EXCEED `total_deductions` (±₹2).
  When components are LESS than total, auto-fill PT (Karnataka slab) and absorb
  remaining gap into other deductions.
- Net pay cross-check: when Gross Earnings is explicitly provided (LWP already factored
  in), formula is `gross − total_deductions ≈ net_pay` (±₹5). When falling back to
  Monthly Fixed Salary, formula includes LWP: `gross − total_deductions − lwp ≈ net_pay`.
- "PF- optout" / "0" / missing all → `pf_monthly = 0` (`parseFloat → NaN → 0` is correct)

---

## User Management Invariants (`src/pages/Settings.tsx`)

- Deactivation MUST route through `initiateDeactivateOrDelete()` — shows manager
  reassignment dialog. Never call `deactivate_user` directly without this dialog.
- Activation of inactive users: call `activate_user` directly (no dialog needed).
- Role selector must include: `admin`, `manager`, `finance`, `hr`, `payroll`, `employee`
- Status select: `active`/`inactive` users get editable Yes/No; `on_leave` and
  `pending_approval` get read-only badge only

---

## Architecture Notes

### financial_records write rule (item 23)
`financial_records` rows with a non-null `journal_entry_id` are **owned by the trigger**
`trg_sync_financial_records` (migration 20260428180000). Do NOT write to these rows
directly from application code — the trigger recalculates them from `journal_lines`
on every journal_line INSERT/UPDATE. Only rows without a `journal_entry_id` (legacy
pre-GL records) may be written directly.

### Two payroll paths
1. **Legacy**: `payroll_records` with flat columns → `normalizeLegacyRecord()`
2. **Engine**: `payroll_entries` with `earnings_breakdown` / `deductions_breakdown` JSON
   → `normalizeEngineRecord()`

Both paths normalize to the same `NormalizedPayslip` shape via `normalizePayslip()`.

### Logo in payslip
GRX10 logo has a coloured background — MUST wrap in a white rounded container
when placed on the brand-colour header, otherwise it is invisible against the header.
- PDF/print HTML: `.co-logo-wrap { background: #fff; border-radius: 6px; padding: 5px 8px; }`
- React preview: `<div className="bg-white rounded p-1.5 flex items-center justify-center shrink-0">`

### Dark mode table rows
Do NOT hardcode `background: "#fff"` on table rows in React preview — this makes text
invisible in dark mode. Use conditional tint: `style={i % 2 !== 0 ? { background: tintBg } : undefined}`

### Organization data sources
- Brand color + legal name + address: `organization_compliance` table
  (`registered_address + state + pincode` → joined with `", "`)
- Fallback for company name: `organizations.name`

---

## Dual user_id / profile_id Audit (as of 2026-04-28)

Four tables carry both `user_id` (auth.users FK) and `profile_id` (profiles FK).
Status per table:

| Table | profile_id present? | Backfill migration | Remaining user_id usage |
|---|---|---|---|
| `attendance_records` | ✓ | 20260224051635 | None — all hooks use profile_id |
| `expenses` | ✓ | 20260224051635 (trigger) | None — `Expenses.tsx:175` queries profiles.user_id to LOOK UP profile_id, then uses profile_id for the insert |
| `payroll_records` | ✓ | pre-existing | None — all hooks use profile_id |
| `reimbursement_requests` | ✓ | pre-existing FK | `Reimbursements.tsx:115` queries `.eq("user_id", user.id)` for employee self-view — OK while user_id column exists; will break when item-36 drops it |

### Action required before dropping user_id (item 36, P2):
- `Reimbursements.tsx:115`: change to `.eq("profile_id", myProfileId)` where `myProfileId`
  is fetched once via `profiles.user_id = user.id`. Verify all `reimbursement_requests` rows
  have non-null `profile_id` before this migration runs.

---

## Address Field Standard (item 43)

All **new** tables must use the following address columns — never a single `address` text field:

```sql
address_line1  TEXT,
address_line2  TEXT,            -- optional
city           TEXT NOT NULL,
state          TEXT NOT NULL,   -- full state name (e.g. "Karnataka")
pincode        TEXT NOT NULL,   -- 6-digit postal code
country        TEXT NOT NULL DEFAULT 'India',
```

`state_code` (e.g. "KA") is a GST-specific derived column that should be computed from `state` when needed for e-invoice/GSTN APIs — it is NOT a stored column on address tables.

**Logo field location**
- `organization_settings.logo_url` is the canonical location. `organization_compliance` has no logo_url column and should not receive one.
- The ARCHITECTURE.md note about "Brand color + legal name + address: organization_compliance" refers only to branding colors and legal entity identity fields, NOT the logo image.

---

## Running Tests
```
npm run test          # all test files via Vitest
```
Key file: `src/test/payslip-utils.test.ts` (normalizeLegacyRecord + normalizeEngineRecord)
