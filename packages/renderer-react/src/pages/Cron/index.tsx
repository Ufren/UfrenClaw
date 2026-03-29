/**
 * Cron Page
 * Manage scheduled tasks
 */
import { useEffect, useState, useCallback } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Plus,
  Clock,
  Play,
  Trash2,
  RefreshCw,
  X,
  Calendar,
  AlertCircle,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Loader2,
  Timer,
  History,
  Pause,
  List,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  WorkspacePage,
  WorkspacePanel,
  WorkspacePanelHeader,
} from "@/components/layout/WorkspacePage";
import { useCronStore } from "@/stores/cron";
import { useGatewayStore } from "@/stores/gateway";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { formatRelativeTime, cn } from "@/lib/utils";
import { toast } from "sonner";
import type { CronJob, CronJobCreateInput, ScheduleType } from "@/types/cron";
import { CHANNEL_ICONS, type ChannelType } from "@/types/channel";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  createStaggeredList,
  getFloatingAnimation,
  getFloatingTransition,
  getHoverLift,
  getTapScale,
  motionTransition,
  motionVariants,
} from "@/lib/motion";

// Common cron schedule presets
const schedulePresets: { key: string; value: string; type: ScheduleType }[] = [
  { key: "everyMinute", value: "* * * * *", type: "interval" },
  { key: "every5Min", value: "*/5 * * * *", type: "interval" },
  { key: "every15Min", value: "*/15 * * * *", type: "interval" },
  { key: "everyHour", value: "0 * * * *", type: "interval" },
  { key: "daily9am", value: "0 9 * * *", type: "daily" },
  { key: "daily6pm", value: "0 18 * * *", type: "daily" },
  { key: "weeklyMon", value: "0 9 * * 1", type: "weekly" },
  { key: "monthly1st", value: "0 9 1 * *", type: "monthly" },
];

// Parse cron schedule to human-readable format
// Handles both plain cron strings and Gateway CronSchedule objects:
//   { kind: "cron", expr: "...", tz?: "..." }
//   { kind: "every", everyMs: number }
//   { kind: "at", at: "..." }
function parseCronSchedule(schedule: unknown, t: TFunction<"cron">): string {
  // Handle Gateway CronSchedule object format
  if (schedule && typeof schedule === "object") {
    const s = schedule as {
      kind?: string;
      expr?: string;
      tz?: string;
      everyMs?: number;
      at?: string;
    };
    if (s.kind === "cron" && typeof s.expr === "string") {
      return parseCronExpr(s.expr, t);
    }
    if (s.kind === "every" && typeof s.everyMs === "number") {
      const ms = s.everyMs;
      if (ms < 60_000)
        return t("schedule.everySeconds", { count: Math.round(ms / 1000) });
      if (ms < 3_600_000)
        return t("schedule.everyMinutes", { count: Math.round(ms / 60_000) });
      if (ms < 86_400_000)
        return t("schedule.everyHours", { count: Math.round(ms / 3_600_000) });
      return t("schedule.everyDays", { count: Math.round(ms / 86_400_000) });
    }
    if (s.kind === "at" && typeof s.at === "string") {
      try {
        return t("schedule.onceAt", { time: new Date(s.at).toLocaleString() });
      } catch {
        return t("schedule.onceAt", { time: s.at });
      }
    }
    return String(schedule);
  }

  // Handle plain cron string
  if (typeof schedule === "string") {
    return parseCronExpr(schedule, t);
  }

  return String(schedule ?? t("schedule.unknown"));
}

// Parse a plain cron expression string to human-readable text
function parseCronExpr(cron: string, t: TFunction<"cron">): string {
  const preset = schedulePresets.find((p) => p.value === cron);
  if (preset) return t(`presets.${preset.key}` as const);

  const parts = cron.split(" ");
  if (parts.length !== 5) return cron;

  const [minute, hour, dayOfMonth, , dayOfWeek] = parts;

  if (minute === "*" && hour === "*") return t("presets.everyMinute");
  if (minute.startsWith("*/"))
    return t("schedule.everyMinutes", { count: Number(minute.slice(2)) });
  if (hour === "*" && minute === "0") return t("presets.everyHour");
  if (dayOfWeek !== "*" && dayOfMonth === "*") {
    return t("schedule.weeklyAt", {
      day: dayOfWeek,
      time: `${hour}:${minute.padStart(2, "0")}`,
    });
  }
  if (dayOfMonth !== "*") {
    return t("schedule.monthlyAtDay", {
      day: dayOfMonth,
      time: `${hour}:${minute.padStart(2, "0")}`,
    });
  }
  if (hour !== "*") {
    return t("schedule.dailyAt", {
      time: `${hour}:${minute.padStart(2, "0")}`,
    });
  }

  return cron;
}

