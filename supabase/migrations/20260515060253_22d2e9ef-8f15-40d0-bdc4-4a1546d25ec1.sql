
-- ============================================================
-- Session 9 — 8-issue consolidated migration
-- ============================================================

-- 0) PRE-FIX: clear self-loop on profiles.manager_id (Sriram Gopalaswamy)
UPDATE profiles
SET manager_id = NULL,
    updated_at = NOW()
WHERE id = manager_id;

-- ============================================================
-- GBC-9 / GBC-71 / GBC-77 — Attendance timezone, views, corrections
-- (organizations.timezone already exists; default 'Asia/Kolkata')
-- ============================================================

CREATE INDEX IF NOT EXISTS attendance_records_org_date
  ON attendance_records(organization_id, date DESC);

-- Daily summary (timezone-aware, handles night shifts via epoch math)
CREATE OR REPLACE VIEW public.attendance_daily_summary
WITH (security_invoker = on) AS
SELECT
  ar.profile_id,
  ar.organization_id,
  ar.date AS work_date,
  MIN(ar.check_in)  AS first_check_in,
  MAX(ar.check_out) AS last_check_out,
  CASE
    WHEN MIN(ar.check_in) IS NOT NULL AND MAX(ar.check_out) IS NOT NULL THEN
      ROUND(
        EXTRACT(EPOCH FROM (MAX(ar.check_out) - MIN(ar.check_in))) / 3600.0,
        2
      )
    ELSE NULL
  END AS hours_worked,
  CASE
    WHEN MIN(ar.check_in)  IS NULL THEN 'absent_unconfirmed'
    WHEN MAX(ar.check_out) IS NULL THEN 'check_out_missing'
    ELSE 'complete'
  END AS record_status,
  COALESCE(o.timezone, 'Asia/Kolkata') AS tenant_timezone
FROM attendance_records ar
LEFT JOIN organizations o ON o.id = ar.organization_id
GROUP BY ar.profile_id, ar.organization_id, ar.date, o.timezone;

CREATE OR REPLACE VIEW public.attendance_pending_review
WITH (security_invoker = on) AS
SELECT
  p.id AS profile_id, p.full_name, p.organization_id,
  ads.work_date, ads.record_status,
  ads.first_check_in, ads.last_check_out, ads.hours_worked
FROM attendance_daily_summary ads
JOIN profiles p ON p.id = ads.profile_id
WHERE ads.record_status IN ('absent_unconfirmed', 'check_out_missing')
  AND ads.work_date >= CURRENT_DATE - INTERVAL '30 days'
  AND COALESCE(p.is_deleted, false) = false;

