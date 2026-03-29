/**
 * Sidebar Component
 * Navigation sidebar with menu items.
 * No longer fixed - sits inside the flex layout below the title bar.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Settings as SettingsIcon,
  PanelLeftClose,
  PanelLeft,
  Plus,
  Terminal,
  ExternalLink,
  Trash2,
  Sparkles,
  Users,
  Wrench,
  Globe,
  Timer,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settings";
import { useChatStore } from "@/stores/chat";
import { useGatewayStore } from "@/stores/gateway";
import { useAgentsStore } from "@/stores/agents";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { hostApiFetch } from "@/lib/host-api";
import { useTranslation } from "react-i18next";
import logoSvg from "@/assets/logo.svg";

type SessionBucketKey =
  | "today"
  | "yesterday"
  | "withinWeek"
  | "withinTwoWeeks"
  | "withinMonth"
  | "older";

interface NavItemProps {
  to: string;
  icon: ReactNode;
  label: string;
  badge?: string;
  collapsed?: boolean;
  onClick?: () => void;
}

function NavItem({ to, icon, label, badge, collapsed, onClick }: NavItemProps) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          "group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[13px] font-medium transition-all",
          "text-foreground/75 hover:bg-accent/70 hover:text-foreground",
          isActive
            ? "bg-foreground/[0.06] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] dark:bg-white/[0.08]"
            : "",
          collapsed && "justify-center px-0",
        )
      }
    >
      {({ isActive }) => (
        <>
          <motion.div
            className={cn(
              "flex shrink-0 items-center justify-center rounded-full",
              isActive ? "text-foreground" : "text-muted-foreground",
            )}
            whileHover={{ y: -2 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
          >
            {icon}
          </motion.div>
          {!collapsed && (
            <>
              <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                {label}
              </span>
              {badge && (
                <Badge
                  variant="secondary"
                  className="ml-auto shrink-0 rounded-full border-0 bg-foreground/[0.06] px-2 py-0 text-[10px] text-foreground/70 dark:bg-white/[0.08]"
                >
                  {badge}
                </Badge>
              )}
            </>
          )}
        </>
      )}
    </NavLink>
  );
}

function getSessionBucket(activityMs: number, nowMs: number): SessionBucketKey {
  if (!activityMs || activityMs <= 0) return "older";

  const now = new Date(nowMs);
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;

  if (activityMs >= startOfToday) return "today";
  if (activityMs >= startOfYesterday) return "yesterday";

  const daysAgo = (startOfToday - activityMs) / (24 * 60 * 60 * 1000);
  if (daysAgo <= 7) return "withinWeek";
  if (daysAgo <= 14) return "withinTwoWeeks";
  if (daysAgo <= 30) return "withinMonth";
  return "older";
}

const INITIAL_NOW_MS = Date.now();

function getAgentIdFromSessionKey(sessionKey: string): string {
  if (!sessionKey.startsWith("agent:")) return "main";
  const [, agentId] = sessionKey.split(":");
  return agentId || "main";
}

export function Sidebar() {
  const sidebarCollapsed = useSettingsStore((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = useSettingsStore(
    (state) => state.setSidebarCollapsed,
  );

  const sessions = useChatStore((s) => s.sessions);
  const currentSessionKey = useChatStore((s) => s.currentSessionKey);
  const sessionLabels = useChatStore((s) => s.sessionLabels);
  const sessionLastActivity = useChatStore((s) => s.sessionLastActivity);
  const switchSession = useChatStore((s) => s.switchSession);
  const newSession = useChatStore((s) => s.newSession);
  const deleteSession = useChatStore((s) => s.deleteSession);
  const loadSessions = useChatStore((s) => s.loadSessions);
  const loadHistory = useChatStore((s) => s.loadHistory);

  const gatewayStatus = useGatewayStore((s) => s.status);
  const isGatewayRunning = gatewayStatus.state === "running";

  useEffect(() => {
    if (!isGatewayRunning) return;
    let cancelled = false;
    const hasExistingMessages = useChatStore.getState().messages.length > 0;
    (async () => {
      await loadSessions();
      if (cancelled) return;
      await loadHistory(hasExistingMessages);
    })();
    return () => {
      cancelled = true;
    };
  }, [isGatewayRunning, loadHistory, loadSessions]);
  const agents = useAgentsStore((s) => s.agents);
  const fetchAgents = useAgentsStore((s) => s.fetchAgents);

  const navigate = useNavigate();
  const isOnChat = useLocation().pathname === "/";

  const getSessionLabel = (key: string, displayName?: string, label?: string) =>
    sessionLabels[key] ?? label ?? displayName ?? key;

  const openDevConsole = async () => {
    try {
      const result = await hostApiFetch<{
        success: boolean;
        url?: string;
        error?: string;
      }>("/api/gateway/control-ui");
      if (result.success && result.url) {
        window.electron.openExternal(result.url);
      } else {
        console.error("Failed to get Dev Console URL:", result.error);
      }
    } catch (err) {
      console.error("Error opening Dev Console:", err);
    }
  };

  const { t } = useTranslation(["common", "chat"]);
  const [sessionToDelete, setSessionToDelete] = useState<{
    key: string;
    label: string;
  } | null>(null);
  const [nowMs, setNowMs] = useState(INITIAL_NOW_MS);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    void fetchAgents();
  }, [fetchAgents]);

  const agentNameById = useMemo(
    () => Object.fromEntries(agents.map((agent) => [agent.id, agent.name])),
    [agents],
  );
  const sessionBuckets: Array<{
    key: SessionBucketKey;
    label: string;
    sessions: typeof sessions;
  }> = [
    { key: "today", label: t("chat:historyBuckets.today"), sessions: [] },
    {
      key: "yesterday",
      label: t("chat:historyBuckets.yesterday"),
      sessions: [],
    },
    {
      key: "withinWeek",
      label: t("chat:historyBuckets.withinWeek"),
      sessions: [],
    },
    {
      key: "withinTwoWeeks",
      label: t("chat:historyBuckets.withinTwoWeeks"),
      sessions: [],
    },
    {
      key: "withinMonth",
      label: t("chat:historyBuckets.withinMonth"),
      sessions: [],
    },
    { key: "older", label: t("chat:historyBuckets.older"), sessions: [] },
  ];
  const sessionBucketMap = Object.fromEntries(
    sessionBuckets.map((bucket) => [bucket.key, bucket]),
  ) as Record<SessionBucketKey, (typeof sessionBuckets)[number]>;

  for (const session of [...sessions].sort(
    (a, b) =>
      (sessionLastActivity[b.key] ?? 0) - (sessionLastActivity[a.key] ?? 0),
  )) {
    const bucketKey = getSessionBucket(
      sessionLastActivity[session.key] ?? 0,
      nowMs,
    );
    sessionBucketMap[bucketKey].sessions.push(session);
  }

  const navItems = [
    {
      to: "/agents",
      icon: <Users className="h-[18px] w-[18px]" strokeWidth={2} />,
      label: t("sidebar.agents"),
    },
    {
      to: "/models",
      icon: <Sparkles className="h-[18px] w-[18px]" strokeWidth={2} />,
      label: t("sidebar.models"),
    },
    {
      to: "/channels",
      icon: <Globe className="h-[18px] w-[18px]" strokeWidth={2} />,
      label: t("sidebar.channels"),
    },
    {
      to: "/skills",
      icon: <Wrench className="h-[18px] w-[18px]" strokeWidth={2} />,
      label: t("sidebar.skills"),
    },
    {
      to: "/cron",
      icon: <Timer className="h-[18px] w-[18px]" strokeWidth={2} />,
      label: t("sidebar.cronTasks"),
    },
  ];
  const navGroups = [
    { title: "Workspace", items: navItems.slice(0, 3) },
    { title: "Automation", items: navItems.slice(3) },
  ];

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col rounded-[32px] border border-border/70 bg-background/70 p-3 shadow-[0_24px_80px_rgba(15,23,42,0.05)] backdrop-blur-2xl transition-all duration-300 dark:shadow-[0_24px_80px_rgba(0,0,0,0.22)]",
        sidebarCollapsed ? "w-[88px]" : "w-[300px]",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 px-1 pb-3",
          sidebarCollapsed ? "justify-center" : "justify-between",
        )}
      >
        {!sidebarCollapsed && (
          <motion.div
            className="flex min-w-0 items-center gap-3 overflow-hidden rounded-[24px] border border-border/70 bg-background/75 px-3 py-2 shadow-sm"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1, duration: 0.4 }}
          >
            <motion.img
              src={logoSvg}
              alt="UfrenClaw"
              className="h-8 w-8 shrink-0 rounded-2xl bg-background p-1.5 shadow-sm"
              animate={{ y: [0, -2, 0] }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
            />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-foreground/90">
                UfrenClaw
              </div>
              <div className="truncate pt-1 text-[11px] text-muted-foreground">
                Mac Workspace
              </div>
            </div>
          </motion.div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0 rounded-full border border-border/70 bg-background/70 text-muted-foreground hover:bg-accent/80 hover:text-foreground"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        >
          {sidebarCollapsed ? (
            <PanelLeft className="h-[18px] w-[18px]" />
          ) : (
            <PanelLeftClose className="h-[18px] w-[18px]" />
          )}
        </Button>
      </div>

      <div className="space-y-3">
        <motion.button
          onClick={() => {
            const { messages } = useChatStore.getState();
            if (messages.length > 0) newSession();
            navigate("/");
          }}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-[22px] border border-border/70 bg-foreground px-3.5 py-3 text-[13px] font-medium text-background shadow-sm transition-all hover:scale-[0.99]",
            sidebarCollapsed && "justify-center px-0",
          )}
          whileHover={{ x: 2 }}
          whileTap={{ scale: 0.98 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
        >
          <motion.div
            className="flex shrink-0 items-center justify-center text-background/90"
            whileHover={{ rotate: 90 }}
            transition={{ type: "spring", stiffness: 400, damping: 15 }}
          >
            <Plus className="h-[18px] w-[18px]" strokeWidth={2} />
          </motion.div>
          {!sidebarCollapsed && (
            <span className="flex-1 text-left overflow-hidden text-ellipsis whitespace-nowrap">
              {t("sidebar.newChat")}
            </span>
          )}
        </motion.button>
        <div className="space-y-2">
          {navGroups.map((group) => (
            <div
              key={group.title}
              className="rounded-[24px] border border-border/60 bg-background/55 p-2"
            >
              {!sidebarCollapsed && (
                <div className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/70">
                  {group.title}
                </div>
              )}
              <nav className="flex flex-col gap-1">
                {group.items.map((item) => (
                  <NavItem
                    key={item.to}
                    {...item}
                    collapsed={sidebarCollapsed}
                  />
                ))}
              </nav>
            </div>
          ))}
        </div>
      </div>

      {!sidebarCollapsed && sessions.length > 0 && (
        <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[24px] border border-border/60 bg-background/55 p-2">
          <div className="flex items-center justify-between px-2 pb-2 pt-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/70">
              Recents
            </div>
            <Badge
              variant="secondary"
              className="rounded-full border-0 bg-foreground/[0.06] px-2 py-0 text-[10px] text-foreground/70 dark:bg-white/[0.08]"
            >
              {sessions.length}
            </Badge>
          </div>
          <div className="flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden pb-1">
            {sessionBuckets.map((bucket) =>
              bucket.sessions.length > 0 ? (
                <div key={bucket.key} className="pt-2">
                  <div className="px-2.5 pb-1 text-[11px] font-medium tracking-tight text-muted-foreground/60">
                    {bucket.label}
                  </div>
                  {bucket.sessions.map((s) => {
                    const agentId = getAgentIdFromSessionKey(s.key);
                    const agentName = agentNameById[agentId] || agentId;
                    return (
                      <div
                        key={s.key}
                        className="group relative flex items-center"
                      >
                        <button
                          onClick={() => {
                            switchSession(s.key);
                            navigate("/");
                          }}
                          className={cn(
                            "w-full rounded-2xl px-3 py-2 pr-8 text-left text-[12.5px] transition-colors",
                            "hover:bg-accent/70",
                            isOnChat && currentSessionKey === s.key
                              ? "bg-foreground/[0.06] font-medium text-foreground dark:bg-white/[0.08]"
                              : "text-foreground/75",
                          )}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="shrink-0 rounded-full bg-foreground/[0.05] px-2 py-0.5 text-[10px] font-medium text-foreground/70 dark:bg-white/[0.08]">
                              {agentName}
                            </span>
                            <span className="truncate">
                              {getSessionLabel(s.key, s.displayName, s.label)}
                            </span>
                          </div>
                        </button>
                        <button
                          aria-label="Delete session"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSessionToDelete({
                              key: s.key,
                              label: getSessionLabel(
                                s.key,
                                s.displayName,
                                s.label,
                              ),
                            });
                          }}
                          className={cn(
                            "absolute right-2 flex items-center justify-center rounded-full p-1 transition-opacity",
                            "opacity-0 group-hover:opacity-100",
                            "text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
                          )}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : null,
            )}
          </div>
        </div>
      )}

      <div className="mt-3 rounded-[24px] border border-border/60 bg-background/55 p-2">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[13px] font-medium transition-all",
              "text-foreground/75 hover:bg-accent/70 hover:text-foreground",
              isActive &&
                "bg-foreground/[0.06] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] dark:bg-white/[0.08]",
              sidebarCollapsed ? "justify-center px-0" : "",
            )
          }
        >
          {({ isActive }) => (
            <>
              <div
                className={cn(
                  "flex shrink-0 items-center justify-center",
                  isActive ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <SettingsIcon className="h-[18px] w-[18px]" strokeWidth={2} />
              </div>
              {!sidebarCollapsed && (
                <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                  {t("sidebar.settings")}
                </span>
              )}
            </>
          )}
        </NavLink>

        <Button
          variant="ghost"
          className={cn(
            "mt-1 flex h-auto w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-[13px] font-medium text-foreground/75 transition-all hover:bg-accent/70 hover:text-foreground",
            sidebarCollapsed ? "justify-center px-0" : "justify-start",
          )}
          onClick={openDevConsole}
        >
          <div className="flex shrink-0 items-center justify-center text-muted-foreground">
            <Terminal className="h-[18px] w-[18px]" strokeWidth={2} />
          </div>
          {!sidebarCollapsed && (
            <>
              <span className="flex-1 text-left overflow-hidden text-ellipsis whitespace-nowrap">
                {t("common:sidebar.openClawPage")}
              </span>
              <ExternalLink className="h-3 w-3 shrink-0 ml-auto opacity-50 text-muted-foreground" />
            </>
          )}
        </Button>
      </div>

      <ConfirmDialog
        open={!!sessionToDelete}
        title={t("common:actions.confirm")}
        message={t("common:sidebar.deleteSessionConfirm", {
          label: sessionToDelete?.label,
        })}
        confirmLabel={t("common:actions.delete")}
        cancelLabel={t("common:actions.cancel")}
        variant="destructive"
        onConfirm={async () => {
          if (!sessionToDelete) return;
          await deleteSession(sessionToDelete.key);
          if (currentSessionKey === sessionToDelete.key) navigate("/");
          setSessionToDelete(null);
        }}
        onCancel={() => setSessionToDelete(null)}
      />
    </aside>
  );
}
