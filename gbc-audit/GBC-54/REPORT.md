# GBC-54: CA Audit Console — snapshot delay creates ghost errors

**Severity:** Medium · **Category:** Screen Review — Financial Suite · **Status:** needs-input

## Root cause
Audit Console persists "snapshots" in a separate audit table. When a CA fixes a mistake elsewhere, the snapshot still flags it as an anomaly until someone re-runs the audit. CAs chase "ghost errors" that have already been fixed.

## Council verdict (compressed)
- **Live re-validation:** when an audit row's source data is mutated (journal entry edited, account updated), mark the corresponding audit row as `stale: true`. UI shows "Source data has changed; re-run audit to confirm" alongside the row.
- Cheap implementation: triggers on the source tables that flip the relevant audit_row.is_stale flag.
- Bigger improvement: `re-audit changed entities only` button instead of full re-run.

## Status
needs-input — trigger plumbing + UI badge.

## Risks
1. Triggers add write overhead; keep them lightweight (single UPDATE).
2. Lint/build/test could not run in this sandbox.
