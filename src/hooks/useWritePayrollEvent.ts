import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { useCurrentRole } from "@/hooks/useRoles";

export type PayrollEventType =
  | "salary_created"
  | "salary_revised"
  | "payroll_run_started"
  | "payroll_run_approved"
  | "payroll_run_locked"
  | "payroll_run_unlocked"
  | "lop_adjusted"
  | "bulk_upload_applied"
  | "payslip_disputed"
  | "dispute_resolved"
  | "statutory_deduction_changed";

export interface WritePayrollEventArgs {
  eventType: PayrollEventType;
  employeeId?: string;
  payrollRunId?: string;
  entryId?: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  reason?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Append-only writer for `payroll_events`. Event writes are fire-and-forget:
 * the helper resolves to void and logs any failure rather than throwing, so
 * an audit-log outage cannot block the underlying business mutation.
 */
export function useWritePayrollEvent() {
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  const { data: actorRole } = useCurrentRole();

  const writeEvent = useCallback(
    async (args: WritePayrollEventArgs): Promise<void> => {
      const orgId = orgData?.organizationId;
      if (!orgId || !user) {
        console.warn("useWritePayrollEvent: missing org/user context", args.eventType);
        return;
      }

      const { error } = await (supabase.from("payroll_events") as any).insert({
        organization_id: orgId,
        event_type: args.eventType,
        employee_id: args.employeeId,
        payroll_run_id: args.payrollRunId,
        entry_id: args.entryId,
        actor_id: user.id,
        actor_role: actorRole ?? "employee",
        before_state: args.beforeState,
        after_state: args.afterState,
        reason: args.reason,
      });

      if (error) {
        console.error("payroll_events insert failed", args.eventType, error);
      }
    },
    [user, orgData, actorRole]
  );

  return { writeEvent };
}
