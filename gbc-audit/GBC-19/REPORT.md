# GBC-19: Excessive use of `any` (TypeScript Risk)

**Severity:** High · **Category:** Cross-cutting — Code Quality · **Status:** needs-input
**Branch:** `claude/execute-code-prompt-txEjJ` · **Jira:** https://grx10.atlassian.net/browse/GBC-19

## Root cause

Verified: `grep -rE 'as any\b' src/ --include='*.ts' --include='*.tsx'` reports **866 total occurrences** in the working tree (issue claimed 2,253 lint errors — likely includes other rule families like `no-unused-vars` etc.). The 230+ occurrences in GBC-26 are a strict subset (the `supabase.from("…" as any)` shape — count today is 175 across 30 files).

This is the same root cause as **GBC-26** for the database call sites; non-database `as any` covers component props, untyped API responses, dynamic forms.

## Council verdict (compressed)

- *Contrarian:* Boil-the-ocean refactor. Type one module at a time.
- *First-Principles:* `any` is a bug; fix the bug class once at the boundary (Supabase client) and most of the rest disappears.
- *Expansionist:* The `Database` type is generated (`src/integrations/supabase/types.ts` exists, 373KB); attach it to the client, then `as any` on Supabase calls becomes uncompilable.
- *McKinsey:* Highest-leverage first: typed Supabase client + typed React-Hook-Form value types. Defer cosmetic prop typings.
- *Executor:* Stage in three phases — (a) attach generated `Database` to the client, allow only specific overrides; (b) sweep `as any` from `src/hooks/use*.ts`; (c) sweep `src/pages/*.tsx`. Each phase a separate branch; CI gate on no-new `as any`.

**Chosen approach (deferred under directive (b)):** Pure refactor. Status `needs-input`. The eslint rule already exists; the *fix* is structural.

## What changed
Nothing on this branch.

## What didn't change (needs-input — phased plan)
1. **Type the Supabase client.** `import { Database } from './types'; createClient<Database>(URL, KEY)` in `src/integrations/supabase/client.ts`. Most `from("table" as any)` will then either compile cleanly (because the table exists in `Database`) or fail loudly (because the type is stale — regenerate via `supabase gen types typescript`).
2. **Sweep hooks.** Most `as any` casts are on `.select()` / `.insert()` results — replace with the type the new client infers.
3. **Sweep pages/components.** Lower-leverage; do last.
4. **Add CI ratchet.** A test (or eslint rule) that counts `as any` occurrences and fails on increase.

## Risks
1. Phase 1 may surface dozens of compile errors immediately — that's the *point* but breaks the build until fixed. Do behind a feature branch with the full team.
2. Generated types need to be regenerated whenever migrations change schema; add `npm run gen:types` to CI.
3. `Database` type is 373KB; ensure tsc memory headroom.
4. Lint/build/test could not run in this sandbox.
