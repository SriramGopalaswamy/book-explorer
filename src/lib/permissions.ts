// Central registry for all RBAC resources, actions, and default permissions.
// The `role_permissions` Supabase table stores per-org overrides;
// this file provides the fallback defaults and all shared types.

export const RESOURCES = {
  DASHBOARD: "dashboard",
  FINANCIAL: "financial",
  INVENTORY: "inventory",
  MANUFACTURING: "manufacturing",
  PROCUREMENT: "procurement",
  SALES: "sales",
  WAREHOUSE: "warehouse",
  HRMS_EMPLOYEES: "hrms_employees",
  HRMS_PAYROLL: "hrms_payroll",
  HRMS_MY_PAYSLIPS: "hrms_my_payslips",
  HRMS_ATTENDANCE: "hrms_attendance",
  HRMS_LEAVES: "hrms_leaves",
  HRMS_HOLIDAYS: "hrms_holidays",
  HRMS_ORG_CHART: "hrms_org_chart",
  HRMS_CTC_COMPONENTS: "hrms_ctc_components",
  HRMS_MANAGER_INBOX: "hrms_manager_inbox",
  HRMS_REIMBURSEMENTS: "hrms_reimbursements",
  GOALS: "goals",
  CONNECTORS: "connectors",
  AUDIT_LOG: "audit_log",
  UPLOAD_HISTORY: "upload_history",
  USER_MANAGEMENT: "user_management",
  SETTINGS: "settings",
} as const;

export type ResourceKey = (typeof RESOURCES)[keyof typeof RESOURCES];

export const ACTIONS = {
  VIEW: "can_view",
  CREATE: "can_create",
  EDIT: "can_edit",
  DELETE: "can_delete",
  EXPORT: "can_export",
} as const;

export type ActionKey = (typeof ACTIONS)[keyof typeof ACTIONS];

export interface RolePermission {
  resource: ResourceKey;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_export: boolean;
}

// Roles that always have full access and cannot be edited in the configurator
export const LOCKED_ROLES = ["admin", "super_admin"] as const;

// Configurable roles — shown in the Settings → Roles & Permissions matrix
export const CONFIGURABLE_ROLES = ["hr", "manager", "finance", "payroll", "employee"] as const;
export type ConfigurableRole = (typeof CONFIGURABLE_ROLES)[number];

export type AppRole = "admin" | "hr" | "manager" | "finance" | "payroll" | "employee" | "super_admin";

// ── Permission row shorthands ──────────────────────────────────────────────
type PermRow = Omit<RolePermission, "resource">;

const ALL: PermRow    = { can_view: true,  can_create: true,  can_edit: true,  can_delete: true,  can_export: true  };
const NONE: PermRow   = { can_view: false, can_create: false, can_edit: false, can_delete: false, can_export: false };
const V: PermRow      = { can_view: true,  can_create: false, can_edit: false, can_delete: false, can_export: false };
const VX: PermRow     = { can_view: true,  can_create: false, can_edit: false, can_delete: false, can_export: true  };
const VC: PermRow     = { can_view: true,  can_create: true,  can_edit: false, can_delete: false, can_export: false };
const VCE: PermRow    = { can_view: true,  can_create: true,  can_edit: true,  can_delete: false, can_export: false };
const VE: PermRow     = { can_view: true,  can_create: false, can_edit: true,  can_delete: false, can_export: false };
const VEX: PermRow    = { can_view: true,  can_create: false, can_edit: true,  can_delete: false, can_export: true  };
const VCEX: PermRow   = { can_view: true,  can_create: true,  can_edit: true,  can_delete: false, can_export: true  };
// HR runs payroll (create) and can view/edit/export but not delete locked runs
const HR_PAYROLL: PermRow = { can_view: true, can_create: true, can_edit: true, can_delete: false, can_export: true };

