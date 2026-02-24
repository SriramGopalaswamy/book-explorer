import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  FileText, Plus, Upload, CheckCircle, XCircle, Clock, IndianRupee,
} from "lucide-react";
import {
  useInvestmentDeclarations,
  useSaveInvestmentDeclaration,
  useApproveDeclaration,
  useEmployeeTaxSettings,
  useTaxRegimes,
  useTaxSlabs,
  computeMonthlyTDS,
} from "@/hooks/useTDSEngine";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrentRole } from "@/hooks/useRoles";
import { toast } from "sonner";

const SECTION_TYPES = [
  { value: "80C", label: "Section 80C (PF, PPF, ELSS, LIC, etc.)", max: 150000 },
  { value: "80D", label: "Section 80D (Health Insurance)", max: 100000 },
  { value: "80E", label: "Section 80E (Education Loan Interest)", max: 0 },
  { value: "80G", label: "Section 80G (Donations)", max: 0 },
  { value: "HRA", label: "HRA Exemption", max: 0 },
  { value: "NPS", label: "Section 80CCD(1B) NPS", max: 50000 },
  { value: "OTHER", label: "Other Deductions", max: 0 },
];

const statusStyles: Record<string, string> = {
  submitted: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  approved: "bg-green-500/10 text-green-600 border-green-500/30",
  rejected: "bg-destructive/10 text-destructive border-destructive/30",
};

const formatCurrency = (v: number) => `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

function getCurrentFY(): string {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-${year + 1}`;
}

interface InvestmentDeclarationPortalProps {
  profileId: string;
  isAdmin?: boolean;
}

export function InvestmentDeclarationPortal({ profileId, isAdmin = false }: InvestmentDeclarationPortalProps) {
  const [fy, setFY] = useState(getCurrentFY());
  const { data: declarations = [], isLoading } = useInvestmentDeclarations(profileId, fy);
  const saveDeclaration = useSaveInvestmentDeclaration();
  const approveDeclaration = useApproveDeclaration();
  const { data: regimes = [] } = useTaxRegimes();
  const { data: currentRole } = useCurrentRole();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [form, setForm] = useState({ section_type: "80C", declared_amount: 0 });

  const canApproveDecl = isAdmin || currentRole === "admin" || currentRole === "hr";

  const totalDeclared = declarations.reduce((s, d) => s + Number(d.declared_amount), 0);
  const totalApproved = declarations.filter(d => d.status === "approved").reduce((s, d) => s + Number(d.approved_amount), 0);

  const handleSubmit = () => {
    if (form.declared_amount <= 0) {
      toast.error("Amount must be greater than 0");
      return;
    }
    saveDeclaration.mutate(
      { profile_id: profileId, financial_year: fy, ...form },
      { onSuccess: () => { setIsAddOpen(false); setForm({ section_type: "80C", declared_amount: 0 }); } }
    );
  };

  return (
    <Card className="glass-card">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-gradient-primary flex items-center gap-2">
            <IndianRupee className="h-5 w-5" /> Investment Declarations
          </CardTitle>
          <CardDescription>Tax saving declarations for FY {fy}</CardDescription>
        </div>
        <div className="flex gap-2">
          <Select value={fy} onValueChange={setFY}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[getCurrentFY(), `${parseInt(getCurrentFY()) - 1}-${parseInt(getCurrentFY())}`].map((f) => (
                <SelectItem key={f} value={f}>{f}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Declare</Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>New Declaration</DialogTitle>
                <DialogDescription>Add tax saving declaration for FY {fy}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <Label>Section</Label>
                  <Select value={form.section_type} onValueChange={(v) => setForm({ ...form, section_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SECTION_TYPES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Declared Amount (₹)</Label>
                  <Input
                    type="number"
                    value={form.declared_amount || ""}
                    onChange={(e) => setForm({ ...form, declared_amount: parseFloat(e.target.value) || 0 })}
                  />
                  {SECTION_TYPES.find(s => s.value === form.section_type)?.max ? (
                    <p className="text-xs text-muted-foreground mt-1">
                      Max limit: {formatCurrency(SECTION_TYPES.find(s => s.value === form.section_type)?.max || 0)}
                    </p>
                  ) : null}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
                <Button onClick={handleSubmit} disabled={saveDeclaration.isPending}>
                  {saveDeclaration.isPending ? "Submitting..." : "Submit"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {/* Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
          <div className="rounded-lg border p-3 bg-muted/30">
            <p className="text-xs text-muted-foreground">Total Declared</p>
            <p className="font-semibold">{formatCurrency(totalDeclared)}</p>
          </div>
          <div className="rounded-lg border p-3 bg-green-500/5">
            <p className="text-xs text-muted-foreground">Total Approved</p>
            <p className="font-semibold text-green-600">{formatCurrency(totalApproved)}</p>
          </div>
          <div className="rounded-lg border p-3 bg-muted/30">
            <p className="text-xs text-muted-foreground">Declarations</p>
            <p className="font-semibold">{declarations.length}</p>
          </div>
        </div>

        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : declarations.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">No declarations for FY {fy}</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Section</TableHead>
                <TableHead className="text-right">Declared</TableHead>
                <TableHead className="text-right">Approved</TableHead>
                <TableHead>Status</TableHead>
                {canApproveDecl && <TableHead className="w-24">Action</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {declarations.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.section_type}</TableCell>
                  <TableCell className="text-right">{formatCurrency(Number(d.declared_amount))}</TableCell>
                  <TableCell className="text-right">{formatCurrency(Number(d.approved_amount))}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusStyles[d.status] || ""}>
                      {d.status === "submitted" && <Clock className="h-3 w-3 mr-1" />}
                      {d.status === "approved" && <CheckCircle className="h-3 w-3 mr-1" />}
                      {d.status === "rejected" && <XCircle className="h-3 w-3 mr-1" />}
                      {d.status}
                    </Badge>
                  </TableCell>
                  {canApproveDecl && (
                    <TableCell>
                      {d.status === "submitted" && (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600"
                            onClick={() => approveDeclaration.mutate({ id: d.id, approved_amount: Number(d.declared_amount) })}>
                            <CheckCircle className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
