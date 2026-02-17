-- =====================================================================
-- PHASE 1: ACCOUNTING INTEGRITY LAYER - Journal Entries
-- =====================================================================
-- Migration: 20260217103000_phase1_journal_entries.sql
-- Description: Implements double-entry general ledger system
-- Dependencies: chart_of_accounts, fiscal_periods
-- Backward Compatible: YES (additive only)
-- =====================================================================

-- Create journal_entries table
CREATE TABLE journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NULL, -- For future multi-org support
  entry_number TEXT NOT NULL,
  entry_date DATE NOT NULL,
  description TEXT NOT NULL,
  reference_type TEXT CHECK (reference_type IN ('invoice', 'bill', 'payment', 'adjustment', 'opening_balance', 'accrual', 'other')),
  reference_id UUID, -- Link to source document
  posted BOOLEAN NOT NULL DEFAULT false,
  posted_at TIMESTAMP WITH TIME ZONE,
  posted_by UUID REFERENCES auth.users(id),
  reversed BOOLEAN NOT NULL DEFAULT false,
  reversal_of UUID REFERENCES journal_entries(id),
  fiscal_period_id UUID REFERENCES fiscal_periods(id),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(user_id, entry_number),
  CHECK (posted = false OR (posted = true AND posted_by IS NOT NULL AND posted_at IS NOT NULL)),
  CHECK (reversed = false OR (reversed = true AND reversal_of IS NOT NULL))
);

-- Create journal_entry_lines table
CREATE TABLE journal_entry_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES chart_of_accounts(id),
  cost_center_id UUID NULL, -- Will be populated when cost_centers table is created in Phase 2
  debit NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)),
  CHECK (debit != credit)
);

-- Create indexes for performance
CREATE INDEX idx_journal_entries_user_date ON journal_entries(user_id, entry_date DESC);
CREATE INDEX idx_journal_entries_posted ON journal_entries(posted, entry_date DESC);
CREATE INDEX idx_journal_entries_fiscal_period ON journal_entries(fiscal_period_id);
CREATE INDEX idx_journal_entries_reference ON journal_entries(reference_type, reference_id);
CREATE INDEX idx_journal_entries_organization ON journal_entries(organization_id) WHERE organization_id IS NOT NULL;

CREATE INDEX idx_journal_entry_lines_entry ON journal_entry_lines(entry_id);
CREATE INDEX idx_journal_entry_lines_account ON journal_entry_lines(account_id, entry_id);
CREATE INDEX idx_journal_entry_lines_cost_center ON journal_entry_lines(cost_center_id) WHERE cost_center_id IS NOT NULL;

-- Enable RLS
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entry_lines ENABLE ROW LEVEL SECURITY;

-- RLS policies for journal_entries
CREATE POLICY "Users can view their own journal entries"
ON journal_entries FOR SELECT
USING (
  (organization_id IS NULL AND auth.uid() = user_id)
  OR (organization_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = journal_entries.organization_id
    AND om.user_id = auth.uid()
  ))
);

CREATE POLICY "Users can create their own journal entries"
ON journal_entries FOR INSERT
WITH CHECK (
  (organization_id IS NULL AND auth.uid() = user_id)
  OR (organization_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = journal_entries.organization_id
    AND om.user_id = auth.uid()
    AND om.role IN ('owner', 'admin', 'member')
  ))
);

CREATE POLICY "Users can update their own unposted journal entries"
ON journal_entries FOR UPDATE
USING (
  posted = false AND (
    (organization_id IS NULL AND auth.uid() = user_id)
    OR (organization_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = journal_entries.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin', 'member')
    ))
  )
);

CREATE POLICY "Users can delete their own unposted journal entries"
ON journal_entries FOR DELETE
USING (
  posted = false AND reversed = false AND (
    (organization_id IS NULL AND auth.uid() = user_id)
    OR (organization_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = journal_entries.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    ))
  )
);