// ── Default permission matrix ──────────────────────────────────────────────
// Seeded into `role_permissions` on org creation.
// Admins can override per-org via Settings → Roles & Permissions.
export const DEFAULT_PERMISSIONS: Record<ConfigurableRole, Record<ResourceKey, PermRow>> = {
  hr: {
    dashboard:            V,
    financial:            NONE,
    inventory:            NONE,
    manufacturing:        NONE,
    procurement:          NONE,
    sales:                NONE,
    warehouse:            NONE,
    hrms_employees:       ALL,
    hrms_payroll:         HR_PAYROLL,
    hrms_my_payslips:     VX,
    hrms_attendance:      ALL,
    hrms_leaves:          ALL,
    hrms_holidays:        ALL,
    hrms_org_chart:       V,
    hrms_ctc_components:  ALL,
    hrms_manager_inbox:   V,
    hrms_reimbursements:  ALL,
    goals:                ALL,
    connectors:           NONE,
    audit_log:            NONE,
    upload_history:       NONE,
    user_management:      NONE,
    settings:             NONE,
  },

  manager: {
    dashboard:            V,
    financial:            NONE,
    inventory:            NONE,
    manufacturing:        NONE,
    procurement:          NONE,
    sales:                NONE,
    warehouse:            NONE,
    hrms_employees:       NONE,
    hrms_payroll:         NONE,
    hrms_my_payslips:     VX,
    hrms_attendance:      VE,
    hrms_leaves:          VE,
    hrms_holidays:        V,
    hrms_org_chart:       V,
    hrms_ctc_components:  NONE,
    hrms_manager_inbox:   ALL,
    hrms_reimbursements:  VE,
    goals:                ALL,
    connectors:           NONE,
    audit_log:            NONE,
    upload_history:       NONE,
    user_management:      VE, // direct reports only — server enforced
    settings:             NONE,
  },

  finance: {
    dashboard:            V,
    financial:            ALL,
    inventory:            ALL,
    manufacturing:        ALL,
    procurement:          ALL,
    sales:                ALL,
    warehouse:            ALL,
    hrms_employees:       NONE,
    hrms_payroll:         VEX, // approve + export; HR runs payroll
    hrms_my_payslips:     VX,
    hrms_attendance:      NONE,
    hrms_leaves:          NONE,
    hrms_holidays:        V,
    hrms_org_chart:       V,
    hrms_ctc_components:  V,
    hrms_manager_inbox:   NONE,
    hrms_reimbursements:  VE,
    goals:                V,
    connectors:           NONE,
    audit_log:            NONE,
    upload_history:       VX,
    user_management:      NONE,
    settings:             NONE,
  },

  payroll: {
    dashboard:            V,
    financial:            NONE,
    inventory:            NONE,
    manufacturing:        NONE,
    procurement:          NONE,
    sales:                NONE,
    warehouse:            NONE,
    hrms_employees:       NONE,
    hrms_payroll:         V, // view-only by default; admin can elevate via configurator
    hrms_my_payslips:     VX,
    hrms_attendance:      NONE,
    hrms_leaves:          NONE,
    hrms_holidays:        V,
    hrms_org_chart:       V,
    hrms_ctc_components:  NONE,
    hrms_manager_inbox:   NONE,
    hrms_reimbursements:  NONE,
    goals:                V,
    connectors:           NONE,
    audit_log:            NONE,
    upload_history:       NONE,
    user_management:      NONE,
    settings:             NONE,
  },

  employee: {
    dashboard:            V,
    financial:            NONE,
    inventory:            NONE,
    manufacturing:        NONE,
    procurement:          NONE,
    sales:                NONE,
    warehouse:            NONE,
    hrms_employees:       NONE,
    hrms_payroll:         NONE,
    hrms_my_payslips:     VX,  // own payslips, RLS-scoped
    hrms_attendance:      VE,  // own attendance, RLS-scoped
    hrms_leaves:          VC,  // own leave requests, RLS-scoped
    hrms_holidays:        V,
    hrms_org_chart:       V,
    hrms_ctc_components:  NONE,
    hrms_manager_inbox:   NONE,
    hrms_reimbursements:  VC,  // own reimbursements, RLS-scoped
    goals:                VCE, // own goals, RLS-scoped
    connectors:           NONE,
    audit_log:            NONE,
    upload_history:       NONE,
    user_management:      NONE,
    settings:             NONE,
  },
};

// ── UI labels ──────────────────────────────────────────────────────────────
export const ROLE_DISPLAY_LABELS: Record<string, string> = {
  admin:       "Admin",
  hr:          "HR",
  manager:     "Manager",
  finance:     "Finance",
  payroll:     "Payroll",
  employee:    "Employee",
  super_admin: "Super Admin",
};

export const RESOURCE_LABELS: Record<ResourceKey, string> = {
  dashboard:           "Dashboard",
  financial:           "Financial Suite",
  inventory:           "Inventory",
  manufacturing:       "Manufacturing",
  procurement:         "Procurement",
  sales:               "Sales",
  warehouse:           "Warehouse",
  hrms_employees:      "Employees (HR)",
  hrms_payroll:        "Payroll",
  hrms_my_payslips:    "My Payslips",
  hrms_attendance:     "Attendance Mgmt",
  hrms_leaves:         "Leave Management",
  hrms_holidays:       "Holidays",
  hrms_org_chart:      "Org Chart",
  hrms_ctc_components: "CTC Components",
  hrms_manager_inbox:  "Manager Inbox",
  hrms_reimbursements: "Reimbursements",
  goals:               "Goals & Performance",
  connectors:          "Connectors",
  audit_log:           "Audit Log",
  upload_history:      "Upload History",
  user_management:     "User Management",
  settings:            "Settings",
};

export const ACTION_LABELS: Record<ActionKey, string> = {
  can_view:   "View",
  can_create: "Create",
  can_edit:   "Edit",
  can_delete: "Delete",
  can_export: "Export",
};

export const RESOURCE_GROUPS: { label: string; resources: ResourceKey[] }[] = [
  {
    label: "Core",
    resources: ["dashboard", "settings"],
  },
  {
    label: "Financial & Operations",
    resources: ["financial", "inventory", "manufacturing", "procurement", "sales", "warehouse"],
  },
  {
    label: "HRMS",
    resources: [
      "hrms_employees",
      "hrms_payroll",
      "hrms_my_payslips",
      "hrms_attendance",
      "hrms_leaves",
      "hrms_holidays",
      "hrms_org_chart",
      "hrms_ctc_components",
      "hrms_manager_inbox",
      "hrms_reimbursements",
    ],
  },
  {
    label: "People & Performance",
    resources: ["goals"],
  },
  {
    label: "Administration",
    resources: ["audit_log", "upload_history", "user_management", "connectors"],
  },
];
