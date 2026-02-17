-- =====================================================================
-- PHASE 1: ACCOUNTING INTEGRITY LAYER - Payment Allocations & Credit Notes
-- =====================================================================
-- Migration: 20260217103200_phase1_payments_credits.sql
-- Description: Links payments to invoices/bills and implements credit notes
-- Dependencies: invoices, bills, bank_transactions, journal_entries
-- Backward Compatible: YES (additive only)
-- =====================================================================

-- Create payment_allocations table
CREATE TABLE payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NULL,
  payment_type TEXT NOT NULL CHECK (payment_type IN ('receivable', 'payable')),
  payment_id UUID NOT NULL, -- References bank_transactions.id
  invoice_id UUID REFERENCES invoices(id),
  bill_id UUID REFERENCES bills(id),
  allocated_amount NUMERIC(15,2) NOT NULL CHECK (allocated_amount > 0),
  allocation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  journal_entry_id UUID REFERENCES journal_entries(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE,
  CHECK (
    (payment_type = 'receivable' AND invoice_id IS NOT NULL AND bill_id IS NULL)
    OR 
    (payment_type = 'payable' AND bill_id IS NOT NULL AND invoice_id IS NULL)
  )
);

-- Create credit_notes table
CREATE TABLE credit_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NULL,
  credit_note_number TEXT NOT NULL,
  invoice_id UUID NOT NULL REFERENCES invoices(id),
  credit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' 
    CHECK (status IN ('draft', 'issued', 'applied', 'cancelled')),
  journal_entry_id UUID REFERENCES journal_entries(id),
  applied_to_invoice BOOLEAN NOT NULL DEFAULT false,
  applied_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(user_id, credit_note_number)
);

-- Create indexes
CREATE INDEX idx_payment_allocations_user ON payment_allocations(user_id);
CREATE INDEX idx_payment_allocations_payment ON payment_allocations(payment_id);
CREATE INDEX idx_payment_allocations_invoice ON payment_allocations(invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX idx_payment_allocations_bill ON payment_allocations(bill_id) WHERE bill_id IS NOT NULL;
CREATE INDEX idx_payment_allocations_type ON payment_allocations(payment_type);
CREATE INDEX idx_payment_allocations_organization ON payment_allocations(organization_id) WHERE organization_id IS NOT NULL;

CREATE INDEX idx_credit_notes_user ON credit_notes(user_id);
CREATE INDEX idx_credit_notes_invoice ON credit_notes(invoice_id);
CREATE INDEX idx_credit_notes_status ON credit_notes(user_id, status);
CREATE INDEX idx_credit_notes_organization ON credit_notes(organization_id) WHERE organization_id IS NOT NULL;

-- Enable RLS
ALTER TABLE payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_notes ENABLE ROW LEVEL SECURITY;

-- RLS policies for payment_allocations
CREATE POLICY "Users can view their own payment allocations"
ON payment_allocations FOR SELECT
USING (
  (organization_id IS NULL AND auth.uid() = user_id)
  OR (organization_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = payment_allocations.organization_id
    AND om.user_id = auth.uid()
  ))
);

CREATE POLICY "Users can create their own payment allocations"
ON payment_allocations FOR INSERT
WITH CHECK (
  (organization_id IS NULL AND auth.uid() = user_id)
  OR (organization_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = payment_allocations.organization_id
    AND om.user_id = auth.uid()
    AND om.role IN ('owner', 'admin', 'member')
  ))
);

CREATE POLICY "Users can update their own payment allocations"
ON payment_allocations FOR UPDATE
USING (
  (organization_id IS NULL AND auth.uid() = user_id)
  OR (organization_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = payment_allocations.organization_id
    AND om.user_id = auth.uid()
    AND om.role IN ('owner', 'admin', 'member')
  ))
);

CREATE POLICY "Users can delete their own payment allocations"
ON payment_allocations FOR DELETE
USING (
  (organization_id IS NULL AND auth.uid() = user_id)
  OR (organization_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = payment_allocations.organization_id
    AND om.user_id = auth.uid()
    AND om.role IN ('owner', 'admin')
  ))
);

