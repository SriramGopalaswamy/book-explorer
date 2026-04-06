import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { useAuth } from "@/contexts/AuthContext";

// ─── Alert Rule Definitions ──────────────────────────────────────────────────

export type AlertFrequency = "daily" | "weekly" | "monthly" | "on_event";
export type AlertRole = "employee" | "manager" | "hr" | "finance" | "admin";
export type AlertCategory =
  | "goals"
  | "investment"
  | "payroll"
  | "attendance"
  | "leave"
  | "approvals"
  | "reimbursements"
  | "compliance"
  | "system";

export interface AlertRuleConfig {
  id: string;
  enabled: boolean;
  frequency: AlertFrequency;
  day_of_week?: number; // 0=Sun..6=Sat (for weekly)
  day_of_month?: number; // 1-28 (for monthly)
  time_of_day: string; // HH:mm 24h format
}

export interface EmailAlertSettings {
  sender_email: string;
  sender_name: string;
  reply_to_email: string;
  rules: Record<string, AlertRuleConfig>;
}

export interface AlertRuleDefinition {
  id: string;
  category: AlertCategory;
  label: string;
  description: string;
  target_roles: AlertRole[];
  default_frequency: AlertFrequency;
  supported_frequencies: AlertFrequency[];
}

// ─── Master List of All Alert Rules ──────────────────────────────────────────

