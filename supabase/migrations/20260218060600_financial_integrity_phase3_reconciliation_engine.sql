-- =====================================================================
-- FINANCIAL INTEGRITY SYSTEM - PHASE 3: Reconciliation Engine
-- =====================================================================
-- Migration: 20260218060600_financial_integrity_phase3_reconciliation_engine.sql
-- Description: Automated reconciliation and integrity checking
-- Dependencies: canonical views, invoices, bills, payments
-- =====================================================================

-- =====================================================================
-- TABLE: financial_integrity_alerts
-- =====================================================================
CREATE TABLE IF NOT EXISTS financial_integrity_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN (
    'ar_mismatch',
    'ap_mismatch', 
    'cash_mismatch',
    'revenue_mismatch',
    'expense_mismatch',
    'unbalanced_entry',
    'orphaned_document'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  expected_value NUMERIC(15,2),
  actual_value NUMERIC(15,2),
  variance NUMERIC(15,2),
  variance_percentage NUMERIC(5,2),
  reference_type TEXT,
  reference_id UUID,
  detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID REFERENCES auth.users(id),
  resolution_notes TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_integrity_alerts_org_unresolved 
  ON financial_integrity_alerts(organization_id, detected_at DESC) 
  WHERE resolved_at IS NULL;

CREATE INDEX idx_integrity_alerts_type_severity 
  ON financial_integrity_alerts(alert_type, severity, detected_at DESC);

-- Enable RLS
ALTER TABLE financial_integrity_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view alerts for their organization"
ON financial_integrity_alerts FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = financial_integrity_alerts.organization_id
    AND om.user_id = auth.uid()
  )
);

COMMENT ON TABLE financial_integrity_alerts IS 
  'Stores financial data integrity violations and reconciliation mismatches';

-- =====================================================================
-- TABLE: reconciliation_history
-- =====================================================================
CREATE TABLE IF NOT EXISTS reconciliation_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  reconciliation_type TEXT NOT NULL CHECK (reconciliation_type IN (
    'ar_subledger',
    'ap_subledger',
    'cash_bank',
    'revenue_ledger',
    'expense_ledger',
    'full_system'
  )),
  status TEXT NOT NULL CHECK (status IN ('success', 'warning', 'failed')),
  alerts_created INTEGER NOT NULL DEFAULT 0,
  records_checked INTEGER NOT NULL DEFAULT 0,
  variance_found NUMERIC(15,2),
  run_by UUID REFERENCES auth.users(id),
  run_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  duration_ms INTEGER,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_reconciliation_history_org_date 
  ON reconciliation_history(organization_id, run_at DESC);

-- Enable RLS
ALTER TABLE reconciliation_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view reconciliation history for their organization"
ON reconciliation_history FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = reconciliation_history.organization_id
    AND om.user_id = auth.uid()
  )
);

-- =====================================================================
-- FUNCTION: Reconcile AR Subledger vs Control Account
-- =====================================================================
CREATE OR REPLACE FUNCTION reconcile_ar_subledger(p_organization_id UUID)
RETURNS TABLE (
  status TEXT,
  subledger_total NUMERIC,
  control_account_total NUMERIC,
  variance NUMERIC,
  alert_id UUID
) AS $$
DECLARE
  v_invoice_total NUMERIC;
  v_ar_control_total NUMERIC;
  v_variance NUMERIC;
  v_alert_id UUID;
