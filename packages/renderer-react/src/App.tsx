/**
 * Root Application Component
 * Handles routing and global providers
 */
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { Component, useEffect, useMemo, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Toaster, toast } from "sonner";
import { useTranslation } from "react-i18next";
import i18n from "./i18n";
import { MainLayout } from "./components/layout/MainLayout";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Models } from "./pages/Models";
import { Chat } from "./pages/Chat";
import { Agents } from "./pages/Agents";
import { Channels } from "./pages/Channels";
import { Skills } from "./pages/Skills";
import { Cron } from "./pages/Cron";
import { Settings } from "./pages/Settings";
import { Setup } from "./pages/Setup";
import { useSettingsStore } from "./stores/settings";
import { useGatewayStore } from "./stores/gateway";
import { applyGatewayTransportPreference } from "./lib/api-client";
import type {
  GatewayApprovalDecision,
  GatewayApprovalRequest,
} from "./types/gateway";

/**
 * Error Boundary to catch and display React rendering errors
 */
class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("React Error Boundary caught error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: "40px",
            color: "#f87171",
            background: "#0f172a",
            minHeight: "100vh",
            fontFamily: "monospace",
          }}
        >
          <h1 style={{ fontSize: "24px", marginBottom: "16px" }}>
            Something went wrong
          </h1>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              background: "#1e293b",
              padding: "16px",
              borderRadius: "8px",
              fontSize: "14px",
            }}
          >
            {this.state.error?.message}
            {"\n\n"}
            {this.state.error?.stack}
          </pre>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            style={{
              marginTop: "16px",
              padding: "8px 16px",
              background: "#3b82f6",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function formatApprovalExpiry(
  approval: GatewayApprovalRequest,
  now: number,
  t: (key: string, options?: Record<string, unknown>) => string,
): string | null {
  if (!approval.expiresAtMs) {
    return null;
  }

  const remainingMs = approval.expiresAtMs - now;
  if (remainingMs <= 0) {
    return t("approval.expired");
  }

  const remainingSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
  return t("approval.expiresIn", {
    time: t("approval.secondsShort", { count: remainingSeconds }),
  });
}

function GatewayApprovalOverlay() {
  const { t } = useTranslation("chat");
  const pendingApprovals = useGatewayStore((state) => state.pendingApprovals);
  const resolveApproval = useGatewayStore((state) => state.resolveApproval);
  const activeApproval = pendingApprovals[0];
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!activeApproval) {
      return;
    }

    setNow(Date.now());
    if (!activeApproval.expiresAtMs) {
      return;
    }

    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [activeApproval?.expiresAtMs, activeApproval?.id]);

  const metadata = useMemo(() => {
    if (!activeApproval) {
      return [];
    }

    return [
      {
        label: t("approval.workingDirectory"),
        value: activeApproval.cwd,
      },
      {
        label: t("approval.toolName"),
        value: activeApproval.toolName,
      },
      {
        label: t("approval.pluginId"),
        value: activeApproval.pluginId,
      },
      {
        label: t("approval.agentId"),
        value: activeApproval.agentId,
      },
      {
        label: t("approval.sessionKey"),
        value: activeApproval.sessionKey,
      },
      {
        label: t("approval.host"),
        value: activeApproval.host,
      },
      {
        label: t("approval.nodeId"),
        value: activeApproval.nodeId,
      },
      {
        label: t("approval.severity"),
        value: activeApproval.severity,
      },
      {
        label: t("approval.timeout"),
        value:
          typeof activeApproval.timeoutMs === "number"
            ? `${activeApproval.timeoutMs}ms`
            : null,
      },
    ].filter(
      (item): item is { label: string; value: string } =>
        typeof item.value === "string" && item.value.trim().length > 0,
    );
  }, [activeApproval, t]);

  const requestDetails = useMemo(() => {
    if (!activeApproval || Object.keys(activeApproval.request).length === 0) {
      return null;
    }
    return JSON.stringify(activeApproval.request, null, 2);
  }, [activeApproval]);

  if (!activeApproval) {
    return null;
  }

  const title =
    activeApproval.title ??
    t(
      activeApproval.kind === "plugin"
        ? "approval.pluginTitle"
        : "approval.execTitle",
    );
  const description =
    activeApproval.description ??
    t(
      activeApproval.kind === "plugin"
        ? "approval.pluginSubtitle"
        : "approval.execSubtitle",
    );
  const expiryText = formatApprovalExpiry(activeApproval, now, t);
  const queuedCount = Math.max(0, pendingApprovals.length - 1);

  async function handleResolve(decision: GatewayApprovalDecision) {
    try {
      await resolveApproval(activeApproval.id, decision);
      toast.success(
        decision === "allow-always"
          ? t("approval.approvedAlways")
          : decision === "allow-once"
            ? t("approval.approvedOnce")
            : t("approval.deniedToast"),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t("approval.resolveFailed");
      toast.error(message);
    }
  }

  return (
    <div className="fixed inset-0 z-[99998] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <Card className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-border/70 bg-card/95 shadow-2xl backdrop-blur-xl">
        <CardHeader className="gap-4 border-b border-border/60 pb-5">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-500">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <CardTitle className="text-xl font-semibold tracking-tight">
                {title}
              </CardTitle>
              <CardDescription className="text-sm leading-6">
                {description}
              </CardDescription>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="warning">
              {activeApproval.kind === "plugin"
                ? t("approval.pluginBadge")
                : t("approval.execBadge")}
            </Badge>
            {expiryText ? <Badge variant="outline">{expiryText}</Badge> : null}
            {queuedCount > 0 ? (
              <Badge variant="secondary">
                {t("approval.queued", { count: queuedCount })}
              </Badge>
            ) : null}
          </div>
        </CardHeader>

        <CardContent className="flex-1 space-y-5 overflow-y-auto py-6">
          {activeApproval.commandPreview ? (
            <section className="space-y-2">
              <div className="text-sm font-medium text-foreground">
                {t("approval.command")}
              </div>
              <pre className="overflow-x-auto rounded-2xl border border-border/60 bg-muted/40 p-4 text-sm leading-6 text-foreground">
                {activeApproval.commandPreview}
              </pre>
            </section>
          ) : null}

          {metadata.length > 0 ? (
            <section className="grid gap-3 sm:grid-cols-2">
              {metadata.map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-border/60 bg-muted/25 p-4"
                >
                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {item.label}
                  </div>
                  <div className="mt-2 break-all text-sm text-foreground">
                    {item.value}
                  </div>
                </div>
              ))}
            </section>
          ) : null}

          {requestDetails ? (
            <section className="space-y-2">
              <div className="text-sm font-medium text-foreground">
                {t("approval.requestDetails")}
              </div>
              <pre className="max-h-[280px] overflow-auto rounded-2xl border border-border/60 bg-muted/40 p-4 text-xs leading-6 text-muted-foreground">
                {requestDetails}
              </pre>
            </section>
          ) : null}

          {activeApproval.error ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {activeApproval.error}
            </div>
          ) : null}
        </CardContent>

        <CardFooter className="flex-col gap-3 border-t border-border/60 pt-5 sm:flex-row sm:justify-end">
          <Button
            variant="destructive"
            onClick={() => {
              void handleResolve("deny");
            }}
            disabled={activeApproval.resolving}
          >
            {activeApproval.resolving
              ? t("approval.resolving")
              : t("approval.deny")}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              void handleResolve("allow-always");
            }}
            disabled={activeApproval.resolving}
          >
            {activeApproval.resolving
              ? t("approval.resolving")
              : t("approval.allowAlways")}
          </Button>
          <Button
            onClick={() => {
              void handleResolve("allow-once");
            }}
            disabled={activeApproval.resolving}
          >
            {activeApproval.resolving
              ? t("approval.resolving")
              : t("approval.allowOnce")}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const initSettings = useSettingsStore((state) => state.init);
  const theme = useSettingsStore((state) => state.theme);
  const language = useSettingsStore((state) => state.language);
  const setupComplete = useSettingsStore((state) => state.setupComplete);
  const initGateway = useGatewayStore((state) => state.init);

  useEffect(() => {
    initSettings();
  }, [initSettings]);

  // Sync i18n language with persisted settings on mount
  useEffect(() => {
    if (language && language !== i18n.language) {
      i18n.changeLanguage(language);
    }
  }, [language]);

  // Initialize Gateway connection on mount
  useEffect(() => {
    initGateway();
  }, [initGateway]);

  // Redirect to setup wizard if not complete
  useEffect(() => {
    if (!setupComplete && !location.pathname.startsWith("/setup")) {
      navigate("/setup");
    }
  }, [setupComplete, location.pathname, navigate]);

  // Listen for navigation events from main process
  useEffect(() => {
    const handleNavigate = (...args: unknown[]) => {
      const path = args[0];
      if (typeof path === "string") {
        navigate(path);
      }
    };

    const unsubscribe = window.electron.ipcRenderer.on(
      "navigate",
      handleNavigate,
    );

    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [navigate]);

  // Apply theme
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");

    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? "dark"
        : "light";
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }
  }, [theme]);

  useEffect(() => {
    applyGatewayTransportPreference();
  }, []);

  return (
    <ErrorBoundary>
      <TooltipProvider delayDuration={300}>
        <Routes>
          {/* Setup wizard (shown on first launch) */}
          <Route path="/setup/*" element={<Setup />} />

          {/* Main application routes */}
          <Route element={<MainLayout />}>
            <Route path="/" element={<Chat />} />
            <Route path="/models" element={<Models />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/channels" element={<Channels />} />
            <Route path="/skills" element={<Skills />} />
            <Route path="/cron" element={<Cron />} />
            <Route path="/settings/*" element={<Settings />} />
          </Route>
        </Routes>

        <GatewayApprovalOverlay />

        {/* Global toast notifications */}
        <Toaster
          position="bottom-right"
          richColors
          closeButton
          style={{ zIndex: 99999 }}
        />
      </TooltipProvider>
    </ErrorBoundary>
  );
}

export default App;
