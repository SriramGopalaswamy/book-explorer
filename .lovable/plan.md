

# FMEA Analysis and Fix Plan for 12 Issues

## Issue Analysis (FMEA)

| # | Issue | Root Cause | Severity | Fix |
|---|-------|-----------|----------|-----|
| 1 | Invoice edit version error | Optimistic locking: update uses `.eq("version", currentVersion)` but RLS SELECT policy may block the `.select()` after update, returning 0 rows | High | Add `organization_id` scoping to the version-check update query |
| 2 | Exchange rate add error | `upsert` with `onConflict` on a composite key that likely doesn't have a unique constraint in DB, or `exchange_rates` table may not exist / missing RLS policy | High | Check table existence; switch from upsert to insert; add proper error message |
| 3 | E-way bill: cancellation reason not visible; blank columns | UI checks `(bill as any).cancel_reason` but hook stores as `cancellation_reason`. Blank "Bill #" = `eway_bill_number` is null (user never sets it); "Valid Until" = `valid_until` is null (not auto-set on creation) | Medium | Fix field name to `cancellation_reason`; auto-generate bill number and compute `valid_until` on create |
| 4 | Inventory count form fields unclear | 3 fields (item dropdown, item name text, expected qty) have no labels/explainer | Low | Add field labels/helper text above the row |
| 5 | Picking list generate error | `picking_list_items` table insert likely fails due to missing RLS or schema mismatch (e.g. `bin_id` column) | High | Investigate schema; make `bin_id` optional; verify table exists |
| 6 | Bin locations: data validity | Create form collects zone/aisle/rack/level/capacity but table shows them correctly. No warehouse name column shown in table | Low | Add warehouse name column to table; verify all input fields map to output columns |
| 7 | Stock Ledger error | `stock_ledger` table query may fail if table doesn't exist or has RLS blocking reads; also `value` and `balance_qty` columns may not exist | High | Check schema; add fallback for missing columns; improve error display |
| 8 | Sales Order: delivery note creation error | `delivery_note_items` insert may fail due to schema mismatch (`sales_order_item_id` column may not exist) or RLS | High | Verify schema columns; add proper error handling |
| 9 | PO status change error | Status dropdown shows ALL statuses (including invalid transitions like draft→received). Hook validates via `PO_TRANSITIONS` map but the UI `statusColors` map includes `ordered` which isn't in the valid transitions (`draft→submitted→approved→...`). Selecting an invalid transition throws error | High | Filter dropdown to only show valid next statuses |
| 10 | AI chat: "AI service not configured" | Edge function uses `LOVABLE_API_KEY` which IS configured. Error message in the AI chat component says "Anthropic API key" but the function uses Lovable AI gateway. The error is in the frontend catch block | Medium | Update error message; add a button linking to Connectors settings; verify edge function deployment |
| 11 | Exchange rate (duplicate of #2) | Same as #2 | High | Same fix |
| 12 | Stock Ledger blank (duplicate of #7) | Same as #7 - no data or error loading | Medium | Same fix; also show "no data" message clearly |

## Implementation Plan

### Task 1: Fix Invoice Edit Version Error
**File:** `src/hooks/useInvoices.ts` (lines 380-415)
- Add `organization_id` scoping to the version-select query (line 381-385) so it doesn't fail silently under RLS
- The `.eq("version", currentVersion)` update returns 0 rows if version was already incremented; improve error message

### Task 2: Fix Exchange Rate Creation
**File:** `src/hooks/useCurrencyAndFiling.ts` (lines 48-65)
- Change `upsert` with `onConflict` to a standard `insert` to avoid composite key constraint issues
- Add better error messages

### Task 3: Fix E-Way Bills (3 sub-issues)
**File:** `src/pages/financial/EwayBills.tsx` (line 228)
- Fix field name from `cancel_reason` to `cancellation_reason` to match the hook/schema
- Always show cancellation reason + cancelled_at for cancelled bills

**File:** `src/hooks/useEwayBills.ts` (lines 126-158)
- Auto-generate `eway_bill_number` on create (e.g., `EWB-{timestamp}`)
- Auto-calculate `valid_until` from `eway_bill_date` + validity days based on distance

### Task 4: Add Field Explainers to Inventory Count Form
**File:** `src/pages/warehouse/InventoryCounts.tsx` (lines 234-266)
- Add column headers/labels above the item rows: "Select Item", "Or Type Name", "Expected Qty"
- Add helper text: "Select from inventory or type a custom item name. Enter the expected stock quantity."

### Task 5: Fix Picking List Generation
**File:** `src/hooks/useWarehouse.ts` (lines 432-470)
- Make `bin_id` field optional in line insert (already null)
- Check if `picking_list_items` table exists; if insert fails, surface a clear error

### Task 6: Improve Bin Locations Table
**File:** `src/pages/warehouse/BinLocations.tsx`
- Add a "Warehouse" column to the table that resolves warehouse name from the ID
- Verify the `notes` field is shown in the table (currently missing)

### Task 7 & 12: Fix Stock Ledger Screen
**File:** `src/pages/inventory/StockLedger.tsx`
- Add defensive column access (fallback for `value`, `balance_qty`)
- Improve error boundary with specific message
**File:** `src/hooks/useInventory.ts` (lines 199-217)
- Add try-catch with specific error for table not found

### Task 8: Fix Delivery Note Creation from Sales Order
**File:** `src/hooks/useDocumentChains.ts` (lines 288-354)
- Add defensive handling for `sales_order_item_id` column
- Improve error message on failure

### Task 9: Fix PO Status Dropdown
**File:** `src/pages/procurement/PurchaseOrders.tsx` (lines 86-96)
- Replace unrestricted status dropdown with a filtered one that only shows valid transitions from the current status using `PO_TRANSITIONS` map
- Import and use the transition map from the hook, or define inline

### Task 10: Fix AI Chat Error Message + Add Setup Button
**File:** `src/components/ai/AIAgentChat.tsx`
- Update error catch to show clear message: "AI Agent is powered by Lovable AI. If this error persists, please try again."
- Remove misleading "Anthropic API key" reference
- The backend (`ai-agent/index.ts`) already uses `LOVABLE_API_KEY` correctly -- the error is likely a transient failure or the function not being deployed

## Summary
- 10 distinct fixes across ~10 files
- Most critical: PO status dropdown (#9), invoice version error (#1), exchange rate (#2), stock ledger (#7/12)
- Medium: E-way bill field name mismatch (#3), delivery note (#8), AI chat (#10)
- Low: inventory count labels (#4), bin locations (#6), picking list (#5)

