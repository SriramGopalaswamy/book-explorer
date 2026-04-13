import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface EmployeeDetails {
  id: string;
  profile_id: string;
  organization_id: string;
  date_of_birth: string | null;
  gender: string | null;
  blood_group: string | null;
  marital_status: string | null;
  nationality: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country: string | null;
  emergency_contact_name: string | null;
  emergency_contact_relation: string | null;
  emergency_contact_phone: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  bank_branch: string | null;
  employee_id_number: string | null;
  pan_number: string | null;
  aadhaar_last_four: string | null;
  uan_number: string | null;
  esi_number: string | null;
}

export type EmployeeDetailsInput = Omit<EmployeeDetails, "id" | "organization_id">;

export function useEmployeeDetails(profileId: string | null) {
  return useQuery({
    queryKey: ["employee-details", profileId],
    queryFn: async () => {
      if (!profileId) return null;
      const { data, error } = await supabase
        .from("employee_details")
        .select("*")
        .eq("profile_id", profileId)
        .maybeSingle();
      if (error) throw error;
      return data as EmployeeDetails | null;
    },
    enabled: !!profileId,
  });
}

export function useUpsertEmployeeDetails() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (input: EmployeeDetailsInput) => {
      if (!user) throw new Error("Not authenticated");
      if (!input.profile_id) throw new Error("Profile ID is required");

      // Validate UAN if provided — allow "Opted out" sentinel for non-EPF employees
      if (input.uan_number && input.uan_number !== "Opted out" && !/^\d{12}$/.test(input.uan_number)) {
        throw new Error("UAN must be exactly 12 digits (or leave blank / enter \"Opted out\" for non-EPF employees)");
      }
      // Validate ESI number if provided
      if (input.esi_number && !/^\d{17}$/.test(input.esi_number)) {
        throw new Error("ESI number must be exactly 17 digits");
      }
      // Validate IFSC if provided
      if (input.bank_ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(input.bank_ifsc)) {
        throw new Error("Invalid IFSC format (expected: ABCD0123456)");
      }
      // Validate Aadhaar last four
      if (input.aadhaar_last_four && !/^\d{4}$/.test(input.aadhaar_last_four)) {
        throw new Error("Aadhaar last four must be exactly 4 digits");
      }

      const { data, error } = await supabase
        .from("employee_details")
        .upsert(input, { onConflict: "profile_id" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["employee-details", variables.profile_id] });
      toast.success("Employee details saved");
    },
    onError: (err: any) => {
      toast.error("Failed to save: " + err.message);
    },
  });
}
