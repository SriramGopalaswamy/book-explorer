import { useState, useMemo } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Calendar as CalendarIcon, Plus, Pencil, Trash2, ShieldAlert, PartyPopper, Search } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdminOrHR } from "@/hooks/useEmployees";
import { toast } from "sonner";
import { format } from "date-fns";

interface Holiday {
  id: string;
  name: string;
  date: string;
  year: number;
  created_at: string;
}

export default function Holidays() {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Holiday | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Holiday | null>(null);
  const [form, setForm] = useState({ name: "", date: "" });

  const { data: isAdmin, isLoading: roleLoading } = useIsAdminOrHR();
  const qc = useQueryClient();

  const { data: holidays = [], isLoading } = useQuery({
    queryKey: ["holidays", selectedYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("holidays")
        .select("*")
        .eq("year", selectedYear)
        .order("date", { ascending: true });
      if (error) throw error;
      return data as Holiday[];
    },
  });

  const createHoliday = useMutation({
    mutationFn: async (vals: { name: string; date: string }) => {
      const year = new Date(vals.date).getFullYear();
      const { error } = await supabase.from("holidays").insert({ name: vals.name, date: vals.date, year });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["holidays"] });
      toast.success("Holiday added");
      setIsAddOpen(false);
      setForm({ name: "", date: "" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateHoliday = useMutation({
    mutationFn: async (vals: { id: string; name: string; date: string }) => {
      const year = new Date(vals.date).getFullYear();
      const { error } = await supabase.from("holidays").update({ name: vals.name, date: vals.date, year }).eq("id", vals.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["holidays"] });
      toast.success("Holiday updated");
      setEditTarget(null);
      setForm({ name: "", date: "" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteHoliday = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("holidays").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["holidays"] });
      toast.success("Holiday deleted");
      setDeleteTarget(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = useMemo(() =>
    holidays.filter((h) => {
      const q = searchQuery.toLowerCase();
      return !q || h.name.toLowerCase().includes(q);
    }),
  [holidays, searchQuery]);

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);

  const openEdit = (h: Holiday) => {
    setEditTarget(h);
    setForm({ name: h.name, date: h.date });
  };

  const HolidayForm = ({ onSubmit, isPending, submitLabel }: { onSubmit: () => void; isPending: boolean; submitLabel: string }) => (
    <div className="grid gap-4 py-4">
      <div className="grid gap-2">
        <Label>Holiday Name *</Label>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Republic Day" />
      </div>
      <div className="grid gap-2">
        <Label>Date *</Label>
        <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => { setIsAddOpen(false); setEditTarget(null); }}>Cancel</Button>
        <Button onClick={onSubmit} disabled={isPending || !form.name || !form.date}>
          {isPending ? "Saving..." : submitLabel}
        </Button>
      </DialogFooter>
    </div>
  );

  return (
    <MainLayout title="Holidays" subtitle="Company holiday calendar">
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Holidays</CardTitle>
              <PartyPopper className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{holidays.length}</div>
              <p className="text-xs text-muted-foreground">In {selectedYear}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Upcoming</CardTitle>
              <CalendarIcon className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {holidays.filter((h) => new Date(h.date) >= new Date()).length}
              </div>
              <p className="text-xs text-muted-foreground">Remaining this year</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Next Holiday</CardTitle>
              <CalendarIcon className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              {(() => {
                const next = holidays.find((h) => new Date(h.date) >= new Date());
                return next ? (
                  <>
                    <div className="text-lg font-bold truncate">{next.name}</div>
                    <p className="text-xs text-muted-foreground">{format(new Date(next.date), "MMMM d, yyyy")}</p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No upcoming holidays</p>
                );
              })()}
            </CardContent>
          </Card>
        </div>

        {/* Holiday List */}
        <Card>
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Holiday Calendar</CardTitle>
              <CardDescription>Holidays for {selectedYear}</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  className="pl-9 w-40"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              {isAdmin && (
                <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                  <DialogTrigger asChild>
                    <Button><Plus className="h-4 w-4 mr-1" />Add Holiday</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Holiday</DialogTitle>
                      <DialogDescription>Add a new company holiday</DialogDescription>
                    </DialogHeader>
                    <HolidayForm
                      onSubmit={() => createHoliday.mutate(form)}
                      isPending={createHoliday.isPending}
                      submitLabel="Add Holiday"
                    />
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading || roleLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <PartyPopper className="mx-auto h-12 w-12 mb-3" />
                <p>No holidays found for {selectedYear}</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Holiday</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Day</TableHead>
                    {isAdmin && <TableHead className="w-20">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((h) => {
                    const d = new Date(h.date);
                    const isPast = d < new Date();
                    return (
                      <TableRow key={h.id} className={isPast ? "opacity-60" : ""}>
                        <TableCell className="font-medium">{h.name}</TableCell>
                        <TableCell>{format(d, "MMMM d, yyyy")}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{format(d, "EEEE")}</Badge>
                        </TableCell>
                        {isAdmin && (
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(h)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(h)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(v) => { if (!v) setEditTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Holiday</DialogTitle>
            <DialogDescription>Update holiday details</DialogDescription>
          </DialogHeader>
          <HolidayForm
            onSubmit={() => editTarget && updateHoliday.mutate({ id: editTarget.id, ...form })}
            isPending={updateHoliday.isPending}
            submitLabel="Save Changes"
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Holiday</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTarget?.name}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteHoliday.mutate(deleteTarget.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}
