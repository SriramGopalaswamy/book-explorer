# GBC-40: Credit Notes — "Ghost Credit" (no GL sync)

**Severity:** High · **Category:** Screen Review — Financial Suite · **Status:** needs-input

## Root cause
Creating/issuing/applying a credit note only updates `credit_notes` table; no row in `financial_records` / no journal entry posted. Balance Sheet shows the original receivable as still owed. Hard accounting bug — auditor's first finding.

## Council verdict (compressed)
- Credit-note state transitions must POST a journal entry (DR Sales Returns / Revenue, CR Accounts Receivable). The trigger-owned `financial_records` row follows from the journal entry per CLAUDE.md.
- Implement as `issue_credit_note(id)` and `apply_credit_note(id, target_invoice_id)` RPCs; both POST appropriate journal entries.

## Status
needs-input — new RPCs + hook rewrite + UI integration.

## Risks
1. Existing credit-notes that were marked "Issued" without a GL entry need a backfill: a one-shot script that posts the corresponding journal entries dated to the original transition timestamp.
2. Once posted, journal entries are immutable per the GL design; reversing requires a counter-entry, not a delete.
3. Lint/build/test could not run in this sandbox.
