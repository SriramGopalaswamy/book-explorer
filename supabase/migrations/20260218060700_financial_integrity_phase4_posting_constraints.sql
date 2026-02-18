-- =====================================================================
-- FINANCIAL INTEGRITY SYSTEM - PHASE 4: Posting Validation Constraints
-- =====================================================================
-- Migration: 20260218060700_financial_integrity_phase4_posting_constraints.sql
-- Description: Enforce that financial documents cannot post without journal entries
-- Dependencies: journal_entries, invoices, bills, payments
-- =====================================================================

-- =====================================================================
-- FUNCTION: Validate Invoice Has Journal Entry Before Posting
-- =====================================================================
CREATE OR REPLACE FUNCTION validate_invoice_has_journal()
RETURNS TRIGGER AS $$
BEGIN
  -- Only validate when moving to 'sent' or 'paid' status
  IF NEW.status IN ('sent', 'paid') AND (OLD.status IS NULL OR OLD.status = 'draft') THEN
    -- Check if journal entry exists for this invoice
    IF NOT EXISTS (
      SELECT 1 FROM journal_entries
      WHERE reference_type = 'invoice'
      AND reference_id = NEW.id
      AND posted = true
    ) THEN
      RAISE EXCEPTION 'Cannot post invoice without corresponding journal entry. Create journal entry first.'
        USING HINT = 'Invoice must have a posted journal entry before changing status to sent or paid';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for invoice posting validation
DROP TRIGGER IF EXISTS trg_validate_invoice_posting ON invoices;
CREATE TRIGGER trg_validate_invoice_posting
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION validate_invoice_has_journal();

-- =====================================================================
-- FUNCTION: Validate Bill Has Journal Entry Before Approval
-- =====================================================================
CREATE OR REPLACE FUNCTION validate_bill_has_journal()
RETURNS TRIGGER AS $$
BEGIN
  -- Only validate when moving to 'approved' or 'paid' status
  IF NEW.status IN ('approved', 'paid') AND (OLD.status IS NULL OR OLD.status IN ('draft', 'pending_approval')) THEN
    -- Check if journal entry exists for this bill
    IF NOT EXISTS (
      SELECT 1 FROM journal_entries
      WHERE reference_type = 'bill'
      AND reference_id = NEW.id
      AND posted = true
    ) THEN
      RAISE EXCEPTION 'Cannot approve/pay bill without corresponding journal entry. Create journal entry first.'
        USING HINT = 'Bill must have a posted journal entry before changing status to approved or paid';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for bill posting validation
DROP TRIGGER IF EXISTS trg_validate_bill_posting ON bills;
CREATE TRIGGER trg_validate_bill_posting
  BEFORE UPDATE ON bills
  FOR EACH ROW
  EXECUTE FUNCTION validate_bill_has_journal();

