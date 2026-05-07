# GBC-53: CA Dashboard — false-positive Trial Balance

**Severity:** High · **Category:** Screen Review — Financial Suite · **Status:** needs-input

## Root cause
"Trial Balance OK" badge is computed in the browser from a paginated `trialBalance` array via `.reduce(...)`. With pagination, the sum is partial → shows "OK" when it actually isn't (and vice versa). False sense of security for the CA reading this dashboard.

## Council verdict (compressed)
- TB balance check **must** be a server-side function: `SELECT (sum(debit) - sum(credit)) = 0 FROM journal_lines WHERE org = $1 AND period = $2`.
- All CA-facing health metrics must originate from authoritative DB queries, not client reductions.

## Status
needs-input — replace JS reducers with RPCs throughout the CA dashboard.

## Risks
1. **Critical** — current dashboard could be hiding real imbalances. Once fixed, real anomalies may surface; communicate the change.
2. Lint/build/test could not run in this sandbox.
