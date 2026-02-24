
-- =============================================
-- ATTENDANCE ENGINE — ADDITIVE MIGRATION ONLY
-- =============================================

-- 1. ATTENDANCE SHIFTS (configurable shift definitions)
CREATE TABLE IF NOT EXISTS public.attendance_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id),
    name TEXT NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    grace_minutes INT NOT NULL DEFAULT 0,
    min_half_day_minutes INT NOT NULL DEFAULT 240,
    full_day_minutes INT NOT NULL DEFAULT 480,
    ot_after_minutes INT NOT NULL DEFAULT 540,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.attendance_shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view shifts"
ON public.attendance_shifts FOR SELECT
USING (is_org_member(auth.uid(), organization_id));

CREATE POLICY "HR/Admin can manage shifts"
ON public.attendance_shifts FOR ALL
USING (is_org_admin_or_hr(auth.uid(), organization_id))
WITH CHECK (is_org_admin_or_hr(auth.uid(), organization_id));


-- 2. ATTENDANCE PUNCHES (raw biometric data)
CREATE TABLE IF NOT EXISTS public.attendance_punches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id),
    profile_id UUID NOT NULL REFERENCES public.profiles(id),
    employee_code TEXT NOT NULL,
    card_no TEXT,
    punch_datetime TIMESTAMPTZ NOT NULL,
    punch_source TEXT NOT NULL DEFAULT 'upload',
    raw_status TEXT,
    upload_batch_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.attendance_punches ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_attendance_punch_lookup
ON public.attendance_punches (organization_id, profile_id, punch_datetime);

CREATE INDEX IF NOT EXISTS idx_attendance_punch_batch
ON public.attendance_punches (upload_batch_id);

CREATE POLICY "HR/Admin can manage punches"
ON public.attendance_punches FOR ALL
USING (is_org_admin_or_hr(auth.uid(), organization_id))
WITH CHECK (is_org_admin_or_hr(auth.uid(), organization_id));

CREATE POLICY "Employees can view own punches"
ON public.attendance_punches FOR SELECT
USING (profile_id = get_current_user_profile_id());


-- 3. ATTENDANCE DAILY (calculated daily attendance)
CREATE TABLE IF NOT EXISTS public.attendance_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id),
    profile_id UUID NOT NULL REFERENCES public.profiles(id),
    attendance_date DATE NOT NULL,
    first_in_time TIME,
    last_out_time TIME,
    total_work_minutes INT NOT NULL DEFAULT 0,
    ot_minutes INT NOT NULL DEFAULT 0,
    late_minutes INT NOT NULL DEFAULT 0,
    early_exit_minutes INT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'A' CHECK (status IN ('P','A','HD','MIS','NA')),
    shift_id UUID REFERENCES public.attendance_shifts(id),
    calculated_from TEXT,
    locked BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, profile_id, attendance_date)
);

ALTER TABLE public.attendance_daily ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_attendance_daily_lookup
ON public.attendance_daily (organization_id, profile_id, attendance_date);

CREATE POLICY "HR/Admin/Finance can view attendance daily"
ON public.attendance_daily FOR SELECT
USING (
    is_org_admin_or_hr(auth.uid(), organization_id) OR
    is_org_admin_or_finance(auth.uid(), organization_id) OR
    profile_id = get_current_user_profile_id()
);

CREATE POLICY "HR/Admin can manage attendance daily"
ON public.attendance_daily FOR ALL
USING (is_org_admin_or_hr(auth.uid(), organization_id))
WITH CHECK (is_org_admin_or_hr(auth.uid(), organization_id));


-- 4. ATTENDANCE UPLOAD LOG (track every biometric upload)
CREATE TABLE IF NOT EXISTS public.attendance_upload_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id),
    uploaded_by UUID NOT NULL,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL DEFAULT 'pdf',
    total_punches INT NOT NULL DEFAULT 0,
    matched_employees INT NOT NULL DEFAULT 0,
    unmatched_codes TEXT[] DEFAULT '{}',
    duplicate_punches INT NOT NULL DEFAULT 0,
    parse_errors TEXT[] DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'completed',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.attendance_upload_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR/Admin can manage upload logs"
