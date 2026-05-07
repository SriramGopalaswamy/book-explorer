# GBC Codebase Audit — Cross-Issue Synthesis

Coverage: all 65 issues processed under directive **(b)** — only documentation and tests-as-spec are shipped on this audit branch; every code-change recommendation is recorded as `needs-input`. Every artifact bundle lives under `gbc-audit/<KEY>/`.

## 1. Patterns observed across the backlog

These five patterns explain ~70% of the backlog. Fixing the foundation collapses many screen-level issues simultaneously.

### Pattern A — "Math in the browser, source of truth on a paginated array"
Hooks fetch `.limit(N)` (200, 500, or no limit), the UI runs `.reduce()` / `.filter()` / `.map()` over the result, and the on-screen number is wrong as soon as data exceeds the slice.

Issues: **GBC-1, GBC-31, GBC-32, GBC-34, GBC-38, GBC-42, GBC-45, GBC-46, GBC-47, GBC-48, GBC-50, GBC-53, GBC-57, GBC-65**.

Foundation fix: server-side aggregation/pagination (SQL functions), then per-screen rewrites. GBC-1 and GBC-14 are the foundational tickets; the rest fold into the per-screen branch list once foundations land.

### Pattern B — "Multi-step browser-driven mutation, no transaction"
Frontend runs N independent supabase calls; on network drop the database is left in a half-state. "Manual rollback" code is itself non-atomic and makes things worse.

Issues: **GBC-36, GBC-37, GBC-39, GBC-43, GBC-44, GBC-59, GBC-61, GBC-62**.

Foundation fix: collapse each into a single SECURITY DEFINER RPC with full transactional semantics; remove client rollback code. Ten RPCs cover all eight issues.

### Pattern C — "Status flips with no GL/inventory side-effects"
Status updates that should post a journal entry (or stock_ledger row) only update the status text. Trial Balance and stock figures drift silently.

Issues: **GBC-40, GBC-41, GBC-63, GBC-64**.

Foundation fix: triggers (or RPCs) that post the matching GL/stock-ledger rows on status transitions.

### Pattern D — "Tenancy-scoped resource without tenant in cache key / RLS / path"
Either React Query's queryKey, an RLS policy, or a storage object key omits `organization_id`. Cross-tenant bleed window opens (60s for cache; indefinite for RLS/storage until policy fix).

Issues: **GBC-2, GBC-3, GBC-7, GBC-15, GBC-17, GBC-25 (sub-A), GBC-28**.

Foundation fix: (a) test pinning `queryKey` shape (shipped here as `query-key-tenancy.test.ts`); (b) test pinning storage policies (shipped here as `storage-bucket-policy.test.ts`); (c) per-policy/per-bucket cleanup; (d) longer-term denormalise `organization_id` onto every detail table.

### Pattern E — "Validation in the browser only" / "Stub instead of integration"
Either client-side enforcement of business rules (15-char GSTIN for foreign customers, dev-mode flags gating impersonation) or fake stubs in place of external integrations.

Issues: **GBC-18, GBC-19, GBC-26, GBC-33, GBC-49, GBC-51, GBC-58**.

Foundation fix per case: server-side enforcement for security-critical checks (GBC-18); typed Supabase client to surface schema drift (GBC-19/26); real integration for stubs (GBC-49 e-invoice IRN); UI completion for unfinished forms (GBC-51, GBC-58).

## 2. Foundational fixes that resolve multiple issues

| Foundation | Resolves / partially resolves |
|---|---|
| Move math to RPCs / SQL functions (GBC-1) | GBC-31, 32, 34, 38, 42, 45, 46, 47, 48, 50, 53, 57, 65 |
| Single-RPC multi-step mutations (GBC-36 template) | GBC-37, 39, 43, 44, 59, 61, 62 |
| GL/inventory triggers on status changes (GBC-40 template) | GBC-41, 63, 64 |
| Cursor pagination + FTS (GBC-14 template) | GBC-31, 34, 38, 48, 57, 65 |
| Typed Supabase client + Database type at boundary (GBC-19/26) | swathe of `as any` casts; surfaces schema drift |
| Org-scoped storage policy template + bucket inventory (GBC-7/17) | GBC-15, plus future buckets |

## 3. Issues blocked or needing product/design input

- **GBC-30** — Empty Jira description; needs the issuer to clarify symptoms before we can investigate.
- **GBC-49** — Real NIC e-invoice integration is multi-week work, requires GSP credentials, legal sign-off on disabling the fake "Generate IRN" button.
- **GBC-15 / GBC-7** — Decision needed on whether `tenant-branding` and `email-assets` buckets should remain public (CDN logos for branding) or be made private with signed-URL access.
- **GBC-9** — Needs product call on tenant timezone behaviour: hard-set `Asia/Kolkata` per CLAUDE.md, or let admins pick per org?
- **GBC-32, GBC-58** — Severity should be re-rated higher than the issuer marked them (audit-failure / non-functional feature respectively).

## 4. Recommended ordering for review/merge