-- Attendance corrections table
CREATE TABLE IF NOT EXISTS public.attendance_corrections (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  work_date           DATE NOT NULL,
  corrected_check_in  TIMESTAMPTZ,
  corrected_check_out TIMESTAMPTZ,
  reason              TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','approved','rejected')),
  reviewed_by         UUID REFERENCES profiles(id),
  reviewed_at         TIMESTAMPTZ,
  reviewer_notes      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS attendance_corrections_org_status
  ON attendance_corrections(organization_id, status, work_date DESC);

ALTER TABLE attendance_corrections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ac_select_org" ON attendance_corrections;
CREATE POLICY "ac_select_org" ON attendance_corrections
FOR SELECT TO authenticated
USING (
  organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "ac_insert_self" ON attendance_corrections;
CREATE POLICY "ac_insert_self" ON attendance_corrections
FOR INSERT TO authenticated
WITH CHECK (
  organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid())
  AND profile_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
);

DROP POLICY IF EXISTS "ac_update_admin" ON attendance_corrections;
CREATE POLICY "ac_update_admin" ON attendance_corrections
FOR UPDATE TO authenticated
USING (is_admin_in_org(auth.uid(), organization_id))
WITH CHECK (is_admin_in_org(auth.uid(), organization_id));

DROP POLICY IF EXISTS "ac_delete_admin" ON attendance_corrections;
CREATE POLICY "ac_delete_admin" ON attendance_corrections
FOR DELETE TO authenticated
USING (is_admin_in_org(auth.uid(), organization_id) AND status = 'pending');

CREATE OR REPLACE FUNCTION public.submit_attendance_correction(
  p_work_date     DATE,
  p_corrected_in  TIMESTAMPTZ,
  p_corrected_out TIMESTAMPTZ,
  p_reason        TEXT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id UUID; v_profile UUID; v_org UUID; v_dur_ms BIGINT;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'CORRECTION_REASON_REQUIRED';
  END IF;

  SELECT id, organization_id INTO v_profile, v_org
  FROM profiles WHERE user_id = auth.uid() LIMIT 1;
  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND';
  END IF;

  IF p_corrected_in IS NOT NULL AND p_corrected_out IS NOT NULL THEN
    v_dur_ms := EXTRACT(EPOCH FROM (p_corrected_out - p_corrected_in)) * 1000;
    IF v_dur_ms < 0 THEN v_dur_ms := v_dur_ms + 86400000; END IF;
    IF v_dur_ms <= 0 OR v_dur_ms > 86400000 THEN
      RAISE EXCEPTION 'CORRECTION_DURATION_INVALID';
    END IF;
  END IF;

  INSERT INTO attendance_corrections (
    profile_id, organization_id, work_date,
    corrected_check_in, corrected_check_out, reason, status
  ) VALUES (
    v_profile, v_org, p_work_date,
    p_corrected_in, p_corrected_out, p_reason, 'pending'
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ============================================================
-- GBC-72 — Leave overlap, LOP flags, gender eligibility
-- ============================================================

-- Overlap guard
CREATE OR REPLACE FUNCTION public.prevent_leave_overlap()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('rejected','cancelled') THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM leave_requests
    WHERE profile_id = NEW.profile_id
      AND id != NEW.id
      AND status NOT IN ('rejected','cancelled')
      AND daterange(from_date, to_date, '[]') && daterange(NEW.from_date, NEW.to_date, '[]')
  ) THEN
    RAISE EXCEPTION 'LEAVE_OVERLAP: A leave already exists for one or more of these dates';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS check_leave_overlap ON leave_requests;
CREATE TRIGGER check_leave_overlap
BEFORE INSERT OR UPDATE OF from_date, to_date, status ON leave_requests
FOR EACH ROW EXECUTE FUNCTION prevent_leave_overlap();

-- LOP flags
CREATE TABLE IF NOT EXISTS public.payroll_lop_flags (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  month_year       DATE NOT NULL,
  lop_days         INTEGER NOT NULL DEFAULT 0,
  leave_request_id UUID REFERENCES leave_requests(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (profile_id, organization_id, month_year, leave_request_id)
);
CREATE INDEX IF NOT EXISTS payroll_lop_flags_org_month
  ON payroll_lop_flags(organization_id, month_year);

ALTER TABLE payroll_lop_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lop_select_org" ON payroll_lop_flags;
CREATE POLICY "lop_select_org" ON payroll_lop_flags
FOR SELECT TO authenticated
USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "lop_admin_write" ON payroll_lop_flags;
CREATE POLICY "lop_admin_write" ON payroll_lop_flags
FOR ALL TO authenticated
USING (is_admin_in_org(auth.uid(), organization_id))
WITH CHECK (is_admin_in_org(auth.uid(), organization_id));

CREATE OR REPLACE FUNCTION public.flag_lop_on_approval()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_unpaid BOOLEAN; v_days INT;
BEGIN
  IF NEW.status = 'approved' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
    -- Match unpaid types by key (no is_paid column on leave_types)
    SELECT (lt.key IN ('lop','lwp','unpaid'))
    INTO v_unpaid
    FROM leave_types lt
    WHERE lt.key = NEW.leave_type AND lt.organization_id = NEW.organization_id
    LIMIT 1;

    IF COALESCE(v_unpaid, false) THEN
      v_days := COALESCE(NEW.days::int, (NEW.to_date - NEW.from_date) + 1);
      INSERT INTO payroll_lop_flags (profile_id, organization_id, month_year, lop_days, leave_request_id)
      VALUES (NEW.profile_id, NEW.organization_id,
              DATE_TRUNC('month', NEW.from_date)::DATE, v_days, NEW.id)
      ON CONFLICT (profile_id, organization_id, month_year, leave_request_id) DO UPDATE
        SET lop_days = EXCLUDED.lop_days;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS auto_flag_lop ON leave_requests;
CREATE TRIGGER auto_flag_lop
AFTER INSERT OR UPDATE OF status ON leave_requests
FOR EACH ROW EXECUTE FUNCTION flag_lop_on_approval();

-- Gender eligibility check (employee_details.gender, leave_types.gender_eligibility text)
CREATE OR REPLACE FUNCTION public.leave_type_gender_eligible(
  p_leave_type_key TEXT,
  p_profile_id     UUID,
  p_org_id         UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_eligible TEXT; v_gender TEXT;
BEGIN
  SELECT gender_eligibility INTO v_eligible
  FROM leave_types WHERE key = p_leave_type_key AND organization_id = p_org_id LIMIT 1;
  IF v_eligible IS NULL OR v_eligible = 'all' THEN
    RETURN TRUE;
  END IF;
  SELECT lower(gender) INTO v_gender FROM employee_details WHERE profile_id = p_profile_id LIMIT 1;
  RETURN v_gender = lower(v_eligible);
END;
$$;

DROP POLICY IF EXISTS "leave_gender_eligible_insert" ON leave_requests;
CREATE POLICY "leave_gender_eligible_insert" ON leave_requests
AS RESTRICTIVE
FOR INSERT TO authenticated
WITH CHECK (leave_type_gender_eligible(leave_type, profile_id, organization_id));

-- ============================================================
-- GBC-74 — Holiday → payroll staleness
-- pay_period is text 'YYYY-MM' on payroll_runs
-- ============================================================

ALTER TABLE payroll_runs
  ADD COLUMN IF NOT EXISTS working_days_stale BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.invalidate_payroll_on_holiday_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_org UUID; v_period TEXT;
BEGIN
  v_org    := COALESCE(NEW.organization_id, OLD.organization_id);
  v_period := to_char(COALESCE(NEW.date, OLD.date), 'YYYY-MM');
  UPDATE payroll_runs
     SET working_days_stale = true,
         updated_at = NOW()
   WHERE organization_id = v_org
     AND status NOT IN ('locked','approved','cancelled')
     AND pay_period = v_period;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS holiday_payroll_sync ON holidays;
CREATE TRIGGER holiday_payroll_sync
AFTER INSERT OR UPDATE OR DELETE ON holidays
FOR EACH ROW EXECUTE FUNCTION invalidate_payroll_on_holiday_change();

-- ============================================================
-- GBC-70 — Circular manager guard (after pre-fix)
-- ============================================================

CREATE OR REPLACE FUNCTION public.prevent_circular_management()
RETURNS TRIGGER LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_found BOOLEAN;
BEGIN
  IF NEW.manager_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.manager_id = NEW.id THEN
    RAISE EXCEPTION 'CIRCULAR_MANAGER: Cannot be own manager';
  END IF;

  WITH RECURSIVE chain(manager_id, path, is_cycle) AS (
    SELECT manager_id, ARRAY[id], false
      FROM profiles WHERE id = NEW.manager_id AND COALESCE(is_deleted,false)=false
    UNION ALL
    SELECT p.manager_id, chain.path || p.id, p.id = ANY(chain.path)
      FROM profiles p JOIN chain ON p.id = chain.manager_id
      WHERE NOT chain.is_cycle
        AND COALESCE(p.is_deleted,false) = false
        AND cardinality(chain.path) < 100
  )
  SELECT TRUE INTO v_found FROM chain WHERE is_cycle OR manager_id = NEW.id LIMIT 1;

  IF v_found THEN
    RAISE EXCEPTION 'CIRCULAR_MANAGER: This creates a circular reporting chain';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_circular_manager ON profiles;
CREATE TRIGGER prevent_circular_manager
BEFORE INSERT OR UPDATE OF manager_id ON profiles
FOR EACH ROW EXECUTE FUNCTION prevent_circular_management();

-- ============================================================
-- GBC-86 — Bulk vendor payment (bill_payment_lines)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.bill_payment_lines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vendor_payment_id UUID NOT NULL REFERENCES vendor_payments(id) ON DELETE CASCADE,
  bill_id           UUID NOT NULL REFERENCES bills(id),
  amount_applied    NUMERIC NOT NULL CHECK (amount_applied > 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS bpl_payment ON bill_payment_lines(vendor_payment_id);
CREATE INDEX IF NOT EXISTS bpl_bill    ON bill_payment_lines(bill_id);

ALTER TABLE bill_payment_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bpl_select_org" ON bill_payment_lines;
CREATE POLICY "bpl_select_org" ON bill_payment_lines
FOR SELECT TO authenticated
USING (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "bpl_insert_org" ON bill_payment_lines;
CREATE POLICY "bpl_insert_org" ON bill_payment_lines
FOR INSERT TO authenticated
WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "bpl_admin_modify" ON bill_payment_lines;
CREATE POLICY "bpl_admin_modify" ON bill_payment_lines
FOR DELETE TO authenticated
USING (is_admin_in_org(auth.uid(), organization_id));

CREATE OR REPLACE FUNCTION public.validate_payment_line_total()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_pmt NUMERIC; v_total NUMERIC;
BEGIN
  SELECT amount INTO v_pmt FROM vendor_payments WHERE id = NEW.vendor_payment_id;
  SELECT COALESCE(SUM(amount_applied), 0) INTO v_total
    FROM bill_payment_lines WHERE vendor_payment_id = NEW.vendor_payment_id;
  IF v_total > v_pmt + 0.01 THEN
    RAISE EXCEPTION 'PAYMENT_OVERAPPLIED: Lines total % exceeds payment %', v_total, v_pmt;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS check_payment_line_total ON bill_payment_lines;
CREATE TRIGGER check_payment_line_total
AFTER INSERT OR UPDATE ON bill_payment_lines
FOR EACH ROW EXECUTE FUNCTION validate_payment_line_total();
