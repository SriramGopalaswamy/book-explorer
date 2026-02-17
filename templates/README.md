# Bulk Upload Templates

This directory contains CSV templates for bulk uploading data to the system.

## Templates Available

### 1. payroll_template.csv
Template for bulk uploading payroll records.

**Required Fields:**
- employee_id: Employee ID or email
- month: Month (1-12)
- year: Year (2000-2100)
- basic_salary: Basic salary amount

**Optional Fields:**
- hra: House Rent Allowance (defaults to 40% of basic if not provided)
- transport_allowance: Transport allowance (defaults to 1600)
- other_allowances: Other allowances (defaults to 0)
- pf_deduction: Provident Fund deduction (defaults to 12% of basic)
- tax_deduction: Tax deduction (defaults to 0)
- other_deductions: Other deductions (defaults to 0)

### 2. attendance_template.csv
Template for bulk uploading attendance records.

**Required Fields:**
- employee_id: Employee ID or email
- date: Date in YYYY-MM-DD format
- status: One of: present, absent, late, leave, half_day

**Optional Fields:**
- check_in: Check-in time in HH:MM:SS format (employee in-time)
- check_out: Check-out time in HH:MM:SS format (employee out-time)
- notes: Additional notes

**Note**: Each employee has a `working_week_policy` in their profile:
- 5_days: Monday to Friday (default)
- 6_days: Monday to Saturday

This policy is used for leave calculations and expected working days tracking.

### 3. roles_template.csv
Template for bulk uploading role-permission mappings.

**Required Fields:**
- role_name: Name of existing role
- permission_string: Valid permission key (e.g., books.create)

## Usage Instructions

1. Download the appropriate template
2. Fill in your data following the format
3. Save as CSV (UTF-8 encoding)
4. Upload through the bulk upload interface or API
5. Review validation results
6. Process validated data

## Important Notes

- Do not modify column headers
- Ensure date formats are correct (YYYY-MM-DD for dates, HH:MM:SS for times)
- Remove example rows before uploading
- Maximum recommended rows per file: 1000
- Use UTF-8 encoding to avoid character issues

For detailed instructions, see BULK_UPLOAD_GUIDE.md
