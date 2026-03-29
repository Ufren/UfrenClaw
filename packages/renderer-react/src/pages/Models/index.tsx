import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Layers3,
  Sparkles,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useGatewayStore } from "@/stores/gateway";
import { useSettingsStore } from "@/stores/settings";
import { useProviderStore } from "@/stores/providers";
import { hostApiFetch } from "@/lib/host-api";
import { trackUiEvent } from "@/lib/telemetry";
import {
  buildProviderListItems,
  hasConfiguredCredentials,
} from "@/lib/provider-accounts";
import { ProvidersSettings } from "@/components/settings/ProvidersSettings";
import { FeedbackState } from "@/components/common/FeedbackState";
import {
  WorkspacePage,
  WorkspacePanel,
  WorkspacePanelHeader,
} from "@/components/layout/WorkspacePage";
import { cn } from "@/lib/utils";
import {
  createStaggeredList,
  getHoverLift,
  getTapScale,
  motionTransition,
  motionVariants,
} from "@/lib/motion";

type UsageHistoryEntry = {
  timestamp: string;
  sessionId: string;
  agentId: string;
  model?: string;
  provider?: string;
  content?: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  costUsd?: number;
};

type UsageWindow = "7d" | "30d" | "all";
type UsageGroupBy = "model" | "day";
const USAGE_FETCH_MAX_ATTEMPTS = 6;
const USAGE_FETCH_RETRY_DELAY_MS = 1500;

