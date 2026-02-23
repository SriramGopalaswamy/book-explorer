import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLogPlatformAction } from "@/hooks/useSuperAdmin";
import { toast } from "sonner";

export interface FinancialOSCalibration {
  monthly_revenue_range: string;
  avg_ticket_size: number;
  employee_count: number;
  revenue_model: string;
}

export interface FinancialOSResult {
  success: boolean;
  org_id: string;
  org_name: string;
  new_state: string;
  coa_seeded: number;
  tax_ledgers: number;
  financial_year_created: boolean;
  approval_workflow_created: boolean;
  snapshot_version: number;
  integrity_audit: IntegrityAuditResult;
}

export interface IntegrityAuditResult {
  integrity_score: number;
  fk_ok: boolean;
  rls_ok: boolean;
  audit_ok: boolean;
  transaction_count: number;
  safe_reset: boolean;
  missing_fk_count: number;
  missing_rls_count: number;
  org_id: string;
}

/**
 * Run the server-side integrity audit for a given organization.
 */
export function useIntegrityAudit(orgId: string | null) {
  return useQuery({
    queryKey: ["integrity-audit", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await supabase.rpc("run_integrity_audit", {
        _org_id: orgId,
      });
      if (error) throw error;
      return data as unknown as IntegrityAuditResult;
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });
}

/**
 * Controlled reinitialization of an organization.
 */
export function useControlledReinitialize() {
  const queryClient = useQueryClient();
  const logAction = useLogPlatformAction();

  return useMutation({
    mutationFn: async (params: { orgId: string; orgName: string }) => {
      const { data, error } = await supabase.rpc("controlled_org_reinitialize", {
        _org_id: params.orgId,
      });
      if (error) throw error;
      return data as unknown as {
        success: boolean;
        total_rows_deleted: number;
        new_state: string;
      };
    },
    onSuccess: async (result, params) => {
      await logAction.mutateAsync({
        action: "controlled_reinitialization",
        target_type: "organization",
        target_id: params.orgId,
        target_name: params.orgName,
        metadata: {
          total_rows_deleted: result.total_rows_deleted,
          new_state: result.new_state,
        },
      });
      queryClient.invalidateQueries({ queryKey: ["integrity-audit", params.orgId] });
      queryClient.invalidateQueries({ queryKey: ["platform-organizations"] });
      queryClient.invalidateQueries({ queryKey: ["platform-org-detail", params.orgId] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}

/**
 * Fetch a single organization detail.
 */
export function useOrgDetail(orgId: string | null) {
  return useQuery({
    queryKey: ["platform-org-detail", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", orgId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });
}

/**
 * Override org_state with audit logging.
 */
export function useOrgStateOverride() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const logAction = useLogPlatformAction();

  return useMutation({
    mutationFn: async (params: {
      orgId: string;
      orgName: string;
      previousState: string;
      newState: string;
      reason: string;
    }) => {
      const { error } = await supabase
        .from("organizations")
        .update({ org_state: params.newState })
        .eq("id", params.orgId);
      if (error) throw error;

      // Log to audit_logs
      const { error: auditError } = await supabase.from("audit_logs").insert([
        {
          actor_id: user!.id,
          organization_id: params.orgId,
          action: "ORG_STATE_OVERRIDE",
          entity_type: "organization",
          entity_id: params.orgId,
          actor_role: "super_admin",
          metadata: {
            previous_state: params.previousState,
            new_state: params.newState,
            reason: params.reason,
          } as any,
        },
      ]);
      if (auditError) console.error("Audit log failed:", auditError);
    },
    onSuccess: async (_, params) => {
      await logAction.mutateAsync({
        action: "org_state_override",
        target_type: "organization",
        target_id: params.orgId,
        target_name: params.orgName,
        metadata: {
          previous_state: params.previousState,
          new_state: params.newState,
          reason: params.reason,
        },
      });
      queryClient.invalidateQueries({ queryKey: ["platform-org-detail", params.orgId] });
      queryClient.invalidateQueries({ queryKey: ["platform-organizations"] });
      toast.success(`Lifecycle state updated to "${params.newState}"`);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}

/**
 * Initialize Financial Operating System for an organization.
 */
export function useInitializeFinancialOS() {
  const queryClient = useQueryClient();
  const logAction = useLogPlatformAction();

  return useMutation({
    mutationFn: async (params: {
      orgId: string;
      orgName: string;
      calibration: FinancialOSCalibration;
    }) => {
      const { data, error } = await supabase.rpc("initialize_financial_os", {
        _org_id: params.orgId,
        _calibration: params.calibration as any,
      });
      if (error) throw error;
      return data as unknown as FinancialOSResult;
    },
    onSuccess: async (result, params) => {
      await logAction.mutateAsync({
        action: "financial_os_initialized",
        target_type: "organization",
        target_id: params.orgId,
        target_name: params.orgName,
        metadata: {
          coa_seeded: result.coa_seeded,
          tax_ledgers: result.tax_ledgers,
          snapshot_version: result.snapshot_version,
          new_state: result.new_state,
        },
      });
      queryClient.invalidateQueries({ queryKey: ["integrity-audit", params.orgId] });
      queryClient.invalidateQueries({ queryKey: ["platform-organizations"] });
      queryClient.invalidateQueries({ queryKey: ["platform-org-detail", params.orgId] });
      toast.success("Financial Operating System initialized successfully.");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}
