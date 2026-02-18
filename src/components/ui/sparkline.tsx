import { ResponsiveContainer, LineChart, Line, Tooltip } from "recharts";
import { cn } from "@/lib/utils";

interface SparklineProps {
  data: { month: string; value: number }[];
  color?: string;       // CSS variable name like "primary" or "destructive"
  className?: string;
  showTooltip?: boolean;
}

function formatK(v: number) {
  if (Math.abs(v) >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (Math.abs(v) >= 1000) return `₹${(v / 1000).toFixed(1)}K`;
  return `₹${v}`;
}

export function Sparkline({ data, color = "primary", className, showTooltip = true }: SparklineProps) {
  if (!data || data.length === 0) return null;

  const values = data.map(d => d.value);
  const isAllZero = values.every(v => v === 0);

  const strokeColor = `hsl(var(--${color}))`;
  const fillColor = `hsl(var(--${color}) / 0.15)`;

  return (
    <div className={cn("w-full h-10", className)}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          {showTooltip && (
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload?.length) {
                  return (
                    <div className="rounded-md border bg-popover px-2 py-1 text-xs shadow-md">
                      <span className="text-muted-foreground">{label}: </span>
                      <span className="font-semibold text-foreground">
                        {formatK(payload[0].value as number)}
                      </span>
                    </div>
                  );
                }
                return null;
              }}
            />
          )}
          <Line
            type="monotone"
            dataKey="value"
            stroke={isAllZero ? "hsl(var(--muted-foreground) / 0.3)" : strokeColor}
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3, fill: strokeColor, strokeWidth: 0 }}
            isAnimationActive={true}
            animationDuration={1000}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
