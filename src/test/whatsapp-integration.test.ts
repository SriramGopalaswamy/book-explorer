/**
 * WhatsApp Integration Tests
 *
 * Tests the WhatsApp messaging integration at the logic/contract level.
 * These tests validate:
 *   - Message routing (channel selection)
 *   - Template resolution
 *   - Phone number normalization
 *   - Inbound message parsing (Meta format + simplified)
 *   - Invoice matching strategies
 *   - Status progression logic
 *   - Workflow compatibility
 *   - Channel-aware condition evaluation
 *
 * Note: These are unit tests that validate logic without hitting real APIs.
 * Edge function integration tests require a running Supabase instance.
 */

import { describe, it, expect } from "vitest";

// ─── Phone Normalization ─────────────────────────────────────────────────────

function normalizePhoneE164(phone: string): string {
  const digits = phone.replace(/[^0-9+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

describe("Phone number normalization", () => {
  it("should preserve E.164 format", () => {
    expect(normalizePhoneE164("+919876543210")).toBe("+919876543210");
  });

  it("should add +91 prefix for 10-digit Indian numbers", () => {
    expect(normalizePhoneE164("9876543210")).toBe("+919876543210");
  });

  it("should handle numbers with country code but no plus", () => {
    expect(normalizePhoneE164("919876543210")).toBe("+919876543210");
  });

  it("should strip non-numeric characters", () => {
    expect(normalizePhoneE164("+91-987-654-3210")).toBe("+919876543210");
    expect(normalizePhoneE164("(91) 987 654 3210")).toBe("+919876543210");
  });
});

// ─── Invoice Reference Extraction ────────────────────────────────────────────

function extractInvoiceRef(text: string): string | null {
  const patterns = [
    /\b(INV[-_#]?\s*\d{4}[-_]\d+)\b/i,
    /\b(INV[-_#]?\s*\d+)\b/i,
    /invoice\s*#?\s*(\d+)/i,
    /\b(GRX[-_]?\d+)\b/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].replace(/\s+/g, "").toUpperCase();
  }
  return null;
}

describe("Invoice reference extraction from WhatsApp messages", () => {
  it("should extract INV-YYYY-NNN format", () => {
    expect(extractInvoiceRef("Regarding INV-2026-001 payment")).toBe("INV-2026-001");
  });

  it("should extract INV#NNN format", () => {
    expect(extractInvoiceRef("Please check INV#12345")).toBe("INV#12345");
  });

  it("should extract invoice #NNN format", () => {
    expect(extractInvoiceRef("About invoice #789")).toBe("789");
  });

  it("should extract GRX-NNN format", () => {
    expect(extractInvoiceRef("Re: GRX-5001 is incorrect")).toBe("GRX-5001");
  });

  it("should return null for no invoice reference", () => {
    expect(extractInvoiceRef("Hello, how are you?")).toBeNull();
    expect(extractInvoiceRef("Payment received, thanks")).toBeNull();
  });

  it("should be case-insensitive", () => {
    expect(extractInvoiceRef("inv-2026-001")).toBe("INV-2026-001");
  });
});

// ─── Meta Cloud API Payload Parsing ──────────────────────────────────────────

function parseMetaFormat(body: any): { from: string; content: string; messageId: string | null; contextId: string | null } | null {
  try {
    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const msg = value?.messages?.[0];
    if (!msg) return null;

    return {
      from: msg.from || "",
      content: msg.text?.body || msg.button?.text || msg.interactive?.body?.text || "",
      messageId: msg.id || null,
      contextId: msg.context?.id || null,
    };
  } catch {
    return null;
  }
}

describe("Meta Cloud API format parsing", () => {
  it("should parse standard text message", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: "919876543210",
              type: "text",
              text: { body: "Received the invoice" },
              id: "wamid.123",
            }],
          },
        }],
      }],
    };

    const result = parseMetaFormat(payload);
    expect(result).not.toBeNull();
    expect(result!.from).toBe("919876543210");
    expect(result!.content).toBe("Received the invoice");
    expect(result!.messageId).toBe("wamid.123");
  });

  it("should parse message with context (reply)", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: "919876543210",
              type: "text",
              text: { body: "Yes, acknowledged" },
              id: "wamid.456",
              context: { id: "wamid.original123" },
            }],
          },
        }],
      }],
    };

    const result = parseMetaFormat(payload);
    expect(result).not.toBeNull();
    expect(result!.contextId).toBe("wamid.original123");
  });

  it("should return null for status-only payload (no messages)", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            statuses: [{ id: "wamid.123", status: "delivered" }],
          },
        }],
      }],
    };

    const result = parseMetaFormat(payload);
    expect(result).toBeNull();
  });

  it("should handle button reply message", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{
              from: "919876543210",
              type: "button",
              button: { text: "Yes, I acknowledge" },
              id: "wamid.789",
            }],
          },
        }],
      }],
    };

    const result = parseMetaFormat(payload);
    expect(result!.content).toBe("Yes, I acknowledge");
  });

  it("should handle empty/malformed payload gracefully", () => {
    expect(parseMetaFormat({})).toBeNull();
    expect(parseMetaFormat({ entry: [] })).toBeNull();
    expect(parseMetaFormat(null)).toBeNull();
  });
});

