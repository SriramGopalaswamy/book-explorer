# Council on GBC-17 — Cross-Tenant Storage Leakage (memo-attachments)

Background for all advisors: The original loose policy on `memo-attachments` (any authenticated user can `SELECT`) was already replaced by an org-scoped policy in migration `20260222035633` that joins through `public.memos`. Uploaded paths today are `<userId>/<timestamp>-<random>.<ext>`. The issue's recommended fix (org-prefix paths) was not adopted. The remaining decision is what — if anything — to add on top.

---

## Round 1 — Independent positions

### The Contrarian

The honest read of this ticket is "issue describes a vulnerability that has already been remediated by a follow-up migration." Nothing in `main` today actually leaks across tenants. Two distinct policy branches enforce tenancy: `auth.uid() = foldername(name)[1]` for owned files, and `m.organization_id = get_user_organization_id(auth.uid())` (or `is_org_admin_or_hr(auth.uid(), m.organization_id)`) for memo-linked files. The "vulnerability" is a historical artifact. A fix on this branch is at best a regression guard, and at worst it's a policy migration we don't need that perturbs production storage.

The issue's recommended fix — re-keying every object under `<orgId>/...` — is a *much* bigger change than it sounds. It requires (a) backfilling every existing memo-attachment to the new key, (b) updating `memos.attachment_url` for every row, (c) rewriting the policy yet again, (d) coordinating a cutover. That's a multi-day operation for a closed vulnerability. The benefit — a marginally simpler policy expression — does not justify the cost.

Recommendation: do nothing structural. Add a regression test pinning the current policy and the upload path convention. If we want to harden anything else, do it in the broader buckets (`invoice-assets`, `tenant-branding`) under GBC-7 / GBC-15 where the same scaffold pattern is still live. Don't burn a branch on a phantom.

### The First-Principles Thinker

Strip the symptom away and ask: what authorizes a read of an object in a multi-tenant system? Two answers exist.

1. **Path-based:** the object's key encodes the tenancy (`<orgId>/...`); the policy parses the key and compares to the caller's org. Authorization is a string compare, no joins, fast and oblivious to the rest of the schema.

2. **Reference-based:** the object's key is opaque; a row in some application table associates the object with a tenant; the policy joins that table. Authorization tracks the lifecycle of the referencing row (status, owner, soft-delete).

The current policy is reference-based: it follows `public.memos.attachment_url` to discover the tenant. That choice has architectural consequences:

- Drafts/rejected memos are visible only to the uploader and org admins, which matches the workflow.
- Orphan files (memo deleted but object retained) become unreadable to everyone except the original uploader. That's actually correct for confidentiality but means the bucket needs a janitor.
- The substring match `LIKE '%' || storage.filename(name)` depends on filename uniqueness across the bucket. Today that holds because uploads embed a timestamp and 16+ bits of randomness, but the convention is implicit.

A first-principles fix would make the convention explicit: encode tenancy *and* the uploader *and* a memo-id placeholder in the object key, and let the policy authorize from the key alone. That collapses the three OR-branches into one and decouples storage from the memos table. It is the right architectural answer; it is also out of scope for a closed-vulnerability ticket.

### The Expansionist

The issue says "memo-attachments" but the *pattern* it describes is everywhere. Five minutes with `rg "auth.role\(\) = 'authenticated'" supabase/migrations` shows at least one other live offender:

```
supabase/migrations/20260312210000_restrict_invoice_assets_bucket.sql:
  USING (bucket_id = 'invoice-assets' AND auth.role() = 'authenticated')
```

`invoice-assets` is a public-bucket-turned-private that still uses the flat authenticated check. That is the *exact* bug GBC-17 describes, in a higher-value bucket, and it is sitting in `main` today. Whatever we do for memo-attachments has to be either (i) explicitly reusable across buckets, or (ii) deferred to GBC-7 / GBC-15 with a hand-off note.

Beyond `invoice-assets`, audit every `INSERT INTO storage.buckets`: classify each as *path-tenancy* (key has org/uid prefix), *reference-tenancy* (joined through an app table), or *flat-authenticated* (broken). The deliverable is a one-page bucket-by-bucket matrix with the policy class and a remediation plan. Anything less and we'll be patching this same hole in three more places by June.

For *this* branch: lock in a regression test for `memo-attachments` and produce the bucket inventory as a deliverable in `_SUMMARY.md`. Don't do partial bucket fixes; coordinate them under GBC-7.

### The McKinsey Consultant

ROI table:

| Option | Effort | Risk | Marginal value |
|---|---|---|---|
| Do nothing | 0 d | 0 | 0 |
| Regression test only | 0.25 d | low | prevents accidental policy regression |
| Org-prefix path migration on memo-attachments | 2-3 d | medium (storage cutover) | minor: simpler policy, no behaviour change |
| Bucket-wide audit + standardised template | 3-5 d | medium | unblocks GBC-7 / GBC-15 |
| Full re-architecture (path-tenancy everywhere) | 2-4 wks | high | resolves GBC-7 / GBC-15 / GBC-17 |

The best dollar-for-dollar move is the regression test. The right *strategic* move is the bucket-wide audit, but that belongs to GBC-7. Defer the re-architecture; the problem is contained.

### The Executor

Concrete plan for the GBC-17 branch only:

1. Branch: `gbc/gbc-17-memo-attachment-rls` from `main`.
2. **No SQL migration.** The remediation is already in `main` (20260222035633). Adding another would muddy the history.
3. Add `src/test/memo-storage-policy.test.ts` with four assertions:
   - the original loose policy is dropped by a later migration,
   - a tenancy-scoped SELECT policy exists for `memo-attachments`,
   - no later migration re-introduces a flat-authenticated policy on this bucket,
   - `uploadMemoAttachment` keeps writing under `${userId}/...`.