-- RLS policies for journal_entry_lines
CREATE POLICY "Users can view their journal entry lines"
ON journal_entry_lines FOR SELECT
USING (EXISTS (
  SELECT 1 FROM journal_entries je
  WHERE je.id = journal_entry_lines.entry_id
  AND (
    (je.organization_id IS NULL AND auth.uid() = je.user_id)
    OR (je.organization_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = je.organization_id
      AND om.user_id = auth.uid()
    ))
  )
));

CREATE POLICY "Users can create journal entry lines"
ON journal_entry_lines FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM journal_entries je
  WHERE je.id = journal_entry_lines.entry_id
  AND je.posted = false
  AND (
    (je.organization_id IS NULL AND auth.uid() = je.user_id)
    OR (je.organization_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = je.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin', 'member')
    ))
  )
));

CREATE POLICY "Users can update their unposted journal entry lines"
ON journal_entry_lines FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM journal_entries je
  WHERE je.id = journal_entry_lines.entry_id
  AND je.posted = false
  AND (
    (je.organization_id IS NULL AND auth.uid() = je.user_id)
    OR (je.organization_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = je.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin', 'member')
    ))
  )
));

CREATE POLICY "Users can delete their unposted journal entry lines"
ON journal_entry_lines FOR DELETE
USING (EXISTS (
  SELECT 1 FROM journal_entries je
  WHERE je.id = journal_entry_lines.entry_id
  AND je.posted = false
  AND (
    (je.organization_id IS NULL AND auth.uid() = je.user_id)
    OR (je.organization_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = je.organization_id
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin', 'member')
    ))
  )
));

-- =====================================================================
-- TRIGGER: Validate Journal Entry Balance
-- =====================================================================
CREATE OR REPLACE FUNCTION validate_journal_entry_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_total_debits NUMERIC;
  v_total_credits NUMERIC;
  v_entry_id UUID;
BEGIN
  -- Get the entry_id
  IF TG_OP = 'DELETE' THEN
    v_entry_id := OLD.entry_id;
  ELSE
    v_entry_id := NEW.entry_id;
  END IF;
  
  -- Calculate totals
  SELECT 
    COALESCE(SUM(debit), 0),
    COALESCE(SUM(credit), 0)
  INTO v_total_debits, v_total_credits
  FROM journal_entry_lines
  WHERE entry_id = v_entry_id;
  
  -- Validate balance (allow zero for empty entries being built)
  IF v_total_debits != 0 OR v_total_credits != 0 THEN
    IF v_total_debits != v_total_credits THEN
      RAISE EXCEPTION 'Journal entry out of balance: Debits=% Credits=%', 
        v_total_debits, v_total_credits
        USING HINT = 'Total debits must equal total credits';
    END IF;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_journal_balance
AFTER INSERT OR UPDATE OR DELETE ON journal_entry_lines
FOR EACH ROW EXECUTE FUNCTION validate_journal_entry_balance();

-- =====================================================================
-- TRIGGER: Prevent Modification of Posted Entries
-- =====================================================================
CREATE OR REPLACE FUNCTION prevent_posted_entry_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.posted = true THEN
    RAISE EXCEPTION 'Cannot modify posted journal entry. Create a reversal entry instead.'
      USING HINT = 'Use the reverse_journal_entry() function to reverse this entry';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_posted_modification
BEFORE UPDATE OF entry_date, description, reference_type, reference_id ON journal_entries
FOR EACH ROW EXECUTE FUNCTION prevent_posted_entry_modification();

-- =====================================================================
-- TRIGGER: Prevent Deletion of Posted Entries
-- =====================================================================
CREATE OR REPLACE FUNCTION prevent_posted_entry_deletion()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.posted = true THEN
    RAISE EXCEPTION 'Cannot delete posted journal entry. Create a reversal entry instead.'
      USING HINT = 'Use the reverse_journal_entry() function to reverse this entry';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_posted_deletion
BEFORE DELETE ON journal_entries
FOR EACH ROW EXECUTE FUNCTION prevent_posted_entry_deletion();

