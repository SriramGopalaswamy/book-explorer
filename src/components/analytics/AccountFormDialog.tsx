import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useCreateAccount, useUpdateAccount, type ChartAccount, type ChartAccountInput } from "@/hooks/useAnalytics";
import { toast } from "sonner";

interface AccountFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account?: ChartAccount | null;
}

const accountTypes = [
  { value: "asset", label: "Asset" },
  { value: "liability", label: "Liability" },
  { value: "equity", label: "Equity" },
  { value: "revenue", label: "Revenue" },
  { value: "expense", label: "Expense" },
];

export function AccountFormDialog({ open, onOpenChange, account }: AccountFormDialogProps) {
  const createMutation = useCreateAccount();
  const updateMutation = useUpdateAccount();
  const isEditing = !!account;

  const [form, setForm] = useState<ChartAccountInput>({
    code: "",
    name: "",
    account_type: "asset",
    description: "",
    is_active: true,
  });

  useEffect(() => {
    if (account) {
      setForm({
        code: account.code,
        name: account.name,
        account_type: account.account_type,
        description: account.description || "",
        is_active: account.is_active,
      });
    } else {
      setForm({
        code: "",
        name: "",
        account_type: "asset",
        description: "",
        is_active: true,
      });
    }
  }, [account, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) {
      toast.error("Account code and name are required");
      return;
    }

    try {
      if (isEditing && account) {
        await updateMutation.mutateAsync({ id: account.id, ...form });
        toast.success("Account updated successfully");
      } else {
        await createMutation.mutateAsync(form);
        toast.success("Account created successfully");
      }
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to save account");
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Account" : "Create Account"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="code">Account Code</Label>
              <Input
                id="code"
                placeholder="e.g. 1100"
                value={form.code}
                onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
                maxLength={10}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account_type">Type</Label>
              <Select
                value={form.account_type}
                onValueChange={(v) => setForm((p) => ({ ...p, account_type: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {accountTypes.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Account Name</Label>
            <Input
              id="name"
              placeholder="e.g. Cash in Hand"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              maxLength={100}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Optional description..."
              value={form.description || ""}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              maxLength={500}
              rows={2}
            />
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="is_active"
              checked={form.is_active}
              onCheckedChange={(v) => setForm((p) => ({ ...p, is_active: v }))}
            />
            <Label htmlFor="is_active">Active</Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : isEditing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