4. Quality gates: `npm run lint`, `npm run build`, `npm run test`. Capture verbatim output in `03_resolution.md`. **Caveat: this environment cannot install dependencies (npm registry blocked). Document the inability and provide the exact commands a reviewer should run.**
5. Manual verification (for security-tagged issues): with two seeded orgs A and B, sign in as a user in A and request a signed URL for an object owned by B. Expect 403/empty. Repeat for: own draft, org admin viewing draft, post-publish read.
6. Rollback: `git revert` the resolution commit. The change is purely additive (one test file).
7. Hand-off note in `_SUMMARY.md`: same vulnerability class lives in `invoice-assets` (`20260312210000`); flag for GBC-7 / GBC-15.

Do NOT modify storage policies on this branch. Do NOT reformat the upload helper. Do NOT migrate path conventions. Anything beyond the test is scope creep.

---

## Round 2 — Anonymous peer review

Re-labelled positions: A = First-Principles Thinker, B = Executor, C = Contrarian, D = Expansionist, E = McKinsey.

**Critique by Position A (First-Principles, on B/C/D/E):**
B is too narrow — the test is good but it pins a brittle convention (`LIKE '%' || filename(name)`) without admitting that the convention is implicit. C is correct that the symptom is dead but undersells the architectural debt. D is right that the bucket-wide pattern matters but offers no actionable handle within this issue. E's table is useful but treats "do nothing" and "regression test" as nearly equivalent; they are not — the test prevents bit-rot under future migrations.

**Critique by Position B (Executor, on A/C/D/E):**
A and D are pushing scope outside the ticket; both ideas are sound but belong in GBC-7. C is right about the immediate state but the "do nothing" stance leaves no guard against regression — a future migration could trivially reintroduce the loose policy. E correctly identifies the regression test as best ROI but doesn't address the operational point: we *can't* run lint/test in this environment, which has to be documented.

**Critique by Position C (Contrarian, on A/B/D/E):**
A's path-tenancy argument is theoretically clean but ignores that `memos` already encodes tenancy and the join is cheap (filename is random and unique). B is fine. D is doing a different ticket — bucket-wide audits are GBC-7's job, not GBC-17's. E's matrix is sensible but conflates "test-only fix" with the genuinely strategic option (bucket inventory).

**Critique by Position D (Expansionist, on A/B/C/E):**
A is correct about the architectural answer but doesn't engage with the cost of cutover. B is reasonable but fails to flag that the test pins a fragile filename-uniqueness assumption — that should be called out. C's "do nothing structural" is acceptable iff the bucket inventory in GBC-7 is committed to; otherwise we're rolling the dice on the next bucket. E gives the right call (test + defer the rest).

**Critique by Position E (McKinsey, on A/B/C/D):**
A would be right in a greenfield design; in this codebase the cost is too high to recommend. B's plan is the correct execution of the do-the-test option but should explicitly forecast that GBC-7 will subsume the broader work. C undersells the regression test's value as a forward guard. D's bucket-wide audit is the next logical workstream but doesn't fit this branch.

---

## Round 3 — Verdict

**Chosen approach.** Treat GBC-17 as a *closed* vulnerability with a forward guard. Do not modify any storage policy, migration, or upload path on this branch. Add a Vitest regression suite (`src/test/memo-storage-policy.test.ts`) that fails loudly if any of these invariants regress: the loose policy stays dropped, an org-scoped SELECT policy exists for `memo-attachments`, no later migration reintroduces a flat-authenticated SELECT on the bucket, and `uploadMemoAttachment` continues to namespace objects under `${userId}/`. Carry forward the cross-bucket pattern concern (`invoice-assets` and others using `auth.role()='authenticated'`) into GBC-7 / GBC-15 via `_SUMMARY.md`. Document explicitly that this environment cannot run lint/test/build, and provide the exact commands a reviewer must run.

**What was rejected and why.**
- *Org-prefix path migration* (Issue's recommended fix): rejected — high cost, no behaviour change, the policy already enforces tenancy.
- *Full path-tenancy re-architecture across buckets* (First-Principles): rejected for GBC-17 scope; folded into GBC-7's recommended workstream.
- *Bucket-wide audit on this branch* (Expansionist): rejected for GBC-17 scope; explicitly handed off to GBC-7 with the inventory deliverable in `_SUMMARY.md`.
- *Do nothing* (Contrarian): rejected — leaves no guard against re-introduction of the loose policy in a future migration.

**Open risks.**
1. The org-scoped policy depends on `LIKE '%' || storage.filename(name)` matching at most one memo row. Holds today because filenames embed a timestamp and 64-bit-ish random suffix, but the contract is implicit.
2. Orphan objects (memo row deleted but storage object retained) become unreadable to all org members except the uploader. That is correct for confidentiality but storage will accumulate orphans without a janitor.
3. The same scaffold-pattern leak (`auth.role()='authenticated'` only) is live on `invoice-assets`. Until GBC-7 lands, that bucket leaks across tenants.
4. We cannot run lint/test/build in this environment; correctness of the new test file is verified by static reasoning only.

**Definition of done.**
- `src/test/memo-storage-policy.test.ts` exists and contains the four invariants enumerated above.
- The test asserts on actual migration files in `supabase/migrations/` and on `src/hooks/useMemos.ts`, not on mocks.
- Branch `gbc/gbc-17-memo-attachment-rls` is committed with the message format from the prompt.
- `03_resolution.md` records that lint/test/build could not run locally, with the exact commands a reviewer must run.
- `_SUMMARY.md` lists `invoice-assets` (and any other flat-authenticated buckets) as carry-forward for GBC-7 / GBC-15.
