# HR LIFECYCLE ENGINE - IMPLEMENTATION GUIDE

## Quick Start

This document provides step-by-step instructions for implementing and deploying the complete HR Lifecycle Management System.

---

## Prerequisites

- Supabase project with PostgreSQL 14+
- Node.js 18+ (for testing)
- Admin access to Supabase database
- (Optional) Microsoft 365 tenant for Graph API integration

---

## Installation Steps

### 1. Run Database Migrations

Execute the migrations in order:

```bash
# Navigate to project directory
cd /path/to/book-explorer

# Run migrations via Supabase CLI
supabase db push

# Or manually via SQL Editor in Supabase Dashboard
```

**Migration Order:**
1. `20260218050000_phase1_employee_state_machine.sql` - State machine
2. `20260218050100_phase2_event_bus_system.sql` - Event system
3. `20260218050200_phase3_database_expansion.sql` - Tables
4. `20260218050300_phase4_fnf_engine.sql` - F&F calculations
5. `20260218050400_phase5_india_payroll_engine.sql` - Payroll
6. `20260218050500_phase6_manager_sync.sql` - MS Graph sync
7. `20260218050600_phase7_exit_workflow.sql` - Exit process
8. `20260218050700_phase8_record_locking.sql` - Locking
9. `20260218050800_test_data_seeding.sql` - Test data (optional)
10. `20260218050900_comprehensive_qa_tests.sql` - QA tests (optional)

### 2. Verify Installation

```sql
-- Check if all tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN (
    'profiles', 'state_transition_history', 'hr_events',
    'employment_periods', 'salary_structures', 'final_settlements',
    'employee_assets', 'exit_workflow', 'payroll_config'
  );

-- Check if all functions exist
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public'
  AND routine_name LIKE '%employee%' OR routine_name LIKE '%payroll%';
```

### 3. Configure Payroll Settings

Update payroll configuration if needed:

```sql
-- View current config
SELECT * FROM public.payroll_config;

-- Update PF rates (example)
UPDATE public.payroll_config
SET config_value = jsonb_build_object(
  'employee_rate', 0.12,
  'employer_rate', 0.12,
  'employer_admin_rate', 0.011,
  'wage_ceiling', 15000
)
WHERE config_key = 'pf_rates';
```

### 4. Set Up User Roles

```sql
-- Assign admin role
INSERT INTO public.user_roles (user_id, role)
VALUES ('your-user-uuid', 'admin');

-- Assign HR role
INSERT INTO public.user_roles (user_id, role)
VALUES ('hr-user-uuid', 'hr');
```

---

## Usage Examples

### Employee Lifecycle

#### 1. Create New Employee (Draft State)

```sql
INSERT INTO public.profiles (
  user_id, full_name, email, department, job_title,
  employee_id, date_of_birth, current_state
) VALUES (
  'user-uuid',
  'John Doe',
  'john.doe@company.com',
  'Engineering',
  'Software Engineer',
  'EMP001',
  '1990-01-15',
  'draft'
);
```

#### 2. Transition to Active

```sql
SELECT * FROM public.transition_employee_state(
  'profile-uuid',
  'active'::employee_state,
  'Onboarding completed'
);
```

#### 3. Create Salary Structure

```sql
INSERT INTO public.salary_structures (
  profile_id,
  effective_from,
  annual_ctc,
  monthly_gross,
  structure_json,
  is_current,
  status
) VALUES (
  'profile-uuid',
  CURRENT_DATE,
  1200000,
  100000,
  jsonb_build_object(
    'basic', 40000,
    'hra', 30000,
    'transport', 5000,
    'special_allowance', 25000
  ),
  TRUE,
  'active'
);
```

### Payroll Processing

#### Process Monthly Payroll

```sql
-- Single employee
SELECT public.process_payroll_for_employee(
  'profile-uuid',
  '2024-03', -- pay period YYYY-MM
  'new_regime', -- or 'old_regime'
  'Maharashtra' -- state for PT
);

-- Batch processing (loop through active employees)
DO $$
DECLARE
  emp RECORD;
BEGIN
  FOR emp IN 
    SELECT id FROM public.profiles 
    WHERE current_state IN ('active', 'confirmed', 'on_probation')
      AND is_deleted = FALSE
  LOOP
    PERFORM public.process_payroll_for_employee(
      emp.id,
      '2024-03',
      'new_regime',
      'Maharashtra'
    );
  END LOOP;
END $$;
```

