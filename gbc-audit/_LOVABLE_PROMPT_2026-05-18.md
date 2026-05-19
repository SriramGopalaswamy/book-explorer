# GRX10 — Lovable prompt: verify Wave-2 probes, then retire allowlist entries

**Branch base:** `claude/analyze-jira-issues-BdVPs` (commits `c4557c3`, `3798c1c`, `74a80fa`, `0a7f99f`).
**Goal:** (a) prove all 9 audit probes pass green; (b) work through the in-progress backlog so each fix mechanically removes a known allowlist entry; (c) keep the test suite green at every step.

---

## How this prompt works

A "council of agents" audited the 30 in-progress Jira tickets and shipped 9 static probes that **gate every bug class on every PR**. Each probe carries an `EXPECTED_OFFENDERS` allowlist or per-file ratchet baseline pointing at the known offenders. **Fixing a Jira ticket means removing its entry from the allowlist — and the test enforces that you removed it for real (stale-entry guard).**

So your loop is:
1. Pick a task below.
2. Implement the fix.
3. Delete the matching allowlist entry from the named test file (and/or the matching baseline-JSON entry).
4. Run `npm run test` — the probe goes green, the stale-entry guard does not trip.
5. Commit. Move to the next task.

**Never** add new allowlist entries. **Never** loosen a probe's regex. If a probe needs to track a new offender, you have introduced a regression and must fix it before merging.

---

## Phase 0 — Preflight (5 min)

```bash
# Ensure dependencies are up to date
npm install

# Run the full test suite — confirm baseline is green
npm run test
```

**Expected**: all 9 audit probes pass. If any fail before you've made changes, stop and report the failure; that's a real regression on `main`.

The 9 probes (added by commits `3798c1c`, `74a80fa`, `0a7f99f`):

| Probe | Test file | What it gates |
|---|---|---|
| P-6 | `src/test/org-scoping-coverage.test.ts` | `.from(<high-risk-table>)` without `organization_id` (per-file ratchet, baseline 65/26) |
| P-7 | `src/test/query-key-tenancy.test.ts` | useQuery declarations omitting `orgId` for tracked org-scoped names |
| P-8 | `src/test/no-frontend-audit-writes.test.ts` | `audit_logs.insert` from FE (allowlist of 8 files) |
| P-9 | `src/test/no-direct-financial-records-writes.test.ts` | direct `financial_records.insert/update` (allowlist of 2 files) |
| P-10 | `src/test/as-any-ratchet.test.ts` + `as-any-baseline.json` | per-file ratchet on `as any` (109 files / 654 occurrences) |
| P-12 | `src/test/stock-rpc-shape.test.ts` | stock RPCs SECURITY DEFINER + `SET search_path = public` |
| P-13 | `src/test/delete-preflight.test.ts` | page-level `deleteMutation` lacking dependency preflight (allowlist of 6 files) |
| P-14 | `src/test/indian-states-single-source.test.ts` | `INDIAN_STATES` declarations (allowlist of 5 + canonical lib) |
| P-15 | `src/test/status-flip-atomicity.test.ts` | `from(<doc>).update({status…}).then(<side-effect>)` (allowlist of 4 files) |

---

## Phase 1 — Quick wins (sprint 1)

Each task is ≤ a day and retires multiple allowlist entries.

### Task 1.1 — GBC-129 + NEW-2: collapse INDIAN_STATES → one canonical module (retires P-14)

**Background.** Wave-1 surface scan found 5 declarations of `INDIAN_STATES` (4 in council reports; 5th `EInvoices.tsx` surfaced by P-14 probe-validation). Two shapes exist (`string[]` vs `{code, name}[]`), so values can drift.

**Implementation.**
1. Create `src/lib/indian-states.ts` exporting one canonical list (28 states + 8 UTs = 36 entries):
   ```ts
   export interface IndianState { code: string; name: string; gstStateCode: string; }
   export const INDIAN_STATES: readonly IndianState[] = Object.freeze([
     { code: "AP", name: "Andhra Pradesh", gstStateCode: "37" },
     { code: "AR", name: "Arunachal Pradesh", gstStateCode: "12" },
     // … all 36, sourced from EwayBills.tsx:32 which has the most complete shape today
   ]);
   ```
