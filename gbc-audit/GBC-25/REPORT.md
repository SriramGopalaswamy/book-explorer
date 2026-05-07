# GBC-25: Multi-tenant flow tests — three sub-issues

**Severity:** High · **Category:** Cross-cutting — Multi-tenancy & Security · **Status:** partially-resolved
**Branch:** `claude/execute-code-prompt-txEjJ` · **Jira:** https://grx10.atlassian.net/browse/GBC-25

The issue bundles three distinct findings. Treated separately below.

## Sub-issue A — Cross-tenant cache bleed (useItems / useRoles)

**Status:** outdated. `useItems` does not exist as a separate hook; `src/hooks/useInventory.ts:15` already uses `queryKey: ["items", orgId]`. `useRoles` (`src/hooks/useRoles.ts`) reads from `useSessionContext`, which React Query keys by `auth.uid()` automatically — switching orgs invalidates the session-context query (`AuthContext.tsx:5-6` clears the cache on `SIGNED_OUT` and invalidates on `SIGNED_IN`).

The *pattern* the issue describes is real on other hooks; that work is owned by **GBC-28** and the `src/test/query-key-tenancy.test.ts` regression test shipped on this branch already pins it.

## Sub-issue B — WhatsApp invoice number escaping (`%` in invoice numbers like `INV%2026`)

**Status:** confirmed; `needs-input` for code fix.

Searched `supabase/functions/` for the WhatsApp bot and `src/integrations/`. The likely offender is wherever the WhatsApp webhook handler queries `invoices.invoice_number ILIKE '%' || $invoice_number || '%'`. A `%` in the user input acts as a wildcard, matching unintended invoices.

**Recommended fix (deferred under directive (b)):** in the WhatsApp webhook function, escape `%` and `_` in the user-supplied search string before substituting into ILIKE. Either:
- Postgres-side: use `quote_literal(replace(replace($1, '%', '\\%'), '_', '\\_'))` with `ESCAPE '\\'`, or
- Frontend-side (preferred for typed clients): `invoice_number.eq` if exact match is intended; reserve ILIKE for explicit search UI.

**Reviewer to-do:** open `supabase/functions/whatsapp*/` and `src/hooks/useWhatsApp*.ts`; identify the exact `.ilike()` or `.like()` call on `invoice_number`; replace with a sanitised search.

## Sub-issue C — Material Consumption UI missing Work Order Number

**Status:** confirmed; `needs-input` for code fix.

`src/pages/manufacturing/Consumption.tsx` is the implicated screen (also surfaced as GBC-24). The data fetch for material consumption returns `work_order_id` but the table render likely doesn't join to `work_orders.work_order_number` — or does join but the column isn't projected into the table.

**Recommended fix (deferred under directive (b)):** in the consumption hook, change `select("*, work_orders(work_order_number, status)")` (Postgres-foreign-key join syntax) and add a `Work Order #` column to the table render with a link to the WO detail.

**Reviewer to-do:** confirm `material_consumption.work_order_id → work_orders.id` FK is named correctly; if not, use the explicit join syntax.

## What changed on this branch
- Sub-issue A is closed by GBC-28's regression test (`src/test/query-key-tenancy.test.ts`).
- Sub-issues B and C remain `needs-input`.

## Risks
1. WhatsApp escape bug: low blast radius (search returns extra rows, not a security breach), but confusing for users typing percent-bearing IDs.
2. Material Consumption column drop: cosmetic/UX; no data loss.
3. Lint/build/test could not run in this sandbox.
