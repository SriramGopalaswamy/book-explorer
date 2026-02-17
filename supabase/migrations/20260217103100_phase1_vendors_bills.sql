-- =====================================================================
-- PHASE 1: ACCOUNTING INTEGRITY LAYER - Vendors & Bills (AP)
-- =====================================================================
-- Migration: 20260217103100_phase1_vendors_bills.sql
-- Description: Implements accounts payable (vendors, bills, bill items)
-- Dependencies: chart_of_accounts, journal_entries
-- Backward Compatible: YES (additive only)
-- =====================================================================

-- Create vendors table
CREATE TABLE vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NULL,
  vendor_code TEXT NOT NULL,
  vendor_name TEXT NOT NULL,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  payment_terms_days INTEGER DEFAULT 30 CHECK (payment_terms_days >= 0 AND payment_terms_days <= 365),
  default_expense_account_id UUID REFERENCES chart_of_accounts(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(user_id, vendor_code)
);

-- Create bills table
CREATE TABLE bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NULL,
  bill_number TEXT NOT NULL,
  vendor_id UUID NOT NULL REFERENCES vendors(id),
  bill_date DATE NOT NULL,
  due_date DATE NOT NULL,
  amount NUMERIC(15,2) NOT NULL CHECK (amount >= 0),
  paid_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  status TEXT NOT NULL DEFAULT 'draft' 
    CHECK (status IN ('draft', 'pending_approval', 'approved', 'paid', 'partially_paid', 'cancelled', 'overdue')),
  description TEXT,
  reference_number TEXT, -- External reference (vendor invoice number)
  journal_entry_id UUID REFERENCES journal_entries(id),
  fiscal_period_id UUID REFERENCES fiscal_periods(id),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(user_id, bill_number),
  CHECK (due_date >= bill_date),
  CHECK (paid_amount <= amount)
);

-- Create bill_items table (line items for bills)
CREATE TABLE bill_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  rate NUMERIC(15,2) NOT NULL CHECK (rate >= 0),
  amount NUMERIC(15,2) NOT NULL CHECK (amount >= 0),
  account_id UUID REFERENCES chart_of_accounts(id), -- Expense account
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_vendors_user ON vendors(user_id);
CREATE INDEX idx_vendors_active ON vendors(user_id, is_active);
CREATE INDEX idx_vendors_organization ON vendors(organization_id) WHERE organization_id IS NOT NULL;

CREATE INDEX idx_bills_user_date ON bills(user_id, bill_date DESC);
CREATE INDEX idx_bills_vendor ON bills(vendor_id);
CREATE INDEX idx_bills_status ON bills(user_id, status);
CREATE INDEX idx_bills_due_date ON bills(user_id, due_date) WHERE status IN ('approved', 'partially_paid');
CREATE INDEX idx_bills_aging ON bills(user_id, due_date, status) 
  WHERE status IN ('approved', 'partially_paid', 'overdue');
CREATE INDEX idx_bills_organization ON bills(organization_id) WHERE organization_id IS NOT NULL;

CREATE INDEX idx_bill_items_bill ON bill_items(bill_id);
CREATE INDEX idx_bill_items_account ON bill_items(account_id) WHERE account_id IS NOT NULL;

-- Enable RLS
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for vendors
CREATE POLICY "Users can view their own vendors"
ON vendors FOR SELECT
USING (
  (organization_id IS NULL AND auth.uid() = user_id)
  OR (organization_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = vendors.organization_id
    AND om.user_id = auth.uid()
  ))
);

CREATE POLICY "Users can create their own vendors"
ON vendors FOR INSERT
WITH CHECK (
  (organization_id IS NULL AND auth.uid() = user_id)
  OR (organization_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = vendors.organization_id
    AND om.user_id = auth.uid()
    AND om.role IN ('owner', 'admin', 'member')
  ))
);

CREATE POLICY "Users can update their own vendors"
ON vendors FOR UPDATE
USING (
  (organization_id IS NULL AND auth.uid() = user_id)
  OR (organization_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = vendors.organization_id
    AND om.user_id = auth.uid()
    AND om.role IN ('owner', 'admin', 'member')
  ))
);

CREATE POLICY "Users can delete their own vendors"
ON vendors FOR DELETE
USING (
  (organization_id IS NULL AND auth.uid() = user_id)
  OR (organization_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = vendors.organization_id
    AND om.user_id = auth.uid()
    AND om.role IN ('owner', 'admin')
  ))
);