2. Delete the local declarations in:
   - `src/components/onboarding/steps/EntityIdentityStep.tsx:20`
   - `src/hooks/useStateLeaveRules.ts:28`
   - `src/pages/financial/EInvoices.tsx`
   - `src/pages/financial/EwayBills.tsx:32`
   - `src/pages/inventory/Warehouses.tsx:19`

   Replace each with `import { INDIAN_STATES } from "@/lib/indian-states";`. Adapt callsites where the old shape was `string[]` (Warehouses.tsx) — switch the SelectItem to `key={s.code} value={s.code}` and display `s.name`.

3. Migration `supabase/migrations/<ts>_gbc129_place_of_supply_membership.sql`:
   ```sql
   ALTER TABLE public.invoices
     ADD CONSTRAINT chk_invoices_place_of_supply_valid
     CHECK (place_of_supply IS NULL OR place_of_supply IN (
       'AP','AR','AS','BR','CG','GA','GJ','HR','HP','JH','KA','KL','MP','MH','MN','ML',
       'MZ','NL','OD','PB','RJ','SK','TN','TG','TR','UP','UK','WB',
       'AN','CH','DL','DN','JK','LA','LD','PY'));
   ```
   Backfill existing `invoices.place_of_supply` values mapping free-text → code first; report ambiguous rows for product to resolve. Same constraint on `quotes`, `credit_notes`, `eway_bills`, `e_invoices` if those tables carry the column.

4. Replace the free-text `<Input>` at `src/pages/financial/Invoicing.tsx:710` and `:806` with a `<Select>` over `INDIAN_STATES`. Change `isInterstateSupply` at `:151-157` to compare codes, not normalized free-text.

5. **Retire P-14**: edit `src/test/indian-states-single-source.test.ts`:
   - Replace `KNOWN_DUPLICATES` array with empty `[]`.
   - Tighten the second assertion: `toBeLessThanOrEqual(1)` (only the canonical lib).

**Acceptance**: `npm run test` passes; P-14 finds only `lib/indian-states.ts`; `Invoicing.tsx` ships the dropdown.

---

### Task 1.2 — GBC-91 + 5 siblings: delete-preflight pattern (retires P-13)

**Background.** Customers.tsx has the canonical pattern. Six page-level `deleteMutation` blocks lack the preflight: Vendors, VendorCredits, Quotes, CreditNotes, Expenses, Bills.

**Implementation per file.** Mirror `src/pages/financial/Customers.tsx:132-152`. For each offender, run parallel `select("id").limit(1)` preflights against every table that holds a FK to the entity being deleted, then throw a friendly error before calling `.delete()`:

| File | Tables to preflight | Friendly error |
|---|---|---|
| `Vendors.tsx` | bills, purchase_orders, vendor_credits, vendor_payments | "Cannot delete this vendor — they have linked bills, purchase orders, vendor credits, or payments. Mark them as inactive instead." |
| `VendorCredits.tsx` | (none — child entity; just verify status != 'applied') | "Cannot delete an applied vendor credit. Void it instead." |
| `Quotes.tsx` | invoices, sales_orders (via `converted_invoice_id` / `converted_sales_order_id`) | "Cannot delete this quote — it has been converted to an invoice or sales order." |
| `CreditNotes.tsx` | journal_lines (via reference_id), payment_receipts allocations | "Cannot delete this credit note — it has been applied to an invoice or has journal entries." |
| `Expenses.tsx` | journal_lines (via reference_id), reimbursement_requests | "Cannot delete this expense — it has been reimbursed or has journal entries." |
| `Bills.tsx` | vendor_payments, journal_lines, bank_transactions (by reference) | "Cannot delete this bill — it has been paid or has journal entries." |

**Retire P-13**: edit `src/test/delete-preflight.test.ts`, remove the matching file from `EXPECTED_OFFENDERS`. The stale-entry guard will fail until the preflight pattern is actually detected in the file.

**Acceptance**: 6 PRs (or one combined) that each remove one entry; P-13 reaches empty allowlist.

---

### Task 1.3 — GBC-103: future-date CHECK constraints (no probe retire — defence in depth)

