# Production Migration Guide

## Current Status

### PostgreSQL Database (Render)
- **Tables**: 14 core tables in `grxbooks` schema
- **Tenants**: 3 organizations (GRX10 Solutions, test, test 2)
- **Connection**: Via backend API at `localhost:3001`

### Supabase Database (Reference)
- **Tables**: 100 tables with full relationships
- **Data**: Production data with 1,718 total rows

## Migration Strategy

### Phase 1: Core Tables (DONE ✅)
These 14 tables are already set up:
- ai_financial_snapshots
- ai_risk_scores
- financial_records
- gl_accounts
- journal_entries
- journal_lines
- notifications
- organization_members
- organizations
- platform_roles
- profiles
- subscriptions
- user_roles

### Phase 2: Critical Business Tables (TODO)
Priority tables needed for full operation:

**Finance Module (23 tables):**
- invoices, invoice_items, invoice_settings
- customers, vendors
- bills, bill_items
- credit_notes, vendor_credits
- expenses, reimbursement_requests
- bank_accounts, bank_transactions
- credit_cards, credit_card_transactions
- scheduled_payments
- budgets
- chart_of_accounts
- fiscal_periods, financial_years
- document_sequences
- quotes, quote_items

**HRMS Module (15 tables):**
- attendance_records, attendance_punches, attendance_daily
- attendance_shifts, attendance_correction_requests
- attendance_upload_logs, attendance_parse_diagnostics
- leave_requests, leave_balances, leave_types
- payroll_records, payroll_runs, payroll_entries
- compensation_structures, compensation_components

**Asset Management (2 tables):**
- assets
- asset_depreciation_entries

**Audit & Compliance (12 tables):**
- audit_logs
- audit_compliance_runs, audit_compliance_checks
- audit_ai_anomalies, audit_ai_narratives, audit_ai_samples
- audit_risk_themes, audit_ifc_assessments
- audit_pack_exports
- ai_alerts, ai_customer_profiles, ai_vendor_profiles

### Phase 3: Supporting Tables (TODO)
Additional operational tables:
- goals, goal_plans
- memos
- employee_details, employee_documents, employee_tax_settings
- holidays
- bulk_upload_history
- organization_settings, organization_integrations
- platform_admin_logs
- simulation_runs
- etc.

## Migration Scripts

### Available Scripts

1. **Check Current Tables**
   ```bash
   node scripts/check-pg-tables.js
   ```

2. **Setup All Tables (from migrations)**
   ```bash
   node scripts/setup-all-pg-tables.js
   ```

3. **Setup Tables (safe mode)**
   ```bash
   node scripts/setup-tables-safe.js
   ```

4. **Setup 3 Tenants**
   ```bash
   node scripts/setup-3-tenants.js
   ```

5. **Setup Verification Function**
   ```bash
   node scripts/setup-verification.js
   ```

### For Production Migration

#### Option A: Export from Supabase (Recommended)

1. **Export Schema from Supabase**
   ```bash
   # Connect to Supabase PostgreSQL
   pg_dump -h db.your-project.supabase.co \
           -U postgres \
           -d postgres \
           --schema-only \
           --schema=public \
           -f supabase_schema.sql
   ```

2. **Export Data from Supabase**
   ```bash
   pg_dump -h db.your-project.supabase.co \
           -U postgres \
           -d postgres \
           --data-only \
           --schema=public \
           -f supabase_data.sql
   ```

3. **Transform for PostgreSQL**
   - Replace `public.` with `grxbooks.`
   - Remove RLS policies (`ENABLE ROW LEVEL SECURITY`, `CREATE POLICY`)
   - Remove Supabase auth functions (`auth.uid()`, `auth.role()`)
   - Remove storage references (`storage.buckets`, `storage.objects`)

4. **Import to Render PostgreSQL**
   ```bash
   psql $DATABASE_URL -f transformed_schema.sql
   psql $DATABASE_URL -f transformed_data.sql
   ```

#### Option B: Incremental Migration

1. Create missing tables one module at a time
2. Test each module thoroughly
3. Migrate data in batches
4. Verify integrity after each batch

## Data Migration Checklist

- [ ] Organizations and tenants
- [ ] Users and profiles
- [ ] User roles and permissions
- [ ] Subscriptions
- [ ] Financial records (invoices, bills, expenses)
- [ ] HRMS data (employees, attendance, payroll)
- [ ] Assets
- [ ] Audit logs
- [ ] Notifications
- [ ] Settings and configurations

## Testing Strategy

### Before Migration
- [ ] Backup Supabase database
- [ ] Test migration on staging environment
- [ ] Verify all scripts work correctly
- [ ] Document rollback procedure

### After Migration
- [ ] Run verification function (`run_financial_verification`)
- [ ] Test authentication and authorization
- [ ] Verify data integrity (record counts, totals)
- [ ] Test critical workflows
- [ ] Check foreign key constraints
- [ ] Validate reporting and analytics

## Rollback Plan

If migration fails:
1. Keep Supabase instance running as backup
2. Update `.env` to point back to Supabase
3. Investigate issues in Render PostgreSQL
4. Fix and retry migration

## Production Deployment Checklist

- [ ] All tables created successfully
- [ ] All data migrated and verified
- [ ] Indexes created for performance
- [ ] Foreign keys established
- [ ] Backend API tested with production data
- [ ] Frontend tested with production data
- [ ] Monitoring and alerting set up
- [ ] Backup strategy configured
- [ ] Documentation updated

## Database Connection Details

### Development (Current)
```env
DATABASE_URL=postgresql://testdb_xiqm_user:***@dpg-d6g26cngi27c73cku02g-a.oregon-postgres.render.com/testdb_xiqm
VITE_USE_BACKEND_API=true
VITE_API_URL=http://localhost:3001
```

### Production (Future)
- Update DATABASE_URL to production PostgreSQL instance
- Update VITE_API_URL to production backend URL
- Enable SSL/TLS for connections
- Set up connection pooling
- Configure read replicas if needed

## Support

For issues or questions:
1. Check `scripts/` directory for utility scripts
2. Review error logs in backend API console
3. Test individual migrations in isolation
4. Use `run_financial_verification` to check integrity
