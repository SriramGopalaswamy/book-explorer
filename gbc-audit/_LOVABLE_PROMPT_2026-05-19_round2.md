# GRX10 — Lovable prompt, Round 2 (2026-05-19)

**Companion to** `gbc-audit/_LOVABLE_PROMPT_2026-05-18.md` and `verification-report-2026-05-19.md`.

**Status**: Round-1 shipped 6 of 22 tasks (GBC-91, 92, 96+NEW-3, 103, 129+NEW-2, 131). This Round-2 prompt covers the **16 outstanding items**, re-ordered by ROI now that we know exactly what's drained.

**Mechanism is unchanged**: every fix removes its matching allowlist entry from the probe in `src/test/*.test.ts`; the stale-entry guard fails if you remove an entry without changing the code. **Never** loosen a regex, **never** add to an `EXPECTED_OFFENDERS` set.

---

## Preflight
```bash
git pull origin main
npm install
npm run test
```
Expected: all 9 audit probes pass on `main` HEAD `a6f460c`. P-13 and P-14 should show empty allowlists. P-15 shows 2 entries. P-8 and P-9 unchanged from Round 1 (8 / 2 respectively).

---

## Wave 3-A — Smallest migrations first (~half a day, batched in one PR if convenient)

These are the four lowest-effort tasks; bundling makes sense.

### Task A.1 — GBC-102: extend `enforce_terminal_state()` to 5 more tables

Migration `<ts>_gbc102_terminal_state_expansion.sql` patches the function defined at `supabase/migrations/20260310120000_*.sql:78-84`:

```sql
CREATE OR REPLACE FUNCTION public.enforce_terminal_state()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_terminal_statuses text[] := CASE TG_TABLE_NAME
    -- existing cases preserved …
    WHEN 'expenses'               THEN ARRAY['paid','cancelled','rejected']
    WHEN 'reimbursement_requests' THEN ARRAY['paid','rejected','cancelled']
    WHEN 'leave_requests'         THEN ARRAY['approved','rejected','cancelled']
    WHEN 'credit_notes'           THEN ARRAY['applied','void']
    WHEN 'vendor_credits'         THEN ARRAY['applied','void']
    ELSE ARRAY['__none__']
  END;
BEGIN
  -- existing body unchanged
END $$;
```

Add the 5 names to the `tables text[]` array in the re-attach loop so triggers actually fire.

**Confirm with HR before shipping**: marking `leave_requests.status='approved'` as terminal blocks DELETE post-approve. If product allows un-approve, ship Task 5.2 (GBC-104) first so the cancel-via-RPC path exists.

**No probe allowlist to retire** — covered by P-18 (Phase-3 DB cron), which is gated on DB approval.

### Task A.2 — GBC-117: holiday audit trigger

Migration `<ts>_gbc117_holiday_audit_trigger.sql`:
```sql
CREATE OR REPLACE FUNCTION public.log_holidays_changes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO audit_logs(actor_id, action, entity_type, entity_id, organization_id, metadata)
  VALUES (auth.uid(), TG_OP, 'holiday', COALESCE(NEW.id, OLD.id),
          COALESCE(NEW.organization_id, OLD.organization_id),
          CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD)
               WHEN TG_OP='INSERT' THEN to_jsonb(NEW)
               ELSE jsonb_build_object('before', to_jsonb(OLD), 'after', to_jsonb(NEW)) END);
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER trg_log_holidays_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.holidays
  FOR EACH ROW EXECUTE FUNCTION public.log_holidays_changes();
```

### Task A.3 — GBC-10: version columns on master-data tables

