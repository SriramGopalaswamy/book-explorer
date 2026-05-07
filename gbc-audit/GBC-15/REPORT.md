# GBC-15: Public Exposure of Financial Assets (invoice-assets bucket)

**Severity:** High · **Category:** Cross-cutting — Security & Multi-tenancy · **Status:** partially-resolved
**Branch:** `claude/execute-code-prompt-txEjJ` · **Jira:** https://grx10.atlassian.net/browse/GBC-15

## Root cause

`supabase/migrations/20260220063856_*.sql:83` originally created `invoice-assets` with `public: true`. That created a CDN-accessible URL pattern for every uploaded invoice — anyone with the URL (no auth) could read names, addresses, GSTINs from invoice PDFs. Confirmed.

**Already partially fixed in `main`:**
- `20260312210000_restrict_invoice_assets_bucket.sql` flips the bucket to `public: false` and adds an `auth.role()='authenticated'` SELECT policy.
- `20260325090000_security_hardening.sql` adds a belt-and-suspenders idempotent re-flip.

**Remaining defect:** the new SELECT policy is *flat-authenticated* — any user from any tenant can still read every invoice asset across all orgs. That is the GBC-7 / GBC-17 bug class, not the public-CDN one. So GBC-15's headline (`public: true`) is fixed; the deeper "Org A can read Org B's invoice PDFs while logged in" is not.

The issue's recommended fix (`createSignedUrl(path, 3600)` from `useInvoices.ts`) is partially implemented — `Bills.tsx`, `Reimbursements.tsx`, `ManagerInbox.tsx`, `Expenses.tsx` use `createSignedUrl` for `bill-attachments`. `InvoiceSettings.tsx:176` calls `getPublicUrl` for `invoice-assets`, which on a private bucket returns a non-functional URL — but doesn't actually expose data. Still, callers should be standardised to `createSignedUrl`.

## Council verdict (compressed)

- *Contrarian:* The public exposure is closed. Cross-tenant flat-auth read is GBC-7's job, not GBC-15's.
- *First-Principles:* `invoice-assets` should be path-tenanted (`<orgId>/<invoiceId>/...`); the policy then becomes a one-line org check.
- *Expansionist:* Same flat-auth pattern in three other buckets. Don't fix piecemeal — coordinate with GBC-7.
- *McKinsey:* Highest-value action is moving `getPublicUrl` calls on `invoice-assets` to `createSignedUrl`. Cheap, defence-in-depth.
- *Executor:* Under directive (b), no migration changes. Add a regression assertion (already shipped in GBC-7's `storage-bucket-policy.test.ts`) that pins `invoice-assets` as `KNOWN_FLAT_AUTHENTICATED`. Document the per-call fix.

**Chosen approach:** This issue is the public-exposure variant; closed by `20260312210000` already in `main`. The follow-on (cross-tenant flat-auth read) lives under GBC-7 and is covered by the regression test added there. No additional code on this branch.

## What changed
Nothing on this branch beyond linking GBC-15 into GBC-7's regression coverage. The shipped artifact is `src/test/storage-bucket-policy.test.ts` (added under GBC-7), which already includes `invoice-assets` in `KNOWN_FLAT_AUTHENTICATED`.

## What didn't change (needs-input)
- `src/pages/financial/InvoiceSettings.tsx:176` — calls `supabase.storage.from('invoice-assets').getPublicUrl(path)`. On a private bucket `getPublicUrl` returns a URL that fails authentication — no data leak, but the call should be replaced with `createSignedUrl(path, 3600)` for clarity and to match the `bill-attachments` pattern.
- `src/hooks/useInvoices.ts` — issue's recommended target. Audit confirms it does not call `getPublicUrl` at all today (the actual `getPublicUrl` call is in `InvoiceSettings.tsx`); flagged for the same standardisation.
- Switching `invoice-assets` to org-scoped SELECT (path-tenancy) — the proper structural fix; needs a migration + storage object backfill. Out of scope under directive (b).

## Risks
1. Until path-tenancy ships, an authenticated user in Org A can read invoice PDFs uploaded by any other org. Severity unchanged from GBC-7.
2. `getPublicUrl` returning a 401-ing URL silently breaks user flows (e.g. broken thumbnails) — easy to overlook in QA.
3. Lint/build/test could not run in this sandbox.
