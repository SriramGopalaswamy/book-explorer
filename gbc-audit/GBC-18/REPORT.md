# GBC-18: Insecure governance tools (client-side flags)

**Severity:** Low · **Category:** Cross-cutting — Security & Multi-tenancy · **Status:** partially-resolved
**Branch:** `claude/execute-code-prompt-txEjJ`

## Root cause
`src/config/systemFlags.ts` defines `DEV_MODE` and `ALLOW_PERMISSION_EDITING` as `!isProduction && import.meta.env.VITE_X !== 'false'`. Inline comment claims "Hard-coded OFF in production builds". That's correct *for the bundle that ships in production* (Vite sets `MODE='production'`), but the issue's deeper concern stands: a staging build accidentally promoted to a public domain (or a developer build deployed by mistake) would have these flags ON and let any signed-in user impersonate.

The check is also bypassable client-side — anyone can flip the constant in the bundle and re-evaluate. The defense-in-depth pattern the issue prescribes (verify SuperAdmin role server-side) is correct.

## Council verdict (compressed)
- *Contrarian:* Build-time guarantee covers production; staging is staging.
- *First-Principles:* No security boundary is correctly placed in the browser. The RPC must verify role.
- *Expansionist:* The `Impersonate` feature (and any other dev-only governance tool) must call an RPC that itself checks role.
- *McKinsey:* Cheapest fix: server-side role check on the impersonation RPC.
- *Executor:* Find the impersonation RPC (likely an Edge Function); add `SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin'`-style guard.

## Status
needs-input — code change in the impersonation RPC.

## What didn't change
- Server-side role check on impersonation/permission-edit RPCs — must be implemented if not already.
- (No automated test added on this branch under directive (b); a regression test could pin "no client-only check on impersonation" once the RPC is identified.)

## Risks
1. If the RPC currently relies on the client-flag, adding a strict server check may break legitimate dev flows. Stage the rollout.
2. Lint/build/test could not run in this sandbox.
