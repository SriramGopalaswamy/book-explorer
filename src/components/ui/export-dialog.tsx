import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

export interface ExportDialogProps {
  trigger?: React.ReactNode;
  title: string;
  description?: string;
  /**
   * Returns the number of exported rows. Should perform the file download itself.
   */
  onExport: (range: { startDate?: string; endDate?: string }) => Promise<number>;
}

export function ExportDialog({ trigger, title, description, onExport }: ExportDialogProps) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const count = await onExport({
        startDate: start || undefined,
        endDate: end || undefined,
      });
      toast.success(`Exported ${count.toLocaleString("en-IN")} record${count === 1 ? "" : "s"}.`);
      setOpen(false);
    } catch (e: any) {
      toast.error(`Export failed: ${e?.message ?? "unknown error"}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          <div>
            <Label className="text-xs">From</Label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Leave dates blank to export every record. Large exports may take a few seconds.
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button onClick={run} disabled={busy}>
            {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Exporting…</> : <><Download className="h-4 w-4 mr-2" /> Download CSV</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