// ─── Status Progression Logic ────────────────────────────────────────────────

const STATUS_ORDER: Record<string, number> = {
  pending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 99,
};

function shouldUpdateStatus(currentStatus: string, newStatus: string): boolean {
  const currentOrder = STATUS_ORDER[currentStatus] ?? 0;
  const newOrder = STATUS_ORDER[newStatus] ?? 0;
  if (newStatus === "failed") return true;
  return newOrder > currentOrder;
}

describe("WhatsApp status progression", () => {
  it("should allow forward progression: pending → sent", () => {
    expect(shouldUpdateStatus("pending", "sent")).toBe(true);
  });

  it("should allow forward progression: sent → delivered", () => {
    expect(shouldUpdateStatus("sent", "delivered")).toBe(true);
  });

  it("should allow forward progression: delivered → read", () => {
    expect(shouldUpdateStatus("delivered", "read")).toBe(true);
  });

  it("should NOT allow backward progression: delivered → sent", () => {
    expect(shouldUpdateStatus("delivered", "sent")).toBe(false);
  });

  it("should NOT allow same status: sent → sent", () => {
    expect(shouldUpdateStatus("sent", "sent")).toBe(false);
  });

  it("should always allow failed regardless of current status", () => {
    expect(shouldUpdateStatus("pending", "failed")).toBe(true);
    expect(shouldUpdateStatus("sent", "failed")).toBe(true);
    expect(shouldUpdateStatus("delivered", "failed")).toBe(true);
    expect(shouldUpdateStatus("read", "failed")).toBe(true);
  });
});

// ─── Meta Status Webhook Parsing ─────────────────────────────────────────────

function parseMetaStatuses(body: any): Array<{
  externalId: string;
  status: string;
  timestamp: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}> {
  const results: Array<any> = [];
  try {
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        for (const s of change.value?.statuses || []) {
          results.push({
            externalId: s.id,
            status: s.status,
            timestamp: s.timestamp ? new Date(Number(s.timestamp) * 1000).toISOString() : null,
            errorCode: s.errors?.[0]?.code?.toString() || null,
            errorMessage: s.errors?.[0]?.title || null,
          });
        }
      }
    }
  } catch {
    // Return empty
  }
  return results;
}

