import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  GitBranch, Users, ShieldAlert, Building2,
  ChevronDown, ChevronRight, Search, ZoomIn, ZoomOut,
  Maximize2, X, Mail, Phone, CalendarDays,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdminOrHR } from "@/hooks/useEmployees";
import { useIsDevModeWithoutAuth } from "@/hooks/useDevModeData";
import { mockEmployees } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────
interface RawProfile {
  id: string;
  full_name: string | null;
  department: string | null;
  job_title: string | null;
  avatar_url: string | null;
  manager_id: string | null;
  status: string | null;
  email: string | null;
  phone: string | null;
  join_date: string | null;
}

interface ProfileNode extends RawProfile {
  children: ProfileNode[];
}

// ─── Layout constants ─────────────────────────────────────────────────
const NODE_W = 172;
const NODE_H = 110;
const H_GAP = 40;   // horizontal gap between siblings
const V_GAP = 72;   // vertical gap between levels

// ─── Colour helpers ────────────────────────────────────────────────────
const DEPT_PALETTE: Record<string, string> = {
  Engineering:      "210 100% 56%",
  Product:          "280 80% 62%",
  "Human Resources":"340 80% 58%",
  Finance:          "160 70% 45%",
  Marketing:        "30 90% 55%",
  Sales:            "50 95% 48%",
  Operations:       "200 80% 50%",
  Design:           "300 70% 58%",
  Legal:            "170 60% 42%",
};

function deptHsl(dept: string | null) {
  return dept && DEPT_PALETTE[dept] ? DEPT_PALETTE[dept] : "var(--primary)";
}
function deptColor(dept: string | null) {
  return `hsl(${deptHsl(dept)})`;
}

// ─── Tree builder ─────────────────────────────────────────────────────
function buildTree(profiles: RawProfile[]): ProfileNode[] {
  const map = new Map<string, ProfileNode>();
  profiles.forEach((p) => map.set(p.id, { ...p, children: [] }));
  const roots: ProfileNode[] = [];
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

// ─── Layout engine: assigns x/y to every node ─────────────────────────
interface LayoutNode {
  node: ProfileNode;
  x: number;
  y: number;
  width: number;          // subtree width
  collapsed: boolean;
  depth: number;
}

function measureSubtreeWidth(node: ProfileNode, collapsed: boolean): number {
  if (collapsed || node.children.length === 0) return NODE_W;
  const childrenWidth = node.children.reduce(
    (sum, child) => sum + measureSubtreeWidth(child, false) + H_GAP,
    -H_GAP
  );
  return Math.max(NODE_W, childrenWidth);
}

// We need a mutable collapse state passed from outside
function layoutTree(
  node: ProfileNode,
  x: number,
  y: number,
  collapsedIds: Set<string>,
  depth: number,
  out: LayoutNode[]
): number {
  const collapsed = collapsedIds.has(node.id);
  const subtreeW = measureSubtreeWidth(node, collapsed);

  out.push({ node, x, y, width: subtreeW, collapsed, depth });

  if (!collapsed && node.children.length > 0) {
    const childY = y + NODE_H + V_GAP;
    // total width of all children subtrees with gaps
    const totalChildW = node.children.reduce(
      (sum, c) => sum + measureSubtreeWidth(c, collapsedIds.has(c.id)) + H_GAP,
      -H_GAP
    );
    let childX = x + subtreeW / 2 - totalChildW / 2;

    for (const child of node.children) {
      const childW = measureSubtreeWidth(child, collapsedIds.has(child.id));
      layoutTree(child, childX, childY, collapsedIds, depth + 1, out);
      childX += childW + H_GAP;
    }
  }

  return subtreeW;
}

// Build full layout from multiple roots
function buildLayout(roots: ProfileNode[], collapsedIds: Set<string>): LayoutNode[] {
  const out: LayoutNode[] = [];
  let x = 0;
  for (const root of roots) {
    const w = layoutTree(root, x, 0, collapsedIds, 0, out);
    x += w + H_GAP * 2;
  }
  return out;
}

// ─── SVG bezier edge ──────────────────────────────────────────────────
function Edge({ parentX, parentY, childX, childY }: { parentX: number; parentY: number; childX: number; childY: number }) {
  const x1 = parentX + NODE_W / 2;
  const y1 = parentY + NODE_H;
  const x2 = childX + NODE_W / 2;
  const y2 = childY;
  const midY = (y1 + y2) / 2;

  return (
    <path
      d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
      fill="none"
      stroke="hsl(var(--border))"
      strokeWidth={1.5}
      strokeOpacity={0.7}
    />
  );
}

// ─── Hover tooltip ────────────────────────────────────────────────────
function NodeTooltip({ node, color }: { node: ProfileNode; color: string }) {
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.97 }}
      transition={{ duration: 0.15 }}
      className="absolute left-1/2 -translate-x-1/2 top-[calc(100%+8px)] z-50 w-56 rounded-xl border bg-popover shadow-xl text-popover-foreground text-xs"
      style={{ borderColor: `${color}40` }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Arrow */}
      <div
        className="absolute -top-[6px] left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 border-l border-t bg-popover"
        style={{ borderColor: `${color}40` }}
      />
      <div className="p-3 space-y-2">
        <p className="font-semibold text-[11px] text-foreground leading-tight">
          {node.full_name || "Unnamed"}
        </p>
        {node.email && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Mail className="h-3 w-3 flex-shrink-0" style={{ color }} />
            <span className="truncate">{node.email}</span>
          </div>
        )}
        {node.phone && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Phone className="h-3 w-3 flex-shrink-0" style={{ color }} />
            <span>{node.phone}</span>
          </div>
        )}
        {node.join_date && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <CalendarDays className="h-3 w-3 flex-shrink-0" style={{ color }} />
            <span>Joined {format(new Date(node.join_date), "MMM d, yyyy")}</span>
          </div>
        )}
        {!node.email && !node.phone && !node.join_date && (
          <p className="text-muted-foreground italic">No contact details</p>
        )}
      </div>
    </motion.div>
  );
}

