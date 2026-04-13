---
name: plugin
description: >
  Scaffold a new GRX10 ERP module from first principles.
  Use when adding a new page, feature, or Supabase-backed module to the
  GRX10 ERP Suite (book-explorer). Covers: page component, data hook,
  Supabase migration + RLS, route registration, sidebar nav, and auth guards —
  using the exact patterns, imports, and conventions already in this codebase.
---

# GRX10 Plugin Development Guide

You are scaffolding a new module for the **GRX10 ERP Suite**. Every decision
below is derived from the actual codebase patterns — no invented abstractions.

Build one layer at a time. Verify each layer compiles and renders before moving on.

---

## GRX10 Architecture at a Glance

| Layer | Location | Key imports |
|---|---|---|
| Page component | `src/pages/<module>/<Feature>.tsx` | `MainLayout`, `usePagination`, `StatCard`, shadcn/ui, `toast` |
| Data hook | `src/hooks/use<Feature>.ts` | `useQuery`, `useMutation`, `supabase`, `useUserOrganization`, `toast` |
| Supabase migration | `supabase/migrations/<ts>_<desc>.sql` | `is_admin_or_hr_in_org()`, `security_invoker` views |
| Route | `src/App.tsx` | `Guarded`, `FinanceRoute`, `HRAdminRoute`, `PayrollRoute`, `ManagerRoute` |
| Sidebar nav | `src/components/layout/Sidebar.tsx` | `NavItem`, nav array for the target module group |
| Auth guard (new) | `src/components/auth/<Guard>Route.tsx` | `useCurrentRole`, `AccessDenied` |
| Types (if needed) | `src/integrations/supabase/types.ts` | Run `npx supabase gen types typescript` after migration |

---

## Step 1 — Name the module

Gather from the user:
- **Display name**: e.g. `Training Programs`
- **Module group**: `financial` | `hrms` | `inventory` | `procurement` | `sales` | `manufacturing` | `warehouse` | `performance`
- **Route path**: e.g. `/hrms/training`
- **Access level** (pick one):
  - `Guarded` only — all authenticated + subscribed users
  - `Guarded + HRAdminRoute` — admin and hr roles only
  - `Guarded + FinanceRoute` — admin and finance roles only
  - `Guarded + PayrollRoute` — admin, hr, and finance roles
  - `Guarded + ManagerRoute` — manager role and above
  - `ProtectedRoute + PlatformRoute` — super_admin only (no subscription guard)

Derive:
- **PascalCase name**: e.g. `TrainingPrograms`
- **camelCase name**: e.g. `trainingPrograms`
- **snake_case table**: e.g. `training_programs`
- **hook name**: `useTrainingPrograms`
- **query key**: `["training-programs", orgId]`

---

## Step 2 — Page component (start here, render first)

**File:** `src/pages/<module>/<PascalCase>.tsx`

```tsx
import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/ui/TablePagination";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Trash2, Plus, Search } from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import { toast } from "sonner";
import {
  use<PascalCase>, useCreate<PascalCase>, useUpdate<PascalCase>, useDelete<PascalCase>,
  type <PascalCase>Item,
} from "@/hooks/use<PascalCase>";
import { useIsAdminOrHR } from "@/hooks/useEmployees"; // or useCurrentRole from @/hooks/useRoles

export default function <PascalCase>() {
  const [search, setSearch] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<<PascalCase>Item | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<<PascalCase>Item | null>(null);
  const [form, setForm] = useState({ name: "" });

  const { data: isAdmin } = useIsAdminOrHR();
  const { data: items = [], isLoading } = use<PascalCase>();
  const create = useCreate<PascalCase>();
  const update = useUpdate<PascalCase>();
  const remove = useDelete<PascalCase>();

  const filtered = items.filter((i) =>
    i.name?.toLowerCase().includes(search.toLowerCase())
  );
  const pagination = usePagination(filtered, 10);

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    if (editTarget) {
      await update.mutateAsync({ id: editTarget.id, ...form });
      setEditTarget(null);
    } else {
      await create.mutateAsync(form);
      setIsAddOpen(false);
    }
    setForm({ name: "" });
  };

  return (
    <MainLayout title="<Display Name>" subtitle="Manage your <display name>.">
      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Total" value={items.length} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle><Display Name></CardTitle>
          {isAdmin && (
            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add <Display Name></DialogTitle>
                  <DialogDescription>Fill in the details below.</DialogDescription>
                </DialogHeader>
                <Input value={form.name} onChange={(e) => setForm({ name: e.target.value })} placeholder="Name" />
                <DialogFooter>
                  <Button onClick={handleSubmit} disabled={create.isPending}>
                    {create.isPending ? "Saving..." : "Save"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>

        <CardContent>
          <div className="flex items-center gap-2 mb-4">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Created</TableHead>
                    {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.currentItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(item.created_at).toLocaleDateString()}
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => { setEditTarget(item); setForm({ name: item.name }); }}>
                                <Pencil className="h-4 w-4 mr-2" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => setDeleteTarget(item)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                        No items found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              <TablePagination {...pagination} />
            </>
          )}
        </CardContent>
      </Card>

      {/* Edit dialog — reuses same form */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit <Display Name></DialogTitle></DialogHeader>
          <Input value={form.name} onChange={(e) => setForm({ name: e.target.value })} />
          <DialogFooter>
            <Button onClick={handleSubmit} disabled={update.isPending}>
              {update.isPending ? "Saving..." : "Update"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={async () => {
                if (deleteTarget) {
                  await remove.mutateAsync(deleteTarget.id);
                  setDeleteTarget(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}
```

