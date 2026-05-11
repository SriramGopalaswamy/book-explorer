import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { SessionGate } from "@/components/session/SessionGate";

// Hoist-safe mocks for hooks
const mockUseAuth = vi.fn();
const mockUseSessionContext = vi.fn();

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("@/hooks/useSessionContext", () => ({
  useSessionContext: () => mockUseSessionContext(),
  readCachedSessionContext: () => null,
}));

describe("SessionGate", () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ user: { id: "u1" }, signOut: vi.fn() });
  });

  it("renders loading skeleton while session context is loading", () => {
    mockUseSessionContext.mockReturnValue({
      data: undefined,
      isLoading: true,
      isFetching: true,
      error: null,
      refetch: vi.fn(),
    });
    render(
      <SessionGate label="Employees">
        <div>inner</div>
      </SessionGate>,
    );
    expect(screen.getByTestId("session-gate-loading")).toBeInTheDocument();
    expect(screen.queryByText("inner")).not.toBeInTheDocument();
  });

  it("renders the stuck panel when context is degraded (no orgId, no roles)", () => {
    mockUseSessionContext.mockReturnValue({
      data: { isSuperAdmin: false, organizationId: null, roles: [], organization: null, subscription: null },
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    });
    render(
      <SessionGate label="Payroll">
        <div>inner</div>
      </SessionGate>,
    );
    expect(screen.getByTestId("session-gate-stuck")).toBeInTheDocument();
    expect(screen.queryByText("inner")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Retry/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sign out/i })).toBeInTheDocument();
  });

  it("renders children when context is healthy", () => {
    mockUseSessionContext.mockReturnValue({
      data: {
        isSuperAdmin: false,
        organizationId: "org-1",
        roles: ["admin"],
        organization: null,
        subscription: null,
      },
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    });
    render(
      <SessionGate label="Employees">
        <div>inner</div>
      </SessionGate>,
    );
    expect(screen.getByText("inner")).toBeInTheDocument();
    expect(screen.queryByTestId("session-gate-stuck")).not.toBeInTheDocument();
  });

  it("renders children for super-admin even with no orgId", () => {
    mockUseSessionContext.mockReturnValue({
      data: {
        isSuperAdmin: true,
        organizationId: null,
        roles: [],
        organization: null,
        subscription: null,
      },
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    });
    render(
      <SessionGate label="Platform">
        <div>inner</div>
      </SessionGate>,
    );
    expect(screen.getByText("inner")).toBeInTheDocument();
  });
});
