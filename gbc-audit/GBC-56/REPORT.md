# GBC-56: Warehouse — no UI to change Default warehouse

**Severity:** Low · **Category:** Screen Review — Inventory · **Status:** partially-resolved
**Branch:** `claude/execute-code-prompt-txEjJ`

## Resolution
`src/hooks/useInventory.ts` — added `useSetDefaultWarehouse(id)` mutation hook. It clears any existing `is_default=true` row in the org, then sets `is_default=true` on the target row (RLS scopes both updates to caller's org). Invalidates `["warehouses"]` on success.

UI wiring (a "Set as Default" menu item per row in the Warehouse table) remains `needs-input` — the screen author should add a `DropdownMenuItem` that calls `useSetDefaultWarehouse().mutate(row.id)`. Two-line UI change.

## Root cause
`warehouses.is_default` exists in the schema; the UI displays a "Default" badge but has no "Set as Default" action. Operations team can't change primary warehouse without DBA intervention.

## Council verdict (compressed)
- Add "Set as Default" menu item to each warehouse row.
- Mutation should atomically `UPDATE warehouses SET is_default = (id = $1) WHERE organization_id = $2` so only one default exists at a time.
- Confirmation dialog ("Set XYZ as your default warehouse? Future shipments will originate here.") to reduce accidental clicks.

## Status
needs-input — UI change + single-statement mutation. Trivial.

## Risks
1. Existing flows that read `is_default` need to refetch after the change; pair with a queryKey invalidation.
2. Lint/build/test could not run in this sandbox.