This single-branch audit has only **three test files** that change behaviour-adjacent state (regression guards, no logic change). They can land in any order:

1. `src/test/memo-storage-policy.test.ts` (GBC-17)
2. `src/test/storage-bucket-policy.test.ts` (GBC-7 / GBC-15 / GBC-17)
3. `src/test/query-key-tenancy.test.ts` (GBC-28)
4. `src/test/security-definer-search-path.test.ts` (GBC-6)

All four are pure static analysis (read migration files / hook source) — they pass once `npm install` runs successfully (the SessionStart hook in `.claude/hooks/session-start.sh` handles this once a `vendor/node_modules.tar.gz` is seeded).

For the **needs-input** code work, recommended sequencing:

1. **Foundations first**: typed Supabase client (GBC-19/26) → org_id denormalisation (GBC-2/3) → typed `useOrgQuery` facade (GBC-28 follow-up).
2. **Then transaction RPCs** (GBC-36/37/39/43/44/59/61/62 — share template) and **status-transition triggers** (GBC-40/41/63/64).
3. **Then per-screen pagination/search** (GBC-14 + GBC-31/34/38/48/57/65).
4. **Then storage hardening** (GBC-7 / GBC-15 — invoice-assets path-tenancy migration + signed-URL standardisation).
5. **Concurrency, audit, realtime** (GBC-10, GBC-13, GBC-11) — orthogonal foundation work, can run in parallel.
6. **Per-screen UX/feature gaps** (GBC-29, GBC-33, GBC-51, GBC-55, GBC-56, GBC-58, GBC-60).
7. **Compliance re-implementation** (GBC-49 NIC e-invoice integration — separate workstream).

## 5. Items the user must validate manually before merging

Tests in this branch can be run safely; the **needs-input** follow-ups all carry their own caveats:

- **Cross-tenant tests for storage and queryKey work** — tests pin convention; manual verification with two seeded orgs is still required to confirm no data leak (steps in each REPORT.md).
- **Trial Balance correctness** (GBC-53) — once the JS reducer is replaced with the SQL function, real imbalances may surface that were previously hidden. Communicate to CAs before flipping.
- **Backfills** — GBC-40 / GBC-41 / GBC-63 require backfill scripts to repair historical state; verify those run cleanly against a snapshot of production before promoting.
- **NIC e-invoice integration** (GBC-49) — fake IRNs in production data are not legally compliant; affected invoices need re-issue through the real API.
- **Tenant timezone migration** (GBC-9) — apparent timestamps will shift; verify against representative data.
- **Lint/build/test** — could not run in this sandbox at all (npm registry blocked). The SessionStart hook scaffolding lives at `.claude/hooks/session-start.sh`. Reviewers must run `npm run lint && npm run build && npm run test` locally for each test file added on this branch (and for every needs-input code change before merging).

## 6. Tech debt themes (3-5 strategic recommendations)

1. **"Browser is a thin client" architectural rule.** Codify the principle that authoritative business logic (math, multi-step mutations, status side-effects) lives in Postgres, not React. Operationalise via an ESLint rule that flags `supabase.from(X).delete()` chained with a follow-up insert as a smell, plus a code-review gate.

2. **Typed everything at the boundary.** `Database` from generated types must be attached to the Supabase client; `useOrgQuery(name, fn, deps)` facade must wrap every org-scoped React-Query call. These two changes alone make Patterns A and D structurally impossible to re-introduce.

3. **Bucket / RLS template repository.** A single canonical `create_org_scoped_bucket(name)` helper that always produces a path-tenancy SELECT policy. Same for tables: a `create_tenant_table(name, columns)` macro that always adds `organization_id`, the appropriate RLS, and the trigger to maintain it.

4. **Server-side audit + export logging as default.** Triggers on every "important" mutation should write to `audit_logs`; an `export_audit_log` table should be wrapped by a single helper hook used by every export site. Both prevent the "browser-side audit" anti-pattern (GBC-13, GBC-16) from coming back.

5. **Real-time + idempotent long-running RPCs.** Every "Generate Payroll" / "Bulk Upload" / "Year-End Close" flow goes through a `job_runs` table + Supabase Realtime channel + idempotency key. Removes the "click-five-times" duplicate-job hazard (GBC-11) and turns long jobs into observable, restartable work.

## 7. What this branch actually ships

Code change (regression tests only):
- `src/test/memo-storage-policy.test.ts` (GBC-17)
- `src/test/storage-bucket-policy.test.ts` (GBC-7 / GBC-15)
- `src/test/query-key-tenancy.test.ts` (GBC-28)
- `src/test/security-definer-search-path.test.ts` (GBC-6)
- `.claude/hooks/session-start.sh` + `.claude/settings.json` (audit infra)

Documentation: 65 `gbc-audit/GBC-N/REPORT.md` files + `_INDEX.md` + `_REPO_RECON.md` + this `_SUMMARY.md`.

No application logic, no migration, no hook source modified. Everything authoritative is `needs-input` per directive (b).
