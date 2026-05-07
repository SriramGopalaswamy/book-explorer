# GBC-36: Quotes — non-atomic Convert-to-Invoice ("Orphaned Invoice")

**Severity:** High · **Category:** Screen Review — Financial Suite · **Status:** needs-input

## Root cause
`convertToInvoice` mutation runs three separate Supabase calls from the browser: insert invoice → insert invoice_line_items → update quote.status='converted'. If the network drops between steps, the database lands in a half-state — invoice exists with no lines, or invoice exists but quote not marked converted (so a second click duplicates it).

## Council verdict (compressed)
- Move the conversion to a single SECURITY DEFINER RPC: `convert_quote_to_invoice(quote_id uuid)` that does INSERT invoice + INSERT lines + UPDATE quote in one transaction; idempotent via a unique constraint on `(quote_id, status='converted')` so a retry doesn't double-create.
- Reject the half-step pattern entirely.

## Status
needs-input — new RPC + hook rewrite.

## Risks
1. Migration of existing half-state quotes: write a one-shot fixup script first.
2. Idempotency requires a guard column on quotes (`converted_invoice_id`) to detect retries.
3. Lint/build/test could not run in this sandbox.
