
ALTER TABLE audit_compliance_runs DISABLE TRIGGER trg_prevent_audit_run_mutation;
ALTER TABLE audit_compliance_runs DISABLE TRIGGER trg_prevent_audit_run_delete;

DELETE FROM audit_ai_anomalies WHERE organization_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM audit_ai_narratives WHERE organization_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM audit_ai_samples WHERE organization_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM audit_compliance_checks WHERE organization_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM audit_ifc_assessments WHERE organization_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM audit_pack_exports WHERE organization_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM audit_compliance_runs WHERE organization_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM audit_risk_themes WHERE organization_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM audit_logs WHERE organization_id = '00000000-0000-0000-0000-000000000001';

ALTER TABLE audit_compliance_runs ENABLE TRIGGER trg_prevent_audit_run_mutation;
ALTER TABLE audit_compliance_runs ENABLE TRIGGER trg_prevent_audit_run_delete;