// ─── Single node card ─────────────────────────────────────────────────
function OrgCard({
  lnode,
  isHighlighted,
  isDimmed,
  onToggle,
}: {
  lnode: LayoutNode;
  isHighlighted: boolean;
  isDimmed: boolean;
  onToggle: (id: string) => void;
}) {
  const { node, x, y, collapsed } = lnode;
  const [hovered, setHovered] = useState(false);
  const color = deptColor(node.department);
  const initials = (node.full_name || "?")
    .split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <foreignObject x={x} y={y} width={NODE_W} height={NODE_H} overflow="visible" style={{ zIndex: hovered ? 100 : 1 }}>
      <div className="relative w-full h-full" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: isDimmed ? 0.3 : 1, scale: 1 }}
          transition={{ duration: 0.2 }}
          className={cn(
            "w-full h-full rounded-xl border bg-card shadow-sm overflow-hidden cursor-default",
            "transition-shadow duration-200",
            isHighlighted && "ring-2 ring-primary shadow-lg shadow-primary/20",
            !isDimmed && "hover:shadow-md hover:border-primary/30"
          )}
        >
          {/* Dept accent bar */}
          <div className="h-[3px] w-full" style={{ background: color }} />

          <div className="px-3 py-2 flex items-start gap-2">
            {/* Avatar */}
            <div
              className="flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center text-[11px] font-bold text-white relative mt-0.5"
              style={{ background: `${color}cc` }}
            >
              {initials}
              {node.status === "active" && (
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-success border-2 border-card" />
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[11px] leading-tight text-foreground truncate">
                {node.full_name || "Unnamed"}
              </p>
              <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                {node.job_title || "No title"}
              </p>
              {node.department && (
                <span
                  className="inline-block mt-1 text-[9px] font-medium px-1.5 py-0.5 rounded-full"
                  style={{ background: `${color}20`, color }}
                >
                  {node.department}
                </span>
              )}
            </div>
          </div>

          {/* Expand / collapse button */}
          {node.children.length > 0 && (
            <button
              onClick={() => onToggle(node.id)}
              className="absolute bottom-1.5 right-2 flex items-center gap-0.5 text-[9px] text-muted-foreground hover:text-primary transition-colors"
            >
              {collapsed
                ? <ChevronRight className="h-3 w-3" />
                : <ChevronDown className="h-3 w-3" />}
              {node.children.length}
            </button>
          )}
        </motion.div>

        {/* Hover tooltip */}
        <AnimatePresence>
          {hovered && <NodeTooltip node={node} color={color} />}
        </AnimatePresence>
      </div>
    </foreignObject>
  );
}

