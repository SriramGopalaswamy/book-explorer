# GBC-21: Massive monolithic page files

**Severity:** High · **Category:** Cross-cutting — Code Quality · **Status:** needs-input
**Branch:** `claude/execute-code-prompt-txEjJ` · **Jira:** https://grx10.atlassian.net/browse/GBC-21

## Root cause

`wc -l` confirms `src/pages/Settings.tsx` = **1846 lines**, `src/pages/Profile.tsx` = **901 lines**. Settings packs `OrganizationInfoSection`, `BrandingSection`, `PayrollConfigSection`, `GoalCycleSection`, etc. into one file. Merge-conflict and review-velocity drag are both real on a multi-author team.

## Council verdict (compressed)

- *Contrarian:* Refactoring for size alone is a smell — split when the file is *changing* often, not when it's big. A frozen 1800-line file is fine.
- *First-Principles:* A page should be a thin composition root that imports section components. Sections are independently testable units.
- *Expansionist:* Audit every page > 500 lines; produce a per-page split plan.
- *McKinsey:* Settings.tsx first (highest churn — Org admin workflows touch it weekly). Profile.tsx second.
- *Executor:* Per section, extract to `src/components/settings/<Name>Section.tsx` (already an existing folder pattern); preserve all props/handlers; commit one section per PR; verify pixel-equivalence in Settings.

**Chosen approach (deferred under directive (b)):** Pure refactor; status `needs-input`. Each extraction risks dropping a state hook or handler — the CLAUDE.md "Regression Prevention Protocol" is exactly the playbook (list every section's fields/handlers before extracting).

## What changed
Nothing on this branch.

## What didn't change (needs-input — extraction order)
1. `OrganizationInfoSection` → `src/components/settings/OrganizationInfoSection.tsx`
2. `BrandingSection` → `src/components/settings/BrandingSection.tsx` (also benefits GBC-22 — direct supabase calls inside it)
3. `PayrollConfigSection` → `src/components/settings/PayrollConfigSection.tsx`
4. `GoalCycleSection` → `src/components/settings/GoalCycleSection.tsx`
5. Remaining sections per `grep -n '^function ' src/pages/Settings.tsx`.
6. After Settings, repeat for Profile.tsx and any other page > 500 lines (audit pending).

For each extraction, follow CLAUDE.md Regression Prevention Protocol: enumerate fields/handlers/routes touched, write list, perform extraction, diff-grep `^-` to verify no field disappeared.

## Risks
1. User-management deactivation flow (`initiateDeactivateOrDelete()`) per CLAUDE.md must remain reachable from extracted sections. Do not break.
2. Tests are the safety net; ensure `npm run test` passes after each extraction.
3. Lint/build/test could not run in this sandbox.
