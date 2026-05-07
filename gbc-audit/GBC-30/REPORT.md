# GBC-30: Financial Suite → Accounting screen (no description)

**Severity:** Low · **Category:** Screen Review — Financial Suite · **Status:** needs-input
**Branch:** `claude/execute-code-prompt-txEjJ` · **Jira:** https://grx10.atlassian.net/browse/GBC-30

## Root cause
The Jira issue body is empty. Per the prompt's specific guidance: "GBC-30 (Accounting screen) has no description. Don't fabricate one. Treat it as `needs-input`, document what you'd want to know, and move on."

## What we'd need to investigate

To produce a real audit, the issuer should clarify:

1. **Symptom:** What happens on the Accounting screen that they consider broken? (e.g., totals wrong, page slow, journal lines missing, posting fails, RLS blocks display, etc.)
2. **Repro path:** click-by-click, including any sample data needed.
3. **Expected vs. actual:** what should happen, what does happen.
4. **Scope:** entire Accounting page, or a specific tab/component?
5. **Connection to other findings:** is this a screen-level instance of GBC-32 (Ledger Explorer running-balance bug) or one of the systemic Financial-Suite findings (`.limit(N)`, missing GL sync)?

A fair guess: most likely the same systemic findings as GBC-31/32 (data fetching capped at 200; client-side aggregations with paginated data). If so, the fix folds into GBC-1 (move math to RPCs) and GBC-31/32. Document and re-issue.

## Status
needs-input — block until issuer fills in the description.

## Risks
None — no code change.
