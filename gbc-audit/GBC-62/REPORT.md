# GBC-62: Sales Order — "Zombie Order" (manual rollback)

**Severity:** High · **Category:** Screen Review — Sales · **Status:** needs-input

## Root cause
`useCreateSalesOrder` inserts header → inserts items; on item-insert failure, manually deletes the header (`if (itemErr) await delete...`). If the delete itself fails (network), the SO header is orphaned with no items — ghost orders that distort sales analytics.

## Council verdict (compressed)
Same as GBC-39 / GBC-59: collapse the two-step into a single RPC `create_sales_order(header_jsonb, lines_jsonb[])` that runs in a transaction. DB rollback is automatic; no manual cleanup code required.

## Status
needs-input — RPC + hook rewrite.

## Risks
1. Existing zombie orders need a one-shot cleanup script.
2. Lint/build/test could not run in this sandbox.
