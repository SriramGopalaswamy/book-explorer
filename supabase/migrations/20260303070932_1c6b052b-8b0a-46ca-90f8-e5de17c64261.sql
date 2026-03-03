-- Fix: when no shift exists, use NULL shift_id instead of a random UUID
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
    _shift_id UUID;
    _shift_start TIME := '09:00';
    _shift_end TIME := '18:00';
    _shift_grace INT := 0;
    _shift_half INT := 240;
    _shift_full INT := 480;
    _shift_ot INT := 540;
    _processed INT := 0;
    _skipped_locked INT := 0;
    _total_days INT := 0;
BEGIN
    SELECT id, start_time, end_time, grace_minutes, min_half_day_minutes, full_day_minutes, ot_after_minutes
    INTO _shift
    FROM public.attendance_shifts
    WHERE organization_id = _org_id AND is_default = true
    LIMIT 1;

    IF FOUND THEN
        _shift_id := _shift.id;
        _shift_start := _shift.start_time;
        _shift_end := _shift.end_time;
        _shift_grace := _shift.grace_minutes;
        _shift_half := _shift.min_half_day_minutes;
        _shift_full := _shift.full_day_minutes;
        _shift_ot := _shift.ot_after_minutes;
    ELSE
        _shift_id := NULL;
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
                _status := 'A'; _first_in := NULL; _last_out := NULL;
                _total_mins := 0; _late_mins := 0; _early_mins := 0; _ot_mins := 0;
            ELSIF _punches.punch_count = 1 THEN
                _status := 'MIS'; _first_in := _punches.first_in; _last_out := NULL;
                _total_mins := 0;
                _late_mins := GREATEST(0, EXTRACT(EPOCH FROM (_punches.first_in - _shift_start))::INT / 60 - _shift_grace);
                _early_mins := 0; _ot_mins := 0;
            ELSE
                _first_in := _punches.first_in; _last_out := _punches.last_out;
                _total_mins := EXTRACT(EPOCH FROM (_last_out - _first_in))::INT / 60;
                _late_mins := GREATEST(0, EXTRACT(EPOCH FROM (_first_in - _shift_start))::INT / 60 - _shift_grace);
                _early_mins := GREATEST(0, EXTRACT(EPOCH FROM (_shift_end - _last_out))::INT / 60);
                _ot_mins := GREATEST(0, _total_mins - _shift_ot);
                IF _total_mins >= _shift_full THEN _status := 'P';
                ELSIF _total_mins >= _shift_half THEN _status := 'HD';
                ELSE _status := 'A'; END IF;
            END IF;

            IF EXISTS (
                SELECT 1 FROM public.attendance_daily
                WHERE organization_id = _org_id AND profile_id = _emp.profile_id
                AND attendance_date = _dt AND locked = true
            ) THEN
                _skipped_locked := _skipped_locked + 1;
                _dt := _dt + 1; CONTINUE;
            END IF;

            INSERT INTO public.attendance_daily (
                organization_id, profile_id, attendance_date,
                first_in_time, last_out_time, total_work_minutes,
                ot_minutes, late_minutes, early_exit_minutes,
                status, shift_id, calculated_from
            ) VALUES (
                _org_id, _emp.profile_id, _dt,
                _first_in, _last_out, _total_mins,
                _ot_mins, _late_mins, _early_mins,
                _status, _shift_id, 'engine'
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
