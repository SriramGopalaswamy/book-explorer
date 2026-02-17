# Bulk Excel Ingestion Engine - Technical Specification

## System Overview

The Bulk Excel Ingestion Engine is an enterprise-grade data import system designed for the GRX10-Books ERP platform. It enables bulk uploading of Payroll, Attendance, and Role-Permission data while maintaining data integrity, security, and auditability.

## Architecture

### Design Principles

1. **Non-Destructive**: Adapts to existing schema without recreating tables
2. **Two-Phase Processing**: Validation separated from data insertion
3. **Atomic Operations**: Each row processed independently with error isolation
4. **Comprehensive Auditing**: Full trail of all operations
5. **Security-First**: RLS enforcement and permission-based access

### Database Schema

#### Core Tables

##### bulk_upload_sessions
Tracks metadata for each bulk upload operation.

```sql
CREATE TABLE bulk_upload_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    upload_type TEXT NOT NULL CHECK (upload_type IN ('payroll', 'attendance', 'roles')),
    file_name TEXT NOT NULL,
    total_rows INTEGER NOT NULL DEFAULT 0,
    successful_rows INTEGER NOT NULL DEFAULT 0,
    failed_rows INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    validation_errors JSONB DEFAULT '[]'::jsonb,
    processing_errors JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Indexes:**
- idx_bulk_upload_sessions_user_id
- idx_bulk_upload_sessions_upload_type
- idx_bulk_upload_sessions_status
- idx_bulk_upload_sessions_created_at

##### bulk_upload_rows
Stores individual row data with validation and processing status.

```sql
CREATE TABLE bulk_upload_rows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES bulk_upload_sessions(id) ON DELETE CASCADE NOT NULL,
    row_number INTEGER NOT NULL,
    row_data JSONB NOT NULL,
    validation_status TEXT NOT NULL DEFAULT 'pending',
    validation_errors TEXT[],
    processing_status TEXT NOT NULL DEFAULT 'pending',
    processing_error TEXT,
    created_record_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Indexes:**
- idx_bulk_upload_rows_session_id
- idx_bulk_upload_rows_validation_status
- idx_bulk_upload_rows_processing_status

##### audit_logs
Comprehensive audit trail for compliance.

```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id UUID,
    bulk_session_id UUID REFERENCES bulk_upload_sessions(id),
    details JSONB DEFAULT '{}'::jsonb,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Indexes:**
- idx_audit_logs_user_id
- idx_audit_logs_resource_type
- idx_audit_logs_bulk_session_id
- idx_audit_logs_created_at

## Module Specifications

### 1. Payroll Module

#### Relationship Mapping
```
profiles → payroll_records → fiscal_periods
   ↓
user_roles (permission check)
```

#### Validation Rules

1. **Employee Validation**
   - Employee must exist in profiles table
   - Employee status must be 'active'
   - Matched by employee_id (UUID) or email

2. **Uniqueness Constraint**
   - UNIQUE(profile_id, pay_period)
   - Prevents duplicate payroll records for same employee/period

3. **Fiscal Period Validation**
   - Fiscal period must exist for given month/year
   - Period status must be 'open' (not 'closed' or 'locked')
   - Enforces financial governance

4. **Data Validation**
   - basic_salary > 0
   - month: 1-12
   - year: 2000-2100
   - All numeric fields must be valid decimals

#### Auto-Calculations

If not provided, the system calculates:
- HRA = basic_salary * 0.4 (40%)
- Transport Allowance = 1600
- PF Deduction = basic_salary * 0.12 (12%)
- Net Pay = (basic + hra + transport + other_allowances) - (pf + tax + other_deductions)

#### RPC Functions

**validate_payroll_bulk_upload(session_id, rows)**
- Permission: payroll.write (admin, hr)
- Returns: validation results with error details

**process_payroll_bulk_upload(session_id)**
- Permission: payroll.write (admin, hr)
- Status requirement: session must be 'validated'
- Returns: processing results

### 2. Attendance Module

#### Relationship Mapping
```
profiles → attendance_records ⟷ leave_balances
   ↓