-- RLS policies for credit_notes
CREATE POLICY "Users can view their own credit notes"
ON credit_notes FOR SELECT
USING (
  (organization_id IS NULL AND auth.uid() = user_id)
  OR (organization_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = credit_notes.organization_id
    AND om.user_id = auth.uid()
  ))
);

CREATE POLICY "Users can create their own credit notes"
ON credit_notes FOR INSERT
WITH CHECK (
  (organization_id IS NULL AND auth.uid() = user_id)
  OR (organization_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = credit_notes.organization_id
    AND om.user_id = auth.uid()
    AND om.role IN ('owner', 'admin', 'member')
  ))
);

CREATE POLICY "Users can update their own credit notes"
ON credit_notes FOR UPDATE
USING (
  (organization_id IS NULL AND auth.uid() = user_id)
  OR (organization_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = credit_notes.organization_id
    AND om.user_id = auth.uid()
    AND om.role IN ('owner', 'admin', 'member')
  ))
);

CREATE POLICY "Users can delete their own credit notes"
ON credit_notes FOR DELETE
USING (
  status = 'draft' AND (
    (organization_id IS NULL AND auth.uid() = user_id)
    OR (organization_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = credit_notes.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    ))
  )
);

-- =====================================================================
-- FUNCTION: Generate Credit Note Number
-- =====================================================================
CREATE OR REPLACE FUNCTION generate_credit_note_number(p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_year INTEGER;
  v_seq INTEGER;
  v_number TEXT;
BEGIN
  v_year := EXTRACT(YEAR FROM CURRENT_DATE);
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(credit_note_number FROM 'CN-\d{4}-(\d+)') AS INTEGER)), 0) + 1
  INTO v_seq
  FROM credit_notes
  WHERE user_id = p_user_id
    AND credit_note_number LIKE 'CN-' || v_year || '-%';
  
  v_number := 'CN-' || v_year || '-' || LPAD(v_seq::TEXT, 4, '0');
  
  RETURN v_number;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- FUNCTION: Allocate Payment to Invoice (Receivable)
-- =====================================================================
CREATE OR REPLACE FUNCTION allocate_payment_to_invoice(
  p_payment_id UUID,
  p_invoice_id UUID,
  p_amount NUMERIC,
  p_ar_account_id UUID, -- Accounts Receivable account from COA
  p_cash_account_id UUID -- Cash/Bank account from COA
)
RETURNS payment_allocations AS $$
DECLARE
  v_invoice invoices;
  v_allocation payment_allocations;
  v_entry_id UUID;
  v_total_allocated NUMERIC;
  v_remaining NUMERIC;
BEGIN
  -- Get invoice
  SELECT * INTO v_invoice
  FROM invoices
  WHERE id = p_invoice_id
    AND user_id = auth.uid();
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found or access denied';
  END IF;
  
  -- Calculate remaining amount
  SELECT COALESCE(SUM(allocated_amount), 0) INTO v_total_allocated
  FROM payment_allocations
  WHERE invoice_id = p_invoice_id;
  
  v_remaining := v_invoice.amount - v_total_allocated;
  
  IF p_amount > v_remaining THEN
    RAISE EXCEPTION 'Allocation amount (%) exceeds remaining invoice balance (%)', p_amount, v_remaining;
  END IF;
  
  -- Create journal entry for payment
  v_entry_id := gen_random_uuid();
  
  INSERT INTO journal_entries (
    id, user_id, organization_id, entry_number, entry_date,
    description, reference_type, reference_id
  )
  VALUES (
    v_entry_id,
    v_invoice.user_id,
    NULL, -- organization_id
    generate_entry_number(v_invoice.user_id),
    CURRENT_DATE,
    'Payment received for Invoice: ' || v_invoice.invoice_number,
    'payment',
    p_payment_id
  );
  
  -- Debit: Cash/Bank
  INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description)
  VALUES (
    v_entry_id,
    p_cash_account_id,
    p_amount,
    0,
    'Cash received'
  );
  
  -- Credit: Accounts Receivable
  INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description)
  VALUES (
    v_entry_id,
    p_ar_account_id,
    0,
    p_amount,
    'AR payment'
  );
  
  -- Post the journal entry
  PERFORM post_journal_entry(v_entry_id);
  
  -- Create payment allocation
  INSERT INTO payment_allocations (
    user_id, organization_id, payment_type, payment_id, invoice_id,
    allocated_amount, allocation_date, journal_entry_id
  )
  VALUES (
    v_invoice.user_id,
    NULL,
    'receivable',
    p_payment_id,
    p_invoice_id,
    p_amount,
    CURRENT_DATE,
    v_entry_id
  )
  RETURNING * INTO v_allocation;
  
  -- Update invoice status
  SELECT COALESCE(SUM(allocated_amount), 0) INTO v_total_allocated
  FROM payment_allocations
  WHERE invoice_id = p_invoice_id;
  
  IF v_total_allocated >= v_invoice.amount THEN
    UPDATE invoices SET status = 'paid' WHERE id = p_invoice_id;
  ELSIF v_total_allocated > 0 THEN
    UPDATE invoices SET status = 'partially_paid' WHERE id = p_invoice_id;
  END IF;
  
  RETURN v_allocation;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- FUNCTION: Allocate Payment to Bill (Payable)
