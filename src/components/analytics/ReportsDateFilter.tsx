import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface ReportsDateFilterProps {
  from: Date | undefined;
  to: Date | undefined;
  onFromChange: (date: Date | undefined) => void;
  onToChange: (date: Date | undefined) => void;
  onClear: () => void;
}

export function ReportsDateFilter({ from, to, onFromChange, onToChange, onClear }: ReportsDateFilterProps) {
  const hasFilter = from || to;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className={cn("justify-start text-left font-normal h-8 text-xs", !from && "text-muted-foreground")}>
            <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
            {from ? format(from, "dd MMM yyyy") : "Start date"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={from}
            onSelect={onFromChange}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>

      <span className="text-xs text-muted-foreground">to</span>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className={cn("justify-start text-left font-normal h-8 text-xs", !to && "text-muted-foreground")}>
            <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
            {to ? format(to, "dd MMM yyyy") : "End date"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={to}
            onSelect={onToChange}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>

      {hasFilter && (
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onClear}>
          Clear
        </Button>
      )}
    </div>
  );
}