### Exit Workflow

#### 1. Initiate Exit

```sql
SELECT public.initiate_employee_exit(
  'profile-uuid',
  CURRENT_DATE, -- resignation date
  CURRENT_DATE + 30, -- last working day
  'Better opportunity',
  'resignation',
  30 -- notice period days
);
```

#### 2. Reassign Direct Reports

```sql
SELECT public.reassign_direct_reports(
  'exiting-manager-uuid',
  'new-manager-uuid'
);
```

#### 3. Mark Assets Returned

```sql
UPDATE public.employee_assets
SET 
  status = 'returned',
  returned_date = CURRENT_DATE,
  returned_to = 'admin-uuid'
WHERE profile_id = 'profile-uuid'
  AND status = 'assigned';

-- Update exit workflow
UPDATE public.exit_workflow
SET assets_returned = TRUE
WHERE profile_id = 'profile-uuid';
```

#### 4. Finalize Exit (Auto-calculates F&F)

```sql
SELECT public.finalize_employee_exit('profile-uuid');
```

#### 5. Approve F&F

```sql
-- Get F&F ID
SELECT id, gross_earnings, net_payable
FROM public.final_settlements
WHERE profile_id = 'profile-uuid';

-- Approve
SELECT public.approve_fnf(
  'fnf-uuid',
  'Approved by Finance Head'
);

-- This will auto-lock all salary, payroll, attendance records
```

### Manual F&F Calculations

#### Calculate Individual Components

```sql
-- Leave encashment
SELECT public.calculate_leave_encashment('profile-uuid', CURRENT_DATE);

-- Gratuity
SELECT public.calculate_gratuity('profile-uuid', CURRENT_DATE);

-- Notice recovery
SELECT public.calculate_notice_recovery(
  'profile-uuid',
  '2024-01-15', -- resignation date
  '2024-02-15', -- last working day
  30 -- notice period required
);

-- Asset recovery
SELECT public.calculate_asset_recovery('profile-uuid');
```

---

## Event Processing

### View Pending Events

```sql
SELECT 
  id,
  event_type,
  entity_type,
  entity_id,
  processing_status,
  created_at
FROM public.hr_events
WHERE processing_status = 'pending'
ORDER BY created_at ASC;
```

### Process Events Manually

```sql
SELECT * FROM public.process_pending_events(
  10, -- batch size
  'EmployeeActivated'::hr_event_type -- specific type or NULL for all
);
```

### Set Up Automated Event Processing

Create a pg_cron job (if pg_cron extension is enabled):

```sql
-- Process events every 5 minutes
SELECT cron.schedule(
  'process-hr-events',
  '*/5 * * * *', -- every 5 minutes
  $$SELECT public.process_pending_events(50)$$
);
```

---

## Monitoring & Reporting

### Employee State Distribution

```sql
SELECT 
  current_state,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 2) as percentage
FROM public.profiles
WHERE is_deleted = FALSE
GROUP BY current_state
ORDER BY count DESC;
```

### Payroll Summary

```sql
SELECT 
  pay_period,
  COUNT(*) as employees,
  SUM(net_pay) as total_payout,
  SUM(pf_deduction) as total_pf,
  SUM(tax_deduction) as total_tds
FROM public.payroll_records
WHERE status = 'processed'
GROUP BY pay_period
ORDER BY pay_period DESC;
```

### Pending F&F Settlements

```sql
SELECT 
  p.full_name,
  p.employee_id,
  fs.exit_date,
  fs.status,
  fs.net_payable,
  fs.calculation_date
FROM public.final_settlements fs
JOIN public.profiles p ON p.id = fs.profile_id
WHERE fs.status IN ('calculated', 'pending_approval')
ORDER BY fs.exit_date ASC;
```

### Lock Status Report

```sql
SELECT 
  p.full_name,
  p.employee_id,
  public.get_lock_status(p.id) as lock_details
FROM public.profiles p
WHERE p.current_state IN ('fnf_completed', 'archived');
```

---

## Troubleshooting

### Common Issues

**1. State transition fails**
```sql
-- Check validation errors
SELECT * FROM public.validate_state_transition('profile-uuid', 'new_state');
```