export const ALERT_RULE_DEFINITIONS: AlertRuleDefinition[] = [
  // ── Goals ─────────────────────────────────────────────────────────────────
  {
    id: "goal_submission_reminder",
    category: "goals",
    label: "Goal Submission Deadline Reminder",
    description: "Remind employees to submit their goal plans before the deadline closes.",
    target_roles: ["employee"],
    default_frequency: "weekly",
    supported_frequencies: ["daily", "weekly", "on_event"],
  },
  {
    id: "goal_scoring_reminder",
    category: "goals",
    label: "Goal Scoring / Actuals Deadline Reminder",
    description: "Remind employees to enter actuals and self-scores before scoring window closes.",
    target_roles: ["employee"],
    default_frequency: "weekly",
    supported_frequencies: ["daily", "weekly", "on_event"],
  },
  {
    id: "goal_pending_manager_approval",
    category: "goals",
    label: "Pending Goal Approval (Manager)",
    description: "Notify managers about goal plans awaiting their review and approval.",
    target_roles: ["manager"],
    default_frequency: "daily",
    supported_frequencies: ["daily", "weekly", "on_event"],
  },
  {
    id: "goal_pending_hr_approval",
    category: "goals",
    label: "Pending Goal Approval (HR)",
    description: "Notify HR about goal plans awaiting final HR approval.",
    target_roles: ["hr"],
    default_frequency: "daily",
    supported_frequencies: ["daily", "weekly", "on_event"],
  },

  // ── Investment Declarations ───────────────────────────────────────────────
  {
    id: "investment_declaration_reminder",
    category: "investment",
    label: "Investment Declaration Deadline Reminder",
    description: "Remind employees to submit their investment proofs and declarations for TDS.",
    target_roles: ["employee"],
    default_frequency: "monthly",
    supported_frequencies: ["weekly", "monthly", "on_event"],
  },
  {
    id: "investment_declaration_pending_review",
    category: "investment",
    label: "Investment Declarations Pending Review",
    description: "Notify HR/Finance about investment declarations awaiting verification.",
    target_roles: ["hr", "finance"],
    default_frequency: "weekly",
    supported_frequencies: ["daily", "weekly", "on_event"],
  },

  // ── Payroll ───────────────────────────────────────────────────────────────
  {
    id: "salary_slip_available",
    category: "payroll",
    label: "Salary Slip Available",
    description: "Notify employees when their monthly payslip has been generated and is available to view.",
    target_roles: ["employee"],
    default_frequency: "on_event",
    supported_frequencies: ["on_event"],
  },
  {
    id: "payroll_processing_deadline",
    category: "payroll",
    label: "Payroll Processing Deadline Reminder",
    description: "Remind HR and Finance about upcoming payroll processing deadlines.",
    target_roles: ["hr", "finance"],
    default_frequency: "monthly",
    supported_frequencies: ["weekly", "monthly"],
  },
  {
    id: "payroll_pending_approval",
    category: "payroll",
    label: "Payroll Run Pending Approval",
    description: "Notify Finance when a payroll run is ready for final approval.",
    target_roles: ["finance"],
    default_frequency: "on_event",
    supported_frequencies: ["on_event"],
  },
  {
    id: "payslip_dispute_filed",
    category: "payroll",
    label: "Payslip Dispute Filed",
    description: "Notify HR when an employee raises a dispute on their payslip.",
    target_roles: ["hr"],
    default_frequency: "on_event",
    supported_frequencies: ["on_event"],
  },

  // ── Attendance ────────────────────────────────────────────────────────────
  {
    id: "attendance_miss_alert",
    category: "attendance",
    label: "Attendance Miss / Irregularity Alert",
    description: "Alert employees about missed punches, absent days, or attendance irregularities.",
    target_roles: ["employee"],
    default_frequency: "daily",
    supported_frequencies: ["daily", "weekly"],
  },
  {
    id: "attendance_regularization_pending",
    category: "attendance",
    label: "Attendance Regularization Requests Pending",
    description: "Notify HR about pending attendance correction/regularization requests.",
    target_roles: ["hr"],
    default_frequency: "daily",
    supported_frequencies: ["daily", "weekly", "on_event"],
  },
  {
    id: "team_attendance_summary",
    category: "attendance",
    label: "Team Attendance Summary",
    description: "Send managers a daily/weekly summary of their team's attendance.",
    target_roles: ["manager"],
    default_frequency: "daily",
    supported_frequencies: ["daily", "weekly"],
  },

  // ── Leave ─────────────────────────────────────────────────────────────────
  {
    id: "leave_request_submitted",
    category: "leave",
    label: "Leave Request Submitted",
    description: "Notify managers when an employee submits a leave request.",
    target_roles: ["manager"],
    default_frequency: "on_event",
    supported_frequencies: ["on_event"],
  },
  {
    id: "leave_request_status",
    category: "leave",
    label: "Leave Request Approved/Rejected",
    description: "Notify employees when their leave request is approved or rejected.",
    target_roles: ["employee"],
    default_frequency: "on_event",
    supported_frequencies: ["on_event"],
  },
  {
    id: "leave_balance_low",
    category: "leave",
    label: "Leave Balance Low Warning",
    description: "Warn employees when their leave balance falls below a threshold.",
    target_roles: ["employee"],
    default_frequency: "monthly",
    supported_frequencies: ["weekly", "monthly"],
  },
  {
    id: "leave_balance_reset_reminder",
    category: "leave",
    label: "Leave Balance Reset Reminder",
    description: "Remind HR before annual leave balance resets for the new cycle.",
    target_roles: ["hr"],
    default_frequency: "monthly",
    supported_frequencies: ["monthly"],
  },

  // ── Approvals ─────────────────────────────────────────────────────────────
  {
    id: "pending_approvals_digest",
    category: "approvals",
    label: "Pending Approvals Digest",
    description: "Send managers a summary of all pending items needing their approval (leaves, goals, reimbursements).",
    target_roles: ["manager"],
    default_frequency: "daily",
    supported_frequencies: ["daily", "weekly"],
  },
  {
    id: "approval_escalation",
    category: "approvals",
    label: "Approval Escalation Alert",
    description: "Escalate to HR/Admin when approvals are overdue beyond the configured threshold.",
    target_roles: ["hr", "admin"],
    default_frequency: "daily",
    supported_frequencies: ["daily", "weekly"],
  },

  // ── Reimbursements ────────────────────────────────────────────────────────
  {
    id: "reimbursement_submitted",
    category: "reimbursements",
    label: "Reimbursement Request Submitted",
    description: "Notify managers when an employee submits a reimbursement claim.",
    target_roles: ["manager"],
    default_frequency: "on_event",
    supported_frequencies: ["on_event"],
  },
  {
    id: "reimbursement_status_update",
    category: "reimbursements",
    label: "Reimbursement Status Update",
    description: "Notify employees when their reimbursement is approved, rejected, or paid.",
    target_roles: ["employee"],
    default_frequency: "on_event",
    supported_frequencies: ["on_event"],
  },
  {
    id: "reimbursement_payment_pending",
    category: "reimbursements",
    label: "Reimbursement Payments Pending",
    description: "Remind Finance about approved reimbursements awaiting payment processing.",
    target_roles: ["finance"],
    default_frequency: "weekly",
    supported_frequencies: ["daily", "weekly"],
  },

  // ── Compliance & Statutory ────────────────────────────────────────────────
  {
    id: "tds_declaration_deadline",
    category: "compliance",
    label: "TDS Declaration Deadline",
    description: "Remind Finance about upcoming TDS filing and declaration deadlines.",
    target_roles: ["finance"],
    default_frequency: "monthly",
    supported_frequencies: ["weekly", "monthly"],
  },
  {
    id: "statutory_compliance_reminder",
    category: "compliance",
    label: "Statutory Compliance Reminder",
    description: "Remind Finance/HR about PF, ESI, Professional Tax, and other statutory deadlines.",
    target_roles: ["hr", "finance"],
    default_frequency: "monthly",
    supported_frequencies: ["weekly", "monthly"],
  },
  {
    id: "employee_probation_ending",
    category: "compliance",
    label: "Employee Probation Period Ending",
    description: "Alert HR when an employee's probation period is about to end.",
    target_roles: ["hr"],
    default_frequency: "weekly",
    supported_frequencies: ["weekly", "monthly"],
  },
  {
    id: "onboarding_incomplete",
    category: "compliance",
    label: "Employee Onboarding Incomplete",
    description: "Remind HR about employees with incomplete onboarding documentation.",
    target_roles: ["hr"],
    default_frequency: "weekly",
    supported_frequencies: ["daily", "weekly"],
  },

  // ── System / Admin ────────────────────────────────────────────────────────
  {
    id: "user_pending_approval",
    category: "system",
    label: "New User Pending Approval",
    description: "Notify admin when new users sign up and need account approval.",
    target_roles: ["admin"],
    default_frequency: "on_event",
    supported_frequencies: ["on_event", "daily"],
  },
  {
    id: "system_audit_digest",
    category: "system",
    label: "System Audit Summary",
    description: "Send admin a periodic summary of system audit logs and security events.",
    target_roles: ["admin"],
    default_frequency: "weekly",
    supported_frequencies: ["daily", "weekly", "monthly"],
  },
  {
    id: "subscription_expiry_warning",
    category: "system",
    label: "Subscription Expiry Warning",
    description: "Warn admin when the organization's subscription is nearing expiry.",
    target_roles: ["admin"],
    default_frequency: "weekly",
    supported_frequencies: ["daily", "weekly", "monthly"],
  },
];

