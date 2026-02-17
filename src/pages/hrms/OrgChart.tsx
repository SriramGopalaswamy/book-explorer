import { useMemo } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { GitBranch, Users, ShieldAlert } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdminOrHR } from "@/hooks/useEmployees";

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

function OrgNode({ node, depth = 0 }: { node: ProfileNode; depth?: number }) {
  const initials = (node.full_name || "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className={depth > 0 ? "ml-8 border-l-2 border-border pl-4" : ""}>
      <div className="flex items-center gap-3 rounded-lg border border-border p-3 mb-2 hover:bg-muted/30 transition-colors">
        <Avatar className="h-10 w-10">
          <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-medium text-sm truncate">{node.full_name || "Unnamed"}</p>
            {node.status === "inactive" && (
              <Badge variant="outline" className="text-xs bg-muted text-muted-foreground">Inactive</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {node.job_title || "No title"}{node.department ? ` · ${node.department}` : ""}
          </p>
        </div>
        {node.children.length > 0 && (
          <Badge variant="outline" className="text-xs shrink-0">
            {node.children.length} report{node.children.length !== 1 ? "s" : ""}
          </Badge>
        )}
      </div>
      {node.children.length > 0 && (
        <div className="space-y-1">
          {node.children.map((child) => (
            <OrgNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function OrgChart() {
  const { data: isAdmin, isLoading: roleLoading } = useIsAdminOrHR();

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["org-chart-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, department, job_title, avatar_url, manager_id, status")
        .order("full_name");
      if (error) throw error;
      return data as Omit<ProfileNode, "children">[];
    },
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

  if (!roleLoading && !isAdmin) {
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
              <GitBranch className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{deptCounts.length}</div>
              <p className="text-xs text-muted-foreground">Active departments</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Top-Level</CardTitle>
              <GitBranch className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{tree.length}</div>
              <p className="text-xs text-muted-foreground">Without managers assigned</p>
            </CardContent>
          </Card>
        </div>

        {/* Department Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Departments</CardTitle>
            <CardDescription>Employee distribution by department</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {deptCounts.map(([dept, count]) => (
                <Badge key={dept} variant="outline" className="text-sm py-1 px-3">
                  {dept}: {count}
                </Badge>
              ))}
            </div>
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
              Reporting hierarchy based on manager assignments.
              {tree.length === profiles.length && profiles.length > 0 && (
                <span className="text-amber-500 ml-1">
                  No manager relationships set — assign managers in employee profiles to build the tree.
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading || roleLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : profiles.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="mx-auto h-12 w-12 mb-3" />
                <p>No employees found</p>
              </div>
            ) : (
              <div className="space-y-1">
                {tree.map((node) => (
                  <OrgNode key={node.id} node={node} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