**Status badge helper** (copy from any existing page, e.g. Attendance.tsx):
```tsx
const statusStyles: Record<string, string> = {
  active:   "bg-success/10 text-success border-success/30",
  inactive: "bg-muted text-muted-foreground border-border",
  pending:  "bg-warning/10 text-warning border-warning/30",
};
```

---

## Step 3 — Data hook

**File:** `src/hooks/use<PascalCase>.ts`

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { toast } from "sonner";

export interface <PascalCase>Item {
  id: string;
  organization_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface Create<PascalCase>Data {
  name: string;
}

export function use<PascalCase>() {
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;

  return useQuery({
    queryKey: ["<snake_case>", orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("<snake_case>")
        .select("*")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as <PascalCase>Item[];
    },
    enabled: !!orgId,
  });
}

export function useCreate<PascalCase>() {
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (payload: Create<PascalCase>Data) => {
      const { error } = await supabase
        .from("<snake_case>")
        .insert({ ...payload, organization_id: orgId });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["<snake_case>", orgId] });
      toast.success("<Display Name> created");
    },
    onError: (e) => toast.error(String(e)),
  });
}

export function useUpdate<PascalCase>() {
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...payload }: Partial<Create<PascalCase>Data> & { id: string }) => {
      const { error } = await supabase
        .from("<snake_case>")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("organization_id", orgId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["<snake_case>", orgId] });
      toast.success("<Display Name> updated");
    },
    onError: (e) => toast.error(String(e)),
  });
}

export function useDelete<PascalCase>() {
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId;
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("<snake_case>")
        .delete()
        .eq("id", id)
        .eq("organization_id", orgId); // belt-and-suspenders org fence
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["<snake_case>", orgId] });
      toast.success("<Display Name> deleted");
    },
    onError: (e) => toast.error(String(e)),
  });
}
```

**If the module needs a join view** (like `employee_full_profiles`), query the view instead:
```ts
.from("<snake_case>_full")  // the security_invoker view
.select("*, profiles(full_name, department)")
```

---

## Step 4 — Supabase migration

**Filename:** `supabase/migrations/<YYYYMMDDHHmmss>_add_<snake_case>_table.sql`

```sql
-- ============================================================
-- Add <snake_case> table for GRX10 <module> module
-- ============================================================

CREATE TABLE IF NOT EXISTS public.<snake_case> (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS <snake_case>_org_idx ON public.<snake_case>(organization_id);

ALTER TABLE public.<snake_case> ENABLE ROW LEVEL SECURITY;

-- ── Self-service: authenticated users see their own org's records ────────────
CREATE POLICY "<snake_case>_select_own_org"
  ON public.<snake_case> FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
  ));

-- ── Admin/HR: full CRUD within their org (Pattern A — table has org_id) ──────
CREATE POLICY "<snake_case>_insert_admin_hr"
  ON public.<snake_case> FOR INSERT TO authenticated
  WITH CHECK (is_admin_or_hr_in_org(auth.uid(), organization_id));

CREATE POLICY "<snake_case>_update_admin_hr"
  ON public.<snake_case> FOR UPDATE TO authenticated
  USING (is_admin_or_hr_in_org(auth.uid(), organization_id));

CREATE POLICY "<snake_case>_delete_admin_hr"
  ON public.<snake_case> FOR DELETE TO authenticated
  USING (is_admin_or_hr_in_org(auth.uid(), organization_id));
```

**RLS pattern reference** (already in prod — use verbatim):

| Situation | USING clause |
|---|---|
| Table has `organization_id` | `is_admin_or_hr_in_org(auth.uid(), organization_id)` |
| Table has `profile_id` FK | `is_admin_or_hr_in_org(auth.uid(), (SELECT p.organization_id FROM public.profiles p WHERE p.id = profile_id))` |
| System log (no org col) | `is_admin_or_hr_in_org(auth.uid(), (SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()))` |

**If you need a joined read-only view** (optional, for complex selects):
```sql
CREATE OR REPLACE VIEW public.<snake_case>_full
WITH (security_invoker = on) AS   -- RLS on both tables enforced for caller
SELECT s.*, p.full_name, p.department
FROM   public.<snake_case> s
LEFT JOIN public.profiles p ON p.id = s.profile_id;
```

Run: `npx supabase migration up` → then `npx supabase gen types typescript --local > src/integrations/supabase/types.ts`

---

## Step 5 — Register the route in `src/App.tsx`

**Import** (add to the correct module import block comment):
```tsx
import <PascalCase> from "./pages/<module>/<PascalCase>";
```

**Route** (add before the `{/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}` comment):

```tsx
{/* Choose the right guard: */}