BEGIN
  -- Calculate total from invoice subledger (posted invoices minus payments)
  SELECT COALESCE(SUM(
    CASE 
      WHEN i.status IN ('sent', 'overdue') THEN i.total_amount
      WHEN i.status = 'paid' THEN 0
      ELSE 0
    END
  ), 0)
  INTO v_invoice_total
  FROM invoices i
  WHERE (i.organization_id = p_organization_id OR (i.organization_id IS NULL AND i.user_id::text::uuid = p_organization_id));

  -- Calculate total from AR control account in trial balance
  SELECT COALESCE(SUM(balance), 0)
  INTO v_ar_control_total
  FROM v_accounts_receivable
  WHERE organization_id = p_organization_id;

  -- Calculate variance
  v_variance := v_invoice_total - v_ar_control_total;

  -- If variance exists, create alert
  IF ABS(v_variance) > 0.01 THEN
    INSERT INTO financial_integrity_alerts (
      organization_id,
      alert_type,
      severity,
      title,
      description,
      expected_value,
      actual_value,
      variance,
      variance_percentage,
      metadata
    ) VALUES (
      p_organization_id,
      'ar_mismatch',
      CASE 
        WHEN ABS(v_variance) > 1000 THEN 'critical'
        WHEN ABS(v_variance) > 100 THEN 'high'
        ELSE 'medium'
      END,
      'AR Subledger Mismatch',
      'Accounts Receivable subledger (invoices) does not match AR control account balance',
      v_ar_control_total,
      v_invoice_total,
      v_variance,
      CASE WHEN v_ar_control_total != 0 THEN (v_variance / v_ar_control_total * 100) ELSE 0 END,
      jsonb_build_object(
        'invoice_total', v_invoice_total,
        'control_total', v_ar_control_total
      )
    )
    RETURNING id INTO v_alert_id;

    RETURN QUERY SELECT 
      'mismatch'::TEXT,
      v_invoice_total,
      v_ar_control_total,
      v_variance,
      v_alert_id;
  ELSE
    RETURN QUERY SELECT 
      'balanced'::TEXT,
      v_invoice_total,
      v_ar_control_total,
      0::NUMERIC,
      NULL::UUID;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- FUNCTION: Reconcile AP Subledger vs Control Account
-- =====================================================================
CREATE OR REPLACE FUNCTION reconcile_ap_subledger(p_organization_id UUID)
RETURNS TABLE (
  status TEXT,
  subledger_total NUMERIC,
  control_account_total NUMERIC,
  variance NUMERIC,
  alert_id UUID
) AS $$
DECLARE
  v_bill_total NUMERIC;
  v_ap_control_total NUMERIC;
  v_variance NUMERIC;
  v_alert_id UUID;
BEGIN
  -- Calculate total from bill subledger (unpaid bills)
  SELECT COALESCE(SUM(
    CASE 
      WHEN b.status IN ('approved', 'pending_payment') THEN b.total_amount
      WHEN b.status = 'paid' THEN 0
      ELSE 0
    END
  ), 0)
  INTO v_bill_total
  FROM bills b
  WHERE (b.organization_id = p_organization_id OR (b.organization_id IS NULL AND b.user_id::text::uuid = p_organization_id));

  -- Calculate total from AP control account
  SELECT COALESCE(SUM(balance), 0)
  INTO v_ap_control_total
  FROM v_accounts_payable
  WHERE organization_id = p_organization_id;

  -- Calculate variance
  v_variance := v_bill_total - v_ap_control_total;

  -- If variance exists, create alert
  IF ABS(v_variance) > 0.01 THEN
    INSERT INTO financial_integrity_alerts (
      organization_id,
      alert_type,
      severity,
      title,
      description,
      expected_value,
      actual_value,
      variance,
      variance_percentage,
      metadata
    ) VALUES (
      p_organization_id,
      'ap_mismatch',
      CASE 
        WHEN ABS(v_variance) > 1000 THEN 'critical'
        WHEN ABS(v_variance) > 100 THEN 'high'
        ELSE 'medium'
      END,
      'AP Subledger Mismatch',
      'Accounts Payable subledger (bills) does not match AP control account balance',
      v_ap_control_total,
      v_bill_total,
      v_variance,
      CASE WHEN v_ap_control_total != 0 THEN (v_variance / v_ap_control_total * 100) ELSE 0 END,
      jsonb_build_object(
        'bill_total', v_bill_total,
        'control_total', v_ap_control_total
      )
    )
    RETURNING id INTO v_alert_id;

    RETURN QUERY SELECT 
      'mismatch'::TEXT,
      v_bill_total,
      v_ap_control_total,
      v_variance,
      v_alert_id;
  ELSE
    RETURN QUERY SELECT 
      'balanced'::TEXT,
      v_bill_total,
      v_ap_control_total,
      0::NUMERIC,
      NULL::UUID;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- FUNCTION: Run Full System Reconciliation
