import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { RefreshCw, ExternalLink, Copy, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useSettingsStore } from "@/stores/settings";
import { useGatewayStore } from "@/stores/gateway";
import { useUpdateStore } from "@/stores/update";
import {
  WorkspacePage,
  WorkspacePanel,
  WorkspacePanelHeader,
} from "@/components/layout/WorkspacePage";
import {
  getGatewayWsDiagnosticEnabled,
  invokeIpc,
  setGatewayWsDiagnosticEnabled,
  toUserMessage,
} from "@/lib/api-client";
import {
  clearUiTelemetry,
  getUiTelemetrySnapshot,
  subscribeUiTelemetry,
  trackUiEvent,
  type UiTelemetryEntry,
} from "@/lib/telemetry";
import { useTranslation } from "react-i18next";
import { hostApiFetch } from "@/lib/host-api";
import { cn } from "@/lib/utils";
import {
  createStaggeredList,
  getHoverLift,
  getTapScale,
  motionTransition,
  motionVariants,
} from "@/lib/motion";
type ControlUiInfo = {
  url: string;
  token: string;
  port: number;
};

function SettingRow({
  title,
  description,
  control,
  className,
}: {
  title: string;
  description: string;
  control: React.ReactNode;
  className?: string;
}) {
  const prefersReducedMotion = useReducedMotion() ?? false;

  return (
    <motion.div
      className={cn(
        "flex items-start justify-between gap-4 rounded-[20px] border border-border/60 bg-background/45 px-4 py-4",
        className,
      )}
      whileHover={getHoverLift(prefersReducedMotion, { y: -2, scale: 1.004 })}
      transition={motionTransition.gentle}
    >
      <div className="space-y-1">
        <Label className="text-[14px] font-medium text-foreground">
          {title}
        </Label>
        <p className="text-[13px] leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
      <div className="shrink-0">{control}</div>
    </motion.div>
  );
}

