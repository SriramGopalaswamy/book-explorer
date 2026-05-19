# GRX10 — Lovable verification prompt (post-execution)

**Companion to**: `_LOVABLE_PROMPT_2026-05-18.md`.
**Purpose**: prove the 22 tasks in the execution prompt actually landed, by re-running the 9 audit probes plus targeted sanity probes. **No new code in this pass** — verification only. If anything fails, file a follow-up Jira ticket; do not edit the test files or the prompt.

---

## Phase V0 — Repo state check

```bash
git status                              # must be clean
git log --oneline origin/main..HEAD     # list every commit Lovable produced
npm install
```

Expected: between 8 and 22 commits ahead of `main`, each commit one task from the execution prompt with the matching ticket in the message subject (`GBC-91`, `GBC-92`, etc.).

## Phase V1 — Full test suite must be green

```bash
npm run test 2>&1 | tee /tmp/v1-test-output.txt
```

**Pass criterion**: `0 failed`. Every single one of the 9 audit probes must pass. If anything fails, capture the failing test name and stop — that's a regression Lovable did not catch.

## Phase V2 — Allowlist drainage check

For each probe below, open the test file and assert the allowlist matches the expected post-execution state. Anyone, including Lovable, can pass the test by leaving allowlist entries in place — but the **stale-entry guard** in each test fails if a fix landed without removing the matching entry. So the way to verify Lovable actually shipped the work is: count the remaining allowlist entries and compare against expectation.

### V2.1 — P-8 (no frontend audit writes)
```bash
grep -c "ticket:" src/test/no-frontend-audit-writes.test.ts
```
- Pre-execution: 8
- Post-execution (after Task 3.1 lands all 8 sub-fixes): **0**
- If > 0, list the remaining entries. Each one means at least one trigger/RPC migration didn't land.

### V2.2 — P-9 (no direct financial_records writes)
```bash
grep -c "ticket:" src/test/no-direct-financial-records-writes.test.ts
```
- Pre-execution: 2 (GBC-124 + NEW-1)
- Post-execution (after Tasks 2.5): **0**
- If > 0 — depreciation RPC or manual-journal RPC didn't land.

### V2.3 — P-13 (delete preflight)
```bash
grep -c '"pages/financial' src/test/delete-preflight.test.ts
```
- Pre-execution: 6
- Post-execution (after Task 1.2): **0**
- If > 0, run `git diff origin/main -- src/pages/financial/{Vendors,VendorCredits,Quotes,CreditNotes,Expenses,Bills}.tsx | grep "Promise.all"` to spot which file didn't get the preflight pattern.

### V2.4 — P-14 (INDIAN_STATES single source)
```bash
grep -c "components\|pages\|hooks" src/test/indian-states-single-source.test.ts | head -1
```
- Pre-execution: 5 in KNOWN_DUPLICATES + lib/indian-states.ts canonical
- Post-execution (after Task 1.1): KNOWN_DUPLICATES = `[]`, **`toBeLessThanOrEqual(1)`** assertion at line ~60
- Verify the canonical lib exists: `test -f src/lib/indian-states.ts && echo OK`
- Verify every duplicate now imports: `for f in src/components/onboarding/steps/EntityIdentityStep.tsx src/hooks/useStateLeaveRules.ts src/pages/financial/EInvoices.tsx src/pages/financial/EwayBills.tsx src/pages/inventory/Warehouses.tsx; do grep -l 'from "@/lib/indian-states"' "$f" || echo "MISSING IMPORT: $f"; done`

### V2.5 — P-15 (status-flip atomicity)
```bash
grep -c '"hooks/\|"pages/' src/test/status-flip-atomicity.test.ts | head -1
```
- Pre-execution: 4 (useDocumentChains, useInvoices, useWarehouse, Bills.tsx)
- Post-execution (after Tasks 2.1-2.4): **0**
- For each remaining entry, check the relevant migration is present and the FE code calls the RPC instead:
  ```bash
  rg "rpc\(\"convert_quote_to_sales_order\""       src/hooks/useDocumentChains.ts && echo "GBC-92 wired"
  rg "rpc\(\"record_vendor_payment\""              src/pages/financial/Bills.tsx     && echo "GBC-96 vendor side wired"
  rg "rpc\(\"record_invoice_payment\""             src/hooks/useInvoices.ts          && echo "NEW-3 wired"
  rg "rpc\(\"process_stock_transfer_batch\""       src/hooks/useWarehouse.ts         && echo "GBC-113 wired"
  ```