-- =====================================================================
-- FUNCTION: Validate Payment Has Journal Entry Before Completion
-- =====================================================================
CREATE OR REPLACE FUNCTION validate_payment_has_journal()
RETURNS TRIGGER AS $$
BEGIN
  -- Only validate when moving to 'completed' status
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status IN ('pending', 'processing')) THEN
    -- Check if journal entry exists for this payment
    IF NOT EXISTS (
      SELECT 1 FROM journal_entries
      WHERE reference_type = 'payment'
      AND reference_id = NEW.id
      AND posted = true
    ) THEN
      RAISE EXCEPTION 'Cannot complete payment without corresponding journal entry. Create journal entry first.'
        USING HINT = 'Payment must have a posted journal entry before changing status to completed';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for payment posting validation (if payments table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payments') THEN
    DROP TRIGGER IF EXISTS trg_validate_payment_posting ON payments;
    EXECUTE 'CREATE TRIGGER trg_validate_payment_posting
      BEFORE UPDATE ON payments
      FOR EACH ROW
      EXECUTE FUNCTION validate_payment_has_journal()';
  END IF;
END $$;

-- =====================================================================
-- FUNCTION: Prevent Soft Delete of Posted Financial Records
-- =====================================================================
CREATE OR REPLACE FUNCTION prevent_posted_soft_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if we're doing a soft delete (setting deleted_at)
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    -- For invoices
    IF TG_TABLE_NAME = 'invoices' AND NEW.status IN ('sent', 'paid') THEN
      RAISE EXCEPTION 'Cannot delete posted invoice. Create a reversal journal entry instead.'
        USING HINT = 'Posted invoices must be reversed through journal entries';
    END IF;
    
    -- For bills
    IF TG_TABLE_NAME = 'bills' AND NEW.status IN ('approved', 'paid') THEN
      RAISE EXCEPTION 'Cannot delete posted bill. Create a reversal journal entry instead.'
        USING HINT = 'Posted bills must be reversed through journal entries';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for soft delete prevention
DROP TRIGGER IF EXISTS trg_prevent_invoice_soft_delete ON invoices;
CREATE TRIGGER trg_prevent_invoice_soft_delete
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION prevent_posted_soft_delete();

DROP TRIGGER IF EXISTS trg_prevent_bill_soft_delete ON bills;
CREATE TRIGGER trg_prevent_bill_soft_delete
  BEFORE UPDATE ON bills
  FOR EACH ROW
  EXECUTE FUNCTION prevent_posted_soft_delete();

-- =====================================================================
-- FUNCTION: Enforce Organization Isolation in Journal Entries
-- =====================================================================
-- Note: We cannot add a NOT NULL constraint on organization_id without a migration
-- strategy for existing data. Instead, we create a validation function.

CREATE OR REPLACE FUNCTION validate_organization_context()
RETURNS TRIGGER AS $$
BEGIN
  -- For new records created after this migration, strongly encourage organization_id
  IF NEW.organization_id IS NULL AND NEW.user_id IS NOT NULL THEN
    -- Try to get organization from user's default organization or create one
    -- This is a soft enforcement - we log a warning but allow the operation
    RAISE WARNING 'Journal entry created without organization_id. Consider setting organization_id for proper multi-tenant isolation.';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_organization_context ON journal_entries;
CREATE TRIGGER trg_validate_organization_context
  BEFORE INSERT ON journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION validate_organization_context();

-- =====================================================================
-- Create helper view for orphaned financial documents
-- (documents without corresponding journal entries)
-- =====================================================================
CREATE OR REPLACE VIEW v_orphaned_financial_documents AS
-- Invoices without journal entries
SELECT 
  'invoice' as document_type,
  i.id as document_id,
  i.invoice_number as document_number,
  i.total_amount as amount,
  i.status,
  i.created_at,
  'Missing journal entry for posted invoice' as issue
FROM invoices i
WHERE i.status IN ('sent', 'paid')
AND NOT EXISTS (
  SELECT 1 FROM journal_entries je
  WHERE je.reference_type = 'invoice'
  AND je.reference_id = i.id
  AND je.posted = true
)
AND i.deleted_at IS NULL

UNION ALL

-- Bills without journal entries
SELECT 
  'bill' as document_type,
  b.id as document_id,
  b.bill_number as document_number,
  b.total_amount as amount,
  b.status,
  b.created_at,
  'Missing journal entry for posted bill' as issue
FROM bills b
WHERE b.status IN ('approved', 'paid')
AND NOT EXISTS (
  SELECT 1 FROM journal_entries je
  WHERE je.reference_type = 'bill'
  AND je.reference_id = b.id
  AND je.posted = true
)
AND b.deleted_at IS NULL;

COMMENT ON VIEW v_orphaned_financial_documents IS 
  'Identifies posted invoices/bills without corresponding journal entries - data integrity issue';

-- =====================================================================
-- Grant permissions
-- =====================================================================
GRANT SELECT ON v_orphaned_financial_documents TO authenticated;
