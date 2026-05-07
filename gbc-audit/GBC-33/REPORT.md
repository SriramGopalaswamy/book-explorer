# GBC-33: Customers — hardcoded 15-char GSTIN validation

**Severity:** High · **Category:** Screen Review — Financial Suite · **Status:** needs-input

## Root cause
`handleSubmit` in Customers.tsx enforces a 15-char alphanumeric tax ID — Indian GSTIN format. International customers (US EIN 9 digits, EU VAT varies) fail validation.

Also inherits systemic findings: `.limit(N)` on `useCustomers`, search-on-downloaded-array, missing referential guards on delete.

## Council verdict (compressed)
- Tax-ID validation must be country-specific. Customer schema has a `country` field → validate the tax_id format against the country's pattern. Use a small lookup (`{ IN: /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z][Z][0-9A-Z]$/, US: /^\d{2}-\d{7}$/, ... }`) or store as opaque string with a country-tagged free-text field.
- Inherit fixes from GBC-1 (server-side aggregations), GBC-14 (FTS), GBC-31 (pagination).

## Status
needs-input — code change in `src/pages/financial/Customers.tsx` validation + per-country regex map (or relax to opaque string). Inherits foundation fixes.

## Risks
1. Existing data may have non-conforming tax IDs entered as workarounds; migration must preserve them.
2. Lint/build/test could not run in this sandbox.
