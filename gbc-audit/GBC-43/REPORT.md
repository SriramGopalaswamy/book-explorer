# GBC-43: Payment Receipts — split-transaction risk (5 sequential calls)

**Severity:** Medium · **Category:** Screen Review — Financial Suite · **Status:** needs-input

## Root cause
`useCreatePaymentReceipt` runs 5 separate Supabase calls: insert receipt → fetch invoice → calculate paid_total → update invoice → insert bank_transaction. Same atomicity bug as GBC-36/37/39/44.

## Council verdict (compressed)
Single SECURITY DEFINER RPC `record_payment_receipt(invoice_id, amount, method, bank_account_id)` that does all five in a transaction. Server-side overpayment check; reject if amount > invoice balance.

## Status
needs-input — new RPC + hook rewrite. Bundle with GBC-37/39/44.

## Risks
1. RPC must perform overpayment check itself (not trust the client).
2. Lint/build/test could not run in this sandbox.
