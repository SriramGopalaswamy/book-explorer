-- =============================================================================
-- BULK EXCEL INGESTION ENGINE - INFRASTRUCTURE
-- =============================================================================
-- Purpose: Enterprise-grade bulk upload system for Payroll, Attendance, and Roles
-- Critical: Adapts to existing GRX10-Books schema without recreating tables
-- =============================================================================

-- =============================================================================
-- STEP 1: CREATE BULK UPLOAD TABLES (Conditional - only if not exists)
-- =============================================================================

-- Table: bulk_upload_sessions
-- Purpose: Tracks each bulk upload session with metadata
CREATE TABLE IF NOT EXISTS bulk_upload_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    upload_type TEXT NOT NULL CHECK (upload_type IN ('payroll', 'attendance', 'roles')),
    file_name TEXT NOT NULL,
    total_rows INTEGER NOT NULL DEFAULT 0,
    successful_rows INTEGER NOT NULL DEFAULT 0,
    failed_rows INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'validating', 'processing', 'completed', 'failed', 'cancelled')),
    validation_errors JSONB DEFAULT '[]'::jsonb,
    processing_errors JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_bulk_upload_sessions_user_id ON bulk_upload_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_bulk_upload_sessions_upload_type ON bulk_upload_sessions(upload_type);
CREATE INDEX IF NOT EXISTS idx_bulk_upload_sessions_status ON bulk_upload_sessions(status);
CREATE INDEX IF NOT EXISTS idx_bulk_upload_sessions_created_at ON bulk_upload_sessions(created_at DESC);

-- Table: bulk_upload_rows
-- Purpose: Stores individual rows from bulk upload with validation status
CREATE TABLE IF NOT EXISTS bulk_upload_rows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES bulk_upload_sessions(id) ON DELETE CASCADE NOT NULL,
    row_number INTEGER NOT NULL,
    row_data JSONB NOT NULL,
    validation_status TEXT NOT NULL DEFAULT 'pending' CHECK (validation_status IN ('pending', 'valid', 'invalid')),
    validation_errors TEXT[],
    processing_status TEXT NOT NULL DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'success', 'failed', 'skipped')),
    processing_error TEXT,
    created_record_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_bulk_upload_rows_session_id ON bulk_upload_rows(session_id);
CREATE INDEX IF NOT EXISTS idx_bulk_upload_rows_validation_status ON bulk_upload_rows(validation_status);
CREATE INDEX IF NOT EXISTS idx_bulk_upload_rows_processing_status ON bulk_upload_rows(processing_status);

-- Table: audit_logs (Enhanced - only if not exists)
-- Purpose: Comprehensive audit trail for bulk operations
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id UUID,
    bulk_session_id UUID REFERENCES bulk_upload_sessions(id) ON DELETE SET NULL,
    details JSONB DEFAULT '{}'::jsonb,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for audit logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_type ON audit_logs(resource_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_bulk_session_id ON audit_logs(bulk_session_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- =============================================================================
-- STEP 2: ENABLE RLS ON BULK UPLOAD TABLES
-- =============================================================================

ALTER TABLE bulk_upload_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulk_upload_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- STEP 3: CREATE RLS POLICIES FOR BULK UPLOAD TABLES
-- =============================================================================

-- Policies for bulk_upload_sessions
DROP POLICY IF EXISTS "Users can view own upload sessions" ON bulk_upload_sessions;
CREATE POLICY "Users can view own upload sessions" 
    ON bulk_upload_sessions FOR SELECT
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can create own upload sessions" ON bulk_upload_sessions;
CREATE POLICY "Users can create own upload sessions" 
    ON bulk_upload_sessions FOR INSERT
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own upload sessions" ON bulk_upload_sessions;
CREATE POLICY "Users can update own upload sessions" 
    ON bulk_upload_sessions FOR UPDATE
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins and HR can view all sessions" ON bulk_upload_sessions;
CREATE POLICY "Admins and HR can view all sessions" 
    ON bulk_upload_sessions FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_roles 
            WHERE user_id = auth.uid() 
            AND role IN ('admin', 'hr')
        )
    );

-- Policies for bulk_upload_rows
DROP POLICY IF EXISTS "Users can view rows from own sessions" ON bulk_upload_rows;
CREATE POLICY "Users can view rows from own sessions" 
    ON bulk_upload_rows FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM bulk_upload_sessions 
            WHERE id = session_id 
            AND user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can insert rows to own sessions" ON bulk_upload_rows;
CREATE POLICY "Users can insert rows to own sessions" 
    ON bulk_upload_rows FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM bulk_upload_sessions 
            WHERE id = session_id 
            AND user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can update rows in own sessions" ON bulk_upload_rows;
CREATE POLICY "Users can update rows in own sessions" 
    ON bulk_upload_rows FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM bulk_upload_sessions 
            WHERE id = session_id 
            AND user_id = auth.uid()
        )
    );

-- Policies for audit_logs
DROP POLICY IF EXISTS "Users can view own audit logs" ON audit_logs;
CREATE POLICY "Users can view own audit logs" 
    ON audit_logs FOR SELECT
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view all audit logs" ON audit_logs;
CREATE POLICY "Admins can view all audit logs" 
    ON audit_logs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_roles 
            WHERE user_id = auth.uid() 
            AND role = 'admin'
        )
    );

