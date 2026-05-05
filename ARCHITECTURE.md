# GRX10 ERP — Architecture Reference

> **Single source of truth.** All other architecture markdown files in this repo are stale
> (they describe a non-existent Express + SQLite backend). This document supersedes them.
> Last updated: 2026-04-28 by FMEA review session.

---

## 1. Business Context

| Attribute | Value |
|---|---|
| Product | GRX10 — Indian mid-market SaaS ERP |
| Target segment | 30–500 employee companies |
| Deployment model | Multi-tenant SaaS (single Supabase project, org-scoped RLS isolation) |
| Frontend hosting | Lovable (Vite SPA — static build, no SSR) |
| Live tenants | ~10 organizations, 30–50 employees each (~500 employees total) |
| Next market | United States |
| Compliance scope | Indian statutory: GST (CGST/SGST/IGST), TDS (Form 24Q), PF (EPFO ECR), PT (Karnataka slab), ESI |
| Integrations live | MS365, Shopify, Zoho, WhatsApp (webhook-based) |
| Integrations required | EPFO portal (PF ECR), TRACES (TDS 24Q), bank salary file (NEFT batch), GRAS (PT challan) |

---

## 2. Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, TanStack Query v5, React Router v6 |
| UI | shadcn/ui (Radix primitives), Tailwind CSS, Recharts |
| Backend | Supabase (PostgreSQL 15, RLS, Edge Functions, Realtime) |
| Auth | Supabase Auth (email + OAuth) |
| Edge Functions | Deno / TypeScript — 35 functions |
| File storage | Supabase Storage |
| PDF generation | Edge Functions (generate-payslip, generate-invoice-pdf, generate-quote-pdf) |
| Integrations | MS365, Shopify, Zoho, WhatsApp |
| Testing | Vitest (`npm run test`) |
| Build | Vite production build (`MODE=production` — no env var override) |

---

## 3. Multi-Tenancy

Every data table carries an `organization_id UUID NOT NULL` column. Supabase RLS
policies enforce tenant isolation — no query returns rows from another org.

```
auth.users  ──►  profiles  ──►  user_roles
                    │                │
                    │         role ∈ {admin, manager, finance,
                    │                 hr, payroll, employee}
                    ▼
              organizations  ◄──  subscriptions
                    │                    │
                    │             enabled_modules (JSONB array)
                    ▼                    │
           [all business tables]         ▼
           .eq("organization_id",  SubscriptionGuard
                org_id)            (path-prefix → module map)
```

**Key invariants:**
- Every mutation resolves `organization_id` from the caller's `profiles` row — never trusts client-supplied org IDs.
- `SubscriptionGuard` enforces module-level access via `MODULE_PATH_MAP` (11 path prefixes → module names) checked against `subscriptions.enabled_modules`.
- SuperAdmin role bypasses all subscription guards (checked before loading spinner).

---

## 4. Financial Data Architecture

Four parallel stores exist. This is the canonical mapping:

| Table(s) | Role | Status |
|---|---|---|
| `invoices` + `invoice_items` | Operational document layer | Live — source of truth for AR |
| `gl_accounts` + `journal_lines` | **Canonical GL / double-entry ledger** | Live — recommended single source of truth |
| `financial_records` | CQRS read model (denormalized projection) | Live — auto-populated by triggers from journal_lines |
| `journal_entries` + `journal_entry_lines` | Superseded by gl_accounts migration | Deprecated — do not write new code against these |
| `chart_of_accounts` | Replaced by `gl_accounts` | Deprecated |

**Recommended two-tier architecture (NetSuite/Tally/Zoho Books pattern):**

```
Tier 1 — Operational layer (document tables)
  invoices, expenses, bank_transactions, payroll_records, reimbursement_requests
        │
        │  DB triggers (auto-post on status change)
        ▼
Tier 2 — Accounting layer (canonical GL)
  gl_accounts + journal_lines   ◄── single source of truth for all reports
        │
        │  DB triggers (auto-project)
        ▼
  financial_records              ◄── CQRS read model for fast dashboard queries
```

**Outstanding gap:** Triggers between Tier 1 → Tier 2 are partially implemented.
Full automation (every invoice/payment/payroll event auto-posting a balanced journal
entry) is the highest-value accounting integrity work remaining.

---

## 5. Module Inventory

| Module | URL prefix | Subscription key | Status |
|---|---|---|---|
| Financial (Invoicing, Banking, Cash Flow, Analytics) | `/financial` | `FINANCIAL` | Live |
| Connectors (MS365, Shopify, Zoho) | `/connectors` | `FINANCIAL` | Live (partial) |
| HRMS (Employees, Attendance, Leaves, OrgChart) | `/hrms` | `HRMS` | Live |
| Payroll (Legacy + Engine paths) | `/hrms` | `HRMS` | Live |
| Performance (Goals, Reviews) | `/performance` | `PERFORMANCE` | Live |
| Inventory | `/inventory` | `INVENTORY` | Live |
| Manufacturing | `/manufacturing` | `MANUFACTURING` | Live |
| Procurement | `/procurement` | `PROCUREMENT` | Live |
| Sales | `/sales` | `SALES` | Live |
| Warehouse | `/warehouse` | `WAREHOUSE` | Live |

### Payroll — Two paths

| Path | Tables | Use case |
|---|---|---|
| Legacy | `payroll_records` (flat columns) | Bulk CSV upload, existing payslips |
| Engine | `payroll_runs` + `payroll_entries` (JSON breakdowns) | Full approval workflow (draft → HR review → finance → lock) |

Both paths normalize to `NormalizedPayslip` via `normalizePayslip()` in `src/lib/payslip-utils.ts`.

### Edge Functions (35 total)

Key functions:
- `ai-agent` — Live, Admin+Finance access, read+write DB. **Needs rate limiting.**
- `workflow-engine` — 15-minute cron, processes scheduled workflows
- `generate-payslip` / `generate-invoice-pdf` — PDF rendering
- `ms365-auth` — **Broken for multi-tenant** (hardcoded `DEFAULT_ORG_ID`)
- `shopify-webhook` / `whatsapp-webhook` — **No HMAC signature verification**
- `financial-engine`, `integrity-audit`, `ai-audit-engine` — Accounting automation

