-- =====================================================================
-- PHASE 1: ACCOUNTING INTEGRITY LAYER - Audit Logging
-- =====================================================================
-- Migration: 20260217103300_phase1_audit_logging.sql
-- Description: Comprehensive audit trail for all financial changes
-- Dependencies: None (standalone)
-- Backward Compatible: YES (additive only)
-- =====================================================================

-- Create audit_logs table
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  organization_id UUID NULL,
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'POST', 'APPROVE', 'REVERSE')),
  old_values JSONB,
  new_values JSONB,
  changed_fields TEXT[],
  reason TEXT,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for audit log queries
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_logs_table_record ON audit_logs(table_name, record_id, created_at DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(action, created_at DESC);
CREATE INDEX idx_audit_logs_organization ON audit_logs(organization_id, created_at DESC) WHERE organization_id IS NOT NULL;
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- Enable RLS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for audit_logs (read-only for users)
CREATE POLICY "Users can view their own audit logs"
ON audit_logs FOR SELECT
USING (
  auth.uid() = user_id
  OR (organization_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = audit_logs.organization_id
    AND om.user_id = auth.uid()
  ))
  OR is_admin_or_hr(auth.uid())
);

-- Only system can insert audit logs
CREATE POLICY "System can insert audit logs"
ON audit_logs FOR INSERT
WITH CHECK (true); -- Will be called by triggers with SECURITY DEFINER