Migration `<ts>_gbc10_version_master_data.sql`:
```sql
ALTER TABLE public.profiles          ADD COLUMN version INT NOT NULL DEFAULT 1;
ALTER TABLE public.inventory_items   ADD COLUMN version INT NOT NULL DEFAULT 1;
ALTER TABLE public.salary_structures ADD COLUMN version INT NOT NULL DEFAULT 1;
ALTER TABLE public.payroll_records   ADD COLUMN version INT NOT NULL DEFAULT 1;
-- Skip financial_records per CLAUDE.md item 23 (trigger-owned).

CREATE OR REPLACE FUNCTION public.bump_row_version() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN IF NEW IS DISTINCT FROM OLD THEN NEW.version := OLD.version + 1; END IF; RETURN NEW; END $$;

CREATE TRIGGER trg_bump_version_profiles          BEFORE UPDATE ON public.profiles          FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();
CREATE TRIGGER trg_bump_version_inventory_items   BEFORE UPDATE ON public.inventory_items   FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();
CREATE TRIGGER trg_bump_version_salary_structures BEFORE UPDATE ON public.salary_structures FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();
CREATE TRIGGER trg_bump_version_payroll_records   BEFORE UPDATE ON public.payroll_records   FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();
```

Per-hook FE work is **deferred to Round 3** — schema-only here. Frontends adopt `.eq("version", expected_version)` opportunistically.

### Task A.4 — GBC-132: `register_organization_with_admin` RPC

Migration `<ts>_gbc132_register_organization_with_admin.sql` — see `_LOVABLE_PROMPT_2026-05-18.md` Task 6.3 for the full RPC body. Drop the band-aid migrations `20260418000002` and `20260418000003` only after staging confirms the new RPC works.

Frontend wiring: replace `signUp` body in `src/contexts/AuthContext.tsx:293-302` to call `register_organization_with_admin` immediately after `supabase.auth.signUp` succeeds.

---

## Wave 3-B — Atomicity wave (~2 days, retires 2 of P-15's remaining 2 entries)

### Task B.1 — GBC-123: delivery_notes AFTER UPDATE trigger (retires P-15 entry "useDocumentChains.ts")