function FieldStack({
  id,
  label,
  description,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const prefersReducedMotion = useReducedMotion() ?? false;

  return (
    <motion.div
      className="space-y-2"
      whileHover={getHoverLift(prefersReducedMotion, { y: -2, scale: 1.003 })}
      transition={motionTransition.gentle}
    >
      <Label htmlFor={id} className="text-[13px] text-foreground/80">
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-11 rounded-xl border-border/70 bg-background/70 font-mono text-[13px]"
      />
      <p className="text-[11px] leading-5 text-muted-foreground">
        {description}
      </p>
    </motion.div>
  );
}

export function Settings() {
  const { t } = useTranslation("settings");
  const prefersReducedMotion = useReducedMotion() ?? false;
  const {
    launchAtStartup,
    setLaunchAtStartup,
    gatewayAutoStart,
    setGatewayAutoStart,
    proxyEnabled,
    proxyServer,
    proxyHttpServer,
    proxyHttpsServer,
    proxyAllServer,
    proxyBypassRules,
    setProxyEnabled,
    setProxyServer,
    setProxyHttpServer,
    setProxyHttpsServer,
    setProxyAllServer,
    setProxyBypassRules,
    devModeUnlocked,
    setDevModeUnlocked,
    telemetryEnabled,
    setTelemetryEnabled,
  } = useSettingsStore();

  const { status: gatewayStatus, restart: restartGateway } = useGatewayStore();
  const currentVersion = useUpdateStore((state) => state.currentVersion);
  const [controlUiInfo, setControlUiInfo] = useState<ControlUiInfo | null>(
    null,
  );
  const [openclawCliCommand, setOpenclawCliCommand] = useState("");
  const [openclawCliError, setOpenclawCliError] = useState<string | null>(null);
  const [proxyServerDraft, setProxyServerDraft] = useState("");
  const [proxyHttpServerDraft, setProxyHttpServerDraft] = useState("");
  const [proxyHttpsServerDraft, setProxyHttpsServerDraft] = useState("");
  const [proxyAllServerDraft, setProxyAllServerDraft] = useState("");
  const [proxyBypassRulesDraft, setProxyBypassRulesDraft] = useState("");
  const [proxyEnabledDraft, setProxyEnabledDraft] = useState(false);
  const [savingProxy, setSavingProxy] = useState(false);
  const [refreshingControlUi, setRefreshingControlUi] = useState(false);
  const [wsDiagnosticEnabled, setWsDiagnosticEnabled] = useState(false);
  const [showTelemetryViewer, setShowTelemetryViewer] = useState(false);
  const [telemetryEntries, setTelemetryEntries] = useState<UiTelemetryEntry[]>(
    [],
  );

  const isWindows = window.electron.platform === "win32";
  const showCliTools = true;
  const [showLogs, setShowLogs] = useState(false);
  const [logContent, setLogContent] = useState("");
  const [loadingLogs, setLoadingLogs] = useState(false);

  const handleShowLogs = async () => {
    setLoadingLogs(true);
    setShowLogs(true);
    try {
      const logs = await hostApiFetch<{ content: string }>(
        "/api/logs?tailLines=100",
      );
      setLogContent(logs.content);
    } catch {
      setLogContent(t("overview.logsError"));
    } finally {
      setLoadingLogs(false);
    }
  };

  const handleOpenLogDir = async () => {
    try {
      const { dir: logDir } = await hostApiFetch<{ dir: string | null }>(
        "/api/logs/dir",
      );
      if (logDir) {
        await invokeIpc("shell:showItemInFolder", logDir);
      }
    } catch {
      // ignore
    }
  };

  const refreshControlUiInfo = async () => {
    setRefreshingControlUi(true);
    try {
      const result = await hostApiFetch<{
        success: boolean;
        url?: string;
        token?: string;
        port?: number;
      }>("/api/gateway/control-ui");
      if (
        result.success &&
        result.url &&
        result.token &&
        typeof result.port === "number"
      ) {
        setControlUiInfo({
          url: result.url,
          token: result.token,
          port: result.port,
        });
      }
    } catch {
      // Ignore refresh errors
    } finally {
      setRefreshingControlUi(false);
    }
  };

  const handleCopyGatewayToken = async () => {
    if (!controlUiInfo?.token) return;
    try {
      await navigator.clipboard.writeText(controlUiInfo.token);
      toast.success(t("developer.tokenCopied"));
    } catch (error) {
      toast.error(`Failed to copy token: ${String(error)}`);
    }
  };

  const handleCopyLogs = async () => {
    if (!logContent) return;
    try {
      await navigator.clipboard.writeText(logContent);
      toast.success(t("common:actions.copy"));
    } catch (error) {
      toast.error(`${t("common:status.error")}: ${String(error)}`);
    }
  };

  useEffect(() => {
    if (!showCliTools) return;
    let cancelled = false;

    (async () => {
      try {
        const result = await invokeIpc<{
          success: boolean;
          command?: string;
          error?: string;
        }>("openclaw:getCliCommand");
        if (cancelled) return;
        if (result.success && result.command) {
          setOpenclawCliCommand(result.command);
          setOpenclawCliError(null);
        } else {
          setOpenclawCliCommand("");
          setOpenclawCliError(result.error || "OpenClaw CLI unavailable");
        }
      } catch (error) {
        if (cancelled) return;
        setOpenclawCliCommand("");
        setOpenclawCliError(String(error));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [devModeUnlocked, showCliTools]);

  const handleCopyCliCommand = async () => {
    if (!openclawCliCommand) return;
    try {
      await navigator.clipboard.writeText(openclawCliCommand);
      toast.success(t("developer.cmdCopied"));
    } catch (error) {
      toast.error(`Failed to copy command: ${String(error)}`);
    }
  };

  useEffect(() => {
    const unsubscribe = window.electron.ipcRenderer.on(
      "openclaw:cli-installed",
      (...args: unknown[]) => {
        const installedPath = typeof args[0] === "string" ? args[0] : "";
        toast.success(`openclaw CLI installed at ${installedPath}`);
      },
    );
    return () => {
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    setWsDiagnosticEnabled(getGatewayWsDiagnosticEnabled());
  }, []);

  useEffect(() => {
    if (!devModeUnlocked) return;
    setTelemetryEntries(getUiTelemetrySnapshot(200));
    const unsubscribe = subscribeUiTelemetry((entry) => {
      setTelemetryEntries((prev) => {
        const next = [...prev, entry];
        if (next.length > 200) {
          next.splice(0, next.length - 200);
        }
        return next;
      });
    });
    return unsubscribe;
  }, [devModeUnlocked]);

  useEffect(() => {
    if (!devModeUnlocked) return;
    void refreshControlUiInfo();
  }, [devModeUnlocked]);

  useEffect(() => {
    setProxyEnabledDraft(proxyEnabled);
  }, [proxyEnabled]);

  useEffect(() => {
    setProxyServerDraft(proxyServer);
  }, [proxyServer]);

  useEffect(() => {
    setProxyHttpServerDraft(proxyHttpServer);
  }, [proxyHttpServer]);

  useEffect(() => {
    setProxyHttpsServerDraft(proxyHttpsServer);
  }, [proxyHttpsServer]);

  useEffect(() => {
    setProxyAllServerDraft(proxyAllServer);
  }, [proxyAllServer]);

  useEffect(() => {
    setProxyBypassRulesDraft(proxyBypassRules);
  }, [proxyBypassRules]);

  const handleSaveProxySettings = async () => {
    setSavingProxy(true);
    try {
      const normalizedProxyServer = proxyServerDraft.trim();
      const normalizedHttpServer = proxyHttpServerDraft.trim();
      const normalizedHttpsServer = proxyHttpsServerDraft.trim();
      const normalizedAllServer = proxyAllServerDraft.trim();
      const normalizedBypassRules = proxyBypassRulesDraft.trim();
      await invokeIpc("settings:setMany", {
        proxyEnabled: proxyEnabledDraft,
        proxyServer: normalizedProxyServer,
        proxyHttpServer: normalizedHttpServer,
        proxyHttpsServer: normalizedHttpsServer,
        proxyAllServer: normalizedAllServer,
        proxyBypassRules: normalizedBypassRules,
      });

      setProxyServer(normalizedProxyServer);
      setProxyHttpServer(normalizedHttpServer);
      setProxyHttpsServer(normalizedHttpsServer);
      setProxyAllServer(normalizedAllServer);
      setProxyBypassRules(normalizedBypassRules);
      setProxyEnabled(proxyEnabledDraft);

      toast.success(t("gateway.proxySaved"));
      trackUiEvent("settings.proxy_saved", { enabled: proxyEnabledDraft });
    } catch (error) {
      toast.error(`${t("gateway.proxySaveFailed")}: ${toUserMessage(error)}`);
    } finally {
      setSavingProxy(false);
    }
  };

  const telemetryStats = useMemo(() => {
    let errorCount = 0;
    let slowCount = 0;
    for (const entry of telemetryEntries) {
      if (
        entry.event.endsWith("_error") ||
        entry.event.includes("request_error")
      ) {
        errorCount += 1;
      }
      const durationMs =
        typeof entry.payload.durationMs === "number"
          ? entry.payload.durationMs
          : Number.NaN;
      if (Number.isFinite(durationMs) && durationMs >= 800) {
        slowCount += 1;
      }
    }
    return { total: telemetryEntries.length, errorCount, slowCount };
  }, [telemetryEntries]);

  const telemetryByEvent = useMemo(() => {
    const map = new Map<
      string,
      {
        event: string;
        count: number;
        errorCount: number;
        slowCount: number;
        totalDuration: number;
        timedCount: number;
        lastTs: string;
      }
    >();

    for (const entry of telemetryEntries) {
      const current = map.get(entry.event) ?? {
        event: entry.event,
        count: 0,
        errorCount: 0,
        slowCount: 0,
        totalDuration: 0,
        timedCount: 0,
        lastTs: entry.ts,
      };

      current.count += 1;
      current.lastTs = entry.ts;

      if (
        entry.event.endsWith("_error") ||
        entry.event.includes("request_error")
      ) {
        current.errorCount += 1;
      }

      const durationMs =
        typeof entry.payload.durationMs === "number"
          ? entry.payload.durationMs
          : Number.NaN;
      if (Number.isFinite(durationMs)) {
        current.totalDuration += durationMs;
        current.timedCount += 1;
        if (durationMs >= 800) {
          current.slowCount += 1;
        }
      }

      map.set(entry.event, current);
    }

    return [...map.values()].sort((a, b) => b.count - a.count).slice(0, 12);
  }, [telemetryEntries]);

  const handleCopyTelemetry = async () => {
    try {
      const serialized = telemetryEntries
        .map((entry) => JSON.stringify(entry))
        .join("\n");
      await navigator.clipboard.writeText(serialized);
      toast.success(t("developer.telemetryCopied"));
    } catch (error) {
      toast.error(`${t("common:status.error")}: ${String(error)}`);
    }
  };

  const handleClearTelemetry = () => {
    clearUiTelemetry();
    setTelemetryEntries([]);
    toast.success(t("developer.telemetryCleared"));
  };

  const handleWsDiagnosticToggle = (enabled: boolean) => {
    setGatewayWsDiagnosticEnabled(enabled);
    setWsDiagnosticEnabled(enabled);
    toast.success(
      enabled
        ? t("developer.wsDiagnosticEnabled")
        : t("developer.wsDiagnosticDisabled"),
    );
  };

  const gatewayStatusLabel =
    gatewayStatus.state === "running"
      ? t("common:status.running")
      : gatewayStatus.state === "error"
        ? t("common:status.error")
        : t("overview.statusIdle");

  const isProxyDirty =
    proxyEnabledDraft !== proxyEnabled ||
    proxyServerDraft.trim() !== proxyServer ||
    proxyHttpServerDraft.trim() !== proxyHttpServer ||
    proxyHttpsServerDraft.trim() !== proxyHttpsServer ||
    proxyAllServerDraft.trim() !== proxyAllServer ||
    proxyBypassRulesDraft.trim() !== proxyBypassRules;

  const handleResetProxyDrafts = () => {
    setProxyEnabledDraft(proxyEnabled);
    setProxyServerDraft(proxyServer);
    setProxyHttpServerDraft(proxyHttpServer);
    setProxyHttpsServerDraft(proxyHttpsServer);
    setProxyAllServerDraft(proxyAllServer);
    setProxyBypassRulesDraft(proxyBypassRules);
  };

  const aside = (
    <div className="space-y-4">
      <WorkspacePanel className="space-y-4">
        <WorkspacePanelHeader
          title={t("about.title")}
          description={t("about.tagline")}
        />
        <motion.div
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1"
          initial="hidden"
          animate="show"
          variants={createStaggeredList(prefersReducedMotion ? 0 : 0.05)}
        >
          <motion.div
            className="rounded-2xl border border-border/70 bg-background/60 p-4"
            variants={motionVariants.softScale}
            whileHover={getHoverLift(prefersReducedMotion, {
              y: -3,
              scale: 1.01,
            })}
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
              {t("updates.currentVersion")}
            </div>
            <div className="pt-2 text-2xl font-semibold text-foreground">
              v{currentVersion}
            </div>
          </motion.div>
          <motion.div
            className="rounded-2xl border border-border/70 bg-background/60 p-4"
            variants={motionVariants.softScale}
            whileHover={getHoverLift(prefersReducedMotion, {
              y: -3,
              scale: 1.01,
            })}
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
              {t("gateway.status")}
            </div>
            <div className="pt-2">
              <Badge
                variant="secondary"
                className={cn(
                  "rounded-full border-0 px-2.5 py-1 text-[11px]",
                  gatewayStatus.state === "running"
                    ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                    : gatewayStatus.state === "error"
                      ? "bg-destructive/12 text-destructive"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {gatewayStatusLabel}
              </Badge>
            </div>
          </motion.div>
        </motion.div>
        <motion.div
          className="space-y-3 rounded-2xl border border-border/70 bg-background/50 p-4"
          whileHover={getHoverLift(prefersReducedMotion, {
            y: -3,
            scale: 1.006,
          })}
          transition={motionTransition.gentle}
        >
          <div className="text-[13px] font-medium text-foreground">
            {t("developer.console")}
          </div>
          <div className="text-xs leading-5 text-muted-foreground">
            {controlUiInfo?.url || t("developer.consoleNote")}
          </div>
          <div className="flex flex-wrap gap-2">
            <motion.div whileTap={getTapScale(prefersReducedMotion)}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void refreshControlUiInfo()}
                disabled={refreshingControlUi}
                className="h-8 rounded-full border-border/70 bg-background/70 px-3 text-[12px] shadow-none hover:bg-accent/80"
              >
                <RefreshCw
                  className={cn(
                    "mr-1.5 h-3.5 w-3.5",
                    refreshingControlUi && "animate-spin",
                  )}
                />
                {t("common:actions.load")}
              </Button>
            </motion.div>
            <motion.div whileTap={getTapScale(prefersReducedMotion)}>
              <Button
                variant="outline"
                size="sm"
                disabled={!controlUiInfo?.url}
                onClick={() =>
                  controlUiInfo?.url
                    ? void invokeIpc("shell:openExternal", controlUiInfo.url)
                    : undefined
                }
                className="h-8 rounded-full border-border/70 bg-background/70 px-3 text-[12px] shadow-none hover:bg-accent/80"
              >
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                {t("developer.openConsole")}
              </Button>
            </motion.div>
          </div>
        </motion.div>
      </WorkspacePanel>

      {devModeUnlocked ? (
        <WorkspacePanel className="space-y-3">
          <WorkspacePanelHeader
            title={t("developer.gatewayToken")}
            description={t("developer.gatewayTokenDesc")}
          />
          <Input
            readOnly
            value={controlUiInfo?.token || ""}
            placeholder={t("developer.tokenUnavailable")}
            className="h-10 rounded-xl border-border/70 bg-background/70 font-mono text-[12px]"
          />
          <motion.div whileTap={getTapScale(prefersReducedMotion)}>
            <Button
              variant="outline"
              size="sm"
              disabled={!controlUiInfo?.token}
              onClick={handleCopyGatewayToken}
              className="h-8 rounded-full border-border/70 bg-background/70 px-3 text-[12px] shadow-none hover:bg-accent/80"
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              {t("common:actions.copy")}
            </Button>
          </motion.div>
        </WorkspacePanel>
      ) : null}
    </div>
  );

  return (
    <WorkspacePage
      eyebrow={t("workspace")}
      title={t("title")}
      description={t("subtitle")}
      aside={aside}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <motion.div whileTap={getTapScale(prefersReducedMotion)}>
            <Button
              variant="outline"
              onClick={restartGateway}
              className="h-9 rounded-full border-border/70 bg-background/70 px-4 text-[13px] font-medium text-foreground/80 shadow-none hover:bg-accent/80"
            >
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              {t("common:actions.restart")}
            </Button>
          </motion.div>
          <motion.div whileTap={getTapScale(prefersReducedMotion)}>
            <Button
              variant="outline"
              onClick={() => void handleShowLogs()}
              className="h-9 rounded-full border-border/70 bg-background/70 px-4 text-[13px] font-medium text-foreground/80 shadow-none hover:bg-accent/80"
            >
              <FileText className="mr-2 h-3.5 w-3.5" />
              {t("gateway.logs")}
            </Button>
          </motion.div>
        </div>
      }
    >
      <motion.div
        initial="hidden"
        animate="show"
        variants={createStaggeredList(prefersReducedMotion ? 0 : 0.05)}
        className="space-y-4"
      >
        <motion.div
          className="grid gap-4 md:grid-cols-3"
          variants={createStaggeredList(prefersReducedMotion ? 0 : 0.05)}
        >
          <motion.div
            className="rounded-[22px] border border-border/70 bg-background/55 px-5 py-4"
            variants={motionVariants.softScale}
            whileHover={getHoverLift(prefersReducedMotion, {
              y: -3,
              scale: 1.01,
            })}
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
              {t("overview.version")}
            </div>
            <div className="pt-2 text-2xl font-semibold text-foreground">
              v{currentVersion}
            </div>
          </motion.div>
          <motion.div
            className="rounded-[22px] border border-border/70 bg-background/55 px-5 py-4"
            variants={motionVariants.softScale}
            whileHover={getHoverLift(prefersReducedMotion, {
              y: -3,
              scale: 1.01,
            })}
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
              {t("overview.status")}
            </div>
            <div className="pt-2 text-2xl font-semibold text-foreground">
              {gatewayStatusLabel}
            </div>
          </motion.div>
          <motion.div
            className="rounded-[22px] border border-border/70 bg-background/55 px-5 py-4"
            variants={motionVariants.softScale}
            whileHover={getHoverLift(prefersReducedMotion, {
              y: -3,
              scale: 1.01,
            })}
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
              {t("overview.proxy")}
            </div>
            <div className="pt-2 text-2xl font-semibold text-foreground">
              {proxyEnabledDraft ? t("overview.on") : t("overview.off")}
            </div>
          </motion.div>
        </motion.div>

        <div className="grid gap-4 xl:grid-cols-2">
          <WorkspacePanel className="space-y-4">
            <WorkspacePanelHeader
              title={t("appearance.title")}
              description={t("appearance.description")}
            />
            <SettingRow
              title={t("appearance.launchAtStartup")}
              description={t("appearance.launchAtStartupDesc")}
              control={
                <Switch
                  checked={launchAtStartup}
                  onCheckedChange={setLaunchAtStartup}
                />
              }
            />
            <SettingRow
              title={t("gateway.autoStart")}
              description={t("gateway.autoStartDesc")}
              control={
                <Switch
                  checked={gatewayAutoStart}
                  onCheckedChange={setGatewayAutoStart}
                />
              }
            />
            <SettingRow
              title={t("advanced.telemetry")}
              description={t("advanced.telemetryDesc")}
              control={
                <Switch
                  checked={telemetryEnabled}
                  onCheckedChange={setTelemetryEnabled}
                />
              }
            />
            <SettingRow
              title={t("advanced.devMode")}
              description={t("advanced.devModeDesc")}
              control={
                <Switch
                  checked={devModeUnlocked}
                  onCheckedChange={setDevModeUnlocked}
                />
              }
            />
          </WorkspacePanel>

          <WorkspacePanel className="space-y-4">
            <WorkspacePanelHeader
              title={t("gateway.title")}
              description={t("gateway.description")}
            />
            <div className="rounded-[20px] border border-border/60 bg-background/45 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-[14px] font-medium text-foreground">
                    {t("gateway.status")}
                  </div>
                  <div className="text-[13px] text-muted-foreground">
                    {t("gateway.port")}: {gatewayStatus.port}
                  </div>
                </div>
                <Badge
                  variant="secondary"
                  className={cn(
                    "rounded-full border-0 px-2.5 py-1 text-[11px]",
                    gatewayStatus.state === "running"
                      ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                      : gatewayStatus.state === "error"
                        ? "bg-destructive/12 text-destructive"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {gatewayStatusLabel}
                </Badge>
              </div>
            </div>

            {showLogs ? (
              <div className="space-y-3 rounded-[20px] border border-border/60 bg-background/45 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[14px] font-medium text-foreground">
                    {t("gateway.appLogs")}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 rounded-full px-3 text-[12px] hover:bg-accent/70"
                      onClick={() => void handleCopyLogs()}
                      disabled={!logContent || loadingLogs}
                    >
                      <Copy className="mr-1.5 h-3 w-3" />
                      {t("common:actions.copy")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 rounded-full px-3 text-[12px] hover:bg-accent/70"
                      onClick={() => void handleShowLogs()}
                      disabled={loadingLogs}
                    >
                      <RefreshCw
                        className={cn(
                          "mr-1.5 h-3 w-3",
                          loadingLogs && "animate-spin",
                        )}
                      />
                      {t("common:actions.refresh")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 rounded-full px-3 text-[12px] hover:bg-accent/70"
                      onClick={() => void handleOpenLogDir()}
                    >
                      <ExternalLink className="mr-1.5 h-3 w-3" />
                      {t("gateway.openFolder")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 rounded-full px-3 text-[12px] hover:bg-accent/70"
                      onClick={() => setShowLogs(false)}
                    >
                      {t("common:actions.close")}
                    </Button>
                  </div>
                </div>
                <pre className="max-h-72 overflow-auto rounded-xl border border-border/60 bg-background/70 p-4 font-mono text-[12px] text-muted-foreground shadow-inner whitespace-pre-wrap">
                  {loadingLogs
                    ? t("common:status.loading")
                    : logContent || t("chat:noLogs")}
                </pre>
              </div>
            ) : null}

            <div className="rounded-[20px] border border-dashed border-border/70 bg-background/35 px-4 py-4 text-sm leading-6 text-muted-foreground">
              {t("gateway.proxyRestartNote")}
            </div>
          </WorkspacePanel>

          {devModeUnlocked ? (
            <WorkspacePanel className="space-y-5 xl:col-span-2">
              <WorkspacePanelHeader
                title={t("developer.title")}
                description={t("developer.description")}
              />

              <div className="grid gap-4 xl:grid-cols-2">
                <div className="space-y-4 rounded-[20px] border border-border/60 bg-background/45 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1">
                      <Label className="text-[14px] font-medium text-foreground">
                        {t("overview.proxy")}
                      </Label>
                      <p className="text-[13px] leading-6 text-muted-foreground">
                        {t("gateway.proxyDesc")}
                      </p>
                    </div>
                    <Switch
                      checked={proxyEnabledDraft}
                      onCheckedChange={setProxyEnabledDraft}
                    />
                  </div>

                  {proxyEnabledDraft ? (
                    <div className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <FieldStack
                          id="proxy-server"
                          label={t("gateway.proxyServer")}
                          description={t("gateway.proxyServerHelp")}
                          value={proxyServerDraft}
                          onChange={setProxyServerDraft}
                          placeholder="http://127.0.0.1:7890"
                        />
                        <FieldStack
                          id="proxy-http-server"
                          label={t("gateway.proxyHttpServer")}
                          description={t("gateway.proxyHttpServerHelp")}
                          value={proxyHttpServerDraft}
                          onChange={setProxyHttpServerDraft}
                          placeholder={
                            proxyServerDraft || "http://127.0.0.1:7890"
                          }
                        />
                        <FieldStack
                          id="proxy-https-server"
                          label={t("gateway.proxyHttpsServer")}
                          description={t("gateway.proxyHttpsServerHelp")}
                          value={proxyHttpsServerDraft}
                          onChange={setProxyHttpsServerDraft}
                          placeholder={
                            proxyServerDraft || "http://127.0.0.1:7890"
                          }
                        />
                        <FieldStack
                          id="proxy-all-server"
                          label={t("gateway.proxyAllServer")}
                          description={t("gateway.proxyAllServerHelp")}
                          value={proxyAllServerDraft}
                          onChange={setProxyAllServerDraft}
                          placeholder={
                            proxyServerDraft || "socks5://127.0.0.1:7891"
                          }
                        />
                      </div>
                      <FieldStack
                        id="proxy-bypass"
                        label={t("gateway.proxyBypass")}
                        description={t("gateway.proxyBypassHelp")}
                        value={proxyBypassRulesDraft}
                        onChange={setProxyBypassRulesDraft}
                        placeholder="<local>;localhost;127.0.0.1;::1"
                      />
                      <div className="flex flex-wrap items-center gap-3">
                        <Button
                          variant="ghost"
                          onClick={handleResetProxyDrafts}
                          disabled={!isProxyDirty || savingProxy}
                          className="h-10 rounded-full px-4 text-[13px] text-muted-foreground shadow-none hover:bg-accent/70 hover:text-foreground"
                        >
                          {t("common:actions.reset")}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => void handleSaveProxySettings()}
                          disabled={savingProxy || !isProxyDirty}
                          className="h-10 rounded-full border-border/70 bg-background/70 px-5 text-[13px] shadow-none hover:bg-accent/80"
                        >
                          <RefreshCw
                            className={cn(
                              "mr-2 h-4 w-4",
                              savingProxy && "animate-spin",
                            )}
                          />
                          {savingProxy
                            ? t("common:status.saving")
                            : t("common:actions.save")}
                        </Button>
                        <p className="text-[12px] text-muted-foreground">
                          {t("gateway.proxyRestartNote")}
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="space-y-4 rounded-[20px] border border-border/60 bg-background/45 p-4">
                  <div className="space-y-2">
                    <Label className="text-[14px] font-medium text-foreground">
                      {t("developer.gatewayToken")}
                    </Label>
                    <p className="text-[13px] leading-6 text-muted-foreground">
                      {t("developer.gatewayTokenDesc")}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Input
                        readOnly
                        value={controlUiInfo?.token || ""}
                        placeholder={t("developer.tokenUnavailable")}
                        className="h-10 min-w-[220px] flex-1 rounded-xl border-border/70 bg-background/70 font-mono text-[13px]"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void refreshControlUiInfo()}
                        disabled={refreshingControlUi}
                        className="h-10 rounded-full border-border/70 bg-background/70 px-4 shadow-none hover:bg-accent/80"
                      >
                        <RefreshCw
                          className={cn(
                            "mr-2 h-4 w-4",
                            refreshingControlUi && "animate-spin",
                          )}
                        />
                        {t("common:actions.load")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleCopyGatewayToken}
                        disabled={!controlUiInfo?.token}
                        className="h-10 rounded-full border-border/70 bg-background/70 px-4 shadow-none hover:bg-accent/80"
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        {t("common:actions.copy")}
                      </Button>
                    </div>
                  </div>

                  {showCliTools ? (
                    <div className="space-y-2">
                      <Label className="text-[14px] font-medium text-foreground">
                        {t("developer.cli")}
                      </Label>
                      <p className="text-[13px] leading-6 text-muted-foreground">
                        {t("developer.cliDesc")}
                      </p>
                      {isWindows ? (
                        <p className="text-[12px] text-muted-foreground">
                          {t("developer.cliPowershell")}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        <Input
                          readOnly
                          value={openclawCliCommand}
                          placeholder={
                            openclawCliError || t("developer.cmdUnavailable")
                          }
                          className="h-10 min-w-[220px] flex-1 rounded-xl border-border/70 bg-background/70 font-mono text-[13px]"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleCopyCliCommand}
                          disabled={!openclawCliCommand}
                          className="h-10 rounded-full border-border/70 bg-background/70 px-4 shadow-none hover:bg-accent/80"
                        >
                          <Copy className="mr-2 h-4 w-4" />
                          {t("common:actions.copy")}
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  <SettingRow
                    title={t("developer.wsDiagnostic")}
                    description={t("developer.wsDiagnosticDesc")}
                    control={
                      <Switch
                        checked={wsDiagnosticEnabled}
                        onCheckedChange={handleWsDiagnosticToggle}
                      />
                    }
                    className="bg-background/60"
                  />
                </div>
              </div>

              <div className="space-y-4 rounded-[20px] border border-border/60 bg-background/45 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <Label className="text-[14px] font-medium text-foreground">
                      {t("developer.telemetryViewer")}
                    </Label>
                    <p className="text-[13px] leading-6 text-muted-foreground">
                      {t("developer.telemetryViewerDesc")}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowTelemetryViewer((prev) => !prev)}
                    className="h-9 rounded-full border-border/70 bg-background/70 px-4 shadow-none hover:bg-accent/80"
                  >
                    {showTelemetryViewer
                      ? t("common:actions.hide")
                      : t("common:actions.show")}
                  </Button>
                </div>

                {showTelemetryViewer ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="secondary"
                        className="rounded-full border-0 bg-foreground/[0.06] px-3 py-1 dark:bg-white/[0.08]"
                      >
                        {t("developer.telemetryTotal")}: {telemetryStats.total}
                      </Badge>
                      <Badge
                        variant={
                          telemetryStats.errorCount > 0
                            ? "destructive"
                            : "secondary"
                        }
                        className={cn(
                          "rounded-full px-3 py-1",
                          telemetryStats.errorCount === 0 &&
                            "border-0 bg-foreground/[0.06] dark:bg-white/[0.08]",
                        )}
                      >
                        {t("developer.telemetryErrors")}:{" "}
                        {telemetryStats.errorCount}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className="rounded-full border-0 bg-foreground/[0.06] px-3 py-1 dark:bg-white/[0.08]"
                      >
                        {t("developer.telemetrySlow")}:{" "}
                        {telemetryStats.slowCount}
                      </Badge>
                      <div className="ml-auto flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleCopyTelemetry}
                          className="h-8 rounded-full border-border/70 bg-background/70 px-4 shadow-none hover:bg-accent/80"
                        >
                          <Copy className="mr-1.5 h-3.5 w-3.5" />
                          {t("common:actions.copy")}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleClearTelemetry}
                          className="h-8 rounded-full border-border/70 bg-background/70 px-4 shadow-none hover:bg-accent/80"
                        >
                          {t("common:actions.clear")}
                        </Button>
                      </div>
                    </div>

                    <div className="max-h-80 overflow-auto rounded-xl border border-border/60 bg-background/70 shadow-inner">
                      {telemetryByEvent.length > 0 ? (
                        <div className="border-b border-border/60 bg-background/80 p-3">
                          <p className="mb-3 text-[12px] font-semibold text-muted-foreground">
                            {t("developer.telemetryAggregated")}
                          </p>
                          <div className="space-y-1.5 text-[12px]">
                            {telemetryByEvent.map((item) => (
                              <div
                                key={item.event}
                                className="grid grid-cols-[minmax(0,1.6fr)_0.7fr_0.9fr_0.8fr_1fr] gap-2 rounded-lg border border-border/60 bg-background/70 px-3 py-2"
                              >
                                <span
                                  className="truncate font-medium"
                                  title={item.event}
                                >
                                  {item.event}
                                </span>
                                <span className="text-muted-foreground">
                                  n={item.count}
                                </span>
                                <span className="text-muted-foreground">
                                  avg=
                                  {item.timedCount > 0
                                    ? Math.round(
                                        item.totalDuration / item.timedCount,
                                      )
                                    : 0}
                                  ms
                                </span>
                                <span className="text-muted-foreground">
                                  slow={item.slowCount}
                                </span>
                                <span className="text-muted-foreground">
                                  err={item.errorCount}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      <div className="space-y-2 p-3 font-mono text-[12px]">
                        {telemetryEntries.length === 0 ? (
                          <div className="py-4 text-center text-muted-foreground">
                            {t("developer.telemetryEmpty")}
                          </div>
                        ) : (
                          telemetryEntries
                            .slice()
                            .reverse()
                            .map((entry) => (
                              <div
                                key={entry.id}
                                className="rounded-lg border border-border/60 bg-background/70 p-3"
                              >
                                <div className="mb-2 flex items-center justify-between gap-3">
                                  <span className="font-semibold text-foreground">
                                    {entry.event}
                                  </span>
                                  <span className="text-[11px] text-muted-foreground">
                                    {entry.ts}
                                  </span>
                                </div>
                                <pre className="overflow-x-auto whitespace-pre-wrap text-[11px] text-muted-foreground">
                                  {JSON.stringify(
                                    {
                                      count: entry.count,
                                      ...entry.payload,
                                    },
                                    null,
                                    2,
                                  )}
                                </pre>
                              </div>
                            ))
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </WorkspacePanel>
          ) : null}
        </div>
      </motion.div>
    </WorkspacePage>
  );
}

export default Settings;