**Migration** `supabase/migrations/<ts>_gbc103_future_date_constraints.sql`:
```sql
ALTER TABLE public.payment_receipts
  ADD CONSTRAINT chk_payment_receipts_no_future_date CHECK (payment_date <= CURRENT_DATE);
ALTER TABLE public.vendor_payments
  ADD CONSTRAINT chk_vendor_payments_no_future_date CHECK (payment_date <= CURRENT_DATE);
-- Optional but recommended:
ALTER TABLE public.expenses
  ADD CONSTRAINT chk_expenses_no_future_date CHECK (expense_date IS NULL OR expense_date <= CURRENT_DATE);
ALTER TABLE public.journal_entries
  ADD CONSTRAINT chk_journal_entries_no_future_date CHECK (entry_date <= CURRENT_DATE);
```
Plus add `IF p_payment_date > CURRENT_DATE THEN RAISE EXCEPTION 'Payment date cannot be in the future' USING ERRCODE = '22008'; END IF;` to both `record_payment_receipt` and `record_vendor_payment` RPCs.

**Acceptance**: vitest assertion that a direct insert with future `payment_date` fails with the CHECK violation. Suggested filename: `src/test/payment-date-constraint.test.ts`.

---

### Task 1.4 — GBC-131: PAN/GSTIN/Pincode CHECK constraints + RPC validation

Migration `<ts>_gbc131_compliance_format_constraints.sql`:
```sql
ALTER TABLE public.organization_compliance
  ADD CONSTRAINT organization_compliance_pan_format_chk
    CHECK (pan IS NULL OR pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$'),
  ADD CONSTRAINT organization_compliance_pincode_format_chk
    CHECK (pincode IS NULL OR pincode ~ '^[1-9][0-9]{5}$');

CREATE OR REPLACE FUNCTION public.gstin_array_valid(g TEXT[])
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT g IS NULL OR NOT EXISTS (
    SELECT 1 FROM unnest(g) AS x
    WHERE x !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z][Z][0-9A-Z]$');
$$;
ALTER TABLE public.organization_compliance
  ADD CONSTRAINT organization_compliance_gstin_format_chk CHECK (public.gstin_array_valid(gstin));
```

Inside `complete_phase1_onboarding`, add explicit `RAISE EXCEPTION` checks (friendlier than constraint-violation messages). Update `src/pages/onboarding/Onboarding.tsx:49-58` to use the same regexes client-side for UX (defence-in-depth, not the only check).

---

## Phase 2 — Atomicity migrations (sprint 2)

Each task collapses a multi-step browser-driven mutation into one RPC or trigger.

### Task 2.1 — GBC-92: convert_quote_to_sales_order RPC (retires part of P-15)

Mirror the existing `convert_quote_to_invoice` RPC. New migration `<ts>_gbc92_convert_quote_to_sales_order.sql`:
```sql
CREATE OR REPLACE FUNCTION public.convert_quote_to_sales_order(p_quote_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
-- 1. SELECT … FROM quotes WHERE id = p_quote_id FOR UPDATE
-- 2. RAISE if status NOT IN ('sent','approved') or already converted
-- 3. INSERT INTO sales_orders (...) RETURNING id INTO v_so_id
-- 4. INSERT INTO sales_order_items SELECT … FROM quote_items WHERE quote_id = p_quote_id
-- 5. UPDATE quotes SET status='converted', converted_sales_order_id = v_so_id WHERE id = p_quote_id
-- 6. RETURN v_so_id
$$;
```

Also add column: `ALTER TABLE quotes ADD COLUMN converted_sales_order_id UUID REFERENCES sales_orders(id);`

Update `src/hooks/useDocumentChains.ts:35-101` (`useConvertQuoteToSO`) to:
```ts
const { data: soId, error } = await (supabase as any).rpc("convert_quote_to_sales_order", { p_quote_id: quote.id });
```
Delete the 3-step body and the "manual rollback" delete on L85-87.

**Retire status**: P-15 still flags `useDocumentChains.ts` for the other anti-patterns (GBC-123, GBC-127); update the allowlist note from `"GBC-92 (quote→SO), GBC-123 (delivery delivered), GBC-127 (partial ship)"` to drop GBC-92.

