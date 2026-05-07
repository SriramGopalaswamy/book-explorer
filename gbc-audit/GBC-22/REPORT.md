# GBC-22: Direct Supabase calls inside components

**Severity:** Low · **Category:** Cross-cutting — Code Quality · **Status:** needs-input
**Branch:** `claude/execute-code-prompt-txEjJ` · **Jira:** https://grx10.atlassian.net/browse/GBC-22

## Root cause

`useEffect` blocks calling `supabase.from(...)` inside components (e.g. `BrandingSection` inside `Settings.tsx`). Mixes UI lifecycle with data fetching; bypasses React Query cache; risk of duplicate fetches and stale data on re-mount.

## Council verdict (compressed)

- *Contrarian:* For a one-shot, never-mutated config blob, a one-line `useEffect` is fine.
- *First-Principles:* Data fetching belongs in a hook so cache, error, loading and stale states all behave consistently.
- *Expansionist:* Pair with GBC-21 (Settings.tsx split) — the extracted Section components will inherit the new hooks naturally.
- *McKinsey:* Combine with GBC-21 — extracting components and converting their inline supabase calls to hooks is the same edit window.
- *Executor:* Identify all `useEffect → supabase.from` patterns; for each, create a `useX()` React Query hook in `src/hooks/`; replace the effect with the hook.

**Chosen approach (deferred under directive (b)):** Pure refactor. Bundle with GBC-21.

## What changed
Nothing on this branch.

## What didn't change (needs-input)
- Audit `grep -rE 'useEffect[^}]+supabase\.from' src/pages/ src/components/` — produces a punch-list.
- Convert each to `useX()` hook in `src/hooks/`.
- Wrap each consumer in the hook; remove the local effect/state.

## Risks
1. Initial render flash if loading-state handling differs. Match the existing skeleton pattern.
2. Lint/build/test could not run in this sandbox.