// ─── Main OrgChart canvas ─────────────────────────────────────────────
function OrgChartCanvas({
  roots,
  searchQuery,
  activeDept,
}: {
  roots: ProfileNode[];
  searchQuery: string;
  activeDept: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => {
    // Auto-collapse nodes at depth >= 3 to keep the initial view clean
    const ids = new Set<string>();
    function walk(nodes: ProfileNode[], depth: number) {
      for (const n of nodes) {
        if (depth >= 2) ids.add(n.id);
        walk(n.children, depth + 1);
      }
    }
    walk(roots, 0);
    return ids;
  });

  const [transform, setTransform] = useState({ x: 40, y: 40, scale: 1 });
  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  // Re-build collapsed state when roots change
  useEffect(() => {
    setCollapsedIds((prev) => {
      const ids = new Set<string>();
      function walk(nodes: ProfileNode[], depth: number) {
        for (const n of nodes) {
          if (depth >= 2 || prev.has(n.id)) ids.add(n.id);
          walk(n.children, depth + 1);
        }
      }
      walk(roots, 0);
      return ids;
    });
  }, [roots]);

  const layout = useMemo(() => buildLayout(roots, collapsedIds), [roots, collapsedIds]);

  // Canvas bounds
  const canvasBounds = useMemo(() => {
    if (layout.length === 0) return { w: 800, h: 400 };
    const maxX = Math.max(...layout.map((l) => l.x + NODE_W));
    const maxY = Math.max(...layout.map((l) => l.y + NODE_H));
    return { w: maxX + 80, h: maxY + 80 };
  }, [layout]);

  // Highlighted / dimmed sets
  const { highlightedIds, hasDim } = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const dept = activeDept;
    if (!q && !dept) return { highlightedIds: new Set<string>(), hasDim: false };

    const matched = new Set<string>();
    for (const l of layout) {
      const nameMatch = q && (l.node.full_name?.toLowerCase().includes(q) || l.node.job_title?.toLowerCase().includes(q));
      const deptMatch = dept && l.node.department === dept;
      if (nameMatch || deptMatch) matched.add(l.node.id);
    }
    return { highlightedIds: matched, hasDim: matched.size > 0 };
  }, [layout, searchQuery, activeDept]);

  // Build parent map for edge drawing
  const parentMap = useMemo(() => {
    const m = new Map<string, string>(); // childId -> parentId
    function walk(nodes: ProfileNode[]) {
      for (const n of nodes) {
        for (const c of n.children) { m.set(c.id, n.id); walk(n.children); }
      }
    }
    walk(roots);
    return m;
  }, [roots]);

  const posMap = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    for (const l of layout) m.set(l.node.id, { x: l.x, y: l.y });
    return m;
  }, [layout]);

  // Edges: only draw if parent is visible (not collapsed-hidden)
  const visibleIds = useMemo(() => new Set(layout.map((l) => l.node.id)), [layout]);

  // Pan & zoom handlers
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button,foreignObject")) return;
    dragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    setTransform((t) => ({ ...t, x: t.x + dx, y: t.y + dy }));
  }, []);

  const onMouseUp = useCallback(() => { dragging.current = false; }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setTransform((t) => ({
      ...t,
      scale: Math.min(2, Math.max(0.2, t.scale * factor)),
    }));
  }, []);

  const zoom = useCallback((factor: number) => {
    setTransform((t) => ({ ...t, scale: Math.min(2, Math.max(0.2, t.scale * factor)) }));
  }, []);

  const fitView = useCallback(() => {
    const container = containerRef.current;
    if (!container || layout.length === 0) return;
    const { clientWidth: cw, clientHeight: ch } = container;
    const scaleX = (cw - 80) / canvasBounds.w;
    const scaleY = (ch - 80) / canvasBounds.h;
    const scale = Math.min(1, scaleX, scaleY);
    const x = (cw - canvasBounds.w * scale) / 2;
    const y = (ch - canvasBounds.h * scale) / 2;
    setTransform({ x, y, scale });
  }, [canvasBounds, layout]);

  // Fit on initial load
  useEffect(() => { fitView(); }, [roots]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleCollapse = useCallback((id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <div className="relative w-full h-full" ref={containerRef}>
      {/* Controls */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5">
        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => zoom(1.2)}>
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => zoom(0.8)}>
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="outline" className="h-8 w-8" onClick={fitView}>
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Scale badge */}
      <div className="absolute bottom-3 left-3 z-10 text-[10px] text-muted-foreground bg-background/80 border rounded px-2 py-1">
        {Math.round(transform.scale * 100)}%
      </div>

      {/* SVG canvas */}
      <svg
        className="w-full h-full cursor-grab active:cursor-grabbing select-none"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
        style={{ touchAction: "none" }}
      >
        <g transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}>
          {/* Edges */}
          {layout.map((lnode) => {
            const parentId = parentMap.get(lnode.node.id);
            if (!parentId) return null;
            const parentPos = posMap.get(parentId);
            if (!parentPos || !visibleIds.has(parentId)) return null;
            return (
              <Edge
                key={`edge-${lnode.node.id}`}
                parentX={parentPos.x}
                parentY={parentPos.y}
                childX={lnode.x}
                childY={lnode.y}
              />
            );
          })}

          {/* Nodes */}
          {layout.map((lnode) => (
            <OrgCard
              key={lnode.node.id}
              lnode={lnode}
              isHighlighted={highlightedIds.has(lnode.node.id)}
              isDimmed={hasDim && !highlightedIds.has(lnode.node.id)}
              onToggle={toggleCollapse}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────
export default function OrgChart() {
  const isDevMode = useIsDevModeWithoutAuth();
  const { data: isAdmin, isLoading: roleLoading } = useIsAdminOrHR();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeDept, setActiveDept] = useState<string | null>(null);

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
          email: e.email ?? null,
          phone: e.phone ?? null,
          join_date: e.join_date ?? null,
        })) as RawProfile[];
      }
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, department, job_title, avatar_url, manager_id, status, email, phone, join_date")
        .order("full_name");
      if (error) throw error;
      return data as RawProfile[];
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

  const totalManagers = useMemo(
    () => profiles.filter((p) => profiles.some((q) => q.manager_id === p.id)).length,
    [profiles]
  );

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
      <div className="space-y-5 h-full">
        {/* Stats row */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Employees</CardTitle>
              <Users className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-2xl font-bold">{profiles.length}</div>
              <p className="text-xs text-muted-foreground">Across {deptCounts.length} departments</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium text-muted-foreground">Managers</CardTitle>
              <Building2 className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-2xl font-bold">{totalManagers}</div>
              <p className="text-xs text-muted-foreground">With direct reports</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium text-muted-foreground">Top-level Roots</CardTitle>
              <GitBranch className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-2xl font-bold">{tree.length}</div>
              <p className="text-xs text-muted-foreground">
                {tree.length === profiles.length && profiles.length > 0
                  ? "Assign managers in Employees →"
                  : "Leadership nodes"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Search + Department filter */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-48 max-w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or title…"
              className="pl-9 h-9"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Dept chips */}
          <div className="flex flex-wrap gap-1.5">
            {deptCounts.map(([dept, count]) => {
              const color = deptColor(dept);
              const active = activeDept === dept;
              return (
                <button
                  key={dept}
                  onClick={() => setActiveDept(active ? null : dept)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all",
                    active ? "shadow-sm" : "opacity-70 hover:opacity-100"
                  )}
                  style={{
                    borderColor: `${color}60`,
                    background: active ? `${color}25` : `${color}10`,
                    color,
                  }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                  {dept}
                  <Badge
                    variant="outline"
                    className="h-4 px-1 text-[9px] border-0 ml-0.5"
                    style={{ background: `${color}30`, color }}
                  >
                    {count}
                  </Badge>
                </button>
              );
            })}
          </div>
        </div>

        {/* Canvas */}
        <Card className="flex-1">
          <CardHeader className="pb-0 pt-4 px-4">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <GitBranch className="h-4 w-4 text-primary" />
              Interactive Org Tree
              <span className="text-xs font-normal text-muted-foreground ml-1">
                — Scroll to zoom · Drag to pan · Click reports to expand/collapse
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            {isLoading || roleLoading ? (
              <div className="h-[520px] flex items-center justify-center gap-8">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex flex-col items-center gap-4">
                    <Skeleton className="h-[110px] w-[172px] rounded-xl" />
                    <div className="flex gap-4">
                      <Skeleton className="h-[110px] w-[172px] rounded-xl" />
                      <Skeleton className="h-[110px] w-[172px] rounded-xl" />
                    </div>
                  </div>
                ))}
              </div>
            ) : profiles.length === 0 ? (
              <div className="h-[520px] flex flex-col items-center justify-center text-muted-foreground">
                <Users className="h-16 w-16 mb-4 opacity-30" />
                <p className="text-lg font-medium">No employees found</p>
                <p className="text-sm mt-1">Add employees in the Employees module to build your org chart.</p>
              </div>
            ) : (
              <div className="h-[560px] rounded-lg border bg-muted/20 overflow-hidden">
                <OrgChartCanvas
                  roots={tree}
                  searchQuery={searchQuery}
                  activeDept={activeDept}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
