# GBC-45: Exchange Rates — IAS 21 calculation on incomplete data

**Severity:** Low (per Jira) — should be Medium · **Category:** Screen Review — Financial Suite · **Status:** needs-input

## Root cause
"Unrealized FX Gain/Loss" computed by looping over the `financialRecords` array client-side. `useFinancialRecords` is paginated; the loop only sees the page. Result: IAS 21 reporting can be silently wrong by orders of magnitude.

## Council verdict (compressed)
Move the calculation server-side. A `unrealized_fx_pnl(as_of date)` SQL function joins `financial_records` × `currencies` × `exchange_rates` once over the whole dataset; returns one number per currency. Frontend displays the function output.

## Status
needs-input — RPC + hook rewrite. Severity should be re-rated — incorrect IAS 21 reporting is a compliance issue.

## Risks
1. The SQL function must respect period locks; a closed period's FX rates are frozen.
2. Lint/build/test could not run in this sandbox.