function estimateNextRun(scheduleExpr: string): string | null {
  const now = new Date();
  const next = new Date(now.getTime());

  if (scheduleExpr === "* * * * *") {
    next.setSeconds(0, 0);
    next.setMinutes(next.getMinutes() + 1);
    return next.toLocaleString();
  }

  if (scheduleExpr === "*/5 * * * *") {
    const delta = 5 - (next.getMinutes() % 5 || 5);
    next.setSeconds(0, 0);
    next.setMinutes(next.getMinutes() + delta);
    return next.toLocaleString();
  }

  if (scheduleExpr === "*/15 * * * *") {
    const delta = 15 - (next.getMinutes() % 15 || 15);
    next.setSeconds(0, 0);
    next.setMinutes(next.getMinutes() + delta);
    return next.toLocaleString();
  }

  if (scheduleExpr === "0 * * * *") {
    next.setMinutes(0, 0, 0);
    next.setHours(next.getHours() + 1);
    return next.toLocaleString();
  }

  if (scheduleExpr === "0 9 * * *" || scheduleExpr === "0 18 * * *") {
    const targetHour = scheduleExpr === "0 9 * * *" ? 9 : 18;
    next.setSeconds(0, 0);
    next.setHours(targetHour, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next.toLocaleString();
  }

  if (scheduleExpr === "0 9 * * 1") {
    next.setSeconds(0, 0);
    next.setHours(9, 0, 0, 0);
    const day = next.getDay();
    const daysUntilMonday = day === 1 ? 7 : (8 - day) % 7;
    next.setDate(next.getDate() + daysUntilMonday);
    return next.toLocaleString();
  }

  if (scheduleExpr === "0 9 1 * *") {
    next.setSeconds(0, 0);
    next.setDate(1);
    next.setHours(9, 0, 0, 0);
    if (next <= now) next.setMonth(next.getMonth() + 1);
    return next.toLocaleString();
  }

  return null;
}

// Create/Edit Task Dialog
interface TaskDialogProps {
  job?: CronJob;
  onClose: () => void;
  onSave: (input: CronJobCreateInput) => Promise<void>;
}

function TaskDialog({ job, onClose, onSave }: TaskDialogProps) {
  const { t } = useTranslation("cron");
  const prefersReducedMotion = useReducedMotion() ?? false;
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState(job?.name || "");
  const [message, setMessage] = useState(job?.message || "");
  // Extract cron expression string from CronSchedule object or use as-is if string
  const initialSchedule = (() => {
    const s = job?.schedule;
    if (!s) return "0 9 * * *";
    if (typeof s === "string") return s;
    if (
      typeof s === "object" &&
      "expr" in s &&
      typeof (s as { expr: string }).expr === "string"
    ) {
      return (s as { expr: string }).expr;
    }
    return "0 9 * * *";
  })();
  const [schedule, setSchedule] = useState(initialSchedule);
  const [customSchedule, setCustomSchedule] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [enabled, setEnabled] = useState(job?.enabled ?? true);
  const schedulePreview = estimateNextRun(
    useCustom ? customSchedule : schedule,
  );

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error(t("toast.nameRequired"));
      return;
    }
    if (!message.trim()) {
      toast.error(t("toast.messageRequired"));
      return;
    }

    const finalSchedule = useCustom ? customSchedule : schedule;
    if (!finalSchedule.trim()) {
      toast.error(t("toast.scheduleRequired"));
      return;
    }

    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        message: message.trim(),
        schedule: finalSchedule,
        enabled,
      });
      onClose();
      toast.success(job ? t("toast.updated") : t("toast.created"));
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      initial="hidden"
      animate="show"
      exit="exit"
      variants={motionVariants.overlay}
    >
      <motion.div
        initial="hidden"
        animate="show"
        exit="exit"
        variants={motionVariants.softScale}
        transition={motionTransition.modal}
      >
        <Card
          className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-border/70 bg-card/95 shadow-2xl backdrop-blur-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <CardHeader className="flex flex-row items-start justify-between pb-2 shrink-0">
            <div>
              <CardTitle className="text-2xl font-serif font-normal">
                {job ? t("dialog.editTitle") : t("dialog.createTitle")}
              </CardTitle>
              <CardDescription className="text-[15px] mt-1 text-foreground/70">
                {t("dialog.description")}
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="rounded-full h-8 w-8 -mr-2 -mt-2 text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
            >
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-6 pt-4 overflow-y-auto flex-1 p-6">
            {/* Name */}
            <div className="space-y-2.5">
              <Label
                htmlFor="name"
                className="text-[14px] text-foreground/80 font-bold"
              >
                {t("dialog.taskName")}
              </Label>
              <Input
                id="name"
                placeholder={t("dialog.taskNamePlaceholder")}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-[44px] rounded-xl font-mono text-[13px] bg-black/5 dark:bg-muted border-black/10 dark:border-white/10 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:border-primary shadow-sm transition-all text-foreground placeholder:text-foreground/40"
              />
            </div>

            {/* Message */}
            <div className="space-y-2.5">
              <Label
                htmlFor="message"
                className="text-[14px] text-foreground/80 font-bold"
              >
                {t("dialog.message")}
              </Label>
              <Textarea
                id="message"
                placeholder={t("dialog.messagePlaceholder")}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                className="rounded-xl font-mono text-[13px] bg-black/5 dark:bg-muted border-black/10 dark:border-white/10 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:border-primary shadow-sm transition-all text-foreground placeholder:text-foreground/40 resize-none"
              />
            </div>

            {/* Schedule */}
            <div className="space-y-2.5">
              <Label className="text-[14px] text-foreground/80 font-bold">
                {t("dialog.schedule")}
              </Label>
              {!useCustom ? (
                <div className="grid grid-cols-2 gap-2">
                  {schedulePresets.map((preset) => (
                    <motion.div
                      key={preset.value}
                      whileHover={getHoverLift(prefersReducedMotion, {
                        y: -2,
                        scale: 1.01,
                      })}
                      whileTap={getTapScale(prefersReducedMotion)}
                      transition={motionTransition.gentle}
                    >
                      <Button
                        type="button"
                        variant={
                          schedule === preset.value ? "default" : "outline"
                        }
                        size="sm"
                        onClick={() => setSchedule(preset.value)}
                        className={cn(
                          "justify-start h-10 rounded-xl font-medium text-[13px] transition-all",
                          schedule === preset.value
                            ? "bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm border-transparent"
                            : "bg-black/5 dark:bg-white/5 border-transparent hover:bg-black/10 dark:hover:bg-white/10 text-foreground/80 hover:text-foreground",
                        )}
                      >
                        <Timer className="h-4 w-4 mr-2 opacity-70" />
                        {t(`presets.${preset.key}` as const)}
                      </Button>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <Input
                  placeholder={t("dialog.cronPlaceholder")}
                  value={customSchedule}
                  onChange={(e) => setCustomSchedule(e.target.value)}
                  className="h-[44px] rounded-xl font-mono text-[13px] bg-black/5 dark:bg-muted border-black/10 dark:border-white/10 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:border-primary shadow-sm transition-all text-foreground placeholder:text-foreground/40"
                />
              )}
              <div className="flex items-center justify-between mt-2">
                <p className="text-[12px] text-muted-foreground/80 font-medium">
                  {schedulePreview
                    ? `${t("card.next")}: ${schedulePreview}`
                    : t("dialog.cronPlaceholder")}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setUseCustom(!useCustom)}
                  className="text-[12px] h-7 px-2 text-foreground/60 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 rounded-lg"
                >
                  {useCustom
                    ? t("dialog.usePresets")
                    : t("dialog.useCustomCron")}
                </Button>
              </div>
            </div>

            {/* Enabled */}
            <div className="flex items-center justify-between bg-black/5 dark:bg-muted p-4 rounded-2xl shadow-sm border border-black/5 dark:border-white/5">
              <div>
                <Label className="text-[14px] text-foreground/80 font-bold">
                  {t("dialog.enableImmediately")}
                </Label>
                <p className="text-[13px] text-muted-foreground mt-0.5">
                  {t("dialog.enableImmediatelyDesc")}
                </p>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4">
              <motion.div whileTap={getTapScale(prefersReducedMotion)}>
                <Button
                  variant="outline"
                  onClick={onClose}
                  className="rounded-full px-6 h-[42px] text-[13px] font-semibold border-black/20 dark:border-white/20 bg-transparent hover:bg-black/5 dark:hover:bg-white/5 text-foreground/80 hover:text-foreground shadow-sm"
                >
                  {t("common:actions.cancel", "Cancel")}
                </Button>
              </motion.div>
              <motion.div whileTap={getTapScale(prefersReducedMotion)}>
                <Button
                  onClick={handleSubmit}
                  disabled={saving}
                  className="rounded-full px-6 h-[42px] text-[13px] font-semibold shadow-sm border border-transparent transition-all"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {t("common:status.saving", "Saving...")}
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      {job ? t("dialog.saveChanges") : t("dialog.createTitle")}
                    </>
                  )}
                </Button>
              </motion.div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}

