import { describe, it, expect } from "vitest";

/**
 * Tests for leave request validation logic extracted from useCreateLeaveRequest.
 *
 * The codebase uses a timezone-safe day calculation pattern that parses
 * YYYY-MM-DD strings into local-time Date objects to avoid UTC offset shifts:
 *
 *   const [fy, fm, fd] = fromDate.split("-").map(Number);
 *   const [ty, tm, td] = toDate.split("-").map(Number);
 *   const from = new Date(fy, fm - 1, fd);
 *   const to   = new Date(ty, tm - 1, td);
 *   const days = Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
 */

// ---------- helpers (mirror the production logic) ----------

function calculateLeaveDays(fromDate: string, toDate: string): number {
  const [fy, fm, fd] = fromDate.split("-").map(Number);
  const [ty, tm, td] = toDate.split("-").map(Number);
  const from = new Date(fy, fm - 1, fd);
  const to = new Date(ty, tm - 1, td);
  return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

function validateLeaveRange(fromDate: string, toDate: string): { valid: boolean; days: number; error?: string } {
  const days = calculateLeaveDays(fromDate, toDate);
  if (days < 1 || days > 365) {
    return { valid: false, days, error: `Invalid date range: ${days} days. Please check your from/to dates.` };
  }
  return { valid: true, days };
}

interface LeaveRange {
  from_date: string;
  to_date: string;
  status: "pending" | "approved" | "rejected";
}

/**
 * Overlap detection mirrors the Supabase query logic:
 *   .in("status", ["pending", "approved"])
 *   .lte("from_date", request.to_date)
 *   .gte("to_date", request.from_date)
 *
 * Two ranges [A_start, A_end] and [B_start, B_end] overlap when
 * A_start <= B_end AND A_end >= B_start.
 */
function hasOverlap(
  existingRequests: LeaveRange[],
  newFrom: string,
  newTo: string,
): boolean {
  return existingRequests
    .filter((r) => r.status === "pending" || r.status === "approved")
    .some((r) => r.from_date <= newTo && r.to_date >= newFrom);
}

// ======================== TESTS ========================

describe("Leave day calculation (timezone-safe pattern)", () => {
  it("returns 1 for same-day leave", () => {
    expect(calculateLeaveDays("2026-03-10", "2026-03-10")).toBe(1);
  });

  it("returns 2 for consecutive days", () => {
    expect(calculateLeaveDays("2026-03-10", "2026-03-11")).toBe(2);
  });

  it("handles month boundary (March 31 to April 2)", () => {
    expect(calculateLeaveDays("2026-03-31", "2026-04-02")).toBe(3);
  });

  it("handles month boundary (Jan 30 to Feb 2)", () => {
    // Jan 30, 31, Feb 1, 2 = 4 days
    expect(calculateLeaveDays("2026-01-30", "2026-02-02")).toBe(4);
  });

  it("handles year boundary (Dec 30 to Jan 2)", () => {
    expect(calculateLeaveDays("2025-12-30", "2026-01-02")).toBe(4);
  });

  it("handles year boundary (Dec 31 to Jan 1)", () => {
    expect(calculateLeaveDays("2025-12-31", "2026-01-01")).toBe(2);
  });

  it("handles Feb 29 in a leap year (2024)", () => {
    // 2024 is a leap year: Feb 28 -> Feb 29 = 2 days
    expect(calculateLeaveDays("2024-02-28", "2024-02-29")).toBe(2);
  });

  it("handles Feb 29 single-day leave in a leap year", () => {
    expect(calculateLeaveDays("2024-02-29", "2024-02-29")).toBe(1);
  });

  it("handles leap year range spanning Feb 29 (Feb 27 to Mar 1, 2024)", () => {
    // Feb 27, 28, 29, Mar 1 = 4 days
    expect(calculateLeaveDays("2024-02-27", "2024-03-01")).toBe(4);
  });

  it("handles non-leap year Feb boundary (Feb 28 to Mar 1, 2025)", () => {
    // Feb 28, Mar 1 = 2 days (no Feb 29 in 2025)
    expect(calculateLeaveDays("2025-02-28", "2025-03-01")).toBe(2);
  });

  it("handles non-leap year Feb boundary (Feb 28 to Mar 1, 2026)", () => {
    expect(calculateLeaveDays("2026-02-28", "2026-03-01")).toBe(2);
  });

  it("handles leap year 2028 Feb boundary (Feb 28 to Mar 1)", () => {
    // Feb 28, 29, Mar 1 = 3 days
    expect(calculateLeaveDays("2028-02-28", "2028-03-01")).toBe(3);
  });

  it("calculates a full week correctly", () => {
    expect(calculateLeaveDays("2026-01-05", "2026-01-11")).toBe(7);
  });

  it("calculates a full month (Jan) correctly", () => {
    expect(calculateLeaveDays("2026-01-01", "2026-01-31")).toBe(31);
  });

  it("calculates February non-leap correctly (28 days)", () => {
    expect(calculateLeaveDays("2026-02-01", "2026-02-28")).toBe(28);
  });

  it("calculates February leap correctly (29 days)", () => {
    expect(calculateLeaveDays("2028-02-01", "2028-02-29")).toBe(29);
  });

  it("calculates 365 days (full non-leap year)", () => {
    expect(calculateLeaveDays("2025-01-01", "2025-12-31")).toBe(365);
  });

  it("calculates 366 days (full leap year)", () => {
    expect(calculateLeaveDays("2024-01-01", "2024-12-31")).toBe(366);
  });

  it("is consistent regardless of timezone (uses local Date construction)", () => {
    // The key property: parsing "2026-01-15" as new Date(2026, 0, 15)
    // produces midnight local time, not UTC, avoiding off-by-one errors.
    const days = calculateLeaveDays("2026-01-15", "2026-01-17");
    expect(days).toBe(3);
  });
});

describe("Leave date range validation", () => {
  it("accepts a single-day leave", () => {
    const result = validateLeaveRange("2026-06-15", "2026-06-15");
    expect(result.valid).toBe(true);
    expect(result.days).toBe(1);
  });

  it("accepts a standard multi-day leave", () => {
    const result = validateLeaveRange("2026-06-15", "2026-06-20");
    expect(result.valid).toBe(true);
    expect(result.days).toBe(6);
  });

  it("accepts a leave of exactly 365 days", () => {
    const result = validateLeaveRange("2025-01-01", "2025-12-31");
    expect(result.valid).toBe(true);
    expect(result.days).toBe(365);
  });

  it("accepts a 2-day leave across month boundary", () => {
    const result = validateLeaveRange("2026-03-31", "2026-04-01");
    expect(result.valid).toBe(true);
    expect(result.days).toBe(2);
  });

  it("rejects when to_date is before from_date (negative days)", () => {
    const result = validateLeaveRange("2026-06-20", "2026-06-15");
    expect(result.valid).toBe(false);
    expect(result.days).toBeLessThan(1);
    expect(result.error).toBeDefined();
    expect(result.error).toContain("Invalid date range");
  });

  it("rejects range exceeding 365 days (full leap year = 366)", () => {
    const result = validateLeaveRange("2024-01-01", "2024-12-31");
    expect(result.valid).toBe(false);
    expect(result.days).toBe(366);
    expect(result.error).toContain("366 days");
  });

  it("rejects range of ~400 days", () => {
    const result = validateLeaveRange("2025-01-01", "2026-02-04");
    expect(result.valid).toBe(false);
    expect(result.days).toBeGreaterThan(365);
  });

  it("rejects multi-year range", () => {
    const result = validateLeaveRange("2024-01-01", "2026-12-31");
    expect(result.valid).toBe(false);
    expect(result.days).toBeGreaterThan(365);
  });

  it("rejects swapped dates producing 0 day count (from == to + 1)", () => {
    const result = validateLeaveRange("2026-03-11", "2026-03-10");
    expect(result.valid).toBe(false);
    expect(result.days).toBe(0);
  });

  it("rejects swapped dates producing large negative day count", () => {
    const result = validateLeaveRange("2026-12-31", "2026-01-01");
    expect(result.valid).toBe(false);
    expect(result.days).toBeLessThan(0);
  });
});

describe("Overlapping leave detection", () => {
  const existing: LeaveRange[] = [
    { from_date: "2026-03-10", to_date: "2026-03-15", status: "approved" },
    { from_date: "2026-04-01", to_date: "2026-04-05", status: "pending" },
    { from_date: "2026-05-10", to_date: "2026-05-12", status: "rejected" },
  ];

  it("detects overlap when new range falls entirely within an existing approved range", () => {
    expect(hasOverlap(existing, "2026-03-11", "2026-03-13")).toBe(true);
  });

  it("detects overlap when new range starts before and ends within an existing range", () => {
    expect(hasOverlap(existing, "2026-03-08", "2026-03-12")).toBe(true);
  });

  it("detects overlap when new range starts within and ends after an existing range", () => {
    expect(hasOverlap(existing, "2026-03-14", "2026-03-18")).toBe(true);
  });

  it("detects overlap when new range fully encloses an existing range", () => {
    expect(hasOverlap(existing, "2026-03-01", "2026-03-31")).toBe(true);
  });

  it("detects overlap on exact boundary (new starts on existing end date)", () => {
    expect(hasOverlap(existing, "2026-03-15", "2026-03-18")).toBe(true);
  });

  it("detects overlap on exact boundary (new ends on existing start date)", () => {
    expect(hasOverlap(existing, "2026-03-05", "2026-03-10")).toBe(true);
  });

  it("detects overlap with exact same dates as existing range", () => {
    expect(hasOverlap(existing, "2026-03-10", "2026-03-15")).toBe(true);
  });

  it("detects overlap with pending requests", () => {
    expect(hasOverlap(existing, "2026-04-03", "2026-04-07")).toBe(true);
  });

  it("detects overlap when new single-day falls within existing range", () => {
    expect(hasOverlap(existing, "2026-03-12", "2026-03-12")).toBe(true);
  });

  it("does NOT detect overlap with rejected requests", () => {
    // The rejected range is May 10-12; only pending/approved are checked
    expect(hasOverlap(existing, "2026-05-10", "2026-05-12")).toBe(false);
  });

  it("does NOT detect overlap when ranges are completely disjoint", () => {
    expect(hasOverlap(existing, "2026-06-01", "2026-06-05")).toBe(false);
  });

  it("does NOT detect overlap when new range is the day after existing ends", () => {
    // Existing approved range ends Mar 15; new starts Mar 16 = adjacent, no overlap
    expect(hasOverlap(existing, "2026-03-16", "2026-03-20")).toBe(false);
  });

  it("does NOT detect overlap when new range is the day before existing starts", () => {
    // Existing approved range starts Mar 10; new ends Mar 9 = adjacent, no overlap
    expect(hasOverlap(existing, "2026-03-01", "2026-03-09")).toBe(false);
  });

  it("does NOT detect overlap between two non-overlapping pending/approved ranges", () => {
    // Gap between approved (ends Mar 15) and pending (starts Apr 1)
    expect(hasOverlap(existing, "2026-03-20", "2026-03-25")).toBe(false);
  });

  it("returns false for an empty existing list", () => {
    expect(hasOverlap([], "2026-03-10", "2026-03-15")).toBe(false);
  });

  it("handles multiple overlapping existing ranges", () => {
    const dense: LeaveRange[] = [
      { from_date: "2026-06-01", to_date: "2026-06-05", status: "approved" },
      { from_date: "2026-06-04", to_date: "2026-06-10", status: "pending" },
    ];
    // New range overlaps with second existing range
    expect(hasOverlap(dense, "2026-06-08", "2026-06-12")).toBe(true);
  });

  it("ignores all rejected requests even when multiple exist", () => {
    const allRejected: LeaveRange[] = [
      { from_date: "2026-07-01", to_date: "2026-07-05", status: "rejected" },
      { from_date: "2026-07-03", to_date: "2026-07-08", status: "rejected" },
    ];
    expect(hasOverlap(allRejected, "2026-07-02", "2026-07-04")).toBe(false);
  });
});