-- =====================================================================
CREATE OR REPLACE FUNCTION allocate_payment_to_bill(
  p_payment_id UUID,
  p_bill_id UUID,
  p_amount NUMERIC,
  p_ap_account_id UUID, -- Accounts Payable account from COA
  p_cash_account_id UUID -- Cash/Bank account from COA
)
RETURNS payment_allocations AS $$
DECLARE
  v_bill bills;
  v_allocation payment_allocations;
  v_entry_id UUID;
  v_total_allocated NUMERIC;
  v_remaining NUMERIC;
BEGIN
  -- Get bill
  SELECT * INTO v_bill
  FROM bills
  WHERE id = p_bill_id
    AND (user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = bills.organization_id
      AND om.user_id = auth.uid()
    ));
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bill not found or access denied';
  END IF;
  
  -- Calculate remaining amount
  v_remaining := v_bill.amount - v_bill.paid_amount;
  
  IF p_amount > v_remaining THEN
    RAISE EXCEPTION 'Payment amount (%) exceeds remaining bill balance (%)', p_amount, v_remaining;
  END IF;
  
  -- Create journal entry for payment
  v_entry_id := gen_random_uuid();
  
  INSERT INTO journal_entries (
    id, user_id, organization_id, entry_number, entry_date,
    description, reference_type, reference_id
  )
  VALUES (
    v_entry_id,
    v_bill.user_id,
    v_bill.organization_id,
    generate_entry_number(v_bill.user_id),
    CURRENT_DATE,
    'Payment for Bill: ' || v_bill.bill_number,
    'payment',
    p_payment_id
  );
  
  -- Debit: Accounts Payable
  INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description)
  VALUES (
    v_entry_id,
    p_ap_account_id,
    p_amount,
    0,
    'AP payment'
  );
  
  -- Credit: Cash/Bank
  INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description)
  VALUES (
    v_entry_id,
    p_cash_account_id,
    0,
    p_amount,
    'Cash paid'
  );
  
  -- Post the journal entry
  PERFORM post_journal_entry(v_entry_id);
  
  -- Create payment allocation
  INSERT INTO payment_allocations (
    user_id, organization_id, payment_type, payment_id, bill_id,
    allocated_amount, allocation_date, journal_entry_id
  )
  VALUES (
    v_bill.user_id,
    v_bill.organization_id,
    'payable',
    p_payment_id,
    p_bill_id,
    p_amount,
    CURRENT_DATE,
    v_entry_id
  )
  RETURNING * INTO v_allocation;
  
  -- Update bill paid_amount and status
  UPDATE bills
  SET 
    paid_amount = paid_amount + p_amount,
    status = CASE
      WHEN (paid_amount + p_amount) >= amount THEN 'paid'
      WHEN (paid_amount + p_amount) > 0 THEN 'partially_paid'
      ELSE status
    END,
    updated_at = NOW()
  WHERE id = p_bill_id;
  
  RETURN v_allocation;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- FUNCTION: Issue Credit Note
