# GBC-17: Cross-Tenant Storage Leakage (memo-attachments)

**Severity:** High  ·  **Category:** Cross-cutting — Security & Multi-tenancy  ·  **Status:** partially-resolved
**Branch:** `gbc/gbc-17-memo-attachment-rls`  ·  **Jira:** https://grx10.atlassian.net/browse/GBC-17

## TL;DR

The original loose RLS policy on `memo-attachments` (any authenticated user could read any object, regardless of tenant) was already replaced in `main` by an org-scoped policy in migration `20260222035633`. This branch adds a Vitest regression suite that pins the current policy and the upload-path convention so the leak cannot silently regress. The same vulnerability *class* still exists on `invoice-assets` and is handed off to GBC-7 / GBC-15.

## Root cause

A scaffold-pattern over-permissive policy (`bucket_id = 'memo-attachments' AND auth.role() = 'authenticated'`) was created in migration `20260218114058` and lived for four days until `20260222035633` replaced it with an org-scoped check joining through `public.memos`. The deeper root cause is the absence of a project-wide template for tenant-aware bucket creation; the same loose pattern shipped in at least one other live bucket (`invoice-assets`). Full investigation: [`01_root_cause.md`](./01_root_cause.md).

## Council verdict

Treat GBC-17 as a closed vulnerability with a forward guard. Do not modify any storage policy, migration, or upload path on this branch; instead, add a Vitest regression suite that fails loudly if any of four invariants regress (loose policy stays dropped, org-scoped SELECT exists, no later migration reintroduces flat-authenticated SELECT, `uploadMemoAttachment` keeps writing under `${userId}/`). Carry the cross-bucket pattern concern into GBC-7 / GBC-15 via `_SUMMARY.md`. Reject the issue's literal "org-prefix paths" recommendation as high-cost-no-benefit; reject "do nothing" as it leaves no regression guard.

**Definition of done.** Test file exists with the four invariants; asserts on real migration/source files (not mocks); branch is committed; resolution doc records the inability to run lint/test/build locally and lists the commands a reviewer must run; `_SUMMARY.md` lists `invoice-assets` as carry-forward. Full debate: [`02_council.md`](./02_council.md).

## What changed

- `src/test/memo-storage-policy.test.ts` (new) — four-assertion regression suite reading the actual migration files and the upload helper.

Diff: [`diff.patch`](./diff.patch). Resolution detail: [`03_resolution.md`](./03_resolution.md).

## What didn't change

- No SQL migration. The org-scoped policy already in `main` is correct.
- No upload-path change. The current `${userId}/` prefix is compatible with the policy's folder-based branch.
- No edits to `src/hooks/useMemos.ts`, `src/pages/performance/Memos.tsx`, or `src/pages/hrms/ManagerInbox.tsx`.

## Risks and follow-ups

1. The org-scoped policy's `LIKE '%' || storage.filename(name)` clause depends on filename uniqueness across the bucket. Holds today (timestamp + 64-bit-ish random suffix) but is an implicit contract.
2. Orphan storage objects (memo deleted but object retained) become readable only by the original uploader. Correct for confidentiality; a janitor is recommended but out of scope.
3. **`invoice-assets` is still vulnerable to the same bug class** — `supabase/migrations/20260312210000_restrict_invoice_assets_bucket.sql:1-3` uses the flat `auth.role() = 'authenticated'` SELECT. Hand-off to GBC-7 / GBC-15.
4. Lint/build/test could not be executed in this environment (npm registry blocked). The new test file is statically reasoned correct but unverified at runtime; reviewer must run `npm run lint && npm run build && npm run test` after `npm install`.