-- =====================================================================
-- TRIGGER: Fiscal Period Locking for Journal Entries
-- =====================================================================
CREATE OR REPLACE FUNCTION check_journal_entry_period_lock()
RETURNS TRIGGER AS $$
DECLARE
  v_entry_date DATE;
  v_user_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_entry_date := OLD.entry_date;
    v_user_id := OLD.user_id;
  ELSE
    v_entry_date := NEW.entry_date;
    v_user_id := NEW.user_id;
  END IF;
  
  -- Check if period is locked (reuse existing function)
  IF is_period_locked(v_user_id, v_entry_date) THEN
    RAISE EXCEPTION 'Cannot % journal entry in closed fiscal period (Date: %). Period must be reopened first.',
      TG_OP, v_entry_date;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_closed_period_journal_entries
BEFORE INSERT OR UPDATE OR DELETE ON journal_entries
FOR EACH ROW EXECUTE FUNCTION check_journal_entry_period_lock();

-- =====================================================================
-- FUNCTION: Generate Entry Number
-- =====================================================================
CREATE OR REPLACE FUNCTION generate_entry_number(p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_year INTEGER;
  v_seq INTEGER;
  v_entry_number TEXT;
BEGIN
  v_year := EXTRACT(YEAR FROM CURRENT_DATE);
  
  -- Get next sequence number for this year
  SELECT COALESCE(MAX(CAST(SUBSTRING(entry_number FROM 'JE-\d{4}-(\d+)') AS INTEGER)), 0) + 1
  INTO v_seq
  FROM journal_entries
  WHERE user_id = p_user_id
    AND entry_number LIKE 'JE-' || v_year || '-%';
  
  v_entry_number := 'JE-' || v_year || '-' || LPAD(v_seq::TEXT, 4, '0');
  
  RETURN v_entry_number;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- FUNCTION: Post Journal Entry
-- =====================================================================
CREATE OR REPLACE FUNCTION post_journal_entry(p_entry_id UUID)
RETURNS journal_entries AS $$
DECLARE
  v_entry journal_entries;
  v_total_debits NUMERIC;
  v_total_credits NUMERIC;
BEGIN
  -- Get entry
  SELECT * INTO v_entry
  FROM journal_entries
  WHERE id = p_entry_id
    AND (user_id = auth.uid() OR EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = journal_entries.organization_id
      AND om.user_id = auth.uid()
    ));
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Journal entry not found or access denied';
  END IF;
  
  IF v_entry.posted THEN
    RAISE EXCEPTION 'Journal entry is already posted';
  END IF;
  
  -- Validate balance
  SELECT 
    COALESCE(SUM(debit), 0),
    COALESCE(SUM(credit), 0)
  INTO v_total_debits, v_total_credits
  FROM journal_entry_lines
  WHERE entry_id = p_entry_id;
  
  IF v_total_debits = 0 AND v_total_credits = 0 THEN
    RAISE EXCEPTION 'Cannot post empty journal entry';
  END IF;
  
  IF v_total_debits != v_total_credits THEN
    RAISE EXCEPTION 'Journal entry out of balance: Debits=% Credits=%', 
      v_total_debits, v_total_credits;
  END IF;
  
  -- Check fiscal period
  IF is_period_locked(v_entry.user_id, v_entry.entry_date) THEN
    RAISE EXCEPTION 'Cannot post journal entry in closed fiscal period';
  END IF;
  
  -- Post the entry
  UPDATE journal_entries
  SET 
    posted = true,
    posted_by = auth.uid(),
    posted_at = NOW(),
    updated_at = NOW()
  WHERE id = p_entry_id
  RETURNING * INTO v_entry;
  
  RETURN v_entry;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- FUNCTION: Reverse Journal Entry
-- =====================================================================
CREATE OR REPLACE FUNCTION reverse_journal_entry(
  p_entry_id UUID,
  p_reversal_date DATE DEFAULT CURRENT_DATE,
  p_reason TEXT DEFAULT NULL
)
RETURNS journal_entries AS $$
DECLARE
  v_original_entry journal_entries;
  v_reversal_entry journal_entries;
  v_reversal_id UUID;
  v_line RECORD;