-- =====================================================================
CREATE OR REPLACE FUNCTION issue_credit_note(
  p_credit_note_id UUID,
  p_revenue_account_id UUID, -- Revenue account to reverse
  p_ar_account_id UUID -- Accounts Receivable account
)
RETURNS credit_notes AS $$
DECLARE
  v_credit_note credit_notes;
  v_invoice invoices;
  v_entry_id UUID;
BEGIN
  -- Get credit note
  SELECT * INTO v_credit_note
  FROM credit_notes
  WHERE id = p_credit_note_id
    AND user_id = auth.uid();
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Credit note not found or access denied';
  END IF;
  
  IF v_credit_note.status != 'draft' THEN
    RAISE EXCEPTION 'Credit note is not in draft status';
  END IF;
  
  -- Get related invoice
  SELECT * INTO v_invoice
  FROM invoices
  WHERE id = v_credit_note.invoice_id;
  
  IF v_credit_note.amount > v_invoice.amount THEN
    RAISE EXCEPTION 'Credit note amount cannot exceed invoice amount';
  END IF;
  
  -- Create journal entry
  v_entry_id := gen_random_uuid();
  
  INSERT INTO journal_entries (
    id, user_id, organization_id, entry_number, entry_date,
    description, reference_type, reference_id
  )
  VALUES (
    v_entry_id,
    v_credit_note.user_id,
    NULL,
    generate_entry_number(v_credit_note.user_id),
    v_credit_note.credit_date,
    'Credit Note: ' || v_credit_note.credit_note_number || ' for Invoice: ' || v_invoice.invoice_number,
    'credit_note',
    p_credit_note_id
  );
  
  -- Debit: Revenue (reverse)
  INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description)
  VALUES (
    v_entry_id,
    p_revenue_account_id,
    v_credit_note.amount,
    0,
    'Revenue reversal'
  );
  
  -- Credit: Accounts Receivable (reduce)
  INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description)
  VALUES (
    v_entry_id,
    p_ar_account_id,
    0,
    v_credit_note.amount,
    'AR reduction'
  );
  
  -- Post the journal entry
  PERFORM post_journal_entry(v_entry_id);
  
  -- Update credit note
  UPDATE credit_notes
  SET 
    status = 'issued',
    journal_entry_id = v_entry_id,
    updated_at = NOW()
  WHERE id = p_credit_note_id
  RETURNING * INTO v_credit_note;
  
  RETURN v_credit_note;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- GRANT PERMISSIONS
-- =====================================================================
GRANT EXECUTE ON FUNCTION generate_credit_note_number TO authenticated;
GRANT EXECUTE ON FUNCTION allocate_payment_to_invoice TO authenticated;
GRANT EXECUTE ON FUNCTION allocate_payment_to_bill TO authenticated;
GRANT EXECUTE ON FUNCTION issue_credit_note TO authenticated;

-- =====================================================================
-- ADD TRIGGERS FOR UPDATED_AT
-- =====================================================================
CREATE TRIGGER update_payment_allocations_updated_at
BEFORE UPDATE ON payment_allocations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_credit_notes_updated_at
BEFORE UPDATE ON credit_notes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================
-- COMMENTS
-- =====================================================================
COMMENT ON TABLE payment_allocations IS 'Links payments (bank transactions) to specific invoices or bills. Enables partial payment tracking.';
COMMENT ON TABLE credit_notes IS 'Credit notes for reversing or adjusting invoices.';
COMMENT ON FUNCTION allocate_payment_to_invoice IS 'Allocates a payment to an invoice, creates journal entry, and updates invoice status.';
COMMENT ON FUNCTION allocate_payment_to_bill IS 'Allocates a payment to a bill, creates journal entry, and updates bill paid amount.';
COMMENT ON FUNCTION issue_credit_note IS 'Issues a credit note, creating reversal journal entry.';
COMMENT ON COLUMN payment_allocations.payment_type IS 'receivable: payment for invoice, payable: payment for bill';
COMMENT ON COLUMN credit_notes.applied_to_invoice IS 'Whether the credit note has been applied to reduce the invoice amount';
