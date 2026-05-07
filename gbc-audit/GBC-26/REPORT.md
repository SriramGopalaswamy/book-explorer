# GBC-26: `supabase.from("…" as any)` — bypassing type safety

**Severity:** High · **Category:** Cross-cutting — Database Code Patterns · **Status:** needs-input
**Branch:** `claude/execute-code-prompt-txEjJ` · **Jira:** https://grx10.atlassian.net/browse/GBC-26

## Root cause

Verified: 175 occurrences of `supabase.from("…" as any)` across 30 files (issue says 230+; recent cleanup may have brought it down). The generated `src/integrations/supabase/types.ts` exists (373KB) but the client (`src/integrations/supabase/client.ts`) probably does not pass `<Database>` to `createClient` — that's why every `from()` call needs an `as any` cast.

This is the database-call-site subset of **GBC-19**.

## Council verdict (compressed)

Same as GBC-19. The *one* high-leverage fix is to attach the generated `Database` type to the client; nearly every `as any` near a Supabase call disappears.

## What changed
Nothing on this branch.

## What didn't change (needs-input)

1. **Verify** `src/integrations/supabase/client.ts` does not pass `<Database>` (suspect it doesn't); if it doesn't, change to:
   ```ts
   import { createClient } from '@supabase/supabase-js';
   import { Database } from './types';
   export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
   ```
2. **Sweep** `supabase.from("X" as any)` → `supabase.from("X")` everywhere. Every cast in this shape is now redundant.
3. **Add CI ratchet** — a test that counts `as any` adjacent to `supabase.from(` and asserts the count does not increase.
4. **Schedule type regeneration** in CI: `supabase gen types typescript --linked > src/integrations/supabase/types.ts` after every migration.

## Risks
1. Untyped tables (e.g. tables added in a draft migration not yet linked) will compile-fail; either regenerate types or add the table to the migration tree first.
2. Some `as any` casts mask actual type bugs that surface as compile errors after the cleanup. That's the desired outcome — but expect a backlog.
3. Lint/build/test could not run in this sandbox.