ON public.attendance_upload_logs FOR ALL
USING (is_org_admin_or_hr(auth.uid(), organization_id))
WITH CHECK (is_org_admin_or_hr(auth.uid(), organization_id));


-- 5. RECALCULATE ATTENDANCE FUNCTION (idempotent, respects locks & payroll)
CREATE OR REPLACE FUNCTION public.recalculate_attendance(
    _org_id UUID,
    _start_date DATE,
    _end_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _emp RECORD;
    _dt DATE;
    _punches RECORD;
    _first_in TIME;
    _last_out TIME;
    _total_mins INT;
    _late_mins INT;
    _early_mins INT;
    _ot_mins INT;
    _status TEXT;
    _shift RECORD;
    _processed INT := 0;
    _skipped_locked INT := 0;
    _skipped_payroll INT := 0;
    _total_days INT := 0;
BEGIN
    -- Verify caller has access
    IF NOT is_org_admin_or_hr(auth.uid(), _org_id) THEN
        RAISE EXCEPTION 'Access denied: only HR/Admin can recalculate attendance';
    END IF;

    -- Check payroll lock: if any payroll_run for overlapping months is locked/completed, block
    IF EXISTS (
        SELECT 1 FROM public.payroll_runs
        WHERE organization_id = _org_id
        AND status IN ('locked')
        AND (
            pay_period = to_char(_start_date, 'YYYY-MM')
            OR pay_period = to_char(_end_date, 'YYYY-MM')
        )
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Cannot recalculate: payroll for this period is locked',
            'skipped_payroll', 1
        );
    END IF;

    -- Get default shift for this org
    SELECT * INTO _shift
    FROM public.attendance_shifts
    WHERE organization_id = _org_id AND is_default = true
    LIMIT 1;

    -- Fallback: 9:00–18:00, 0 grace, 240 half, 480 full, 540 OT
    IF _shift IS NULL THEN
        _shift := ROW(
            gen_random_uuid(), _org_id, 'Default', '09:00'::TIME, '18:00'::TIME,
            0, 240, 480, 540, true, now()
        )::attendance_shifts;
    END IF;

    -- Iterate each employee with punches in the range
    FOR _emp IN
        SELECT DISTINCT profile_id
        FROM public.attendance_punches
        WHERE organization_id = _org_id
        AND punch_datetime::date BETWEEN _start_date AND _end_date
    LOOP
        _dt := _start_date;
        WHILE _dt <= _end_date LOOP
            _total_days := _total_days + 1;

            -- Get first/last punch for this employee on this day
            SELECT
                MIN(punch_datetime::time) AS first_in,
                MAX(punch_datetime::time) AS last_out,
                COUNT(*) AS punch_count
            INTO _punches
            FROM public.attendance_punches
            WHERE organization_id = _org_id
            AND profile_id = _emp.profile_id
            AND punch_datetime::date = _dt;

            IF _punches.punch_count = 0 THEN
                _status := 'A';
                _first_in := NULL;
                _last_out := NULL;
                _total_mins := 0;
                _late_mins := 0;
                _early_mins := 0;
                _ot_mins := 0;
            ELSIF _punches.punch_count = 1 THEN
                _status := 'MIS';
                _first_in := _punches.first_in;
                _last_out := NULL;
                _total_mins := 0;
                _late_mins := GREATEST(0, EXTRACT(EPOCH FROM (_punches.first_in - _shift.start_time))::INT / 60 - _shift.grace_minutes);
                _early_mins := 0;
                _ot_mins := 0;
            ELSE
                _first_in := _punches.first_in;
                _last_out := _punches.last_out;
                _total_mins := EXTRACT(EPOCH FROM (_last_out - _first_in))::INT / 60;
                _late_mins := GREATEST(0, EXTRACT(EPOCH FROM (_first_in - _shift.start_time))::INT / 60 - _shift.grace_minutes);
                _early_mins := GREATEST(0, EXTRACT(EPOCH FROM (_shift.end_time - _last_out))::INT / 60);
                _ot_mins := GREATEST(0, _total_mins - _shift.ot_after_minutes);

                IF _total_mins >= _shift.full_day_minutes THEN
                    _status := 'P';
                ELSIF _total_mins >= _shift.min_half_day_minutes THEN
                    _status := 'HD';
                ELSE
                    _status := 'A';
                END IF;
            END IF;

            -- UPSERT: skip if locked
            INSERT INTO public.attendance_daily (
                organization_id, profile_id, attendance_date,
                first_in_time, last_out_time, total_work_minutes,
                ot_minutes, late_minutes, early_exit_minutes,
                status, shift_id, calculated_from, updated_at
            ) VALUES (
                _org_id, _emp.profile_id, _dt,
                _first_in, _last_out, _total_mins,
                _ot_mins, _late_mins, _early_mins,
                _status, _shift.id, 'punches', now()
            )
            ON CONFLICT (organization_id, profile_id, attendance_date)
            DO UPDATE SET
                first_in_time = EXCLUDED.first_in_time,
                last_out_time = EXCLUDED.last_out_time,
                total_work_minutes = EXCLUDED.total_work_minutes,
                ot_minutes = EXCLUDED.ot_minutes,
                late_minutes = EXCLUDED.late_minutes,
                early_exit_minutes = EXCLUDED.early_exit_minutes,
                status = EXCLUDED.status,
                shift_id = EXCLUDED.shift_id,
                calculated_from = EXCLUDED.calculated_from,
                updated_at = now()
            WHERE attendance_daily.locked = false;

            IF FOUND THEN
                _processed := _processed + 1;
            ELSE
                _skipped_locked := _skipped_locked + 1;
            END IF;

            _dt := _dt + 1;
        END LOOP;
    END LOOP;

    -- Audit log
    INSERT INTO public.audit_logs (
        actor_id, action, entity_type, organization_id, metadata
    ) VALUES (
        auth.uid(), 'attendance_recalculated', 'attendance',
        _org_id,
        jsonb_build_object(
            'start_date', _start_date,
            'end_date', _end_date,
            'processed', _processed,
            'skipped_locked', _skipped_locked
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'processed', _processed,
        'skipped_locked', _skipped_locked,
        'total_days_checked', _total_days
    );
END;
$$;


-- 6. PAYROLL ATTENDANCE SUMMARY VIEW
CREATE OR REPLACE VIEW public.payroll_attendance_summary AS
SELECT
    organization_id,
    profile_id,
    date_trunc('month', attendance_date)::date AS month,
    COUNT(*) FILTER (WHERE status = 'P') AS present_days,
    COUNT(*) FILTER (WHERE status = 'HD') AS half_days,
    COUNT(*) FILTER (WHERE status = 'A') AS absent_days,
    COUNT(*) FILTER (WHERE status = 'MIS') AS missing_days,
    SUM(ot_minutes) AS total_ot_minutes,
    SUM(late_minutes) AS total_late_minutes,
    SUM(total_work_minutes) AS total_work_minutes
FROM public.attendance_daily
GROUP BY organization_id, profile_id, date_trunc('month', attendance_date);


-- 7. ORG-SCOPING TRIGGERS for new tables
CREATE TRIGGER trg_block_suspended_attendance_shifts
    BEFORE INSERT OR UPDATE ON public.attendance_shifts
    FOR EACH ROW EXECUTE FUNCTION public.block_suspended_org_writes();

CREATE TRIGGER trg_block_suspended_attendance_punches
    BEFORE INSERT OR UPDATE ON public.attendance_punches
    FOR EACH ROW EXECUTE FUNCTION public.block_suspended_org_writes();

CREATE TRIGGER trg_block_suspended_attendance_daily
    BEFORE INSERT OR UPDATE ON public.attendance_daily
    FOR EACH ROW EXECUTE FUNCTION public.block_suspended_org_writes();
