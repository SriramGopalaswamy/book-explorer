import { useState } from "react";
import { Calendar } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface AccountingFiltersProps {
  onDateRangeChange?: (range: { start: Date | null; end: Date | null }) => void;
  onAccountingModeChange?: (enabled: boolean) => void;
  showAccountingMode?: boolean;
  showDateFilter?: boolean;
  baseCurrency?: string;
}

export const AccountingFilters = ({
  onDateRangeChange,
  onAccountingModeChange,
  showAccountingMode = true,
  showDateFilter = true,
  baseCurrency = "USD",
}: AccountingFiltersProps) => {
  const [accountingMode, setAccountingMode] = useState(false);
  const [dateRange, setDateRange] = useState<{ start: Date | null; end: Date | null }>({
    start: null,
    end: null,
  });
  const [tempStartDate, setTempStartDate] = useState<Date | undefined>();
  const [tempEndDate, setTempEndDate] = useState<Date | undefined>();

  const handleAccountingModeToggle = (checked: boolean) => {
    setAccountingMode(checked);
    onAccountingModeChange?.(checked);
  };

  const handleApplyDateRange = () => {
    const newRange = {
      start: tempStartDate || null,
      end: tempEndDate || null,
    };
    setDateRange(newRange);
    onDateRangeChange?.(newRange);
  };

  const handleClearDateRange = () => {
    setDateRange({ start: null, end: null });
    setTempStartDate(undefined);
    setTempEndDate(undefined);
    onDateRangeChange?.({ start: null, end: null });
  };

  return (
    <div className="flex flex-wrap items-center gap-4 p-4 bg-muted/50 rounded-lg border">
      {showAccountingMode && (
        <div className="flex items-center gap-2">
          <Switch
            id="accounting-mode"
            checked={accountingMode}
            onCheckedChange={handleAccountingModeToggle}
          />
          <Label htmlFor="accounting-mode" className="cursor-pointer font-medium">
            Accounting Mode
          </Label>
          {accountingMode && (
            <span className="text-xs text-muted-foreground">
              (Using posting_date from journal entries)
            </span>
          )}
        </div>
      )}

      {showDateFilter && (
        <div className="flex items-center gap-2">
          <Label className="font-medium">Posting Date:</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "justify-start text-left font-normal",
                  !dateRange.start && !dateRange.end && "text-muted-foreground"
                )}
              >
                <Calendar className="mr-2 h-4 w-4" />
                {dateRange.start ? (
                  dateRange.end ? (
                    <>
                      {format(dateRange.start, "MMM d, yyyy")} - {format(dateRange.end, "MMM d, yyyy")}
                    </>
                  ) : (
                    format(dateRange.start, "MMM d, yyyy")
                  )
                ) : (
                  <span>All dates</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-4" align="start">
              <div className="space-y-4">
                <div>
                  <Label className="text-sm mb-2 block">Start Date</Label>
                  <CalendarComponent
                    mode="single"
                    selected={tempStartDate}
                    onSelect={setTempStartDate}
                    initialFocus
                  />
                </div>
                <div>
                  <Label className="text-sm mb-2 block">End Date</Label>
                  <CalendarComponent
                    mode="single"
                    selected={tempEndDate}
                    onSelect={setTempEndDate}
                    disabled={(date) => 
                      tempStartDate ? date < tempStartDate : false
                    }
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleApplyDateRange} size="sm" className="flex-1">
                    Apply
                  </Button>
                  <Button 
                    onClick={handleClearDateRange} 
                    size="sm" 
                    variant="outline"
                    className="flex-1"
                  >
                    Clear
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}

      <div className="flex items-center gap-2 ml-auto">
        <Label className="text-sm text-muted-foreground">Base Currency:</Label>
        <span className="font-mono font-semibold text-sm bg-background px-2 py-1 rounded border">
          {baseCurrency}
        </span>
      </div>
    </div>
  );
};
