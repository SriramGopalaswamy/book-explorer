import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Plus, Trash2, TrendingUp, TrendingDown, Calendar, IndianRupee, FileText, ChevronRight,
} from "lucide-react";
import {
  useCompensationHistory,
  useCreateCompensationRevision,
  DEFAULT_COMPONENTS,
  type CompensationComponent,
  type CompensationStructure,
} from "@/hooks/useCompensation";

const formatCurrency = (v: number) =>
  `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" });

type ComponentRow = Omit<CompensationComponent, "id" | "compensation_structure_id" | "monthly_amount">;

interface Props {
  profileId: string;
  employeeName?: string;
  canEdit: boolean;
}

export function CompensationTab({ profileId, employeeName, canEdit }: Props) {
  const { data: history = [], isLoading } = useCompensationHistory(profileId);
  const createRevision = useCreateCompensationRevision();
  const [showForm, setShowForm] = useState(false);

  const activeStructure = history.find((s) => s.is_active) ?? null;

  if (isLoading) {
    return (
      <div className="space-y-4 py-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-3">
      {/* Current CTC summary */}
      {activeStructure ? (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Current Annual CTC</p>
              <p className="text-2xl font-bold text-foreground">
                {formatCurrency(activeStructure.annual_ctc)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatCurrency(Math.round(activeStructure.annual_ctc / 12))}/month · Revision #{activeStructure.revision_number} · Effective {formatDate(activeStructure.effective_from)}
              </p>
            </div>
            {canEdit && (
              <Button size="sm" onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4 mr-1" /> New Revision
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <IndianRupee className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">No compensation structure defined</p>
          {canEdit && (
            <Button size="sm" className="mt-3" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add Compensation
            </Button>
          )}
        </div>
      )}

      {/* History timeline */}
      {history.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
            Compensation History
          </p>
          <Accordion type="single" collapsible className="space-y-2">
            {history.map((s) => (
              <AccordionItem key={s.id} value={s.id} className="border rounded-lg px-4">
                <AccordionTrigger className="hover:no-underline py-3">
                  <div className="flex items-center gap-3 text-left flex-1 min-w-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-foreground">
                          {formatCurrency(s.annual_ctc)}
                        </span>
                        <Badge
                          variant="outline"
                          className={s.is_active
                            ? "bg-green-500/10 text-green-600 border-green-500/30 text-[10px]"
                            : "bg-muted text-muted-foreground border-border text-[10px]"
                          }
                        >
                          {s.is_active ? "Active" : "Closed"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">Rev #{s.revision_number}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDate(s.effective_from)}
                        {s.effective_to ? ` → ${formatDate(s.effective_to)}` : " → Present"}
                        {s.revision_reason && ` · ${s.revision_reason}`}
                      </p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-3">
                  <ComponentBreakdown components={s.compensation_components} annualCtc={s.annual_ctc} />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      )}

      {/* Revision form dialog */}
      <RevisionFormDialog
        open={showForm}
        onOpenChange={setShowForm}
        profileId={profileId}
        employeeName={employeeName}
        latestComponents={activeStructure?.compensation_components ?? null}
        onSubmit={createRevision}
      />
    </div>
  );
}

/* ── Component Breakdown View ── */
function ComponentBreakdown({ components, annualCtc }: { components: CompensationComponent[]; annualCtc: number }) {
  const sorted = [...components].sort((a, b) => a.display_order - b.display_order);
  const earnings = sorted.filter((c) => c.component_type === "earning");
  const deductions = sorted.filter((c) => c.component_type === "deduction");
  const totalEarnings = earnings.reduce((s, c) => s + Number(c.annual_amount), 0);
  const totalDeductions = deductions.reduce((s, c) => s + Number(c.annual_amount), 0);

  const Row = ({ c }: { c: CompensationComponent }) => (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-foreground">{c.component_name}</span>
        {c.percentage_of_basic != null && (
          <span className="text-[10px] text-muted-foreground">({c.percentage_of_basic}% of Basic)</span>
        )}
      </div>
      <div className="text-right">
        <span className="font-medium text-foreground">{formatCurrency(Number(c.annual_amount))}</span>
        <span className="text-xs text-muted-foreground ml-2">
          ({formatCurrency(Math.round(Number(c.annual_amount) / 12))}/mo)
        </span>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {earnings.length > 0 && (
        <div>
          <p className="text-xs font-medium text-green-600 flex items-center gap-1 mb-1">
            <TrendingUp className="h-3 w-3" /> Earnings
          </p>
          {earnings.map((c) => <Row key={c.id || c.component_name} c={c} />)}
          <Separator className="my-1" />
          <div className="flex justify-between text-sm font-semibold">
            <span>Total Earnings</span>
            <span className="text-green-600">{formatCurrency(totalEarnings)}</span>
          </div>
        </div>
      )}
      {deductions.length > 0 && (
        <div>
          <p className="text-xs font-medium text-destructive flex items-center gap-1 mb-1">
            <TrendingDown className="h-3 w-3" /> Deductions
          </p>
          {deductions.map((c) => <Row key={c.id || c.component_name} c={c} />)}
          <Separator className="my-1" />
          <div className="flex justify-between text-sm font-semibold">
            <span>Total Deductions</span>
            <span className="text-destructive">{formatCurrency(totalDeductions)}</span>
          </div>
        </div>
      )}
      <Separator />
      <div className="flex justify-between font-bold text-foreground">
        <span>Annual CTC</span>
        <span>{formatCurrency(annualCtc)}</span>
      </div>
    </div>
  );
}

/* ── Revision Form Dialog ── */
function RevisionFormDialog({
  open,
  onOpenChange,
  profileId,
  employeeName,
  latestComponents,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profileId: string;
  employeeName?: string;
  latestComponents: CompensationComponent[] | null;
  onSubmit: ReturnType<typeof useCreateCompensationRevision>;
}) {
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().split("T")[0]);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [components, setComponents] = useState<ComponentRow[]>([]);

  // Initialize components when dialog opens
  const initComponents = () => {
    if (latestComponents && latestComponents.length > 0) {
      setComponents(
        [...latestComponents]
          .sort((a, b) => a.display_order - b.display_order)
          .map((c) => ({
            component_name: c.component_name,
            component_type: c.component_type as "earning" | "deduction",
            annual_amount: Number(c.annual_amount),
            percentage_of_basic: c.percentage_of_basic,
            is_taxable: c.is_taxable,
            display_order: c.display_order,
          }))
      );
    } else {
      setComponents([...DEFAULT_COMPONENTS]);
    }
    setReason("");
    setNotes("");
    setEffectiveFrom(new Date().toISOString().split("T")[0]);
  };

  // Recalculate CTC from components
  const annualCtc = useMemo(
    () => components.reduce((sum, c) => sum + (c.component_type === "earning" ? c.annual_amount : 0), 0),
    [components]
  );

  const updateComponent = (idx: number, field: string, value: any) => {
    setComponents((prev) => prev.map((c, i) => (i === idx ? { ...c, [field]: value } : c)));
  };

  const removeComponent = (idx: number) => {
    setComponents((prev) => prev.filter((_, i) => i !== idx));
  };

  const addComponent = (type: "earning" | "deduction") => {
    const maxOrder = Math.max(0, ...components.filter((c) => c.component_type === type).map((c) => c.display_order));
    setComponents((prev) => [
      ...prev,
      {
        component_name: "",
        component_type: type,
        annual_amount: 0,
        percentage_of_basic: null,
        is_taxable: type === "earning",
        display_order: maxOrder + 1,
      },
    ]);
  };

  const handleSubmit = () => {
    if (!effectiveFrom) return;
    const validComponents = components.filter((c) => c.component_name.trim());
    onSubmit.mutate(
      {
        profile_id: profileId,
        annual_ctc: annualCtc,
        effective_from: effectiveFrom,
        revision_reason: reason || undefined,
        notes: notes || undefined,
        components: validComponents,
      },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  const earnings = components.filter((c) => c.component_type === "earning");
  const deductions = components.filter((c) => c.component_type === "deduction");

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) initComponents();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Salary Revision</DialogTitle>
          <DialogDescription>
            {employeeName ? `For ${employeeName}` : "Create a new compensation structure"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Meta fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label className="text-xs">Effective From *</Label>
              <Input
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Revision Reason</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select reason" /></SelectTrigger>
                <SelectContent>
                  {["Annual Appraisal", "Promotion", "Correction", "Role Change", "Market Adjustment", "Other"].map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Earnings */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-green-600 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> Earnings
              </p>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => addComponent("earning")}>
                <Plus className="h-3 w-3 mr-1" /> Add
              </Button>
            </div>
            <div className="space-y-2">
              {earnings.map((c) => {
                const idx = components.indexOf(c);
                return (
                  <div key={idx} className="grid grid-cols-[1fr_120px_32px] gap-2 items-end">
                    <div className="grid gap-1">
                      <Label className="text-[10px] text-muted-foreground">{c.component_name || "Component Name"}</Label>
                      <Input
                        value={c.component_name}
                        onChange={(e) => updateComponent(idx, "component_name", e.target.value)}
                        placeholder="Component name"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-[10px] text-muted-foreground">Annual (₹)</Label>
                      <Input
                        type="number"
                        value={c.annual_amount || ""}
                        onChange={(e) => updateComponent(idx, "annual_amount", parseFloat(e.target.value) || 0)}
                        className="h-8 text-sm"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => removeComponent(idx)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          <Separator />

          {/* Deductions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-destructive flex items-center gap-1">
                <TrendingDown className="h-3 w-3" /> Deductions
              </p>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => addComponent("deduction")}>
                <Plus className="h-3 w-3 mr-1" /> Add
              </Button>
            </div>
            <div className="space-y-2">
              {deductions.map((c) => {
                const idx = components.indexOf(c);
                return (
                  <div key={idx} className="grid grid-cols-[1fr_120px_32px] gap-2 items-end">
                    <div className="grid gap-1">
                      <Label className="text-[10px] text-muted-foreground">{c.component_name || "Component Name"}</Label>
                      <Input
                        value={c.component_name}
                        onChange={(e) => updateComponent(idx, "component_name", e.target.value)}
                        placeholder="Component name"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-[10px] text-muted-foreground">Annual (₹)</Label>
                      <Input
                        type="number"
                        value={c.annual_amount || ""}
                        onChange={(e) => updateComponent(idx, "annual_amount", parseFloat(e.target.value) || 0)}
                        className="h-8 text-sm"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => removeComponent(idx)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          <Separator />

          {/* CTC Summary */}
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-xs text-muted-foreground">Computed Annual CTC (Earnings Only)</p>
                <p className="text-xl font-bold text-foreground">{formatCurrency(annualCtc)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Monthly</p>
                <p className="text-sm font-semibold text-foreground">{formatCurrency(Math.round(annualCtc / 12))}</p>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="grid gap-1">
            <Label className="text-xs">Notes (optional)</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes for this revision"
              className="h-9"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={onSubmit.isPending || !effectiveFrom || annualCtc <= 0}>
            {onSubmit.isPending ? "Saving..." : "Create Revision"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
