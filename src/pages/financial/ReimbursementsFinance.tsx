import { useState } from "react";
import { motion } from "framer-motion";
import {
  Receipt,
  CheckCircle2,
  XCircle,
  Clock,
  DollarSign,
  Calendar,
  Tag,
  User,
  Sparkles,
  Loader2,
  ExternalLink,
  Eye,
  Building2,
  AlertCircle,
} from "lucide-react";
import { format } from "date-fns";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const EXPENSE_CATEGORIES = [
  "Travel & Transport",
  "Meals & Entertainment",
  "Office Supplies",
  "Accommodation",
  "Medical",
  "Training & Development",
  "Communications",
  "Software & Subscriptions",
  "Equipment",
  "Other",
];

function statusConfig(status: string) {
  const map: Record<string, { label: string; icon: React.ElementType; className: string }> = {
    pending_manager:    { label: "Pending Manager",   icon: Clock,         className: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
    manager_approved:   { label: "Manager Approved",  icon: CheckCircle2,  className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
    manager_rejected:   { label: "Manager Rejected",  icon: XCircle,       className: "bg-red-500/15 text-red-400 border-red-500/30" },
    pending_finance:    { label: "Pending Finance",   icon: Clock,         className: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
    paid:               { label: "Paid",              icon: CheckCircle2,  className: "bg-green-500/15 text-green-400 border-green-500/30" },
    finance_rejected:   { label: "Rejected",          icon: XCircle,       className: "bg-red-500/15 text-red-400 border-red-500/30" },
  };
  return map[status] ?? { label: status, icon: AlertCircle, className: "bg-muted text-muted-foreground" };
}

export default function ReimbursementsFinance() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [approveDialog, setApproveDialog] = useState<any>(null);
  const [rejectDialog, setRejectDialog] = useState<any>(null);
  const [previewItem, setPreviewItem] = useState<any>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Approve dialog form
  const [financeNotes, setFinanceNotes] = useState("");
  const [classifyCategory, setClassifyCategory] = useState("");
  const [rejectNotes, setRejectNotes] = useState("");

  // Fetch all reimbursements (finance sees all)
  const { data: allRequests = [], isLoading } = useQuery({
    queryKey: ["finance-reimbursements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reimbursement_requests")
        .select("*, profiles:profile_id(full_name, email)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  const inbox = allRequests.filter((r: any) =>
    r.status === "manager_approved" || r.status === "pending_finance"
  );
  const history = allRequests.filter((r: any) =>
    r.status === "paid" || r.status === "finance_rejected"
  );
  const allPending = allRequests.filter((r: any) => r.status === "pending_manager");

  const totalInbox = inbox.reduce((s: number, r: any) => s + Number(r.amount), 0);
  const totalPaid = history
    .filter((r: any) => r.status === "paid")
    .reduce((s: number, r: any) => s + Number(r.amount), 0);

  const openPreview = async (item: any) => {
    setPreviewItem(item);
    setPreviewUrl(null);
    if (item.attachment_url) {
      const { data } = await supabase.storage
        .from("reimbursement-attachments")
        .createSignedUrl(item.attachment_url, 3600);
      setPreviewUrl(data?.signedUrl ?? null);
    }
  };

  // Finance approves: record as expense, mark paid
  const handleApprove = async () => {
    if (!approveDialog || !user) return;
    setSubmitting(true);
    try {
      const category = classifyCategory || approveDialog.category || "Other";
      const orgId = approveDialog.organization_id;

      // 1. Create expense record in HRMS expenses table
      const { data: expense, error: expErr } = await supabase
        .from("expenses")
        .insert({
          user_id: user.id,
          organization_id: orgId,
          amount: approveDialog.amount,
          category,
          description: `[Reimbursement] ${approveDialog.vendor_name} — ${approveDialog.description || ""}`,
          expense_date: approveDialog.expense_date || new Date().toISOString().split("T")[0],
          status: "approved",
          notes: `Approved reimbursement for ${approveDialog.profiles?.full_name || "employee"}. ${financeNotes || ""}`,
        })
        .select()
        .single();

      if (expErr) throw expErr;

      // 2. Also record as a financial_records expense so it appears in the Accounting module
      const { error: frErr } = await supabase
        .from("financial_records")
        .insert({
          user_id: user.id,
          organization_id: orgId,
          type: "expense",
          category,
          amount: approveDialog.amount,
          description: `[Reimbursement] ${approveDialog.vendor_name}${approveDialog.profiles?.full_name ? ` (${approveDialog.profiles.full_name})` : ""} — ${approveDialog.description || ""}`,
          record_date: approveDialog.expense_date || new Date().toISOString().split("T")[0],
        });

      if (frErr) console.warn("financial_records insert failed:", frErr.message);

      // 3. Update reimbursement status to paid
      const { error: updErr } = await supabase
        .from("reimbursement_requests")
        .update({
          status: "paid",
          finance_notes: financeNotes || null,
          expense_id: expense.id,
          finance_reviewed_at: new Date().toISOString(),
          finance_reviewed_by: user.id,
        })
        .eq("id", approveDialog.id);

      if (updErr) throw updErr;

      // Notify
      supabase.functions.invoke("send-notification-email", {
        body: {
          type: "reimbursement_finance_decided",
          payload: { reimbursement_id: approveDialog.id, decision: "paid", reviewer_name: user.email },
        },
      }).catch((e) => console.warn("Notification failed:", e));

      toast.success("Reimbursement approved and recorded as expense!");
      queryClient.invalidateQueries({ queryKey: ["finance-reimbursements"] });
      setApproveDialog(null);
      setFinanceNotes("");
      setClassifyCategory("");
    } catch (err: any) {
      toast.error(`Failed: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Finance rejects
  const handleReject = async () => {
    if (!rejectDialog || !user) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("reimbursement_requests")
        .update({
          status: "finance_rejected",
          finance_notes: rejectNotes || null,
          finance_reviewed_at: new Date().toISOString(),
          finance_reviewed_by: user.id,
        })
        .eq("id", rejectDialog.id);

      if (error) throw error;

      supabase.functions.invoke("send-notification-email", {
        body: {
          type: "reimbursement_finance_decided",
          payload: { reimbursement_id: rejectDialog.id, decision: "finance_rejected", reviewer_name: user.email },
        },
      }).catch((e) => console.warn("Notification failed:", e));

      toast.success("Reimbursement rejected.");
      queryClient.invalidateQueries({ queryKey: ["finance-reimbursements"] });
      setRejectDialog(null);
      setRejectNotes("");
    } catch (err: any) {
      toast.error(`Failed: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const ReimbursementCard = ({ item, showActions = false }: { item: any; showActions?: boolean }) => {
    const sc = statusConfig(item.status);
    const Icon = sc.icon;
    const employeeName = item.profiles?.full_name || "Unknown Employee";

    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className="border-border/50 bg-card/60 hover:bg-card/80 transition-colors">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <User className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="font-semibold text-sm">{employeeName}</span>
                  <Badge variant="outline" className={sc.className}>
                    <Icon className="h-3 w-3 mr-1" />
                    {sc.label}
                  </Badge>
                  {item.ai_extracted && (
                    <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/20 text-xs">
                      <Sparkles className="h-3 w-3 mr-1" /> AI Read
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1 font-semibold text-foreground">
                    <DollarSign className="h-3 w-3" /> ₹{Number(item.amount).toLocaleString()}
                  </span>
                  <span className="flex items-center gap-1">
                    <Building2 className="h-3 w-3" /> {item.vendor_name}
                  </span>
                  {item.category && (
                    <span className="flex items-center gap-1">
                      <Tag className="h-3 w-3" /> {item.category}
                    </span>
                  )}
                  {item.expense_date && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> {item.expense_date}
                    </span>
                  )}
                </div>
                {item.description && (
                  <p className="text-xs text-muted-foreground mt-1 italic truncate max-w-xl">{item.description}</p>
                )}
                {item.manager_notes && (
                  <p className="text-xs text-muted-foreground mt-1">
                    <span className="font-medium">Manager note:</span> {item.manager_notes}
                  </p>
                )}
                {item.finance_notes && (
                  <p className="text-xs text-muted-foreground mt-1">
                    <span className="font-medium">Finance note:</span> {item.finance_notes}
                  </p>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="ghost" onClick={() => openPreview(item)}>
                  <Eye className="h-4 w-4" />
                </Button>
                {showActions && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-green-500/40 text-green-400 hover:bg-green-500/10"
                      onClick={() => { setApproveDialog(item); setClassifyCategory(item.category || ""); }}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve & Pay
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-500/40 text-red-400 hover:bg-red-500/10"
                      onClick={() => setRejectDialog(item)}
                    >
                      <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                    </Button>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  };

  const EmptyState = ({ icon: Icon, message }: { icon: React.ElementType; message: string }) => (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
      <Icon className="h-10 w-10 opacity-40" />
      <p className="text-sm">{message}</p>
    </div>
  );

  return (
    <MainLayout title="Reimbursements" subtitle="Review and approve expense claims">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reimbursements</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review manager-approved expense claims and record payouts
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Pending Your Approval", value: inbox.length, icon: Clock, color: "text-yellow-400" },
            { label: "Value Pending", value: `₹${totalInbox.toLocaleString()}`, icon: DollarSign, color: "text-purple-400" },
            { label: "Total Paid Out", value: `₹${totalPaid.toLocaleString()}`, icon: CheckCircle2, color: "text-green-400" },
          ].map((s) => (
            <Card key={s.label} className="border-border/50 bg-card/60">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-2 rounded-lg bg-muted/50">
                  <s.icon className={`h-5 w-5 ${s.color}`} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-xl font-bold text-foreground">{s.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
          </div>
        ) : (
          <Tabs defaultValue="inbox">
            <TabsList>
              <TabsTrigger value="inbox">
                Inbox {inbox.length > 0 && <Badge className="ml-2 bg-primary/20 text-primary">{inbox.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
              <TabsTrigger value="all">All ({allRequests.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="inbox" className="mt-4">
              {inbox.length === 0 ? (
                <EmptyState icon={Receipt} message="No reimbursements waiting for finance approval." />
              ) : (
                <div className="space-y-3">
                  {inbox.map((item: any) => (
                    <ReimbursementCard key={item.id} item={item} showActions />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="history" className="mt-4">
              {history.length === 0 ? (
                <EmptyState icon={Clock} message="No processed reimbursements yet." />
              ) : (
                <div className="space-y-3">
                  {history.map((item: any) => (
                    <ReimbursementCard key={item.id} item={item} />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="all" className="mt-4">
              <div className="space-y-3">
                {allRequests.map((item: any) => (
                  <ReimbursementCard key={item.id} item={item} />
                ))}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* ── Approve Dialog ── */}
      <Dialog open={!!approveDialog} onOpenChange={(o) => { if (!o) setApproveDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-400" />
              Approve & Record as Expense
            </DialogTitle>
          </DialogHeader>
          {approveDialog && (
            <div className="space-y-4 py-2">
              <div className="p-3 rounded-lg bg-muted/40 border border-border text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Employee</span>
                  <span className="font-medium">{approveDialog.profiles?.full_name || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Vendor</span>
                  <span className="font-medium">{approveDialog.vendor_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount</span>
                  <span className="font-bold text-green-400">₹{Number(approveDialog.amount).toLocaleString()}</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Expense Classification</Label>
                <Select value={classifyCategory} onValueChange={setClassifyCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder={approveDialog.category || "Select category"} />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Finance Notes (optional)</Label>
                <Textarea
                  placeholder="Notes about the payout…"
                  value={financeNotes}
                  onChange={(e) => setFinanceNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveDialog(null)}>Cancel</Button>
            <Button
              onClick={handleApprove}
              disabled={submitting}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Approve & Mark Paid
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reject Dialog ── */}
      <Dialog open={!!rejectDialog} onOpenChange={(o) => { if (!o) setRejectDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-400" />
              Reject Reimbursement
            </DialogTitle>
          </DialogHeader>
          {rejectDialog && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                Reject <strong>{rejectDialog.profiles?.full_name || "this employee"}</strong>'s claim of ₹{Number(rejectDialog.amount).toLocaleString()} from {rejectDialog.vendor_name}?
              </p>
              <div className="space-y-1.5">
                <Label>Reason for Rejection <span className="text-red-400">*</span></Label>
                <Textarea
                  placeholder="Please provide a reason for rejection…"
                  value={rejectNotes}
                  onChange={(e) => setRejectNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog(null)}>Cancel</Button>
            <Button
              onClick={handleReject}
              disabled={submitting || !rejectNotes}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Preview Dialog ── */}
      <Dialog open={!!previewItem} onOpenChange={(o) => { if (!o) { setPreviewItem(null); setPreviewUrl(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Reimbursement Details</DialogTitle>
          </DialogHeader>
          {previewItem && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  { label: "Employee", value: previewItem.profiles?.full_name },
                  { label: "Vendor", value: previewItem.vendor_name },
                  { label: "Amount", value: `₹${Number(previewItem.amount).toLocaleString()}` },
                  { label: "Category", value: previewItem.category },
                  { label: "Date", value: previewItem.expense_date },
                  { label: "Status", value: statusConfig(previewItem.status).label },
                ].map((row) => row.value ? (
                  <div key={row.label}>
                    <p className="text-xs text-muted-foreground">{row.label}</p>
                    <p className="font-medium">{row.value}</p>
                  </div>
                ) : null)}
              </div>
              {previewItem.description && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Description</p>
                  <p className="text-sm">{previewItem.description}</p>
                </div>
              )}
              {previewItem.manager_notes && (
                <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                  <p className="text-xs text-yellow-400 font-semibold mb-1">Manager Notes</p>
                  <p className="text-sm">{previewItem.manager_notes}</p>
                </div>
              )}
              {previewUrl && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Attached Document</p>
                  {previewItem.file_type?.startsWith("image/") ? (
                    <img src={previewUrl} alt="Receipt" className="rounded-lg max-h-64 object-contain border border-border" />
                  ) : (
                    <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline">
                      <ExternalLink className="h-4 w-4" /> Open PDF in new tab
                    </a>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
