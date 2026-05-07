# GBC-13: Audit logging for data exports

**Severity:** High · **Category:** Cross-cutting — Security & Multi-tenancy · **Status:** needs-input
**Branch:** `claude/execute-code-prompt-txEjJ` · **Jira:** https://grx10.atlassian.net/browse/GBC-13

## Root cause

Edits to data are audited via existing triggers and `audit_logs` table; exports (PDF, CSV, statutory file generation) are not. A user with broad read permissions can exfiltrate complete employee/financial datasets without leaving a trail. Hooks and pages that perform exports include `usePdfExport`, `useDataExport`, `src/hooks/useStatutoryData.ts` (gstr1, gstr3b, tds24q/26q, pf_ecr, esi, prof_tax — all Excel/CSV), `src/components/payroll/PaySlipDialog.tsx` (PDF), payslip PDF exports, etc.

## Council verdict (compressed)

- *Contrarian:* Logging every export is noisy and potentially counter-productive (huge audit volume); make it opt-in per export type with a clear retention policy.
- *First-Principles:* Define an `export_event` log: who, when, what entity (table + filter predicate), how many rows, what format. One row per export.
- *Expansionist:* Cover both client-side exports (`usePdfExport`, `useDataExport`) and server-side ones (statutory data RPCs, edge functions producing files).
- *McKinsey:* Highest-value targets first — payslips, GSTR exports, employee data exports. Defer workflow file downloads.
- *Executor:* Two-part change: (a) new `export_audit_log` table with RLS limiting reads to admin/HR/finance and orgId-scoped INSERTs; (b) wrapper hook `useExportAuditLogger()` that all export call-sites must invoke just before the file is delivered.

**Chosen approach (deferred under directive (b)):** Pure code change — needs new migration + new hook + 10–15 call-site touches. Status `needs-input`.

## What changed
Nothing on this branch.

## What didn't change (needs-input)

1. **New migration** (suggested filename `20260520_export_audit_log.sql`):
   ```sql
   CREATE TABLE public.export_audit_log (
     id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     organization_id uuid NOT NULL REFERENCES public.organizations(id),
     user_id         uuid NOT NULL REFERENCES auth.users(id),
     entity          text NOT NULL,                  -- e.g. 'gstr1', 'payslip', 'employees'
     entity_filter   jsonb,                          -- the search/from-to predicate
     row_count       integer,
     file_format     text NOT NULL,                  -- 'pdf', 'csv', 'xlsx', 'json'
     created_at      timestamptz NOT NULL DEFAULT now()
   );
   ALTER TABLE public.export_audit_log ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "users insert own org export events"
     ON public.export_audit_log FOR INSERT
     WITH CHECK (organization_id = get_user_organization_id(auth.uid())
                 AND user_id = auth.uid());
   CREATE POLICY "admins read org export events"
     ON public.export_audit_log FOR SELECT
     USING (is_admin_or_hr(auth.uid())
            AND organization_id = get_user_organization_id(auth.uid()));
   ```
2. **New hook** `src/hooks/useExportAuditLogger.ts` exposing `logExport({ entity, entityFilter, rowCount, fileFormat })`.
3. **Call-site touches** — wrap each export action:
   - `src/hooks/useStatutoryData.ts` — 7 export hooks.
   - `src/components/payroll/PaySlipDialog.tsx` — PDF export.
   - Any usage of `usePdfExport` / `useDataExport` (grep TODO for reviewer).
4. **Optional UI:** an admin-only "Export Activity" page with filtering, e.g. `src/pages/audit/ExportActivity.tsx`.

## Risks
1. Wrapping every export means failing to log → silent. Use a server-side trigger or RPC where possible (e.g. statutory exports flow through Postgres functions; log inside the function with a SECURITY DEFINER `INSERT` to `export_audit_log`).
2. Volume — payslip exports happen monthly per employee. Consider partitioning by month.
3. PII — `entity_filter` may contain a search term that is itself sensitive. Mask carefully.
4. Lint/build/test could not run in this sandbox.
