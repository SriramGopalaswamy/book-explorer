# Bulk Upload System - Features Summary

## Key Features Implemented

### ✅ Attendance Time Tracking
- **In-time and Out-time**: Each attendance record captures `check_in` and `check_out` times
- Format: HH:MM:SS (e.g., 09:00:00, 18:00:00)
- Validation: Ensures out-time is after in-time
- Optional fields: Can be left blank for leave/absent status

### ✅ Working Week Policy
- **Employee-level configuration**: Each employee profile includes `working_week_policy`
- Two options:
  - **5_days**: Monday to Friday working week (default)
  - **6_days**: Monday to Saturday working week
- Usage:
  - Leave balance calculations
  - Expected working days tracking
  - Attendance analytics and reporting
  - Workday validation

### ✅ Enterprise-Grade Features
1. **Two-Phase Processing**: Validation → Processing
2. **Row-Level Tracking**: Success/failure status for each row
3. **Comprehensive Validation**: Duplicates, relationships, constraints
4. **Audit Trail**: Complete logging for compliance
5. **RLS Enforcement**: Permission-based access control
6. **Fiscal Period Validation**: Prevents posting to closed periods

## Modules Implemented

### 1. Payroll Bulk Upload
- Validate and upload employee payroll records
- Auto-calculations for allowances and deductions
- Fiscal period validation
- Duplicate prevention

### 2. Attendance Bulk Upload
- **✨ Time tracking with check_in and check_out**
- Employee status validation (active only)
- Duplicate prevention (one record per employee per day)
- Date range validation
- **✨ Respects employee working week policy**

### 3. Roles Bulk Upload
- Role-permission mapping
- System role protection
- Permission validation
- Duplicate prevention

## Database Changes

### New Tables
1. `bulk_upload_sessions` - Track upload sessions
2. `bulk_upload_rows` - Individual row tracking
3. `audit_logs` - Comprehensive audit trail

### Schema Modifications
1. **profiles table**: Added `working_week_policy` column
   - Type: TEXT
   - Values: '5_days' or '6_days'
   - Default: '5_days'
   - Indexed for performance

## Files Added

### Migrations
- `20260217091400_bulk_upload_infrastructure.sql`
- `20260217091500_bulk_upload_payroll.sql`
- `20260217091600_bulk_upload_attendance.sql`
- `20260217091700_bulk_upload_roles.sql`
- `20260217091800_add_working_week_policy.sql`

### Documentation
- `BULK_UPLOAD_GUIDE.md` - User guide with examples
- `BULK_UPLOAD_TECHNICAL_SPEC.md` - Technical specification
- `BULK_UPLOAD_FEATURES.md` - This file

### Templates
- `templates/payroll_template.csv`
- `templates/attendance_template.csv`
- `templates/roles_template.csv`
- `templates/README.md`

## Usage Example

### Attendance Upload with Time Tracking

```csv
employee_id,date,status,check_in,check_out,notes
emp001,2026-02-01,present,09:00:00,18:00:00,Regular day
emp002,2026-02-01,late,09:30:00,18:00:00,Late arrival
emp003,2026-02-01,leave,,,On sick leave
```

### SQL Execution

```sql
-- Step 1: Create session
SELECT create_bulk_upload_session(
    'attendance',
    'attendance_feb_2026.xlsx',
    100,
    '{}'::jsonb
);

-- Step 2: Validate
SELECT validate_attendance_bulk_upload(
    'session-uuid',
    '[{"employee_id": "emp001", "date": "2026-02-01", 
       "status": "present", "check_in": "09:00:00", 
       "check_out": "18:00:00"}]'::jsonb
);

-- Step 3: Process
SELECT process_attendance_bulk_upload('session-uuid');
```

## Security Features

✅ Row Level Security (RLS) enabled on all tables  
✅ Permission-based access control  
✅ Audit logging for all operations  
✅ User isolation (users only see their own data)  
✅ Admin override for HR/Admin roles  

## Validation Rules

### Attendance Module
1. ✅ Employee must exist and be active
2. ✅ No duplicates (employee + date)
3. ✅ Date cannot be in future
4. ✅ Date cannot be older than 365 days
5. ✅ Status must be valid enum
6. ✅ **check_in and check_out must be valid TIME format**
7. ✅ **check_out must be after check_in**

### Payroll Module
1. ✅ Employee must exist and be active
2. ✅ No duplicates (employee + pay_period)
3. ✅ Fiscal period must be open
4. ✅ All amounts must be positive

### Roles Module
1. ✅ Role must exist and be active
2. ✅ Permission must exist and be active
3. ✅ System roles are protected
4. ✅ No duplicate mappings

## Performance Optimizations

- ✅ All foreign keys indexed
- ✅ Status fields indexed for filtering
- ✅ Date fields indexed for temporal queries
- ✅ Batch processing with independent rows
- ✅ Transaction safety with exception handling

## Next Steps for Users

1. **Review Documentation**: Read BULK_UPLOAD_GUIDE.md
2. **Download Templates**: Use CSV templates from `templates/` folder
3. **Configure Employees**: Set working_week_policy for each employee
4. **Upload Data**: Follow the two-phase process (validate → process)
5. **Monitor Results**: Check session status and review errors

## Support

For detailed instructions, see:
- **User Guide**: BULK_UPLOAD_GUIDE.md
- **Technical Spec**: BULK_UPLOAD_TECHNICAL_SPEC.md
- **Templates**: templates/README.md