### Task 2.2 — GBC-96 + NEW-3: single-row "Mark as paid" via RPC (retires Bills.tsx from P-15)

Bills (`Bills.tsx`) and Invoices (`useInvoices.ts`) both flip `status='paid'` then call `createBankTransaction` separately. Both must route through their existing RPCs:
- **Bills**: `record_vendor_payment` already exists (used by the bulk path). Wire it into the single-row "Mark as paid" dialog (`Bills.tsx:1080` dropdown item + `:1544` dialog button). Collect `payment_method` + `bank_account_id` from the same `bulkPay` dialog shape.
- **Invoices**: create RPC `record_invoice_payment(p_invoice_id uuid, p_payment_date date, p_bank_account_id uuid, p_payment_method text) RETURNS uuid` that INSERTs `payment_receipts`, INSERTs the bank_transaction credit row, and UPDATEs `invoices.status='paid'` — all in one transaction. Replace `useInvoices.ts:317-340` body.

**Retire P-15**: remove `pages/financial/Bills.tsx` and `hooks/useInvoices.ts` from `EXPECTED_OFFENDERS` once both paths are RPC-routed.

### Task 2.3 — GBC-123: delivery_notes AFTER UPDATE trigger (retires part of P-15)

Migration `<ts>_gbc123_dn_delivered_trigger.sql`:
```sql
CREATE OR REPLACE FUNCTION public.trg_dn_on_delivered()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status = 'delivered' AND OLD.status <> 'delivered' THEN
    INSERT INTO public.stock_ledger(organization_id, item_id, warehouse_id,
      transaction_type, quantity, reference_type, reference_id, posted_by, posted_at)
    SELECT NEW.organization_id, dni.item_id, NEW.warehouse_id,
           'sale', -dni.shipped_quantity, 'delivery_note', NEW.id, auth.uid(), now()
    FROM public.delivery_note_items dni
    WHERE dni.delivery_note_id = NEW.id AND dni.item_id IS NOT NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_dn_delivered_post_stock
  AFTER UPDATE OF status ON public.delivery_notes
  FOR EACH ROW EXECUTE FUNCTION public.trg_dn_on_delivered();
```

Mirror the same shape for `goods_receipts.status='accepted'` (call it `trg_gr_on_accepted`). Then delete `postDeliveryNoteStock` / `postGoodsReceiptStock` callsites from `src/hooks/useDocumentChains.ts:413-423` and `:220-227`, and delete the error-swallowing `try/catch` on those lines.

### Task 2.4 — GBC-113 + GBC-111 + GBC-108: process_stock_transfer_batch RPC

Replace the per-line JS loop in `src/hooks/useWarehouse.ts:202-229` with a single RPC. Migration `<ts>_gbc113_111_108_stock_transfer_batch.sql`:
```sql
CREATE OR REPLACE FUNCTION public.process_stock_transfer_batch(p_transfer_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
-- 1. SELECT … FROM stock_transfers WHERE id = p_transfer_id FOR UPDATE
-- 2. FOR line IN SELECT * FROM stock_transfer_items WHERE transfer_id = p_transfer_id LOOP
--      Validate source warehouse stock: SUM(stock_ledger.quantity WHERE warehouse_id = from_warehouse) >= line.quantity
--      Validate source bin (if from_bin_id NOT NULL): SUM(stock_ledger.quantity WHERE bin_id = from_bin) >= line.quantity
--      INSERT INTO stock_ledger (..., warehouse_id=from, bin_id=from_bin, quantity=-line.qty)
--      INSERT INTO stock_ledger (..., warehouse_id=to,   bin_id=to_bin,   quantity=+line.qty)
--    END LOOP
-- 3. UPDATE stock_transfers SET status='received'
$$;
```

This single RPC closes 3 tickets: GBC-113 (browser loop → server loop), GBC-111 (company-wide → warehouse-scoped stock check), GBC-108 (bin-level transfer support).

