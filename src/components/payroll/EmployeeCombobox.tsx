import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

interface Employee {
  id: string;
  full_name: string | null;
  department: string | null;
  job_title: string | null;
}

interface EmployeeComboboxProps {
  employees: Employee[];
  value: string;
  onSelect: (value: string) => void;
}

export function EmployeeCombobox({ employees, value, onSelect }: EmployeeComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return employees;
    const q = search.toLowerCase();
    return employees.filter(
      (e) =>
        (e.full_name?.toLowerCase() || "").includes(q) ||
        (e.department?.toLowerCase() || "").includes(q) ||
        (e.job_title?.toLowerCase() || "").includes(q)
    );
  }, [employees, search]);

  const selected = employees.find((e) => e.id === value);

  return (
    <div className="grid gap-2">
      <Label>Employee *</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            {selected
              ? `${selected.full_name || "Unnamed"} — ${selected.department || "No dept"}`
              : "Select employee..."}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <div className="flex items-center border-b px-3 py-2">
            <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
            <Input
              placeholder="Search by name, dept, or title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border-0 p-0 shadow-none focus-visible:ring-0 h-8"
            />
          </div>
          <div className="max-h-60 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No employee found.</p>
            ) : (
              filtered.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  className={cn(
                    "relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground transition-colors",
                    value === e.id && "bg-accent"
                  )}
                  onClick={() => {
                    onSelect(e.id);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      value === e.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex flex-col items-start">
                    <span className="font-medium">{e.full_name || "Unnamed"}</span>
                    <span className="text-xs text-muted-foreground">
                      {[e.department, e.job_title].filter(Boolean).join(" · ") || "No dept"}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