---

## 6. Security Architecture

### RLS (Row Level Security)
- ~1,106 policies across ~153 tables (as of 2026-04)
- Granularity: **role-family** (admin/HR/finance/payroll/employee), not matrix-grained per resource
- SuperAdmin bypasses all RLS — checked via `is_super_admin()` DB function
- Payroll lock enforced at DB level: RESTRICTIVE RLS + BEFORE triggers on `payroll_records` and `payroll_runs` (migration `20260428110000`)

### Authentication layers

```
1. Supabase Auth      — session token, email/OAuth
2. SubscriptionGuard  — subscription active? org onboarded? module enabled?
3. PermissionGate     — RBAC matrix (resource × action) from role_permissions table
4. AdminRoute         — super_admin role check for /admin/* pages
5. RLS policies       — database-level tenant isolation
6. BEFORE triggers    — immutability enforcement (locked records)
```

### DevMode / developer tools
- `DEV_MODE` and `ALLOW_PERMISSION_EDITING` are hard-coded off in production.
- Vite sets `MODE=production` for all `npm run build` output.
- No env var (`VITE_DEV_MODE=true`) can re-enable in production builds.

### Known security gaps (open)
| Gap | Risk | Status |
|---|---|---|
| `ai-agent` — no rate limiting | Prompt injection or abuse could exhaust LLM budget | **Open** — add per-org request quota in Edge Function |
| Seed data — no production guard (partially fixed) | `seed.sql` could be run against live instance | Mitigated — org-name guard added 2026-04-28; other seed files unguarded |
| `ms365-auth` hardcodes `DEFAULT_ORG_ID` | All MS365 tokens written to org `000...001` — broken for any second tenant | **Fixed 2026-04-28** — resolves org from `organization_settings.sso_domain` via email domain lookup |
| `shopify-webhook` / `whatsapp-webhook` — no HMAC verification | Unauthenticated callers can inject fake events | **Not a gap** — HMAC verification already implemented in both functions |

---

## 7. FMEA — Failure Mode & Effects Analysis

Scoring: **S** = Severity (1–10), **O** = Occurrence likelihood (1–10), **D** = Detectability (1=easy to detect, 10=silent), **RPN** = S×O×D.

