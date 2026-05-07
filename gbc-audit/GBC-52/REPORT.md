# GBC-52: Automation — drag-and-drop builder loses work on refresh

**Severity:** High · **Category:** Screen Review — Financial Suite · **Status:** needs-input

## Root cause
The workflow drag-and-drop builder stores the working draft in component memory. Tab close / refresh / crash → 20 minutes of work gone.

## Council verdict (compressed)
- **Auto-save to localStorage** every N seconds (cheap, private to user).
- **Server-side draft** — a `workflow_drafts` table where the in-progress structure is auto-saved to the user's account; survives device switches.
- Persist a `workflow_drafts.last_saved_at` and surface "Restored draft from 5 minutes ago" on the next visit.

## Status
needs-input — UI auto-save + (optionally) server-side draft schema.

## Risks
1. Server-side draft table grows unbounded; periodic cleanup of >30-day drafts.
2. Lint/build/test could not run in this sandbox.
