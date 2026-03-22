

## Polish & QA Plan — Automation Studio

### Issues Found

1. **`Workflows.tsx` is orphaned** — 725 lines of dead code. The route redirects to `/financial/automation`, so this file is never rendered. Should be deleted.

2. **`MessageDebugPanel` React key warning** — Uses `<>` fragments inside `.map()` without keys on the fragment. Should use `<React.Fragment key={msg.id}>`.

3. **Automation Dashboard readability** — The Live Automation Tracker table has 10 columns crammed into one horizontal scroll. On typical screens this is hard to scan. Should consolidate secondary info (Last Channel + Last Message Status into one cell, Workflow Step + Next Action into one cell) to reduce to ~7 columns.

4. **Missing tooltips on action buttons** — The tracker table action buttons (Send Email, Send WhatsApp, Mark Acknowledged, View) have no tooltips. Users won't know what the icon-only buttons do.

5. **Invoice detail integration** — `WorkflowStatus` and `InvoiceMessageThread` only render when `organization_id` exists on the invoice object. The cast `(viewingInvoice as any).organization_id` is fragile — should fetch org from `useUserOrganization` instead.

6. **Empty state polish** — Builder section shows "Finish onboarding" warning when no org, but no empty state for the tracker when org exists but no runs. Current empty state is fine but could use the same rounded card style.

7. **Table row urgency colors** — `border-l-destructive` and `border-l-warning` reference theme tokens that may not exist. Should use explicit colors `border-l-red-500` / `border-l-amber-500`.

8. **`acknowledged` status** — `markAcknowledged` mutation updates invoice status to `"acknowledged"` but the invoices table status column may not accept this value if there's a check constraint. This needs validation.

### Plan

#### 1. Delete orphaned `Workflows.tsx`
Remove `src/pages/financial/Workflows.tsx` and its import from `App.tsx`.

#### 2. Fix MessageDebugPanel React fragment keys
Replace `<>` with `<React.Fragment key={msg.id}>` in the messages `.map()`.

#### 3. Add tooltips to tracker action buttons
Wrap each icon button in `<Tooltip>` with labels: "Send Email Reminder", "Send WhatsApp Reminder", "Mark Acknowledged", "View Details".

#### 4. Fix invoice detail org fallback
In `Invoicing.tsx`, use `orgData?.organizationId` from the hook instead of casting `viewingInvoice.organization_id`.

#### 5. Fix urgency border colors
Change `border-l-destructive` → `border-l-red-500`, `border-l-warning` → `border-l-amber-500`, `border-l-success` → `border-l-emerald-500` for guaranteed Tailwind output.

#### 6. Consolidate tracker table columns
Merge "Last Channel" + "Last Message Status" into a single "Last Message" column. Merge "Workflow Step" + "Next Action" into a single "Progress" column. Reduces from 10 → 7 columns.

#### 7. Minor polish
- Add `Tooltip` import to `AutomationDashboard.tsx`
- Ensure consistent loading skeleton widths
- Clean up any unused imports after Workflows.tsx removal

### Files Changed
- `src/pages/financial/AutomationDashboard.tsx` — tooltips, column consolidation, color fixes
- `src/components/financial/MessageDebugPanel.tsx` — fragment key fix
- `src/pages/financial/Invoicing.tsx` — org fallback fix
- `src/pages/financial/Workflows.tsx` — delete
- `src/App.tsx` — remove Workflows import