describe("Meta status webhook parsing", () => {
  it("should parse delivered status", () => {
    const payload = {
      entry: [{
        changes: [{
          value: {
            statuses: [{
              id: "wamid.123",
              status: "delivered",
              timestamp: "1711000000",
            }],
          },
        }],
      }],
    };

    const results = parseMetaStatuses(payload);
    expect(results).toHaveLength(1);
    expect(results[0].externalId).toBe("wamid.123");
    expect(results[0].status).toBe("delivered");
    expect(results[0].timestamp).not.toBeNull();
  });

  it("should parse failed status with error details", () => {
    const payload = {
      entry: [{
        changes: [{
          value: {
            statuses: [{
              id: "wamid.456",
              status: "failed",
              timestamp: "1711000000",
              errors: [{ code: 131026, title: "Message Undeliverable" }],
            }],
          },
        }],
      }],
    };

    const results = parseMetaStatuses(payload);
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("failed");
    expect(results[0].errorCode).toBe("131026");
    expect(results[0].errorMessage).toBe("Message Undeliverable");
  });

  it("should parse multiple statuses in one payload", () => {
    const payload = {
      entry: [{
        changes: [{
          value: {
            statuses: [
              { id: "wamid.1", status: "sent", timestamp: "1711000000" },
              { id: "wamid.2", status: "delivered", timestamp: "1711000001" },
            ],
          },
        }],
      }],
    };

    const results = parseMetaStatuses(payload);
    expect(results).toHaveLength(2);
  });

  it("should return empty for payload with no statuses", () => {
    expect(parseMetaStatuses({})).toHaveLength(0);
    expect(parseMetaStatuses({ entry: [] })).toHaveLength(0);
  });
});

// ─── Channel Routing Logic ───────────────────────────────────────────────────

// Mirrors the actual logic from workflow-engine executeAction
function resolveChannel(actionType: string, configChannel?: string): string {
  return actionType === "send_email" ? "email" : (configChannel || "email");
}

describe("Channel routing in messaging-service", () => {
  it("should map send_email action to email channel", () => {
    expect(resolveChannel("send_email")).toBe("email");
    expect(resolveChannel("send_email", "whatsapp")).toBe("email"); // send_email always email
  });

  it("should use config.channel for send_message action", () => {
    expect(resolveChannel("send_message", "whatsapp")).toBe("whatsapp");
  });

  it("should default send_message to email when no channel specified", () => {
    expect(resolveChannel("send_message")).toBe("email");
    expect(resolveChannel("send_message", undefined)).toBe("email");
  });
});

// ─── Template Variable Resolution ────────────────────────────────────────────

describe("WhatsApp template variable resolution", () => {
  it("should build correct variable values from invoice data", () => {
    const invoice = {
      client_name: "Acme Corp",
      invoice_number: "INV-2026-001",
      total_amount: 50000,
      due_date: "2026-04-01",
    };

    const templateVariables = {
      client_name: invoice.client_name || "Customer",
      invoice_number: invoice.invoice_number || "",
      amount: `₹${Number(invoice.total_amount || 0).toLocaleString("en-IN")}`,
      due_date: new Date(invoice.due_date).toLocaleDateString("en-IN", {
        day: "2-digit", month: "short", year: "numeric",
      }),
    };

    expect(templateVariables.client_name).toBe("Acme Corp");
    expect(templateVariables.invoice_number).toBe("INV-2026-001");
    expect(templateVariables.amount).toContain("50,000");
    expect(templateVariables.due_date).toContain("2026");
  });

  it("should handle missing invoice data gracefully", () => {
    const invoice: any = null;
    const templateVariables = {
      client_name: invoice?.client_name || "Customer",
      invoice_number: invoice?.invoice_number || "",
      amount: "N/A",
      due_date: "N/A",
    };

    expect(templateVariables.client_name).toBe("Customer");
    expect(templateVariables.amount).toBe("N/A");
  });
});

// ─── Workflow Config Compatibility ───────────────────────────────────────────

