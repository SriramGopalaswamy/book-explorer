# GBC-44: Vendor Payments — split-payment risk (3 sequential calls)

**Severity:** High · **Category:** Screen Review — Financial Suite · **Status:** needs-input

## Root cause
`useCreateVendorPayment` runs 3 separate calls: insert payment → update bill.status → insert bank_transaction. Network drop between any two leaves a "ghost payment" — money "spent" but bill still unpaid (or vice versa).

## Council verdict (compressed)
Single RPC `record_vendor_payment(bill_id, amount, method, bank_account_id)`. Same template as GBC-37/39/43.

## Status
needs-input — new RPC + hook rewrite.

## Risks
Identical to GBC-37/39/43. Lint/build/test could not run in this sandbox.