| # | Failure Mode | Component | S | O | D | RPN | Status |
|---|---|---|---|---|---|---|---|
| 1 | Cross-tenant data leak via missing org_id filter | Any query hook | 10 | 4 | 7 | 280 | Ongoing — fixed in PR #197 for Attendance, OrgChart, Memos |
| 2 | Wrong employee gets payslip data (fuzzy name match) | useBulkUpload | 9 | 3 | 8 | 216 | Fixed — exact full_name match only |
| 3 | Payroll re-upload silently overwrites locked period | BulkUploadDialog | 8 | 5 | 9 | 360 | Fixed — destructive warning added 2026-04-28 |
| 4 | Locked payroll record modified via direct DB call | payroll_records RLS | 8 | 3 | 8 | 192 | Fixed — BEFORE triggers + RESTRICTIVE RLS (migration 20260428110000) |
| 5 | IGST wrongly applied due to startsWith state match | Invoicing.tsx | 7 | 4 | 7 | 196 | Fixed — normalized exact match (PR #197) |
| 6 | Rollback deletes wrong financial_records row | ReimbursementsFinance | 8 | 3 | 8 | 192 | Fixed — rollback by captured ID (PR #197) |
| 7 | Module access bypassed (subscription not enforced) | SubscriptionGuard | 7 | 6 | 6 | 252 | Fixed — MODULE_PATH_MAP enforcement added 2026-04-28 |
| 8 | DevMode enabled in production via env var | systemFlags.ts | 9 | 2 | 5 | 90 | Fixed — hard-coded off in production build |
| 9 | MS365 tokens always written to org 000…001 | ms365-auth Edge Fn | 9 | 8 | 3 | 216 | Fixed 2026-04-28 — org resolved from email domain via organization_settings |
| 10 | Webhook events injected without HMAC check | shopify/whatsapp webhooks | 7 | 5 | 6 | 210 | Not a gap — HMAC verification already present in both functions |
| 11 | ai-agent has no rate limit — budget exhaustion / prompt injection | ai-agent Edge Fn | 7 | 4 | 7 | 196 | **Open** |
| 12 | GL double-entry not auto-posted from operational events | financial-engine | 8 | 7 | 4 | 224 | **Open** — triggers partially wired |
| 13 | financial_records diverges from gl_accounts (stale CQRS) | DB triggers | 7 | 5 | 7 | 245 | **Open** — trigger coverage incomplete |
| 14 | Memo recipient search broken (profiles_safe missing org_id) | useMemos.ts | 8 | 10 | 3 | 240 | Fixed — switched to profiles table (PR #197) |
| 15 | Flash-of-denied for authorized users (PermissionGate) | PermissionGate.tsx | 4 | 9 | 5 | 180 | Fixed — loading guard for inline mode (PR #197) |
| 16 | Payroll totalRecords shows filtered count not org-wide count | usePayroll.ts | 5 | 8 | 6 | 240 | Fixed — usePayrollOrgRecordCount hook |
| 17 | PayrollEnginePanel overrides parent period on tab mount | PayrollEnginePanel | 6 | 8 | 7 | 336 | Fixed — removed onMonthChange on mount |
| 18 | 382 migrations with timestamp collisions — replay risk | supabase/migrations | 6 | 3 | 6 | 108 | Partially fixed 2026-04-28 — 3 collision pairs renamed; full squash requires live DB dump (playbook in supabase/README.md) |
| 19 | seed.sql runnable against production instance | supabase/seed.sql | 9 | 2 | 5 | 90 | Mitigated — org-name guard added 2026-04-28 |
| 20 | SuperAdmin cannot write role_permissions (SELECT-only RLS) | role_permissions | 7 | 10 | 4 | 280 | Fixed — FOR ALL policy (migration 20260428100000) |
| 21 | Payroll engine fallback reads legacy records + re-inserts payroll_entries on every run — causes duplicate entries and query timeouts | usePayrollEngine.ts ~line 208 | 8 | 10 | 6 | 480 | **Open** — root cause of payroll hangs; fix in Section 12 Phase 1 |
| 22 | html2pdf.js renders payslip black-on-black in dark mode; browser-dependent fonts cause layout breaks | src/lib/pdf-export.ts | 6 | 8 | 5 | 240 | **Open** — migrate to server-side Edge Function only (Section 15) |
| 23 | No job queue — long-running payroll runs / bulk uploads lost if browser tab closes | useBulkUpload.ts, usePayrollEngine.ts | 7 | 7 | 6 | 294 | **Open** — job_queue table design in Section 14 |
| 24 | Salary file (NEFT batch) with PII + bank account data has no download access restriction | generate-salary-file (not yet built) | 9 | 5 | 7 | 315 | **Open** — enforce admin/finance-only RLS + signed URL expiry in Section 13.5 |
| 25 | RBAC frontend matrix denials not enforced at RLS level — direct Supabase API call bypasses permission gate | src/lib/permissions.ts vs RLS policies | 8 | 6 | 7 | 336 | **Open** — requires RLS policy audit per resource (Section 11 gap) |
| 26 | No `payroll_events` log — salary changes, CTC revisions, and dispute resolutions leave no immutable audit trail | payroll_records / payroll_entries | 7 | 8 | 7 | 392 | **Open** — design in Section 16 |

---

## 8. Implementation Roadmap

### P0 — Fix now (before any new customer onboarding)

| Item | FMEA # | Why urgent | Status |
|---|---|---|---|
| Fix payroll engine fallback — stop duplicate `payroll_entries` inserts | 21 | Root cause of payroll hangs | **Open** |
| `ai-agent` rate limiting (per-org quota) | 11 | Uncapped LLM spend + prompt injection | **Open** |
| GL double-entry auto-posting triggers (Tier 1 → Tier 2) | 12/13 | Financial reports diverge from source data | **Open** |
| RBAC frontend denials enforced at RLS level | 25 | Direct API calls bypass permission gates | **Open** |

### P1 — Next sprint

| Item | FMEA # | Why |
|---|---|---|
| Job queue table + Realtime progress UI (Section 14) | 23 | Payroll runs / bulk uploads lost on tab close; no visibility |
| Payroll event log table — `payroll_events` (Section 16) | 26 | No immutable audit trail for salary changes or disputes |
| Stop new writes to `payroll_records` — Phase 1 of Section 12 | 21 | Eliminate dual-path write conflict |
| Migrate html2pdf.js → server-side Edge Function (Section 15) | 22 | Dark mode renders broken; no server-side storage |
| Squash 382 migrations → single baseline | 18 | Slow env setup, timestamp collision risk |
| Extend `emergency_unlock_record` audit trail to email alert | — | Admin unlocks are currently silent |

### P2 — Next quarter

| Item | FMEA # | Why |
|---|---|---|
| Statutory integrations: EPFO ECR, Form 24Q, PT challan, bank salary file (Section 13) | 24 | Required for compliance; users doing this manually today |
| Backfill `payroll_records` → `payroll_entries` — Phase 2 of Section 12 | 21 | Enables legacy table removal |
| RLS granularity: move from role-family to permission-matrix | — | `role_permissions` table exists but RLS doesn't use it |
| Consolidate deprecated GL tables (`journal_entries`, `chart_of_accounts`) | — | Dead code still queried in some hooks |
| Add observability: structured Edge Function logs to a log sink | — | Zero visibility into production failures today |
| Restrict salary file download to admin/finance + signed URLs (Section 13.5) | 24 | PII + bank account data exposure risk |

### P3 — Strategic (6–12 months)

| Item | Why |
|---|---|
| ESI return generation | Statutory compliance for eligible employees |
| Drop `payroll_records` table — Phase 3 of Section 12 | Eliminate legacy path entirely |
| US compliance module: 1099, W-2, federal/state payroll tax | Required for US market |
| Multi-currency: FX rate table + realized/unrealized gain/loss journals | Required for US + international |
| E2E test coverage (Playwright) across all modules | Current coverage: unit tests only |
| SOC 2 Type I controls documentation | Required for US enterprise sales |

---

## 9. Technical Debt Register

| # | Debt | Location | Impact | Fix effort | Priority |
|---|---|---|---|---|---|
| 1 | 382 migrations, some with timestamp collisions | `supabase/migrations/` | Slow env setup, replay risk | High — requires `supabase db dump` on live | P1 |
| 2 | Both payroll paths (`payroll_records` + `payroll_entries`) actively written | `usePayroll.ts`, `useBulkUpload.ts`, `usePayrollEngine.ts` | Duplicate entries cause query timeouts; payroll hangs | Medium — see Section 12 Phase 1 | P0 |
| 3 | `useBulkUpload.ts` is 1,556 lines — god hook for all modules | `src/hooks/useBulkUpload.ts` | Any change risks regression in unrelated modules | High — decompose into per-module upload hooks | P2 |
| 4 | `journal_entries` + `journal_entry_lines` not formally removed | Multiple hooks | Confusion about canonical GL; dead queries | Medium | P2 |
| 5 | `chart_of_accounts` not formally removed | Multiple hooks | Dead code in dashboard queries | Low | P2 |
| 6 | RBAC matrix in `role_permissions` not used by RLS policies | `supabase/migrations/20260417*` | Direct API calls bypass frontend permission gates | High — requires RLS policy audit per resource | P1 |
| 7 | `html2pdf.js` client-side PDF generation | `src/lib/pdf-export.ts` | Dark mode broken, no server-side storage | Medium — remove; route all PDFs through Edge Functions | P1 |
| 8 | No job queue — operations lost on browser tab close | `useBulkUpload.ts`, `usePayrollEngine.ts` | No recovery path for partial payroll runs | Medium — `job_queue` table (Section 14) | P1 |
| 9 | No `payroll_events` audit log | `payroll_records`, `payroll_entries` | Cannot reconstruct salary history for disputes | Medium — append-only table (Section 16) | P1 |
| 10 | No statutory integrations (PF ECR, 24Q TDS, PT, bank file) | `supabase/functions/` | Users doing statutory filing manually | High — 5 Edge Functions needed (Section 13) | P2 |
| 11 | No observability / error tracking on Edge Functions | All 35 Edge Functions | Silent production failures | Medium — structured log sink (e.g. Logflare) | P2 |
| 12 | `ai-agent` no rate limiting | `supabase/functions/ai-agent/` | Uncapped LLM spend + prompt injection | Low effort — per-org quota guard | P0 |
| 13 | `ms365-auth` multi-tenant fix | `supabase/functions/ms365-auth/index.ts` | Fixed 2026-04-28 | ✅ Done | — |
| 14 | Bulk upload error rollback threshold (50%) is arbitrary | `useBulkUpload.ts` | May roll back partial success unnecessarily | Low | P2 |
| 15 | `useIsDevModeWithoutAuth` bypasses auth | Multiple hooks | Data exposure if build flag regresses | Low (guarded by build flag) | — |
| 16 | No ERD / schema diagram | Repo root | New developers cannot reason about data model | Low — generate from Supabase schema | P2 |

---

## 10. Key File Map

| What | Where |
|---|---|
| Subscription + module guard | `src/components/auth/SubscriptionGuard.tsx` |
| RBAC permission gate | `src/components/auth/PermissionGate.tsx` |
| Permission matrix hook | `src/hooks/useRolePermissions.ts` |
| Payslip normalization (both paths) | `src/lib/payslip-utils.ts` |
| Payslip field registry + invariants | `CLAUDE.md` |
| Bulk upload (payroll + other modules) | `src/hooks/useBulkUpload.ts` |
| Financial data hooks | `src/hooks/useBanking.ts`, `src/hooks/useFinancial.ts` |
| System flags (DevMode, etc.) | `src/config/systemFlags.ts` |
| Payroll lock migration | `supabase/migrations/20260428110000_enforce_payroll_lock_at_db.sql` |
| SuperAdmin RLS fix | `supabase/migrations/20260428100000_fix_rbac_superadmin_write.sql` |
| Seed production guard | `supabase/seed.sql` (top of file) |

---

## 11. RBAC Permissions Matrix

`admin` and `super_admin` always have full access — they are not configurable.
The five configurable roles below map to the `role_permissions` table (per-org overrides)
with fallback to `DEFAULT_PERMISSIONS` in `src/lib/permissions.ts`.

**Legend:** ✅ = allowed by default | ❌ = denied by default | 🔧 = admin can override

| Resource | Action | `hr` | `manager` | `finance` | `payroll` | `employee` |
|---|---|---|---|---|---|---|
| **dashboard** | view | ✅ | ✅ | ✅ | ✅ | ✅ |
| **financial** | view | ❌ | ❌ | ✅ | ❌ | ❌ |
| **financial** | create | ❌ | ❌ | ✅ | ❌ | ❌ |
| **financial** | edit | ❌ | ❌ | ✅ | ❌ | ❌ |
| **financial** | delete | ❌ | ❌ | ✅ | ❌ | ❌ |
| **financial** | export | ❌ | ❌ | ✅ | ❌ | ❌ |
| **hrms_employees** | view | ✅ | ✅ | ❌ | ❌ | ❌ |
| **hrms_employees** | create | ✅ | ❌ | ❌ | ❌ | ❌ |
| **hrms_employees** | edit | ✅ | ❌ | ❌ | ❌ | ❌ |
| **hrms_employees** | delete | ✅ | ❌ | ❌ | ❌ | ❌ |
| **hrms_employees** | export | ✅ | ❌ | ❌ | ❌ | ❌ |
| **hrms_payroll** | view | ✅ | ❌ | ✅ | ✅ | ❌ |
| **hrms_payroll** | create | ✅ | ❌ | ❌ | 🔧 | ❌ |
| **hrms_payroll** | edit | ✅ | ❌ | ❌ | 🔧 | ❌ |
| **hrms_payroll** | delete | ❌ | ❌ | ❌ | ❌ | ❌ |
| **hrms_payroll** | export | ✅ | ❌ | ✅ | ✅ | ❌ |
| **hrms_payroll_approve** | edit | ❌ | ❌ | ✅ | ❌ | ❌ |
| **hrms_attendance** | view | ✅ | ✅ | ❌ | ❌ | ❌ |
| **hrms_attendance** | create | ✅ | ✅ | ❌ | ❌ | ❌ |
| **hrms_attendance** | edit | ✅ | ✅ | ❌ | ❌ | ❌ |
| **hrms_attendance** | export | ✅ | ❌ | ❌ | ❌ | ❌ |
| **hrms_leaves** | view | ✅ | ✅ | ❌ | ❌ | ✅ (own only) |
| **hrms_leaves** | create | ✅ | ✅ | ❌ | ❌ | ✅ (own only) |
| **hrms_leaves** | edit | ✅ | ✅ (approve) | ❌ | ❌ | ❌ |
| **hrms_reimbursements** | view | ✅ | ✅ | ✅ | ❌ | ✅ (own only) |
| **hrms_reimbursements** | create | ❌ | ❌ | ❌ | ❌ | ✅ |
| **hrms_reimbursements** | edit | ✅ | ✅ (approve) | ✅ (pay) | ❌ | ❌ |
| **goals** | view | ✅ | ✅ | ❌ | ❌ | ✅ (own only) |
| **goals** | create | ✅ | ✅ | ❌ | ❌ | ✅ |
| **goals** | edit | ✅ | ✅ | ❌ | ❌ | ✅ (own only) |
| **goals** | delete | ✅ | ❌ | ❌ | ❌ | ❌ |
| **performance_reviews** | view | ✅ | ✅ | ❌ | ❌ | ✅ (own only) |
| **performance_reviews** | create | ✅ | ✅ | ❌ | ❌ | ❌ |
| **inventory** | view | ❌ | ❌ | ✅ | ❌ | ❌ |
| **inventory** | create | ❌ | ❌ | ✅ | ❌ | ❌ |
| **inventory** | edit | ❌ | ❌ | ✅ | ❌ | ❌ |
| **procurement** | view | ❌ | ❌ | ✅ | ❌ | ❌ |
| **procurement** | create | ❌ | ❌ | ✅ | ❌ | ❌ |
| **sales** | view | ❌ | ❌ | ✅ | ❌ | ❌ |
| **sales** | create | ❌ | ❌ | ✅ | ❌ | ❌ |
| **audit_logs** | view | ❌ | ❌ | ❌ | ❌ | ❌ |
| **settings** | view | ❌ | ❌ | ❌ | ❌ | ❌ |
| **settings** | edit | ❌ | ❌ | ❌ | ❌ | ❌ |
| **connectors** | view | ❌ | ❌ | ✅ | ❌ | ❌ |
| **connectors** | edit | ❌ | ❌ | ✅ | ❌ | ❌ |

### RLS vs Frontend Matrix Consistency Rule

**Both layers must be updated together when adding a new resource.**

| Layer | Enforcement | Location |
|---|---|---|
| Frontend (UI) | `PermissionGate` / role route wrappers | `src/lib/permissions.ts` → `DEFAULT_PERMISSIONS` |
| Database (API) | RLS policies (role-family granularity) | `supabase/migrations/` |
| Override store | `role_permissions` table (per-org, per-role) | Written via Settings page |

**Gap to close:** RLS policies enforce at role-family level (e.g. `hr` can read `payroll_records`),
but the frontend matrix allows finer-grained denial (e.g. `payroll` role can view but not create).
A direct Supabase API call bypasses the frontend matrix and hits only RLS. Every resource
that is denied at the frontend level must also be explicitly denied by RLS to be genuinely secure.
Tracked in Technical Debt Register item #6.

---

## 12. Payroll Architecture — Dual-Path Diagnosis & Migration Plan

### Current State (confirmed by codebase audit, 2026-04-28)

Both paths are **actively written to** today. This is not a legacy-read / engine-write split —
it is two parallel write paths with overlapping data.

| Write source | Writes to | Hook |
|---|---|---|
| Manual entry UI (Payroll.tsx) | `payroll_records` (legacy) | `useCreatePayroll()` |
| Bulk CSV upload | `payroll_records` (legacy) | `useBulkUpload()` |
| Engine run (approval flow) | `payroll_runs` + `payroll_entries` | `usePayrollEngine()` |
| Engine fallback (no compensation) | Reads `payroll_records` → writes `payroll_entries` | `usePayrollEngine()` line ~208 |

**Root cause of payroll hangs:** The engine fallback (line ~158 of `usePayrollEngine.ts`) triggers
when `eligibleStructures.length === 0` for the **entire organisation** — i.e. no active compensation
structures exist at all. When that condition is true, the fallback reads all active `payroll_records`
for the period and inserts them into `payroll_entries`. It contains no deduplication check, so
re-running payroll for the same period attempts duplicate INSERTs into `payroll_entries`, which
bloats queries and causes timeouts. The separate per-employee edge case (some employees have
structures, others do not) is handled by the engine silently skipping employees with no structure —
those employees receive no payroll entry and no warning (tracked in P0 todo item 4).

### Target State

One write path only: **engine path** (`payroll_runs` + `payroll_entries`).
`payroll_records` becomes a read-only archive, then is dropped.

```
Manual entry UI  ──►  usePayrollEngine.createDraftRun()  ──►  payroll_runs + payroll_entries
Bulk CSV upload  ──►  usePayrollEngine.importFromCSV()   ──►  payroll_runs + payroll_entries
                                                                      │
                                                         normalizePayslip() (unchanged)
                                                                      │
                                                              PaySlipDialog, exports
```

### Migration Plan

**Phase 1 — Stop new writes to `payroll_records` (1 sprint)**
- Change `useCreatePayroll()` to write a single-entry engine run to `payroll_runs` + `payroll_entries` instead of `payroll_records`.
- Change `useBulkUpload()` payroll path to call the engine import function.
- Remove the engine fallback that reads `payroll_records` and re-inserts to `payroll_entries`. Replace with a hard error: "No compensation structure found for employee X — set up CTC first."
- Key files: `src/hooks/usePayroll.ts` (remove create/update mutations), `src/hooks/useBulkUpload.ts` (payroll branch), `src/hooks/usePayrollEngine.ts` (remove fallback block ~lines 159–227).

**Phase 2 — Backfill historical `payroll_records` → `payroll_entries` (1 sprint)**
- Write a one-time Supabase Edge Function (`migrate-legacy-payroll`) that:
  1. Reads all `payroll_records` where `is_superseded = false` and no corresponding `payroll_entries` row exists for the same `(organization_id, employee_id, pay_period)`.
  2. Creates a synthetic `payroll_runs` row (status = `locked`, source = `legacy_import`).
  3. Inserts corresponding `payroll_entries` rows using `normalizePayslip()` field mapping.
  4. Sets `payroll_records.is_superseded = true` for migrated rows.
- Run per-org, idempotent (safe to re-run).

**Phase 3 — Remove legacy tables (1 sprint after Phase 2)**
- Confirm zero `is_superseded = false` rows remain in `payroll_records`.
- Drop `payroll_records` write RLS policies (keep SELECT for audit reads during transition).
- After 1 payroll cycle with no issues, drop the table entirely via migration.
- Remove `normalizeLegacyRecord()` from `payslip-utils.ts` and all legacy path branches.

### Payroll Engine Data Flow (post-migration)

```
1. HR creates payroll run  →  payroll_runs row (status: draft)
2. Engine calculates       →  payroll_entries rows (earnings_breakdown, deductions_breakdown JSON)
3. HR reviews + submits    →  payroll_runs.status = 'hr_approved'
4. Finance approves        →  payroll_runs.status = 'finance_approved'
5. Period locked           →  payroll_locks row + RESTRICTIVE RLS + BEFORE trigger (immutable)
6. Payslip generated       →  Edge Function → Supabase Storage → email
```

### Payroll Fields Canonical Mapping (engine path)

| `payroll_entries` column | Display label | Notes |
|---|---|---|
| `earnings_breakdown` JSON | Earnings lines | Array of `{label, amount}` |
| `deductions_breakdown` JSON | Deduction lines | Array of `{label, amount}` |
| `gross_earnings` | Gross Earnings | Sum of earnings_breakdown |
| `total_deductions` | Total Deductions | Sum of deductions_breakdown |
| `net_pay` | Net Pay | gross − total_deductions |
| `lwp_days` | LOP Days | Days without pay (column is `lwp_days`, not `lop_days`) |
| `working_days` | Working Days | Calendar days in period |
| `paid_days` | Paid Days | working_days − lwp_days |

---

## 13. Integration Architecture

### Indian Statutory Integrations (Required)

#### 13.1 EPFO — Provident Fund (ECR)

**What:** Electronic Challan cum Return — monthly PF remittance file uploaded to the EPFO Unified Portal.

**Format:** Fixed-width text file (`ECR_<establishment_id>_<month>_<year>.txt`)

**Architecture:**
```
payroll_entries (pf_employee + pf_employer per entry)
        │
        ▼
Edge Function: generate-epfo-ecr
  - Reads all approved payroll_entries for the period
  - Uses pf_employee (employee share) and pf_employer (employer share) columns
  - Validates UAN (employee_details.uan_number) — rejects rows with missing UAN
  - Generates ECR text in EPFO V2 format
  - Stores file in Supabase Storage: statutory/{org_id}/pf/{YYYY-MM}/ECR.txt
  - Creates job_queue row (type: statutory_export) for audit trail
        │
        ▼
UI: Download link on StatutoryFilings page
  - User downloads and uploads to EPFO portal manually
  - (Direct API integration requires EPFO partnership — out of scope for now)
```

**Validation rules:**
- UAN must be 12 digits. Missing UAN → employee flagged, ECR not generated until resolved.
- PF contribution: 12% of min(basic_salary, ₹15,000) = max ₹1,800/month.
- Employer PF: 3.67% to EPF + 8.33% to EPS (capped at ₹1,250).
- Employees with salary > ₹15,000 and voluntarily opted out: `pf_monthly = 0`.

---

#### 13.2 TDS — Form 24Q (Quarterly Salary TDS Return)

**What:** Quarterly TDS return for salary deductions filed with TRACES via NSDL FVU utility.

**Format:** `.fvu` validated text file (FVU = File Validation Utility format)

**Architecture:**
```
payroll_entries (tax_deduction per employee, per quarter)
        │
        ▼
Edge Function: generate-form-24q
  - Aggregates TDS by employee across the quarter (3 months)
  - Reads PAN (employee_details.pan_number) — mandatory
  - Generates Form 24Q Annexure II (salary detail) + Annexure I (challan)
  - Stores in Supabase Storage: statutory/{org_id}/tds/{YYYY-QN}/24Q_draft.txt
        │
        ▼
UI: StatutoryFilings page — "Generate 24Q" button, download + FVU upload instructions
```

**Validation rules:**
- PAN mandatory for every employee with TDS deducted. Missing PAN → block generation.
- Quarterly deadlines: Q1 (Jul 31), Q2 (Oct 31), Q3 (Jan 31), Q4 (May 31).
- Challan BSR code + date required (admin enters after bank payment).

---

#### 13.3 Professional Tax (PT Challan)

**What:** State-level Professional Tax — Karnataka slab (>₹15k/month → ₹200, >₹10k → ₹150).

**Architecture:**
- PT is already calculated in `payslip-utils.ts` (Karnataka slab).
- Missing piece: generate a PT challan summary file for GRAS (Government Receipt Accounting System) upload.
- Edge Function: `generate-pt-challan` — aggregates PT deducted per period, outputs challan CSV.
- Stores in Supabase Storage: `statutory/{org_id}/pt/{YYYY-MM}/PT_challan.csv`.

---

#### 13.4 ESI — Employees' State Insurance

**What:** Monthly ESI return for employees earning ≤ ₹21,000/month.

**Contributions:** Employer 3.25% + Employee 0.75% of gross wages.

**Architecture:**
- Needs ESI registration number per employee (`employee_details` — field to be added: `esi_number`).
- Edge Function: `generate-esi-return` — reads gross from `payroll_entries`, applies eligibility filter, generates ESIC portal-compatible CSV.

---

#### 13.5 Banking — Salary Disbursement File

**What:** Batch NEFT/RTGS file for uploading to bank's corporate net banking portal.

**Architecture:**
```
payroll_entries (net_pay per employee, after approval)
        │
        ▼
Edge Function: generate-salary-file
  - Only runs on payroll_runs with status = 'finance_approved'
  - Reads bank_account_number + bank_ifsc from employee_details
  - Validates IFSC (11 chars, regex ^[A-Z]{4}0[A-Z0-9]{6}$)
  - Generates bank-specific salary file format (configurable per org)
  - Stores in Supabase Storage: disbursements/{org_id}/{YYYY-MM}/salary_file.{ext}
```

**Bank format support matrix (implement in priority order):**

| Bank | File format | Notes |
|---|---|---|
| HDFC | CSV (specific column order) | Most common among Indian SMBs |
| ICICI | Tab-delimited TXT | |
| SBI | SFTP upload (CINB format) | |
| Axis | CSV | |
| Generic NEFT | RBI NEFT batch XML | Fallback for any bank |

**Security note:** Salary files contain PII + bank account data. Must be stored with restricted RLS:
only `admin` and `finance` roles can download. Signed URLs with 15-minute expiry only.

---

### External Integration Summary

| Integration | Direction | Method | Status |
|---|---|---|---|
| MS365 (Outlook/Teams) | Outbound (email, calendar) | OAuth + Graph API | Live (fixed 2026-04-28) |
| Shopify | Inbound (orders, inventory) | Webhook (HMAC verified) | Live |
| Zoho CRM | Bidirectional (customers, contacts) | REST API sync | Live |
| WhatsApp Business | Inbound/Outbound (notifications) | Webhook + Cloud API | Live |
| EPFO ECR | Outbound (PF file) | Manual download + portal upload | **Required — not built** |
| TRACES 24Q | Outbound (TDS file) | Manual download + FVU upload | **Required — not built** |
| GRAS PT Challan | Outbound (PT file) | Manual download + portal | **Required — not built** |
| Bank Salary File | Outbound (NEFT batch) | Manual download + net banking | **Required — not built** |
| ESI Portal | Outbound (ESI return) | Manual download + portal | **Required — not built** |

---

## 14. Job Queue Architecture

### Problem

Long-running operations (payroll engine runs, bulk CSV uploads, statutory file generation, PDF batch
generation) currently run synchronously in the browser. If the tab closes or the network drops,
the operation is lost. There is no progress visibility, no retry, and no audit trail of job outcomes.

### Design

**Stack:** PostgreSQL `job_queue` table + Supabase pg_cron + Edge Function workers + Supabase Realtime.
No external queue service needed at current scale (≤500 employees).

```sql
-- Migration: add_job_queue_table
CREATE TABLE job_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  job_type        TEXT NOT NULL,       -- see Job Types below
  status          TEXT NOT NULL DEFAULT 'pending',
                                       -- pending | processing | completed | failed | cancelled
  progress        INTEGER DEFAULT 0,   -- 0–100
  progress_label  TEXT,                -- "Processing 12 / 50 employees…"
  payload         JSONB NOT NULL DEFAULT '{}',
  result          JSONB,               -- output data (file URL, record counts, etc.)
  error_message   TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  retry_count     INTEGER DEFAULT 0,
  max_retries     INTEGER DEFAULT 3
);

-- RLS: org members can see own org's jobs; only system (service_role) can update
ALTER TABLE job_queue ENABLE ROW LEVEL SECURITY;
```

**Job Types:**

| `job_type` | Trigger | Worker Edge Function |
|---|---|---|
| `payroll_run` | HR clicks "Run Payroll" | `workflow-engine` |
| `bulk_upload_payroll` | CSV upload submit | `process-bulk-upload` |
| `bulk_upload_attendance` | CSV upload submit | `process-bulk-upload` |
| `generate_payslip_batch` | "Generate All Payslips" | `generate-payslip` |
| `statutory_export_ecr` | "Generate ECR" button | `generate-epfo-ecr` |
| `statutory_export_24q` | "Generate 24Q" button | `generate-form-24q` |
| `salary_file_export` | "Generate Salary File" | `generate-salary-file` |
| `data_export` | "Export" button | `process-data-export` |

**Worker pattern (Edge Function):**

```typescript
// In each worker Edge Function:
// 1. Claim job (atomic update to 'processing')
const { data: job } = await supabase
  .from('job_queue')
  .update({ status: 'processing', started_at: new Date().toISOString() })
  .eq('id', jobId).eq('status', 'pending')  // optimistic lock
  .select().single();

if (!job) return; // another worker claimed it

// 2. Process in chunks, updating progress
for (let i = 0; i < employees.length; i++) {
  await processEmployee(employees[i]);
  await supabase.from('job_queue').update({
    progress: Math.round(((i + 1) / employees.length) * 100),
    progress_label: `Processing ${i + 1} / ${employees.length} employees…`
  }).eq('id', job.id);
}

// 3. Complete
await supabase.from('job_queue').update({
  status: 'completed', progress: 100, completed_at: new Date().toISOString(),
  result: { processed: employees.length, file_url: uploadedUrl }
}).eq('id', job.id);
```

**Frontend progress via Supabase Realtime:**

```typescript
// In useJobQueue hook:
const channel = supabase.channel(`job-${jobId}`)
  .on('postgres_changes', {
    event: 'UPDATE', schema: 'public', table: 'job_queue',
    filter: `id=eq.${jobId}`
  }, ({ new: job }) => {
    setProgress(job.progress);
    setLabel(job.progress_label);
    if (job.status === 'completed') onComplete(job.result);
    if (job.status === 'failed') onError(job.error_message);
  })
  .subscribe();
```

**UI pattern (BulkUploadDialog, PayrollEnginePanel, StatutoryFilings):**
- Submit → POST job → get `job_id` back immediately.
- Show progress bar + label polling from Realtime channel.
- On `completed`: show download link or success toast.
- On `failed`: show error with retry button (increments `retry_count`, re-queues).
- Breadcrumb in header notification bell: "3 jobs running" badge.

**Retry policy:**
- Worker catches exceptions → sets `status = 'failed'`, increments `retry_count`.
- pg_cron re-queues `failed` jobs where `retry_count < max_retries` every 5 minutes.
- After `max_retries` exceeded: status stays `failed`, alert sent to org admin via `send-notification-email`.

---

## 15. PDF Architecture — Server-Side Canonical Path

### Current State (problem)

Two PDF generation paths coexist:

| Path | Used for | Technology | Problems |
|---|---|---|---|
| Client-side | Payslip "Print/Download" button | `html2pdf.js` (browser) | Dark mode renders black-on-black, depends on browser fonts, can't store server-side, no audit trail |
| Server-side | Some payslips, invoices, quotes | Edge Functions (`generate-payslip`, `generate-invoice-pdf`, `generate-quote-pdf`) | Correct approach |

### Target State

**Eliminate `html2pdf.js` entirely.** All PDF generation goes through Edge Functions.

```
User clicks "Download Payslip"
        │
        ▼
POST /functions/v1/generate-payslip  {entry_id, org_id}
        │
        ├── Render HTML template (Deno — no browser dependency)
        ├── Use puppeteer-core or @html-pdf-node (headless Chromium in Deno)
        ├── Store PDF in Supabase Storage:
        │     pdfs/{org_id}/payslips/{YYYY-MM}/{employee_id}.pdf
        ├── Update payroll_entries.payslip_url with signed URL
        └── Return signed URL (15-min expiry) to client
                │
                ▼
        Browser opens signed URL → downloads PDF
```

### Storage Structure (Supabase Storage)

```
bucket: erp-documents  (private, RLS-enforced)
├── pdfs/
│   ├── {org_id}/payslips/{YYYY-MM}/{employee_id}.pdf
│   ├── {org_id}/invoices/{invoice_number}.pdf
│   └── {org_id}/quotes/{quote_number}.pdf
├── statutory/
│   ├── {org_id}/pf/{YYYY-MM}/ECR.txt
│   ├── {org_id}/tds/{YYYY-QN}/24Q_draft.txt
│   └── {org_id}/pt/{YYYY-MM}/PT_challan.csv
└── disbursements/
    └── {org_id}/{YYYY-MM}/salary_file.csv
```

**Access control:** Only `admin` and `finance` can access `disbursements/`. All other PDFs
accessible to the employee who owns them + admin + hr. Signed URLs with 15-minute expiry
are the only download mechanism — no public bucket access.

### Payslip Email Delivery

```
generate-payslip Edge Function
        │
        ├── Generate PDF → store in Storage
        └── Call send-notification-email Edge Function:
              to: employee.email
              subject: "Your payslip for {month} is ready"
              body: "Please find your payslip attached / download link (expires 24h)"
              attachment_url: signed URL (24h for email delivery)
```

### Migration from html2pdf.js

1. Remove `html2pdf.js` import from `src/lib/pdf-export.ts` and all components that call it.
2. Replace all `generatePDF()` / `exportToPdf()` calls with `useJobQueue().enqueue('generate_payslip_batch', { entry_ids })`.
3. Show progress bar (job queue) instead of browser print dialog.
4. The `generate-payslip` Edge Function already exists — verify it handles all payslip field registry items from `CLAUDE.md`.

---

## 16. Financial Event Sourcing — Payroll & Salary Audit Trail

### Why Generic `audit_logs` Is Not Enough

The existing `audit_logs` table captures field-level mutations (who changed `basic_salary`
from X to Y). This is necessary but not sufficient for payroll compliance:

- It does not record **business reason** (e.g. "CTC revision effective April 2026").
- It does not link the change to the **approver** and the **approval timestamp**.
- It does not capture the **before/after normalized payslip** as a point-in-time snapshot.
- It cannot reconstruct "what would the payslip have looked like on date D" for a dispute.

### Payroll Event Log Table

```sql
CREATE TABLE payroll_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  event_type      TEXT NOT NULL,
  -- 'salary_created' | 'salary_revised' | 'payroll_run_started' | 'payroll_run_approved'
  -- 'payroll_run_locked' | 'payroll_run_unlocked' | 'payslip_disputed' | 'dispute_resolved'
  -- 'bulk_upload_applied' | 'lop_adjusted' | 'statutory_deduction_changed'
  employee_id     UUID REFERENCES profiles(id),
  payroll_run_id  UUID REFERENCES payroll_runs(id),
  entry_id        UUID REFERENCES payroll_entries(id),
  actor_id        UUID NOT NULL REFERENCES auth.users(id),
  actor_role      TEXT NOT NULL,
  before_state    JSONB,   -- NormalizedPayslip snapshot before change
  after_state     JSONB,   -- NormalizedPayslip snapshot after change
  reason          TEXT,    -- free text: "CTC revision per offer letter dated 2026-03-01"
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Immutable: no UPDATE or DELETE
CREATE POLICY payroll_events_insert ON payroll_events FOR INSERT
  WITH CHECK (organization_id = auth.user_org_id());

CREATE POLICY payroll_events_select ON payroll_events FOR SELECT
  USING (organization_id = auth.user_org_id()
    AND (auth.user_role() IN ('admin','hr','finance','payroll') OR is_super_admin()));

-- No UPDATE policy. No DELETE policy. Append-only by design.
```

### Events to Capture

| Event | When | Actor |
|---|---|---|
| `salary_created` | New compensation record created | HR / admin |
| `salary_revised` | CTC component changed | HR / admin |
| `payroll_run_started` | Engine run initiated | HR |
| `payroll_run_approved` | Finance approves run | Finance |
| `payroll_run_locked` | Period locked | System / admin |
| `payroll_run_unlocked` | Emergency unlock | Admin (high risk) |
| `lop_adjusted` | LOP days manually corrected | HR |
| `bulk_upload_applied` | CSV upload replaces salary data | HR |
| `payslip_disputed` | Employee raises dispute | Employee |
| `dispute_resolved` | HR closes dispute with/without correction | HR |

### Dispute Flow (formal)

```
Employee opens dispute on MyPayslips page
        │
        ▼
payroll_events row: event_type = 'payslip_disputed'
  before_state = current NormalizedPayslip
  reason = employee's dispute text
        │
HR reviews → corrects payroll_entries if needed
        │
        ▼
payroll_events row: event_type = 'dispute_resolved'
  before_state = disputed payslip snapshot
  after_state  = corrected payslip snapshot (or same if no change)
  reason = HR resolution notes
```

### Audit UI

- New read-only "Payroll History" tab per employee on the Payroll page.
- Shows timeline of all `payroll_events` for the employee.
- Finance and HR can see full before/after JSON diff.
- Employee can see their own dispute history only.
