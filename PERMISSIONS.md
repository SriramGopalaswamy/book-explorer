# GRX10 Role-Based Access Control — Permission Matrix

> **Source of truth**: This file documents the *default* permissions seeded into every new
> organization.  Admins can override these defaults per-org via **Settings → Roles & Permissions**.
> Admin and super_admin rows are permanently locked to full access and cannot be reconfigured.

---

## Roles

| Role | Description |
|---|---|
| `admin` | Full access to everything. Cannot be restricted. |
| `hr` | HRMS operations: employees, payroll run, attendance, leaves, holidays, CTC. |
| `manager` | Team-scoped: manager inbox, team attendance/leaves/reimbursements, own payslip. |
| `finance` | Full financial suite + payroll approve/export. No HR admin or user management. |
| `payroll` | View-only payroll by default. Configurable via Settings → Roles & Permissions. |
| `employee` | Self-service: own payslip (download), own attendance, own leaves, own reimbursements, own goals. |
| `super_admin` | Platform-level. Full access. Always locked. |

---

## Permission Matrix (Defaults)

Legend: **V** = View · **C** = Create · **E** = Edit · **D** = Delete · **X** = Export · **—** = No access

| Resource | admin | hr | manager | finance | payroll | employee |
|---|---|---|---|---|---|---|
| **Core** |
| Dashboard | VCEDX | V | V | V | V | V |
| Settings | VCEDX | — | — | — | — | — |
| **Financial & Operations** |
| Financial Suite (all 25 pages) | VCEDX | — | — | VCEDX | — | — |
| Inventory | VCEDX | — | — | VCEDX | — | — |
| Manufacturing | VCEDX | — | — | VCEDX | — | — |
| Procurement | VCEDX | — | — | VCEDX | — | — |
| Sales | VCEDX | — | — | VCEDX | — | — |
| Warehouse | VCEDX | — | — | VCEDX | — | — |
| **HRMS** |
| Employees (HR) | VCEDX | VCEDX | — | — | — | — |
| Payroll (run/approve) | VCEDX | VCED X | — | V E X | V | — |
| My Payslips | VCEDX | V X | V X | V X | V X | V X |
| Attendance Management | VCEDX | VCEDX | V E | — | — | — |
| Leave Management | VCEDX | VCEDX | V E | — | — | V C |
| Holidays | VCEDX | VCEDX | V | V | V | V |
| Org Chart | VCEDX | V | V | V | V | V |
| CTC Components | VCEDX | VCEDX | — | V | — | — |
| Manager Inbox | VCEDX | V | VCEDX | — | — | — |
| Reimbursements | VCEDX | VCEDX | V E | V E | — | V C |
| **People & Performance** |
| Goals & Performance | VCEDX | VCEDX | VCEDX | V | V | V C E |
| **Administration** |
| Audit Log | VCEDX | — | — | — | — | — |
| Upload History | VCEDX | — | — | V X | — | — |
| User Management | VCEDX | — | V E | — | — | — |
| Connectors | VCEDX | — | — | — | — | — |

> **Notes**
> - `manager` User Management (V E) = view + edit **direct reports only**; enforced server-side.
> - `employee` attendance/leaves/reimbursements/goals = **own data only**; enforced by Supabase RLS.
> - `finance` payroll = approve (edit) + export only; HR runs/creates payroll.
> - `payroll` role is configurable from its minimal default; admin can elevate it as needed.

---

## Access Control Architecture

```
Browser Request
      │
      ▼
ProtectedRoute           — must be authenticated
      │
      ▼
SubscriptionGuard        — org must have active subscription
      │
      ▼
AdminRoute / PermissionRoute  — role & permission check (frontend)
      │
      ▼
Supabase RLS             — server-side row-level security (always enforced)
      │
      ▼
Edge Function (manage-roles)  — server-side role validation for mutations
```

### Layer responsibilities

| Layer | What it enforces |
|---|---|
| `AdminRoute` | Admin-only pages: Settings, AuditLog, Approvals, MCP Tools |
| `PermissionRoute` | Resource-level page access from `role_permissions` table |
| `PermissionGate` | Inline UI elements (buttons, tabs, columns) |
| Supabase RLS | Row-level data isolation — cannot be bypassed from frontend |
| Edge functions | Server-side validation of all write mutations |

---

## FMEA — Failure Mode & Effects Analysis

