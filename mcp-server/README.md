# GRX10 Books — MCP Server

Model Context Protocol (MCP) server that exposes the **GRX10 Books ERP** system
as structured AI tools, enabling Claude and other LLMs to query and operate the
ERP via natural language.

---

## Module Discovery Report

| Module | Tables | Tools | Description |
|--------|--------|-------|-------------|
| **Accounting** | `journal_entries`, `ledger_entries`, `financial_records`, `fiscal_periods` | 7 | Double-entry accounting, trial balance, P&L, chart of accounts |
| **Sales** | `invoices`, `invoice_items`, `sales_orders` | 8 | GST invoicing, overdue tracking, revenue analysis |
| **Inventory** | `inventory_items`, `stock_ledger`, `warehouses`, `bin_locations` | 5 | Stock levels, low-stock alerts, stock adjustments |
| **Procurement** | `purchase_orders`, `vendors` | 3 | Purchase orders, vendor payables |
| **HR** | `profiles`, `attendance_records`, `leave_requests`, `leave_balances` | 6 | Employees, attendance, leaves, workforce stats |
| **Payroll** | `payroll_records`, `payroll_runs`, `payroll_entries` | 4 | India-compliant payroll (PF/ESI/PT/TDS), payslips |
| **Banking** | `bank_accounts`, `bank_transactions` | 4 | Accounts, transactions, cash flow |
| **GST / Tax** | `invoices`, `purchase_orders`, `statutory_filings` | 4 | GST liability, GSTR-1, ITC, statutory filings |
| **Customers** | `customers` | 3 | Customer master, outstanding, profitability |
| **Vendors** | `vendors` | 2 | Vendor master, payables |
| **Manufacturing** | `work_orders`, `bom_headers`, `bom_items` | 3 | BOM, work orders, MRP |
| **Audit** | `audit_logs` | 2 | Audit trail, activity reports |
| **Analytics** | cross-module | 2 | Executive KPIs, expense breakdown |

**Total: 53 tools across 13 ERP modules**

---

## MCP Tool Menu

### Accounting Tools
- **post_journal_entry** — Create a balanced double-entry journal entry
- **get_trial_balance** — Trial balance for any date range
- **get_ledger_entries** — Drill into any account's movements
- **get_financial_summary** — Revenue, expenses, net profit KPIs
- **get_profit_and_loss** — Full P&L statement by category
- **get_chart_of_accounts** — List all accounts by type
- **get_fiscal_periods** — Check open/closed/locked periods

### Sales Tools
- **create_invoice** — GST-compliant invoice with CGST/SGST/IGST
- **get_invoice** — Fetch a single invoice with line items
- **list_invoices** — Filter invoices by status/customer/date
- **get_overdue_invoices** — All past-due unpaid invoices
- **get_customer_outstanding** — Total receivable for a customer
- **get_sales_summary** — Revenue, GST, invoice count for a period
- **get_top_customers** — Rank customers by revenue
- **list_sales_orders** — List sales orders with filters

### Inventory Tools
- **get_inventory_levels** — Current stock for all items
- **get_low_stock_items** — Items at or below reorder level
- **get_stock_ledger** — Stock movement history for an item
- **create_stock_adjustment** — Record damage, count, correction
- **get_warehouse_summary** — Stock and value by warehouse

### Procurement Tools
- **list_purchase_orders** — POs with status and vendor filters
- **create_purchase_order** — New PO with GST calculation
- **get_vendor_outstanding** — Total payable to a vendor

### HR Tools
- **list_employees** — Org headcount with department filters
- **get_employee** — Full employee profile
- **get_attendance_summary** — Present/absent/late stats
- **get_leave_balances** — Casual, sick, earned leave quota
- **list_leave_requests** — Leave applications with status
- **get_employee_stats** — Workforce metrics and new hires

### Payroll Tools
- **get_payroll_summary** — Gross/net/deductions for a pay period
- **get_payroll_records** — Individual payroll entries
- **get_tds_liability** — TDS owed by quarter/financial year
- **get_payroll_analytics** — Payroll cost trend over months

