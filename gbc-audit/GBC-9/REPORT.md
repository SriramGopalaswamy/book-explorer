# GBC-9: Timezone shift in attendance & time-sensitive flows

**Severity:** Low · **Category:** Cross-cutting — Security & Multi-tenancy · **Status:** needs-input

## Root cause
Frontend uses browser local time for late-mark calculation; database uses `timestamptz` but no `tenant_timezone` column. A user in Dubai working IST hours is mis-marked. Affects `useAttendance`, `useLeaves`, `usePayrollEngine`, `useInvoices` (due-date aging), audit/state machine timestamps.

## Council verdict (compressed)
- *Contrarian:* For a single-tenant in a single timezone, browser time is fine. The issue only matters at multi-region scale.
- *First-Principles:* "Office time" is a business-domain concept, not a UI one. The DB needs an `organization.tenant_timezone` (e.g. `Asia/Kolkata`); all calculations server-side use `AT TIME ZONE` against that column.
- *Expansionist:* Frontend formatting needs tenant_timezone too — display "10:00 AM IST" regardless of viewer.
- *McKinsey:* Add the column + propagate to attendance and payroll first; defer invoice aging (less acute).
- *Executor:* Migration adds `organizations.tenant_timezone text NOT NULL DEFAULT 'Asia/Kolkata'`; cutover triggers and SQL functions to use `AT TIME ZONE org.tenant_timezone`; expose to frontend via session-context; format with `formatInTimeZone(date, tenantTz)`.

## Status
needs-input — schema + per-table rewrites + UI formatting changes.

## Risks
1. Cutover migration may shift historical timestamps' apparent times. Test against representative data.
2. DST-using zones bring edge cases (clock-in straddling spring-forward). India is DST-free; reduces risk.
3. Lint/build/test could not run in this sandbox.
