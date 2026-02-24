import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { toast } from "sonner";

export interface DiagnosticReport {
  file_name: string;
  extraction: {
    total_characters: number;
    first_1000_chars: string;
    last_1000_chars: string;
    line_count: number;
    first_50_lines: string[];
  };
  patterns: {
    date_count: number;
    time_count: number;
    employee_code_count: number;
    status_count: number;
    date_samples: string[];
    time_samples: string[];
  };
  fragmentation: {
    single_token_lines: number;
    numeric_only_lines: number;
    time_only_lines: number;
    avg_line_length: number;
    max_line_length: number;
    min_line_length: number;
    empty_line_count: number;
  };
  classification: {
    guess: "likely_summary" | "likely_punch" | "unknown";
    confidence_signals: string[];
  };
}

export interface DiagnosticResult {
  success: boolean;
  diagnostic_mode: boolean;
  diagnostic: DiagnosticReport;
}

export function useDiagnosticUpload() {
  const { data: org } = useUserOrganization();

  return useMutation({
    mutationFn: async ({
      textContent,
      fileData,
      fileName,
    }: {
      textContent?: string;
      fileData?: string; // base64-encoded PDF binary
      fileName: string;
    }): Promise<DiagnosticResult> => {
      const orgId = org?.organizationId;
      if (!orgId) throw new Error("Organization not found");

      const contentSize = (textContent?.length || 0) + (fileData?.length || 0);
      if (contentSize > 15_000_000) {
        throw new Error("File exceeds 10MB limit for diagnostic mode");
      }

      const body: Record<string, any> = {
        organization_id: orgId,
        file_name: fileName,
        diagnostic_mode: true,
      };
      if (fileData) {
        body.file_data = fileData;
      } else if (textContent) {
        body.text_content = textContent;
      } else {
        throw new Error("No file content provided");
      }

      const { data, error } = await supabase.functions.invoke(
        "parse-attendance",
        { body }
      );

      if (error) throw error;
      return data as DiagnosticResult;
    },
    onSuccess: () => {
      toast.success("Diagnostic analysis complete");
    },
    onError: (err: any) => {
      toast.error("Diagnostic failed: " + err.message);
    },
  });
}
