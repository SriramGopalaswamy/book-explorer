# GBC-7: Storage Bucket Exposure (Security)

**Severity:** High · **Category:** Cross-cutting — Security & Multi-tenancy · **Status:** partially-resolved
**Branch:** `claude/execute-code-prompt-txEjJ` · **Jira:** https://grx10.atlassian.net/browse/GBC-7

## Root cause

A grep over `supabase/migrations/` finds 13+ `INSERT INTO storage.buckets` statements. Three classes:

**Class P (path-tenancy, correct):**
- `bill-attachments`, `credit-card-statements` (`20260221052919`): policies use `auth.uid()::text = (storage.foldername(name))[1]` for owners + `is_admin_or_finance` for admins.
- `erp-documents` (`20260428160000`): policies use `(string_to_array(name, '/'))[1]` prefix matching for `payslips/` and `disbursements/`.
- `memo-attachments`: post-`20260222035633`, joins through `public.memos.organization_id` (reference-tenancy with org check).

**Class F (flat-authenticated, broken — same bug class as GBC-17):**
- `invoice-assets` (`20260312210000`): `bucket_id='invoice-assets' AND auth.role()='authenticated'` — any user in any tenant can read every invoice PDF/logo. **Same bug GBC-15 partially fixed (public→private) but did not finish.**

**Class U (public buckets — exposed without authentication at all):**
- `tenant-branding` (`20260224053100`): `public: true`. Org logos by URL guess.
- `email-assets` (`20260227053935`): `public: true`. Email-template assets by URL guess.

**Issue's specific examples (`employee_docs`, `payslip_exports`):** these bucket names do not exist in this codebase. The closest payslip storage is `erp-documents/payslips/...` (Class P, properly scoped). `employee-documents` exists in some places — let me check… no migration creates a bucket of that name. So the issue's examples are outdated, but the *pattern* (broad SELECT policies) is real on `invoice-assets`, `tenant-branding`, and `email-assets`.

## Council verdict (compressed)

- *Contrarian:* Public buckets for branding/email assets are intentional (CDN-style logos in marketing email). Don't break those.
- *First-Principles:* Authorization should be path-encoded, not policy-joined. Make bucket creation a template that always produces a path-tenancy policy unless the bucket is explicitly opted out as public.
- *Expansionist:* Same root pattern in `invoice-assets`. Fix the template once, regenerate migrations for all flat-authenticated buckets.
- *McKinsey:* Highest-value fix is `invoice-assets` (financial data, names, addresses, GSTINs). Branding/email buckets are lower stakes and may be deliberately public.
- *Executor:* Under directive (b), no migration changes. Ship a regression test that classifies every bucket in `supabase/migrations/` and fails if a new flat-authenticated SELECT policy is added on a non-public bucket.

**Chosen approach:** Ship `src/test/storage-bucket-policy.test.ts` that asserts (i) no migration after the cutoff date creates a flat `auth.role()='authenticated'` SELECT policy, (ii) every private bucket has at least one tenancy-scoped policy (org / uid / foldername / referenced-table). Document `invoice-assets`, `tenant-branding`, `email-assets` as `needs-input` for proper org-scoped or signed-URL hardening.

## What changed
- `src/test/storage-bucket-policy.test.ts` (new) — see `diff.patch`.

## What didn't change (needs-input)
- `invoice-assets`: still has flat-authenticated SELECT. Recommend either path-tenancy keys (`<orgId>/<resource>`) + corresponding policy, or always-signed-URL access from `useInvoices.ts`.
- `tenant-branding`: still public. Acceptable if logos are intentionally CDN-distributed; flag for product decision.
- `email-assets`: still public. Same product question.
- Issue's named buckets (`employee_docs`, `payslip_exports`) don't exist — payslip storage is correctly scoped under `erp-documents/payslips/...`.

## Risks
1. The test pins current state — `tenant-branding` and `email-assets` remain public until product confirms they should not be.
2. `invoice-assets` is real cross-tenant exposure for any authenticated user. Until a per-bucket fix lands, mitigate by ensuring `useInvoices.ts` callers always go through `createSignedUrl` rather than `getPublicUrl` (note: `src/pages/financial/InvoiceSettings.tsx:176` calls `getPublicUrl` — verify that's only for org's own logos, not customer invoice PDFs).
3. Lint/build/test could not run in this sandbox.