{/* All authenticated + subscribed users: */}
<Route path="/<module>/<feature>" element={<Guarded><PascalCase /></Guarded>} />

{/* HR + Admin only: */}
<Route path="/<module>/<feature>" element={<Guarded><HRAdminRoute><PascalCase /></HRAdminRoute></Guarded>} />

{/* Finance + Admin only: */}
<Route path="/<module>/<feature>" element={<Guarded><FinanceRoute><PascalCase /></FinanceRoute></Guarded>} />

{/* Admin + HR + Finance (payroll-style): */}
<Route path="/<module>/<feature>" element={<Guarded><PayrollRoute><PascalCase /></PayrollRoute></Guarded>} />

{/* Manager and above: */}
<Route path="/<module>/<feature>" element={<Guarded><ManagerRoute><PascalCase /></ManagerRoute></Guarded>} />

{/* Super-admin platform page (no SubscriptionGuard): */}
<Route path="/platform/<feature>" element={<ProtectedRoute><PlatformRoute><PascalCase /></PlatformRoute></ProtectedRoute>} />
```

---

## Step 6 — Add sidebar nav entry in `src/components/layout/Sidebar.tsx`

Find the right nav array at the top of the file (not inside the component):

| Module group | Array to edit |
|---|---|
| Financial Suite | `financialNav` |
| HRMS (admin/hr view) | `hrmsNav` |
| HRMS (employee view) | `employeeHrmsNav` |
| HRMS (manager view) | `managerHrmsNav` |
| HRMS (finance view) | `financeHrmsNav` |
| Inventory | `inventoryNav` |
| Procurement | `procurementNav` |
| Sales | `salesNav` |
| Manufacturing | `manufacturingNav` |
| Warehouse | `warehouseNav` |
| Performance | `performanceNav` |

Add your entry:
```ts
{ name: "<Display Name>", path: "/<module>/<feature>", icon: <LucideIcon>, module: "<module-group>" },
```

All icons are imported from `lucide-react` at the top of Sidebar.tsx. Pick from existing imports or add a new one.

**Role-gated nav**: The sidebar already filters nav arrays by `currentRole`. If your feature should only appear in the admin/hr sidebar but NOT employee/manager sidebars, add it to `hrmsNav` (not `employeeHrmsNav` or `managerHrmsNav`).

---

## Verification Checklist

- [ ] Page renders at route without console errors or TS errors
- [ ] Sidebar nav item appears, highlights on correct route, persists collapse state
- [ ] `orgId` is defined before any Supabase query fires (`enabled: !!orgId`)
- [ ] Role guard redirects to `<AccessDenied>` for users without the right role
- [ ] Migration applied (`npx supabase migration up`)
- [ ] TypeScript types regenerated after migration
- [ ] RLS blocks a second org's session from reading the first org's records
- [ ] `toast.success` fires on create/update/delete; `toast.error` fires on failure
- [ ] `usePagination` + `<TablePagination>` renders and works with filtered data
- [ ] Loading state shows `<Skeleton>` rows, not broken layout
- [ ] `npm run build` (or `npx tsc --noEmit`) passes with zero errors

---

## GRX10-Specific Pitfalls

**`orgId` is undefined on first render** — always `enabled: !!orgId` on every query. `useUserOrganization` has 10-minute staleTime so it's fast but still async.

**Wrong role hook** — `useIsAdminOrHR()` from `@/hooks/useEmployees` is the legacy version (no org scope). For new modules use `useCurrentRole()` from `@/hooks/useRoles` which is fully org-scoped and prevents cross-tenant privilege escalation.

**Cross-tenant RLS gaps** — always add `.eq("organization_id", orgId)` in your JS delete/update queries as a belt-and-suspenders check, even though the RLS `USING` clause already enforces it server-side.

**Missing `Guarded` wrapper** — routes that use only `<ProtectedRoute>` bypass the `<SubscriptionGuard>`. Only platform routes (`/platform/...`) intentionally skip subscription enforcement.

**Sidebar nav not showing** — check which role-specific nav array you added to. `hrmsNav` is only rendered for admin/hr roles. `employeeHrmsNav` renders for employees. If you want the feature visible to all authenticated users, add it to `navigation[]` (the main array at the top).

**`updated_at` not refreshing** — pass `updated_at: new Date().toISOString()` explicitly in update mutations (Supabase triggers aren't guaranteed in this project).

**TypeScript complaining about table name** — after a new migration, run `npx supabase gen types typescript --local` and paste into `src/integrations/supabase/types.ts`. Until then, cast with `supabase.from("<table>" as any)` temporarily.

**Dev mode RBAC** — use the purple DevToolbar (right edge of screen) to impersonate roles and verify nav/access changes without logging out.

---

Start by asking the user the three questions in Step 1, then proceed one layer at a time.