user_roles (permission check)
```

#### Validation Rules

1. **Employee Validation**
   - Employee must exist in profiles table
   - Employee status must be 'active' (blocks inactive employees)
   - Matched by employee_id (UUID) or email

2. **Uniqueness Constraint**
   - UNIQUE(profile_id, date)
   - Prevents duplicate attendance for same employee/date

3. **Date Validation**
   - Date cannot be in future
   - Date cannot be older than 365 days
   - Must be valid DATE format

4. **Status Validation**
   - Must be one of: present, absent, late, leave, half_day
   - Enum constraint enforced

5. **Time Validation**
   - check_in and check_out must be valid TIME format
   - check_out > check_in (if both provided)

#### RPC Functions

**validate_attendance_bulk_upload(session_id, rows)**
- Permission: attendance.upload (admin, hr)
- Returns: validation results

**process_attendance_bulk_upload(session_id)**
- Permission: attendance.upload (admin, hr)
- Status requirement: session must be 'validated'
- Returns: processing results

### 3. Roles Module

#### Relationship Mapping
```
roles → role_permissions ← permissions
   ↓          ↓
user_roles (permission check)
```

#### Validation Rules

1. **Role Validation**
   - Role must exist in roles table
   - Role must be active (is_active = true)
   - System roles are protected (is_system_role = false required)
   - Matched by role name

2. **Permission Validation**
   - Permission must exist in permissions table
   - Permission must be active (is_active = true)
   - Matched by permission_string (e.g., 'books.create')

3. **Uniqueness Constraint**
   - UNIQUE(role_id, permission_id)
   - Prevents duplicate role-permission mappings

4. **Protection Rules**
   - Cannot modify system roles (SuperAdmin, Admin, etc.)
   - Ensures core security is maintained

#### RPC Functions

**validate_roles_bulk_upload(session_id, rows)**
- Permission: roles.manage (admin only)
- Returns: validation results

**process_roles_bulk_upload(session_id)**
- Permission: roles.manage (admin only)
- Status requirement: session must be 'validated'
- Returns: processing results

## Security Model

### Row Level Security (RLS)

All tables have RLS enabled with policies:

#### bulk_upload_sessions
1. **SELECT**: Own sessions + Admin/HR view all
2. **INSERT**: Own sessions only
3. **UPDATE**: Own sessions only

#### bulk_upload_rows
1. **SELECT**: Rows from own sessions
2. **INSERT**: Rows to own sessions
3. **UPDATE**: Rows in own sessions

#### audit_logs
1. **SELECT**: Own logs + Admin view all
2. **INSERT**: System can insert (SECURITY DEFINER)

### Permission Enforcement

All RPC functions check permissions before execution:

```sql
-- Example permission check
IF NOT EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'hr')
) THEN
    RAISE EXCEPTION 'Permission denied';
END IF;
```

### SECURITY DEFINER Functions

All RPC functions use `SECURITY DEFINER` to:
1. Bypass RLS for validated operations
2. Ensure consistent permission checking
3. Prevent privilege escalation

## Performance Optimization

### Indexing Strategy

1. **Foreign Keys**: All FK columns indexed
2. **Status Fields**: Filter columns indexed
3. **Date Fields**: Temporal query optimization
4. **Composite Indexes**: Multi-column queries optimized

### Batch Processing

1. **Row Independence**: Each row in exception block
2. **Transaction Safety**: Failed rows don't block others
3. **Recommended Batch Size**: ≤1000 rows
4. **Memory Efficiency**: JSONB for flexible storage

### Query Optimization

```sql
-- Optimized duplicate check
SELECT COUNT(*) INTO v_duplicate_check
FROM payroll_records
WHERE profile_id = v_profile_id
AND pay_period = v_pay_period
AND user_id = v_user_id;
-- Uses idx_payroll_records_profile_period
```

## Error Handling

### Validation Phase

Errors stored in `bulk_upload_rows.validation_errors[]`:
- Array of error messages
- Row marked as 'invalid'
- Session status: 'validation_failed'

### Processing Phase

Errors stored in `bulk_upload_rows.processing_error`:
- Single error message (SQLERRM)
- Row marked as 'failed'
- Other rows continue processing

### Exception Isolation

```sql
FOR v_row IN SELECT * FROM bulk_upload_rows
LOOP
    BEGIN
        -- Process row
        INSERT INTO target_table ...
    EXCEPTION WHEN OTHERS THEN
        -- Log error, continue to next row
        UPDATE bulk_upload_rows
        SET processing_error = SQLERRM;
    END;