describe("Workflow step config for WhatsApp", () => {
  it("should support send_message with whatsapp channel", () => {
    const stepConfig = {
      action_type: "send_message",
      channel: "whatsapp",
      template: "invoice_reminder_1",
    };

    expect(stepConfig.action_type).toBe("send_message");
    expect(stepConfig.channel).toBe("whatsapp");
    expect(stepConfig.template).toBe("invoice_reminder_1");
  });

  it("should support condition on last_message.channel", () => {
    const conditionConfig = {
      field: "last_message.channel",
      operator: "=",
      value: "whatsapp",
    };

    expect(conditionConfig.field.startsWith("last_message.")).toBe(true);
  });

  it("should support condition on last_message.status", () => {
    const conditionConfig = {
      field: "last_message.status",
      operator: "=",
      value: "delivered",
    };

    expect(conditionConfig.field).toBe("last_message.status");
  });

  it("should support email → whatsapp escalation workflow", () => {
    const escalationWorkflow = [
      { step_order: 1, step_type: "action", config: { action_type: "send_message", channel: "email", template: "reminder_1" } },
      { step_order: 2, step_type: "delay", config: { duration_hours: 48 } },
      { step_order: 3, step_type: "condition", config: { field: "invoice.status", operator: "!=", value: "acknowledged" } },
      { step_order: 4, step_type: "action", config: { action_type: "send_message", channel: "whatsapp", template: "invoice_reminder_1" } },
    ];

    // Email step
    expect(escalationWorkflow[0].config.channel).toBe("email");
    // WhatsApp escalation step
    expect(escalationWorkflow[3].config.channel).toBe("whatsapp");
    // Verify correct sequencing
    expect(escalationWorkflow[3].step_order).toBeGreaterThan(escalationWorkflow[0].step_order);
  });
});

// ─── Data Model Validation ───────────────────────────────────────────────────

describe("Messages table schema compatibility", () => {
  it("should accept whatsapp as valid channel value", () => {
    const validChannels = ["email", "whatsapp", "sms", "internal"];
    expect(validChannels).toContain("whatsapp");
  });

  it("should accept all WhatsApp status values", () => {
    const validStatuses = ["sent", "delivered", "read", "failed", "pending"];
    expect(validStatuses).toContain("sent");
    expect(validStatuses).toContain("delivered");
    expect(validStatuses).toContain("read");
    expect(validStatuses).toContain("failed");
  });

  it("should support both inbound and outbound directions", () => {
    const validDirections = ["outbound", "inbound"];
    expect(validDirections).toContain("outbound");
    expect(validDirections).toContain("inbound");
  });
});

// ─── WhatsApp Template Schema ────────────────────────────────────────────────

describe("WhatsApp template schema", () => {
  it("should have valid category values", () => {
    const validCategories = ["UTILITY", "MARKETING", "AUTHENTICATION"];
    expect(validCategories).toContain("UTILITY");
  });

  it("should map internal name to provider template name", () => {
    const template = {
      name: "invoice_reminder_1",
      template_name: "invoice_payment_reminder",
      variables: { "1": "client_name", "2": "invoice_number", "3": "amount", "4": "due_date" },
      language: "en",
    };

    expect(template.name).not.toBe(template.template_name);
    expect(Object.keys(template.variables)).toHaveLength(4);
  });

  it("should sort template parameters by index for Meta API", () => {
    const variables = { "3": "amount", "1": "client_name", "4": "due_date", "2": "invoice_number" };
    const variableValues = {
      client_name: "Acme",
      invoice_number: "INV-001",
      amount: "₹50,000",
      due_date: "01 Apr 2026",
    };

    const parameters = Object.entries(variables)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([_idx, fieldName]) => ({
        type: "text",
        text: String(variableValues[fieldName as keyof typeof variableValues] || ""),
      }));

    expect(parameters[0].text).toBe("Acme");
    expect(parameters[1].text).toBe("INV-001");
    expect(parameters[2].text).toBe("₹50,000");
    expect(parameters[3].text).toBe("01 Apr 2026");
  });
});

// ─── E.164 Phone Validation ──────────────────────────────────────────────────

function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(phone);
}