export function Models() {
  const { t } = useTranslation(["dashboard", "settings", "common"]);
  const prefersReducedMotion = useReducedMotion() ?? false;
  const gatewayStatus = useGatewayStore((state) => state.status);
  const devModeUnlocked = useSettingsStore((state) => state.devModeUnlocked);
  const { accounts, statuses, vendors, defaultAccountId } = useProviderStore();
  const isGatewayRunning = gatewayStatus.state === "running";

  const [usageHistory, setUsageHistory] = useState<UsageHistoryEntry[]>([]);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageGroupBy, setUsageGroupBy] = useState<UsageGroupBy>("model");
  const [usageWindow, setUsageWindow] = useState<UsageWindow>("7d");
  const [usagePage, setUsagePage] = useState(1);
  const [usageRefreshKey, setUsageRefreshKey] = useState(0);
  const [selectedUsageEntry, setSelectedUsageEntry] =
    useState<UsageHistoryEntry | null>(null);
  const usageFetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const usageFetchGenerationRef = useRef(0);
  const providerItems = useMemo(
    () => buildProviderListItems(accounts, statuses, vendors, defaultAccountId),
    [accounts, defaultAccountId, statuses, vendors],
  );
  const configuredProviders = providerItems.length;
  const readyProviders = providerItems.filter((item) =>
    hasConfiguredCredentials(item.account, item.status),
  ).length;
  const defaultProvider =
    providerItems.find((item) => item.account.id === defaultAccountId) ??
    providerItems[0] ??
    null;

  useEffect(() => {
    trackUiEvent("models.page_viewed");
  }, []);

  const refreshUsageHistory = useCallback(() => {
    if (!isGatewayRunning) return;
    if (usageFetchTimerRef.current) {
      clearTimeout(usageFetchTimerRef.current);
      usageFetchTimerRef.current = null;
    }
    setUsageLoading(true);
    setUsageHistory([]);
    setUsagePage(1);
    setUsageRefreshKey((current) => current + 1);
  }, [isGatewayRunning]);

  useEffect(() => {
    if (usageFetchTimerRef.current) {
      clearTimeout(usageFetchTimerRef.current);
      usageFetchTimerRef.current = null;
    }

    if (!isGatewayRunning) {
      setUsageLoading(false);
      return;
    }

    const generation = usageFetchGenerationRef.current + 1;
    usageFetchGenerationRef.current = generation;
    setUsageLoading(true);
    const restartMarker = `${gatewayStatus.pid ?? "na"}:${gatewayStatus.connectedAt ?? "na"}`;
    trackUiEvent("models.token_usage_fetch_started", {
      generation,
      restartMarker,
    });

    const fetchUsageHistoryWithRetry = async (attempt: number) => {
      trackUiEvent("models.token_usage_fetch_attempt", {
        generation,
        attempt,
        restartMarker,
      });
      try {
        const entries = await hostApiFetch<UsageHistoryEntry[]>(
          "/api/usage/recent-token-history",
        );
        if (usageFetchGenerationRef.current !== generation) return;

        const normalized = Array.isArray(entries) ? entries : [];
        setUsageHistory(normalized);
        setUsagePage(1);
        trackUiEvent("models.token_usage_fetch_succeeded", {
          generation,
          attempt,
          records: normalized.length,
          restartMarker,
        });

        if (normalized.length === 0 && attempt < USAGE_FETCH_MAX_ATTEMPTS) {
          trackUiEvent("models.token_usage_fetch_retry_scheduled", {
            generation,
            attempt,
            reason: "empty",
            restartMarker,
          });
          usageFetchTimerRef.current = setTimeout(() => {
            void fetchUsageHistoryWithRetry(attempt + 1);
          }, USAGE_FETCH_RETRY_DELAY_MS);
        } else if (normalized.length === 0) {
          setUsageLoading(false);
          trackUiEvent("models.token_usage_fetch_exhausted", {
            generation,
            attempt,
            reason: "empty",
            restartMarker,
          });
        } else {
          setUsageLoading(false);
        }
      } catch (error) {
        if (usageFetchGenerationRef.current !== generation) return;
        trackUiEvent("models.token_usage_fetch_failed_attempt", {
          generation,
          attempt,
          restartMarker,
          message: error instanceof Error ? error.message : String(error),
        });
        if (attempt < USAGE_FETCH_MAX_ATTEMPTS) {
          trackUiEvent("models.token_usage_fetch_retry_scheduled", {
            generation,
            attempt,
            reason: "error",
            restartMarker,
          });
          usageFetchTimerRef.current = setTimeout(() => {
            void fetchUsageHistoryWithRetry(attempt + 1);
          }, USAGE_FETCH_RETRY_DELAY_MS);
          return;
        }
        setUsageHistory([]);
        setUsageLoading(false);
        trackUiEvent("models.token_usage_fetch_exhausted", {
          generation,
          attempt,
          reason: "error",
          restartMarker,
        });
      }
    };

    void fetchUsageHistoryWithRetry(1);

    return () => {
      if (usageFetchTimerRef.current) {
        clearTimeout(usageFetchTimerRef.current);
        usageFetchTimerRef.current = null;
      }
    };
  }, [
    gatewayStatus.connectedAt,
    gatewayStatus.pid,
    isGatewayRunning,
    usageRefreshKey,
  ]);

  const visibleUsageHistory = isGatewayRunning ? usageHistory : [];
  const filteredUsageHistory = filterUsageHistoryByWindow(
    visibleUsageHistory,
    usageWindow,
  );
  const usageGroups = groupUsageHistory(filteredUsageHistory, usageGroupBy);
  const usagePageSize = 5;
  const usageTotalPages = Math.max(
    1,
    Math.ceil(filteredUsageHistory.length / usagePageSize),
  );
  const safeUsagePage = Math.min(usagePage, usageTotalPages);
  const pagedUsageHistory = filteredUsageHistory.slice(
    (safeUsagePage - 1) * usagePageSize,
    safeUsagePage * usagePageSize,
  );
  const usageTotalTokens = filteredUsageHistory.reduce(
    (sum, entry) => sum + entry.totalTokens,
    0,
  );
  const averageUsageTokens =
    filteredUsageHistory.length > 0
      ? Math.round(usageTotalTokens / filteredUsageHistory.length)
      : 0;
  const latestUsageEntry =
    filteredUsageHistory.reduce<UsageHistoryEntry | null>((latest, entry) => {
      if (!latest) return entry;
      return Date.parse(entry.timestamp) > Date.parse(latest.timestamp)
        ? entry
        : latest;
    }, null);
  const leadingUsageGroup = usageGroups[0] ?? null;
  const overviewCards = [
    {
      icon: Layers3,
      label: t("dashboard:models.configuredAccounts"),
      value: formatTokenCount(configuredProviders),
      hint: `${formatTokenCount(readyProviders)} ${t("dashboard:models.readyAccounts")}`,
    },
    {
      icon: Sparkles,
      label: t("dashboard:models.defaultAccount"),
      value:
        defaultProvider?.account.label ||
        t("dashboard:models.noDefaultAccount"),
      hint: defaultProvider?.vendor?.name || t("dashboard:models.emptyHint"),
    },
    {
      icon: Activity,
      label: t("dashboard:models.recentRecords"),
      value: formatTokenCount(filteredUsageHistory.length),
      hint: `${t("dashboard:recentTokenHistory.totalTokens")} ${formatTokenCount(usageTotalTokens)}`,
    },
    {
      icon: Clock3,
      label: t("dashboard:models.usageFocus"),
      value: leadingUsageGroup?.label || t("dashboard:models.emptyHint"),
      hint: latestUsageEntry
        ? `${t("dashboard:models.latestActivity")} ${formatUsageTimestamp(latestUsageEntry.timestamp)}`
        : t("dashboard:models.emptyHint"),
    },
  ] satisfies Array<{
    icon: LucideIcon;
    label: string;
    value: string;
    hint: string;
  }>;

  const aside = (
    <div className="space-y-4">
      <WorkspacePanel className="space-y-4">
        <WorkspacePanelHeader
          title={t("dashboard:models.overviewTitle")}
          description={t("dashboard:models.overviewDescription")}
        />
        <div className="grid gap-3">
          <InsightRow
            label={t("dashboard:gateway")}
            value={
              isGatewayRunning
                ? t("common:status.running")
                : t("common:status.stopped")
            }
            tone={isGatewayRunning ? "positive" : "muted"}
          />
          <InsightRow
            label={t("dashboard:models.configuredAccounts")}
            value={formatTokenCount(configuredProviders)}
          />
          <InsightRow
            label={t("dashboard:recentTokenHistory.totalTokens")}
            value={formatTokenCount(usageTotalTokens)}
          />
          <InsightRow
            label={t("dashboard:models.latestActivity")}
            value={
              latestUsageEntry
                ? formatUsageTimestamp(latestUsageEntry.timestamp)
                : t("dashboard:models.emptyHint")
            }
          />
        </div>
      </WorkspacePanel>
      <WorkspacePanel className="space-y-4">
        <WorkspacePanelHeader
          title={t("dashboard:models.usageHealthTitle")}
          description={t("dashboard:models.usageHealthDescription")}
        />
        <div className="flex flex-wrap gap-2">
          <Badge
            variant="secondary"
            className="rounded-full border-0 bg-primary/10 px-3 py-1 text-[11px] text-primary"
          >
            {usageWindow === "7d"
              ? t("dashboard:recentTokenHistory.last7Days")
              : usageWindow === "30d"
                ? t("dashboard:recentTokenHistory.last30Days")
                : t("dashboard:recentTokenHistory.allTime")}
          </Badge>
          <Badge
            variant="secondary"
            className="rounded-full border-0 bg-background/70 px-3 py-1 text-[11px] text-muted-foreground"
          >
            {usageGroupBy === "model"
              ? t("dashboard:recentTokenHistory.groupByModel")
              : t("dashboard:recentTokenHistory.groupByTime")}
          </Badge>
        </div>
        <div className="rounded-2xl border border-border/70 bg-background/55 p-4">
          <div className="text-[12px] font-medium text-muted-foreground">
            {t("dashboard:models.usageFocus")}
          </div>
          <div className="mt-2 text-[17px] font-semibold text-foreground">
            {leadingUsageGroup?.label || t("dashboard:models.emptyHint")}
          </div>
          <div className="mt-2 text-[13px] leading-6 text-muted-foreground">
            {filteredUsageHistory.length > 0
              ? `${t("dashboard:recentTokenHistory.showingLast", {
                  count: filteredUsageHistory.length,
                })} · ${t("dashboard:models.averageTokens")} ${formatTokenCount(averageUsageTokens)}`
              : t("dashboard:models.usageHealthDescription")}
          </div>
        </div>
        <motion.div whileTap={getTapScale(prefersReducedMotion)}>
          <Button
            variant="outline"
            onClick={refreshUsageHistory}
            disabled={!isGatewayRunning}
            className="h-10 w-full rounded-full border-border/70 bg-background/70 px-4 shadow-none hover:bg-accent/80"
          >
            <Activity className="mr-2 h-4 w-4" />
            {t("common:actions.refresh")}
          </Button>
        </motion.div>
      </WorkspacePanel>
    </div>
  );

  return (
    <>
      <WorkspacePage
        eyebrow={t("common:sidebar.models")}
        title={t("dashboard:models.title")}
        description={t("dashboard:models.subtitle")}
        actions={
          <motion.div whileTap={getTapScale(prefersReducedMotion)}>
            <Button
              variant="outline"
              onClick={refreshUsageHistory}
              disabled={!isGatewayRunning}
              className="h-10 rounded-full border-border/70 bg-background/70 px-4 text-[13px] shadow-none hover:bg-accent/80"
            >
              <Activity className="mr-2 h-4 w-4" />
              {t("common:actions.refresh")}
            </Button>
          </motion.div>
        }
        aside={aside}
        className="-m-6 h-[calc(100vh-2.5rem)]"
        contentClassName="space-y-6"
      >
        <motion.div
          initial="hidden"
          animate="show"
          variants={createStaggeredList(prefersReducedMotion ? 0 : 0.05)}
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
        >
          {overviewCards.map((card) => (
            <motion.div key={card.label} variants={motionVariants.softScale}>
              <OverviewCard
                {...card}
                prefersReducedMotion={prefersReducedMotion}
              />
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={motionTransition.gentle}
        >
          <ProvidersSettings />
        </motion.div>

        <WorkspacePanel className="space-y-5">
          <WorkspacePanelHeader
            title={t(
              "dashboard:recentTokenHistory.title",
              "Token Usage History",
            )}
            description={t("dashboard:recentTokenHistory.description")}
            action={
              <div className="flex flex-wrap items-center gap-2">
                <UsageToggle
                  active={usageGroupBy === "model"}
                  onClick={() => {
                    setUsageGroupBy("model");
                    setUsagePage(1);
                  }}
                >
                  {t("dashboard:recentTokenHistory.groupByModel")}
                </UsageToggle>
                <UsageToggle
                  active={usageGroupBy === "day"}
                  onClick={() => {
                    setUsageGroupBy("day");
                    setUsagePage(1);
                  }}
                >
                  {t("dashboard:recentTokenHistory.groupByTime")}
                </UsageToggle>
              </div>
            }
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <UsageToggle
                active={usageWindow === "7d"}
                onClick={() => {
                  setUsageWindow("7d");
                  setUsagePage(1);
                }}
              >
                {t("dashboard:recentTokenHistory.last7Days")}
              </UsageToggle>
              <UsageToggle
                active={usageWindow === "30d"}
                onClick={() => {
                  setUsageWindow("30d");
                  setUsagePage(1);
                }}
              >
                {t("dashboard:recentTokenHistory.last30Days")}
              </UsageToggle>
              <UsageToggle
                active={usageWindow === "all"}
                onClick={() => {
                  setUsageWindow("all");
                  setUsagePage(1);
                }}
              >
                {t("dashboard:recentTokenHistory.allTime")}
              </UsageToggle>
            </div>
            <p className="text-[13px] font-medium text-muted-foreground">
              {t("dashboard:recentTokenHistory.showingLast", {
                count: filteredUsageHistory.length,
              })}
            </p>
          </div>

          {usageLoading ? (
            <div className="flex items-center justify-center rounded-[28px] border border-dashed border-border/70 bg-background/45 py-12 text-muted-foreground">
              <FeedbackState
                state="loading"
                title={t("dashboard:recentTokenHistory.loading")}
              />
            </div>
          ) : visibleUsageHistory.length === 0 ? (
            <div className="flex items-center justify-center rounded-[28px] border border-dashed border-border/70 bg-background/45 py-12 text-muted-foreground">
              <FeedbackState
                state="empty"
                title={t("dashboard:recentTokenHistory.empty")}
              />
            </div>
          ) : filteredUsageHistory.length === 0 ? (
            <div className="flex items-center justify-center rounded-[28px] border border-dashed border-border/70 bg-background/45 py-12 text-muted-foreground">
              <FeedbackState
                state="empty"
                title={t("dashboard:recentTokenHistory.emptyForWindow")}
              />
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-3">
                <MiniStatCard
                  label={t("dashboard:recentTokenHistory.totalTokens")}
                  value={formatTokenCount(usageTotalTokens)}
                />
                <MiniStatCard
                  label={t("dashboard:models.averageTokens")}
                  value={formatTokenCount(averageUsageTokens)}
                />
                <MiniStatCard
                  label={t("dashboard:models.latestActivity")}
                  value={
                    latestUsageEntry
                      ? formatUsageTimestamp(latestUsageEntry.timestamp)
                      : t("dashboard:models.emptyHint")
                  }
                />
              </div>

              <UsageBarChart
                groups={usageGroups}
                emptyLabel={t("dashboard:recentTokenHistory.empty")}
                totalLabel={t("dashboard:recentTokenHistory.totalTokens")}
                inputLabel={t("dashboard:recentTokenHistory.inputShort")}
                outputLabel={t("dashboard:recentTokenHistory.outputShort")}
                cacheLabel={t("dashboard:recentTokenHistory.cacheShort")}
              />

              <motion.div
                initial="hidden"
                animate="show"
                variants={createStaggeredList(prefersReducedMotion ? 0 : 0.04)}
                className="space-y-3"
              >
                {pagedUsageHistory.map((entry) => (
                  <motion.div
                    key={`${entry.sessionId}-${entry.timestamp}`}
                    variants={motionVariants.fadeUp}
                  >
                    <UsageRecordCard
                      entry={entry}
                      devModeUnlocked={devModeUnlocked}
                      onOpen={() => setSelectedUsageEntry(entry)}
                      unknownModelLabel={t(
                        "dashboard:recentTokenHistory.unknownModel",
                      )}
                      inputLabel={t("dashboard:recentTokenHistory.input")}
                      outputLabel={t("dashboard:recentTokenHistory.output")}
                      cacheReadLabel={t(
                        "dashboard:recentTokenHistory.cacheRead",
                      )}
                      cacheWriteLabel={t(
                        "dashboard:recentTokenHistory.cacheWrite",
                      )}
                      costLabel={t("dashboard:recentTokenHistory.cost")}
                      viewContentLabel={t(
                        "dashboard:recentTokenHistory.viewContent",
                      )}
                      prefersReducedMotion={prefersReducedMotion}
                    />
                  </motion.div>
                ))}
              </motion.div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <p className="text-[13px] font-medium text-muted-foreground">
                  {t("dashboard:recentTokenHistory.page", {
                    current: safeUsagePage,
                    total: usageTotalPages,
                  })}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setUsagePage((page) => Math.max(1, page - 1))
                    }
                    disabled={safeUsagePage <= 1}
                    className="h-9 rounded-full border-border/70 bg-background/70 px-4 shadow-none hover:bg-accent/80"
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    {t("dashboard:recentTokenHistory.prev")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setUsagePage((page) =>
                        Math.min(usageTotalPages, page + 1),
                      )
                    }
                    disabled={safeUsagePage >= usageTotalPages}
                    className="h-9 rounded-full border-border/70 bg-background/70 px-4 shadow-none hover:bg-accent/80"
                  >
                    {t("dashboard:recentTokenHistory.next")}
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </WorkspacePanel>
      </WorkspacePage>

      <AnimatePresence>
        {devModeUnlocked && selectedUsageEntry ? (
          <UsageContentPopup
            entry={selectedUsageEntry}
            onClose={() => setSelectedUsageEntry(null)}
            title={t("dashboard:recentTokenHistory.contentDialogTitle")}
            closeLabel={t("dashboard:recentTokenHistory.close")}
            unknownModelLabel={t("dashboard:recentTokenHistory.unknownModel")}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}

function formatTokenCount(value: number): string {
  return Intl.NumberFormat().format(value);
}

function formatUsageTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function groupUsageHistory(
  entries: UsageHistoryEntry[],
  groupBy: UsageGroupBy,
): Array<{
  label: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  sortKey: number | string;
}> {
  const grouped = new Map<
    string,
    {
      label: string;
      totalTokens: number;
      inputTokens: number;
      outputTokens: number;
      cacheTokens: number;
      sortKey: number | string;
    }
  >();

  for (const entry of entries) {
    const label =
      groupBy === "model"
        ? entry.model || "Unknown"
        : formatUsageDay(entry.timestamp);
    const current = grouped.get(label) ?? {
      label,
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheTokens: 0,
      sortKey:
        groupBy === "day"
          ? getUsageDaySortKey(entry.timestamp)
          : label.toLowerCase(),
    };
    current.totalTokens += entry.totalTokens;
    current.inputTokens += entry.inputTokens;
    current.outputTokens += entry.outputTokens;
    current.cacheTokens += entry.cacheReadTokens + entry.cacheWriteTokens;
    grouped.set(label, current);
  }

  return Array.from(grouped.values())
    .sort((a, b) => {
      if (groupBy === "day") {
        return Number(a.sortKey) - Number(b.sortKey);
      }
      return b.totalTokens - a.totalTokens;
    })
    .slice(0, 8);
}

function formatUsageDay(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(date);
}

function getUsageDaySortKey(timestamp: string): number {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 0;
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function filterUsageHistoryByWindow(
  entries: UsageHistoryEntry[],
  window: UsageWindow,
): UsageHistoryEntry[] {
  if (window === "all") return entries;

  const now = Date.now();
  const days = window === "7d" ? 7 : 30;
  const cutoff = now - days * 24 * 60 * 60 * 1000;

  return entries.filter((entry) => {
    const timestamp = Date.parse(entry.timestamp);
    return Number.isFinite(timestamp) && timestamp >= cutoff;
  });
}

function UsageBarChart({
  groups,
  emptyLabel,
  totalLabel,
  inputLabel,
  outputLabel,
  cacheLabel,
}: {
  groups: Array<{
    label: string;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    cacheTokens: number;
  }>;
  emptyLabel: string;
  totalLabel: string;
  inputLabel: string;
  outputLabel: string;
  cacheLabel: string;
}) {
  if (groups.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-black/10 dark:border-white/10 p-8 text-center text-[14px] font-medium text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  const maxTokens = Math.max(...groups.map((group) => group.totalTokens), 1);

  return (
    <div className="space-y-4 rounded-[24px] border border-border/70 bg-background/45 p-5">
      <div className="flex flex-wrap gap-4 text-[13px] font-medium text-muted-foreground mb-2">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-sky-500" />
          {inputLabel}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-violet-500" />
          {outputLabel}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
          {cacheLabel}
        </span>
      </div>
      {groups.map((group) => (
        <div key={group.label} className="space-y-1.5">
          <div className="flex items-center justify-between gap-3 text-[13.5px]">
            <span className="truncate font-semibold text-foreground">
              {group.label}
            </span>
            <span className="text-muted-foreground font-medium">
              {totalLabel}: {formatTokenCount(group.totalTokens)}
            </span>
          </div>
          <div className="h-3.5 overflow-hidden rounded-full bg-black/5 dark:bg-white/5">
            <div
              className="flex h-full overflow-hidden rounded-full"
              style={{
                width:
                  group.totalTokens > 0
                    ? `${Math.max((group.totalTokens / maxTokens) * 100, 6)}%`
                    : "0%",
              }}
            >
              {group.inputTokens > 0 && (
                <div
                  className="h-full bg-sky-500"
                  style={{
                    width: `${(group.inputTokens / group.totalTokens) * 100}%`,
                  }}
                />
              )}
              {group.outputTokens > 0 && (
                <div
                  className="h-full bg-violet-500"
                  style={{
                    width: `${(group.outputTokens / group.totalTokens) * 100}%`,
                  }}
                />
              )}
              {group.cacheTokens > 0 && (
                <div
                  className="h-full bg-amber-500"
                  style={{
                    width: `${(group.cacheTokens / group.totalTokens) * 100}%`,
                  }}
                />
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default Models;

function OverviewCard({
  icon: Icon,
  label,
  value,
  hint,
  prefersReducedMotion,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  prefersReducedMotion: boolean;
}) {
  return (
    <motion.div
      className="rounded-[26px] border border-border/70 bg-background/55 p-4"
      whileHover={getHoverLift(prefersReducedMotion, { y: -3, scale: 1.01 })}
      transition={motionTransition.gentle}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2 min-w-0">
          <div className="text-[12px] font-medium text-muted-foreground">
            {label}
          </div>
          <div className="truncate text-[20px] font-semibold tracking-[-0.02em] text-foreground">
            {value}
          </div>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-3 text-[12px] leading-5 text-muted-foreground">
        {hint}
      </div>
    </motion.div>
  );
}

function InsightRow({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "positive" | "muted";
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-background/55 px-4 py-3">
      <span className="text-[12px] font-medium text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "text-[13px] font-semibold",
          tone === "positive"
            ? "text-emerald-600 dark:text-emerald-400"
            : tone === "muted"
              ? "text-muted-foreground"
              : "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function UsageToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <Button
      variant={active ? "secondary" : "ghost"}
      size="sm"
      onClick={onClick}
      className={cn(
        "h-9 rounded-full border px-4 text-[12px] shadow-none",
        active
          ? "border-primary/15 bg-primary/10 text-foreground hover:bg-primary/15"
          : "border-border/70 bg-background/70 text-muted-foreground hover:bg-accent/70 hover:text-foreground",
      )}
    >
      {children}
    </Button>
  );
}

function MiniStatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-border/70 bg-background/50 px-4 py-3">
      <div className="text-[12px] font-medium text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-[18px] font-semibold tracking-[-0.02em] text-foreground">
        {value}
      </div>
    </div>
  );
}

function UsageRecordCard({
  entry,
  devModeUnlocked,
  onOpen,
  unknownModelLabel,
  inputLabel,
  outputLabel,
  cacheReadLabel,
  cacheWriteLabel,
  costLabel,
  viewContentLabel,
  prefersReducedMotion,
}: {
  entry: UsageHistoryEntry;
  devModeUnlocked: boolean;
  onOpen: () => void;
  unknownModelLabel: string;
  inputLabel: string;
  outputLabel: string;
  cacheReadLabel: string;
  cacheWriteLabel: string;
  costLabel: string;
  viewContentLabel: string;
  prefersReducedMotion: boolean;
}) {
  const canInspect = devModeUnlocked && Boolean(entry.content);
  const cardClassName =
    "w-full rounded-[24px] border border-border/70 bg-background/50 p-5 text-left transition-colors";

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-foreground">
            {entry.model || unknownModelLabel}
          </p>
          <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
            {[entry.provider, entry.agentId, entry.sessionId]
              .filter(Boolean)
              .join(" • ")}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[15px] font-bold text-foreground">
            {formatTokenCount(entry.totalTokens)}
          </p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {formatUsageTimestamp(entry.timestamp)}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px] font-medium text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-sky-500" />
          {inputLabel.replace("{{value}}", formatTokenCount(entry.inputTokens))}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-violet-500" />
          {outputLabel.replace(
            "{{value}}",
            formatTokenCount(entry.outputTokens),
          )}
        </span>
        {entry.cacheReadTokens > 0 ? (
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            {cacheReadLabel.replace(
              "{{value}}",
              formatTokenCount(entry.cacheReadTokens),
            )}
          </span>
        ) : null}
        {entry.cacheWriteTokens > 0 ? (
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            {cacheWriteLabel.replace(
              "{{value}}",
              formatTokenCount(entry.cacheWriteTokens),
            )}
          </span>
        ) : null}
        {typeof entry.costUsd === "number" && Number.isFinite(entry.costUsd) ? (
          <span className="rounded-full bg-black/5 px-2.5 py-1 text-foreground/80 dark:bg-white/5">
            {costLabel.replace("{{amount}}", entry.costUsd.toFixed(4))}
          </span>
        ) : null}
        {canInspect ? (
          <span className="ml-auto rounded-full bg-primary/10 px-2.5 py-1 text-primary">
            {viewContentLabel}
          </span>
        ) : null}
      </div>
    </>
  );

  if (canInspect) {
    return (
      <motion.button
        type="button"
        onClick={onOpen}
        whileHover={getHoverLift(prefersReducedMotion, { y: -2, scale: 1.004 })}
        transition={motionTransition.gentle}
        className={cn(
          cardClassName,
          "cursor-pointer hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2",
        )}
      >
        {content}
      </motion.button>
    );
  }

  return (
    <motion.div
      whileHover={getHoverLift(prefersReducedMotion, { y: -2, scale: 1.004 })}
      transition={motionTransition.gentle}
      className={cardClassName}
    >
      {content}
    </motion.div>
  );
}

function UsageContentPopup({
  entry,
  onClose,
  title,
  closeLabel,
  unknownModelLabel,
}: {
  entry: UsageHistoryEntry;
  onClose: () => void;
  title: string;
  closeLabel: string;
  unknownModelLabel: string;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      initial="hidden"
      animate="show"
      exit="exit"
      variants={motionVariants.overlay}
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <motion.div
        className="w-full max-w-3xl rounded-2xl border border-black/10 bg-background shadow-xl dark:border-white/10"
        variants={motionVariants.softScale}
        transition={motionTransition.modal}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-black/10 dark:border-white/10 px-5 py-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {entry.model || unknownModelLabel} •{" "}
              {formatUsageTimestamp(entry.timestamp)}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={onClose}
            aria-label={closeLabel}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="max-h-[65vh] overflow-y-auto px-5 py-4">
          <pre className="whitespace-pre-wrap break-words text-sm text-foreground font-mono">
            {entry.content}
          </pre>
        </div>
        <div className="flex justify-end border-t border-black/10 dark:border-white/10 px-5 py-3">
          <Button variant="outline" onClick={onClose}>
            {closeLabel}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
