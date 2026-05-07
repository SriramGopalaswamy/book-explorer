# GBC-17 — Resolution

## Files changed

- `src/test/memo-storage-policy.test.ts` (new) — regression suite pinning the org-scoped SELECT policy on `memo-attachments` and the upload-path convention.

## Summary of changes

The cross-tenant leak on `memo-attachments` was already remediated in `main` by migration `20260222035633` (drops the loose `Authenticated users can view memo attachments` policy and replaces it with an org-scoped one). This branch adds a Vitest regression suite that fails loudly if any of four invariants regress: the loose policy stays dropped, an org-scoped SELECT policy exists, no future migration reintroduces a flat `auth.role()='authenticated'` SELECT on the bucket, and `uploadMemoAttachment` continues to namespace objects under `${userId}/` so the folder-based policy branch keeps working. No SQL migration, no policy change, no application logic change.

## What was deferred

- **Org-prefix object keys** (the issue's literal recommendation). Deferred — high-cost storage cutover, no behaviour change versus the live policy.
- **Bucket-wide flat-authenticated audit.** `invoice-assets` (`supabase/migrations/20260312210000_restrict_invoice_assets_bucket.sql`) still uses the same `bucket_id = X AND auth.role() = 'authenticated'` SELECT pattern that GBC-17 describes. Out of scope here; flagged for GBC-7 / GBC-15. Captured in `_SUMMARY.md`.
- **Janitor for orphan storage objects** (memo row deleted but object retained). Out of scope for a security ticket; not a leak risk because orphans are unreadable to non-uploaders.

## Test results

**Could not be run in this environment.** `node_modules/` is empty and `npm install` is blocked by registry policy in this sandbox:

```
$ npm install --prefer-offline --no-audit
npm error code E403
npm error 403 403 Forbidden - GET https://registry.npmjs.org/zwitch/-/zwitch-2.0.4.tgz
```

A reviewer should run, from the repo root, on a machine with registry access:

```
npm install
npm run lint
npm run build         # acts as the typecheck gate
npm run test -- src/test/memo-storage-policy.test.ts
npm run test          # full suite, no regressions elsewhere
```

The new test file is pure static analysis (reads migration files and one source file with `fs`); it does not depend on a Supabase connection or a running database, so it should pass without any infrastructure setup once dependencies are installed.

## Manual verification steps (security-tagged issue)

For any reviewer with two seeded organizations (Org A, Org B):

1. As a user in **Org A**, sign in. Upload a memo attachment.
2. Note the storage path (`<userIdA>/<timestamp>-<rand>.<ext>`).
3. Sign out, sign in as a user in **Org B**.
4. Attempt to download the object from step 2 via `supabase.storage.from('memo-attachments').createSignedUrl(<path>, 60)` — expect an error or empty result.
5. Attempt to list with `supabase.storage.from('memo-attachments').list('<userIdA>/')` — expect an empty list.
6. As an HR admin in **Org A**, the same operations on the Org A object must succeed — confirms the policy still permits intended reads.
7. As the original uploader in **Org A**, download must succeed (own-folder branch).
8. Soft-delete the memo row (or set status to `rejected`); reads from non-uploaders in Org A must fail; reads from the uploader must still succeed.

## Rollback

```
git revert <commit-sha>      # on branch gbc/gbc-17-memo-attachment-rls
```

The change is purely additive (one test file). Reverting removes the regression guard without affecting any production code or schema.

## Status

`partially-resolved` — the underlying vulnerability is closed in `main`; this branch adds the regression guard. Status is not `resolved` because (a) lint/build/test could not be executed in this environment, and (b) the same vulnerability class is live on `invoice-assets` and is explicitly handed off to GBC-7 / GBC-15 rather than fixed here.