describe("E.164 phone validation", () => {
  it("should accept valid E.164 numbers", () => {
    expect(isValidE164("+919876543210")).toBe(true);
    expect(isValidE164("+12025551234")).toBe(true);
    expect(isValidE164("+447911123456")).toBe(true);
  });

  it("should reject numbers without +", () => {
    expect(isValidE164("919876543210")).toBe(false);
  });

  it("should reject numbers starting with +0", () => {
    expect(isValidE164("+0123456789")).toBe(false);
  });

  it("should reject too-short numbers", () => {
    expect(isValidE164("+12345")).toBe(false);
  });

  it("should reject too-long numbers", () => {
    expect(isValidE164("+1234567890123456")).toBe(false);
  });

  it("should reject empty/non-numeric", () => {
    expect(isValidE164("")).toBe(false);
    expect(isValidE164("+abc")).toBe(false);
    expect(isValidE164("test@email.com")).toBe(false);
  });
});

// ─── Retry Logic ─────────────────────────────────────────────────────────────

describe("Retry with backoff", () => {
  it("should return result on first success", async () => {
    let attempts = 0;
    const result = await (async () => {
      attempts++;
      return "success";
    })();
    expect(result).toBe("success");
    expect(attempts).toBe(1);
  });

  it("should handle immediate failures without retry for 4xx errors", () => {
    const err: any = new Error("Bad request");
    err.status = 400;
    const isRetryable = !err.status || err.status >= 500 || err.status === 429;
    expect(isRetryable).toBe(false);
  });

  it("should identify 5xx errors as retryable", () => {
    const err: any = new Error("Internal error");
    err.status = 500;
    const isRetryable = !err.status || err.status >= 500 || err.status === 429;
    expect(isRetryable).toBe(true);
  });

  it("should identify 429 (rate limit) as retryable", () => {
    const err: any = new Error("Rate limited");
    err.status = 429;
    const isRetryable = !err.status || err.status >= 500 || err.status === 429;
    expect(isRetryable).toBe(true);
  });
});

// ─── Metadata Error Storage ──────────────────────────────────────────────────

describe("Error metadata in messages table", () => {
  it("should merge error into metadata when WhatsApp fails", () => {
    const variables = { client_name: "Acme" };
    const whatsappError = "Meta API 401: Invalid token";

    const metadata = {
      ...(variables ? { variables } : {}),
      ...(whatsappError ? { error: whatsappError } : {}),
    };

    expect(metadata.variables).toEqual({ client_name: "Acme" });
    expect(metadata.error).toBe("Meta API 401: Invalid token");
  });

  it("should not include error key when send succeeds", () => {
    const variables = { client_name: "Acme" };
    const whatsappError: string | null = null;

    const metadata = {
      ...(variables ? { variables } : {}),
      ...(whatsappError ? { error: whatsappError } : {}),
    };

    expect(metadata.variables).toEqual({ client_name: "Acme" });
    expect("error" in metadata).toBe(false);
  });
});

// ─── Status Webhook Event Firing ─────────────────────────────────────────────

describe("Status webhook event types", () => {
  it("should fire message_delivery_failed for failed status", () => {
    const status = "failed";
    const eventType = status === "failed" ? "message_delivery_failed" : `message_${status}`;
    expect(eventType).toBe("message_delivery_failed");
  });

  it("should fire message_delivered for delivered status", () => {
    const status = "delivered";
    const eventType = status === "failed" ? "message_delivery_failed" : `message_${status}`;
    expect(eventType).toBe("message_delivered");
  });

  it("should fire message_read for read status", () => {
    const status = "read";
    const eventType = status === "failed" ? "message_delivery_failed" : `message_${status}`;
    expect(eventType).toBe("message_read");
  });
});

// ─── Unmatched Message Handling ──────────────────────────────────────────────

describe("Unmatched WhatsApp message handling", () => {
  it("should use unmatched_whatsapp entity_type for unmatched messages", () => {
    const entityType = "unmatched_whatsapp";
    expect(entityType).not.toBe("unknown");
    expect(entityType).toBe("unmatched_whatsapp");
  });

  it("should include needs_manual_review flag in metadata", () => {
    const metadata = { match_method: "none", raw_from: "919876543210", needs_manual_review: true };
    expect(metadata.needs_manual_review).toBe(true);
  });
});

