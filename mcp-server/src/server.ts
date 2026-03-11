#!/usr/bin/env node
/**
 * GRX10 Books MCP Server
 *
 * Production-ready Model Context Protocol server that exposes the GRX10 Books
 * ERP system capabilities as structured AI tools.
 *
 * Transport: stdio (for Claude Desktop, Cursor, and other MCP clients)
 *
 * Usage:
 *   node dist/server.js
 *   # or in development:
 *   npx tsx src/server.ts
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { ALL_TOOLS, TOOL_MAP, getMcpMenu } from "./tool-registry.js";
import { logger } from "./supabase-client.js";

// ── Rate limiting ──────────────────────────────────────────────────────────

const RATE_LIMIT = parseInt(process.env.RATE_LIMIT_REQUESTS_PER_MINUTE ?? "60", 10);
const requestCounts = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(toolName: string): void {
  const now = Date.now();
  const window = 60_000; // 1 minute
  const existing = requestCounts.get(toolName);

  if (!existing || now - existing.windowStart > window) {
    requestCounts.set(toolName, { count: 1, windowStart: now });
    return;
  }

  if (existing.count >= RATE_LIMIT) {
    throw new McpError(
      ErrorCode.InternalError,
      `Rate limit exceeded for tool '${toolName}'. Max ${RATE_LIMIT} requests/minute.`
    );
  }

  existing.count += 1;
}

// ── MCP Server ─────────────────────────────────────────────────────────────

const server = new Server(
  {
    name: "grx10-books-erp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ── List Tools Handler ─────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => {
  logger.info("ListTools requested", { tool_count: ALL_TOOLS.length });

  return {
    tools: ALL_TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  };
});

// ── Call Tool Handler ──────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Special meta-tool: show the tool menu
  if (name === "get_mcp_menu") {
    return {
      content: [{ type: "text", text: getMcpMenu() }],
    };
  }

  const tool = TOOL_MAP.get(name);

  if (!tool) {
    throw new McpError(
      ErrorCode.MethodNotFound,
      `Tool '${name}' not found. Use 'get_mcp_menu' to see available tools.`
    );
  }

  // Rate limiting
  try {
    checkRateLimit(name);
  } catch (e) {
    if (e instanceof McpError) throw e;
    throw new McpError(ErrorCode.InternalError, String(e));
  }

  logger.info("Tool called", { tool: name, args });

  const startTime = Date.now();

  try {
    const result = await tool.handler(args ?? {});
    const duration = Date.now() - startTime;

    logger.info("Tool success", { tool: name, duration_ms: duration });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const message = error instanceof Error ? error.message : String(error);

    logger.error("Tool error", { tool: name, error: message, duration_ms: duration });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: false,
              error: message,
              tool: name,
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
});

// ── Startup ────────────────────────────────────────────────────────────────

async function main() {
  // Validate environment
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    logger.error(
      "Missing required environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. " +
        "Copy .env.example to .env and configure your Supabase credentials."
    );
    // Don't exit — allow inspection without credentials
  }

  const transport = new StdioServerTransport();

  logger.info("GRX10 Books MCP Server starting", {
    tools: ALL_TOOLS.length,
    version: "1.0.0",
  });

  await server.connect(transport);

  logger.info("MCP Server connected and ready");
}

main().catch((err) => {
  logger.error("Fatal server error", { error: String(err) });
  process.exit(1);
});