// Job Card Component
interface CronJobCardProps {
  job: CronJob;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  onTrigger: () => Promise<void>;
}

function CronJobCard({
  job,
  onToggle,
  onEdit,
  onDelete,
  onTrigger,
}: CronJobCardProps) {
  const { t } = useTranslation("cron");
  const prefersReducedMotion = useReducedMotion() ?? false;
  const [triggering, setTriggering] = useState(false);

  const handleTrigger = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setTriggering(true);
    try {
      await onTrigger();
      toast.success(t("toast.triggered"));
    } catch (error) {
      console.error("Failed to trigger cron job:", error);
      toast.error(
        t("toast.failedTrigger", {
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setTriggering(false);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete();
  };

  return (
    <motion.div
      whileHover={getHoverLift(prefersReducedMotion, { y: -3, scale: 1.008 })}
      whileTap={getTapScale(prefersReducedMotion, 0.995)}
      transition={motionTransition.gentle}
      className="group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-[26px] border border-border/70 bg-background/60 p-5 shadow-sm transition-colors hover:bg-background/80"
      onClick={onEdit}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-4">
          <motion.div
            className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full border border-border/70 bg-background/75 text-foreground shadow-sm transition-transform group-hover:scale-105"
            animate={
              job.enabled ? getFloatingAnimation(prefersReducedMotion, 2) : {}
            }
            transition={
              job.enabled
                ? getFloatingTransition(prefersReducedMotion, 2.2, 3.8)
                : undefined
            }
          >
            <Clock
              className={cn(
                "h-5 w-5",
                job.enabled ? "text-foreground" : "text-muted-foreground",
              )}
            />
          </motion.div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-[16px] font-semibold text-foreground truncate">
                {job.name}
              </h3>
              <div
                className={cn(
                  "w-2 h-2 rounded-full shrink-0",
                  job.enabled ? "bg-green-500" : "bg-muted-foreground",
                )}
                title={job.enabled ? t("stats.active") : t("stats.paused")}
              />
            </div>
            <p className="text-[13px] text-muted-foreground flex items-center gap-1.5">
              <Timer className="h-3.5 w-3.5" />
              {parseCronSchedule(job.schedule, t)}
            </p>
          </div>
        </div>

        <div
          className="flex items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <Switch checked={job.enabled} onCheckedChange={onToggle} />
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-end mt-2 pl-[62px]">
        <div className="flex items-start gap-2 mb-3">
          <MessageSquare className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
          <p className="text-[13.5px] text-muted-foreground line-clamp-2 leading-[1.5]">
            {job.message}
          </p>
        </div>

        {/* Metadata */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-muted-foreground/80 font-medium mb-3">
          {job.target && (
            <span className="flex items-center gap-1.5">
              {CHANNEL_ICONS[job.target.channelType as ChannelType]}
              {job.target.channelName}
            </span>
          )}

          {job.lastRun && (
            <span className="flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" />
              {t("card.last")}: {formatRelativeTime(job.lastRun.time)}
              {job.lastRun.success ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <XCircle className="h-3.5 w-3.5 text-red-500" />
              )}
            </span>
          )}

          {job.nextRun && job.enabled && (
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              {t("card.next")}: {new Date(job.nextRun).toLocaleString()}
            </span>
          )}
        </div>

        {/* Last Run Error */}
        {job.lastRun && !job.lastRun.success && job.lastRun.error && (
          <div className="flex items-start gap-2 p-2.5 mb-3 rounded-xl bg-destructive/10 border border-destructive/20 text-[13px] text-destructive">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span className="line-clamp-2">{job.lastRun.error}</span>
          </div>
        )}

        {/* Actions */}
        <div className="mt-auto flex flex-wrap justify-end gap-2 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleTrigger}
            disabled={triggering}
            className="h-8 px-3 text-foreground/70 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5 rounded-lg text-[13px] font-medium transition-colors"
          >
            {triggering ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : (
              <Play className="h-3.5 w-3.5 mr-1.5" />
            )}
            {t("card.runNow")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            className="h-8 px-3 text-destructive/70 hover:text-destructive hover:bg-destructive/10 rounded-lg text-[13px] font-medium transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            {t("common:actions.delete", "Delete")}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

function CronOverviewCard({
  label,
  value,
  icon: Icon,
  iconClassName,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  iconClassName: string;
}) {
  const prefersReducedMotion = useReducedMotion() ?? false;
  return (
    <motion.div
      className="rounded-[22px] border border-border/70 bg-background/60 px-5 py-4"
      variants={motionVariants.softScale}
      whileHover={getHoverLift(prefersReducedMotion, { y: -3, scale: 1.01 })}
      transition={motionTransition.gentle}
    >
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
          {label}
        </div>
        <div
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-full",
            iconClassName,
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="pt-3 text-2xl font-semibold text-foreground">{value}</div>
    </motion.div>
  );
}

export function Cron() {
  const { t } = useTranslation("cron");
  const prefersReducedMotion = useReducedMotion() ?? false;
  const {
    jobs,
    loading,
    error,
    fetchJobs,
    createJob,
    updateJob,
    toggleJob,
    deleteJob,
    triggerJob,
  } = useCronStore();
  const gatewayStatus = useGatewayStore((state) => state.status);
  const [showDialog, setShowDialog] = useState(false);
  const [editingJob, setEditingJob] = useState<CronJob | undefined>();
  const [jobToDelete, setJobToDelete] = useState<{ id: string } | null>(null);

  const isGatewayRunning = gatewayStatus.state === "running";

  // Fetch jobs on mount
  useEffect(() => {
    if (isGatewayRunning) {
      fetchJobs();
    }
  }, [fetchJobs, isGatewayRunning]);

  // Statistics
  const safeJobs = Array.isArray(jobs) ? jobs : [];
  const activeJobs = safeJobs.filter((j) => j.enabled);
  const pausedJobs = safeJobs.filter((j) => !j.enabled);
  const failedJobs = safeJobs.filter((j) => j.lastRun && !j.lastRun.success);

  const handleSave = useCallback(
    async (input: CronJobCreateInput) => {
      if (editingJob) {
        await updateJob(editingJob.id, input);
      } else {
        await createJob(input);
      }
    },
    [editingJob, createJob, updateJob],
  );

  const handleToggle = useCallback(
    async (id: string, enabled: boolean) => {
      try {
        await toggleJob(id, enabled);
        toast.success(enabled ? t("toast.enabled") : t("toast.paused"));
      } catch {
        toast.error(t("toast.failedUpdate"));
      }
    },
    [toggleJob, t],
  );

  if (loading) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <>
      <WorkspacePage
        eyebrow={t("common:sidebar.cronTasks")}
        title={t("title")}
        description={t("subtitle")}
        actions={
          <>
            <Button
              variant="outline"
              onClick={fetchJobs}
              disabled={!isGatewayRunning}
              className="h-9 rounded-full border-border/70 bg-background/70 px-4 text-[13px] font-medium text-foreground/80 shadow-none hover:bg-accent/80 hover:text-foreground"
            >
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              {t("refresh")}
            </Button>
            <Button
              onClick={() => {
                setEditingJob(undefined);
                setShowDialog(true);
              }}
              disabled={!isGatewayRunning}
              className="h-9 rounded-full px-4 text-[13px] font-medium shadow-none"
            >
              <Plus className="mr-2 h-3.5 w-3.5" />
              {t("newTask")}
            </Button>
          </>
        }
        aside={
          <div className="space-y-4">
            <WorkspacePanel className="space-y-4">
              <WorkspacePanelHeader
                title={t("stats.total")}
                description={
                  isGatewayRunning ? t("subtitle") : t("gatewayWarning")
                }
              />
              <motion.div
                className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1"
                variants={createStaggeredList(prefersReducedMotion ? 0 : 0.05)}
                initial="hidden"
                animate="show"
              >
                <CronOverviewCard
                  label={t("stats.total")}
                  value={safeJobs.length}
                  icon={List}
                  iconClassName="bg-primary/10 text-primary"
                />
                <CronOverviewCard
                  label={t("stats.active")}
                  value={activeJobs.length}
                  icon={Play}
                  iconClassName="bg-green-500/10 text-green-600 dark:text-green-400"
                />
                <CronOverviewCard
                  label={t("stats.paused")}
                  value={pausedJobs.length}
                  icon={Pause}
                  iconClassName="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"
                />
                <CronOverviewCard
                  label={t("stats.failed")}
                  value={failedJobs.length}
                  icon={XCircle}
                  iconClassName="bg-destructive/10 text-destructive"
                />
              </motion.div>
              <div className="rounded-[22px] border border-border/70 bg-background/60 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
                  {t("dialog.schedule")}
                </div>
                <div className="pt-3 flex flex-wrap gap-2">
                  {schedulePresets.slice(0, 6).map((preset) => (
                    <span
                      key={preset.key}
                      className="rounded-full border border-border/70 bg-background/75 px-3 py-1.5 text-[12px] font-medium text-foreground/75"
                    >
                      {t(`presets.${preset.key}` as const)}
                    </span>
                  ))}
                </div>
              </div>
            </WorkspacePanel>
          </div>
        }
      >
        <div className="flex h-full min-h-0 flex-col gap-4">
          {!isGatewayRunning && (
            <div className="flex items-center gap-3 rounded-[22px] border border-yellow-500/40 bg-yellow-500/10 px-4 py-3">
              <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
              <span className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
                {t("gatewayWarning")}
              </span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-3 rounded-[22px] border border-destructive/50 bg-destructive/10 px-4 py-3">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <span className="text-sm font-medium text-destructive">
                {error}
              </span>
            </div>
          )}

          <WorkspacePanel className="flex min-h-0 flex-1 flex-col gap-4">
            <WorkspacePanelHeader
              title={safeJobs.length === 0 ? t("empty.title") : t("title")}
              description={
                safeJobs.length === 0 ? t("empty.description") : t("subtitle")
              }
            />
            {safeJobs.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center rounded-[28px] border border-dashed border-border/70 bg-background/45 px-6 py-20 text-center text-muted-foreground">
                <Clock className="mb-4 h-10 w-10 opacity-50" />
                <h3 className="mb-2 text-lg font-medium text-foreground">
                  {t("empty.title")}
                </h3>
                <p className="mb-6 max-w-md text-[14px]">
                  {t("empty.description")}
                </p>
                <Button
                  onClick={() => {
                    setEditingJob(undefined);
                    setShowDialog(true);
                  }}
                  disabled={!isGatewayRunning}
                  className="h-10 rounded-full px-6"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {t("empty.create")}
                </Button>
              </div>
            ) : (
              <motion.div
                className="grid grid-cols-1 gap-4 md:grid-cols-2"
                variants={createStaggeredList(prefersReducedMotion ? 0 : 0.06)}
                initial="hidden"
                animate="show"
              >
                {safeJobs.map((job) => (
                  <motion.div key={job.id} variants={motionVariants.fadeUp}>
                    <CronJobCard
                      job={job}
                      onToggle={(enabled) => handleToggle(job.id, enabled)}
                      onEdit={() => {
                        setEditingJob(job);
                        setShowDialog(true);
                      }}
                      onDelete={() => setJobToDelete({ id: job.id })}
                      onTrigger={() => triggerJob(job.id)}
                    />
                  </motion.div>
                ))}
              </motion.div>
            )}
          </WorkspacePanel>
        </div>
      </WorkspacePage>

      <AnimatePresence>
        {showDialog && (
          <TaskDialog
            job={editingJob}
            onClose={() => {
              setShowDialog(false);
              setEditingJob(undefined);
            }}
            onSave={handleSave}
          />
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={!!jobToDelete}
        title={t("common:actions.confirm", "Confirm")}
        message={t("card.deleteConfirm")}
        confirmLabel={t("common:actions.delete", "Delete")}
        cancelLabel={t("common:actions.cancel", "Cancel")}
        variant="destructive"
        onConfirm={async () => {
          if (jobToDelete) {
            await deleteJob(jobToDelete.id);
            setJobToDelete(null);
            toast.success(t("toast.deleted"));
          }
        }}
        onCancel={() => setJobToDelete(null)}
      />
    </>
  );
}

export default Cron;
