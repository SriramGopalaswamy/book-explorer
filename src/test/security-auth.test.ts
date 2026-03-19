import { describe, it, expect, beforeEach } from "vitest";

/**
 * Security-focused tests for authentication rate limiting, invoice lifecycle
 * state-machine enforcement, and payroll run status validation.
 *
 * These tests mirror logic patterns from:
 *   - src/contexts/AuthContext.tsx  (rate limiting)
 *   - src/hooks/useInvoices.ts     (VALID_TRANSITIONS state machine)
 *   - src/hooks/usePayrollEngine.ts (payroll run status guards)
 */

// ════════════════════════════════════════════════════════════════════════════
// Mock localStorage
// ════════════════════════════════════════════════════════════════════════════

function createMockLocalStorage(): Storage {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Rate limiting helpers (extracted from AuthContext.tsx)
// ════════════════════════════════════════════════════════════════════════════

const MAX_AUTH_ATTEMPTS = 5;
const AUTH_WINDOW_MS = 15 * 60_000; // 15 minutes
const SIGNIN_LOCKOUT_KEY = "grx10_signin_attempts";
const SIGNUP_LOCKOUT_KEY = "grx10_signup_attempts";

function checkRateLimit(key: string, storage: Storage, now: number): void {
  let stored: number[] = [];
  try {
    stored = JSON.parse(storage.getItem(key) || "[]");
  } catch {
    stored = [];
  }

  // Prune attempts outside the sliding window
  const recent = stored.filter((t) => now - t < AUTH_WINDOW_MS);

  if (recent.length >= MAX_AUTH_ATTEMPTS) {
    const oldestInWindow = recent[0];
    const unlockAt = new Date(oldestInWindow + AUTH_WINDOW_MS);
    const minutesLeft = Math.ceil((unlockAt.getTime() - now) / 60_000);
    throw new Error(
      `Too many failed attempts. Account locked for ${minutesLeft} more minute${minutesLeft !== 1 ? "s" : ""
      }. Try again later or reset your password.`
    );
  }

  recent.push(now);
  try {
    storage.setItem(key, JSON.stringify(recent));
  } catch {
    // localStorage unavailable -- continue without persisting
  }
}

function clearRateLimit(storage: Storage): void {
  try {
    storage.removeItem(SIGNIN_LOCKOUT_KEY);
  } catch {
    // ignore
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Invoice state machine (extracted from useInvoices.ts)
// ════════════════════════════════════════════════════════════════════════════

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ["sent", "cancelled"],
  sent: ["paid", "overdue", "cancelled"],
  overdue: ["paid", "cancelled"],
  paid: [],           // terminal
  cancelled: [],      // terminal
  acknowledged: ["paid", "cancelled"],
  dispute: ["sent", "cancelled"],
};

function validateInvoiceTransition(currentStatus: string, newStatus: string): boolean {
  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed) return false;
  return allowed.includes(newStatus);
}

// ════════════════════════════════════════════════════════════════════════════
// Payroll run status guards (extracted from usePayrollEngine.ts)
// ════════════════════════════════════════════════════════════════════════════

const NON_DELETABLE_STATUSES = ["locked", "approved", "under_review"];
const LOCKABLE_STATUSES = ["approved", "completed"];

function canDeletePayrollRun(status: string): boolean {
  return !NON_DELETABLE_STATUSES.includes(status);
}

function canLockPayrollRun(status: string): boolean {
  return LOCKABLE_STATUSES.includes(status);
}

// ════════════════════════════════════════════════════════════════════════════
// Tests
// ════════════════════════════════════════════════════════════════════════════

describe("Rate limiting logic (AuthContext pattern)", () => {
  let storage: Storage;
  const BASE_TIME = 1_700_000_000_000; // fixed epoch ms

  beforeEach(() => {
    storage = createMockLocalStorage();
  });

  it("allows the first attempt", () => {
    expect(() => checkRateLimit(SIGNIN_LOCKOUT_KEY, storage, BASE_TIME)).not.toThrow();
    const stored: number[] = JSON.parse(storage.getItem(SIGNIN_LOCKOUT_KEY)!);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toBe(BASE_TIME);
  });

  it("allows up to MAX_AUTH_ATTEMPTS (5) attempts within the window", () => {
    for (let i = 0; i < MAX_AUTH_ATTEMPTS; i++) {
      expect(() =>
        checkRateLimit(SIGNIN_LOCKOUT_KEY, storage, BASE_TIME + i * 1000)
      ).not.toThrow();
    }
    const stored: number[] = JSON.parse(storage.getItem(SIGNIN_LOCKOUT_KEY)!);
    expect(stored).toHaveLength(MAX_AUTH_ATTEMPTS);
  });

  it("blocks the 6th attempt within the 15-minute window", () => {
    for (let i = 0; i < MAX_AUTH_ATTEMPTS; i++) {
      checkRateLimit(SIGNIN_LOCKOUT_KEY, storage, BASE_TIME + i * 1000);
    }
    expect(() =>
      checkRateLimit(SIGNIN_LOCKOUT_KEY, storage, BASE_TIME + 5000)
    ).toThrow(/Too many failed attempts/);
  });

  it("includes minutes-left information in the lockout error message", () => {
    for (let i = 0; i < MAX_AUTH_ATTEMPTS; i++) {
      checkRateLimit(SIGNIN_LOCKOUT_KEY, storage, BASE_TIME + i * 1000);
    }
    expect(() =>
      checkRateLimit(SIGNIN_LOCKOUT_KEY, storage, BASE_TIME + 5000)
    ).toThrow(/minute/);
  });

  it("uses singular 'minute' when exactly 1 minute remains", () => {
    // Place all 5 attempts at (BASE_TIME - 14 minutes) so there is ~1 minute left
    const attemptTime = BASE_TIME - 14 * 60_000;
    for (let i = 0; i < MAX_AUTH_ATTEMPTS; i++) {
      checkRateLimit(SIGNIN_LOCKOUT_KEY, storage, attemptTime + i);
    }
    // Now at BASE_TIME, 14 minutes have passed, 1 minute remains
    try {
      checkRateLimit(SIGNIN_LOCKOUT_KEY, storage, BASE_TIME);
      // Should not reach here
      expect.unreachable("Expected rate limit error");
    } catch (e: any) {
      expect(e.message).toContain("1 more minute.");
      // Singular — no trailing 's' after "minute"
      expect(e.message).not.toContain("1 more minutes");
    }
  });

  it("prunes attempts outside the 15-minute sliding window", () => {
    // 5 attempts at BASE_TIME
    for (let i = 0; i < MAX_AUTH_ATTEMPTS; i++) {
      checkRateLimit(SIGNIN_LOCKOUT_KEY, storage, BASE_TIME + i);
    }
    // 16 minutes later: all previous attempts are outside the window
    const laterTime = BASE_TIME + 16 * 60_000;
    expect(() =>
      checkRateLimit(SIGNIN_LOCKOUT_KEY, storage, laterTime)
    ).not.toThrow();

    // The stored array should have only the single new attempt (old ones pruned)
    const stored: number[] = JSON.parse(storage.getItem(SIGNIN_LOCKOUT_KEY)!);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toBe(laterTime);
  });

  it("prunes partial window — keeps recent, drops old", () => {
    // 3 old attempts outside the window
    const oldTime = BASE_TIME - 20 * 60_000;
    for (let i = 0; i < 3; i++) {
      checkRateLimit(SIGNIN_LOCKOUT_KEY, storage, oldTime + i * 1000);
    }
    // 3 recent attempts inside the window
    for (let i = 0; i < 3; i++) {
      checkRateLimit(SIGNIN_LOCKOUT_KEY, storage, BASE_TIME + i * 1000);
    }
    // Now stored should contain only the 4 recent attempts (3 recent + the call itself pruned old)
    // Actually let's verify: after pruning the 3 old ones, the 3 recent + current push
    const stored: number[] = JSON.parse(storage.getItem(SIGNIN_LOCKOUT_KEY)!);
    // The last call at BASE_TIME+2000 prunes the 3 old ones, keeps the 2 previous recent, then pushes itself = 3
    // Let's re-check with a clean run
    const freshStorage = createMockLocalStorage();
    // Seed old attempts directly
    freshStorage.setItem(SIGNIN_LOCKOUT_KEY, JSON.stringify([
      oldTime, oldTime + 1000, oldTime + 2000,  // outside window
      BASE_TIME - 1000, BASE_TIME - 500,          // inside window
    ]));
    // Now make a new attempt
    expect(() =>
      checkRateLimit(SIGNIN_LOCKOUT_KEY, freshStorage, BASE_TIME)
    ).not.toThrow();
    const result: number[] = JSON.parse(freshStorage.getItem(SIGNIN_LOCKOUT_KEY)!);
    // Should have: 2 recent + 1 new = 3 (old ones pruned)
    expect(result).toHaveLength(3);
    expect(result).not.toContain(oldTime);
  });

  it("clearRateLimit removes the sign-in lockout counter", () => {
    for (let i = 0; i < MAX_AUTH_ATTEMPTS; i++) {
      checkRateLimit(SIGNIN_LOCKOUT_KEY, storage, BASE_TIME + i);
    }
    expect(storage.getItem(SIGNIN_LOCKOUT_KEY)).not.toBeNull();

    clearRateLimit(storage);

    expect(storage.getItem(SIGNIN_LOCKOUT_KEY)).toBeNull();
    // After clearing, new attempts should succeed
    expect(() =>
      checkRateLimit(SIGNIN_LOCKOUT_KEY, storage, BASE_TIME + 10_000)
    ).not.toThrow();
  });

  it("sign-in and sign-up have independent rate-limit counters", () => {
    // Exhaust sign-in attempts
    for (let i = 0; i < MAX_AUTH_ATTEMPTS; i++) {
      checkRateLimit(SIGNIN_LOCKOUT_KEY, storage, BASE_TIME + i);
    }
    expect(() =>
      checkRateLimit(SIGNIN_LOCKOUT_KEY, storage, BASE_TIME + MAX_AUTH_ATTEMPTS)
    ).toThrow(/Too many failed attempts/);

    // Sign-up should still be allowed (separate key)
    expect(() =>
      checkRateLimit(SIGNUP_LOCKOUT_KEY, storage, BASE_TIME)
    ).not.toThrow();
  });

  it("handles corrupted localStorage data gracefully", () => {
    storage.setItem(SIGNIN_LOCKOUT_KEY, "not-valid-json{{{");
    expect(() =>
      checkRateLimit(SIGNIN_LOCKOUT_KEY, storage, BASE_TIME)
    ).not.toThrow();
    // Should have recovered and stored a fresh array
    const stored: number[] = JSON.parse(storage.getItem(SIGNIN_LOCKOUT_KEY)!);
    expect(stored).toHaveLength(1);
  });

  it("handles empty localStorage (first-time user) gracefully", () => {
    expect(storage.getItem(SIGNIN_LOCKOUT_KEY)).toBeNull();
    expect(() =>
      checkRateLimit(SIGNIN_LOCKOUT_KEY, storage, BASE_TIME)
    ).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Invoice status transition validation (useInvoices state machine)", () => {
  describe("valid transitions", () => {
    const validCases: [string, string][] = [
      ["draft", "sent"],
      ["draft", "cancelled"],
      ["sent", "paid"],
      ["sent", "overdue"],
      ["sent", "cancelled"],
      ["overdue", "paid"],
      ["overdue", "cancelled"],
      ["acknowledged", "paid"],
      ["acknowledged", "cancelled"],
      ["dispute", "sent"],
      ["dispute", "cancelled"],
    ];

    it.each(validCases)(
      "allows transition from %s to %s",
      (from, to) => {
        expect(validateInvoiceTransition(from, to)).toBe(true);
      }
    );
  });

  describe("invalid transitions", () => {
    const invalidCases: [string, string][] = [
      // Terminal states cannot transition to anything
      ["paid", "draft"],
      ["paid", "sent"],
      ["paid", "cancelled"],
      ["paid", "overdue"],
      ["cancelled", "draft"],
      ["cancelled", "sent"],
      ["cancelled", "paid"],
      ["cancelled", "overdue"],
      // Draft cannot jump to paid or overdue directly
      ["draft", "paid"],
      ["draft", "overdue"],
      ["draft", "acknowledged"],
      ["draft", "dispute"],
      // Sent cannot go back to draft
      ["sent", "draft"],
      ["sent", "acknowledged"],
      ["sent", "dispute"],
      // Overdue cannot go back to draft or sent
      ["overdue", "draft"],
      ["overdue", "sent"],
      // Acknowledged cannot go to draft, sent, or overdue
      ["acknowledged", "draft"],
      ["acknowledged", "sent"],
      ["acknowledged", "overdue"],
      // Dispute cannot go to paid or overdue directly
      ["dispute", "paid"],
      ["dispute", "overdue"],
      ["dispute", "draft"],
      ["dispute", "acknowledged"],
    ];

    it.each(invalidCases)(
      "blocks transition from %s to %s",
      (from, to) => {
        expect(validateInvoiceTransition(from, to)).toBe(false);
      }
    );
  });

  describe("terminal states", () => {
    it("'paid' is a terminal state with no outgoing transitions", () => {
      expect(VALID_TRANSITIONS["paid"]).toEqual([]);
    });

    it("'cancelled' is a terminal state with no outgoing transitions", () => {
      expect(VALID_TRANSITIONS["cancelled"]).toEqual([]);
    });

    it("terminal states reject every possible target status", () => {
      const allStatuses = Object.keys(VALID_TRANSITIONS);
      for (const terminal of ["paid", "cancelled"]) {
        for (const target of allStatuses) {
          expect(validateInvoiceTransition(terminal, target)).toBe(false);
        }
      }
    });
  });

  describe("unknown / unrecognized statuses", () => {
    it("rejects transitions from an unknown status", () => {
      expect(validateInvoiceTransition("nonexistent", "paid")).toBe(false);
    });

    it("rejects transitions to a status not in the allowed list", () => {
      expect(validateInvoiceTransition("draft", "nonexistent")).toBe(false);
    });
  });

  describe("state machine completeness", () => {
    it("every defined status has an entry in VALID_TRANSITIONS", () => {
      const expectedStatuses = ["draft", "sent", "paid", "overdue", "cancelled", "acknowledged", "dispute"];
      for (const status of expectedStatuses) {
        expect(VALID_TRANSITIONS).toHaveProperty(status);
        expect(Array.isArray(VALID_TRANSITIONS[status])).toBe(true);
      }
    });

    it("all transition targets are themselves valid statuses", () => {
      const allStatuses = new Set(Object.keys(VALID_TRANSITIONS));
      for (const [status, targets] of Object.entries(VALID_TRANSITIONS)) {
        for (const target of targets) {
          expect(allStatuses.has(target)).toBe(true);
        }
      }
    });

    it("no status lists itself as a valid transition target (no self-loops)", () => {
      for (const [status, targets] of Object.entries(VALID_TRANSITIONS)) {
        expect(targets).not.toContain(status);
      }
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("Payroll run status validation (usePayrollEngine guards)", () => {
  describe("deletion guards", () => {
    it("allows deleting a 'draft' payroll run", () => {
      expect(canDeletePayrollRun("draft")).toBe(true);
    });

    it("allows deleting a 'completed' payroll run", () => {
      expect(canDeletePayrollRun("completed")).toBe(true);
    });

    it("allows deleting a 'processing' payroll run", () => {
      expect(canDeletePayrollRun("processing")).toBe(true);
    });

    it("blocks deleting a 'locked' payroll run", () => {
      expect(canDeletePayrollRun("locked")).toBe(false);
    });

    it("blocks deleting an 'approved' payroll run", () => {
      expect(canDeletePayrollRun("approved")).toBe(false);
    });

    it("blocks deleting an 'under_review' payroll run", () => {
      expect(canDeletePayrollRun("under_review")).toBe(false);
    });

    it.each(["locked", "approved", "under_review"])(
      "non-deletable status '%s' is protected",
      (status) => {
        expect(canDeletePayrollRun(status)).toBe(false);
      }
    );
  });

  describe("lock guards", () => {
    it("allows locking an 'approved' payroll run", () => {
      expect(canLockPayrollRun("approved")).toBe(true);
    });

    it("allows locking a 'completed' payroll run", () => {
      expect(canLockPayrollRun("completed")).toBe(true);
    });

    it("blocks locking a 'draft' payroll run", () => {
      expect(canLockPayrollRun("draft")).toBe(false);
    });

    it("blocks locking a 'processing' payroll run", () => {
      expect(canLockPayrollRun("processing")).toBe(false);
    });

    it("blocks locking an already 'locked' payroll run", () => {
      expect(canLockPayrollRun("locked")).toBe(false);
    });

    it("blocks locking an 'under_review' payroll run", () => {
      expect(canLockPayrollRun("under_review")).toBe(false);
    });

    it.each(["draft", "processing", "locked", "under_review", "cancelled"])(
      "non-lockable status '%s' cannot be locked",
      (status) => {
        expect(canLockPayrollRun(status)).toBe(false);
      }
    );
  });

  describe("combined status invariants", () => {
    it("a locked run is both non-deletable and non-lockable (idempotent protection)", () => {
      expect(canDeletePayrollRun("locked")).toBe(false);
      expect(canLockPayrollRun("locked")).toBe(false);
    });

    it("an approved run can be locked but not deleted", () => {
      expect(canLockPayrollRun("approved")).toBe(true);
      expect(canDeletePayrollRun("approved")).toBe(false);
    });

    it("a completed run can be both locked and deleted", () => {
      expect(canLockPayrollRun("completed")).toBe(true);
      expect(canDeletePayrollRun("completed")).toBe(true);
    });

    it("a draft run can be deleted but not locked", () => {
      expect(canDeletePayrollRun("draft")).toBe(true);
      expect(canLockPayrollRun("draft")).toBe(false);
    });
  });
});
