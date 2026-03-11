-- Migration: atomic bank balance update RPC
-- Fixes race condition where concurrent imports read-modify-write the balance
-- non-atomically, causing lost updates.
--
-- Usage: SELECT update_bank_balance_atomic(account_id, delta_amount)
--   delta_amount is positive for credits, negative for debits.

CREATE OR REPLACE FUNCTION public.update_bank_balance_atomic(
  p_account_id UUID,
  p_delta      NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance NUMERIC;
BEGIN
  UPDATE bank_accounts
  SET    balance = balance + p_delta,
         updated_at = NOW()
  WHERE  id = p_account_id
  RETURNING balance INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bank account % not found', p_account_id;
  END IF;

  RETURN v_new_balance;
END;
$$;

-- Grant execute to authenticated users only (RLS on bank_accounts still applies)
GRANT EXECUTE ON FUNCTION public.update_bank_balance_atomic(UUID, NUMERIC) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.update_bank_balance_atomic(UUID, NUMERIC) FROM anon;