### V2.6 — P-6 (org-scoping baseline)
```bash
jq 'length, ([.[]]|add)' src/test/org-scoping-baseline.json
```
- Pre-execution: 26 entries, 65 total
- Post-execution (after Tasks 4.1-4.2): ≤ 18 entries, ≤ 50 total (the council named ~8 specific lines to fix; the broader 18 entries may not all be wrong)
- If any entry is 0, the test would fail the zero-baseline guard — confirms Lovable forgot to remove it.

### V2.7 — P-7 (queryKey tenancy)
```bash
grep -A1 "EXPECTED_OFFENDERS = new Set<string>" src/test/query-key-tenancy.test.ts | head -8
```
- Pre-execution: 7 entries (the GBC-130 names)
- Post-execution (after Task 4.1): `new Set<string>([])` (empty), as it was before this audit cycle

### V2.8 — P-10 (`as any` ratchet)
```bash
jq '([.[]]|add), length' src/test/as-any-baseline.json
```
- Pre-execution: total 654, 109 files
- Post-execution: total **trending down** (no specific target — Task 7.1 is background work; expect ≥10% reduction if typed client landed)
- If any value > pre-baseline → regression on that file. List with `jq 'to_entries[] | select(.value > <pre>)' src/test/as-any-baseline.json` (compare to the version on `origin/main` if needed).

### V2.9 — P-12 (stock RPC shape)
```bash
rg "CREATE.*FUNCTION.*\b(process_stock_transfer_batch|post_inventory_count|create_inventory_count|accept_goods_receipt)\b" supabase/migrations/ -l
```
- Pre-execution: 0 matches (4 RPCs SKIP)
- Post-execution (after Tasks 5.4 + 2.4): 1-4 matches (each new RPC means one less SKIP in the test, and the SECURITY DEFINER + search_path check activates automatically)

## Phase V3 — Migration sanity check

```bash
ls supabase/migrations/ | grep "_gbc" | sort
ls supabase/migrations/ | grep "_kan" | sort
```

Expected new migrations (one per task; names may vary):
- `*_gbc92_convert_quote_to_sales_order.sql`
- `*_gbc96_*` (or routed through existing `record_vendor_payment`)
- `*_gbc100_apply_vendor_credit.sql`
- `*_gbc102_terminal_state_extension.sql`
- `*_gbc103_future_date_constraints.sql`
- `*_gbc104_approve_leave_request.sql`
- `*_gbc108_111_113_stock_transfer_batch.sql`
- `*_gbc117_holiday_audit_trigger.sql`
- `*_gbc123_dn_delivered_trigger.sql` (+ goods_receipts mirror)
- `*_gbc124_run_asset_depreciation.sql`
- `*_gbc125_sales_orders_customer_id_required.sql` (+ backfill)
- `*_gbc126_so_item_id_required.sql` (+ backfill)
- `*_gbc128_sales_returns_*.sql` (+ trigger)
- `*_gbc129_place_of_supply_membership.sql`
- `*_gbc131_compliance_format_constraints.sql`
- `*_gbc132_register_organization_with_admin.sql`
- (Plus trigger migrations for the GBC-114 fan-out: comp revisions, payslip disputes, payroll runs, etc.)

For each named GBC ticket in the prompt, run:
```bash
rg "GBC-NNN" supabase/migrations/ src/ --files-with-matches
```
If the only hit is in the original test file's comment, the fix didn't ship for that ticket.

## Phase V4 — Architecture invariant probes

Spot-check the rules in the prompt's "Rules of engagement" section:

```bash
# CLAUDE.md item 23 — no new direct financial_records writes
rg -nU --pcre2 'from\(["\x27`]financial_records["\x27`]\)[\s\S]{0,400}?\.(insert|update|upsert)' src/

# Every new SECURITY DEFINER fn pins search_path
rg "SECURITY DEFINER" supabase/migrations/$(ls supabase/migrations/ | tail -30 | tr '\n' '|' | sed 's/|$//') -A 5 | rg -B 1 -A 4 "SECURITY DEFINER" | rg -c "SET search_path"

# Every new tenant table has organization_id
rg "CREATE TABLE.*public\." supabase/migrations/ | tail -10
```

If any new SECURITY DEFINER function in the last 30 migrations is missing `SET search_path = public`, that's a GBC-6-class regression — escalate.

## Phase V5 — Smoke test: pick one fix per phase and prove it works

Lovable can make a test pass without making the bug truly go away. For each phase, manually verify one task end-to-end:

| Phase | Task to spot-check | How |
|---|---|---|
| 1 | GBC-129 (place of supply) | Open `Invoicing.tsx` in the dev server; create an invoice; the place-of-supply field must be a `<Select>`, not `<Input>`. Submit an invoice with a state code; check `invoices.place_of_supply` ends with the 2-letter code, not free text. |
| 2 | GBC-92 (quote → SO atomic) | Create a quote, click "Convert to Sales Order". Open browser DevTools Network tab; you should see ONE `rpc/convert_quote_to_sales_order` call, not 3+ separate POSTs. |
| 3 | GBC-114 (audit log triggers) | Submit an attendance correction; check `audit_logs` has a new row with `actor_id = auth.uid()` and `action = 'correction_submitted'`. Then open the browser console and try `await supabase.from("attendance_corrections").update(...)` directly — should fail OR not produce an audit row from the client side (the DEFINER RPC is the only audit-emitting path). |
| 4 | GBC-130 (sparkline org-scope) | Sign in as admin of OrgA; record the sparkline data. Switch to admin of OrgB (or use the impersonate flow); the sparkline data must change. If it's identical, the queryKey didn't change. |
| 5 | GBC-104 (leave race) | Create two leave requests of 2 days each as the same employee when balance is 2. Approve both in fast succession (open two tabs). Second approval must fail with "insufficient leave balance". |
| 6 | GBC-10 (optimistic locking) | Open the same purchase order in two tabs. Edit the description in tab A, save. Edit the amount in tab B, save. Tab B must show "this record was modified by someone else, refresh?" — not silently overwrite. |
| 7 | GBC-19 (typed client) | `cat src/integrations/supabase/client.ts | grep "createClient<Database>"` — must exist. `git diff origin/main -- src/integrations/supabase/database.types.ts` — must exist and have hundreds of lines. |

## Phase V6 — Report

Produce a final `verification-report-2026-05-18.md` (in `gbc-audit/`) with:

```markdown
# Wave-2 Execution Verification — 2026-05-18

## Test suite
- npm run test: <PASS|FAIL with details>
- 9 audit probes: <X of 9 PASS>

## Allowlist drainage
| Probe | Pre | Post | Delta | Expected post | Match? |
|---|---|---|---|---|---|
| P-8  | 8 | ? | ? | 0 | ✓/✗ |
| P-9  | 2 | ? | ? | 0 | ✓/✗ |
| P-13 | 6 | ? | ? | 0 | ✓/✗ |
| ...  | ... | ... | ... | ... | ✓/✗ |

## Migrations shipped
- <list each by GBC-NNN>

## Spot-checks
- <one line per V5 row: PASS/FAIL + 1-sentence evidence>

## Outstanding items
- <ticket# — what's missing>
- ...

## NEW findings during verification
- <if any>
```

Hand the report to the orchestrator. The orchestrator decides which outstanding items become follow-up Jira tickets vs which are punted to the next audit cycle.

---

## Failure modes to watch for

These are the ways Lovable can claim "completed" but actually leave the bug:

1. **Allowlist removed but the code didn't change.** Caught by the stale-entry guard (`it("every allowlist entry still has an offending pattern")` fails — meaning the entry was removed but the regex still matches).
2. **Allowlist entry stays, claims fix landed.** Caught by V2 counts — if Lovable says "fixed GBC-114" but P-8 still has 8 entries, something is off.
3. **Probe regex was loosened.** Caught by V3 architecture checks (the regex must still match the same set of known-bad patterns on `main`).
4. **Fix changed shape (e.g. wrote a trigger instead of an RPC).** Acceptable — the methodology allows either. Confirm via V3/V5.
5. **Fix posted to financial_records directly even when routing through journal_lines was specified.** Caught by V4 first probe; CLAUDE.md item 23 prohibits this.

If any of (1)-(3) happen, treat as a process-level escalation — Lovable bypassed the gate.

Good luck.