-- RLS policies for bills
CREATE POLICY "Users can view their own bills"
ON bills FOR SELECT
USING (
  (organization_id IS NULL AND auth.uid() = user_id)
  OR (organization_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = bills.organization_id
    AND om.user_id = auth.uid()
  ))
);

CREATE POLICY "Users can create their own bills"
ON bills FOR INSERT
WITH CHECK (
  (organization_id IS NULL AND auth.uid() = user_id)
  OR (organization_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = bills.organization_id
    AND om.user_id = auth.uid()
    AND om.role IN ('owner', 'admin', 'member')
  ))
);

CREATE POLICY "Users can update their own bills"
ON bills FOR UPDATE
USING (
  (organization_id IS NULL AND auth.uid() = user_id)
  OR (organization_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = bills.organization_id
    AND om.user_id = auth.uid()
    AND om.role IN ('owner', 'admin', 'member')
  ))
);

CREATE POLICY "Users can delete their own bills"
ON bills FOR DELETE
USING (
  status = 'draft' AND (
    (organization_id IS NULL AND auth.uid() = user_id)
    OR (organization_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = bills.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    ))
  )
);

-- RLS policies for bill_items
CREATE POLICY "Users can view their bill items"
ON bill_items FOR SELECT
USING (EXISTS (
  SELECT 1 FROM bills b
  WHERE b.id = bill_items.bill_id
  AND (
    (b.organization_id IS NULL AND auth.uid() = b.user_id)
    OR (b.organization_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = b.organization_id
      AND om.user_id = auth.uid()
    ))
  )
));

CREATE POLICY "Users can create bill items"
ON bill_items FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM bills b
  WHERE b.id = bill_items.bill_id
  AND b.status = 'draft'
  AND (
    (b.organization_id IS NULL AND auth.uid() = b.user_id)
    OR (b.organization_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = b.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin', 'member')
    ))
  )
));

CREATE POLICY "Users can update bill items"
ON bill_items FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM bills b
  WHERE b.id = bill_items.bill_id
  AND b.status = 'draft'
  AND (
    (b.organization_id IS NULL AND auth.uid() = b.user_id)
    OR (b.organization_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = b.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin', 'member')
    ))
  )
));

CREATE POLICY "Users can delete bill items"
ON bill_items FOR DELETE
USING (EXISTS (
  SELECT 1 FROM bills b
  WHERE b.id = bill_items.bill_id
  AND b.status = 'draft'
  AND (
    (b.organization_id IS NULL AND auth.uid() = b.user_id)
    OR (b.organization_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = b.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin', 'member')
    ))
  )
));

-- =====================================================================
-- FUNCTION: Generate Vendor Code
-- =====================================================================
CREATE OR REPLACE FUNCTION generate_vendor_code(p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_seq INTEGER;
  v_code TEXT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(vendor_code FROM 'VEN-(\d+)') AS INTEGER)), 0) + 1
  INTO v_seq
  FROM vendors
  WHERE user_id = p_user_id
    AND vendor_code LIKE 'VEN-%';
  
  v_code := 'VEN-' || LPAD(v_seq::TEXT, 5, '0');
  
  RETURN v_code;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- FUNCTION: Generate Bill Number
-- =====================================================================
CREATE OR REPLACE FUNCTION generate_bill_number(p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_year INTEGER;
  v_seq INTEGER;
  v_bill_number TEXT;
BEGIN
  v_year := EXTRACT(YEAR FROM CURRENT_DATE);
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(bill_number FROM 'BILL-\d{4}-(\d+)') AS INTEGER)), 0) + 1
  INTO v_seq
  FROM bills
  WHERE user_id = p_user_id
    AND bill_number LIKE 'BILL-' || v_year || '-%';
  
  v_bill_number := 'BILL-' || v_year || '-' || LPAD(v_seq::TEXT, 4, '0');
  
  RETURN v_bill_number;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- FUNCTION: Create Bill with Journal Entry