| # | Failure Mode | Cause | Effect | Severity | Current Control | Recommended Fix |
|---|---|---|---|---|---|---|
| F-01 | Employee sees admin UI | Duplicate roles in `user_roles` (both `admin` + `employee`) | Full admin access in sidebar & pages | Critical | None | **Fixed**: org-scoped `useCurrentRole()` picks highest role; Settings.tsx now uses AdminRoute, not raw DB query |
| F-02 | Settings page bypassed via direct URL | Settings wrapped only in `ProtectedRoute`, not `AdminRoute` | Non-admin reaches Settings | High | Client-side `useState` check (bypassable via DevTools) | **Fixed**: AdminRoute added in App.tsx |
| F-03 | Cross-org privilege escalation | Settings.tsx admin check was not org-scoped (queried user_roles without `organization_id` filter) | User with admin in Org A bypasses Settings in Org B | Critical | None | **Fixed**: AdminRoute uses org-scoped `useCurrentRole()` |
| F-04 | HR sees Audit Log / Approvals / MCP Tools | `HRAdminRoute` used instead of `AdminRoute` on these routes | HR can access admin-only tools | High | Route guard allows HR | **Fixed**: Routes now use AdminRoute |
| F-05 | HR sees Settings sidebar link | Sidebar showed Settings to `isAdmin \|\| isHR` | HR can navigate to Settings | Medium | Settings page had client-side check | **Fixed**: Sidebar footer only shows Settings to `isAdmin \|\| isSuperAdmin` (already correct) |
| F-06 | `payroll` role falls through to `employee` in role resolution | `useCurrentRole()` priority list missing `payroll` | Payroll-role users see employee UI | Medium | None | **Fixed**: `payroll` added to priority chain |
| F-07 | Horizontal: Employee accesses another employee's payslip | Missing RLS scope | Data leak | High | RLS exists on `payroll_records` | Verify RLS uses `auth.uid()` scoping |
| F-08 | Manager changes another user's role | `manage-roles` edge function `set_role` is admin-only, but UI role selector is visible to managers | Role escalation | High | Edge function blocks non-admin | UI selector must be hidden from manager role in Settings |
| F-09 | Finance calls manage-roles `set_role` directly | No UI block, edge function blocks it | Blocked at server | Low | Edge function enforces admin-only | Acceptable (server-side enforced) |
| F-10 | Permission configurator grants access beyond RLS floor | Admin grants finance `can_create` on employees, but RLS denies insert | Confusing UX; UI says allowed but DB rejects | Medium | RLS is the floor | Document in UI: "permissions cannot exceed your database security policy" |
| F-11 | New org has no seeded permissions | DB has no rows for org; `useRolePermissions` falls back to DEFAULT_PERMISSIONS | Correct fallback behavior | Low | Code fallback | Seed on org creation via trigger |
| F-12 | MS365 user attribute changes role | MS365 profile data influences role resolution | Privilege escalation from IdP | High | Roles stored only in `user_roles`, not from MS365 claims | Verify `AuthCallback.tsx` does not copy MS365 attributes to roles |
| F-13 | Session token replay after deactivation | Deactivated user retains valid JWT until expiry | Access after deactivation | Medium | Supabase bans auth account | Ban happens immediately in `deactivate_user` |
| F-14 | Bulk upload grants roles | CSV upload with role field processed without admin check | Role escalation via bulk import | High | `useBulkUpload.ts` — verify role field handling | Audit bulk upload to ensure role column is ignored or admin-gated |
| F-15 | `payroll` role in `app_role` enum but excluded from `useCurrentRole()` | Missing from priority chain | Users resolved as `employee` | Medium | None | **Fixed** in this PR |

---

## Invariants (Never Break)

1. `admin` and `super_admin` permissions are **never stored** in `role_permissions` — they always return `true` in `useRolePermissions`.
2. `role_permissions` rows are **org-scoped** — no cross-org permission leakage.
3. All permission checks in route guards use `useCurrentRole()` which is **org-scoped** via `useUserOrganization()`.
4. Supabase RLS policies are the **security floor** — frontend permission grants cannot exceed what RLS allows at DB level.
5. Role assignment (`set_role`) is **admin-only** at the edge function level, regardless of UI state.
6. Deactivation MUST route through `initiateDeactivateOrDelete()` — never call `deactivate_user` directly without the manager reassignment dialog.
