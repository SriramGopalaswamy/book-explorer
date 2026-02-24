import { useState, useRef, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  FileText,
  Plus,
  Search,
  Clock,
  CheckCircle,
  Eye,
  Edit,
  Send,
  AlertCircle,
  Trash2,
  Paperclip,
  X,
  XCircle,
  Download,
  Users,
} from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import {
  useMemos,
  useMemoStats,
  useCreateMemo,
  useUpdateMemo,
  useDeleteMemo,
  useIncrementMemoViews,
  useApproveMemo,
  useRejectMemo,
  useProfileSearch,
  uploadMemoAttachment,
  type Memo,
} from "@/hooks/useMemos";
import { useCurrentRole } from "@/hooks/useRoles";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ─── Recipient autocomplete chip input ────────────────────────────────────────
function RecipientInput({
  recipients,
  onAdd,
  onRemove,
}: {
  recipients: string[];
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
}) {
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const { data: suggestions = [] } = useProfileSearch(input);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function handleSelect(name: string) {
    if (!recipients.includes(name)) onAdd(name);
    setInput("");
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.key === "Enter" || e.key === ",") && input.trim()) {
      e.preventDefault();
      handleSelect(input.trim());
    }
    if (e.key === "Backspace" && !input && recipients.length) {
      onRemove(recipients[recipients.length - 1]);
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div className="min-h-10 flex flex-wrap gap-1.5 items-center border border-input rounded-md px-3 py-2 bg-background focus-within:ring-1 focus-within:ring-ring">
        {recipients.map((r) => (
          <span
            key={r}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20"
          >
            {r}
            <button
              type="button"
              onClick={() => onRemove(r)}
              className="hover:text-destructive ml-0.5"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          className="flex-1 min-w-32 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          placeholder={recipients.length === 0 ? 'Type a name or "GRX10-All" for everyone…' : "Add more…"}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setOpen(e.target.value.length >= 2);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => input.length >= 2 && setOpen(true)}
        />
      </div>

      {/* Suggestions dropdown */}
      {open && (suggestions.length > 0 || input === "GRX10-All") && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg max-h-48 overflow-y-auto">
          {input.toLowerCase().startsWith("grx") && (
            <button
              type="button"
              className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent text-left font-medium text-primary"
              onMouseDown={(e) => { e.preventDefault(); handleSelect("GRX10-All"); }}
            >
              <Users className="h-4 w-4" />
              GRX10-All — Send to everyone
            </button>
          )}
          {suggestions.map((p) => (
            <button
              key={p.id}
              type="button"
              className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent text-left"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(p.full_name || ""); }}
            >
              <Avatar className="h-6 w-6">
                <AvatarFallback className="text-[10px]">
                  {(p.full_name || "?").split(" ").map((n) => n[0]).join("")}
                </AvatarFallback>
              </Avatar>
              <span className="font-medium">{p.full_name}</span>
              {p.department && (
                <span className="text-muted-foreground text-xs ml-auto">{p.department}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function Memos() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedMemo, setSelectedMemo] = useState<Memo | null>(null);
  const [activeTab, setActiveTab] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [showRejectInput, setShowRejectInput] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [summary, setSummary] = useState("");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [existingAttachmentUrl, setExistingAttachmentUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { user } = useAuth();
  const { data: currentRole } = useCurrentRole();
  const isManager = currentRole === "manager" || currentRole === "admin" || currentRole === "hr";
  const { data: memos = [], isLoading } = useMemos(activeTab);
  const { data: stats } = useMemoStats();
  const createMemo = useCreateMemo();
  const deleteMemo = useDeleteMemo();
  const updateMemo = useUpdateMemo();
  const incrementViews = useIncrementMemoViews();
  const approveMemo = useApproveMemo();
  const rejectMemo = useRejectMemo();

  const filteredMemos = memos.filter(
    (memo) =>
      !searchTerm ||
      memo.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      memo.author_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (memo.subject?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  function resetForm() {
    setTitle("");
    setSubject("");
    setSummary("");
    setRecipients([]);
    setAttachmentFile(null);
    setEditingDraftId(null);
    setExistingAttachmentUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const isFormValid = title.trim() && subject.trim() && (attachmentFile || existingAttachmentUrl);

  function handleEditDraft(memo: Memo) {
    setEditingDraftId(memo.id);
    setTitle(memo.title);
    setSubject(memo.subject || "");
    setSummary(memo.content || "");
    setRecipients(memo.recipients || []);
    setExistingAttachmentUrl(memo.attachment_url);
    setAttachmentFile(null);
    setViewDialogOpen(false);
    setIsDialogOpen(true);
  }

  async function handleSubmit(status: "draft" | "pending_approval") {
    if (!title.trim() || !subject.trim()) {
      toast.error("Title and Memo Subject are required");
      return;
    }
    if (status === "pending_approval" && !attachmentFile && !existingAttachmentUrl) {
      toast.error("An attachment is required to submit for approval");
      return;
    }

    setIsSubmitting(true);
    try {
      let attachment_url: string | null = existingAttachmentUrl;
      if (attachmentFile && user) {
        attachment_url = await uploadMemoAttachment(attachmentFile, user.id);
      }

      if (editingDraftId) {
        // Update existing draft
        await updateMemo.mutateAsync({
          id: editingDraftId,
          title: title.trim(),
          subject: subject.trim(),
          content: summary.trim() || null,
          status,
          recipients,
          attachment_url,
        });
      } else {
        const authorName =
          user?.user_metadata?.full_name ||
          user?.email?.split("@")[0] ||
          "Unknown";

        await createMemo.mutateAsync({
          title: title.trim(),
          subject: subject.trim(),
          content: summary.trim() || undefined,
          status,
          author_name: authorName,
          recipients,
          attachment_url,
        });
      }

      setIsDialogOpen(false);
      resetForm();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error("Failed to save memo: " + message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleViewMemo(memo: Memo) {
    setSelectedMemo(memo);
    setViewDialogOpen(true);
    setReviewNotes("");
    setShowRejectInput(false);
    setIsApproving(false);
    setIsRejecting(false);
    if (memo.status === "published") {
      incrementViews.mutate(memo.id);
    }
  }

  async function handleApproveMemo() {
    if (!selectedMemo) return;
    setIsApproving(true);
    try {
      await approveMemo.mutateAsync({ id: selectedMemo.id, reviewerNotes: reviewNotes || undefined });
      setViewDialogOpen(false);
    } catch {
      // error handled by hook
    } finally {
      setIsApproving(false);
    }
  }

  async function handleRejectMemo() {
    if (!selectedMemo || !reviewNotes.trim()) {
      toast.error("Please provide a reason for rejection");
      return;
    }
    setIsRejecting(true);
    try {
      await rejectMemo.mutateAsync({ id: selectedMemo.id, reviewerNotes: reviewNotes.trim() });
      setViewDialogOpen(false);
    } catch {
      // error handled by hook
    } finally {
      setIsRejecting(false);
    }
  }

  async function downloadAttachment(attachmentUrl: string, fileName: string) {
    try {
      const { data, error } = await supabase.storage
        .from("memo-attachments")
        .download(attachmentUrl);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to download attachment");
    }
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { class: string; icon: typeof CheckCircle; label: string }> = {
      published:        { class: "bg-green-100 text-green-700 border-green-200",   icon: CheckCircle, label: "Published" },
      draft:            { class: "bg-gray-100 text-gray-700 border-gray-200",      icon: Edit,        label: "Draft" },
      pending_approval: { class: "bg-amber-100 text-amber-700 border-amber-200",   icon: Clock,       label: "Pending Approval" },
      rejected:         { class: "bg-red-100 text-red-700 border-red-200",         icon: XCircle,     label: "Rejected" },
    };
    const style = styles[status] || styles.draft;
    const Icon = style.icon;
    return (
      <Badge variant="outline" className={style.class}>
        <Icon className="h-3 w-3 mr-1" />
        {style.label}
      </Badge>
    );
  };

  return (
    <MainLayout title="Memos" subtitle="Internal communications and announcements">
      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Memos</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
            <p className="text-xs text-muted-foreground">This year</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Published</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats?.published || 0}</div>
            <p className="text-xs text-muted-foreground">Active memos</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Drafts</CardTitle>
            <Edit className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.drafts || 0}</div>
            <p className="text-xs text-muted-foreground">In progress</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Review</CardTitle>
            <AlertCircle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{stats?.pending || 0}</div>
            <p className="text-xs text-muted-foreground">Awaiting approval</p>
          </CardContent>
        </Card>
      </div>

      {/* Memos list */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>All Memos</CardTitle>
            <CardDescription>Company-wide communications and announcements</CardDescription>
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search memos…"
                className="pl-9 w-64"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Create Memo Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={(o) => { setIsDialogOpen(o); if (!o) resetForm(); }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Memo
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingDraftId ? "Edit Draft Memo" : "Create New Memo"}</DialogTitle>
                  <DialogDescription>
                    {editingDraftId
                      ? "Update your draft and submit for approval, or save changes."
                      : "Fill in all details. The memo will be sent to your manager for approval before being distributed."}
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                  {/* Recipients */}
                  <div className="grid gap-2">
                    <Label>
                      To (Recipients) <span className="text-destructive">*</span>
                    </Label>
                    <RecipientInput
                      recipients={recipients}
                      onAdd={(name) => setRecipients((prev) => [...prev, name])}
                      onRemove={(name) => setRecipients((prev) => prev.filter((r) => r !== name))}
                    />
                    <p className="text-xs text-muted-foreground">
                      Type a name to search employees. Use <strong>GRX10-All</strong> to send to everyone.
                    </p>
                  </div>

                  {/* Title */}
                  <div className="grid gap-2">
                    <Label>
                      Memo Title <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      placeholder="Enter memo title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </div>

                  {/* Subject */}
                  <div className="grid gap-2">
                    <Label>
                      Memo Subject <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      placeholder="e.g. Q1 Performance Review — Action Required"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      This will appear as the email subject when the memo is sent.
                    </p>
                  </div>

                  {/* Memo Summary (formerly Content) */}
                  <div className="grid gap-2">
                    <Label>Memo Summary</Label>
                    <Textarea
                      placeholder="Write your memo summary here…"
                      className="min-h-[150px]"
                      value={summary}
                      onChange={(e) => setSummary(e.target.value)}
                    />
                  </div>

                  {/* Attachment */}
                  <div className="grid gap-2">
                    <Label>
                      Attachment <span className="text-destructive">*</span>
                    </Label>
                    <div
                      className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {attachmentFile ? (
                        <div className="flex items-center justify-center gap-2">
                          <Paperclip className="h-5 w-5 text-primary" />
                          <span className="text-sm font-medium text-foreground">{attachmentFile.name}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setAttachmentFile(null);
                              if (fileInputRef.current) fileInputRef.current.value = "";
                            }}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : existingAttachmentUrl ? (
                        <div className="flex items-center justify-center gap-2">
                          <Paperclip className="h-5 w-5 text-primary" />
                          <span className="text-sm font-medium text-foreground">
                            {existingAttachmentUrl.split("/").pop() || "Existing attachment"}
                          </span>
                          <span className="text-xs text-muted-foreground">(click to replace)</span>
                        </div>
                      ) : (
                        <div className="text-muted-foreground">
                          <Paperclip className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">Click to upload — PDF, Word, Excel, PowerPoint, or Image</p>
                          <p className="text-xs mt-1">Max 20 MB</p>
                        </div>
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.webp,.txt"
                      onChange={(e) => setAttachmentFile(e.target.files?.[0] ?? null)}
                    />
                  </div>
                </div>

                <DialogFooter className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => handleSubmit("draft")}
                    disabled={isSubmitting || !title.trim()}
                  >
                    Save Draft
                  </Button>
                  <Button
                    onClick={() => handleSubmit("pending_approval")}
                    disabled={isSubmitting || !isFormValid}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    {isSubmitting ? "Submitting…" : "Submit for Approval"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>

        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="published">Published</TabsTrigger>
              <TabsTrigger value="pending">Pending</TabsTrigger>
              <TabsTrigger value="draft">Drafts</TabsTrigger>
              <TabsTrigger value="rejected">Rejected</TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab}>
              {isLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              ) : filteredMemos.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No memos found</div>
              ) : (
                <div className="space-y-4">
                  {filteredMemos.map((memo) => (
                    <div
                      key={memo.id}
                      className="p-4 rounded-lg border hover:bg-secondary/30 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1 flex-wrap">
                            <h3 className="font-semibold text-lg leading-tight">{memo.title}</h3>
                            {getStatusBadge(memo.status)}
                          </div>
                          {memo.subject && (
                            <p className="text-sm text-primary font-medium mb-1">Subject: {memo.subject}</p>
                          )}
                          {memo.excerpt && (
                            <p className="text-muted-foreground text-sm mb-2">{memo.excerpt}</p>
                          )}
                          {memo.recipients && memo.recipients.length > 0 && (
                            <div className="flex items-center gap-1.5 mb-2 text-sm">
                              <span className="font-medium text-muted-foreground">To:</span>
                              <span className="text-foreground truncate">
                                {memo.recipients.join(", ")}
                              </span>
                            </div>
                          )}
                          {memo.status === "rejected" && memo.reviewer_notes && (
                            <div className="mt-2 p-2 rounded bg-red-50 border border-red-200 text-sm text-red-700">
                              <strong>Rejection reason:</strong> {memo.reviewer_notes}
                            </div>
                          )}
                          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-2">
                            <div className="flex items-center gap-2">
                              <Avatar className="h-6 w-6">
                                <AvatarFallback className="text-xs">
                                  {memo.author_name.split(" ").map((n) => n[0]).join("")}
                                </AvatarFallback>
                              </Avatar>
                              <span>{memo.author_name}</span>
                            </div>
                            <span>•</span>
                            <span>{format(new Date(memo.created_at), "MMM d, yyyy")}</span>
                            {memo.status === "published" && (
                              <>
                                <span>•</span>
                                <span className="flex items-center gap-1">
                                  <Eye className="h-3 w-3" />
                                  {memo.views} views
                                </span>
                              </>
                            )}
                            {memo.attachment_url && (
                              <>
                                <span>•</span>
                                <span className="flex items-center gap-1">
                                  <Paperclip className="h-3 w-3" />
                                  Attachment
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button variant="outline" size="sm" onClick={() => handleViewMemo(memo)}>
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => deleteMemo.mutate(memo.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* View Memo Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <div className="flex items-start gap-3 mb-1">
              <div className="flex-1">
                <DialogTitle className="text-xl leading-tight">{selectedMemo?.title}</DialogTitle>
                {selectedMemo?.subject && (
                  <p className="text-sm text-primary font-medium mt-1">
                    Subject: {selectedMemo.subject}
                  </p>
                )}
                <DialogDescription className="mt-1">
                  By {selectedMemo?.author_name} ·{" "}
                  {selectedMemo && format(new Date(selectedMemo.created_at), "MMMM d, yyyy")}
                </DialogDescription>
              </div>
            </div>
            <div className="flex gap-2 mt-2 flex-wrap">
              {selectedMemo && getStatusBadge(selectedMemo.status)}
              {selectedMemo?.status === "published" && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Eye className="h-3 w-3" /> {selectedMemo.views} views
                </span>
              )}
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-4 space-y-4">
            {selectedMemo?.recipients && selectedMemo.recipients.length > 0 && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 border border-border/50">
                <span className="font-semibold text-sm text-muted-foreground shrink-0">To:</span>
                <span className="text-sm">{selectedMemo.recipients.join(", ")}</span>
              </div>
            )}

            {selectedMemo?.content && (
              <div className="rounded-lg border border-border/40 bg-card p-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Memo Summary
                </p>
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">
                  {selectedMemo.content}
                </p>
              </div>
            )}

            {selectedMemo?.attachment_url && (
              <div className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-muted/30">
                <Paperclip className="h-5 w-5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Attachment</p>
                  <p className="text-xs text-muted-foreground truncate">{selectedMemo.attachment_url.split("/").pop()}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    downloadAttachment(
                      selectedMemo.attachment_url!,
                      selectedMemo.attachment_url!.split("/").pop() || "attachment"
                    )
                  }
                >
                  <Download className="h-4 w-4 mr-1" />
                  Download
                </Button>
              </div>
            )}

            {selectedMemo?.status === "rejected" && selectedMemo.reviewer_notes && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-1">
                  Rejection Feedback
                </p>
                <p className="text-sm text-red-700">{selectedMemo.reviewer_notes}</p>
              </div>
            )}
          </div>

          <DialogFooter className="shrink-0 pt-2 border-t border-border/40">
            {isManager && selectedMemo?.status === "pending_approval" && (
              <div className="flex flex-col w-full gap-3">
                {showRejectInput ? (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Reason for rejection</Label>
                    <Textarea
                      placeholder="Provide feedback for the author…"
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      className="min-h-[80px]"
                    />
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" size="sm" onClick={() => { setShowRejectInput(false); setReviewNotes(""); }}>
                        Cancel
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleRejectMemo}
                        disabled={isRejecting || !reviewNotes.trim()}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        {isRejecting ? "Rejecting…" : "Confirm Rejection"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <Textarea
                      placeholder="Optional reviewer notes…"
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      className="min-h-[60px]"
                    />
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
                        Close
                      </Button>
                      <Button
                        variant="outline"
                        className="border-destructive text-destructive hover:bg-destructive/10"
                        onClick={() => setShowRejectInput(true)}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                      <Button onClick={handleApproveMemo} disabled={isApproving}>
                        <CheckCircle className="h-4 w-4 mr-1" />
                        {isApproving ? "Approving…" : "Approve & Publish"}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
            {!(isManager && selectedMemo?.status === "pending_approval") && (
              <div className="flex gap-2 justify-end w-full">
                <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
                  Close
                </Button>
                {selectedMemo?.status === "draft" && selectedMemo?.user_id === user?.id && (
                  <Button onClick={() => handleEditDraft(selectedMemo)}>
                    <Edit className="h-4 w-4 mr-1" />
                    Edit & Submit
                  </Button>
                )}
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
