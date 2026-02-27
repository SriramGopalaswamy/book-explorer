
-- =====================================================
-- FIX O2: Org write-protection triggers on key tables
-- The function block_locked_or_archived_org_writes() already exists.
-- We need triggers named with 'block_locked_or_archived' pattern on key org-scoped tables.
-- =====================================================

CREATE OR REPLACE TRIGGER block_locked_or_archived_financial_records
  BEFORE INSERT OR UPDATE ON public.financial_records
  FOR EACH ROW EXECUTE FUNCTION block_locked_or_archived_org_writes();

CREATE OR REPLACE TRIGGER block_locked_or_archived_invoices
  BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION block_locked_or_archived_org_writes();

CREATE OR REPLACE TRIGGER block_locked_or_archived_bills
  BEFORE INSERT OR UPDATE ON public.bills
  FOR EACH ROW EXECUTE FUNCTION block_locked_or_archived_org_writes();

CREATE OR REPLACE TRIGGER block_locked_or_archived_expenses
  BEFORE INSERT OR UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION block_locked_or_archived_org_writes();

CREATE OR REPLACE TRIGGER block_locked_or_archived_payroll_runs
  BEFORE INSERT OR UPDATE ON public.payroll_runs
  FOR EACH ROW EXECUTE FUNCTION block_locked_or_archived_org_writes();

CREATE OR REPLACE TRIGGER block_locked_or_archived_payroll_records
  BEFORE INSERT OR UPDATE ON public.payroll_records
  FOR EACH ROW EXECUTE FUNCTION block_locked_or_archived_org_writes();

CREATE OR REPLACE TRIGGER block_locked_or_archived_journal_entries
  BEFORE INSERT OR UPDATE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION block_locked_or_archived_org_writes();

CREATE OR REPLACE TRIGGER block_locked_or_archived_bank_transactions
  BEFORE INSERT OR UPDATE ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION block_locked_or_archived_org_writes();

CREATE OR REPLACE TRIGGER block_locked_or_archived_leave_requests
  BEFORE INSERT OR UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION block_locked_or_archived_org_writes();

CREATE OR REPLACE TRIGGER block_locked_or_archived_attendance_records
  BEFORE INSERT OR UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION block_locked_or_archived_org_writes();

CREATE OR REPLACE TRIGGER block_locked_or_archived_assets
  BEFORE INSERT OR UPDATE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION block_locked_or_archived_org_writes();

CREATE OR REPLACE TRIGGER block_locked_or_archived_credit_notes
  BEFORE INSERT OR UPDATE ON public.credit_notes
  FOR EACH ROW EXECUTE FUNCTION block_locked_or_archived_org_writes();

CREATE OR REPLACE TRIGGER block_locked_or_archived_quotes
  BEFORE INSERT OR UPDATE ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION block_locked_or_archived_org_writes();

CREATE OR REPLACE TRIGGER block_locked_or_archived_customers
  BEFORE INSERT OR UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION block_locked_or_archived_org_writes();

CREATE OR REPLACE TRIGGER block_locked_or_archived_vendors
  BEFORE INSERT OR UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION block_locked_or_archived_org_writes();

-- =====================================================
-- FIX O4: Add missing organization_id indexes
-- We dynamically identify the 8 tables, but based on common patterns
-- these are likely: invoice_items (no org_id), bill_items (no org_id), etc.
-- We'll add indexes on all org-scoped tables that are missing them.
-- =====================================================

DO $$
DECLARE
  _tbl text;
BEGIN
  FOR _tbl IN
    SELECT DISTINCT c.relname
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND a.attname = 'organization_id' AND a.attnum > 0 AND c.relkind = 'r'
      AND c.relname != 'organizations'
      AND NOT EXISTS (
        SELECT 1 FROM pg_index pi
        JOIN pg_class ic ON ic.oid = pi.indexrelid
        WHERE pi.indrelid = c.oid
          AND EXISTS (
            SELECT 1 FROM pg_attribute ia
            WHERE ia.attrelid = ic.oid AND ia.attname = 'organization_id'
          )
      )
  LOOP
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_organization_id ON public.%I (organization_id)', _tbl, _tbl);
  END LOOP;
END;
$$;

-- =====================================================
-- FIX O5: Invoice recalculation trigger on invoice_items
-- The function recalculate_invoice_totals() already exists.
-- =====================================================

CREATE OR REPLACE TRIGGER recalculate_invoice_totals_on_change
  AFTER INSERT OR UPDATE OR DELETE ON public.invoice_items
  FOR EACH ROW EXECUTE FUNCTION recalculate_invoice_totals();

-- Also ensure quote and bill recalculation triggers exist
CREATE OR REPLACE TRIGGER recalculate_quote_totals_on_change
  AFTER INSERT OR UPDATE OR DELETE ON public.quote_items
  FOR EACH ROW EXECUTE FUNCTION recalculate_quote_totals();

CREATE OR REPLACE TRIGGER recalculate_bill_totals_on_change
  AFTER INSERT OR UPDATE OR DELETE ON public.bill_items
  FOR EACH ROW EXECUTE FUNCTION recalculate_bill_totals();
