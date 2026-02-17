-- =============================================================================
-- BULK EXCEL INGESTION - ATTENDANCE MODULE
-- =============================================================================
-- Purpose: Validate and process attendance bulk uploads
-- Relationships: employees (profiles) → attendance_records → leave_balances
-- Security: Requires attendance.upload permission
-- =============================================================================

-- =============================================================================
-- VALIDATION FUNCTION
-- =============================================================================

CREATE OR REPLACE FUNCTION validate_attendance_bulk_upload(
    p_session_id UUID,
    p_rows JSONB
) RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_row JSONB;
    v_row_number INTEGER := 0;
    v_errors JSONB := '[]'::jsonb;
    v_valid_count INTEGER := 0;
    v_invalid_count INTEGER := 0;
    v_profile_id UUID;
    v_duplicate_check INTEGER;
BEGIN
    v_user_id := auth.uid();
    
    -- Check authentication
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User not authenticated';
    END IF;
    
    -- Check permission: attendance.upload
    IF NOT EXISTS (
        SELECT 1
        FROM user_roles ur
        WHERE ur.user_id = v_user_id
        AND ur.role IN ('admin', 'hr')
    ) THEN
        RAISE EXCEPTION 'Permission denied: attendance.upload required';
    END IF;
    
    -- Verify session ownership
    IF NOT EXISTS (
        SELECT 1 FROM bulk_upload_sessions 
        WHERE id = p_session_id 
        AND user_id = v_user_id
        AND upload_type = 'attendance'
    ) THEN
        RAISE EXCEPTION 'Session not found or invalid upload type';
    END IF;
    
    -- Update session status
    UPDATE bulk_upload_sessions
    SET status = 'validating', updated_at = NOW()
    WHERE id = p_session_id;
    
    -- Validate each row
    FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
    LOOP
        v_row_number := v_row_number + 1;
        DECLARE
            v_row_errors TEXT[] := ARRAY[]::TEXT[];
            v_employee_id TEXT;
            v_date DATE;
            v_status TEXT;
            v_check_in TIME;
            v_check_out TIME;
        BEGIN
            -- Extract required fields
            v_employee_id := v_row->>'employee_id';
            v_date := (v_row->>'date')::DATE;
            v_status := v_row->>'status';
            
            -- Validate required fields
            IF v_employee_id IS NULL OR v_employee_id = '' THEN
                v_row_errors := array_append(v_row_errors, 'employee_id is required');
            END IF;
            
            IF v_date IS NULL THEN
                v_row_errors := array_append(v_row_errors, 'date is required');
            END IF;
            
            IF v_status IS NULL OR v_status = '' THEN
                v_row_errors := array_append(v_row_errors, 'status is required');
            ELSIF v_status NOT IN ('present', 'absent', 'late', 'leave', 'half_day') THEN
                v_row_errors := array_append(v_row_errors, 
                    'status must be one of: present, absent, late, leave, half_day');
            END IF;
            
            -- Validate date range (not in future)
            IF v_date IS NOT NULL AND v_date > CURRENT_DATE THEN
                v_row_errors := array_append(v_row_errors, 'date cannot be in the future');
            END IF;
            
            -- Validate date range (not too old - e.g., within last 365 days)
            IF v_date IS NOT NULL AND v_date < CURRENT_DATE - INTERVAL '365 days' THEN
                v_row_errors := array_append(v_row_errors, 'date is too old (max 365 days)');
            END IF;
            
            -- Validate employee exists and is active
            IF v_employee_id IS NOT NULL THEN
                SELECT id INTO v_profile_id
                FROM profiles
                WHERE (id::text = v_employee_id OR email = v_employee_id)
                AND user_id = v_user_id;
                
                IF v_profile_id IS NULL THEN
                    v_row_errors := array_append(v_row_errors, 'Employee not found: ' || v_employee_id);
                ELSE
                    -- Check if employee is active (block inactive employees)
                    IF NOT EXISTS (
                        SELECT 1 FROM profiles 
                        WHERE id = v_profile_id 
                        AND status = 'active'
                    ) THEN
                        v_row_errors := array_append(v_row_errors, 
                            'Employee is not active (status must be active for attendance)');
                    END IF;
                END IF;
            END IF;
            
            -- Check for duplicate (profile_id, date) - prevent duplicates
            IF v_profile_id IS NOT NULL AND v_date IS NOT NULL THEN
                SELECT COUNT(*) INTO v_duplicate_check
                FROM attendance_records
                WHERE profile_id = v_profile_id
                AND date = v_date
                AND user_id = v_user_id;
                
                IF v_duplicate_check > 0 THEN
                    v_row_errors := array_append(v_row_errors, 
                        'Duplicate attendance record for employee ' || v_employee_id || 
                        ' on date ' || v_date::text);
                END IF;
            END IF;
            
            -- Validate check_in and check_out times if present
            IF v_row->>'check_in' IS NOT NULL THEN
                BEGIN
                    v_check_in := (v_row->>'check_in')::TIME;
                EXCEPTION WHEN OTHERS THEN
                    v_row_errors := array_append(v_row_errors, 'Invalid check_in time format');
                END;
            END IF;
            
            IF v_row->>'check_out' IS NOT NULL THEN
                BEGIN
                    v_check_out := (v_row->>'check_out')::TIME;
                EXCEPTION WHEN OTHERS THEN
                    v_row_errors := array_append(v_row_errors, 'Invalid check_out time format');
                END;
            END IF;
            
            -- Validate check_out > check_in
            IF v_check_in IS NOT NULL AND v_check_out IS NOT NULL THEN
                IF v_check_out <= v_check_in THEN
                    v_row_errors := array_append(v_row_errors, 'check_out must be after check_in');
                END IF;
            END IF;
            
            -- Insert row record
            IF array_length(v_row_errors, 1) IS NULL OR array_length(v_row_errors, 1) = 0 THEN
                INSERT INTO bulk_upload_rows (
                    session_id,
                    row_number,
                    row_data,
                    validation_status,
                    validation_errors
                ) VALUES (
                    p_session_id,
                    v_row_number,
                    v_row,
                    'valid',
                    NULL
                );
                v_valid_count := v_valid_count + 1;
            ELSE
                INSERT INTO bulk_upload_rows (
                    session_id,
                    row_number,
                    row_data,
                    validation_status,
                    validation_errors
                ) VALUES (
                    p_session_id,
                    v_row_number,
                    v_row,
                    'invalid',
                    v_row_errors
                );
                v_invalid_count := v_invalid_count + 1;
                v_errors := v_errors || jsonb_build_object(
                    'row', v_row_number,
                    'errors', v_row_errors
                );
            END IF;
            
        EXCEPTION WHEN OTHERS THEN
            -- Handle parsing errors
            INSERT INTO bulk_upload_rows (
                session_id,
                row_number,
                row_data,
                validation_status,
                validation_errors
            ) VALUES (
                p_session_id,
                v_row_number,
                v_row,
                'invalid',
                ARRAY['Parse error: ' || SQLERRM]
            );
            v_invalid_count := v_invalid_count + 1;
            v_errors := v_errors || jsonb_build_object(
                'row', v_row_number,
                'errors', ARRAY['Parse error: ' || SQLERRM]
            );
        END;
    END LOOP;
    
    -- Update session with validation results
    UPDATE bulk_upload_sessions
    SET 
        status = CASE WHEN v_invalid_count = 0 THEN 'validated' ELSE 'validation_failed' END,
        validation_errors = v_errors,
        updated_at = NOW()
    WHERE id = p_session_id;
    
    -- Log audit
    PERFORM log_audit(
        'attendance_bulk_upload_validated',
        'bulk_upload_session',
        p_session_id,
        p_session_id,
        jsonb_build_object(
            'valid_rows', v_valid_count,
            'invalid_rows', v_invalid_count,
            'total_rows', v_row_number
        )
    );
    
    RETURN jsonb_build_object(
        'session_id', p_session_id,
        'total_rows', v_row_number,
        'valid_rows', v_valid_count,
        'invalid_rows', v_invalid_count,
        'errors', v_errors
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- PROCESSING FUNCTION
-- =============================================================================

CREATE OR REPLACE FUNCTION process_attendance_bulk_upload(
    p_session_id UUID
) RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_row RECORD;
    v_success_count INTEGER := 0;
    v_failed_count INTEGER := 0;
    v_profile_id UUID;
    v_attendance_id UUID;
BEGIN
    v_user_id := auth.uid();
    
    -- Check authentication
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User not authenticated';
    END IF;
    
    -- Check permission
    IF NOT EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = v_user_id 
        AND role IN ('admin', 'hr')
    ) THEN
        RAISE EXCEPTION 'Permission denied: attendance.upload required';
    END IF;
    
    -- Verify session
    IF NOT EXISTS (
        SELECT 1 FROM bulk_upload_sessions 
        WHERE id = p_session_id 
        AND user_id = v_user_id
        AND upload_type = 'attendance'
        AND status = 'validated'
    ) THEN
        RAISE EXCEPTION 'Session not found, invalid, or not validated';
    END IF;
    
    -- Update session status
    UPDATE bulk_upload_sessions
    SET status = 'processing', updated_at = NOW()
    WHERE id = p_session_id;
    
    -- Process valid rows
    FOR v_row IN 
        SELECT * FROM bulk_upload_rows
        WHERE session_id = p_session_id
        AND validation_status = 'valid'
        ORDER BY row_number
    LOOP
        BEGIN
            -- Get profile ID
            SELECT id INTO v_profile_id
            FROM profiles
            WHERE (id::text = v_row.row_data->>'employee_id' OR email = v_row.row_data->>'employee_id')
            AND user_id = v_user_id;
            
            -- Insert attendance record
            INSERT INTO attendance_records (
                user_id,
                profile_id,
                date,
                check_in,
                check_out,
                status,
                notes
            ) VALUES (
                v_user_id,
                v_profile_id,
                (v_row.row_data->>'date')::DATE,
                (v_row.row_data->>'check_in')::TIME,
                (v_row.row_data->>'check_out')::TIME,
                v_row.row_data->>'status',
                COALESCE(v_row.row_data->>'notes', 'Created via bulk upload')
            ) RETURNING id INTO v_attendance_id;
            
            -- Update row status
            UPDATE bulk_upload_rows
            SET 
                processing_status = 'success',
                created_record_id = v_attendance_id,
                updated_at = NOW()
            WHERE id = v_row.id;
            
            v_success_count := v_success_count + 1;
            
        EXCEPTION WHEN OTHERS THEN
            -- Update row with error
            UPDATE bulk_upload_rows
            SET 
                processing_status = 'failed',
                processing_error = SQLERRM,
                updated_at = NOW()
            WHERE id = v_row.id;
            
            v_failed_count := v_failed_count + 1;
        END;
    END LOOP;
    
    -- Update session
    UPDATE bulk_upload_sessions
    SET 
        status = 'completed',
        successful_rows = v_success_count,
        failed_rows = v_failed_count,
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_session_id;
    
    -- Log audit
    PERFORM log_audit(
        'attendance_bulk_upload_processed',
        'bulk_upload_session',
        p_session_id,
        p_session_id,
        jsonb_build_object(
            'successful_rows', v_success_count,
            'failed_rows', v_failed_count
        )
    );
    
    RETURN jsonb_build_object(
        'session_id', p_session_id,
        'successful_rows', v_success_count,
        'failed_rows', v_failed_count,
        'status', 'completed'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON FUNCTION validate_attendance_bulk_upload IS 'Validates attendance bulk upload data';
COMMENT ON FUNCTION process_attendance_bulk_upload IS 'Processes validated attendance bulk upload';
