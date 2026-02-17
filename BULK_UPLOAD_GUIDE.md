# Bulk Excel Ingestion Engine - User Guide

## Overview

The Bulk Excel Ingestion Engine provides enterprise-grade bulk upload capabilities for:
1. **Payroll Register** - Upload employee payroll records
2. **Attendance** - Upload employee attendance records
3. **Roles** - Upload role-permission mappings

## Features

- ✅ **Two-phase processing**: Validation → Processing
- ✅ **Comprehensive validation**: Prevents duplicates, validates relationships
- ✅ **Row-level tracking**: Track success/failure of each row
- ✅ **Audit trail**: Complete audit logs for compliance
- ✅ **RLS enforcement**: Permission-based access control
- ✅ **Fiscal period validation**: Prevents posting to closed periods
- ✅ **Employee status checking**: Blocks inactive employees

## Architecture

```
Excel File → Upload Session → Validation → Processing → Database Records
                    ↓             ↓            ↓
              Session Table   Row Table   Audit Logs
```

## Database Schema

### Tables Created

1. **bulk_upload_sessions** - Tracks each upload session
2. **bulk_upload_rows** - Individual row validation/processing status
3. **audit_logs** - Comprehensive audit trail

### RPC Functions

#### Infrastructure
- `create_bulk_upload_session()` - Initialize upload session
- `update_session_status()` - Update session status
- `check_user_permission()` - Check user permissions
- `log_audit()` - Log audit events

#### Payroll Module
- `validate_payroll_bulk_upload()` - Validate payroll data
- `process_payroll_bulk_upload()` - Process validated payroll data

#### Attendance Module
- `validate_attendance_bulk_upload()` - Validate attendance data
- `process_attendance_bulk_upload()` - Process validated attendance data

#### Roles Module
- `validate_roles_bulk_upload()` - Validate role-permission mappings
- `process_roles_bulk_upload()` - Process validated role data

## Permissions Required

| Module | Permission | Roles |
|--------|-----------|-------|
| Payroll | payroll.write | admin, hr |
| Attendance | attendance.upload | admin, hr |
| Roles | roles.manage | admin |

## Usage Guide

### 1. Payroll Bulk Upload

#### Excel Template Format

```csv
employee_id,month,year,basic_salary,hra,transport_allowance,other_allowances,pf_deduction,tax_deduction,other_deductions
emp001,2,2026,50000,20000,1600,5000,6000,5000,0
emp002,2,2026,60000,24000,1600,6000,7200,7000,0
```

#### Required Fields
- `employee_id` - Employee ID or email
- `month` - Month (1-12)
- `year` - Year (2000-2100)
- `basic_salary` - Positive number

#### Optional Fields (auto-calculated if not provided)
- `hra` - House Rent Allowance (default: 40% of basic)
- `transport_allowance` - Transport (default: 1600)
- `other_allowances` - Other allowances (default: 0)
- `pf_deduction` - Provident Fund (default: 12% of basic)
- `tax_deduction` - Tax deduction (default: 0)
- `other_deductions` - Other deductions (default: 0)

#### Validation Rules
1. Employee must exist and be active
2. No duplicate records for same employee + pay period
3. Fiscal period must be open (not closed/locked)
4. All amounts must be positive

#### SQL Usage

```sql
-- Step 1: Create session
SELECT create_bulk_upload_session(
    'payroll',
    'payroll_feb_2026.xlsx',
    100,
    '{"department": "IT"}'::jsonb
);
-- Returns: session_id (UUID)

-- Step 2: Validate data
SELECT validate_payroll_bulk_upload(
    'session-uuid-here',
    '[
        {
            "employee_id": "emp001",
            "month": 2,
            "year": 2026,
            "basic_salary": 50000
        }
    ]'::jsonb
);
-- Returns: validation results

-- Step 3: Process valid rows
SELECT process_payroll_bulk_upload('session-uuid-here');
-- Returns: processing results

-- Step 4: Check results
SELECT * FROM bulk_upload_sessions WHERE id = 'session-uuid-here';
SELECT * FROM bulk_upload_rows WHERE session_id = 'session-uuid-here';
```

### 2. Attendance Bulk Upload

#### Excel Template Format

```csv
employee_id,date,status,check_in,check_out,notes
emp001,2026-02-01,present,09:00:00,18:00:00,Regular day
emp002,2026-02-01,late,09:30:00,18:00:00,Late arrival
emp003,2026-02-01,leave,,,On sick leave
```

#### Required Fields
- `employee_id` - Employee ID or email
- `date` - Date (YYYY-MM-DD)
- `status` - One of: present, absent, late, leave, half_day

#### Optional Fields
- `check_in` - Check-in time (HH:MM:SS) - **Employee in-time for the day**
- `check_out` - Check-out time (HH:MM:SS) - **Employee out-time for the day**
- `notes` - Additional notes

#### Working Week Policy
Each employee profile includes a `working_week_policy` field that can be:
- **5_days** - Monday to Friday (default)
- **6_days** - Monday to Saturday

This policy is used for:
- Leave balance calculations
- Expected working days tracking
- Attendance reporting and analytics

#### Validation Rules
1. Employee must exist and be active
2. No duplicate records for same employee + date
3. Date cannot be in future
4. Date cannot be older than 365 days
5. check_out must be after check_in (if both provided)
6. Status must be valid enum value

#### SQL Usage

```sql
-- Step 1: Create session
SELECT create_bulk_upload_session(
    'attendance',
    'attendance_feb_2026.xlsx',
    50,
    '{}'::jsonb
);

-- Step 2: Validate
SELECT validate_attendance_bulk_upload(
    'session-uuid-here',
    '[
        {
            "employee_id": "emp001",
            "date": "2026-02-01",
            "status": "present",
            "check_in": "09:00:00",
            "check_out": "18:00:00"
        }
    ]'::jsonb
);

-- Step 3: Process
SELECT process_attendance_bulk_upload('session-uuid-here');

-- Step 4: Check results
SELECT * FROM bulk_upload_sessions WHERE id = 'session-uuid-here';
```

