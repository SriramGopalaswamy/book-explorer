BEGIN;
SET LOCAL session_replication_role = replica;
DELETE FROM leave_requests WHERE organization_id='00000000-0000-0000-0000-000000000001' AND reason='Imported from 2026 leave tracker';
COMMIT;