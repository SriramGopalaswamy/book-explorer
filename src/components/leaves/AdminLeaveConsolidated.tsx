import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, CalendarPlus, Search, History } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useUserOrganization } from "@/hooks/useUserOrganization";
import { useAllLeaveBalances, useLeaveTypes } from "@/hooks/useLeaves";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface BalanceRow {
  id: string;
  profile_id: string;
  leave_type: string;
  total_days: number | string;
  used_days: number | string;
  year: number;
  profiles: {
    full_name: string | null;
    employee_id: string | null;
    department: string | null;
    location: string | null;
    status: string | null;
  } | null;
}

interface PivotEmployee {
  profile_id: string;
  full_name: string;
  employee_id: string;
  department: string;
  byType: Record<string, { id: string; total: number; used: number; remaining: number } | undefined>;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

export default function AdminLeaveConsolidated() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: orgData } = useUserOrganization();
  const orgId = orgData?.organizationId ?? null;
  const currentYear = new Date().getFullYear();

  const [year, setYear] = useState<number>(currentYear);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<{
    profile_id: string;
    full_name: string;
    leave_type: string;
    field: "total_days" | "used_days";
    current: number;
    rowId: string | null;
  } | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [editReason, setEditReason] = useState<string>("");

  const [marking, setMarking] = useState(false);
  const [markForm, setMarkForm] = useState({
    profile_id: "",
    leave_type: "",
    from_date: "",
    to_date: "",
    reason: "",
  });

  const [historyOpen, setHistoryOpen] = useState(false);

  const { data: balances = [], isLoading } = useAllLeaveBalances(year);
  const { data: leaveTypes = [] } = useLeaveTypes();

  const employees = useMemo<PivotEmployee[]>(() => {
    const map = new Map<string, PivotEmployee>();
    for (const b of balances as BalanceRow[]) {
      if (!b.profile_id) continue;
      if (!map.has(b.profile_id)) {
        map.set(b.profile_id, {
          profile_id: b.profile_id,
          full_name: b.profiles?.full_name ?? "—",
          employee_id: b.profiles?.employee_id ?? "—",
          department: b.profiles?.department ?? "—",
          byType: {},
        });
      }
      const total = Number(b.total_days) || 0;
      const used = Number(b.used_days) || 0;
      map.get(b.profile_id)!.byType[b.leave_type] = {
        id: b.id,
        total,
        used,
        remaining: total - used,
      };
    }
    const arr = Array.from(map.values());
    arr.sort((a, b) => a.full_name.localeCompare(b.full_name));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      return arr.filter(
        (e) =>
          e.full_name.toLowerCase().includes(q) ||
          e.employee_id.toLowerCase().includes(q) ||
          e.department.toLowerCase().includes(q),
      );
    }
    return arr;
  }, [balances, search]);

  const { data: adjustments = [] } = useQuery({
    queryKey: ["leave-balance-adjustments", orgId, year],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from("leave_balance_adjustments" as any)
        .select(`id, profile_id, leave_type, year, field, old_value, new_value, reason, actor_user_id, created_at,
                 profiles!profile_id(full_name)`)
        .eq("organization_id", orgId)
        .eq("year", year)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!orgId && historyOpen,
  });

  // ── Mutation: edit balance ─────────────────────────────────────────────
  const editMutation = useMutation({
    mutationFn: async () => {
      if (!editing || !user || !orgId) throw new Error("Missing context");
      const newVal = Number(editValue);
      if (Number.isNaN(newVal) || newVal < 0) throw new Error("Enter a non-negative number");
      if (!editReason.trim() || editReason.trim().length < 3) throw new Error("Reason is required (min 3 chars)");
      if (newVal === editing.current) throw new Error("No change");

      // Upsert balance row (insert if missing — happens when admin edits a cell that has no row yet)
      let rowId = editing.rowId;
      if (!rowId) {
        // Look up user_id from profile
        const { data: prof } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("id", editing.profile_id)
          .maybeSingle();
        if (!prof?.user_id) throw new Error("Profile missing user_id");
        const insertPayload: any = {
          organization_id: orgId,
          profile_id: editing.profile_id,
          user_id: prof.user_id,
          leave_type: editing.leave_type,
          year,
          total_days: editing.field === "total_days" ? newVal : 0,
          used_days: editing.field === "used_days" ? newVal : 0,
        };
        const { data: ins, error: insErr } = await supabase
          .from("leave_balances")
          .insert(insertPayload)
          .select("id")
          .single();
        if (insErr) throw insErr;
        rowId = ins.id;
      } else {
        const updatePayload: any = { [editing.field]: newVal };
        const { error: updErr, data: updRows } = await supabase
          .from("leave_balances")
          .update(updatePayload)
          .eq("id", rowId)
          .select("id");
        if (updErr) throw updErr;
        if (!updRows || updRows.length === 0) throw new Error("Update blocked (RLS or row missing)");
      }

      // Audit
      const { error: audErr } = await supabase.from("leave_balance_adjustments" as any).insert({
        organization_id: orgId,
        profile_id: editing.profile_id,
        leave_type: editing.leave_type,
        year,
        field: editing.field,
        old_value: editing.current,
        new_value: newVal,
        reason: editReason.trim(),
        actor_user_id: user.id,
      });
      if (audErr) throw audErr;
    },
    onSuccess: () => {
      toast.success("Balance updated");
      queryClient.invalidateQueries({ queryKey: ["leave-balances"] });
      queryClient.invalidateQueries({ queryKey: ["leave-balance-adjustments"] });
      setEditing(null);
      setEditValue("");
      setEditReason("");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to update balance"),
  });

  // ── Mutation: mark auto-approved leave ─────────────────────────────────
  const markMutation = useMutation({
    mutationFn: async () => {
      if (!user || !orgId) throw new Error("Missing context");
      const { profile_id, leave_type, from_date, to_date, reason } = markForm;
      if (!profile_id || !leave_type || !from_date || !to_date) throw new Error("All fields required");

      const [fy, fm, fd] = from_date.split("-").map(Number);
      const [ty, tm, td] = to_date.split("-").map(Number);
      const days = Math.round((new Date(ty, tm - 1, td).getTime() - new Date(fy, fm - 1, fd).getTime()) / 86400000) + 1;
      if (days < 1 || days > 365) throw new Error("Invalid date range");

      const { data: prof } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("id", profile_id)
        .maybeSingle();
      if (!prof?.user_id) throw new Error("Profile missing user_id");

      // Insert pending → update to approved so existing trigger decrements balance.
      const { data: inserted, error: insErr } = await supabase
        .from("leave_requests")
        .insert({
          user_id: prof.user_id,
          profile_id,
          organization_id: orgId,
          leave_type,
          from_date,
          to_date,
          days,
          reason: reason || "Admin-marked leave",
          status: "pending",
        } as any)
        .select("id")
        .single();
      if (insErr) throw insErr;

      const { error: updErr, data: updRows } = await supabase
        .from("leave_requests")
        .update({ status: "approved", approved_by: user.id, approved_at: new Date().toISOString() } as any)
        .eq("id", inserted.id)
        .select("id");
      if (updErr) throw updErr;
      if (!updRows || updRows.length === 0) throw new Error("Approval blocked (RLS)");
    },
    onSuccess: () => {
      toast.success("Leave marked and auto-approved");
      queryClient.invalidateQueries({ queryKey: ["leave-balances"] });
      queryClient.invalidateQueries({ queryKey: ["leave-requests"] });
      setMarking(false);
      setMarkForm({ profile_id: "", leave_type: "", from_date: "", to_date: "", reason: "" });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to mark leave"),
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, ID, department"
              className="pl-8 w-72"
            />
          </div>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setHistoryOpen(true)}>
            <History className="h-4 w-4 mr-2" />Adjustment History
          </Button>
          <Button onClick={() => setMarking(true)}>
            <CalendarPlus className="h-4 w-4 mr-2" />Mark Leave for Employee
          </Button>
        </div>
      </div>

      <div className="border rounded-md overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 bg-background z-10 min-w-[220px]">Employee</TableHead>
              <TableHead>Department</TableHead>
              {leaveTypes.map((lt) => (
                <TableHead key={lt.key} className="text-right whitespace-nowrap">{lt.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2 + leaveTypes.length} className="text-center text-muted-foreground py-8">
                  No employees found
                </TableCell>
              </TableRow>
            ) : employees.map((emp) => (
              <TableRow key={emp.profile_id}>
                <TableCell className="sticky left-0 bg-background z-10">
                  <div className="font-medium">{emp.full_name}</div>
                  <div className="text-xs text-muted-foreground">{emp.employee_id}</div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{emp.department}</TableCell>
                {leaveTypes.map((lt) => {
                  const b = emp.byType[lt.key];
                  return (
                    <TableCell key={lt.key} className="text-right">
                      {b ? (
                        <div className="inline-flex flex-col items-end leading-tight">
                          <span className={`text-sm font-medium ${b.remaining < 0 ? "text-destructive" : ""}`}>
                            {fmt(b.remaining)} <span className="text-xs text-muted-foreground">/ {fmt(b.total)}</span>
                          </span>
                          <span className="text-[10px] text-muted-foreground">used {fmt(b.used)}</span>
                          <div className="flex gap-1 mt-1">
                            <Button
                              size="sm" variant="ghost" className="h-6 px-1.5 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditing({
                                  profile_id: emp.profile_id, full_name: emp.full_name,
                                  leave_type: lt.key, field: "total_days",
                                  current: b.total, rowId: b.id,
                                });
                                setEditValue(String(b.total));
                                setEditReason("");
                              }}
                            >
                              <Pencil className="h-3 w-3 mr-0.5" />Total
                            </Button>
                            <Button
                              size="sm" variant="ghost" className="h-6 px-1.5 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditing({
                                  profile_id: emp.profile_id, full_name: emp.full_name,
                                  leave_type: lt.key, field: "used_days",
                                  current: b.used, rowId: b.id,
                                });
                                setEditValue(String(b.used));
                                setEditReason("");
                              }}
                            >
                              <Pencil className="h-3 w-3 mr-0.5" />Used
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          size="sm" variant="ghost" className="h-6 text-xs text-muted-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditing({
                              profile_id: emp.profile_id, full_name: emp.full_name,
                              leave_type: lt.key, field: "total_days",
                              current: 0, rowId: null,
                            });
                            setEditValue("0");
                            setEditReason("");
                          }}
                        >
                          + create
                        </Button>
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Edit Balance Dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Leave Balance</DialogTitle>
            <DialogDescription>
              {editing && (
                <>Adjusting <strong>{editing.field === "total_days" ? "Entitled" : "Used"}</strong> for{" "}
                <strong>{editing.full_name}</strong> · {editing.leave_type} · {year}</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Current value</Label>
              <Input value={editing?.current ?? ""} disabled />
            </div>
            <div>
              <Label>New value</Label>
              <Input
                type="number" step="0.5" min="0"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
              />
            </div>
            <div>
              <Label>Reason <span className="text-destructive">*</span></Label>
              <Textarea
                placeholder="e.g. Mid-year joiner pro-rata adjustment"
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={() => editMutation.mutate()} disabled={editMutation.isPending}>
              {editMutation.isPending ? "Saving…" : "Save & Audit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark Leave Dialog */}
      <Dialog open={marking} onOpenChange={setMarking}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Leave (Auto-Approved)</DialogTitle>
            <DialogDescription>
              Creates an approved leave request. Balance is decremented automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Employee</Label>
              <Select value={markForm.profile_id} onValueChange={(v) => setMarkForm({ ...markForm, profile_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {employees.map((e) => (
                    <SelectItem key={e.profile_id} value={e.profile_id}>
                      {e.full_name} ({e.employee_id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Leave Type</Label>
              <Select value={markForm.leave_type} onValueChange={(v) => setMarkForm({ ...markForm, leave_type: v })}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {leaveTypes.map((lt) => (
                    <SelectItem key={lt.key} value={lt.key}>{lt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>From</Label>
                <Input type="date" value={markForm.from_date} onChange={(e) => setMarkForm({ ...markForm, from_date: e.target.value })} />
              </div>
              <div>
                <Label>To</Label>
                <Input type="date" value={markForm.to_date} onChange={(e) => setMarkForm({ ...markForm, to_date: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Reason (optional)</Label>
              <Textarea rows={2} value={markForm.reason} onChange={(e) => setMarkForm({ ...markForm, reason: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMarking(false)}>Cancel</Button>
            <Button onClick={() => markMutation.mutate()} disabled={markMutation.isPending}>
              {markMutation.isPending ? "Marking…" : "Mark & Approve"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Balance Adjustment History — {year}</DialogTitle>
            <DialogDescription>Last 200 manual edits to leave balances.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Field</TableHead>
                  <TableHead className="text-right">Old → New</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adjustments.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No adjustments yet</TableCell></TableRow>
                ) : adjustments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-xs">{new Date(a.created_at).toLocaleString()}</TableCell>
                    <TableCell>{a.profiles?.full_name ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline">{a.leave_type}</Badge></TableCell>
                    <TableCell className="text-xs">{a.field}</TableCell>
                    <TableCell className="text-right tabular-nums">{a.old_value} → {a.new_value}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{a.reason}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
