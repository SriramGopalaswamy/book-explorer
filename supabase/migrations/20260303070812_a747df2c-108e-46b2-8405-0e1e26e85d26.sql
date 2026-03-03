-- Create an internal version of recalculate_attendance for service-role callers (edge functions)
-- This bypasses the auth.uid() check since service role is already trusted
CREATE OR REPLACE FUNCTION public.recalculate_attendance_internal(_org_id uuid, _start_date date, _end_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
    _total_days INT := 0;
BEGIN
    -- No auth check — this function is meant to be called from service-role only

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

    FOR _emp IN
        SELECT DISTINCT profile_id
        FROM public.attendance_punches
        WHERE organization_id = _org_id
        AND punch_datetime::date BETWEEN _start_date AND _end_date
    LOOP
        _dt := _start_date;
        WHILE _dt <= _end_date LOOP
            _total_days := _total_days + 1;

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

            -- Skip locked days
            IF EXISTS (
                SELECT 1 FROM public.attendance_daily
                WHERE organization_id = _org_id
                AND profile_id = _emp.profile_id
                AND attendance_date = _dt
                AND locked = true
            ) THEN
                _skipped_locked := _skipped_locked + 1;
                _dt := _dt + 1;
                CONTINUE;
            END IF;

            INSERT INTO public.attendance_daily (
                organization_id, profile_id, attendance_date,
                first_in_time, last_out_time, total_work_minutes,
                ot_minutes, late_minutes, early_exit_minutes,
                status, shift_id, calculated_from
            ) VALUES (
                _org_id, _emp.profile_id, _dt,
                _first_in::text, _last_out::text, _total_mins,
                _ot_mins, _late_mins, _early_mins,
                _status, _shift.id, 'engine'
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
                calculated_from = 'engine',
                updated_at = now()
            WHERE NOT attendance_daily.locked;

            _processed := _processed + 1;
            _dt := _dt + 1;
        END LOOP;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'processed', _processed,
        'skipped_locked', _skipped_locked,
        'total_days', _total_days
    );
END;
$$;

-- Revoke from anon/public, only service role should call this
REVOKE ALL ON FUNCTION public.recalculate_attendance_internal(uuid, date, date) FROM anon;
REVOKE ALL ON FUNCTION public.recalculate_attendance_internal(uuid, date, date) FROM public;