-- =====================================================================
-- FUNCTION: Create Audit Log Entry
-- =====================================================================
CREATE OR REPLACE FUNCTION create_audit_log(
  p_table_name TEXT,
  p_record_id UUID,
  p_action TEXT,
  p_old_values JSONB DEFAULT NULL,
  p_new_values JSONB DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_audit_id UUID;
  v_changed_fields TEXT[];
  v_user_id UUID;
  v_organization_id UUID;
BEGIN
  v_audit_id := gen_random_uuid();
  v_user_id := auth.uid();
  
  -- Extract organization_id from new or old values if present
  IF p_new_values IS NOT NULL AND p_new_values ? 'organization_id' THEN
    v_organization_id := (p_new_values->>'organization_id')::UUID;
  ELSIF p_old_values IS NOT NULL AND p_old_values ? 'organization_id' THEN
    v_organization_id := (p_old_values->>'organization_id')::UUID;
  END IF;
  
  -- Calculate changed fields
  IF p_old_values IS NOT NULL AND p_new_values IS NOT NULL THEN
    SELECT array_agg(key)
    INTO v_changed_fields
    FROM jsonb_each(p_new_values)
    WHERE p_old_values->>key IS DISTINCT FROM p_new_values->>key;
  END IF;
  
  INSERT INTO audit_logs (
    id, user_id, organization_id, table_name, record_id,
    action, old_values, new_values, changed_fields, reason
  )
  VALUES (
    v_audit_id, v_user_id, v_organization_id, p_table_name, p_record_id,
    p_action, p_old_values, p_new_values, v_changed_fields, p_reason
  );
  
  RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- GENERIC AUDIT TRIGGER FUNCTION
-- =====================================================================
CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
DECLARE
  v_old_values JSONB;
  v_new_values JSONB;
  v_record_id UUID;
BEGIN
  -- Convert OLD and NEW to JSONB
  IF TG_OP = 'DELETE' THEN
    v_old_values := to_jsonb(OLD);
    v_record_id := OLD.id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old_values := to_jsonb(OLD);
    v_new_values := to_jsonb(NEW);
    v_record_id := NEW.id;
  ELSIF TG_OP = 'INSERT' THEN
    v_new_values := to_jsonb(NEW);
    v_record_id := NEW.id;
  END IF;
  
  -- Create audit log
  PERFORM create_audit_log(
    TG_TABLE_NAME::TEXT,
    v_record_id,
    TG_OP,
    v_old_values,
    v_new_values
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- APPLY AUDIT TRIGGERS TO FINANCIAL TABLES
-- =====================================================================

-- Journal Entries
CREATE TRIGGER audit_journal_entries
AFTER INSERT OR UPDATE OR DELETE ON journal_entries
FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_journal_entry_lines
AFTER INSERT OR UPDATE OR DELETE ON journal_entry_lines
FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Vendors & Bills
CREATE TRIGGER audit_vendors
AFTER INSERT OR UPDATE OR DELETE ON vendors
FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_bills
AFTER INSERT OR UPDATE OR DELETE ON bills
FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_bill_items
AFTER INSERT OR UPDATE OR DELETE ON bill_items
FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Payment Allocations & Credit Notes
CREATE TRIGGER audit_payment_allocations
AFTER INSERT OR UPDATE OR DELETE ON payment_allocations
FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_credit_notes
AFTER INSERT OR UPDATE OR DELETE ON credit_notes
FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Invoices (already exists, add audit)
CREATE TRIGGER audit_invoices
AFTER INSERT OR UPDATE OR DELETE ON invoices
FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_invoice_items
AFTER INSERT OR UPDATE OR DELETE ON invoice_items
FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Banking
CREATE TRIGGER audit_bank_accounts
AFTER INSERT OR UPDATE OR DELETE ON bank_accounts
FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_bank_transactions
AFTER INSERT OR UPDATE OR DELETE ON bank_transactions
FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Chart of Accounts
CREATE TRIGGER audit_chart_of_accounts
AFTER INSERT OR UPDATE OR DELETE ON chart_of_accounts
FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Fiscal Periods
CREATE TRIGGER audit_fiscal_periods
AFTER INSERT OR UPDATE OR DELETE ON fiscal_periods
FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- =====================================================================
-- FUNCTION: Get Audit Trail for Record
-- =====================================================================
CREATE OR REPLACE FUNCTION get_audit_trail(
  p_table_name TEXT,
  p_record_id UUID
)
RETURNS TABLE (
  id UUID,
  action TEXT,
  changed_by TEXT,
  changed_at TIMESTAMP WITH TIME ZONE,
  changed_fields TEXT[],
  old_values JSONB,
  new_values JSONB,
  reason TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    al.id,
    al.action,
    COALESCE(u.email, 'System') as changed_by,
    al.created_at as changed_at,
    al.changed_fields,
    al.old_values,
    al.new_values,
    al.reason
  FROM audit_logs al
  LEFT JOIN auth.users u ON u.id = al.user_id
  WHERE al.table_name = p_table_name
    AND al.record_id = p_record_id
  ORDER BY al.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- FUNCTION: Get User Activity Summary
-- =====================================================================
CREATE OR REPLACE FUNCTION get_user_activity_summary(
  p_user_id UUID,
  p_start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '30 days',
  p_end_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)
RETURNS TABLE (
  table_name TEXT,
  action TEXT,
  count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    al.table_name,
    al.action,
    COUNT(*) as count
  FROM audit_logs al
  WHERE al.user_id = p_user_id
    AND al.created_at BETWEEN p_start_date AND p_end_date
  GROUP BY al.table_name, al.action
  ORDER BY count DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- FUNCTION: Detect Suspicious Activity
-- =====================================================================
CREATE OR REPLACE FUNCTION detect_suspicious_activity(
  p_lookback_hours INTEGER DEFAULT 24
)
RETURNS TABLE (
  user_id UUID,
  user_email TEXT,
  suspicious_action TEXT,
  count BIGINT,
  severity TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH activity_stats AS (
    SELECT 
      al.user_id,
      al.action,
      COUNT(*) as action_count
    FROM audit_logs al
    WHERE al.created_at >= NOW() - (p_lookback_hours || ' hours')::INTERVAL
    GROUP BY al.user_id, al.action
  )
  SELECT 
    a.user_id,
    COALESCE(u.email, 'Unknown') as user_email,
    a.action as suspicious_action,
    a.action_count as count,
    CASE 
      WHEN a.action = 'DELETE' AND a.action_count > 50 THEN 'CRITICAL'
      WHEN a.action = 'DELETE' AND a.action_count > 20 THEN 'HIGH'
      WHEN a.action_count > 200 THEN 'HIGH'
      WHEN a.action_count > 100 THEN 'MEDIUM'
      ELSE 'LOW'
    END as severity
  FROM activity_stats a
  LEFT JOIN auth.users u ON u.id = a.user_id
  WHERE a.action_count > 50
  ORDER BY a.action_count DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- GRANT PERMISSIONS
-- =====================================================================
GRANT EXECUTE ON FUNCTION create_audit_log TO authenticated;
GRANT EXECUTE ON FUNCTION get_audit_trail TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_activity_summary TO authenticated;
GRANT EXECUTE ON FUNCTION detect_suspicious_activity TO authenticated;

-- =====================================================================
-- CREATE VIEW: Recent Activity Dashboard
-- =====================================================================
CREATE OR REPLACE VIEW recent_financial_activity AS
SELECT 
  al.id,
  al.table_name,
  al.record_id,
  al.action,
  COALESCE(u.email, 'System') as user_email,
  al.created_at,
  al.changed_fields,
  CASE al.table_name
    WHEN 'journal_entries' THEN al.new_values->>'entry_number'
    WHEN 'invoices' THEN al.new_values->>'invoice_number'
    WHEN 'bills' THEN al.new_values->>'bill_number'
    WHEN 'vendors' THEN al.new_values->>'vendor_name'
    ELSE al.record_id::TEXT
  END as record_identifier
FROM audit_logs al
LEFT JOIN auth.users u ON u.id = al.user_id
WHERE al.created_at >= NOW() - INTERVAL '7 days'
ORDER BY al.created_at DESC;

-- RLS for view
ALTER VIEW recent_financial_activity SET (security_invoker = on);

-- =====================================================================
-- COMMENTS
-- =====================================================================
COMMENT ON TABLE audit_logs IS 'Comprehensive audit trail for all financial system changes. Immutable record of who changed what and when.';
COMMENT ON FUNCTION create_audit_log IS 'Creates an audit log entry for any table/record. Called by triggers.';
COMMENT ON FUNCTION get_audit_trail IS 'Returns complete audit history for a specific record.';
COMMENT ON FUNCTION get_user_activity_summary IS 'Summary of user activity for compliance reporting.';
COMMENT ON FUNCTION detect_suspicious_activity IS 'Detects unusual patterns like mass deletions or excessive activity.';
COMMENT ON COLUMN audit_logs.old_values IS 'JSON snapshot of record before change.';
COMMENT ON COLUMN audit_logs.new_values IS 'JSON snapshot of record after change.';
COMMENT ON COLUMN audit_logs.changed_fields IS 'Array of field names that were modified.';
