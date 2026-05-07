# GBC-51: Recurring Transactions — half-finished UI

**Severity:** High · **Category:** Screen Review — Financial Suite · **Status:** needs-input

## Root cause
`recurring_transactions` table has `debit_account_id` / `credit_account_id` columns; the form doesn't expose dropdowns to set them. The Edge Function backend is solid but the recurring entries land without GL accounts → cannot post valid journal entries.

## Council verdict (compressed)
- Add two GL-account dropdowns to the "New Recurring" form, populated from `chart_of_accounts`.
- Validate both required; reject save without them.
- Existing rows with NULL accounts should be flagged as "Setup incomplete" in the list view.

## Status
needs-input — UI form change + minor hook update.

## Risks
1. Existing NULL-accounts rows should not be silently ignored on the next cron run; the recurring scheduler needs a guard to skip incomplete templates and log a warning.
2. Lint/build/test could not run in this sandbox.
