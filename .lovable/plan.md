

## Analysis of the Uploaded PDF

The uploaded file is a **Secureye ONtime "Employee's Performance Register"** for Feb 2026 containing **~20+ employees** with calendar-grid layout. Each employee block has:
- Employee Code, Name, Department
- Daily grid: In Time, Out Time, Late Mins, Early Dep, Work Hrs, Status (days 1-28)

**Good news**: The existing `parse-attendance` edge function already supports this exact format via Gemini AI text structuring. The parsing pipeline (text extraction → Gemini text → regex fallback → Gemini vision) will extract in-time, out-time, work hours, late minutes, and status accurately.

**The Gap**: When biometric employee names (e.g., "Laxmi Sai Prasad", "Manoj kumar") don't match database profile names exactly, they end up in `unmatched_codes`. Currently, unmatched employees are simply **reported after import** with no way to fix them. Their attendance data is silently discarded.

---

## Plan: Add Manual Employee Matching Step

### Problem Statement
The current flow is: Upload → Preview → Import. Employee matching happens server-side during import with no user intervention. Unmatched employees lose all their attendance data.

### Solution: Insert a "Match Employees" step between Preview and Import

```text
Upload → Preview & Validate → Match Employees → Import Summary
  (step 1)    (step 2)           (step 3)          (step 4)
```

### Changes Required

#### 1. Edge Function Enhancement (`supabase/functions/parse-attendance/index.ts`)
- Add a new parameter `manual_mappings` (array of `{ employee_code, profile_id }`) to the import request body.
- When `manual_mappings` is provided, merge those mappings into `codeToProfileId` before inserting punches, so manually matched employees get their data imported.
- Also update the preview response to include the list of org employees (`profiles` with `id`, `full_name`, `department`) so the frontend can populate the matching dropdown without a separate API call.

#### 2. Hook Updates (`src/hooks/useAttendanceEngine.ts`)
- Update `useUploadBiometricAttendance` mutation to accept an optional `manualMappings` parameter and pass it to the edge function.
- Add a new `useOrgEmployeeList` hook (or inline query) to fetch the list of employees for the matching UI.

#### 3. Attendance Import UI (`src/pages/hrms/AttendanceImport.tsx`)
- Add a new step type `"match"` between `"preview"` and `"importing"`.
- After the preview step, auto-detect which employee codes/names from the PDF would be unmatched by:
  - Fetching the org's employee list (profiles + employee_details).
  - Running the same matching logic client-side (code match → name match → unmatched).
- Show a **matching table** for unmatched employees with:
  - Left column: biometric employee code + name + department from PDF.
  - Right column: a searchable dropdown (combobox) of database employees to manually assign.
  - Auto-matched employees shown as "Matched" with a green badge (read-only but overridable).
- "Skip" option for employees the user doesn't want to import.
- "Confirm & Import" button sends the manual mappings along with the file data.

#### 4. Component Design for Matching UI
- Reuse the existing `EmployeeCombobox` pattern from `src/components/payroll/EmployeeCombobox.tsx` for the dropdown.
- Display match confidence indicators:
  - **Auto-matched (by code)**: green badge, no action needed.
  - **Auto-matched (by name)**: blue badge, user can override.
  - **Unmatched**: red badge, user must select or skip.

### Technical Details

**Client-side pre-matching logic** (runs after preview, before showing match step):
```typescript
// Fetch org employees
const profiles = await supabase.from("profiles").select("id, full_name, department").eq("organization_id", orgId);
const empDetails = await supabase.from("employee_details").select("profile_id, employee_id_number").eq("organization_id", orgId);

// For each parsed employee, try: code match → name match → unmatched
for (const emp of previewData.employees) {
  const codeMatch = empDetails.find(e => e.employee_id_number === emp.employee_code);
  const nameMatch = profiles.find(p => p.full_name?.toLowerCase() === emp.employee_name?.toLowerCase());
  // categorize as auto_code / auto_name / unmatched
}
```

**Edge function `manual_mappings` handling** (added to the import path):
```typescript
// After automatic matching, apply manual overrides
if (body.manual_mappings) {
  for (const mapping of body.manual_mappings) {
    codeToProfileId.set(mapping.employee_code, mapping.profile_id);
    // Remove from unmatchedCodes if present
    const idx = unmatchedCodes.indexOf(mapping.employee_code);
    if (idx >= 0) unmatchedCodes.splice(idx, 1);
  }
}
```

### Files to Modify
1. `supabase/functions/parse-attendance/index.ts` — Accept `manual_mappings`, include employee list in preview response
2. `src/hooks/useAttendanceEngine.ts` — Add `manualMappings` to upload mutation, add employee list query
3. `src/pages/hrms/AttendanceImport.tsx` — Add match step UI with employee comboboxes

### What This Enables
- All employees from the biometric PDF get matched, even when names differ between the biometric device and the HR system.
- Users see exactly who was matched and how, with full control to override or skip.
- The same PDF format (Secureye ONtime Performance Register) will work reliably going forward.

