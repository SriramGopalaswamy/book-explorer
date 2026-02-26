import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  FileText, Plus, CheckCircle, XCircle, Clock, IndianRupee,
  AlertTriangle, CalendarDays, Lock, ShieldCheck,
} from "lucide-react";
import {
  useInvestmentDeclarations,
  useSaveInvestmentDeclaration,
  useApproveDeclaration,
  useTaxRegimes,
} from "@/hooks/useTDSEngine";
import { useCurrentRole } from "@/hooks/useRoles";
import { toast } from "sonner";

// ─── FY26-27 Government-allowed investment buckets ────────────────────────────
const INVESTMENT_BUCKETS = [
  { value: "80C", label: "Section 80C", description: "PPF, ELSS, LIC, NSC, SSY, Home Loan Principal, etc.", max: 150000 },
  { value: "80CCC", label: "Section 80CCC", description: "Pension fund contributions", max: 150000 },
  { value: "80CCD_1", label: "Section 80CCD(1)", description: "Employee NPS contribution", max: 150000 },
  { value: "80CCD_1B", label: "Section 80CCD(1B)", description: "Additional NPS contribution", max: 50000 },
  { value: "80CCD_2", label: "Section 80CCD(2)", description: "Employer NPS contribution (up to 14% of salary)", max: 0 },
  { value: "80D_SELF", label: "Section 80D (Self & Family)", description: "Health insurance premium for self, spouse, children", max: 25000 },
  { value: "80D_PARENTS", label: "Section 80D (Parents)", description: "Health insurance for parents (₹50K if senior citizen)", max: 50000 },
  { value: "80DD", label: "Section 80DD", description: "Maintenance of disabled dependant", max: 125000 },
  { value: "80DDB", label: "Section 80DDB", description: "Medical treatment of specified diseases", max: 100000 },
  { value: "80E", label: "Section 80E", description: "Education loan interest (no limit)", max: 0 },
  { value: "80EE", label: "Section 80EE", description: "Home loan interest (first-time buyers)", max: 50000 },
  { value: "80EEA", label: "Section 80EEA", description: "Affordable housing loan interest", max: 150000 },
  { value: "80G", label: "Section 80G", description: "Donations to approved funds/charities", max: 0 },
  { value: "80GG", label: "Section 80GG", description: "Rent paid (no HRA from employer)", max: 60000 },
  { value: "80TTA", label: "Section 80TTA", description: "Interest on savings account", max: 10000 },
  { value: "80TTB", label: "Section 80TTB", description: "Interest income for senior citizens", max: 50000 },
  { value: "80U", label: "Section 80U", description: "Person with disability", max: 125000 },
  { value: "HRA", label: "HRA Exemption", description: "House Rent Allowance exemption calculation", max: 0 },
  { value: "LTA", label: "LTA Exemption", description: "Leave Travel Allowance", max: 0 },
  { value: "HOME_LOAN_INTEREST", label: "Home Loan Interest (Sec 24)", description: "Interest on home loan for self-occupied property", max: 200000 },
  { value: "STANDARD_DEDUCTION", label: "Standard Deduction", description: "Flat deduction from salary income", max: 75000 },
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

function getNextFY(): string {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() + 1 : now.getFullYear();
  return `${year}-${year + 1}`;
}

/**
 * Check if the declaration window is currently open.
 * Window: April 1–30 each year (employees declare for the upcoming FY).
 */
function isDeclarationWindowOpen(): { open: boolean; daysRemaining: number; windowStart: Date; windowEnd: Date } {
  const now = new Date();
  const year = now.getFullYear();
  const windowStart = new Date(year, 3, 1); // April 1
  const windowEnd = new Date(year, 3, 30, 23, 59, 59); // April 30

  const open = now >= windowStart && now <= windowEnd;
  const daysRemaining = open ? Math.ceil((windowEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : 0;

  return { open, daysRemaining, windowStart, windowEnd };
}

/** FY for which declarations are being made during the April window */
function getDeclarationFY(): string {
  const now = new Date();
  // During April, we declare for the FY that just started (e.g., April 2026 → FY 2026-2027)
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-${year + 1}`;
}

interface InvestmentDeclarationPortalProps {
  profileId: string;
  isAdmin?: boolean;
}

export function InvestmentDeclarationPortal({ profileId, isAdmin = false }: InvestmentDeclarationPortalProps) {
  const declarationFY = getDeclarationFY();
  const [fy, setFY] = useState(declarationFY);
  const { data: declarations = [], isLoading } = useInvestmentDeclarations(profileId, fy);
  const saveDeclaration = useSaveInvestmentDeclaration();
  const approveDeclaration = useApproveDeclaration();
  const { data: regimes = [] } = useTaxRegimes();
  const { data: currentRole } = useCurrentRole();

  const window = isDeclarationWindowOpen();
  const canDeclare = window.open || isAdmin; // Admins can override the window
  const canApproveDecl = isAdmin || currentRole === "admin" || currentRole === "hr" || currentRole === "finance";

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [form, setForm] = useState({ section_type: "80C", declared_amount: 0 });

  const totalDeclared = declarations.reduce((s, d) => s + Number(d.declared_amount), 0);
  const totalApproved = declarations.filter(d => d.status === "approved").reduce((s, d) => s + Number(d.approved_amount), 0);

  // Group declarations by category for a cleaner view
  const sectionMap = useMemo(() => {
    const map = new Map<string, typeof declarations>();
    for (const d of declarations) {
      if (!map.has(d.section_type)) map.set(d.section_type, []);
      map.get(d.section_type)!.push(d);
    }
    return map;
  }, [declarations]);

  const selectedBucket = INVESTMENT_BUCKETS.find(b => b.value === form.section_type);

  const handleSubmit = () => {
    if (form.declared_amount <= 0) {
      toast.error("Amount must be greater than 0");
      return;
    }
    // Validate against max limit
    if (selectedBucket?.max && form.declared_amount > selectedBucket.max) {
      toast.error(`Maximum limit for ${selectedBucket.label} is ${formatCurrency(selectedBucket.max)}`);
      return;
    }
    saveDeclaration.mutate(
      { profile_id: profileId, financial_year: fy, ...form },
      { onSuccess: () => { setIsAddOpen(false); setForm({ section_type: "80C", declared_amount: 0 }); } }
    );
  };

  const availableFYs = [declarationFY];
  const prevFY = `${parseInt(declarationFY) - 1}-${parseInt(declarationFY)}`;
  if (!availableFYs.includes(prevFY)) availableFYs.push(prevFY);

  return (
    <div className="space-y-4">
      {/* Declaration Window Status Banner */}
      {window.open ? (
        <Alert className="border-green-500/30 bg-green-500/5">
          <CalendarDays className="h-4 w-4 text-green-600" />
          <AlertTitle className="text-green-600 font-semibold">
            Declaration Window Open — {window.daysRemaining} day{window.daysRemaining !== 1 ? "s" : ""} remaining
          </AlertTitle>
          <AlertDescription className="text-muted-foreground">
            Submit your investment declarations for FY {declarationFY} before April 30th. 
            These will be used to calculate your monthly TDS deductions throughout the year.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="border-amber-500/30 bg-amber-500/5">
          <Lock className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-600 font-semibold">
            Declaration Window Closed
          </AlertTitle>
          <AlertDescription className="text-muted-foreground">
            The investment declaration window is open from <strong>April 1–30</strong> each year. 
            You can view your existing declarations below.
            {isAdmin && (
              <span className="block mt-1 text-xs text-primary">
                <ShieldCheck className="inline h-3 w-3 mr-1" />
                As an admin, you can still add/modify declarations outside the window.
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      <Card className="glass-card">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-gradient-primary flex items-center gap-2">
              <IndianRupee className="h-5 w-5" /> Investment Declarations
            </CardTitle>
            <CardDescription>Tax saving declarations for FY {fy} (Old Regime)</CardDescription>
          </div>
          <div className="flex gap-2">
            <Select value={fy} onValueChange={setFY}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableFYs.map((f) => (
                  <SelectItem key={f} value={f}>{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canDeclare && (
              <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Declare</Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>New Investment Declaration</DialogTitle>
                    <DialogDescription>
                      Declare your tax-saving investments for FY {fy}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <div>
                      <Label className="text-sm font-medium">Investment Section</Label>
                      <Select value={form.section_type} onValueChange={(v) => setForm({ ...form, section_type: v })}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent className="max-h-60">
                          {INVESTMENT_BUCKETS.map((b) => (
                            <SelectItem key={b.value} value={b.value}>
                              <div className="flex flex-col">
                                <span className="font-medium">{b.label}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {selectedBucket && (
                        <p className="text-xs text-muted-foreground mt-1.5">
                          {selectedBucket.description}
                          {selectedBucket.max > 0 && (
                            <span className="ml-1 font-medium text-primary">
                              · Max: {formatCurrency(selectedBucket.max)}
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                    <div>
                      <Label className="text-sm font-medium">Declared Amount (₹)</Label>
                      <Input
                        type="number"
                        className="mt-1"
                        value={form.declared_amount || ""}
                        onChange={(e) => setForm({ ...form, declared_amount: parseFloat(e.target.value) || 0 })}
                        placeholder="Enter amount"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={saveDeclaration.isPending}>
                      {saveDeclaration.isPending ? "Submitting..." : "Submit Declaration"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <div className="rounded-lg border p-3 bg-muted/30">
              <p className="text-xs text-muted-foreground">Total Declared</p>
              <p className="font-semibold">{formatCurrency(totalDeclared)}</p>
            </div>
            <div className="rounded-lg border p-3 bg-green-500/5">
              <p className="text-xs text-muted-foreground">Approved</p>
              <p className="font-semibold text-green-600">{formatCurrency(totalApproved)}</p>
            </div>
            <div className="rounded-lg border p-3 bg-amber-500/5">
              <p className="text-xs text-muted-foreground">Pending Review</p>
              <p className="font-semibold text-amber-600">
                {formatCurrency(declarations.filter(d => d.status === "submitted").reduce((s, d) => s + Number(d.declared_amount), 0))}
              </p>
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
              {canDeclare && (
                <p className="text-xs text-muted-foreground mt-1">
                  Click "Declare" to add your tax-saving investments
                </p>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Section</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Declared</TableHead>
                  <TableHead className="text-right">Approved</TableHead>
                  <TableHead className="text-right">Max Limit</TableHead>
                  <TableHead>Status</TableHead>
                  {canApproveDecl && <TableHead className="w-24">Action</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {declarations.map((d) => {
                  const bucket = INVESTMENT_BUCKETS.find(b => b.value === d.section_type);
                  return (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{d.section_type}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                        {bucket?.description || "—"}
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(d.declared_amount))}</TableCell>
                      <TableCell className="text-right">{formatCurrency(Number(d.approved_amount))}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {bucket?.max ? formatCurrency(bucket.max) : "No limit"}
                      </TableCell>
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
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600"
                                      onClick={() => approveDeclaration.mutate({ id: d.id, approved_amount: Number(d.declared_amount) })}>
                                      <CheckCircle className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Approve</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                                      onClick={() => approveDeclaration.mutate({ id: d.id, approved_amount: 0 })}>
                                      <XCircle className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Reject</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {/* Tax Impact Note */}
          {totalApproved > 0 && (
            <>
              <Separator className="my-4" />
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                <p className="text-sm font-medium flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Tax Impact Summary
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Your approved declarations of <strong>{formatCurrency(totalApproved)}</strong> will be 
                  used to compute monthly TDS deductions from your salary. Under the Old Tax Regime, 
                  this reduces your taxable income, lowering your monthly tax outflow.
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
