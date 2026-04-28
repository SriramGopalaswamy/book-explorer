# GRX10 ERP — Architecture Reference

> **Single source of truth.** All other architecture markdown files in this repo are stale
> (they describe a non-existent Express + SQLite backend). This document supersedes them.
> Last updated: 2026-04-28 by FMEA review session.

---

## 1. Business Context

| Attribute | Value |
|---|---|
| Product | GRX10 — Indian mid-market SaaS ERP |
| Target segment | 50–500 employee companies |
| Deployment model | Multi-tenant SaaS (single Supabase project, org-scoped RLS) |
| Live status | Production — one paying customer (GRX10) |
| Next market | United States |
| Compliance scope | Indian statutory: GST (CGST/SGST/IGST), TDS, PF, PT (Karnataka slab), ESI |

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

---

## 8. Implementation Roadmap

### P0 — Live risks (fix before next customer onboarding)

| Item | Why urgent | Status |
|---|---|---|
| `ai-agent` rate limiting (per-org quota) | Uncapped LLM spend + prompt injection surface | **Open** |
| GL double-entry auto-posting triggers (Tier 1 → Tier 2) | Financial reports diverge from operational data — compliance risk | **Open** |
| MS365 `DEFAULT_ORG_ID` → resolve from user profile | Breaks all MS365 features for any org except org `000…001` | **Fixed 2026-04-28** |
| Webhook HMAC verification (Shopify + WhatsApp) | Unauthenticated event injection — data integrity risk | **Not a gap** — already implemented |

### P1 — High value, low risk (next sprint)

| Item | Why |
|---|---|
| Complete CQRS trigger coverage (operational → financial_records) | Dashboard queries return stale/missing data |
| Squash 382 migrations → single baseline | Replay time, collision risk on new environments |
| Extend `emergency_unlock_record` audit trail to Slack/email alert | Admin unlocks are silent today |
| US market: multi-currency `amount_usd` column on financial_records | Required before US onboarding |

### P2 — Architectural improvements (next quarter)

| Item | Why |
|---|---|
| RLS granularity: move from role-family to permission-matrix | `role_permissions` table exists but RLS doesn't use it — inconsistency |
| Consolidate `journal_entries` + `journal_entry_lines` into `gl_accounts` + `journal_lines` | Eliminate deprecated tables |
| Deprecate `chart_of_accounts` | Replaced by `gl_accounts` |
| Add observability: structured logging from Edge Functions to a log sink | Zero visibility into production errors today |

### P3 — Strategic (6-12 months)

| Item | Why |
|---|---|
| US compliance module: 1099, W-2, federal/state payroll tax | Required for US market |
| Multi-currency: full FX rate table + realized/unrealized gain/loss journals | Required for US + international customers |
| Automated test coverage across all modules (Vitest + Playwright) | Current coverage: payslip-utils only |
| SOC 2 Type I controls documentation | Required for US enterprise sales |

---

## 9. Technical Debt Register

| Debt | Location | Impact | Fix effort |
|---|---|---|---|
| 382 migrations, some with timestamp collisions | `supabase/migrations/` | Slow environment setup, replay risk | High — requires `supabase db dump` on live |
| `journal_entries` + `journal_entry_lines` not formally deprecated | Multiple migrations | Confusion about canonical GL | Medium |
| `chart_of_accounts` not formally deprecated | Multiple hooks | Dead code used in some dashboard queries | Low |
| `ms365-auth` multi-tenant fix | `supabase/functions/ms365-auth/index.ts` | Fixed 2026-04-28 — org resolved from email domain | ✅ Done |
| RBAC matrix in `role_permissions` not used by RLS policies | `supabase/migrations/20260417*` | Two parallel permission systems | High |
| `ai-chat` and `ai-analytics` Edge Functions still deployed | `supabase/functions/ai-chat/` | Dead surface area, security scan noise | Low |
| 50+ stale architecture markdown files (being deleted) | Root directory | Misleads developers | Low (in progress) |
| No observability / error tracking | All Edge Functions | Silent production failures | Medium |
| Bulk upload error rate rollback threshold (50%) is arbitrary | `useBulkUpload.ts` | May roll back partial success unnecessarily | Low |
| `useIsDevModeWithoutAuth` bypasses auth — mock data in prod if misconfigured | Multiple hooks | Data exposure if `VITE_DEV_MODE` logic regresses | Low (guarded by build flag) |

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
