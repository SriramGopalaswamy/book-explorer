import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  FileText, Upload, Trash2, Download, Plus, File,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  useEmployeeDocuments,
  useUploadEmployeeDocument,
  useDeleteEmployeeDocument,
  DOC_TYPES,
  type EmployeeDocument,
} from "@/hooks/useEmployeeDocuments";

const formatFileSize = (bytes: number | null) => {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
};

interface Props {
  profileId: string;
  canEdit: boolean;
}

export function DocumentsTab({ profileId, canEdit }: Props) {
  const { data: documents = [], isLoading } = useEmployeeDocuments(profileId);
  const upload = useUploadEmployeeDocument();
  const deleteMut = useDeleteEmployeeDocument();
  const [showUpload, setShowUpload] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EmployeeDocument | null>(null);

  const handleDownload = async (doc: EmployeeDocument) => {
    const { data } = await supabase.storage
      .from("employee-documents")
      .createSignedUrl(doc.file_path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  if (isLoading) {
    return (
      <div className="space-y-3 py-4">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Documents ({documents.length})
        </p>
        {canEdit && (
          <Button size="sm" onClick={() => setShowUpload(true)}>
            <Upload className="h-4 w-4 mr-1" /> Upload
          </Button>
        )}
      </div>

      {documents.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">No documents uploaded</p>
          {canEdit && (
            <Button size="sm" variant="outline" className="mt-3" onClick={() => setShowUpload(true)}>
              <Plus className="h-4 w-4 mr-1" /> Upload First Document
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-muted/50 transition-colors"
            >
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <File className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{doc.document_name}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="text-[10px] h-5">{doc.document_type}</Badge>
                  <span>{formatFileSize(doc.file_size)}</span>
                  <span>·</span>
                  <span>{new Date(doc.created_at).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" })}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDownload(doc)}>
                  <Download className="h-4 w-4" />
                </Button>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteTarget(doc)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <UploadDialog
        open={showUpload}
        onOpenChange={setShowUpload}
        profileId={profileId}
        onUpload={upload}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Remove "{deleteTarget?.document_name}"? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                deleteTarget &&
                deleteMut.mutate(
                  { id: deleteTarget.id, filePath: deleteTarget.file_path, profileId },
                  { onSuccess: () => setDeleteTarget(null) }
                )
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function UploadDialog({
  open,
  onOpenChange,
  profileId,
  onUpload,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profileId: string;
  onUpload: ReturnType<typeof useUploadEmployeeDocument>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState("Other");
  const [docName, setDocName] = useState("");
  const [notes, setNotes] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    if (!file) return;
    onUpload.mutate(
      {
        profileId,
        file,
        documentType: docType,
        documentName: docName || file.name,
        notes: notes || undefined,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          setFile(null);
          setDocName("");
          setNotes("");
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
          <DialogDescription>Add a document to the employee's file</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid gap-1">
            <Label className="text-xs">Document Type</Label>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DOC_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Document Name</Label>
            <Input
              value={docName}
              onChange={(e) => setDocName(e.target.value)}
              placeholder="e.g. Offer Letter - Jan 2026"
              className="h-9"
            />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">File</Label>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <Button
              variant="outline"
              className="h-9 justify-start text-sm"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-4 w-4 mr-2" />
              {file ? file.name : "Choose file..."}
            </Button>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Notes (optional)</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes"
              className="h-9"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!file || onUpload.isPending}>
            {onUpload.isPending ? "Uploading..." : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