### Banking Tools
- **get_bank_accounts** — All accounts with balances
- **get_bank_transactions** — Transaction history with filters
- **get_cashflow_analysis** — Inflows vs outflows, net position
- **record_bank_transaction** — Log a new credit or debit

### GST Tools
- **get_gst_liability** — Output GST minus ITC = net payable
- **get_gstr1_data** — GSTR-1 outward supply data for filing
- **get_statutory_filings** — GST/TDS/PF/ESI filing status
- **get_input_tax_credit_summary** — Available ITC from purchases

### Customer Tools
- **list_customers** — Customer master with GST info
- **get_customer** — Single customer details
- **get_profit_by_customer** — Rank customers by revenue contribution

### Vendor Tools
- **list_vendors** — Vendor master with payment terms
- **get_vendor** — Single vendor details

### Manufacturing Tools
- **list_work_orders** — Production orders with status
- **get_bom** — Bill of Materials for a product
- **get_material_requirements** — MRP: components needed for a plan

### Audit Tools
- **get_audit_logs** — Full audit trail with actor/entity filters
- **get_audit_summary** — Activity summary and top actors

### Analytics Tools
- **get_dashboard_kpis** — Executive KPIs for any month
- **get_expense_breakdown** — Expenses by category with percentages

---

## Quick Start

### 1. Install dependencies

```bash
cd mcp-server
npm install
```

### 2. Configure credentials

```bash
cp .env.example .env
```

Edit `.env`:

```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
DEFAULT_ORGANIZATION_ID=optional-org-uuid
```

> **Security Note**: Use the `service_role` key (not the `anon` key).
> Keep this key secret — it bypasses Row Level Security.

### 3. Run in development

```bash
npm run dev
```

### 4. Build for production

```bash
npm run build
npm start
```

---

## Claude Desktop Integration

Add to `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "grx10-books": {
      "command": "node",
      "args": ["/path/to/book-explorer/mcp-server/dist/server.js"],
      "env": {
        "SUPABASE_URL": "https://your-project-id.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "your-service-role-key",
        "DEFAULT_ORGANIZATION_ID": "your-org-uuid"
      }
    }
  }
}
```

---

## Example AI Tool Calls

### "Which customers owe the most money?"
```json
{ "tool": "get_overdue_invoices", "args": { "limit": 20 } }
{ "tool": "get_top_customers", "args": { "start_date": "2024-01-01", "end_date": "2024-12-31" } }
```

### "Why did profit fall last month?"
```json
{ "tool": "get_profit_and_loss", "args": { "start_date": "2024-02-01", "end_date": "2024-02-29" } }
{ "tool": "get_profit_and_loss", "args": { "start_date": "2024-03-01", "end_date": "2024-03-31" } }
{ "tool": "get_expense_breakdown", "args": { "start_date": "2024-03-01", "end_date": "2024-03-31" } }
```

### "Which products are low on stock?"
```json
{ "tool": "get_low_stock_items", "args": {} }
{ "tool": "get_inventory_levels", "args": { "limit": 50 } }
```

### "What GST do I owe this quarter?"
```json
{ "tool": "get_gst_liability", "args": { "start_date": "2024-01-01", "end_date": "2024-03-31" } }
{ "tool": "get_gstr1_data", "args": { "month": "2024-03" } }
```

### "What is our total payroll cost this month?"
```json
{ "tool": "get_payroll_summary", "args": { "pay_period": "2024-03" } }
{ "tool": "get_tds_liability", "args": { "financial_year": "2023-24", "quarter": 4 } }
```

### "Are we cash flow positive?"
```json
{ "tool": "get_cashflow_analysis", "args": { "start_date": "2024-01-01", "end_date": "2024-03-31" } }
{ "tool": "get_bank_accounts", "args": {} }
```

### "What is our executive dashboard?"
```json
{ "tool": "get_dashboard_kpis", "args": { "period": "2024-03" } }
```

---

## Architecture