-- =====================================================================
CREATE OR REPLACE FUNCTION run_full_reconciliation(p_organization_id UUID)
RETURNS TABLE (
  reconciliation_type TEXT,
  status TEXT,
  variance NUMERIC,
  alert_count INTEGER
) AS $$
DECLARE
  v_start_time TIMESTAMP;
  v_ar_status TEXT;
  v_ap_status TEXT;
  v_ar_variance NUMERIC;
  v_ap_variance NUMERIC;
  v_total_alerts INTEGER := 0;
  v_recon_id UUID;
BEGIN
  v_start_time := clock_timestamp();

  -- Reconcile AR
  SELECT r.status, r.variance INTO v_ar_status, v_ar_variance
  FROM reconcile_ar_subledger(p_organization_id) r;
  
  IF v_ar_status = 'mismatch' THEN
    v_total_alerts := v_total_alerts + 1;
  END IF;

  -- Reconcile AP
  SELECT r.status, r.variance INTO v_ap_status, v_ap_variance
  FROM reconcile_ap_subledger(p_organization_id) r;
  
  IF v_ap_status = 'mismatch' THEN
    v_total_alerts := v_total_alerts + 1;
  END IF;

  -- Record reconciliation history
  INSERT INTO reconciliation_history (
    organization_id,
    reconciliation_type,
    status,
    alerts_created,
    records_checked,
    variance_found,
    run_by,
    duration_ms,
    metadata
  ) VALUES (
    p_organization_id,
    'full_system',
    CASE WHEN v_total_alerts = 0 THEN 'success' ELSE 'warning' END,
    v_total_alerts,
    2, -- AR and AP
    COALESCE(ABS(v_ar_variance), 0) + COALESCE(ABS(v_ap_variance), 0),
    auth.uid(),
    EXTRACT(MILLISECONDS FROM clock_timestamp() - v_start_time)::INTEGER,
    jsonb_build_object(
      'ar_status', v_ar_status,
      'ap_status', v_ap_status,
      'ar_variance', v_ar_variance,
      'ap_variance', v_ap_variance
    )
  )
  RETURNING id INTO v_recon_id;

  -- Return results
  RETURN QUERY 
  SELECT 'AR'::TEXT, v_ar_status, v_ar_variance, CASE WHEN v_ar_status = 'mismatch' THEN 1 ELSE 0 END
  UNION ALL
  SELECT 'AP'::TEXT, v_ap_status, v_ap_variance, CASE WHEN v_ap_status = 'mismatch' THEN 1 ELSE 0 END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- FUNCTION: Get Latest Reconciliation Status
-- =====================================================================
CREATE OR REPLACE FUNCTION get_latest_reconciliation_status(p_organization_id UUID)
RETURNS TABLE (
  last_reconciled_at TIMESTAMP WITH TIME ZONE,
  status TEXT,
  unresolved_alerts INTEGER,
  critical_alerts INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (SELECT MAX(run_at) 
     FROM reconciliation_history 
     WHERE organization_id = p_organization_id) as last_reconciled_at,
    (SELECT status 
     FROM reconciliation_history 
     WHERE organization_id = p_organization_id 
     ORDER BY run_at DESC 
     LIMIT 1) as status,
    (SELECT COUNT(*)::INTEGER 
     FROM financial_integrity_alerts 
     WHERE organization_id = p_organization_id 
     AND resolved_at IS NULL) as unresolved_alerts,
    (SELECT COUNT(*)::INTEGER 
     FROM financial_integrity_alerts 
     WHERE organization_id = p_organization_id 
     AND resolved_at IS NULL 
     AND severity = 'critical') as critical_alerts;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- Grant permissions
-- =====================================================================
GRANT SELECT ON financial_integrity_alerts TO authenticated;
GRANT SELECT ON reconciliation_history TO authenticated;
GRANT EXECUTE ON FUNCTION reconcile_ar_subledger(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION reconcile_ap_subledger(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION run_full_reconciliation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_latest_reconciliation_status(UUID) TO authenticated;
