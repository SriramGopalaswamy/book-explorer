# GRX10 Repo Recon (grounding for all GBC issues)

## Stack
- **Frontend:** React 18.3 + Vite 5.4 + TypeScript 5.8, shadcn/ui (Radix + Tailwind 3.4), `@supabase/supabase-js` 2.95.
- **State:** React Query 5.83 only — no Zustand/Redux/Jotai. Auth/Subscription/Theme via React Context.
- **Tests:** Vitest 3.2.4 + Testing Library. Run with `npm run test`.
- **Lint:** ESLint 9.32 (`npm run lint`).
- **Typecheck:** No dedicated `typecheck` script — `npm run build` (Vite) is the de-facto type gate.
- **Backend:** Supabase Postgres + 40+ Edge Functions (`supabase/functions/`). 500+ migrations in `supabase/migrations/`.

## Layout
- `src/components/` — 19 sub-domains (`auth/`, `layout/`, `financial/`, `hrms/`, `payroll/`, `inventory/`, `manufacturing/`, `sales/`, `procurement/`, `warehouse/`, `ai/`, `analytics/`, `audit/`, `banking/`, `bulk-upload/`, `dashboard/`, `employees/`, `onboarding/`, `platform/`, `settings/`, `dev/`, `ui/`).
- `src/hooks/` — 83 custom hooks (React-Query wrappers per resource). Notable: `useUserOrganization`, `useSessionContext`, `useBulkUpload` (53KB).
- `src/pages/` — 88 route components, each lazy-loaded.
- `src/lib/` — 18 helpers (`permissions.ts`, `payslip-utils.ts`, `supabase-helpers.ts`, `validation-schemas.ts`).
- `src/contexts/` — `AuthContext`, `SubscriptionContext`, `ThemeContext`, `DevModeContext`.
- `src/integrations/supabase/` — Supabase client.

## Auth & RLS
- `AuthProvider` (`src/contexts/AuthContext.tsx`): `onAuthStateChange` + `getSession()`. Rate limit 5 attempts / 15 min via `localStorage`.
- `useSessionContext` returns `{ organizationId, organization, subscription }` cached by uid; React-Query cache cleared on `SIGNED_OUT`, invalidated on `SIGNED_IN`.
- `useUserOrganization` is a thin wrapper over the above.
- RLS pattern: helper functions like `is_admin_or_hr(uid)` and org-scoped variants `is_admin_or_hr_in_org(uid, org_id)`. Tables carry `organization_id`. Policies typically combine `auth.uid() = user_id OR is_admin_or_hr_in_org(...)`.

## Routing
`src/App.tsx`: `QueryClientProvider → ThemeProvider → AuthProvider → SubscriptionProvider → BrowserRouter`. Routes wrapped with `ProtectedRoute`, `SubscriptionGuard`, `PermissionGate`, role-specific guards (`FinanceRoute`, `HRAdminRoute`, etc.). All page components are `React.lazy()`-loaded.

## Multi-tenant model
1. User logs in → AuthContext `SIGNED_IN`.
2. `useSessionContext` fetches organization (cached single query).
3. Pages read org via `useUserOrganization` and filter every Supabase query with `.eq("organization_id", orgId)`.
4. RLS enforces same constraint at DB level.

## Storage buckets
- `invoice-assets` (public), `email-assets` (public), `tenant-branding` (public), `memo-attachments` (private 20MB), `erp-documents-storage` (private 100MB), plus several others.
- Public buckets are a **known concern** for GBC-7, GBC-15, GBC-17 (see issue list).

## Project-level invariants (from CLAUDE.md)
- Regression-prevention: list fields/handlers before any rewrite; review own diff before commit.
- `financial_records` with `journal_entry_id` are trigger-owned — do NOT write directly.
- Payslip field registry is fixed (some fields intentionally removed; do not restore).
- Address fields must follow `address_line1/2 + city + state + pincode + country` standard, never a single `address` text.
- `organization_compliance` holds legal/branding identity; `organization_settings.logo_url` holds the logo.
- Dual `user_id`/`profile_id` columns on four tables: `Reimbursements.tsx:115` still relies on `user_id` and must be migrated before column drop.

## Quality gates this audit will run per issue
1. `npm run lint`
2. `npm run build` (acts as typecheck)
3. `npm run test`
Any of these failing ⇒ status `blocked`.