// ─── Category Metadata ──────────────────────────────────────────────────────

export const ALERT_CATEGORIES: Record<AlertCategory, { label: string; description: string }> = {
  goals: { label: "Goals & Performance", description: "Goal submission, scoring, and approval reminders" },
  investment: { label: "Investment Declarations", description: "TDS investment proof submission and review" },
  payroll: { label: "Payroll & Salary", description: "Payslip notifications, payroll deadlines, and disputes" },
  attendance: { label: "Attendance", description: "Attendance tracking, misses, and regularization" },
  leave: { label: "Leave Management", description: "Leave requests, approvals, and balance alerts" },
  approvals: { label: "Approvals", description: "Pending approval digests and escalations" },
  reimbursements: { label: "Reimbursements", description: "Expense claims, approvals, and payments" },
  compliance: { label: "Compliance & Statutory", description: "TDS, PF, ESI deadlines, probation, and onboarding" },
  system: { label: "System & Admin", description: "User approvals, audit logs, and subscription alerts" },
};

export const FREQUENCY_LABELS: Record<AlertFrequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  on_event: "On Event (Instant)",
};

export const ROLE_LABELS: Record<AlertRole, string> = {
  employee: "Employee",
  manager: "Manager",
  hr: "HR",
  finance: "Finance",
  admin: "Admin",
};

// ─── Default Settings Factory ────────────────────────────────────────────────

function buildDefaultSettings(): EmailAlertSettings {
  const rules: Record<string, AlertRuleConfig> = {};
  for (const def of ALERT_RULE_DEFINITIONS) {
    rules[def.id] = {
      id: def.id,
      enabled: true,
      frequency: def.default_frequency,
      day_of_week: 1, // Monday
      day_of_month: 1,
      time_of_day: "09:00",
    };
  }
  return {
    sender_email: "noreply@company.com",
    sender_name: "HR & Admin",
    reply_to_email: "",
    rules,
  };
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useEmailAlertConfig() {
  const { user } = useAuth();
  const { data: org } = useUserOrganization();
  const orgId = org?.organizationId;
  const queryClient = useQueryClient();

  const queryKey = ["email-alert-config", orgId];

  const { data: settings, isLoading } = useQuery({
    queryKey,
    queryFn: async (): Promise<EmailAlertSettings> => {
      if (!orgId) return buildDefaultSettings();

      const { data, error } = await supabase
        .from("organization_settings")
        .select("*")
        .eq("organization_id", orgId)
        .maybeSingle();

      if (error) throw error;

      // Read the email_alert_config JSON column
      const raw = (data as any)?.email_alert_config as Record<string, any> | null;
      if (raw && typeof raw === "object") {
        // Merge with defaults to pick up any new rules added after the config was saved
        const defaults = buildDefaultSettings();
        const validRuleIds = new Set(ALERT_RULE_DEFINITIONS.map((d) => d.id));
        const mergedRules = { ...defaults.rules };
        // Only merge saved rules that still exist in the current definitions
        if (raw.rules && typeof raw.rules === "object") {
          for (const [id, rule] of Object.entries(raw.rules)) {
            if (validRuleIds.has(id)) {
              mergedRules[id] = rule as AlertRuleConfig;
            }
          }
        }
        return {
          sender_email: raw.sender_email ?? defaults.sender_email,
          sender_name: raw.sender_name ?? defaults.sender_name,
          reply_to_email: raw.reply_to_email ?? defaults.reply_to_email,
          rules: mergedRules,
        };
      }

      return buildDefaultSettings();
    },
    enabled: !!orgId,
    staleTime: 1000 * 60 * 5,
  });

  const saveSettings = useMutation({
    mutationFn: async (newSettings: EmailAlertSettings) => {
      if (!orgId || !user) throw new Error("Missing org or user");

      const { error } = await supabase
        .from("organization_settings")
        .upsert(
          {
            organization_id: orgId,
            email_alert_config: newSettings as unknown as Json,
            updated_by: user.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "organization_id" }
        );

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    settings: settings ?? buildDefaultSettings(),
    isLoading: isLoading || !orgId,
    saveSettings,
  };
}
