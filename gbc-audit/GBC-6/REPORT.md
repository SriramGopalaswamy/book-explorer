# GBC-6: SECURITY DEFINER search_path hardening

**Severity:** High · **Category:** Cross-cutting — Security & Multi-tenancy · **Status:** partially-resolved
**Branch:** `claude/execute-code-prompt-txEjJ` · **Jira:** https://grx10.atlassian.net/browse/GBC-6

## Root cause

In Postgres, a `SECURITY DEFINER` function runs with the owner's privileges. If `search_path` isn't pinned, an attacker who can create a function or table in a schema they control can shadow names resolved without explicit schema qualification (e.g. a `public.profiles` reference becomes `attacker_schema.profiles`). Migration `20260312200000_fix_search_path_mutable.sql` patched 5 then-existing functions; the issue claims 8 newer functions are still vulnerable.

Investigation against the migration tree:
- `enrich_message_content`, `send_whatsapp_template`, `sync_whatsapp_delivery_status`, `execute_workflow_step`, `evaluate_workflow_condition`, `process_aadhaar_esign_callback`, `calculate_fifo_stock_valuation`, `transfer_stock_between_bins` — **none of these eight names exist in `supabase/migrations/`** as `CREATE FUNCTION` statements. The named migration filenames (`20260319130000_message_enrichment_rpc.sql`, `20260322100000_whatsapp_templates.sql`, etc.) also don't exist. The issue's specific function-name list is from a separate codebase or has drifted.
- 200+ migration files contain the substring `SECURITY DEFINER`. A static audit of "every SECURITY DEFINER function created after the cutoff pins search_path" is the correct generalisation regardless of the issue's outdated specifics.

## Council verdict (compressed)

- *Contrarian:* Issue's named functions don't exist; close as outdated.
- *First-Principles:* The vulnerability class is real on every Postgres SECURITY DEFINER function written in the last decade. The codebase needs a structural guard, not a one-time list.
- *Expansionist:* Pin the invariant on every future SECURITY DEFINER function in this repo, not the eight that were named.
- *McKinsey:* Cheapest forward guard is a static-analysis test on migration files.
- *Executor:* Under directive (b), no migration changes. Ship `src/test/security-definer-search-path.test.ts` that asserts every SECURITY DEFINER function created on or after `20260312200000` includes a `SET search_path =` clause. Audit hits at run time will surface any offenders introduced since.

**Chosen approach:** Test-only resolution — see `src/test/security-definer-search-path.test.ts`. If the test passes, no live functions need fixing today; if it fails, the failing list is the punch-list.

## What changed
- `src/test/security-definer-search-path.test.ts` (new) — see `diff.patch`.

## What didn't change (needs-input)
- The eight functions named in the issue do not exist; if those names are pulled from a related codebase, file a separate ticket with the correct migration paths.
- If the regression test fails on first run, the failing function names become a punch-list — each fix is a one-line `SET search_path = public, pg_temp` added to the function definition.
- An `eslint-plugin-supabase` or `pg_amrules` lint pass would catch this at write time rather than test time; recorded as a strategic follow-up in `_SUMMARY.md`.

## Risks
1. The test's regex is heuristic (counts `SET search_path` anywhere within the `CREATE FUNCTION ... ;` statement). False negatives are possible if a function definition spans multiple statements or uses a non-standard delimiter.
2. Cutoff date is `20260312200000`; functions created before that should already have been patched by the named migration. If the test surfaces pre-cutoff offenders that the patch missed, raise as a separate ticket.
3. Lint/build/test could not run in this sandbox.