Also: `ALTER TABLE stock_ledger ADD COLUMN IF NOT EXISTS bin_id UUID REFERENCES bin_locations(id) ON DELETE SET NULL` and add `trg_sync_bin_current_units` that maintains `bin_locations.current_units = SUM(stock_ledger.quantity WHERE bin_id = X)`. This unblocks GBC-106 (goods-receipts → bin) and GBC-109 (picking-list → bin) too.

**Retire P-15**: remove `hooks/useWarehouse.ts` from `EXPECTED_OFFENDERS`.

### Task 2.5 — GBC-124 + NEW-1: depreciation RPC routing through journal_lines (retires P-9)

The current code in `src/hooks/useAssets.ts:388-451` is a 3-step non-atomic with a "non-critical" GL skip. Replace with:

Migration `<ts>_gbc124_run_asset_depreciation.sql`:
```sql
CREATE OR REPLACE FUNCTION public.run_asset_depreciation(p_asset_id uuid, p_period_date date DEFAULT CURRENT_DATE)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
-- 1. SELECT … FROM assets WHERE id=p_asset_id FOR UPDATE
-- 2. Compute monthly depreciation (straight_line / declining_balance / double_declining / sum_of_years)
-- 3. INSERT INTO asset_depreciation_entries
-- 4. UPDATE assets SET accumulated_depreciation, current_book_value
-- 5. Resolve GL accounts: DR Depreciation Expense (52% / ILIKE), CR Accumulated Depreciation (15% / ILIKE)
-- 6. INSERT INTO journal_entries (source_type='asset_depreciation', document_sequence_number='DEP-…')
-- 7. INSERT 2 rows INTO journal_lines (debit/credit). NEVER write financial_records.
--    trg_sync_financial_records projects automatically.
-- 8. If GL accounts not resolvable: RAISE — not silent skip
$$;
```

For NEW-1: similarly route `src/hooks/useFinancialData.ts:218,283` (Accounting screen create/edit) through `journal_lines`. Create RPC `record_manual_journal(p_entry_date, p_lines jsonb)` accepting an array of `{account_id, debit, credit, description}` and validating debits == credits.

**Retire P-9**: remove both `hooks/useAssets.ts` and `hooks/useFinancialData.ts` from `EXPECTED_OFFENDERS`. The test will then prove no FE code writes `financial_records` directly.

### Task 2.6 — GBC-100: apply_vendor_credit RPC + bill_id selector

The GL trigger for vendor credits already exists. Missing pieces:
1. `VendorCredits.tsx:287-323` add a bill `<Select>` filtered by `vendor_id` and `status IN ('received','overdue','partially_paid')`.
2. Migration `<ts>_gbc100_apply_vendor_credit.sql`:
   ```sql
   CREATE OR REPLACE FUNCTION public.apply_vendor_credit(p_credit_id uuid) RETURNS void
   LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
   -- SELECT FROM vendor_credits WHERE id = p_credit_id FOR UPDATE
   -- Validate bill_id NOT NULL, status='issued', bill not terminal, credit_amount <= bill.outstanding
   -- UPDATE vendor_credits SET status='applied' (fires existing GL trigger)
   -- UPDATE bills SET amount_paid = amount_paid + credit_amount,
   --                   status = CASE WHEN paid >= total THEN 'paid' ELSE 'partially_paid' END
   --   WHERE id = bill_id
   $$;
   ```
   Guard against double-posting AP in the bill-paid GL trigger (gate by an `applied_credit_id` marker).

---

## Phase 3 — Audit-write migration (sprint 2-3)

### Task 3.1 — GBC-114: route audit_logs writes through DB triggers / DEFINER RPCs (retires P-8)

For each file in the P-8 allowlist, do one of:

| File | Strategy |
|---|---|
| `src/hooks/useLeaves.ts:16` | DB trigger already exists per GBC-16 — **delete the redundant insert**. |
| `src/hooks/useCompensationRevisions.ts:181,254` | Add `AFTER UPDATE OF status ON compensation_structures` trigger + `AFTER INSERT ON compensation_components` trigger. Delete the inserts. |
| `src/hooks/usePayslipDisputes.ts:131,313,411` | Add `AFTER INSERT/UPDATE OF status ON payslip_disputes` trigger. Delete the inserts. |
| `src/pages/hrms/MyAttendance.tsx:151`, `src/pages/hrms/ManagerInbox.tsx:557` | Convert to DEFINER RPCs `submit_attendance_correction(p_date, p_check_in, p_check_out, p_reason)` and `review_attendance_correction(p_correction_id, p_decision, p_notes)` that insert correction + audit in one transaction. |
| `src/hooks/usePayrollApproval.ts:40,116,175` | Add `AFTER UPDATE OF status ON payroll_runs` trigger emitting audit rows for {submitted, approved, locked}. Delete the inserts. |
| `src/hooks/usePayrollExports.ts:8` | Rewire to existing `record_export()` RPC (T5 already shipped). Delete the manual insert. |
| `src/hooks/usePlatformOps.ts:153` | Wrap as DEFINER RPC `log_platform_action(p_action, p_metadata)` with server-verified actor. Delete the manual insert. |

**Retire P-8**: each file gets removed from `EXPECTED_OFFENDERS` in the same PR as its trigger/RPC. The test's stale-entry guard fails if you remove an entry without removing the offending code.

---

## Phase 4 — Org-scoping fixes (sprint 3)

### Task 4.1 — GBC-130: org-scope sparkline + audit-intelligence (retires part of P-6 + P-7)

`src/hooks/useSparklineData.ts`:
- queryKey → `["dashboard-sparklines", orgId, user?.id]`
- pull `orgId` from `useUserOrganization()`
- add `.eq("organization_id", orgId)` on the financial_records select
- `enabled: !!user && !!orgId`

`src/hooks/useAuditIntelligence.ts` (6 hooks at lines 178, 197, 216, 235, 254, 273):
- queryKey gains `orgId` as second element
- each `.from("audit_*")` select adds `.eq("organization_id", orgId)`
- `enabled: !!user && !!runId && !!orgId`

`src/hooks/useEmployees.ts:146`:
- `.eq("id", p.id).eq("organization_id", orgId)` on the profile UPDATE

**Retire P-6/P-7**:
- Open `src/test/org-scoping-baseline.json`. Decrement the counts for `hooks/useSparklineData.ts` (currently 1), `hooks/useAuditIntelligence.ts` (currently 6), `hooks/useEmployees.ts` (currently 1) as you fix each access. Entries that hit 0 must be **removed** (the "baseline-zero" assertion forces this).
- Open `src/test/query-key-tenancy.test.ts`. As each named queryKey gets its `orgId` literal, **remove** the matching entry from `EXPECTED_OFFENDERS` (the stale-entry guard fails otherwise).

### Task 4.2 — GBC-115: payroll / compensation / goal-plans existence checks (retires part of P-6)

`src/hooks/useCompensation.ts:135-148`:
- Each `compensation_components` row in the INSERT array adds `organization_id: orgId`.
- `:151` rollback: `.eq("id", structure.id).eq("organization_id", orgId)`.

`src/hooks/useGoalPlans.ts:403, 481`:
- `.eq("id", planId).eq("organization_id", callerOrgId)` on the lookup `select`s.

`src/hooks/usePayroll.ts:558, 560, 622-625, 629`:
- Every `payroll_entries` / `payroll_runs` delete/select by id chains an `.eq("organization_id", callerOrgId)`.

`src/hooks/useWarehouse.ts:469` (bonus find from the council spot-check):
- `.eq("id", line.item_id).eq("organization_id", orgId)` on the `items.update`.

**Retire**: decrement baseline counts in `src/test/org-scoping-baseline.json` per fix. Remove entries when they hit 0.

---

## Phase 5 — Trigger coverage (sprint 3)

### Task 5.1 — GBC-102: enforce_terminal_state extension

Migration `<ts>_gbc102_terminal_state_extension.sql` extends the function and the re-attach loop in `20260310120000_*.sql`:
```sql
WHEN 'expenses'               THEN ARRAY['paid','cancelled','rejected']
WHEN 'reimbursement_requests' THEN ARRAY['paid','rejected','cancelled']
WHEN 'leave_requests'         THEN ARRAY['approved','rejected','cancelled']
WHEN 'credit_notes'           THEN ARRAY['applied','void']
WHEN 'vendor_credits'         THEN ARRAY['applied','void']
```
And add those 5 names to the `tables text[]` re-attach loop.