BEGIN
  -- Get original entry
  SELECT * INTO v_original_entry
  FROM journal_entries
  WHERE id = p_entry_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Journal entry not found';
  END IF;
  
  IF NOT v_original_entry.posted THEN
    RAISE EXCEPTION 'Can only reverse posted journal entries';
  END IF;
  
  IF v_original_entry.reversed THEN
    RAISE EXCEPTION 'Journal entry has already been reversed';
  END IF;
  
  -- Check fiscal period for reversal date
  IF is_period_locked(v_original_entry.user_id, p_reversal_date) THEN
    RAISE EXCEPTION 'Cannot create reversal in closed fiscal period';
  END IF;
  
  -- Create reversal entry
  v_reversal_id := gen_random_uuid();
  
  INSERT INTO journal_entries (
    id, user_id, organization_id, entry_number, entry_date,
    description, reference_type, reference_id, reversal_of
  )
  VALUES (
    v_reversal_id,
    v_original_entry.user_id,
    v_original_entry.organization_id,
    generate_entry_number(v_original_entry.user_id),
    p_reversal_date,
    'REVERSAL: ' || v_original_entry.description || 
      COALESCE(' - Reason: ' || p_reason, ''),
    v_original_entry.reference_type,
    v_original_entry.reference_id,
    p_entry_id
  )
  RETURNING * INTO v_reversal_entry;
  
  -- Copy lines with reversed debit/credit
  FOR v_line IN
    SELECT * FROM journal_entry_lines
    WHERE entry_id = p_entry_id
  LOOP
    INSERT INTO journal_entry_lines (
      entry_id, account_id, cost_center_id, debit, credit, description
    )
    VALUES (
      v_reversal_id,
      v_line.account_id,
      v_line.cost_center_id,
      v_line.credit, -- Swap
      v_line.debit,  -- Swap
      'REVERSAL: ' || COALESCE(v_line.description, '')
    );
  END LOOP;
  
  -- Mark original as reversed
  UPDATE journal_entries
  SET reversed = true, updated_at = NOW()
  WHERE id = p_entry_id;
  
  -- Auto-post the reversal
  PERFORM post_journal_entry(v_reversal_id);
  
  -- Return the reversal entry
  SELECT * INTO v_reversal_entry
  FROM journal_entries
  WHERE id = v_reversal_id;
  
  RETURN v_reversal_entry;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- GRANT PERMISSIONS
-- =====================================================================
GRANT EXECUTE ON FUNCTION generate_entry_number TO authenticated;
GRANT EXECUTE ON FUNCTION post_journal_entry TO authenticated;
GRANT EXECUTE ON FUNCTION reverse_journal_entry TO authenticated;

-- =====================================================================
-- ADD TRIGGERS FOR UPDATED_AT
-- =====================================================================
CREATE TRIGGER update_journal_entries_updated_at
BEFORE UPDATE ON journal_entries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================
-- COMMENTS
-- =====================================================================
COMMENT ON TABLE journal_entries IS 'Double-entry general ledger journal entries. Core of the accounting system.';
COMMENT ON TABLE journal_entry_lines IS 'Individual debit/credit lines for journal entries. Must balance.';
COMMENT ON FUNCTION post_journal_entry IS 'Posts a journal entry, making it immutable. Validates balance and fiscal period.';
COMMENT ON FUNCTION reverse_journal_entry IS 'Creates a reversal entry for a posted journal entry. Original entry is marked as reversed.';
COMMENT ON COLUMN journal_entries.posted IS 'Once posted, entry becomes immutable and can only be reversed.';
COMMENT ON COLUMN journal_entries.reversed IS 'True if this entry has been reversed by another entry.';
COMMENT ON COLUMN journal_entry_lines.debit IS 'Debit amount (asset/expense increases). Must be > 0 if credit = 0.';
COMMENT ON COLUMN journal_entry_lines.credit IS 'Credit amount (liability/equity/revenue increases). Must be > 0 if debit = 0.';
