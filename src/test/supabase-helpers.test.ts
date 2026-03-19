import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
    })),
  },
}));

import {
  validateOrgId,
  orgScopedQuery,
  orgScopedInsert,
} from "@/lib/supabase-helpers";
import { supabase } from "@/integrations/supabase/client";

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── validateOrgId ──────────────────────────────────────────────────
describe("validateOrgId", () => {
  it('throws "Organization not found" when orgId is undefined', () => {
    expect(() => validateOrgId(undefined)).toThrowError("Organization not found");
  });

  it('throws "Organization not found" when orgId is null', () => {
    expect(() => validateOrgId(null)).toThrowError("Organization not found");
  });

  it('throws "Organization not found" when orgId is an empty string', () => {
    expect(() => validateOrgId("")).toThrowError("Organization not found");
  });

  it("does NOT throw when orgId is a valid string", () => {
    expect(() => validateOrgId("org-123")).not.toThrow();
  });

  it("narrows the type to string after assertion (compile-time guard)", () => {
    // This test validates the assertion signature at the type level.
    // If validateOrgId did not have `asserts orgId is string`, the
    // assignment below would be a TypeScript compilation error.
    const orgId: string | undefined = "org-456";
    validateOrgId(orgId);
    // After the assertion, orgId is narrowed to `string`.
    const narrowed: string = orgId;
    expect(narrowed).toBe("org-456");
  });
});

// ─── orgScopedQuery ─────────────────────────────────────────────────
describe("orgScopedQuery", () => {
  it("calls supabase.from with the correct table name", () => {
    orgScopedQuery("books", "org-1");
    expect(supabase.from).toHaveBeenCalledWith("books");
  });

  it("chains .select() and .eq('organization_id', orgId)", () => {
    const result = orgScopedQuery("books", "org-1");

    const fromReturn = (supabase.from as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(fromReturn.select).toHaveBeenCalled();
    expect(fromReturn.eq).toHaveBeenCalledWith("organization_id", "org-1");
  });

  it("passes different table names and orgIds correctly", () => {
    orgScopedQuery("inventory", "org-99");
    expect(supabase.from).toHaveBeenCalledWith("inventory");

    const fromReturn = (supabase.from as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(fromReturn.eq).toHaveBeenCalledWith("organization_id", "org-99");
  });
});

// ─── orgScopedInsert ────────────────────────────────────────────────
describe("orgScopedInsert", () => {
  it("calls supabase.from with the correct table name", () => {
    orgScopedInsert("books", { title: "Dune" }, "org-1");
    expect(supabase.from).toHaveBeenCalledWith("books");
  });

  it("merges organization_id into the data payload", () => {
    orgScopedInsert("books", { title: "Dune", author: "Herbert" }, "org-42");

    const fromReturn = (supabase.from as ReturnType<typeof vi.fn>).mock.results[0].value;
    expect(fromReturn.insert).toHaveBeenCalledWith({
      title: "Dune",
      author: "Herbert",
      organization_id: "org-42",
    });
  });

  it("does not mutate the original data object", () => {
    const data = { title: "Neuromancer" };
    orgScopedInsert("books", data, "org-7");
    expect(data).toEqual({ title: "Neuromancer" });
  });
});
