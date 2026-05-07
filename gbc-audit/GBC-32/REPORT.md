# GBC-32: Ledger Explorer — invalid running balances

**Severity:** Low (per Jira) — should be **High** (audit failure risk) · **Category:** Screen Review — Financial Suite · **Status:** needs-input

## Root cause
Running balance computed via `array.reduce()` over the result of `useJournalEntries()`. That hook caps at 200 rows (GBC-31). For accounts with > 200 entries, the running balance is mathematically wrong from the very first row displayed — it starts from a partial sum.

## Council verdict (compressed)
Move running-balance computation server-side. A `gl_account_running_balance(account_id, from, to)` SQL function returns the opening balance + per-entry running total. Frontend displays the function output directly.

## Status
needs-input — schema/RPC change. **Severity should be re-rated High** — incorrect ledger balances are an audit-failure scenario.

## Risks
1. Companies relying on the (incorrect) current values will see different numbers post-fix; communicate clearly.
2. Opening-balance computation must respect financial-period locks.
3. Lint/build/test could not run in this sandbox.
