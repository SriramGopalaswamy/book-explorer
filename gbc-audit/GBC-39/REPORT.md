# GBC-39: Reimbursements — "Chain of Death" (manual rollback)

**Severity:** High · **Category:** Screen Review — Financial Suite · **Status:** needs-input

## Root cause
"Approve & Pay" runs four sequential browser→Supabase calls with manual `if (err) { rollback(); throw }` JS. JS-driven rollback is itself non-atomic — if the rollback call also fails, you're left in the most broken possible state.

## Council verdict (compressed)
Same template as GBC-36/37/43/44. Collapse to a single SECURITY DEFINER RPC `approve_reimbursement(reimbursement_id)` that performs all four operations in a transaction. Database rollback is automatic on error.

## Status
needs-input — new RPC + hook rewrite.

## Risks
1. RLS permissions on the RPC must check the caller is finance/admin. Use SECURITY DEFINER with explicit role check inside the function.
2. Existing manual-rollback paths must be removed or they double-fire on the new RPC.
3. Lint/build/test could not run in this sandbox.
