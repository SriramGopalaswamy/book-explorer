-- ═══════════════════════════════════════════════════════════════
-- FIX: TERMINAL STATE DEFINITIONS — align with actual CHECK constraints
--
-- Problems corrected:
-- 1. payroll_runs: 'approved' was incorrectly listed as a terminal state,
--    blocking the valid approved → locked transition.
--    Correct terminals: ['paid', 'locked'] only.
--
-- 2. goods_receipts: terminal states referenced 'completed' and 'cancelled',
--    neither of which can exist in the table (CHECK constraint only allows
--    'draft','inspecting','accepted','rejected'). Correct terminals: ['accepted','rejected'].
--
-- 3. delivery_notes: terminal states referenced 'cancelled', which is not
--    in the CHECK constraint ('draft','dispatched','in_transit','delivered','returned').
--    Correct terminals: ['delivered','returned'].
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.enforce_terminal_state()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  terminal_states text[];
BEGIN
  -- Define terminal states per table — must EXACTLY match the column's CHECK constraint
  terminal_states := CASE TG_TABLE_NAME
    WHEN 'invoices'          THEN ARRAY['paid', 'cancelled', 'void']
    WHEN 'bills'             THEN ARRAY['paid', 'cancelled', 'void']
    WHEN 'purchase_orders'   THEN ARRAY['closed', 'cancelled']
    WHEN 'sales_orders'      THEN ARRAY['closed', 'cancelled']
    -- delivery_notes CHECK: ('draft','dispatched','in_transit','delivered','returned')
    -- 'cancelled' is NOT a valid status for delivery_notes
    WHEN 'delivery_notes'    THEN ARRAY['delivered', 'returned']
    -- goods_receipts CHECK: ('draft','inspecting','accepted','rejected')
    -- 'completed' and 'cancelled' are NOT valid statuses for goods_receipts
    WHEN 'goods_receipts'    THEN ARRAY['accepted', 'rejected']
    WHEN 'work_orders'       THEN ARRAY['completed', 'cancelled']
    WHEN 'stock_transfers'   THEN ARRAY['completed', 'received', 'cancelled']
    WHEN 'purchase_returns'  THEN ARRAY['completed', 'closed', 'cancelled']
    WHEN 'sales_returns'     THEN ARRAY['completed', 'closed', 'cancelled']
    WHEN 'vendor_payments'   THEN ARRAY['completed', 'cancelled']
    WHEN 'payment_receipts'  THEN ARRAY['completed', 'cancelled']
    -- payroll_runs: 'approved' is NOT terminal — approved → locked is a valid business step.
    -- Only 'paid' and 'locked' are genuinely irreversible.
    WHEN 'payroll_runs'      THEN ARRAY['paid', 'locked']
    WHEN 'stock_adjustments' THEN ARRAY['completed', 'cancelled']
    ELSE ARRAY['__none__']
  END;

  -- For UPDATE: block if OLD status is terminal
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = ANY(terminal_states) THEN
      RAISE EXCEPTION '% record (id: %) is in terminal state "%" and cannot be modified. Create a reversal or adjustment instead.',
        TG_TABLE_NAME, OLD.id, OLD.status;
    END IF;
    RETURN NEW;
  END IF;

  -- For DELETE: block if status is terminal
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = ANY(terminal_states) THEN
      RAISE EXCEPTION '% record (id: %) is in terminal state "%" and cannot be deleted.',
        TG_TABLE_NAME, OLD.id, OLD.status;
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

-- Re-apply triggers to ensure the new function definition is active
-- (triggers are already bound by name; replacing the function is sufficient,
--  but we re-attach to be safe after any prior DROP/CREATE cycles)
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'invoices', 'bills', 'purchase_orders', 'sales_orders',
    'delivery_notes', 'goods_receipts', 'work_orders',
    'stock_transfers', 'purchase_returns', 'sales_returns',
    'vendor_payments', 'payment_receipts', 'payroll_runs',
    'stock_adjustments'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_enforce_terminal_state ON public.%I', tbl);
    EXECUTE format(
      'CREATE TRIGGER trg_enforce_terminal_state
       BEFORE UPDATE OR DELETE ON public.%I
       FOR EACH ROW
       EXECUTE FUNCTION public.enforce_terminal_state()',
      tbl
    );
  END LOOP;
END;
$$;
