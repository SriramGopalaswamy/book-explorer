# GBC-37: Expenses — "Out-of-Sync Ledger" (Mark-as-Paid not atomic)

**Severity:** High · **Category:** Screen Review — Financial Suite · **Status:** needs-input

## Root cause
"Mark as Paid" runs four separate browser→Supabase calls: UPDATE expense.status, SELECT expense, INSERT financial_records, INSERT bank_transactions. Network drop after step 1 leaves a Paid expense with no GL entry — Accounting and Bank reconciliation are now out of sync.

## Council verdict (compressed)
Same pattern as GBC-36/39/43/44: collapse the chain into a single SECURITY DEFINER RPC `mark_expense_paid(expense_id, payment_method, bank_account_id)` that runs all four operations in a transaction. Per CLAUDE.md, financial_records rows with `journal_entry_id` are trigger-owned — the RPC must INSERT a journal_entry and let the trigger derive the financial_records row, not write to financial_records directly.

## Status
needs-input — new RPC + hook rewrite. Bundle with GBC-39, GBC-43, GBC-44 (same template).

## Risks
1. Trigger interaction (`trg_sync_financial_records`) — verify the RPC doesn't double-write.
2. Lint/build/test could not run in this sandbox.
