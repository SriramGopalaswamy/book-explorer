/**
 * MCP Tool Registry
 *
 * Central registry for all GRX10 Books ERP tools.
 * Groups tools by ERP module and exports a flat list for server registration.
 */

import { accountingTools } from "./tools/accounting.js";
import { salesTools } from "./tools/sales.js";
import { inventoryTools, procurementTools } from "./tools/inventory.js";
import { hrTools, payrollTools } from "./tools/hr.js";
import { bankingTools } from "./tools/banking.js";
import { gstTools } from "./tools/gst.js";
import { customerTools, vendorTools } from "./tools/customers.js";
import { manufacturingTools } from "./tools/manufacturing.js";
import { auditTools, analyticsTools } from "./tools/audit.js";
import { McpTool } from "./types.js";

// ═══════════════════════════════════════════════════════════════════════════
//  MODULE REGISTRY
//  Organises tools by ERP module for documentation and discovery.
// ═══════════════════════════════════════════════════════════════════════════

export const MODULE_REGISTRY: Record<string, { description: string; tools: McpTool[] }> = {
  accounting: {
    description: "General ledger, journal entries, trial balance, chart of accounts, fiscal periods",
    tools: accountingTools,
  },
  sales: {
    description: "Invoices, sales orders, revenue analysis, overdue tracking, top customers",
    tools: salesTools,
  },
  inventory: {
    description: "Stock levels, item master, stock ledger, adjustments, warehouse management",
    tools: inventoryTools,
  },
  procurement: {
    description: "Purchase orders, vendor payments, goods receipt, procurement analytics",
    tools: procurementTools,
  },
  hr: {
    description: "Employees, attendance, leave management, workforce analytics",
    tools: hrTools,
  },
  payroll: {
    description: "Payroll processing, payslips, TDS calculations, payroll analytics, India compliance",
    tools: payrollTools,
  },
  banking: {
    description: "Bank accounts, transactions, cash flow analysis, reconciliation",
    tools: bankingTools,
  },
  gst: {
    description: "GST liability, GSTR-1, input tax credit, statutory filings, India tax compliance",
    tools: gstTools,
  },
  customers: {
    description: "Customer master, outstanding balances, revenue by customer, profit analysis",
    tools: customerTools,
  },
  vendors: {
    description: "Vendor master, payables, vendor analytics",
    tools: vendorTools,
  },
  manufacturing: {
    description: "Work orders, bill of materials, material requirements planning",
    tools: manufacturingTools,
  },
  audit: {
    description: "Audit logs, compliance reporting, activity monitoring",
    tools: auditTools,
  },
  analytics: {
    description: "Cross-module KPIs, dashboard metrics, expense breakdown, executive reporting",
    tools: analyticsTools,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
//  FLAT TOOL LIST
//  All tools registered in the MCP server.
// ═══════════════════════════════════════════════════════════════════════════

export const ALL_TOOLS: McpTool[] = Object.values(MODULE_REGISTRY).flatMap(
  (module) => module.tools
);

// ═══════════════════════════════════════════════════════════════════════════
//  TOOL LOOKUP MAP
// ═══════════════════════════════════════════════════════════════════════════

export const TOOL_MAP: Map<string, McpTool> = new Map(
  ALL_TOOLS.map((tool) => [tool.name, tool])
);

// ═══════════════════════════════════════════════════════════════════════════
//  MCP MENU (for documentation / discovery)
// ═══════════════════════════════════════════════════════════════════════════

export function getMcpMenu(): string {
  const lines: string[] = ["# GRX10 Books MCP Tool Menu", ""];

  for (const [moduleName, { description, tools }] of Object.entries(MODULE_REGISTRY)) {
    lines.push(`## ${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)} Tools`);
    lines.push(`_${description}_`);
    lines.push("");
    for (const tool of tools) {
      lines.push(`- **${tool.name}**: ${tool.description.split(".")[0]}`);
    }
    lines.push("");
  }

  lines.push(`---`);
  lines.push(`Total: **${ALL_TOOLS.length} tools** across **${Object.keys(MODULE_REGISTRY).length} modules**`);

  return lines.join("\n");
}