**2. Payroll calculation errors**
```sql
-- Check if salary structure exists
SELECT * FROM public.salary_structures
WHERE profile_id = 'profile-uuid'
  AND is_current = TRUE
  AND status = 'active';
```

**3. F&F calculation fails**
```sql
-- Check all components
SELECT 
  public.calculate_salary_proration('profile-uuid', CURRENT_DATE) as salary,
  public.calculate_leave_encashment('profile-uuid', CURRENT_DATE) as leave,
  public.calculate_gratuity('profile-uuid', CURRENT_DATE) as gratuity;
```

**4. Locked record update fails**
```sql
-- Check lock status
SELECT is_locked, locked_at, locked_by
FROM public.salary_structures
WHERE id = 'structure-uuid';

-- Emergency unlock (admin only)
SELECT public.emergency_unlock_record(
  'salary_structures',
  'structure-uuid',
  'Reason for unlock'
);
```

---

## Security Best Practices

1. **Never expose service role key** - Use anon key in frontend
2. **Always use RLS** - All tables have RLS enabled
3. **Audit admin actions** - All unlocks and overrides are logged
4. **Rotate secrets regularly** - Update auth tokens monthly
5. **Monitor audit logs** - Review suspicious activities weekly

---

## Performance Optimization

### Recommended Indexes (Already Created)

```sql
-- Profile lookups
CREATE INDEX idx_profiles_employee_id ON profiles(employee_id);
CREATE INDEX idx_profiles_email ON profiles(email);

-- Payroll queries
CREATE INDEX idx_payroll_period ON payroll_records(pay_period, profile_id);

-- Event processing
CREATE INDEX idx_events_pending ON hr_events(processing_status) 
WHERE processing_status = 'pending';
```

### Query Optimization

```sql
-- Use EXPLAIN ANALYZE to check query performance
EXPLAIN ANALYZE
SELECT * FROM public.profiles
WHERE department = 'Engineering'
  AND current_state = 'active';
```

---

## Backup & Recovery

### Daily Backups

Supabase provides automatic backups. For additional safety:

```bash
# Export specific tables
pg_dump -h your-db.supabase.co \
  -U postgres \
  -t public.profiles \
  -t public.salary_structures \
  -t public.payroll_records \
  -t public.final_settlements \
  > hr_backup_$(date +%Y%m%d).sql
```

### Point-in-Time Recovery

```sql
-- View state transition history
SELECT * FROM public.state_transition_history
WHERE profile_id = 'profile-uuid'
ORDER BY transitioned_at DESC;

-- View salary history
SELECT * FROM public.salary_structures
WHERE profile_id = 'profile-uuid'
ORDER BY effective_from DESC;
```

---

## Support & Maintenance

### Regular Maintenance Tasks

**Weekly:**
- Review failed events
- Check pending F&F approvals
- Audit lock statuses

**Monthly:**
- Process payroll for all employees
- Archive exited employees
- Review and update payroll config

**Quarterly:**
- Update tax slabs if changed
- Review PF/ESI rates for updates
- Conduct security audit

**Annually:**
- Tax regime updates
- Year-end TDS reconciliation
- Data archival

---

## API Integration Examples

### Using Supabase JavaScript Client

```javascript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Transition employee state
const { data, error } = await supabase.rpc('transition_employee_state', {
  p_profile_id: 'uuid',
  p_new_state: 'active',
  p_reason: 'Onboarding completed'
})

// Process payroll
const { data: payroll } = await supabase.rpc('process_payroll_for_employee', {
  p_profile_id: 'uuid',
  p_pay_period: '2024-03',
  p_tax_regime: 'new_regime',
  p_state: 'Maharashtra'
})

// Calculate F&F
const { data: fnfId } = await supabase.rpc('calculate_fnf', {
  p_profile_id: 'uuid',
  p_exit_date: '2024-03-31',
  p_last_working_day: '2024-03-31',
  p_resignation_date: '2024-03-01',
  p_notice_period_days: 30
})
```

---

## Contact & Support

For issues or questions:
- Check the QA Audit Report: `ENTERPRISE_HR_QA_AUDIT_REPORT.md`
- Review migration files for detailed comments
- Check Supabase logs for runtime errors

---

**Last Updated:** February 18, 2026  
**Version:** 1.0
