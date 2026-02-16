-- Fix CRITICAL Issue #3: Make invoice creation atomic
-- This migration adds a PostgreSQL function to create invoices with items atomically

-- Function to create invoice with items in a single transaction
CREATE OR REPLACE FUNCTION create_invoice_with_items(
  p_client_name TEXT,
  p_client_email TEXT,
  p_amount NUMERIC,
  p_due_date DATE,
  p_items JSONB
) RETURNS UUID AS $$
DECLARE
  v_invoice_id UUID;
  v_invoice_number TEXT;
  v_count INTEGER;
BEGIN
  -- Generate invoice number atomically
  SELECT COUNT(*) INTO v_count
  FROM invoices
  WHERE user_id = auth.uid()
    AND invoice_number LIKE 'INV-' || EXTRACT(YEAR FROM CURRENT_DATE) || '-%';
  
  v_invoice_number := 'INV-' || EXTRACT(YEAR FROM CURRENT_DATE) || '-' || LPAD((v_count + 1)::TEXT, 3, '0');
  
  -- Insert invoice
  INSERT INTO invoices (
    user_id,
    invoice_number,
    client_name,
    client_email,
    amount,
    due_date,
    status
  ) VALUES (
    auth.uid(),
    v_invoice_number,
    p_client_name,
    p_client_email,
    p_amount,
    p_due_date,
    'draft'
  )
  RETURNING id INTO v_invoice_id;
  
  -- Insert items (all or nothing)
  IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
    INSERT INTO invoice_items (invoice_id, description, quantity, rate, amount)
    SELECT 
      v_invoice_id,
      item->>'description',
      COALESCE((item->>'quantity')::INTEGER, 1),
      (item->>'rate')::NUMERIC,
      (item->>'amount')::NUMERIC
    FROM jsonb_array_elements(p_items) AS item;
  END IF;
  
  RETURN v_invoice_id;
EXCEPTION
  WHEN OTHERS THEN
    -- Rollback happens automatically in PostgreSQL functions
    RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION create_invoice_with_items TO authenticated;

-- Function to update invoice with items atomically
CREATE OR REPLACE FUNCTION update_invoice_with_items(
  p_invoice_id UUID,
  p_client_name TEXT,
  p_client_email TEXT,
  p_amount NUMERIC,
  p_due_date DATE,
  p_items JSONB
) RETURNS UUID AS $$
BEGIN
  -- Update invoice
  UPDATE invoices
  SET 
    client_name = p_client_name,
    client_email = p_client_email,
    amount = p_amount,
    due_date = p_due_date,
    updated_at = NOW()
  WHERE id = p_invoice_id
    AND user_id = auth.uid();
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found or access denied';
  END IF;
  
  -- Delete existing items
  DELETE FROM invoice_items
  WHERE invoice_id = p_invoice_id;
  
  -- Insert new items (all or nothing)
  IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
    INSERT INTO invoice_items (invoice_id, description, quantity, rate, amount)
    SELECT 
      p_invoice_id,
      item->>'description',
      COALESCE((item->>'quantity')::INTEGER, 1),
      (item->>'rate')::NUMERIC,
      (item->>'amount')::NUMERIC
    FROM jsonb_array_elements(p_items) AS item;
  END IF;
  
  RETURN p_invoice_id;
EXCEPTION
  WHEN OTHERS THEN
    -- Rollback happens automatically
    RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION update_invoice_with_items TO authenticated;

-- Add comment documenting the fix
COMMENT ON FUNCTION create_invoice_with_items IS 'Atomically creates an invoice with items to prevent orphaned records. Addresses CRITICAL Issue #3 from system audit.';
COMMENT ON FUNCTION update_invoice_with_items IS 'Atomically updates an invoice and its items. Addresses CRITICAL Issue #3 from system audit.';
