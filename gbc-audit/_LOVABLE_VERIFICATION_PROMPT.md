# Lovable Verification Prompt — post-audit close-out

Copy everything inside the fenced block below into Lovable on the
`book-explorer` project, then paste the entire response back into our
chat. The prompt does **only** read-only checks (`SELECT` queries and
DESCRIBE-style introspection) — it does **not** modify any data, so it
is safe to run on the production database.

The prompt covers:

1. **Migration apply verification** for the 7 new SQL migrations added
   in PR #239 + the 4 from earlier PRs (so we know what Lovable
   auto-applied vs. is still queued).
2. **Smoke tests** for the 4 GL/inventory side-effect triggers (GBC-40,
   41, 63, 64) — read-only "did the trigger fire on existing rows?"
   probes that don't require creating fresh test data.
3. **Static-analysis equivalents** for the things I cannot probe from
   the audit sandbox (e.g. checking that the live `types.ts` schema
   matches what the audit branch assumed).

---

```
You are running inside the GRX10 ERP Lovable project (Supabase backend
`qfgudhbrjfjmbamwsfuj`). This is a READ-ONLY verification of the
2026-05-08 audit close-out. Run every SQL below in the Supabase SQL
editor and paste the output back. Do NOT make any schema changes,
data changes, or RLS changes. If a query errors, paste the error verbatim
— that itself is part of the answer.

# Section 1 — Migration files actually applied

Confirm each of the 11 audit migrations below is recorded in
supabase_migrations.schema_migrations. Anything missing = Lovable
auto-sync didn't pick it up and the corresponding feature is dark.

SELECT version, name, statements IS NOT NULL AS has_body
FROM supabase_migrations.schema_migrations
WHERE version LIKE '202605080600%' OR version LIKE '20260508130%'
ORDER BY version;

Expected: 11 rows, versions 20260508060000, 060100, 060200, 060300,
130000, 130100, 130200, 130300, 130400, 130500, 130600.

# Section 2 — GBC-7 / GBC-15 / GBC-17 storage policy regression guards

-- 2a. invoice-assets bucket private + path-tenancy SELECT policy.
SELECT id, public FROM storage.buckets WHERE id = 'invoice-assets';
-- Expect: public = false

SELECT policyname, cmd, qual
FROM pg_policies
WHERE schemaname='storage' AND tablename='objects'
  AND qual LIKE '%invoice-assets%';
-- Expect: at least one SELECT policy whose USING clause contains
-- foldername(name)[1] = some org check (path-tenancy), NOT just
-- auth.role()='authenticated'.

-- 2b. memo-attachments bucket has org-scoped SELECT (GBC-17).
SELECT policyname, qual
FROM pg_policies
WHERE schemaname='storage' AND tablename='objects'
  AND qual LIKE '%memo-attachments%' AND cmd='SELECT';
-- Expect at least one row mentioning memos / get_user_organization_id.

# Section 3 — GBC-6 SECURITY DEFINER search_path

SELECT count(*) FILTER (WHERE prosecdef AND proconfig::text LIKE '%search_path%') AS pinned,
       count(*) FILTER (WHERE prosecdef AND (proconfig IS NULL OR proconfig::text NOT LIKE '%search_path%')) AS unpinned
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public';
-- Expect: unpinned = 0 (or close to 0 — pre-cutoff legacy fns allowed).

# Section 4 — GBC-10 version columns

SELECT table_name
FROM information_schema.columns
WHERE table_schema='public'
  AND column_name='version'
  AND data_type IN ('integer','bigint')
ORDER BY table_name;
-- Expect: bills, credit_notes, delivery_notes, expenses, financial_records,
-- goods_receipts, invoices, items, journal_entries, payroll_records,
-- picking_lists, profiles, purchase_orders, quotes, salary_structures,
-- sales_orders, stock_adjustments, stock_transfers. (Some may be missing
-- if the table itself doesn't exist in this schema — fine.)

# Section 5 — GBC-13 export audit log

SELECT count(*) AS export_audit_log_rows FROM public.export_audit_log;
-- Just confirms the table exists and is queryable.

SELECT proname, pg_get_function_arguments(oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND proname='record_export';
-- Expect: one row, args include the entity name + filter jsonb.

# Section 6 — GBC-14 / GBC-31 / GBC-34 FTS + search

SELECT table_name FROM information_schema.columns
WHERE table_schema='public' AND column_name='search_vector'
ORDER BY table_name;
-- Expect: invoices, bills, journal_entries, bank_transactions, eway_bills,
-- stock_ledger, audit_logs, sales_orders (any subset thereof).

SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND proname='search_documents';
-- Expect: one row.

# Section 7 — GBC-28 queryKey tenancy + GBC-47 statutory enabled-gate

(Source-tree only — no DB query. Confirm by inspecting the codebase that
src/test/query-key-tenancy.test.ts exists and src/hooks/useStatutoryData.ts
has `enabled: !!orgId` adjacent to every `queryKey: ["gstrN", ...]`. The
audit static probe reported 7/7 at last check.)

# Section 8 — GBC-2 / GBC-3 organization_id on detail tables

SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name='salary_components'
  AND column_name='organization_id';
-- Expect: organization_id NOT NULL.

SELECT tgname, pg_get_triggerdef(t.oid)
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
WHERE c.relname='salary_components' AND tgname='trg_sync_org_id_salary_components';
-- Expect: one row.

# Section 9 — GBC-4 soft-delete views

SELECT table_name FROM information_schema.views
WHERE table_schema='public' AND table_name LIKE 'v_%_active'
ORDER BY table_name;
-- Expect: 11 views (v_invoices_active, v_bills_active, v_expenses_active,
-- v_financial_records_active, v_journal_entries_active,
-- v_payroll_records_active, v_bank_transactions_active,
-- v_invoice_items_active, v_chart_of_accounts_active, v_profiles_active,
-- v_scheduled_payments_active).

# Section 10 — GBC-37 / 39 / 43 / 44 bank-account default helper

SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND proname='_resolve_default_bank_account';
-- Expect: one row.

SELECT proname, pg_get_function_arguments(oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND proname IN ('mark_expense_paid','approve_reimbursement',
                  'record_payment_receipt','record_vendor_payment');
-- Expect: 4 rows. p_bank_account_id parameter should appear with DEFAULT NULL.

# Section 11 — GBC-45 unrealized FX

SELECT proname, pg_get_function_arguments(oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND proname='unrealized_fx_pnl';
-- Expect: one row, arg "p_as_of date DEFAULT CURRENT_DATE".

-- Functional smoke (read-only): run against an org that has non-INR
-- invoices. Replace <ORG_UUID> with an org id from public.organizations.
-- If the test org has only INR docs, the result is empty (correct behaviour).
-- This requires SELECT access on invoices+bills+exchange_rates+payment_receipts+vendor_payments.
-- Skip if RLS blocks it; we'll smoke-test from the UI instead.

# Section 12 — GBC-52 workflow_drafts + GBC-12 report_jobs

SELECT 'workflow_drafts'::text AS table, count(*) AS rows FROM public.workflow_drafts
UNION ALL SELECT 'report_jobs', count(*) FROM public.report_jobs;

SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND proname IN ('save_workflow_draft','enqueue_report_job',
                  'mark_report_job_running','update_report_job_progress',
                  'mark_report_job_succeeded','mark_report_job_failed');
-- Expect 6 rows.

SELECT name FROM storage.buckets WHERE id='erp-documents-storage';
-- Expect: one row. (Used by render_report Edge Function.)

# Section 13 — GBC-54 CA audit stale flag

SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='audit_ai_anomalies'
  AND column_name IN ('is_stale','stale_reason','stale_marked_at')
ORDER BY column_name;
-- Expect: 3 rows.

SELECT count(*) FILTER (WHERE is_stale = true) AS stale_anomalies,
       count(*) AS total_anomalies
FROM public.audit_ai_anomalies;
-- Just a read; either could be 0 in a fresh tenant.

SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND proname='clear_audit_anomaly_stale';
-- Expect: one row.

# Section 14 — GBC-58 stock_adjustment_lines

SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='stock_adjustment_lines'
ORDER BY ordinal_position;
-- Expect: id, stock_adjustment_id, organization_id, item_id, quantity_delta,
-- unit_cost, reason_code, notes, created_at, updated_at.

SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND proname='create_stock_adjustment_with_lines';
-- Expect: one row.

# Section 15 — GBC-40 / 41 / 63 / 64 trigger smoke tests (READ-ONLY)

# 15a — confirm the 4 triggers + 4 trigger functions exist.
SELECT tgname FROM pg_trigger
WHERE tgname IN (
  'trg_credit_note_auto_journal',
  'trg_vendor_credit_auto_journal',
  'trg_delivery_return_auto_stock',
  'trg_sales_return_auto_stock'
)
ORDER BY tgname;
-- Expect: 4 rows.

SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND proname IN (
  'fn_auto_post_credit_note_journal',
  'fn_auto_post_vendor_credit_journal',
  'fn_auto_post_delivery_return_stock',
  'fn_auto_post_sales_return_stock'
)
ORDER BY proname;
-- Expect: 4 rows.

# 15b — find a credit_note in 'issued' state and check whether a
# matching journal_entry exists.
SELECT cn.id AS credit_note_id, cn.credit_note_number, cn.status,
       cn.amount, cn.organization_id, cn.client_name,
       (SELECT je.id FROM public.journal_entries je
         WHERE je.organization_id = cn.organization_id
           AND je.document_sequence_number = 'CN-JE-' || cn.credit_note_number
       ) AS je_id_if_posted
FROM public.credit_notes cn
WHERE cn.status IN ('issued','applied')
ORDER BY cn.updated_at DESC NULLS LAST
LIMIT 5;
-- For rows whose status moved to issued AFTER 20260508060000 applied,
-- je_id_if_posted should be non-null. If older rows show null that's
-- expected (the trigger only fires on the transition; backfill is a
-- separate task).

# 15c — same probe, vendor_credits.
SELECT vc.id AS vendor_credit_id, vc.vendor_credit_number, vc.status,
       vc.amount, vc.organization_id, vc.vendor_name,
       (SELECT je.id FROM public.journal_entries je
         WHERE je.organization_id = vc.organization_id
           AND je.document_sequence_number = 'VC-JE-' || vc.vendor_credit_number
       ) AS je_id_if_posted
FROM public.vendor_credits vc
WHERE vc.status IN ('issued','applied')
ORDER BY vc.updated_at DESC NULLS LAST
LIMIT 5;

# 15d — delivery_notes returned. Look for matching stock_ledger 'return' rows.
SELECT dn.id AS delivery_id, dn.dn_number, dn.status,
       dn.organization_id,
       (SELECT count(*) FROM public.stock_ledger sl
         WHERE sl.organization_id = dn.organization_id
           AND sl.reference_type = 'delivery_return'
           AND sl.reference_id = dn.id
       ) AS stock_in_rows
FROM public.delivery_notes dn
WHERE dn.status = 'returned'
ORDER BY dn.updated_at DESC NULLS LAST
LIMIT 5;
-- For deliveries that moved to 'returned' AFTER 20260508060000 applied,
-- stock_in_rows should be > 0.

# 15e — sales_returns approved. Look for matching stock_ledger rows.
SELECT sr.id AS sales_return_id, sr.return_number, sr.status,
       sr.organization_id,
       (SELECT count(*) FROM public.stock_ledger sl
         WHERE sl.organization_id = sr.organization_id
           AND sl.reference_type = 'sales_return'
           AND sl.reference_id = sr.id
       ) AS stock_in_rows
FROM public.sales_returns sr
WHERE sr.status IN ('approved','received')
ORDER BY sr.updated_at DESC NULLS LAST
LIMIT 5;

# Section 16 — End-to-end interactive smoke (PERFORM IN THE LIVE APP, not SQL)

For each of the four scenarios below, the human running the verification
performs the action via the app UI and pastes back the result. The SQL
in Sections 15b–15e shows whether the side-effect row appeared.

  S1 (GBC-40) — In the Credit Notes screen, open a Draft credit note.
              Set status → Issued. Save.
              Expected side-effect: a new public.journal_entries row
              with source_type='credit_note', document_sequence_number
              'CN-JE-<credit_note_number>', and two public.journal_lines
              (DR Sales Returns / Allowances, CR Accounts Receivable).
              Then re-run 15b to confirm je_id_if_posted is non-null.

  S2 (GBC-41) — Same in Vendor Credits. Status → Issued.
              Expected: journal_entries row with source_type='vendor_credit',
              document_sequence_number 'VC-JE-<vendor_credit_number>',
              lines DR Accounts Payable, CR Purchase Returns/Allowances.
              Re-run 15c.

  S3 (GBC-63) — In Deliveries, find a delivery in 'dispatched' /
              'delivered' state. Change its status to 'returned'.
              Expected: stock_ledger rows (one per delivery_note_items
              line) with reference_type='delivery_return',
              reference_id=<delivery id>, transaction_type='return',
              balance_qty incremented by shipped_quantity.
              Re-run 15d.

  S4 (GBC-64) — In Sales Returns, approve a Draft return.
              Expected: stock_ledger rows with reference_type='sales_return',
              reference_id=<sales_return id>, transaction_type='return'.
              Re-run 15e.

# Section 17 — App-level smoke tests for the other resolved issues

  T1 (GBC-37 / GBC-39 / GBC-43 / GBC-44 default bank-account)
     - Open Expenses, mark a Pending expense as Paid.
     - Expected: no toast error about "bank account required"; the
       expense becomes Paid; a new bank_transactions row appears in
       Banking → Transactions with type=debit and the org's first
       active bank account as account_id.
     - Same pattern in Reimbursements (Finance) → Approve & Pay.

  T2 (GBC-36 quote → invoice atomic)
     - Open a Draft quote with line items. Click Convert to Invoice.
     - Expected: the resulting invoice has all line items present; the
       quote shows status=converted with converted_invoice_id set;
       network drop during the conversion does NOT leave an orphaned
       invoice header. (Try by throttling network and refreshing.)

  T3 (GBC-58 stock-adjustment lines)
     - Open Inventory → Stock Adjustments → New.
     - Add at least one line item (qty Δ != 0), save with status Draft.
     - Move status to Posted.
     - Expected: stock_ledger rows appear with transaction_type='adjustment',
       reference_type='stock_adjustment'.

  T4 (GBC-60 partial GRN)
     - Open Procurement → Goods Receipts → Create from PO.
     - Select a PO with multiple lines. Change one line's "Receive Now"
       to less than its remaining qty. Save.
     - Expected: GRN created with only the partial qty;
       purchase_order_items.received_quantity bumped by the partial
       amount; remaining qty still open for the next GRN.

  T5 (GBC-51 recurring transactions GL)
     - Open Financial → Recurring → New.
     - Confirm the form now has Debit Account + Credit Account dropdowns
       populated from chart_of_accounts.
     - Cannot save without both selected. Cannot pick the same account
       for both.

  T6 (GBC-56 default warehouse)
     - Open Inventory → Warehouses. Right-click / dropdown on any
       non-default warehouse. Click "Set as Default".
     - Expected: that warehouse now shows "Default" badge; the previous
       default has its badge removed.

# What to paste back

For every SQL block: the result table (or the error message).
For every smoke test: a one-line PASS/FAIL plus any unexpected behaviour.

If anything in Sections 1–14 reports 0 rows where the prompt expected
some, that migration didn't apply in this project and the corresponding
feature is dark. Re-running Lovable's auto-sync usually fixes it; if
not, the SQL files under supabase/migrations/202605080600_*.sql and
supabase/migrations/202605081300_*.sql in the repo are the source of
truth.
```

---

After Lovable returns results, share them and I'll classify each issue as
final-resolved or in-flight per the live-state evidence.
