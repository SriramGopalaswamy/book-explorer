# GBC-12: Client-side PDF generation (Stability)

**Severity:** High · **Category:** Cross-cutting — Performance & Reliability · **Status:** needs-input

## Root cause
`src/hooks/usePdfExport.ts` (and similar) generates PDFs in-browser via jsPDF or html2canvas. For multi-page reports (year-long General Ledger, 50-employee bulk payslips), browser tabs OOM/crash. Memory cost scales with rendered pixel area for canvas-based pipelines.

## Council verdict (compressed)
- *Contrarian:* Single-page invoice PDFs are fine in browser; only big reports break.
- *First-Principles:* PDF rendering is a server-side concern; the browser sends a job, polls, downloads.
- *Expansionist:* Same pattern probably applied to CSV/XLSX exports too — audit those.
- *McKinsey:* Move heavy reports first (GL, year-end Trial Balance, bulk payslips); leave light ones (single invoice/payslip) in-browser for now.
- *Executor:* Add a Supabase Edge Function `generate_report` that takes (report_type, params) and returns a signed URL. Frontend posts the job, opens a "preparing" toast, polls a `report_jobs` table or listens via Supabase Realtime channel.

## Status
needs-input — new edge function, schema (job table), polling/realtime hook, and per-report-type handlers. Light single-document PDFs may stay client-side initially.

## Risks
1. Server-side rendering ≠ pixel-perfect WYSIWYG; HTML-to-PDF (Playwright headless) preserves fidelity better than jsPDF anyway, so the migration is a quality upgrade.
2. Job table needs RLS — only the requester or admin/HR can see their own jobs.
3. Lint/build/test could not run in this sandbox.