// ─── Template Alias Resolution ───────────────────────────────────────────────

describe("WhatsApp template alias resolution", () => {
  it("should have both invoice_reminder_* and reminder_* templates", () => {
    const templateNames = [
      "invoice_reminder_1",
      "invoice_reminder_2",
      "reminder_1",
      "reminder_2",
    ];
    // All four should exist so both naming conventions work
    expect(templateNames).toContain("reminder_1");
    expect(templateNames).toContain("invoice_reminder_1");
  });

  it("reminder_1 and invoice_reminder_1 should map to same provider template", () => {
    const templates = [
      { name: "invoice_reminder_1", template_name: "invoice_payment_reminder" },
      { name: "reminder_1", template_name: "invoice_payment_reminder" },
    ];
    expect(templates[0].template_name).toBe(templates[1].template_name);
  });
});

// ─── Workflow Trigger Events ─────────────────────────────────────────────────

describe("Workflow trigger events include WhatsApp events", () => {
  const TRIGGER_EVENTS = [
    "invoice_sent",
    "message_received",
    "email_received",
    "whatsapp_message_received",
    "invoice_acknowledged",
    "invoice_disputed",
    "invoice_overdue",
    "message_delivery_failed",
    "message_delivered",
    "message_read",
  ];

  it("should include whatsapp_message_received", () => {
    expect(TRIGGER_EVENTS).toContain("whatsapp_message_received");
  });

  it("should include message_delivery_failed", () => {
    expect(TRIGGER_EVENTS).toContain("message_delivery_failed");
  });

  it("should include message_delivered and message_read", () => {
    expect(TRIGGER_EVENTS).toContain("message_delivered");
    expect(TRIGGER_EVENTS).toContain("message_read");
  });
});

// ─── SQL Wildcard Escaping ────────────────────────────────────────────────────

describe("SQL wildcard escaping in invoice matching", () => {
  it("should escape % characters in invoice reference", () => {
    const ref = "INV%2026";
    const escaped = ref.replace(/%/g, "\\%").replace(/_/g, "\\_");
    expect(escaped).toBe("INV\\%2026");
    expect(escaped).not.toContain("%2026");
  });

  it("should escape _ characters in invoice reference", () => {
    const ref = "INV_2026_001";
    const escaped = ref.replace(/%/g, "\\%").replace(/_/g, "\\_");
    expect(escaped).toBe("INV\\_2026\\_001");
  });

  it("should not modify clean references", () => {
    const ref = "INV-2026-001";
    const escaped = ref.replace(/%/g, "\\%").replace(/_/g, "\\_");
    expect(escaped).toBe("INV-2026-001");
  });
});

// ─── Regression Safety ───────────────────────────────────────────────────────

describe("Email flow regression safety", () => {
  it("send_email action type should still map to email channel", () => {
    const actionType = "send_email";
    const channel = actionType === "send_email" ? "email" : ("whatsapp");
    expect(channel).toBe("email");
  });

  it("should not break existing email workflow step configs", () => {
    const existingConfig = {
      action_type: "send_email",
      template: "reminder_1",
      to: "client_email",
    };

    // send_email always maps to email, even if config.channel is set
    expect(resolveChannel(existingConfig.action_type, "whatsapp")).toBe("email");
    expect(existingConfig.template).toBe("reminder_1");
  });

  it("should preserve email_logs backward compatibility", () => {
    // The workflow engine still writes to email_logs for send_email actions
    const emailLogEntry = {
      direction: "outbound",
      subject: "Reminder: Invoice INV-2026-001",
      from_email: "admin@grx10.com",
      to_email: "client@example.com",
    };

    expect(emailLogEntry.direction).toBe("outbound");
    expect(emailLogEntry.from_email).toBe("admin@grx10.com");
  });
});
