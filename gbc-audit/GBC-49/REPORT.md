# GBC-49: E-Invoices — fake IRN generation

**Severity:** High · **Category:** Screen Review — Financial Suite · **Status:** parked (separate workstream)
**Parked:** 2026-05-08 — user-confirmed not in audit scope.

## What's still broken (compliance gap)

`src/hooks/useEInvoices.ts:167-168` generates a fake IRN with `Math.random()` instead of calling the NIC e-invoice API. Any invoice "generated" via this path is **not legally compliant** under Indian GST rules; production records carrying these fake IRNs need to be reissued through a real GSP integration.

```ts
// Simulate IRN generation (in production, this would call the NIC API via edge function)
const irn = `IRN${Date.now()}${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
```

## Why parked

NIC e-invoice integration requires:
1. GSP (GST Suvidha Provider) credentials with the National Informatics Centre or an authorized GSP partner (paid).
2. A sandbox period for testing the OAuth handshake, payload schema, IRN/QR retrieval.
3. Legal review of how to handle the existing in-production fake-IRN records (re-issue path, customer notifications).

None of that is in the audit's scope; it's a separate compliance workstream that needs procurement + legal sign-off before engineering can take it on.

## Minimum mitigation suggested (not done in this branch)

Until the real integration ships, consider disabling the "Generate IRN" button at the UI layer with a clear banner explaining the limitation. That avoids more fake IRNs leaking into production. Suggested code change:

```tsx
// src/pages/financial/EInvoices.tsx — replace the Generate IRN button with:
<Tooltip>
  <Button disabled>Generate IRN (NIC integration not configured)</Button>
  <TooltipContent>
    Configure your GSP credentials in Settings → Compliance to enable real
    IRN generation. The previous "Generate IRN" action created randomised
    IDs that are NOT legally valid — those invoices need to be reissued.
  </TooltipContent>
</Tooltip>
```

User chose to leave it as-is for now; recorded for future tracking.
