import { useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { GitBranch, Users, ShieldAlert, ChevronDown, ChevronRight, Building2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdminOrHR } from "@/hooks/useEmployees";
import { useIsDevModeWithoutAuth } from "@/hooks/useDevModeData";
import { mockEmployees } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface ProfileNode {
  id: string;
  full_name: string | null;
  department: string | null;
  job_title: string | null;
  avatar_url: string | null;
  manager_id: string | null;
  status: string | null;
  children: ProfileNode[];
}

function buildTree(profiles: Omit<ProfileNode, "children">[]): ProfileNode[] {
  const map = new Map<string, ProfileNode>();
  const roots: ProfileNode[] = [];

  profiles.forEach((p) => map.set(p.id, { ...p, children: [] }));

  profiles.forEach((p) => {
    const node = map.get(p.id)!;
    if (p.manager_id && map.has(p.manager_id)) {
      map.get(p.manager_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

function getInitials(name: string | null) {
  return (name || "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const DEPT_COLORS: Record<string, string> = {
  Engineering: "hsl(210 100% 56%)",
  Product: "hsl(280 80% 60%)",
  "Human Resources": "hsl(340 80% 58%)",
  Finance: "hsl(160 70% 45%)",
  Marketing: "hsl(30 90% 55%)",
  Sales: "hsl(50 95% 50%)",
  Operations: "hsl(200 80% 50%)",
};

function getDeptColor(dept: string | null) {
  return dept && DEPT_COLORS[dept] ? DEPT_COLORS[dept] : "hsl(var(--primary))";
}

// ─── Visual Tree Node ────────────────────────────────────────────────
function OrgTreeNode({
  node,
  isRoot = false,
  isLast = false,
  depth = 0,
}: {
  node: ProfileNode;
  isRoot?: boolean;
  isLast?: boolean;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children.length > 0;
  const deptColor = getDeptColor(node.department);

  return (
    <div className="relative flex flex-col items-center">
      {/* Vertical connector from parent */}
      {!isRoot && (
        <div
          className="absolute -top-6 left-1/2 -translate-x-px w-px h-6 bg-border/60"
        />
      )}

      {/* Node Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25, delay: depth * 0.04 }}
        className={cn(
          "relative group w-44 rounded-xl border bg-card shadow-sm transition-all duration-200",
          "hover:shadow-lg hover:-translate-y-0.5 hover:border-primary/40 cursor-default",
          node.status === "inactive" && "opacity-60"
        )}
      >
        {/* Top accent bar coloured by department */}
        <div
          className="h-1 w-full rounded-t-xl"
          style={{ background: deptColor }}
        />
        <div className="p-3 flex flex-col items-center gap-2 text-center">
          <div
            className="relative h-11 w-11 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-md"
            style={{ background: `${deptColor}cc` }}
          >
            {getInitials(node.full_name)}
            {node.status === "active" && (
              <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-success border-2 border-card" />
            )}
          </div>
          <div className="w-full">
            <p className="font-semibold text-xs leading-tight text-foreground truncate max-w-full">
              {node.full_name || "Unnamed"}
            </p>
            <p className="text-[10px] text-muted-foreground leading-tight truncate mt-0.5">
              {node.job_title || "No title"}
            </p>
            {node.department && (
              <Badge
                variant="outline"
                className="mt-1.5 text-[9px] px-1.5 py-0 h-4 border-0 rounded-full"
                style={{
                  background: `${deptColor}22`,
                  color: deptColor,
                }}
              >
                {node.department}
              </Badge>
            )}
          </div>
          {hasChildren && (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors mt-1"
            >
              {expanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              {node.children.length} report{node.children.length !== 1 ? "s" : ""}
            </button>
          )}
        </div>
      </motion.div>

      {/* Children */}
      <AnimatePresence>
        {hasChildren && expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            {/* Vertical stem down */}
            <div className="relative flex flex-col items-center">
              <div className="w-px h-6 bg-border/60" />
              {/* Horizontal bar spanning children */}
              <div className="relative flex items-start justify-center">
                {node.children.length > 1 && (
                  <div
                    className="absolute top-0 bg-border/60"
                    style={{
                      left: `calc(50% - ${((node.children.length - 1) / 2) * 192}px)`,
                      width: `${(node.children.length - 1) * 192}px`,
                      height: "1px",
                    }}
                  />
                )}
                <div className="flex gap-6 items-start">
                  {node.children.map((child, idx) => (
                    <OrgTreeNode
                      key={child.id}
                      node={child}
                      isLast={idx === node.children.length - 1}
                      depth={depth + 1}
                    />
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Legend ──────────────────────────────────────────────────────────
function DeptLegend({ deptCounts }: { deptCounts: [string, number][] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {deptCounts.map(([dept, count]) => (
        <div
          key={dept}
          className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium"
          style={{
            borderColor: `${getDeptColor(dept)}60`,
            background: `${getDeptColor(dept)}12`,
            color: getDeptColor(dept),
          }}
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: getDeptColor(dept) }}
          />
          {dept}: {count}
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────
export default function OrgChart() {
  const isDevMode = useIsDevModeWithoutAuth();
  const { data: isAdmin, isLoading: roleLoading } = useIsAdminOrHR();

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["org-chart-profiles", isDevMode],
    queryFn: async () => {
      if (isDevMode) {
        return mockEmployees.map((e) => ({
          id: e.id,
          full_name: e.full_name,
          department: e.department,
          job_title: e.job_title,
          avatar_url: e.avatar_url,
          manager_id: e.manager_id,
          status: e.status,
        })) as Omit<ProfileNode, "children">[];
      }
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, department, job_title, avatar_url, manager_id, status")
        .order("full_name");
      if (error) throw error;
      return data as Omit<ProfileNode, "children">[];
    },
    enabled: isDevMode || true,
  });

  const tree = useMemo(() => buildTree(profiles), [profiles]);

  const deptCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    profiles.forEach((p) => {
      const dept = p.department || "Unassigned";
      counts[dept] = (counts[dept] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [profiles]);

  if (!roleLoading && !isAdmin && !isDevMode) {
    return (
      <MainLayout title="Organization Chart" subtitle="Company hierarchy">
        <div className="flex flex-col items-center justify-center py-16 space-y-4">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <ShieldAlert className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold">Access Denied</h2>
          <p className="text-muted-foreground text-center max-w-md">
            You need Admin or HR role to view the organization chart.
          </p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title="Organization Chart" subtitle="Company hierarchy and reporting structure">
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Employees</CardTitle>
              <Users className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{profiles.length}</div>
              <p className="text-xs text-muted-foreground">Across all departments</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Departments</CardTitle>
              <Building2 className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{deptCounts.length}</div>
              <p className="text-xs text-muted-foreground">Active departments</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Management Levels</CardTitle>
              <GitBranch className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{tree.length}</div>
              <p className="text-xs text-muted-foreground">
                {tree.length === profiles.length && profiles.length > 0
                  ? "Assign managers in Employees to build the hierarchy"
                  : "Top-level nodes"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Department Legend */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Department Legend</CardTitle>
          </CardHeader>
          <CardContent>
            <DeptLegend deptCounts={deptCounts} />
          </CardContent>
        </Card>

        {/* Org Tree */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GitBranch className="h-5 w-5 text-primary" />
              Organization Tree
            </CardTitle>
            <CardDescription>
              Click the reports count on any node to collapse/expand. Coloured by department.
              {tree.length === profiles.length && profiles.length > 0 && (
                <span className="text-amber-500 ml-1">
                  {" "}No manager relationships set — assign managers in Employees to build the hierarchy.
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading || roleLoading ? (
              <div className="flex gap-8 justify-center py-8">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex flex-col items-center gap-4">
                    <Skeleton className="h-28 w-44 rounded-xl" />
                    <div className="flex gap-4">
                      <Skeleton className="h-28 w-44 rounded-xl" />
                      <Skeleton className="h-28 w-44 rounded-xl" />
                    </div>
                  </div>
                ))}
              </div>
            ) : profiles.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Users className="mx-auto h-16 w-16 mb-4 opacity-30" />
                <p className="text-lg font-medium">No employees found</p>
                <p className="text-sm mt-1">Add employees in the Employees module to build your org chart.</p>
              </div>
            ) : (
              /* Horizontally scrollable tree canvas */
              <div className="overflow-x-auto pb-8 pt-4">
                <div className="min-w-max flex gap-16 justify-center px-8">
                  {tree.map((root) => (
                    <OrgTreeNode key={root.id} node={root} isRoot depth={0} />
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
