import { test, expect, Route, Page } from "@playwright/test";

/**
 * End-to-end MS365 callback test running in a real Chromium context.
 *
 * Strategy:
 *  - Intercept the `ms365-auth` Edge Function call and return a fake session.
 *  - Intercept the `get_my_session_context` RPC and return a populated
 *    super-admin context (orgId + roles + isSuperAdmin).
 *  - Intercept `/auth/v1/token` so supabase-js does not try to refresh against
 *    the real backend.
 *  - Pre-seed `sessionStorage.ms365_oauth_state` and navigate directly to
 *    `/auth/callback?code=...&state=...`.
 *  - Assert: URL transitions to `/` WITHOUT a full page reload, and the
 *    session-context bootstrap completes with roles populated (RolesReadyGate
 *    must let the protected home route render).
 */

const FAKE_STATE = "playwright-state-token";
const FAKE_CODE = "playwright-auth-code";

const FAKE_USER_ID = "00000000-0000-0000-0000-00000000beef";
const FAKE_ORG_ID = "11111111-1111-1111-1111-111111111111";

const FAKE_SESSION = {
  access_token:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMGJlZWYiLCJlbWFpbCI6InBsYXl3cmlnaHRAdGVzdC5jb20iLCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImlhdCI6OTk5OTk5OTk5OSwiZXhwIjo5OTk5OTk5OTk5fQ.fake-signature",
  refresh_token: "fake-refresh-token",
  expires_in: 3600,
  expires_at: 9999999999,
  token_type: "bearer",
  user: {
    id: FAKE_USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: "playwright@test.com",
    app_metadata: { provider: "azure", providers: ["azure"] },
    user_metadata: { full_name: "Playwright User" },
    created_at: new Date().toISOString(),
  },
};

const FAKE_SESSION_CONTEXT = {
  is_super_admin: true,
  organization_id: FAKE_ORG_ID,
  roles: ["admin", "finance"],
  organization: {
    id: FAKE_ORG_ID,
    name: "Playwright Test Org",
    status: "active",
    org_state: "active",
    created_at: new Date().toISOString(),
  },
  subscription: {
    id: "sub-1",
    plan: "pro",
    status: "active",
    source: "manual",
    valid_until: "2099-12-31T00:00:00Z",
    is_read_only: false,
    enabled_modules: ["financial", "hrms", "inventory"],
  },
};

async function installSupabaseStubs(page: Page) {
  // Match any Supabase URL — local stub for both edge functions and RPC.
  await page.route("**/functions/v1/ms365-auth*", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ session: FAKE_SESSION }),
    });
  });

  await page.route("**/rest/v1/rpc/get_my_session_context*", async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(FAKE_SESSION_CONTEXT),
    });
  });

  // Block any other supabase REST/auth chatter so the test is fully hermetic.
  await page.route("**/auth/v1/**", async (route) => {
    const req = route.request();
    if (req.method() === "GET" && req.url().includes("/user")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(FAKE_SESSION.user),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    });
  });

  await page.route("**/rest/v1/**", async (route) => {
    // Default to empty list for any incidental table query.
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "[]",
    });
  });
}

test.describe("MS365 auth callback", () => {
  test("navigates to / without hard refresh and loads roles", async ({ page }) => {
    await installSupabaseStubs(page);

    // Track whether the page was hard-reloaded between the callback and home.
    let loadCount = 0;
    page.on("load", () => {
      loadCount += 1;
    });

    // Capture auth-trace events from the console so we can verify the SPA
    // navigation path was taken (callback_mount → navigate_home) without an
    // intervening full-page load.
    const traceEvents: Array<{ scope: string; type: string }> = [];
    page.on("console", (msg) => {
      const text = msg.text();
      const m = text.match(/\[auth-trace\] (\S+):(\S+) /);
      if (m) traceEvents.push({ scope: m[1], type: m[2] });
    });

    // Visit /auth first to bootstrap the SPA and seed sessionStorage.
    await page.goto("/auth");
    await page.evaluate((state) => {
      sessionStorage.setItem("ms365_oauth_state", state);
    }, FAKE_STATE);
    const loadsAfterAuth = loadCount;

    // Now drive the callback inside the SAME SPA instance (no hard reload).
    await page.evaluate(
      ({ code, state }) => {
        window.history.pushState({}, "", `/auth/callback?code=${code}&state=${state}`);
        window.dispatchEvent(new PopStateEvent("popstate"));
      },
      { code: FAKE_CODE, state: FAKE_STATE },
    );

    // Wait for navigation to /. Use URL assertion with reasonable timeout.
    await expect(page).toHaveURL(/\/$|\/#/, { timeout: 15_000 });

    // CRITICAL ASSERTION: no extra full-page load happened between /auth and /.
    // If AuthCallback required a hard refresh, loadCount would have incremented.
    expect(loadCount).toBe(loadsAfterAuth);

    // Verify auth-trace emitted the expected SPA-only flow.
    const types = traceEvents.map((e) => `${e.scope}:${e.type}`);
    expect(types).toContain("ms365:callback_mount");
    expect(types).toContain("ms365:exchange_complete");
    expect(types).toContain("ms365:set_session_complete");
    expect(types).toContain("ms365:navigate_home");

    // Verify session-context bootstrap resolved with populated roles.
    // RolesReadyGate would otherwise still be rendering "Loading your workspace…".
    // We assert on the in-memory react-query cache via window globals — the
    // useSessionContext hook persists to sessionStorage on resolve.
    const cached = await page.evaluate((uid) => {
      const raw = sessionStorage.getItem(`grx10_session_ctx_${uid}`);
      return raw ? JSON.parse(raw) : null;
    }, FAKE_USER_ID);

    expect(cached).toBeTruthy();
    expect(cached.organizationId).toBe(FAKE_ORG_ID);
    expect(cached.isSuperAdmin).toBe(true);
    expect(cached.roles).toEqual(expect.arrayContaining(["admin", "finance"]));

    // Ensure the workspace-loading spinner is gone (RolesReadyGate released).
    await expect(page.locator("text=Loading your workspace…")).toHaveCount(0);
  });

  test("CSRF state mismatch redirects to /auth without setting session", async ({ page }) => {
    await installSupabaseStubs(page);

    let exchangeCalled = false;
    await page.route("**/functions/v1/ms365-auth*", async (route) => {
      exchangeCalled = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ session: FAKE_SESSION }),
      });
    });

    await page.goto("/auth");
    await page.evaluate(() => {
      sessionStorage.setItem("ms365_oauth_state", "the-real-state");
    });

    await page.evaluate(() => {
      window.history.pushState(
        {},
        "",
        "/auth/callback?code=anything&state=attacker-state",
      );
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    await expect(page).toHaveURL(/\/auth$/, { timeout: 10_000 });
    expect(exchangeCalled).toBe(false);
  });
});
