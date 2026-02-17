-- =============================================================================
-- BULK EXCEL INGESTION - ROLES MODULE
-- =============================================================================
-- Purpose: Validate and process roles bulk uploads
-- Relationships: roles → role_permissions → user_roles
-- Security: Requires roles.manage permission
-- =============================================================================

-- =============================================================================
-- VALIDATION FUNCTION
-- =============================================================================

CREATE OR REPLACE FUNCTION validate_roles_bulk_upload(
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
    v_role_id UUID;
    v_permission_id UUID;
    v_duplicate_check INTEGER;
BEGIN
    v_user_id := auth.uid();
    
    -- Check authentication
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User not authenticated';
    END IF;
    
    -- Check permission: roles.manage (admin only)
    IF NOT EXISTS (
        SELECT 1
        FROM user_roles ur
        WHERE ur.user_id = v_user_id
        AND ur.role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Permission denied: roles.manage required (admin only)';
    END IF;
    
    -- Verify session ownership
    IF NOT EXISTS (
        SELECT 1 FROM bulk_upload_sessions 
        WHERE id = p_session_id 
        AND user_id = v_user_id
        AND upload_type = 'roles'
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
            v_role_name TEXT;
            v_permission_string TEXT;
            v_is_system_role BOOLEAN;
        BEGIN
            -- Extract required fields
            v_role_name := v_row->>'role_name';
            v_permission_string := v_row->>'permission_string';
            
            -- Validate required fields
            IF v_role_name IS NULL OR v_role_name = '' THEN
                v_row_errors := array_append(v_row_errors, 'role_name is required');
            END IF;
            
            IF v_permission_string IS NULL OR v_permission_string = '' THEN
                v_row_errors := array_append(v_row_errors, 'permission_string is required');
            END IF;
            
            -- Validate role exists
            IF v_role_name IS NOT NULL THEN
                SELECT id, is_system_role INTO v_role_id, v_is_system_role
                FROM roles
                WHERE name = v_role_name;
                
                IF v_role_id IS NULL THEN
                    v_row_errors := array_append(v_row_errors, 'Role not found: ' || v_role_name);
                ELSE
                    -- Protect system roles from bulk modification
                    IF v_is_system_role = true THEN
                        v_row_errors := array_append(v_row_errors, 
                            'Cannot modify system role: ' || v_role_name || ' (protected)');
                    END IF;
                    
                    -- Check if role is active
                    IF NOT EXISTS (
                        SELECT 1 FROM roles 
                        WHERE id = v_role_id 
                        AND is_active = true
                    ) THEN
                        v_row_errors := array_append(v_row_errors, 'Role is not active');
                    END IF;
                END IF;
            END IF;
            
            -- Validate permission exists and key is valid
            IF v_permission_string IS NOT NULL THEN
                SELECT id INTO v_permission_id
                FROM permissions
                WHERE permission_string = v_permission_string;
                
                IF v_permission_id IS NULL THEN
                    v_row_errors := array_append(v_row_errors, 
                        'Invalid permission key: ' || v_permission_string);
                ELSE
                    -- Check if permission is active
                    IF NOT EXISTS (
                        SELECT 1 FROM permissions 
                        WHERE id = v_permission_id 
                        AND is_active = true
                    ) THEN
                        v_row_errors := array_append(v_row_errors, 
                            'Permission is not active: ' || v_permission_string);
                    END IF;
                END IF;
            END IF;
            
            -- Check for duplicate role-permission mapping
            IF v_role_id IS NOT NULL AND v_permission_id IS NOT NULL THEN
                SELECT COUNT(*) INTO v_duplicate_check
                FROM role_permissions
                WHERE role_id = v_role_id
                AND permission_id = v_permission_id;
                
                IF v_duplicate_check > 0 THEN
                    v_row_errors := array_append(v_row_errors, 
                        'Duplicate role-permission mapping: ' || v_role_name || 
                        ' - ' || v_permission_string);
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
        'roles_bulk_upload_validated',
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

CREATE OR REPLACE FUNCTION process_roles_bulk_upload(
    p_session_id UUID
) RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_row RECORD;
    v_success_count INTEGER := 0;
    v_failed_count INTEGER := 0;
    v_role_id UUID;
    v_permission_id UUID;
    v_role_permission_id UUID;
BEGIN
    v_user_id := auth.uid();
    
    -- Check authentication
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User not authenticated';
    END IF;
    
    -- Check permission (admin only)
    IF NOT EXISTS (
        SELECT 1 FROM user_roles 
        WHERE user_id = v_user_id 
        AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Permission denied: roles.manage required (admin only)';
    END IF;
    
    -- Verify session
    IF NOT EXISTS (
        SELECT 1 FROM bulk_upload_sessions 
        WHERE id = p_session_id 
        AND user_id = v_user_id
        AND upload_type = 'roles'
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
            -- Get role ID
            SELECT id INTO v_role_id
            FROM roles
            WHERE name = v_row.row_data->>'role_name';
            
            -- Get permission ID
            SELECT id INTO v_permission_id
            FROM permissions
            WHERE permission_string = v_row.row_data->>'permission_string';
            
            -- Insert role-permission mapping
            INSERT INTO role_permissions (
                role_id,
                permission_id
            ) VALUES (
                v_role_id,
                v_permission_id
            ) RETURNING id INTO v_role_permission_id;
            
            -- Update row status
            UPDATE bulk_upload_rows
            SET 
                processing_status = 'success',
                created_record_id = v_role_permission_id,
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
        'roles_bulk_upload_processed',
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

COMMENT ON FUNCTION validate_roles_bulk_upload IS 'Validates roles bulk upload data';
COMMENT ON FUNCTION process_roles_bulk_upload IS 'Processes validated roles bulk upload';