END LOOP;
```

## Audit Trail

### Logged Events

1. **bulk_upload_session_created**
2. **payroll_bulk_upload_validated**
3. **payroll_bulk_upload_processed**
4. **attendance_bulk_upload_validated**
5. **attendance_bulk_upload_processed**
6. **roles_bulk_upload_validated**
7. **roles_bulk_upload_processed**

### Audit Details (JSONB)

```json
{
  "valid_rows": 95,
  "invalid_rows": 5,
  "total_rows": 100,
  "upload_type": "payroll",
  "file_name": "payroll_feb_2026.xlsx"
}
```

## Integration Points

### Existing Schema Alignment

The system integrates with:

1. **profiles** (employees)
   - Foreign key: payroll_records.profile_id
   - Foreign key: attendance_records.profile_id

2. **payroll_records**
   - Inherits existing constraints
   - Respects unique(profile_id, pay_period)

3. **fiscal_periods**
   - Validates period status before insert
   - Prevents posting to closed periods

4. **attendance_records**
   - Respects unique(profile_id, date)
   - Inherits existing RLS policies

5. **roles/permissions**
   - Validates against existing records
   - Respects is_system_role protection

## Monitoring & Observability

### Session Monitoring

```sql
-- Active sessions
SELECT * FROM bulk_upload_sessions
WHERE status IN ('pending', 'validating', 'processing')
ORDER BY created_at DESC;

-- Session summary
SELECT 
    upload_type,
    COUNT(*) as total_sessions,
    SUM(successful_rows) as total_success,
    SUM(failed_rows) as total_failed
FROM bulk_upload_sessions
GROUP BY upload_type;
```

### Error Analysis

```sql
-- Most common validation errors
SELECT 
    unnest(validation_errors) as error,
    COUNT(*) as occurrences
FROM bulk_upload_rows
WHERE validation_status = 'invalid'
GROUP BY error
ORDER BY occurrences DESC;
```

## Compliance & Governance

### Data Retention

Audit logs retained indefinitely for:
- Regulatory compliance
- Forensic analysis
- Dispute resolution

### GDPR Compliance

- User-scoped data isolation
- Audit trail for data modifications
- Supports data deletion (CASCADE on user deletion)

### SOX Compliance

- Immutable audit logs
- Fiscal period locking enforcement
- Separation of duties (permission-based)

## Future Enhancements

### Planned Features

1. **Async Processing**: Background job queue for large uploads
2. **Webhook Notifications**: Real-time status updates
3. **Template Validation**: Pre-upload format checking
4. **Rollback Support**: Undo processed uploads
5. **Scheduled Imports**: Automated recurring uploads
6. **Excel Direct Upload**: Native Excel parsing
7. **Data Transformation**: Custom field mappings
8. **Duplicate Resolution**: Merge strategies for conflicts

## Dependencies

### Database Functions

Required pre-existing functions:
- `update_updated_at_column()` - Timestamp trigger

### Permissions

Required permissions in permissions table:
- payroll.write
- attendance.upload  
- roles.manage

### Roles

Compatible with existing role structure:
- admin
- hr
- manager
- employee
- finance

## Testing Recommendations

### Unit Tests

1. Validation logic for each module
2. Permission checks
3. Duplicate detection
4. Fiscal period validation
5. Employee status checking

### Integration Tests

1. End-to-end upload flow
2. Error handling scenarios
3. RLS policy enforcement
4. Audit log generation

### Performance Tests

1. Large batch processing (1000+ rows)
2. Concurrent upload sessions
3. Query performance on indexed fields

## Deployment Checklist

- [ ] Run migration: 20260217091400_bulk_upload_infrastructure.sql
- [ ] Run migration: 20260217091500_bulk_upload_payroll.sql
- [ ] Run migration: 20260217091600_bulk_upload_attendance.sql
- [ ] Run migration: 20260217091700_bulk_upload_roles.sql
- [ ] Verify RLS policies enabled
- [ ] Test permission enforcement
- [ ] Validate audit logging
- [ ] Performance test with sample data
- [ ] Security scan with CodeQL

## Support & Maintenance

### Common Maintenance Tasks

1. **Session Cleanup**: Archive old sessions
2. **Index Maintenance**: Monitor index usage
3. **Audit Log Archival**: Move old logs to cold storage
4. **Permission Updates**: Add new module permissions

### Monitoring Metrics

- Session success rate
- Average processing time
- Error frequency by type
- User adoption by role

---

**Version**: 1.0  
**Last Updated**: 2026-02-17  
**Maintainer**: Engineering Team