DROP POLICY IF EXISTS "System can insert audit logs" ON audit_logs;
CREATE POLICY "System can insert audit logs" 
    ON audit_logs FOR INSERT
    WITH CHECK (true);

-- =============================================================================
-- STEP 4: HELPER FUNCTIONS
-- =============================================================================

-- Function: check_user_permission
-- Purpose: Check if user has specific permission
CREATE OR REPLACE FUNCTION check_user_permission(
    p_user_id UUID,
    p_permission_string TEXT
) RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM user_roles ur
        JOIN role_permissions rp ON ur.role::text = (SELECT name FROM roles WHERE id = rp.role_id)
        JOIN permissions p ON rp.permission_id = p.id
        WHERE ur.user_id = p_user_id
        AND p.permission_string = p_permission_string
        AND p.is_active = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: log_audit
-- Purpose: Log audit events for bulk operations
CREATE OR REPLACE FUNCTION log_audit(
    p_action TEXT,
    p_resource_type TEXT,
    p_resource_id UUID DEFAULT NULL,
    p_bulk_session_id UUID DEFAULT NULL,
    p_details JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
    v_audit_id UUID;
BEGIN
    INSERT INTO audit_logs (
        user_id,
        action,
        resource_type,
        resource_id,
        bulk_session_id,
        details
    ) VALUES (
        auth.uid(),
        p_action,
        p_resource_type,
        p_resource_id,
        p_bulk_session_id,
        p_details
    ) RETURNING id INTO v_audit_id;
    
    RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: create_bulk_upload_session
-- Purpose: Initialize a new bulk upload session
CREATE OR REPLACE FUNCTION create_bulk_upload_session(
    p_upload_type TEXT,
    p_file_name TEXT,
    p_total_rows INTEGER,
    p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
    v_session_id UUID;
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();
    
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User not authenticated';
    END IF;
    
    -- Validate upload type
    IF p_upload_type NOT IN ('payroll', 'attendance', 'roles') THEN
        RAISE EXCEPTION 'Invalid upload type: %', p_upload_type;
    END IF;
    
    -- Create session
    INSERT INTO bulk_upload_sessions (
        user_id,
        upload_type,
        file_name,
        total_rows,
        metadata,
        status
    ) VALUES (
        v_user_id,
        p_upload_type,
        p_file_name,
        p_total_rows,
        p_metadata,
        'pending'
    ) RETURNING id INTO v_session_id;
    
    -- Log audit
    PERFORM log_audit(
        'bulk_upload_session_created',
        'bulk_upload_session',
        v_session_id,
        v_session_id,
        jsonb_build_object(
            'upload_type', p_upload_type,
            'file_name', p_file_name,
            'total_rows', p_total_rows
        )
    );
    
    RETURN v_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: update_session_status
-- Purpose: Update bulk upload session status
CREATE OR REPLACE FUNCTION update_session_status(
    p_session_id UUID,
    p_status TEXT,
    p_successful_rows INTEGER DEFAULT NULL,
    p_failed_rows INTEGER DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();
    
    -- Verify session ownership
    IF NOT EXISTS (
        SELECT 1 FROM bulk_upload_sessions 
        WHERE id = p_session_id AND user_id = v_user_id
    ) THEN
        RAISE EXCEPTION 'Session not found or access denied';
    END IF;
    
    -- Update session
    UPDATE bulk_upload_sessions
    SET 
        status = p_status,
        successful_rows = COALESCE(p_successful_rows, successful_rows),
        failed_rows = COALESCE(p_failed_rows, failed_rows),
        completed_at = CASE WHEN p_status IN ('completed', 'failed', 'cancelled') 
                            THEN NOW() ELSE completed_at END,
        updated_at = NOW()
    WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- STEP 5: TRIGGER FOR AUTO-UPDATING TIMESTAMPS
-- =============================================================================

-- Trigger for bulk_upload_sessions
DROP TRIGGER IF EXISTS update_bulk_upload_sessions_updated_at ON bulk_upload_sessions;
CREATE TRIGGER update_bulk_upload_sessions_updated_at
    BEFORE UPDATE ON bulk_upload_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for bulk_upload_rows
DROP TRIGGER IF EXISTS update_bulk_upload_rows_updated_at ON bulk_upload_rows;
CREATE TRIGGER update_bulk_upload_rows_updated_at
    BEFORE UPDATE ON bulk_upload_rows
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- COMMENTS FOR DOCUMENTATION
-- =============================================================================

COMMENT ON TABLE bulk_upload_sessions IS 'Tracks bulk upload sessions for payroll, attendance, and roles';
COMMENT ON TABLE bulk_upload_rows IS 'Stores individual rows from bulk uploads with validation status';
COMMENT ON TABLE audit_logs IS 'Comprehensive audit trail for all bulk operations';
COMMENT ON FUNCTION check_user_permission IS 'Checks if user has specific permission';
COMMENT ON FUNCTION log_audit IS 'Logs audit events for bulk operations';
COMMENT ON FUNCTION create_bulk_upload_session IS 'Initializes a new bulk upload session';
COMMENT ON FUNCTION update_session_status IS 'Updates bulk upload session status';
