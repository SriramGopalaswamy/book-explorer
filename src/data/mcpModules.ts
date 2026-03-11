/**
 * Static manifest of all GRX10 Books MCP modules and tools.
 * Mirrors the tool registry in mcp-server/src/tool-registry.ts.
 * Used by the Connectors page and MCP Tool Explorer UI.
 */

export interface McpToolInfo {
  name: string;
  description: string;
}

export interface McpModuleInfo {
  id: string;
  label: string;
  description: string;
  emoji: string;
  tools: McpToolInfo[];
}

export const MCP_MODULES: McpModuleInfo[] = [
  {
    id: "accounting",
    label: "Accounting",
    emoji: "📒",
    description: "General ledger, journal entries, trial balance, chart of accounts, fiscal periods",
    tools: [
      { name: "post_journal_entry", description: "Create and post a double-entry journal entry to the GL. Validates that debits equal credits." },
      { name: "get_trial_balance", description: "Retrieve the trial balance for a given date range, showing period movements per account." },
      { name: "get_ledger_entries", description: "Fetch ledger entries for a specific account or date range." },
      { name: "get_financial_summary", description: "Get high-level financial KPIs: revenue, expenses, net profit, margin for a period." },
      { name: "get_profit_and_loss", description: "Generate a P&L statement grouped by income and expense categories." },
      { name: "get_chart_of_accounts", description: "List the full chart of accounts with codes, names, and types." },
      { name: "get_fiscal_periods", description: "List fiscal periods with status (open/closed/locked) before posting." },
    ],
  },
  {
    id: "sales",
    label: "Sales",
    emoji: "🧾",
    description: "Invoices, sales orders, revenue analysis, overdue tracking, top customers",
    tools: [
      { name: "create_invoice", description: "Create a GST-compliant invoice with CGST/SGST/IGST auto-calculation." },
      { name: "get_invoice", description: "Fetch a single invoice with all line items and GST breakdown." },
      { name: "list_invoices", description: "List invoices with optional filters for status, customer, and date range." },
      { name: "get_overdue_invoices", description: "Return all past-due invoices with days overdue and amounts." },
      { name: "get_customer_outstanding", description: "Get total outstanding balance for a specific customer." },
      { name: "get_sales_summary", description: "Monthly revenue summary with growth metrics and top revenue accounts." },
      { name: "get_top_customers", description: "Rank customers by revenue, invoice count, or outstanding balance." },
      { name: "list_sales_orders", description: "List sales orders with status and fulfillment progress." },
    ],
  },
  {
    id: "inventory",
    label: "Inventory",
    emoji: "📦",
    description: "Stock levels, item master, stock ledger, adjustments, warehouse management",
    tools: [
      { name: "get_inventory_levels", description: "Return current stock levels with low-stock flag for all or filtered items." },
      { name: "get_low_stock_items", description: "Items at or below reorder level — critical for procurement planning." },
      { name: "get_stock_ledger", description: "Full stock movement history for an item: receipts, issues, transfers, adjustments." },
      { name: "create_stock_adjustment", description: "Post a stock adjustment with reason code and impact on the ledger." },
      { name: "get_warehouse_summary", description: "Per-warehouse stock summary: item count, total value, utilisation." },
    ],
  },
  {
    id: "procurement",
    label: "Procurement",
    emoji: "🛒",
    description: "Purchase orders, vendor payments, goods receipt, procurement analytics",
    tools: [
      { name: "list_purchase_orders", description: "List purchase orders with status, vendor, and amount." },
      { name: "create_purchase_order", description: "Create a new PO with line items and send to vendor." },
      { name: "get_vendor_outstanding", description: "Total outstanding payable balance per vendor." },
    ],
  },
  {
    id: "hr",
    label: "HR",
    emoji: "👥",
    description: "Employees, attendance, leave management, workforce analytics",
    tools: [
      { name: "list_employees", description: "List all employees with role, department, and status." },
      { name: "get_employee", description: "Full profile details for a single employee including compensation and joining date." },
      { name: "get_attendance_summary", description: "Attendance statistics for a period: present, absent, late arrivals." },
      { name: "get_leave_balances", description: "Current leave balance per employee for all leave types." },
      { name: "list_leave_requests", description: "List leave requests with status, dates, and approver." },
      { name: "get_employee_stats", description: "Workforce analytics: headcount by department, avg tenure, new hire rate." },
    ],
  },
  {
    id: "payroll",
    label: "Payroll",
    emoji: "💰",
    description: "Payroll processing, payslips, TDS calculations, payroll analytics, India compliance",
    tools: [
      { name: "get_payroll_summary", description: "Monthly payroll summary: total cost, average CTC, headcount processed." },
      { name: "get_payroll_records", description: "Payslip records for employees in a pay period." },
      { name: "get_tds_liability", description: "TDS liability for the period — Section 192 deductions on salary." },
      { name: "get_payroll_analytics", description: "Payroll-to-revenue ratio, cost-per-employee trend, department spend." },
    ],
  },
  {
    id: "banking",
    label: "Banking",
    emoji: "🏦",
    description: "Bank accounts, transactions, cash flow analysis, reconciliation",
    tools: [
      { name: "get_bank_accounts", description: "List all bank accounts with current balances and account details." },
      { name: "get_bank_transactions", description: "Transaction history for a bank account with date range filter." },
      { name: "get_cashflow_analysis", description: "Cash inflow vs outflow analysis with net burn rate." },
      { name: "record_bank_transaction", description: "Record a bank credit or debit and post the GL entry." },
    ],
  },
  {
    id: "gst",
    label: "GST / Tax",
    emoji: "🏛️",
    description: "GST liability, GSTR-1, input tax credit, statutory filings, India tax compliance",
    tools: [
      { name: "get_gst_liability", description: "Net GST payable: output tax on sales minus input tax credit on purchases." },
      { name: "get_statutory_filings", description: "List of statutory filings (GSTR-1, GSTR-3B) with due dates and status." },
      { name: "get_input_tax_credit_summary", description: "Total ITC available from purchase invoices in a period." },
    ],
  },
  {
    id: "customers",
    label: "Customers",
    emoji: "🤝",
    description: "Customer master, outstanding balances, revenue by customer, profit analysis",
    tools: [
      { name: "list_customers", description: "List all customers with contact info, GSTIN, and outstanding balance." },
      { name: "get_customer", description: "Full details for a single customer including credit limit and payment history." },
      { name: "get_profit_by_customer", description: "Revenue, COGS, and gross profit margin per customer." },
    ],
  },
  {
    id: "vendors",
    label: "Vendors",
    emoji: "🚚",
    description: "Vendor master, payables, vendor analytics",
    tools: [
      { name: "list_vendors", description: "List all vendors with GSTIN, contact info, and total payable." },
      { name: "get_vendor", description: "Full vendor details including payment terms and outstanding balance." },
    ],
  },
  {
    id: "manufacturing",
    label: "Manufacturing",
    emoji: "🏭",
    description: "Work orders, bill of materials, material requirements planning",
    tools: [
      { name: "list_work_orders", description: "List manufacturing work orders with status and production progress." },
      { name: "get_bom", description: "Fetch a Bill of Materials with all component items and quantities." },
      { name: "get_material_requirements", description: "Calculate raw material required to fulfil open work orders." },
    ],
  },
  {
    id: "audit",
    label: "Audit",
    emoji: "🔍",
    description: "Audit logs, compliance reporting, activity monitoring",
    tools: [
      { name: "get_audit_logs", description: "Audit trail filtered by actor, entity, action, and date range." },
      { name: "get_audit_summary", description: "Summary of audit activity: top actors, most-changed entities." },
    ],
  },
  {
    id: "analytics",
    label: "Analytics",
    emoji: "📊",
    description: "Cross-module KPIs, dashboard metrics, expense breakdown, executive reporting",
    tools: [
      { name: "get_dashboard_kpis", description: "Top-level KPIs across Finance, HR, and Operations in one call." },
      { name: "get_expense_breakdown", description: "Expense breakdown by category, department, and period." },
    ],
  },
];

export const MCP_TOTAL_TOOLS = MCP_MODULES.reduce((s, m) => s + m.tools.length, 0);
export const MCP_VERSION = "1.0.0";
export const MCP_SERVER_NAME = "grx10-books-erp";