Confirm with HR product that `leave_requests.status='approved'` should be terminal (today's deletion-after-approve allowed by `20260206092002_*:121`). If not terminal, the leave fix in 5.2 must come first to provide a cancel/reverse path.

### Task 5.2 — GBC-104: approve_leave_request RPC with balance recheck

Migration `<ts>_gbc104_approve_leave_request.sql`:
```sql
CREATE OR REPLACE FUNCTION public.approve_leave_request(p_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
-- SELECT FROM leave_requests WHERE id = p_request_id FOR UPDATE
--   RAISE IF status != 'pending' OR approver = self
-- SELECT FROM leave_balances WHERE profile_id, leave_type, year = derived FOR UPDATE
--   RAISE IF (allocated_days - used_days) < requested_days
-- UPDATE leave_requests SET status='approved' (fires existing trg_leave_balance_on_status under same lock)
$$;
```
Replace `useApproveLeaveRequest` body in `src/hooks/useLeaves.ts:345-388` with `supabase.rpc("approve_leave_request", { p_request_id })`.

### Task 5.3 — GBC-117: holiday audit trigger

Migration `<ts>_gbc117_holiday_audit_trigger.sql` — see `audit-methodology.md` Phase 5; emits `INSERT/UPDATE/DELETE` rows into `audit_logs`. Confirms payroll LWP calculation invariant (a moved holiday must not silently rewrite past payroll).

### Task 5.4 — GBC-69, 106, 109, 126, 128: inventory atomicity wave

Several RPCs land together (they share the `bin_id` infrastructure from Task 2.4):
- `create_inventory_count(p_warehouse_id, p_count_date, p_notes, p_item_ids, p_bin_ids)` — derives `expected_qty` server-side from `items.current_stock`.
- `post_inventory_count(p_count_id)` — single statement INSERT into `stock_ledger` from `inventory_count_lines`. **Delete** the manual `items.current_stock` UPDATE in `useWarehouse.ts:469` (let `trg_sync_item_current_stock` own the projection).
- `accept_goods_receipt(p_gr_id)` — status flip + ledger insert + bin_id propagation.
- AFTER UPDATE trigger on `sales_returns.status='approved'` posting +ve stock_ledger rows per `sales_return_items.item_id`.
- GBC-126: replace the description-only `<Input>` in `SalesOrders.tsx:230-237` with `<Combobox>` over `useItems()`. CHECK constraint `chk_item_or_service` once backfilled.

**Retire P-12**: as each new stock RPC lands, its `it.skip(...)` flips to a green `it(...)` automatically (the test discovers them by name).

---

## Phase 6 — Master-data + concurrency (sprint 4)

### Task 6.1 — GBC-125: sales_orders.customer_id NOT NULL

Backfill migration first (see `.audit/findings-sales-hr.md`), then `ALTER TABLE sales_orders ALTER COLUMN customer_id SET NOT NULL`. Update `SalesOrders.tsx:216-220` `<SelectItem value={c.id}>{c.name}</SelectItem>` and the form state to carry `customer_id`.

### Task 6.2 — GBC-10: version column on master-data tables

Migration `<ts>_gbc10_version_master_data.sql`:
```sql
ALTER TABLE public.profiles            ADD COLUMN version INT NOT NULL DEFAULT 1;
ALTER TABLE public.inventory_items     ADD COLUMN version INT NOT NULL DEFAULT 1;
ALTER TABLE public.salary_structures   ADD COLUMN version INT NOT NULL DEFAULT 1;
ALTER TABLE public.payroll_records     ADD COLUMN version INT NOT NULL DEFAULT 1;
-- (Skip financial_records — trigger-owned per CLAUDE.md item 23.)

CREATE OR REPLACE FUNCTION public.bump_row_version() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN IF NEW IS DISTINCT FROM OLD THEN NEW.version := OLD.version + 1; END IF; RETURN NEW; END $$;
CREATE TRIGGER trg_bump_version_profiles BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();
-- (Repeat for the other 3 tables.)
```

Per-hook: every UPDATE chains `.eq("version", expected_version)`. 0-row affected → `RecordModifiedError` → refresh-and-retry UX dialog.

### Task 6.3 — GBC-132: register_organization_with_admin RPC

Migration `<ts>_gbc132_register_organization_with_admin.sql` — see `.audit/findings-security.md`. Replaces today's racey trigger chain with one transactional RPC. Drop band-aid migrations `20260418000002` and `20260418000003` once verified in staging.

---

## Phase 7 — Type discipline (background work, ratchets P-10)

### Task 7.1 — GBC-19/26: typed Supabase client

```bash
npx supabase gen types typescript --linked > src/integrations/supabase/database.types.ts
```
Then in `src/integrations/supabase/client.ts`:
```ts
import type { Database } from "./database.types";
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_KEY);
```

That alone fixes a few dozen `as any` immediately. The 654-occurrence backlog then comes down per-file. **Each fix decrements the matching baseline in `src/test/as-any-baseline.json`** — when a file hits 0, remove its key (the test's zero-baseline guard fails otherwise).

Top files to attack first (drive the open Jira tickets):
1. `src/hooks/useDocumentChains.ts` (48) — GBC-92, 123, 127
2. `src/pages/financial/Invoicing.tsx` (42) — GBC-129
3. `src/hooks/useWarehouse.ts` (40) — GBC-69, 108, 111, 113
4. `src/hooks/useReturns.ts` (32) — GBC-128
5. `src/hooks/useManufacturing.ts` (30)

### Task 7.2 — GBC-94: Banking bulk upload `as any` (depends on 7.1)

After 7.1 lands, replace the two `as any` casts in `src/pages/financial/Banking.tsx:328-336` with `type BankAccountInsert = Database["public"]["Tables"]["bank_accounts"]["Insert"]`.

---

## Phase 8 — Postflight

Once the per-task allowlist entries have all been removed:

```bash
npm run test
```

You should see:
- P-8 allowlist: 0 entries
- P-9 allowlist: 0 entries (after Task 2.5)
- P-13 allowlist: 0 entries (after Task 1.2)
- P-14 allowlist: 0 entries (after Task 1.1; canonical lib is the only definition)
- P-15 allowlist: 0 entries (after Tasks 2.1-2.4)
- P-6 baseline: ≤ 1-2 files (after Tasks 4.1-4.2)
- P-7 EXPECTED_OFFENDERS: empty set (after Task 4.1)
- P-10 baseline: per-file counts trending toward 0 (Tasks 7.1-7.2)
- P-12: 6 of 6 RPCs found and passing (after Task 5.4)

That's the deliverable: a green test run that proves every line item from the in-progress backlog landed and stays landed.

---

## Rules of engagement

1. **One Jira ticket per PR** unless tasks share a migration (e.g. Task 2.4 combines GBC-108/111/113 because they share `process_stock_transfer_batch`).
2. **Every PR removes an allowlist entry**. If you can't remove one, you haven't fixed the bug.
3. **Never** edit a probe's regex / detection logic without explicit approval. The probes are the spec.
4. **Never** add to `EXPECTED_OFFENDERS`. If you would, you've introduced a regression — fix the root cause instead.
5. **CLAUDE.md item 23**: `financial_records` rows with `journal_entry_id` are trigger-owned. Always post via `journal_lines` and let `trg_sync_financial_records` project.
6. **CLAUDE.md "Architecture Notes"**: Two payroll paths (legacy `payroll_records` + engine `payroll_entries`) — keep both working through `normalizePayslip()`.
7. **Every new SECURITY DEFINER function** must `SET search_path = public` (P-11 and the existing `security-definer-search-path.test.ts` both check this).
8. **Every new tenant-scoped table** must carry `organization_id UUID NOT NULL` + RLS policies (`P-6` baseline + the existing `tenant-isolation.test.ts` enforce this).

When in doubt, the council reports live at `.audit/findings-{inventory,accounting,security,sales-hr}.md` (gitignored — get them from the audit branch creator). The methodology lives at `.audit/audit-methodology.md`. The verification spot-check (10 of 10 CONFIRMED) lives at `.audit/verification-spotcheck.md`.

Good luck.
