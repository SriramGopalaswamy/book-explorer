# GBC-41: Vendor Credits — "Accounting Ghost" (status text-only, no GL impact)

**Severity:** High · **Category:** Screen Review — Financial Suite · **Status:** needs-input

## Root cause
Marking a vendor credit "Applied" only updates a status string. No journal entry posted. Accounts Payable in Trial Balance is overstated by the unposted credit.

## Council verdict (compressed)
Same template as GBC-40 mirrored for vendors: an `apply_vendor_credit(id, target_bill_id)` RPC that posts the journal entry (DR Accounts Payable, CR Purchase Returns / Vendor) and updates status atomically. Backfill script for any previously "Applied" credits with no journal entry.

## Status
needs-input — RPCs + hook rewrite + backfill.

## Risks
1. Identical to GBC-40.
2. Lint/build/test could not run in this sandbox.
