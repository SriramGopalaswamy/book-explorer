# GBC-20: Form boilerplate / state-management duplication

**Severity:** Medium · **Category:** Cross-cutting — Code Quality · **Status:** needs-input
**Branch:** `claude/execute-code-prompt-txEjJ` · **Jira:** https://grx10.atlassian.net/browse/GBC-20

## Root cause

Settings.tsx (and similar) repeats Label/Description/Input layouts and parallel `useState` + `useEffect` synchronisation blocks. `react-hook-form` and `zod` are already in `package.json` but unevenly adopted.

## Council verdict (compressed)

- *Contrarian:* Some forms are one-field affairs; react-hook-form adds complexity.
- *First-Principles:* Forms have three concerns — state, validation, layout. RHF + Zod handles 1+2; a `<FormField>` wrapper handles 3.
- *Expansionist:* Audit every form; classify by complexity; bring multi-field forms onto RHF first.
- *McKinsey:* Highest-value first — Settings (most complex), Employee onboarding, Bulk-upload mappers.
- *Executor:* Per form, compose with `useForm({ resolver: zodResolver(schema) })`, replace `value/onChange` plumbing with `register` or `Controller`. Tests stay green if existing display logic is preserved.

**Chosen approach (deferred under directive (b)):** Pure refactor; bundle with GBC-21 extractions.

## What changed
Nothing on this branch.

## What didn't change (needs-input)
Per-section plan inside each extracted Settings section (see GBC-21).

## Risks
1. RHF re-renders differ from raw useState; visual flicker is possible but rare.
2. Lint/build/test could not run in this sandbox.
