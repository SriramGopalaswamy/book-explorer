---
name: plugin
description: >
  Scaffold a new ERP plugin/module for the book-explorer project from first principles.
  Use this skill when the user wants to add a new page, feature module, or integration
  to the book-explorer ERP system. Follows Andrej Karpathy's teaching philosophy:
  start minimal, build incrementally, understand every layer before adding the next.
---

# Plugin Development — Karpathy Style

You are helping the developer build a new ERP module for the book-explorer project.
Follow Andrej Karpathy's approach: **understand before you build, build from the smallest
working unit outward, never add complexity you don't yet need**.

---

## Philosophy

> "The best way to understand something is to build it from scratch." — Karpathy

Applied here:
- Start with a single page component that renders static content
- Add data fetching only once the UI shape is clear
- Wire up the route and nav entry only after the component works in isolation
- Add RBAC guards and RLS policies last, once the happy path is proven

Never scaffold everything at once. Each step must be independently runnable.

---

## Anatomy of a book-explorer Module

Every module consists of exactly these layers (add them in order):

```
1. Page component        src/pages/<module>/<Feature>.tsx
2. Custom hook           src/hooks/use<Feature>.ts
3. Supabase migration    supabase/migrations/<timestamp>_<feature>.sql
4. Route entry           src/App.tsx
5. Sidebar nav entry     src/components/layout/Sidebar.tsx
6. Auth guard (optional) src/components/auth/<Guard>Route.tsx
```

---

## Step-by-Step Workflow

### Step 1 — Name the module

Ask the user for:
- **Module name** (e.g. `training`, `procurement`, `assets`)
- **Route path** (e.g. `/hrms/training`)
- **Access level** (who can see it: all authenticated users / HR admins / finance / superadmin)

Derive from these:
- Page file: `src/pages/<module>/<PascalCase>.tsx`
- Hook file: `src/hooks/use<PascalCase>.ts`
- Table name: `<snake_case>` (Supabase)

---

### Step 2 — Scaffold the page component (minimal)

Create `src/pages/<module>/<Feature>.tsx` with the smallest possible working component:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function <Feature>() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight"><Feature Title></h1>
        <p className="text-muted-foreground">Manage your <feature description>.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Coming soon</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Data will appear here.</p>
        </CardContent>
      </Card>
    </div>
  );
}
```

**Stop here and verify**: import this component manually in a test route before continuing.

---

### Step 3 — Add the route in `src/App.tsx`

Find the import block for the relevant module group (e.g. `// HRMS`, `// Financial Suite`)
and add:

```tsx
import <Feature> from "./pages/<module>/<Feature>";
```

Then inside the `<Routes>` tree, inside the appropriate `<ProtectedRoute>` wrapper:

```tsx
<Route path="/<module>/<feature>" element={<Feature />} />
```

For access-restricted routes, wrap with the appropriate guard:
- All authenticated users: `<ProtectedRoute>`
- HR admins only: `<HRAdminRoute>`
- Finance roles: `<FinanceRoute>`
- Payroll: `<PayrollRoute>`
- Managers: `<ManagerRoute>`

---

### Step 4 — Add the Supabase table (if needed)

Create `supabase/migrations/<YYYYMMDDHHmmss>_add_<feature>_table.sql`:

```sql
-- <feature> table
create table if not exists public.<feature>s (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS
alter table public.<feature>s enable row level security;

-- Users can only see records for their own organization
create policy "<feature>s_select" on public.<feature>s
  for select using (
    organization_id in (
      select organization_id from public.profiles where id = auth.uid()
    )
  );

create policy "<feature>s_insert" on public.<feature>s
  for insert with check (
    organization_id in (
      select organization_id from public.profiles where id = auth.uid()
    )
  );

create policy "<feature>s_update" on public.<feature>s
  for update using (
    organization_id in (
      select organization_id from public.profiles where id = auth.uid()
    )
  );
```

Run locally: `npx supabase migration up`

---

### Step 5 — Write the data hook

Create `src/hooks/use<Feature>.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { toast } from "sonner";

export function use<Feature>() {
  const { organizationId } = useUserOrganization();
  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["<feature>s", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("<feature>s")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  const create = useMutation({
    mutationFn: async (payload: { name: string }) => {
      const { error } = await supabase
        .from("<feature>s")
        .insert({ ...payload, organization_id: organizationId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["<feature>s"] });
      toast.success("<Feature> created");
    },
    onError: (e) => toast.error(String(e)),
  });

  return { items, isLoading, create };
}
```

---

### Step 6 — Wire up the sidebar nav entry

Open `src/components/layout/Sidebar.tsx`. Find the nav group that matches the module
(search for the group label, e.g. `"HR & People"` or `"Finance"`).

Add a new nav item to that group following the existing pattern:

```tsx
{
  title: "<Feature Title>",
  href: "/<module>/<feature>",
  icon: <IconName>,  // import from lucide-react
}
```

---

## Verification Checklist

After all steps are complete, confirm:

- [ ] Page renders at the route without console errors
- [ ] Sidebar nav item appears and highlights on the correct route
- [ ] `useUserOrganization` returns a valid org before any Supabase queries run
- [ ] Supabase migration applied (`npx supabase migration up`)
- [ ] TypeScript compiles (`npm run build` or `npx tsc --noEmit`)
- [ ] RLS policy blocks cross-org access (test with a second org's session)
- [ ] Auth guard rejects users who lack the required role

---

## Common Pitfalls

**Querying before org is loaded** — always check `enabled: !!organizationId` on queries.

**Forgetting the RLS policy** — every table needs a `select` policy or all reads return empty.

**Missing the Supabase type** — after adding a new table, run `npx supabase gen types typescript`
and update `src/integrations/supabase/types.ts`.

**Route conflicts** — scan `App.tsx` for existing paths before registering a new one.

---

Now ask the user for the module name, route, and access level, then proceed step by step.