Migration `<ts>_gbc123_dn_delivered_trigger.sql`:
```sql
CREATE OR REPLACE FUNCTION public.trg_dn_on_delivered()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status = 'delivered' AND OLD.status <> 'delivered' THEN
    INSERT INTO public.stock_ledger(organization_id, item_id, warehouse_id,
      transaction_type, quantity, reference_type, reference_id, posted_by, posted_at)
    SELECT NEW.organization_id, dni.item_id,
           COALESCE(NEW.warehouse_id, (SELECT id FROM public.warehouses WHERE organization_id=NEW.organization_id AND is_active LIMIT 1)),
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

Mirror for `goods_receipts.status='accepted'` → `trg_gr_on_accepted` (positive quantity, transaction_type='purchase').

**FE work** — delete the error-swallowing `try/catch` blocks at:
- `src/hooks/useDocumentChains.ts:413-423` (delivery delivered)
- `src/hooks/useDocumentChains.ts:220-227` (GR accepted)

Plus delete the `postDeliveryNoteStock` and `postGoodsReceiptStock` calls — the trigger owns them now.

**Retire P-15** — open `src/test/status-flip-atomicity.test.ts`, remove `"hooks/useDocumentChains.ts"` from `EXPECTED_OFFENDERS` only after both above sites are gone (still keep the entry if GBC-127 partial-ship logic remains pending).

### Task B.2 — GBC-108 + GBC-111 + GBC-113: `process_stock_transfer_batch` (retires P-15 "useWarehouse.ts")

Migration `<ts>_gbc113_108_111_stock_transfer_batch.sql`:
```sql
-- Add bin_id to stock_ledger if absent (prerequisite for bin-level tracking)
ALTER TABLE public.stock_ledger
  ADD COLUMN IF NOT EXISTS bin_id UUID REFERENCES bin_locations(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.process_stock_transfer_batch(p_transfer_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
-- 1. SELECT FROM stock_transfers WHERE id = p_transfer_id FOR UPDATE
-- 2. FOR line IN SELECT * FROM stock_transfer_items WHERE transfer_id=p_transfer_id LOOP
--      v_from_stock := SUM(stock_ledger.quantity) WHERE item=line.item_id AND warehouse=from
--      IF line.from_bin_id IS NOT NULL: v_from_bin_stock := SUM(...) WHERE bin_id=line.from_bin_id
--      IF v_from_stock < line.quantity: RAISE 'Insufficient stock in source warehouse %', from
--      IF line.from_bin_id NOT NULL AND v_from_bin_stock < line.quantity: RAISE 'Insufficient stock in source bin %', from_bin
--      INSERT INTO stock_ledger (..., warehouse_id=from, bin_id=from_bin, quantity=-line.qty)
--      INSERT INTO stock_ledger (..., warehouse_id=to,   bin_id=to_bin,   quantity=+line.qty)
--    END LOOP
-- 3. UPDATE stock_transfers SET status='received'
-- 4. RETURN jsonb_build_object('success', true, 'transfer_id', p_transfer_id, 'lines_processed', v_count)
$$;
```

Plus add `trg_sync_bin_current_units` AFTER INSERT ON stock_ledger maintaining `bin_locations.current_units = SUM(stock_ledger.quantity WHERE bin_id = X)`.

**FE work** — replace the JS loop at `src/hooks/useWarehouse.ts:202-229` with a single `rpc("process_stock_transfer_batch", { p_transfer_id: id })` call.

**Retire P-15** — remove `"hooks/useWarehouse.ts"` from `EXPECTED_OFFENDERS`.

**This unblocks Phase 5.4 inventory wave** (the bin_id infrastructure is the prerequisite for GBC-106 and GBC-109).

---

## Wave 3-C — Statutory / regulatory urgency (~2 days)

### Task C.1 — GBC-124 + NEW-1: depreciation RPC + Accounting manual-entry RPC (retires P-9 entirely)

GBC-124 — Migration `<ts>_gbc124_run_asset_depreciation.sql` per Task 2.5 of the Round-1 prompt. RPC must:
1. `SELECT FROM assets WHERE id=p_asset_id FOR UPDATE`
2. Compute monthly depreciation (replicate the 4 method cases from `useAssets.ts:349-369`)
3. INSERT into `asset_depreciation_entries`
4. UPDATE `assets.accumulated_depreciation, current_book_value`
5. Resolve GL accounts: DR Depreciation Expense (code `LIKE '52%'` OR name ILIKE `%depreciation expense%`), CR Accumulated Depreciation (code `LIKE '15%'` OR name ILIKE `%accumulated depreciation%`)
6. INSERT one row into `journal_entries` (source_type='asset_depreciation', document_sequence_number='DEP-'||asset_tag||'-'||period_date)
7. INSERT two rows into `journal_lines` — **NEVER** write `financial_records` directly. `trg_sync_financial_records` projects.
8. If GL accounts not resolvable → `RAISE EXCEPTION`. **No silent skip** — this is what's understating expense today.

NEW-1 — Migration `<ts>_new1_manual_journal_rpc.sql`. Create RPC `record_manual_journal(p_entry_date date, p_description text, p_lines jsonb) RETURNS uuid`. The RPC validates `SUM(p_lines->>'debit') = SUM(p_lines->>'credit')` and inserts into `journal_entries` + `journal_lines`. Replace `src/hooks/useFinancialData.ts:218` (`useCreateRecord`) and `:283` (`useUpdateRecord`) bodies to call this RPC instead of writing `financial_records` directly.

**Retire P-9** — open `src/test/no-direct-financial-records-writes.test.ts`, remove both entries from `EXPECTED_OFFENDERS`.

### Task C.2 — GBC-104: `approve_leave_request` RPC with balance lock

Migration `<ts>_gbc104_approve_leave_request.sql`:
```sql
CREATE OR REPLACE FUNCTION public.approve_leave_request(p_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_req      public.leave_requests%ROWTYPE;
  v_bal      public.leave_balances%ROWTYPE;
  v_year     INT;
  v_actor    UUID := auth.uid();
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;

  SELECT * INTO v_req FROM public.leave_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LEAVE_REQUEST_NOT_FOUND'; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'NOT_PENDING'; END IF;
  IF v_req.user_id = v_actor THEN RAISE EXCEPTION 'CANNOT_SELF_APPROVE'; END IF;

  v_year := EXTRACT(YEAR FROM v_req.from_date)::int;
  SELECT * INTO v_bal FROM public.leave_balances
   WHERE profile_id = v_req.profile_id AND leave_type = v_req.leave_type AND year = v_year
   FOR UPDATE;
  IF NOT FOUND OR (v_bal.allocated_days - v_bal.used_days) < v_req.days THEN
    RAISE EXCEPTION 'INSUFFICIENT_LEAVE_BALANCE: % requested, % available',
      v_req.days, COALESCE(v_bal.allocated_days - v_bal.used_days, 0);
  END IF;

  UPDATE public.leave_requests SET status = 'approved', approved_by = v_actor, approved_at = now()
   WHERE id = p_request_id;
  -- Existing trigger trg_leave_balance_on_status fires under the held FOR UPDATE lock
  -- and decrements leave_balances.used_days atomically.
END $$;
```

**FE work** — replace `useApproveLeaveRequest` body in `src/hooks/useLeaves.ts:345-388` with:
```ts
const { error } = await supabase.rpc("approve_leave_request", { p_request_id: id });
if (error) throw error;
```
Keep the attendance-sync side-effect (idempotent).

**No probe allowlist to retire** — covered by Phase-3 P-21 (leave balance arithmetic, DB cron).

---

## Wave 3-D — Audit log triage (~1 day, retires P-8 entirely)

### Task D.1 — GBC-114: route 8 audit_log writes through triggers / DEFINER RPCs

Per Task 3.1 of the Round-1 prompt. **Order matters** to ensure no audit-row gap:

1. **Deletions only** (DB trigger already exists per GBC-16):
   - `src/hooks/useLeaves.ts:16` — delete the manual insert helper. **Verify** `audit_logs` rows still appear on leave-request status change via the existing DB trigger.
   - Then remove `hooks/useLeaves.ts` from `EXPECTED_OFFENDERS` in `no-frontend-audit-writes.test.ts`.

2. **Add trigger, then delete FE write**:
   - `compensation_revisions` (`hooks/useCompensationRevisions.ts:181, 254`)
   - `payslip_disputes` (`hooks/usePayslipDisputes.ts:131, 313, 411`)
   - `payroll_runs` status (`hooks/usePayrollApproval.ts:40, 116, 175`)
   - `holidays` already covered by Task A.2
   - For each, write the trigger first (mirror the holiday-trigger shape in Task A.2), confirm it emits, then delete the FE write.

3. **Convert to DEFINER RPC**:
   - `src/pages/hrms/MyAttendance.tsx:151` → `submit_attendance_correction(p_date, p_check_in, p_check_out, p_reason)` RPC
   - `src/pages/hrms/ManagerInbox.tsx:557` → `review_attendance_correction(p_correction_id, p_decision, p_notes)` RPC
   - `src/hooks/usePlatformOps.ts:153` → `log_platform_action(p_action text, p_metadata jsonb)` RPC
   - `src/hooks/usePayrollExports.ts:8` → rewire to existing `record_export()` RPC (T5 already shipped)

**Retire P-8** — remove each entry from `EXPECTED_OFFENDERS` in the same PR that ships its trigger/RPC. Stale-entry guard requires the matching FE write be deleted.

---

## Wave 3-E — Org-scoping cleanup (~2 days)

### Task E.1 — GBC-130: useSparklineData + useAuditIntelligence + useEmployees

`src/hooks/useSparklineData.ts`:
- queryKey `:21` → `["dashboard-sparklines", orgId, user?.id]`
- pull `orgId` from `useUserOrganization()`
- add `.eq("organization_id", orgId)` to the financial_records select (line 50)
- `enabled: !!user && !!orgId`

`src/hooks/useAuditIntelligence.ts` (6 hooks at lines 178, 197, 216, 235, 254, 273):
- queryKey gains `orgId` as second element
- each `from("audit_*")` select adds `.eq("organization_id", orgId)`
- `enabled: !!user && !!runId && !!orgId`

`src/hooks/useEmployees.ts:146`:
- `.eq("id", p.id).eq("organization_id", orgId)` on the profile UPDATE

**Retire P-6 + P-7**:
- `src/test/org-scoping-baseline.json`: decrement `hooks/useSparklineData.ts` (1→0, remove entry), `hooks/useAuditIntelligence.ts` (6→0, remove entry), `hooks/useEmployees.ts` (1→0, remove entry).
- `src/test/query-key-tenancy.test.ts`: remove all 7 entries from `EXPECTED_OFFENDERS` (they're listed at lines 78-84 with file:line annotations).

### Task E.2 — GBC-115: payroll / compensation / goal-plans existence checks

Per Task 4.2 of the Round-1 prompt:
- `src/hooks/useCompensation.ts:135-148` — each component in the INSERT array adds `organization_id: orgId`; line 151 rollback chains `.eq("organization_id", orgId)`.
- `src/hooks/useGoalPlans.ts:403, 481` — `.eq("organization_id", callerOrgId)` on the lookup selects.
- `src/hooks/usePayroll.ts:558, 560, 622-625, 629` — every payroll_entries / payroll_runs delete/select by id chains `.eq("organization_id", callerOrgId)`.
- `src/hooks/useWarehouse.ts:469` (bonus from council spot-check) — `.eq("organization_id", orgId)` on the items.update.

**Retire P-6** — decrement baseline counts per fix. Remove entries when they hit 0.

---

## Wave 3-F — Master data + sales (~1 day)

### Task F.1 — GBC-125: sales_orders.customer_id NOT NULL

Per Task 6.1 of the Round-1 prompt. Backfill migration first (match `sales_orders.customer_name` to `customers.name` within the same `organization_id`), then schema migration to NOT NULL, then UI fix (`SalesOrders.tsx:216-220` `SelectItem value={c.id}` not `value={c.name}`).

### Task F.2 — GBC-128 finish: sales-return trigger restoring stock

Round-1 shipped `generate_credit_note_from_sales_return` but the trigger that posts +ve `stock_ledger` rows when a sales return is approved is missing. Add it:

Migration `<ts>_gbc128_sales_return_approved_stock_trigger.sql`:
```sql
CREATE OR REPLACE FUNCTION public.trg_sales_return_on_approved()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status <> 'approved' THEN
    INSERT INTO public.stock_ledger(organization_id, item_id, warehouse_id, transaction_type,
      quantity, reference_type, reference_id, posted_by, posted_at)
    SELECT NEW.organization_id, sri.item_id,
           COALESCE(NEW.warehouse_id, (SELECT id FROM public.warehouses
             WHERE organization_id=NEW.organization_id AND is_active LIMIT 1)),
           'return', +sri.quantity, 'sales_return', NEW.id, auth.uid(), now()
    FROM public.sales_return_items sri
    WHERE sri.sales_return_id = NEW.id AND sri.item_id IS NOT NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_sales_return_approved_post_stock
  AFTER UPDATE OF status ON public.sales_returns
  FOR EACH ROW EXECUTE FUNCTION public.trg_sales_return_on_approved();
```

### Task F.3 — GBC-126: SO line items linked to products

UI swap in `SalesOrders.tsx:230-237`: replace the free-text `<Input>` description with a `<Combobox>` over `useItems()`. On selection, copy `item_id`, `description = item.name`, `unit_price = item.selling_price`. After backfill of existing SO line items, add CHECK `chk_item_or_service CHECK (item_id IS NOT NULL OR is_service_line = true)`.

### Task F.4 — GBC-127: partial-shipped backend logic

Update `useDocumentChains.ts` delivery-note creation (around `:323-395`) to accept per-line shipped quantity. On DN→delivered, re-derive SO status: if `SUM(dn_items.shipped_quantity) < SUM(so_items.quantity)`, set SO `partially_shipped`; else `shipped`/`delivered`.

CHECK constraint: `SUM(dn_items.shipped_quantity) <= so_items.quantity` per line, enforced via trigger.

---

## Wave 3-G — Inventory atomicity wave (~3 days)

Depends on Task B.2 (bin_id infrastructure).

### Task G.1 — GBC-69: `create_inventory_count` + `post_inventory_count` RPCs

Per Task 5.4 of the Round-1 prompt:
- `create_inventory_count(p_warehouse_id, p_count_date, p_notes, p_item_ids uuid[], p_bin_ids uuid[])` — derives `expected_qty` from `items.current_stock`. Reject ghost items (`item_id IS NULL`).
- `post_inventory_count(p_count_id)` — single statement INSERT INTO stock_ledger FROM inventory_count_lines. **Delete** the manual `items.current_stock` UPDATE on `useWarehouse.ts:469`. Let `trg_sync_item_current_stock` own the projection.

CHECK after backfill: `ALTER TABLE inventory_count_lines ADD CONSTRAINT chk_real_item CHECK (item_id IS NOT NULL)`.

P-12 SKIP flips green automatically.

### Task G.2 — GBC-106 + GBC-109: bin-level posting

GBC-106 — `accept_goods_receipt(p_gr_id)` RPC: status flip + ledger insert + bin_id propagation from `goods_receipt_items.bin_id` (add column if absent).

GBC-109 — extend `confirm_pick` to read `picking_list_items.bin_id` and emit the ledger row with `bin_id` populated.

### Task G.3 — GBC-100: `apply_vendor_credit` RPC

Per Task 2.6 of the Round-1 prompt. UI: bill `<Select>` on VendorCredits dialog at `:287-323`. Migration: SECURITY DEFINER RPC that holds `SELECT FROM vendor_credits FOR UPDATE`, validates, updates both `vendor_credits.status='applied'` AND `bills.amount_paid` in one transaction.

---

## Wave 3-H — Type discipline (background, retires P-10 ratchet)

### Task H.1 — GBC-19/26: typed Supabase client (foundational)

```bash
npx supabase gen types typescript --linked > src/integrations/supabase/database.types.ts
```

Update `src/integrations/supabase/client.ts`:
```ts
import type { Database } from "./database.types";
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_KEY);
```

That alone retires ~30-50 `as any` casts. The 639-occurrence backlog comes down per-file.

**Retire P-10** — for every file that hits 0 casts, **remove its baseline entry** in `src/test/as-any-baseline.json` (zero-baseline guard fails otherwise).

### Task H.2 — GBC-94: Banking bulk upload (depends on H.1)

After H.1, replace the two `as any` casts in `src/pages/financial/Banking.tsx:328-336` with:
```ts
type BankAccountInsert = Database["public"]["Tables"]["bank_accounts"]["Insert"];
const row: BankAccountInsert = { name, bank_name, account_number, ... };
await supabase.from("bank_accounts").insert(row);
```

---

## Postflight

```bash
npm run test
```

Target state:
- P-6 baseline: ≤ 20 entries (down from 26 today)
- P-7 EXPECTED_OFFENDERS: empty (down from 7)
- P-8 allowlist: empty (down from 8)
- P-9 allowlist: empty (down from 2)
- P-10 baseline: total ~400 (down from 639; -240 from typed client + ~30 from GBC-94)
- P-12: 6 of 6 RPCs found (up from 2 of 6)
- P-13 / P-14: empty (unchanged — already drained in Round 1)
- P-15: empty (down from 2)

Generate `gbc-audit/verification-report-2026-05-NN.md` per the same template as `verification-report-2026-05-19.md`.

## Rules of engagement (unchanged from Round 1)

1. **One Jira ticket per PR** unless tasks share a migration.
2. **Every PR removes an allowlist entry** if its probe has one. The stale-entry guard enforces that the entry can only be removed when the matching code is actually gone.
3. **Never edit a probe's detection regex** without explicit approval. The probes are the spec.
4. **Never add new entries to `EXPECTED_OFFENDERS`**. If you would, you've introduced a regression — fix the root cause.
5. CLAUDE.md item 23: `financial_records` rows with `journal_entry_id` are trigger-owned. Always post via `journal_lines`.
6. Every new SECURITY DEFINER function must `SET search_path = public`.
7. Every new tenant-scoped table must carry `organization_id UUID NOT NULL` + RLS policies.
8. When in doubt, the prior council reports live at `.audit/findings-*.md` (gitignored — get from audit-branch creator).
