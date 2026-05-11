/**
 * GBC-21 + GBC-20: extracted Settings → Goal Cycle Deadlines section.
 *
 * Field/handler inventory:
 *   - input_start_day        (1–28)
 *   - input_deadline_day     (1–28)
 *   - scoring_start_day      (1–31)
 *   - scoring_deadline_day   (1–31)
 *
 *   Data source: useGoalCycleConfigs() — defaults loaded from the row
 *   with cycle_month = '*'. handleSave upserts the same row.
 *
 * RHF + zod validation: range checks per field + start < deadline
 * within each window (cross-field zod refinement).
 */

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Target, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useGoalCycleConfigs, useUpsertGoalCycleConfig } from "@/hooks/useGoalCycleConfig";

const goalCycleSchema = z
  .object({
    input_start_day: z.coerce.number().int().min(1).max(28),
    input_deadline_day: z.coerce.number().int().min(1).max(28),
    scoring_start_day: z.coerce.number().int().min(1).max(31),
    scoring_deadline_day: z.coerce.number().int().min(1).max(31),
  })
  .refine((v) => v.input_start_day <= v.input_deadline_day, {
    message: "Input window: start day must be on or before the deadline day",
    path: ["input_deadline_day"],
  })
  .refine((v) => v.scoring_start_day <= v.scoring_deadline_day, {
    message: "Scoring window: start day must be on or before the deadline day",
    path: ["scoring_deadline_day"],
  });

type GoalCycleForm = z.infer<typeof goalCycleSchema>;

const DEFAULTS: GoalCycleForm = {
  input_start_day: 1,
  input_deadline_day: 7,
  scoring_start_day: 25,
  scoring_deadline_day: 28,
};

export default function GoalCycleSection() {
  const { data: configs, isLoading } = useGoalCycleConfigs();
  const upsert = useUpsertGoalCycleConfig();

  const form = useForm<GoalCycleForm>({
    resolver: zodResolver(goalCycleSchema),
    defaultValues: DEFAULTS,
    mode: "onBlur",
  });
  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting, isDirty } } = form;

  // Seed defaults from the cycle_month='*' row when configs load.
  useEffect(() => {
    if (!configs) return;
    const def = configs.find((c) => c.cycle_month === "*");
    if (def) {
      reset({
        input_start_day: def.input_start_day,
        input_deadline_day: def.input_deadline_day,
        scoring_start_day: def.scoring_start_day,
        scoring_deadline_day: def.scoring_deadline_day,
      });
    }
  }, [configs, reset]);

  const onSubmit = async (values: GoalCycleForm) => {
    await upsert.mutateAsync({
      cycle_month: "*",
      input_start_day: values.input_start_day,
      input_deadline_day: values.input_deadline_day,
      scoring_start_day: values.scoring_start_day,
      scoring_deadline_day: values.scoring_deadline_day,
    });
    reset(values);
  };

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  const inputStart = watch("input_start_day");
  const inputDeadline = watch("input_deadline_day");
  const scoringStart = watch("scoring_start_day");
  const scoringDeadline = watch("scoring_deadline_day");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5" />
          Goal Cycle Deadlines
        </CardTitle>
        <CardDescription>
          Configure when employees can submit their goal plans and actuals each month.
          These deadlines are enforced across all employees.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-4 p-4 rounded-lg border border-border bg-muted/20">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                📝 Goal Input Window
              </h4>
              <p className="text-xs text-muted-foreground">
                The date range each month when employees can create and submit their goal plans.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Opens on day</Label>
                  <Input type="number" min={1} max={28} {...register("input_start_day")} />
                  {errors.input_start_day && (
                    <p className="text-xs text-destructive">{errors.input_start_day.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Closes on day</Label>
                  <Input type="number" min={1} max={28} {...register("input_deadline_day")} />
                  {errors.input_deadline_day && (
                    <p className="text-xs text-destructive">{errors.input_deadline_day.message}</p>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Employees can submit goal plans between the <strong>{inputStart}th</strong> and <strong>{inputDeadline}th</strong> of each month.
              </p>
            </div>

            <div className="space-y-4 p-4 rounded-lg border border-border bg-muted/20">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                📊 Scoring / Actuals Window
              </h4>
              <p className="text-xs text-muted-foreground">
                The date range when employees submit their actuals for approved goals.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Opens on day</Label>
                  <Input type="number" min={1} max={31} {...register("scoring_start_day")} />
                  {errors.scoring_start_day && (
                    <p className="text-xs text-destructive">{errors.scoring_start_day.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Closes on day</Label>
                  <Input type="number" min={1} max={31} {...register("scoring_deadline_day")} />
                  {errors.scoring_deadline_day && (
                    <p className="text-xs text-destructive">{errors.scoring_deadline_day.message}</p>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Scoring window: <strong>{scoringStart}th</strong> to <strong>{scoringDeadline}th</strong> of each month.
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={isSubmitting || !isDirty || upsert.isPending}>
              {isSubmitting || upsert.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              Save Deadlines
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
