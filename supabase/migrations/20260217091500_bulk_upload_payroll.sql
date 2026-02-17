-- =============================================================================
-- BULK EXCEL INGESTION - PAYROLL MODULE
-- =============================================================================
-- Purpose: Validate and process payroll bulk uploads
-- Relationships: employees (profiles) → payroll_records → fiscal_periods
-- Security: Requires payroll.write permission
-- =============================================================================

-- =============================================================================
-- VALIDATION FUNCTION
-- =============================================================================

CREATE OR REPLACE FUNCTION validate_payroll_bulk_upload(
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
    v_pay_period TEXT;
    v_fiscal_status TEXT;
    v_duplicate_check INTEGER;
BEGIN
    v_user_id := auth.uid();
    
    -- Check authentication
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User not authenticated';
    END IF;
    
    -- Check permission: payroll.write
    IF NOT EXISTS (
        SELECT 1
        FROM user_roles ur
        WHERE ur.user_id = v_user_id
        AND ur.role IN ('admin', 'hr')
    ) THEN
        RAISE EXCEPTION 'Permission denied: payroll.write required';
    END IF;
    
    -- Verify session ownership
    IF NOT EXISTS (
        SELECT 1 FROM bulk_upload_sessions 
        WHERE id = p_session_id 
        AND user_id = v_user_id
        AND upload_type = 'payroll'
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
            v_basic_salary NUMERIC;
            v_month INTEGER;
            v_year INTEGER;
        BEGIN
            -- Extract required fields
            v_employee_id := v_row->>'employee_id';
            v_basic_salary := (v_row->>'basic_salary')::NUMERIC;
            v_month := (v_row->>'month')::INTEGER;
            v_year := (v_row->>'year')::INTEGER;
            
            -- Validate required fields
            IF v_employee_id IS NULL OR v_employee_id = '' THEN
                v_row_errors := array_append(v_row_errors, 'employee_id is required');
            END IF;
            
            IF v_basic_salary IS NULL OR v_basic_salary <= 0 THEN
                v_row_errors := array_append(v_row_errors, 'basic_salary must be positive');
            END IF;
            
            IF v_month IS NULL OR v_month < 1 OR v_month > 12 THEN
                v_row_errors := array_append(v_row_errors, 'month must be between 1 and 12');
            END IF;
            
            IF v_year IS NULL OR v_year < 2000 OR v_year > 2100 THEN
                v_row_errors := array_append(v_row_errors, 'year must be between 2000 and 2100');
            END IF;
            
            -- Validate employee exists
            IF v_employee_id IS NOT NULL THEN
                SELECT id INTO v_profile_id
                FROM profiles
                WHERE (id::text = v_employee_id OR email = v_employee_id)
                AND user_id = v_user_id;
                
                IF v_profile_id IS NULL THEN
                    v_row_errors := array_append(v_row_errors, 'Employee not found: ' || v_employee_id);
                ELSE
                    -- Check if employee is active
                    IF NOT EXISTS (
                        SELECT 1 FROM profiles 
                        WHERE id = v_profile_id 
                        AND status = 'active'
                    ) THEN
                        v_row_errors := array_append(v_row_errors, 'Employee is not active');
                    END IF;
                END IF;
            END IF;
            
            -- Check for duplicate (employee_id, pay_period)
            IF v_profile_id IS NOT NULL AND v_month IS NOT NULL AND v_year IS NOT NULL THEN
                v_pay_period := v_year || '-' || LPAD(v_month::text, 2, '0');
                
                SELECT COUNT(*) INTO v_duplicate_check
                FROM payroll_records
                WHERE profile_id = v_profile_id
                AND pay_period = v_pay_period
                AND user_id = v_user_id;
                
                IF v_duplicate_check > 0 THEN
                    v_row_errors := array_append(v_row_errors, 
                        'Duplicate payroll record for employee ' || v_employee_id || 
                        ' in period ' || v_pay_period);
                END IF;
            END IF;
            
            -- Validate fiscal period
            IF v_month IS NOT NULL AND v_year IS NOT NULL THEN
                SELECT status INTO v_fiscal_status
                FROM fiscal_periods
                WHERE user_id = v_user_id
                AND year = v_year
                AND period = v_month;
                
                IF v_fiscal_status IS NULL THEN
                    v_row_errors := array_append(v_row_errors, 
                        'Fiscal period not found for ' || v_year || '-' || LPAD(v_month::text, 2, '0'));
                ELSIF v_fiscal_status IN ('closed', 'locked') THEN
                    v_row_errors := array_append(v_row_errors, 
                        'Fiscal period is ' || v_fiscal_status || ' for ' || v_year || '-' || LPAD(v_month::text, 2, '0'));
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
        'payroll_bulk_upload_validated',
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

CREATE OR REPLACE FUNCTION process_payroll_bulk_upload(
    p_session_id UUID
) RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_row RECORD;
    v_success_count INTEGER := 0;
    v_failed_count INTEGER := 0;
    v_profile_id UUID;
    v_pay_period TEXT;
    v_payroll_id UUID;
    v_basic_salary NUMERIC;
    v_hra NUMERIC;
    v_transport NUMERIC;
    v_other_allowances NUMERIC;
    v_pf NUMERIC;
    v_tax NUMERIC;
    v_other_deductions NUMERIC;
    v_net_pay NUMERIC;
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
        RAISE EXCEPTION 'Permission denied: payroll.write required';
    END IF;
    
    -- Verify session
    IF NOT EXISTS (
        SELECT 1 FROM bulk_upload_sessions 
        WHERE id = p_session_id 
        AND user_id = v_user_id
        AND upload_type = 'payroll'
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
            -- Extract data
            v_basic_salary := (v_row.row_data->>'basic_salary')::NUMERIC;
            v_hra := COALESCE((v_row.row_data->>'hra')::NUMERIC, v_basic_salary * 0.4);
            v_transport := COALESCE((v_row.row_data->>'transport_allowance')::NUMERIC, 1600);
            v_other_allowances := COALESCE((v_row.row_data->>'other_allowances')::NUMERIC, 0);
            v_pf := COALESCE((v_row.row_data->>'pf_deduction')::NUMERIC, v_basic_salary * 0.12);
            v_tax := COALESCE((v_row.row_data->>'tax_deduction')::NUMERIC, 0);
            v_other_deductions := COALESCE((v_row.row_data->>'other_deductions')::NUMERIC, 0);
            
            -- Calculate net pay
            v_net_pay := v_basic_salary + v_hra + v_transport + v_other_allowances - v_pf - v_tax - v_other_deductions;
            
            -- Get profile ID
            SELECT id INTO v_profile_id
            FROM profiles
            WHERE (id::text = v_row.row_data->>'employee_id' OR email = v_row.row_data->>'employee_id')
            AND user_id = v_user_id;
            
            -- Build pay period
            v_pay_period := (v_row.row_data->>'year') || '-' || 
                           LPAD((v_row.row_data->>'month')::text, 2, '0');
            
            -- Insert payroll record
            INSERT INTO payroll_records (
                user_id,
                profile_id,
                pay_period,
                basic_salary,
                hra,
                transport_allowance,
                other_allowances,
                pf_deduction,
                tax_deduction,
                other_deductions,
                net_pay,
                status,
                notes
            ) VALUES (
                v_user_id,
                v_profile_id,
                v_pay_period,
                v_basic_salary,
                v_hra,
                v_transport,
                v_other_allowances,
                v_pf,
                v_tax,
                v_other_deductions,
                v_net_pay,
                'draft',
                'Created via bulk upload'
            ) RETURNING id INTO v_payroll_id;
            
            -- Update row status
            UPDATE bulk_upload_rows
            SET 
                processing_status = 'success',
                created_record_id = v_payroll_id,
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
        'payroll_bulk_upload_processed',
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

COMMENT ON FUNCTION validate_payroll_bulk_upload IS 'Validates payroll bulk upload data';
COMMENT ON FUNCTION process_payroll_bulk_upload IS 'Processes validated payroll bulk upload';