### 3. Roles Bulk Upload

#### Excel Template Format

```csv
role_name,permission_string
Author,books.create
Author,books.update
Moderator,reviews.approve
```

#### Required Fields
- `role_name` - Existing role name
- `permission_string` - Valid permission key

#### Validation Rules
1. Role must exist and be active
2. Permission must exist and be active
3. Cannot modify system roles (protected)
4. No duplicate role-permission mappings

#### SQL Usage

```sql
-- Step 1: Create session
SELECT create_bulk_upload_session(
    'roles',
    'role_permissions.xlsx',
    25,
    '{}'::jsonb
);

-- Step 2: Validate
SELECT validate_roles_bulk_upload(
    'session-uuid-here',
    '[
        {
            "role_name": "Author",
            "permission_string": "books.create"
        }
    ]'::jsonb
);

-- Step 3: Process
SELECT process_roles_bulk_upload('session-uuid-here');

-- Step 4: Check results
SELECT * FROM bulk_upload_sessions WHERE id = 'session-uuid-here';
```

## Error Handling

### Validation Errors

Validation errors are stored in `bulk_upload_rows.validation_errors[]`:

```sql
SELECT 
    row_number,
    row_data,
    validation_errors
FROM bulk_upload_rows
WHERE session_id = 'your-session-id'
AND validation_status = 'invalid';
```

### Processing Errors

Processing errors are stored in `bulk_upload_rows.processing_error`:

```sql
SELECT 
    row_number,
    row_data,
    processing_error
FROM bulk_upload_rows
WHERE session_id = 'your-session-id'
AND processing_status = 'failed';
```

## Session Status Flow

```
pending → validating → validated → processing → completed
                ↓           ↓            ↓
          validation_failed  ↓        failed
                           cancelled
```

## Audit Trail

All bulk operations are logged:

```sql
SELECT 
    action,
    resource_type,
    details,
    created_at
FROM audit_logs
WHERE bulk_session_id = 'your-session-id'
ORDER BY created_at DESC;
```

## Security Features

### Row Level Security (RLS)

1. **Session Isolation**: Users can only see their own sessions
2. **Admin Override**: Admins/HR can view all sessions
3. **Permission Checks**: All RPC functions verify permissions
4. **Audit Logging**: All operations logged with user_id

### Permission Model

```sql
-- Check if user has permission
SELECT check_user_permission(
    auth.uid(),
    'payroll.write'
);
```

## Performance Considerations

1. **Batch Size**: Recommended max 1000 rows per session
2. **Indexing**: All foreign keys indexed for fast validation
3. **Parallel Processing**: Each row processed independently
4. **Transaction Safety**: Each row in its own exception block

## Monitoring

### Check Session Progress

```sql
SELECT 
    id,
    upload_type,
    file_name,
    total_rows,
    successful_rows,
    failed_rows,
    status,
    started_at,
    completed_at
FROM bulk_upload_sessions
WHERE user_id = auth.uid()
ORDER BY created_at DESC
LIMIT 10;
```

### Check Failed Rows

```sql
SELECT 
    s.file_name,
    r.row_number,
    r.row_data,
    r.validation_errors,
    r.processing_error
FROM bulk_upload_rows r
JOIN bulk_upload_sessions s ON s.id = r.session_id
WHERE s.id = 'your-session-id'
AND (r.validation_status = 'invalid' OR r.processing_status = 'failed');
```

## Troubleshooting

### Common Issues

**Issue**: "Permission denied: payroll.write required"
- **Solution**: Ensure user has admin or hr role

**Issue**: "Employee not found"
- **Solution**: Use valid employee_id or email from profiles table

**Issue**: "Duplicate payroll record"
- **Solution**: Check existing records, ensure unique employee + pay_period

**Issue**: "Fiscal period is closed"
- **Solution**: Reopen fiscal period or use open period

**Issue**: "Employee is not active"
- **Solution**: Update employee status to 'active' in profiles table

## Best Practices

1. **Always validate before processing**
2. **Check validation results before proceeding**
3. **Keep file sizes reasonable** (< 1000 rows per session)
4. **Use descriptive file names** for tracking
5. **Review failed rows** and fix data before retrying
6. **Monitor audit logs** for compliance

## Integration Example (TypeScript)

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function uploadPayroll(payrollData: any[]) {
  // Step 1: Create session
  const { data: sessionData } = await supabase.rpc(
    'create_bulk_upload_session',
    {
      p_upload_type: 'payroll',
      p_file_name: 'payroll_feb_2026.xlsx',
      p_total_rows: payrollData.length,
      p_metadata: {}
    }
  );
  
  const sessionId = sessionData;
  
  // Step 2: Validate
  const { data: validationResult } = await supabase.rpc(
    'validate_payroll_bulk_upload',
    {
      p_session_id: sessionId,
      p_rows: payrollData
    }
  );
  
  console.log('Validation:', validationResult);
  
  if (validationResult.invalid_rows === 0) {
    // Step 3: Process
    const { data: processResult } = await supabase.rpc(
      'process_payroll_bulk_upload',
      {
        p_session_id: sessionId
      }
    );
    
    console.log('Processing:', processResult);
    return processResult;
  } else {
    console.error('Validation failed:', validationResult.errors);
    return null;
  }
}
```

## Support

For issues or questions:
1. Check validation errors in bulk_upload_rows
2. Review audit logs for detailed tracking
3. Verify user permissions and role assignments
4. Ensure data format matches template requirements
