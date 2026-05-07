# GBC-23: Raw `<button>` instead of `<Button>` component

**Severity:** Medium · **Category:** Cross-cutting — Code Quality · **Status:** needs-input
**Branch:** `claude/execute-code-prompt-txEjJ` · **Jira:** https://grx10.atlassian.net/browse/GBC-23

## Root cause

Verified: `grep -rcE '<button[^>]*className=' src/ --include='*.tsx'` totals **7 occurrences** across the codebase (issue claims 45+ — recent cleanup may have reduced it, or different counting). Each represents a divergence from the shadcn `<Button>` component (`src/components/ui/button.tsx`), so loses focus rings, sizing variants, and disabled-state semantics.

## Council verdict (compressed)

- *Contrarian:* Some `<button>` usages are intentional (custom keyboard-shortcut triggers). Confirm before swapping.
- *First-Principles:* The design system is the source of truth; raw HTML is a leak.
- *Expansionist:* Same pattern likely on `<input>`/`<select>` — audit broader.
- *McKinsey:* 7 occurrences is small; one focused PR.
- *Executor:* `grep -rE '<button\b' src/ --include='*.tsx'` → review each → replace with `<Button variant="…">`.

**Chosen approach (deferred under directive (b)):** Pure refactor. `needs-input`.

## What changed
Nothing on this branch.

## What didn't change (needs-input)
Replace 7 raw `<button>` instances with `<Button>`; confirm any intentional ones (e.g. inside dropdown internals where Button collides with Radix slot expectations) and note them in code comments.

## Risks
1. Disabled-state visual differs slightly between raw button and Button — verify in dark/light mode.
2. Lint/build/test could not run in this sandbox.