-- =====================================================================
CREATE OR REPLACE FUNCTION create_bill_with_journal(
  p_bill_id UUID,
  p_ap_account_id UUID -- Accounts Payable account from COA
)
RETURNS bills AS $$
DECLARE
  v_bill bills;
  v_entry_id UUID;
  v_item RECORD;
  v_total_amount NUMERIC;
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
  
  IF v_bill.status != 'draft' THEN
    RAISE EXCEPTION 'Can only create journal entry for draft bills';
  END IF;
  
  IF v_bill.journal_entry_id IS NOT NULL THEN
    RAISE EXCEPTION 'Bill already has a journal entry';
  END IF;
  
  -- Calculate total from items
  SELECT COALESCE(SUM(amount), 0) INTO v_total_amount
  FROM bill_items
  WHERE bill_id = p_bill_id;
  
  IF v_total_amount = 0 THEN
    RAISE EXCEPTION 'Cannot create journal entry for bill with no items';
  END IF;
  
  -- Update bill amount
  UPDATE bills
  SET amount = v_total_amount
  WHERE id = p_bill_id;
  
  -- Create journal entry
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
    v_bill.bill_date,
    'Bill: ' || v_bill.bill_number || ' - ' || COALESCE(v_bill.description, ''),
    'bill',
    p_bill_id
  );
  
  -- Create journal entry lines
  -- Debit: Expense accounts (from bill items)
  FOR v_item IN
    SELECT account_id, SUM(amount) as total_amount
    FROM bill_items
    WHERE bill_id = p_bill_id AND account_id IS NOT NULL
    GROUP BY account_id
  LOOP
    INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description)
    VALUES (
      v_entry_id,
      v_item.account_id,
      v_item.total_amount,
      0,
      'Bill expense'
    );
  END LOOP;
  
  -- Credit: Accounts Payable
  INSERT INTO journal_entry_lines (entry_id, account_id, debit, credit, description)
  VALUES (
    v_entry_id,
    p_ap_account_id,
    0,
    v_total_amount,
    'Accounts Payable'
  );
  
  -- Update bill with journal entry reference
  UPDATE bills
  SET 
    journal_entry_id = v_entry_id,
    status = 'pending_approval',
    updated_at = NOW()
  WHERE id = p_bill_id
  RETURNING * INTO v_bill;
  
  RETURN v_bill;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- FUNCTION: Approve Bill
-- =====================================================================
CREATE OR REPLACE FUNCTION approve_bill(p_bill_id UUID)
RETURNS bills AS $$
DECLARE
  v_bill bills;
BEGIN
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
  
  IF v_bill.status NOT IN ('draft', 'pending_approval') THEN
    RAISE EXCEPTION 'Bill is not in approvable status';
  END IF;
  
  -- Post the journal entry if exists
  IF v_bill.journal_entry_id IS NOT NULL THEN
    PERFORM post_journal_entry(v_bill.journal_entry_id);
  END IF;
  
  -- Update bill status
  UPDATE bills
  SET 
    status = 'approved',
    approved_by = auth.uid(),
    approved_at = NOW(),
    updated_at = NOW()
  WHERE id = p_bill_id
  RETURNING * INTO v_bill;
  
  RETURN v_bill;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- TRIGGER: Auto-update Overdue Status
-- =====================================================================
CREATE OR REPLACE FUNCTION update_bill_overdue_status()
RETURNS void AS $$
BEGIN
  UPDATE bills
  SET status = 'overdue'
  WHERE status IN ('approved', 'partially_paid')
    AND due_date < CURRENT_DATE
    AND paid_amount < amount;
END;
$$ LANGUAGE plpgsql;

-- Schedule this to run daily (requires pg_cron or application-level scheduler)
-- For now, it can be called manually or from application code

-- =====================================================================
-- GRANT PERMISSIONS
-- =====================================================================
GRANT EXECUTE ON FUNCTION generate_vendor_code TO authenticated;
GRANT EXECUTE ON FUNCTION generate_bill_number TO authenticated;
GRANT EXECUTE ON FUNCTION create_bill_with_journal TO authenticated;
GRANT EXECUTE ON FUNCTION approve_bill TO authenticated;
GRANT EXECUTE ON FUNCTION update_bill_overdue_status TO authenticated;

-- =====================================================================
-- ADD TRIGGERS FOR UPDATED_AT
-- =====================================================================
CREATE TRIGGER update_vendors_updated_at
BEFORE UPDATE ON vendors
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bills_updated_at
BEFORE UPDATE ON bills
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================
-- COMMENTS
-- =====================================================================
COMMENT ON TABLE vendors IS 'Vendor master data for accounts payable system.';
COMMENT ON TABLE bills IS 'Bills (vendor invoices) for tracking accounts payable.';
COMMENT ON TABLE bill_items IS 'Line items for bills with expense account allocation.';
COMMENT ON FUNCTION create_bill_with_journal IS 'Creates journal entry for a bill. Debits expense accounts, credits AP.';
COMMENT ON FUNCTION approve_bill IS 'Approves a bill and posts its journal entry.';
COMMENT ON COLUMN bills.paid_amount IS 'Total amount paid against this bill. Updated by payment allocations.';
COMMENT ON COLUMN bills.status IS 'Bill workflow: draft → pending_approval → approved → (partially_paid) → paid';
