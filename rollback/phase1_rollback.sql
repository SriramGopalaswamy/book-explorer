-- =====================================================================
-- ROLLBACK SCRIPT: Phase 1 - Accounting Integrity Layer
-- =====================================================================
-- Description: Safely removes Phase 1 tables and functions
-- Use Case: Emergency rollback if Phase 1 causes critical issues
-- Execution Time: ~30 seconds
-- Data Loss: YES - All journal entries, vendors, bills, payment allocations
-- =====================================================================

BEGIN;

-- Disable audit triggers first to prevent cascading audit logs
DROP TRIGGER IF EXISTS audit_credit_notes ON credit_notes;
DROP TRIGGER IF EXISTS audit_payment_allocations ON payment_allocations;
DROP TRIGGER IF EXISTS audit_bill_items ON bill_items;
DROP TRIGGER IF EXISTS audit_bills ON bills;
DROP TRIGGER IF EXISTS audit_vendors ON vendors;
DROP TRIGGER IF EXISTS audit_journal_entry_lines ON journal_entry_lines;
DROP TRIGGER IF EXISTS audit_journal_entries ON journal_entries;

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS credit_notes CASCADE;
DROP TABLE IF EXISTS payment_allocations CASCADE;
DROP TABLE IF EXISTS bill_items CASCADE;
DROP TABLE IF EXISTS bills CASCADE;
DROP TABLE IF EXISTS vendors CASCADE;
DROP TABLE IF EXISTS journal_entry_lines CASCADE;
DROP TABLE IF EXISTS journal_entries CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS issue_credit_note CASCADE;
DROP FUNCTION IF EXISTS allocate_payment_to_bill CASCADE;
DROP FUNCTION IF EXISTS allocate_payment_to_invoice CASCADE;
DROP FUNCTION IF EXISTS generate_credit_note_number CASCADE;
DROP FUNCTION IF EXISTS approve_bill CASCADE;
DROP FUNCTION IF EXISTS create_bill_with_journal CASCADE;
DROP FUNCTION IF EXISTS generate_bill_number CASCADE;
DROP FUNCTION IF EXISTS generate_vendor_code CASCADE;
DROP FUNCTION IF EXISTS reverse_journal_entry CASCADE;
DROP FUNCTION IF EXISTS post_journal_entry CASCADE;
DROP FUNCTION IF EXISTS generate_entry_number CASCADE;
DROP FUNCTION IF EXISTS check_journal_entry_period_lock CASCADE;
DROP FUNCTION IF EXISTS prevent_posted_entry_deletion CASCADE;
DROP FUNCTION IF EXISTS prevent_posted_entry_modification CASCADE;
DROP FUNCTION IF EXISTS validate_journal_entry_balance CASCADE;
DROP FUNCTION IF EXISTS detect_suspicious_activity CASCADE;
DROP FUNCTION IF EXISTS get_user_activity_summary CASCADE;
DROP FUNCTION IF EXISTS get_audit_trail CASCADE;
DROP FUNCTION IF EXISTS audit_trigger_function CASCADE;
DROP FUNCTION IF EXISTS create_audit_log CASCADE;

-- Drop views
DROP VIEW IF EXISTS recent_financial_activity CASCADE;

COMMIT;

-- =====================================================================
-- VERIFICATION
-- =====================================================================
-- Run this query to verify rollback success:
-- SELECT table_name FROM information_schema.tables 
-- WHERE table_schema = 'public' AND table_name IN (
--   'journal_entries', 'journal_entry_lines', 'vendors', 'bills', 
--   'bill_items', 'payment_allocations', 'credit_notes', 'audit_logs'
-- );
-- Expected result: 0 rows
-- =====================================================================
