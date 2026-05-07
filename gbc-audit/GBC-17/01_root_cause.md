# GBC-17 — Root cause investigation

**Issue:** Cross-Tenant Storage Leakage (Multi-Tenancy Breach) — `memo-attachments` bucket.
**Source migration cited:** `supabase/migrations/20260218114058_9b00bb84-a1a8-4431-80ae-c00a648e18e4.sql`.

## 1. What the issue claims

The original RLS policy on the `memo-attachments` storage bucket lets any authenticated user `SELECT` any object in the bucket, regardless of which organization owns it. An employee in Org A could view a confidential memo attachment uploaded by Org B simply by guessing the storage path. The issue recommends prefixing every object key with the org UUID and matching that prefix against the user's `organization_id`.

## 2. What the code actually does

### 2a. The original (vulnerable) policy — `20260218114058_*.sql:39-44`

```sql
CREATE POLICY "Authenticated users can view memo attachments"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'memo-attachments' AND
  auth.role() = 'authenticated'
);
```

Yes — at the time this migration was the head, the policy is exactly as the issue describes: a flat `authenticated` check with no tenant scoping.

### 2b. The follow-up migration — `20260222035633_dc11b070-...sql:5-30`

```sql
DROP POLICY IF EXISTS "Authenticated users can view memo attachments" ON storage.objects;

CREATE POLICY "Users can view own or org memo attachments"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'memo-attachments' AND
  auth.role() = 'authenticated' AND
  (
    auth.uid()::text = (storage.foldername(name))[1]
    OR EXISTS (
      SELECT 1 FROM public.memos m
      WHERE m.attachment_url LIKE '%' || storage.filename(name)
        AND m.status = 'published'
        AND m.organization_id = get_user_organization_id(auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.memos m
      WHERE m.attachment_url LIKE '%' || storage.filename(name)
        AND is_org_admin_or_hr(auth.uid(), m.organization_id)
    )
  )
);
```

### 2c. Upload path — `src/hooks/useMemos.ts:191-204`

```ts
export async function uploadMemoAttachment(file: File, userId: string): Promise<string> {
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  ...
  const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage
    .from("memo-attachments")
    .upload(fileName, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(...);
  return fileName;
}
```

Path layout today: `<userId>/<timestamp>-<random>.<ext>` — **userId-prefixed, NOT org-prefixed**.

## 3. Is the claim accurate?

**partially confirmed** — accurate as of the cited migration, but already remediated by a later one.

Specifically:
- The original migration `20260218114058` did create an over-permissive SELECT policy. ✅ Issue is real.
- A subsequent migration `20260222035633` (four days later) replaced the policy with an org-scoped check that restricts cross-tenant reads. ✅ Issue is largely fixed in production.
- The recommended fix (org-prefix path layout) was **not** adopted; instead, the policy joins through `public.memos` to enforce tenancy. The two approaches reach the same endpoint but trade off in different ways (see council).

## 4. Deeper root cause

Two structural causes, not just the one in the symptom:

1. **Permissive default during scaffolding.** The bucket was created with the default "any authenticated user" SELECT pattern that Supabase examples ship with. Several other buckets in this repo show the same pattern (e.g. `invoice-assets` in `20260312210000_*.sql:1-3` — see *Blast radius* below). The root cause is the absence of a project-wide convention/template that bakes tenancy into bucket creation.
2. **Filename-based join after the fact.** The remediation works but ties storage authorization to the `public.memos` row's `attachment_url` and uses a `LIKE '%' || storage.filename(name)` substring match. This is functionally correct in normal use because uploaded names contain a timestamp and a 16-char random suffix, but it does drag two table scans into every read of an object and depends on filename uniqueness for correctness. An object key that begins with the user's auth.uid() is the fast, schema-free check the issue originally recommended.

## 5. Blast radius

- **`memo-attachments` itself:** addressed by `20260222035633`. Already in `main`.
- **`invoice-assets`:** `20260312210000_restrict_invoice_assets_bucket.sql:1-3` still has a flat `bucket_id='invoice-assets' AND auth.role()='authenticated'` SELECT — every authenticated user across every tenant can read every invoice PDF/logo. This is the **same bug class** in a higher-value bucket and is properly the subject of GBC-7 / GBC-15. We will not modify it under GBC-17 (out of scope per the rules), but flag it here.
- **Bill attachments / credit-card statements** (`20260221052919_*.sql`): correctly use uploader-folder + finance-admin policies; no leakage observed.
- **`erp-documents` payslip prefix** (`20260428160000_erp_documents_storage.sql`): scoped by both folder prefix (`payslips/`) and admin/HR check; no leakage observed.
- **`tenant-branding`, `email-assets`:** public buckets; covered by GBC-7.

Other affected pages once a fix lands: `src/pages/performance/Memos.tsx:334` (signed-URL fetch) and `src/pages/hrms/ManagerInbox.tsx:856` (download). Neither needs to change for this fix.

## 6. Reversibility

- The 20260222035633 migration is already in `main`. Reverting it would re-open the leak; we are not touching it.
- Any new changes we make here (regression test, optional path-prefix hardening) are file-scoped and trivially revertable via `git revert <commit>` on the per-issue branch.

## 7. Pre-existing tests

None found:
```
$ rg -n "memo-attachment" src/test/  →  (no matches)
$ rg -n "uploadMemoAttachment"        →  only the source definition
```

There is no SQL test harness for storage policies, so a regression test for this specific bucket would have to be either (a) a Vitest unit test for `uploadMemoAttachment`'s path-format invariant, or (b) a manual test plan documented in `03_resolution.md`. We will add (a).

## Summary

The issue was real on the day it was filed; the codebase has since shipped a tenancy-scoped policy that closes the cross-tenant read. Two follow-ups remain in scope for this issue: (i) lock in a regression test so the bucket cannot regress to a flat `authenticated` policy in the future, and (ii) document the path convention so future memo uploads keep the join-based policy correct. The broader "many buckets with the same scaffold pattern" concern is the subject of GBC-7 / GBC-15 and is intentionally deferred there.