```
mcp-server/
├── src/
│   ├── server.ts           # MCP server entry point (stdio transport)
│   ├── tool-registry.ts    # Module registry + flat tool list
│   ├── supabase-client.ts  # Shared Supabase client + logger + query helper
│   ├── types.ts            # Shared TypeScript types
│   └── tools/
│       ├── accounting.ts   # 7 tools: journal, ledger, P&L, trial balance
│       ├── sales.ts        # 8 tools: invoices, revenue, customers
│       ├── inventory.ts    # 5+3 tools: stock + procurement
│       ├── hr.ts           # 6+4 tools: employees + payroll
│       ├── banking.ts      # 4 tools: accounts, transactions, cash flow
│       ├── gst.ts          # 4 tools: GST liability, GSTR-1, ITC
│       ├── customers.ts    # 3+2 tools: customers + vendors
│       ├── manufacturing.ts # 3 tools: BOM, work orders, MRP
│       └── audit.ts        # 2+2 tools: audit + analytics
├── package.json
├── tsconfig.json
└── .env.example
```

### Design Principles

1. **Multi-tenant safe** — All queries accept `organization_id` parameter
2. **AI-first** — Tools answer business questions, not raw CRUD
3. **Structured output** — All tools return consistent `{ success, data }` shape
4. **Error handling** — Every tool catches and returns readable errors
5. **Rate limiting** — Configurable per-tool rate limiting
6. **Logging** — Structured JSON logs to stderr (stdout is reserved for MCP)
7. **Service role** — Uses Supabase service role for full data access

---

## Capability Graph

```
Accounting
├── post_journal_entry       → journal_entries
├── get_trial_balance        → ledger_entries
├── get_ledger_entries       → ledger_entries
├── get_financial_summary    → financial_records
├── get_profit_and_loss      → financial_records
├── get_chart_of_accounts    → chart_of_accounts
└── get_fiscal_periods       → fiscal_periods

Sales
├── create_invoice           → invoices + invoice_items
├── get_invoice              → invoices + invoice_items
├── list_invoices            → invoices
├── get_overdue_invoices     → invoices
├── get_customer_outstanding → invoices
├── get_sales_summary        → invoices
├── get_top_customers        → invoices
└── list_sales_orders        → sales_orders

Inventory
├── get_inventory_levels     → inventory_items
├── get_low_stock_items      → inventory_items
├── get_stock_ledger         → stock_ledger
├── create_stock_adjustment  → stock_adjustments
└── get_warehouse_summary    → warehouses + inventory_items

Procurement
├── list_purchase_orders     → purchase_orders
├── create_purchase_order    → purchase_orders
└── get_vendor_outstanding   → purchase_orders

HR
├── list_employees           → profiles
├── get_employee             → profiles
├── get_attendance_summary   → attendance_records
├── get_leave_balances       → leave_balances
├── list_leave_requests      → leave_requests
└── get_employee_stats       → profiles

Payroll
├── get_payroll_summary      → payroll_records
├── get_payroll_records      → payroll_records
├── get_tds_liability        → payroll_records
└── get_payroll_analytics    → payroll_records

Banking
├── get_bank_accounts        → bank_accounts
├── get_bank_transactions    → bank_transactions
├── get_cashflow_analysis    → bank_transactions
└── record_bank_transaction  → bank_transactions

GST
├── get_gst_liability        → invoices + purchase_orders
├── get_gstr1_data           → invoices
├── get_statutory_filings    → statutory_filings
└── get_input_tax_credit_summary → purchase_orders

Customers
├── list_customers           → customers
├── get_customer             → customers
└── get_profit_by_customer   → invoices

Vendors
├── list_vendors             → vendors
└── get_vendor               → vendors

Manufacturing
├── list_work_orders         → work_orders
├── get_bom                  → bom_headers + bom_items
└── get_material_requirements → bom_items

Audit
├── get_audit_logs           → audit_logs
└── get_audit_summary        → audit_logs

Analytics
├── get_dashboard_kpis       → invoices + financial_records + profiles
└── get_expense_breakdown    → financial_records
```
