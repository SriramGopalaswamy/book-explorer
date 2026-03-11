/**
 * Shared TypeScript types used across all MCP tools.
 */

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface PaginationArgs {
  limit?: number;
  offset?: number;
}

export interface DateRangeArgs {
  start_date?: string; // ISO 8601
  end_date?: string;   // ISO 8601
}

export type ToolResult =
  | { success: true; data: unknown }
  | { success: false; error: string };

export function ok(data: unknown): ToolResult {
  return { success: true, data };
}

export function fail(error: unknown): ToolResult {
  const msg =
    error instanceof Error ? error.message : String(error);
  return { success: false, error: msg };
}
