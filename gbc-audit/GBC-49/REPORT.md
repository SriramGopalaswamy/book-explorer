# GBC-49: E-Invoices — IRN generation is FAKE

**Severity:** High · **Category:** Screen Review — Financial Suite · **Status:** needs-input

## Root cause
`useEInvoices.ts` "Generate IRN" generates a random string locally:
```
const irn = `IRN${Date.now()}${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
```
Comment in the code admits "Simulate IRN generation (in production, this would call the NIC API)". The IRN should be obtained from the NIC e-invoice API (https://einvoice1.gst.gov.in/Others/EVerifyApi). Companies treating these fake IRNs as compliant face GST penalties.

## Council verdict (compressed)
- This is a stub flagged for production. Treat as a critical compliance gap, not a code-cleanup task.
- Implement properly: NIC OAuth handshake + invoice payload builder + IRN/QR storage. Full integration requires NIC sandbox credentials and a paid integration with an authorized GSP (GST Suvidha Provider) or the NIC API directly.
- Until then, **disable the "Generate IRN" button** and surface a banner: "E-invoicing not configured. Configure your GSP credentials in Settings → Compliance to enable real IRN generation."

## Status
needs-input — major integration work. **Severity is correct (High); urgency is now (compliance).**

## Risks
1. Existing fake IRNs in production data are *not* legally valid; affected invoices need to be re-issued through the proper API.
2. Need explicit product/legal sign-off before disabling the button — companies relying on the fake flow will break.
3. Lint/build/test could not run in this sandbox.
