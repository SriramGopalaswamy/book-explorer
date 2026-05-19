BEGIN;

-- GBC-136: Banking — two-step insert+balance-update must be atomic.
-- Replaces the client-side sequential calls in useCreateTransaction with a
-- single SECURITY DEFINER function that inserts the row and updates the
-- account balance in one transaction, eliminating the torn-write window.

CREATE OR REPLACE FUNCTION public.record_bank_transaction(
  p_org_id          uuid,
  p_account_id      uuid,
  p_transaction_type text,   -- 'credit' | 'debit'
  p_amount          numeric,
  p_description     text,
  p_category        text,
  p_transaction_date date,
  p_user_id         uuid
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_account  RECORD;
  v_new_bal  numeric;
  v_txn_id   uuid;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: must be positive';
  END IF;

  IF p_transaction_type NOT IN ('credit', 'debit') THEN
    RAISE EXCEPTION 'INVALID_TYPE: must be credit or debit';
  END IF;

  -- Lock the account row for this org
  SELECT id, balance, status
    INTO v_account
    FROM bank_accounts
   WHERE id = p_account_id
     AND organization_id = p_org_id
     FOR UPDATE;

  IF v_account.id IS NULL THEN
    RAISE EXCEPTION 'ACCOUNT_NOT_FOUND';
  END IF;

  IF v_account.status = 'Closed' THEN
    RAISE EXCEPTION 'ACCOUNT_CLOSED: cannot add transactions to a closed account';
  END IF;

  v_new_bal := CASE
    WHEN p_transaction_type = 'credit' THEN COALESCE(v_account.balance, 0) + p_amount
    ELSE                                     COALESCE(v_account.balance, 0) - p_amount
  END;

  INSERT INTO bank_transactions (
    account_id, transaction_type, amount, description,
    category, transaction_date, user_id, organization_id
  ) VALUES (
    p_account_id, p_transaction_type, p_amount, p_description,
    p_category, p_transaction_date, p_user_id, p_org_id
  ) RETURNING id INTO v_txn_id;

  UPDATE bank_accounts
     SET balance    = v_new_bal,
         updated_at = now()
   WHERE id = p_account_id
     AND organization_id = p_org_id;

  RETURN v_txn_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_bank_transaction(
  uuid, uuid, text, numeric, text, text, date, uuid
) TO authenticated;

COMMIT;
