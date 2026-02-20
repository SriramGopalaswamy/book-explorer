
-- ============================================================
-- STAGE 5: WORKFLOW REPAIR (CORRECTED)
-- Purpose: Fix leave balances, attendance self-service,
--          reimbursement-expense linkage
-- ============================================================

-- ==========================================
-- 5A: LEAVE MANAGEMENT
-- ==========================================

-- Step 1: Seed leave_balances for all active employees (valid types only)
INSERT INTO public.leave_balances (user_id, profile_id, organization_id, leave_type, total_days, used_days, year)
SELECT 
  p.user_id,
  p.id,
  p.organization_id,
  lt.leave_type,
  lt.default_days,
  0,
  EXTRACT(YEAR FROM CURRENT_DATE)::int
FROM public.profiles p
CROSS JOIN (
  VALUES 
    ('casual', 12),
    ('sick', 12),
    ('earned', 15),
    ('maternity', 180),
    ('paternity', 15),
    ('wfh', 0)
) AS lt(leave_type, default_days)
WHERE p.status = 'active'
  AND p.user_id IS NOT NULL
ON CONFLICT (profile_id, leave_type, year) DO NOTHING;

-- Step 2: Leave approval → decrement balance trigger
CREATE OR REPLACE FUNCTION public.decrement_leave_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD IS NULL OR OLD.status != 'approved') THEN
    UPDATE public.leave_balances
    SET used_days = used_days + NEW.days,
        updated_at = now()
    WHERE user_id = NEW.user_id
      AND leave_type = NEW.leave_type
      AND year = EXTRACT(YEAR FROM NEW.from_date)::int;
    
    IF NOT FOUND THEN
      RAISE WARNING 'No leave balance found for user % type % year %', 
        NEW.user_id, NEW.leave_type, EXTRACT(YEAR FROM NEW.from_date)::int;
    END IF;
  END IF;

  IF OLD IS NOT NULL AND OLD.status = 'approved' AND NEW.status != 'approved' THEN
    UPDATE public.leave_balances
    SET used_days = GREATEST(used_days - OLD.days, 0),
        updated_at = now()
    WHERE user_id = OLD.user_id
      AND leave_type = OLD.leave_type
      AND year = EXTRACT(YEAR FROM OLD.from_date)::int;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_decrement_leave_balance
  AFTER UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.decrement_leave_balance();

-- Step 3: Leave request validation
CREATE OR REPLACE FUNCTION public.validate_leave_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _available INT;
BEGIN
  -- Skip validation for wfh
  IF NEW.leave_type = 'wfh' THEN
    RETURN NEW;
  END IF;

  SELECT (total_days - used_days) INTO _available
  FROM public.leave_balances
  WHERE user_id = NEW.user_id
    AND leave_type = NEW.leave_type
    AND year = EXTRACT(YEAR FROM NEW.from_date)::int;

  IF _available IS NOT NULL AND NEW.days > _available THEN
    RAISE EXCEPTION 'Insufficient leave balance. Available: %, Requested: %', _available, NEW.days;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_leave_request
  BEFORE INSERT ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.validate_leave_request();

-- Step 4: Prevent negative leave balance
ALTER TABLE public.leave_balances 
  ADD CONSTRAINT chk_non_negative_balance 
  CHECK (used_days >= 0);

-- ==========================================
-- 5B: ATTENDANCE SELF-SERVICE
-- ==========================================

-- Fix: Allow employees to insert their own attendance
DROP POLICY IF EXISTS "Admins and HR can insert attendance" ON public.attendance_records;

CREATE POLICY "Users can insert own attendance"
  ON public.attendance_records FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins and HR can insert any attendance"
  ON public.attendance_records FOR INSERT
  WITH CHECK (is_admin_or_hr(auth.uid()));

-- ==========================================
-- 5C: REIMBURSEMENT → EXPENSE LINKAGE
-- ==========================================

-- Auto-create expense when reimbursement is finance-approved
CREATE OR REPLACE FUNCTION public.link_reimbursement_to_expense()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _expense_id UUID;
BEGIN
  IF NEW.status = 'approved' AND (OLD IS NULL OR OLD.status != 'approved') THEN
    IF NEW.expense_id IS NULL THEN
      INSERT INTO public.expenses (
        user_id, organization_id, category, amount, expense_date, 
        description, status, notes
      ) VALUES (
        NEW.user_id, NEW.organization_id,
        COALESCE(NEW.category, 'Reimbursement'),
        NEW.amount,
        COALESCE(NEW.expense_date, CURRENT_DATE),
        COALESCE(NEW.description, 'Reimbursement claim'),
        'approved',
        'Auto-created from reimbursement ' || NEW.id::text
      )
      RETURNING id INTO _expense_id;

      NEW.expense_id := _expense_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_link_reimbursement_expense
  BEFORE UPDATE ON public.reimbursement_requests
  FOR EACH ROW EXECUTE FUNCTION public.link_reimbursement_to_expense();

-- Backfill existing approved reimbursements
DO $$
DECLARE
  r RECORD;
  _expense_id UUID;
BEGIN
  FOR r IN 
    SELECT * FROM public.reimbursement_requests 
    WHERE status = 'approved' AND expense_id IS NULL
  LOOP
    INSERT INTO public.expenses (
      user_id, organization_id, category, amount, expense_date,
      description, status, notes
    ) VALUES (
      r.user_id, r.organization_id,
      COALESCE(r.category, 'Reimbursement'),
      r.amount,
      COALESCE(r.expense_date, CURRENT_DATE),
      COALESCE(r.description, 'Reimbursement claim'),
      'approved',
      'Backfill from reimbursement ' || r.id::text
    )
    RETURNING id INTO _expense_id;

    UPDATE public.reimbursement_requests 
    SET expense_id = _expense_id 
    WHERE id = r.id;
  END LOOP;
END $$;
