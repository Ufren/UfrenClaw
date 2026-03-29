import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertCircle,
  Bot,
  Check,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatusBadge } from "@/components/common/StatusBadge";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ChannelConfigModal } from "@/components/channels/ChannelConfigModal";
import {
  WorkspacePage,
  WorkspacePanel,
  WorkspacePanelHeader,
} from "@/components/layout/WorkspacePage";
import { useAgentsStore } from "@/stores/agents";
import { useChannelsStore } from "@/stores/channels";
import { useGatewayStore } from "@/stores/gateway";
import {
  CHANNEL_ICONS,
  CHANNEL_NAMES,
  type ChannelType,
} from "@/types/channel";
import type { AgentSummary } from "@/types/agent";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import telegramIcon from "@/assets/channels/telegram.svg";
import discordIcon from "@/assets/channels/discord.svg";
import whatsappIcon from "@/assets/channels/whatsapp.svg";
import dingtalkIcon from "@/assets/channels/dingtalk.svg";
import feishuIcon from "@/assets/channels/feishu.svg";
import wecomIcon from "@/assets/channels/wecom.svg";
import qqIcon from "@/assets/channels/qq.svg";

export function Agents() {
  const { t } = useTranslation("agents");
  const gatewayStatus = useGatewayStore((state) => state.status);
  const { agents, loading, error, fetchAgents, createAgent, deleteAgent } =
    useAgentsStore();
  const { channels, fetchChannels } = useChannelsStore();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [settingsAgentId, setSettingsAgentId] = useState<string | null>(null);
  const [agentToDelete, setAgentToDelete] = useState<AgentSummary | null>(null);

  useEffect(() => {
    void Promise.all([fetchAgents(), fetchChannels()]);
  }, [fetchAgents, fetchChannels]);
  const activeAgent = useMemo(
    () => agents.find((agent) => agent.id === activeAgentId) ?? null,
    [activeAgentId, agents],
  );
  const settingsAgent = useMemo(
    () => agents.find((agent) => agent.id === settingsAgentId) ?? null,
    [agents, settingsAgentId],
  );
  const handleRefresh = () => {
    void Promise.all([fetchAgents(), fetchChannels()]);
  };

  useEffect(() => {
    if (agents.length === 0) {
      setActiveAgentId(null);
      return;
    }

    if (!activeAgentId || !agents.some((agent) => agent.id === activeAgentId)) {
      setActiveAgentId(agents[0].id);
    }
  }, [activeAgentId, agents]);

  const connectedChannels = channels.filter(
    (channel) => channel.status === "connected",
  ).length;

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
        eyebrow={t("workspace")}
        title={t("title")}
        description={t("subtitle")}
        actions={
          <>
            <Button
              variant="outline"
              onClick={handleRefresh}
              className="h-9 rounded-full border-border/70 bg-background/70 px-4 text-[13px] font-medium text-foreground/80 shadow-none hover:bg-accent/80 hover:text-foreground"
            >
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
              {t("refresh")}
            </Button>
            <Button
              onClick={() => setShowAddDialog(true)}
              className="h-9 rounded-full px-4 text-[13px] font-medium shadow-none"
            >
              <Plus className="mr-2 h-3.5 w-3.5" />
              {t("addAgent")}
            </Button>
          </>
        }
        aside={
          <div className="space-y-4">
            <WorkspacePanel className="space-y-4">
              <WorkspacePanelHeader
                title={activeAgent?.name || t("title")}
                description={
                  activeAgent
                    ? t("modelLine", {
                        model: activeAgent.modelDisplay,
                        suffix: activeAgent.inheritedModel
                          ? ` (${t("inherited")})`
                          : "",
                      })
                    : t("subtitle")
                }
              />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
                    {t("overview.agents")}
                  </div>
                  <div className="pt-2 text-2xl font-semibold text-foreground">
                    {agents.length}
                  </div>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
                    {t("overview.channels")}
                  </div>
                  <div className="pt-2 text-2xl font-semibold text-foreground">
                    {connectedChannels}/{channels.length}
                  </div>
                </div>
              </div>
              {activeAgent ? (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
                      {t("overview.agentId")}
                    </div>
                    <div className="pt-2 font-mono text-[13px] text-foreground">
                      {activeAgent.id}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
                      {t("overview.channels")}
                    </div>
                    <div className="pt-3 flex flex-wrap gap-2">
                      {activeAgent.channelTypes.length > 0 ? (
                        activeAgent.channelTypes.map((channelType) => (
                          <Badge
                            key={channelType}
                            variant="secondary"
                            className="rounded-full border-0 bg-foreground/[0.06] px-2.5 py-1 text-[11px] text-foreground/75 dark:bg-white/[0.08]"
                          >
                            {CHANNEL_NAMES[channelType as ChannelType] ||
                              channelType}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          {t("none")}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    className="h-10 w-full rounded-full border-border/70 bg-background/70 text-[13px] font-medium shadow-none hover:bg-accent/80"
                    onClick={() => setSettingsAgentId(activeAgent.id)}
                  >
                    <Settings2 className="mr-2 h-4 w-4" />
                    {t("settings")}
                  </Button>
                </div>
              ) : null}
            </WorkspacePanel>
          </div>
        }
      >
        <div className="flex h-full min-h-0 flex-col gap-4">
          {gatewayStatus.state !== "running" && (
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
              title={t("overview.libraryTitle")}
              description={t("overview.libraryDescription")}
            />
            <motion.div
              className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1"
              variants={{
                hidden: { opacity: 0 },
                show: {
                  opacity: 1,
                  transition: { staggerChildren: 0.12 },
                },
              }}
              initial="hidden"
              animate="show"
            >
              {agents.map((agent) => (
                <motion.div
                  key={agent.id}
                  variants={{
                    hidden: { opacity: 0, y: 15 },
                    show: {
                      opacity: 1,
                      y: 0,
                      transition: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] },
                    },
                  }}
                >
                  <AgentCard
                    agent={agent}
                    active={activeAgentId === agent.id}
                    onSelect={() => setActiveAgentId(agent.id)}
                    onOpenSettings={() => setSettingsAgentId(agent.id)}
                    onDelete={() => setAgentToDelete(agent)}
                  />
                </motion.div>
              ))}
            </motion.div>
          </WorkspacePanel>
        </div>
      </WorkspacePage>

      {showAddDialog && (
        <AddAgentDialog
          onClose={() => setShowAddDialog(false)}
          onCreate={async (name) => {
            await createAgent(name);
            setShowAddDialog(false);
            toast.success(t("toast.agentCreated"));
          }}
        />
      )}

      {settingsAgent && (
        <AgentSettingsModal
          agent={settingsAgent}
          channels={channels}
          onClose={() => setSettingsAgentId(null)}
        />
      )}

      <ConfirmDialog
        open={!!agentToDelete}
        title={t("deleteDialog.title")}
        message={
          agentToDelete
            ? t("deleteDialog.message", { name: agentToDelete.name })
            : ""
        }
        confirmLabel={t("common:actions.delete")}
        cancelLabel={t("common:actions.cancel")}
        variant="destructive"
        onConfirm={async () => {
          if (!agentToDelete) return;
          await deleteAgent(agentToDelete.id);
          setAgentToDelete(null);
          if (activeAgentId === agentToDelete.id) {
            setActiveAgentId(null);
          }
          toast.success(t("toast.agentDeleted"));
        }}
        onCancel={() => setAgentToDelete(null)}
      />
    </>
  );
}

function AgentCard({
  agent,
  active,
  onSelect,
  onOpenSettings,
  onDelete,
}: {
  agent: AgentSummary;
  active: boolean;
  onSelect: () => void;
  onOpenSettings: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation("agents");
  const channelsText =
    agent.channelTypes.length > 0
      ? agent.channelTypes
          .map(
            (channelType) =>
              CHANNEL_NAMES[channelType as ChannelType] || channelType,
          )
          .join(", ")
      : t("none");

  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      onClick={onSelect}
      className={cn(
        "group flex cursor-pointer items-start gap-4 rounded-[24px] border p-4 text-left transition-all",
        active
          ? "border-border bg-foreground/[0.06] shadow-sm dark:bg-white/[0.08]"
          : "border-border/60 bg-background/55 hover:bg-accent/60",
        agent.isDefault &&
          !active &&
          "bg-foreground/[0.04] dark:bg-white/[0.06]",
      )}
    >
      <motion.div
        className="h-[46px] w-[46px] shrink-0 flex items-center justify-center text-primary bg-primary/10 rounded-full shadow-sm"
        whileHover={{ rotate: [0, -5, 5, 0] }}
        transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
      >
        <Bot className="h-[22px] w-[22px]" />
      </motion.div>
      <div className="flex flex-col flex-1 min-w-0 py-0.5 mt-1">
        <div className="flex items-center justify-between gap-3 mb-1">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-[16px] font-semibold text-foreground truncate">
              {agent.name}
            </h2>
            {agent.isDefault && (
              <Badge
                variant="secondary"
                className="flex items-center gap-1 font-mono text-[10px] font-medium px-2 py-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.08] border-0 shadow-none text-foreground/70"
              >
                <Check className="h-3 w-3" />
                {t("defaultBadge")}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {!agent.isDefault && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete();
                }}
                title={t("deleteAgent")}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-7 w-7 text-muted-foreground transition-all hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10",
                !agent.isDefault && "opacity-0 group-hover:opacity-100",
              )}
              onClick={(event) => {
                event.stopPropagation();
                onOpenSettings();
              }}
              title={t("settings")}
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <p className="text-[13.5px] text-muted-foreground line-clamp-2 leading-[1.5]">
          {t("modelLine", {
            model: agent.modelDisplay,
            suffix: agent.inheritedModel ? ` (${t("inherited")})` : "",
          })}
        </p>
        <p className="text-[13.5px] text-muted-foreground line-clamp-2 leading-[1.5]">
          {t("channelsLine", { channels: channelsText })}
        </p>
      </div>
    </motion.div>
  );
}

const inputClasses =
  "h-[44px] rounded-xl font-mono text-[13px] bg-black/5 dark:bg-white/5 border-transparent focus:bg-white dark:focus:bg-black/10 focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:border-blue-500 shadow-sm transition-all text-foreground placeholder:text-foreground/40";
const labelClasses = "text-[14px] text-foreground/80 font-bold";

function ChannelLogo({ type }: { type: ChannelType }) {
  switch (type) {
    case "telegram":
      return (
        <img
          src={telegramIcon}
          alt="Telegram"
          className="w-[20px] h-[20px] dark:invert"
        />
      );
    case "discord":
      return (
        <img
          src={discordIcon}
          alt="Discord"
          className="w-[20px] h-[20px] dark:invert"
        />
      );
    case "whatsapp":
      return (
        <img
          src={whatsappIcon}
          alt="WhatsApp"
          className="w-[20px] h-[20px] dark:invert"
        />
      );
    case "dingtalk":
      return (
        <img
          src={dingtalkIcon}
          alt="DingTalk"
          className="w-[20px] h-[20px] dark:invert"
        />
      );
    case "feishu":
      return (
        <img
          src={feishuIcon}
          alt="Feishu"
          className="w-[20px] h-[20px] dark:invert"
        />
      );
    case "wecom":
      return (
        <img
          src={wecomIcon}
          alt="WeCom"
          className="w-[20px] h-[20px] dark:invert"
        />
      );
    case "qqbot":
      return (
        <img src={qqIcon} alt="QQ" className="w-[20px] h-[20px] dark:invert" />
      );
    default:
      return (
        <span className="text-[20px] leading-none">
          {CHANNEL_ICONS[type] || "💬"}
        </span>
      );
  }
}

function AddAgentDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const { t } = useTranslation("agents");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onCreate(name.trim());
    } catch (error) {
      toast.error(t("toast.agentCreateFailed", { error: String(error) }));
      setSaving(false);
      return;
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md rounded-3xl border-0 shadow-2xl bg-card overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-2xl font-serif font-normal tracking-tight">
            {t("createDialog.title")}
          </CardTitle>
          <CardDescription className="text-[15px] mt-1 text-foreground/70">
            {t("createDialog.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-4 p-6">
          <div className="space-y-2.5">
            <Label htmlFor="agent-name" className={labelClasses}>
              {t("createDialog.nameLabel")}
            </Label>
            <Input
              id="agent-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("createDialog.namePlaceholder")}
              className={inputClasses}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={onClose}
              className="h-9 text-[13px] font-medium rounded-full px-4 border-black/10 dark:border-white/10 bg-transparent hover:bg-black/5 dark:hover:bg-white/5 shadow-none text-foreground/80 hover:text-foreground"
            >
              {t("common:actions.cancel")}
            </Button>
            <Button
              onClick={() => void handleSubmit()}
              disabled={saving || !name.trim()}
              className="h-9 text-[13px] font-medium rounded-full px-4 shadow-none"
            >
              {saving ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  {t("creating")}
                </>
              ) : (
                t("common:actions.save")
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AgentSettingsModal({
  agent,
  channels,
  onClose,
}: {
  agent: AgentSummary;
  channels: Array<{
    type: string;
    name: string;
    status: "connected" | "connecting" | "disconnected" | "error";
    error?: string;
  }>;
  onClose: () => void;
}) {
  const { t } = useTranslation("agents");
  const { updateAgent, assignChannel, removeChannel } = useAgentsStore();
  const { fetchChannels } = useChannelsStore();
  const [name, setName] = useState(agent.name);
  const [savingName, setSavingName] = useState(false);
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [channelToRemove, setChannelToRemove] = useState<ChannelType | null>(
    null,
  );

  useEffect(() => {
    setName(agent.name);
  }, [agent.name]);

  const runtimeChannelsByType = useMemo(
    () =>
      Object.fromEntries(channels.map((channel) => [channel.type, channel])),
    [channels],
  );

  const handleSaveName = async () => {
    if (!name.trim() || name.trim() === agent.name) return;
    setSavingName(true);
    try {
      await updateAgent(agent.id, name.trim());
      toast.success(t("toast.agentUpdated"));
    } catch (error) {
      toast.error(t("toast.agentUpdateFailed", { error: String(error) }));
    } finally {
      setSavingName(false);
    }
  };

  const handleChannelSaved = async (channelType: ChannelType) => {
    try {
      await assignChannel(agent.id, channelType);
      await fetchChannels();
      toast.success(
        t("toast.channelAssigned", {
          channel: CHANNEL_NAMES[channelType] || channelType,
        }),
      );
    } catch (error) {
      toast.error(t("toast.channelAssignFailed", { error: String(error) }));
      throw error;
    }
  };

  const assignedChannels = agent.channelTypes.map((channelType) => {
    const runtimeChannel = runtimeChannelsByType[channelType];
    return {
      channelType: channelType as ChannelType,
      name:
        runtimeChannel?.name ||
        CHANNEL_NAMES[channelType as ChannelType] ||
        channelType,
      status: runtimeChannel?.status || "disconnected",
      error: runtimeChannel?.error,
    };
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl border-0 shadow-2xl bg-card dark:bg-card overflow-hidden">
        <CardHeader className="flex flex-row items-start justify-between pb-2 shrink-0">
          <div>
            <CardTitle className="text-2xl font-serif font-normal tracking-tight">
              {t("settingsDialog.title", { name: agent.name })}
            </CardTitle>
            <CardDescription className="text-[15px] mt-1 text-foreground/70">
              {t("settingsDialog.description")}
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
          <div className="space-y-4">
            <div className="space-y-2.5">
              <Label htmlFor="agent-settings-name" className={labelClasses}>
                {t("settingsDialog.nameLabel")}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="agent-settings-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  readOnly={agent.isDefault}
                  className={inputClasses}
                />
                {!agent.isDefault && (
                  <Button
                    variant="outline"
                    onClick={() => void handleSaveName()}
                    disabled={
                      savingName || !name.trim() || name.trim() === agent.name
                    }
                    className="h-[44px] text-[13px] font-medium rounded-xl px-4 border-black/10 dark:border-white/10 bg-black/5 dark:bg-muted hover:bg-black/5 dark:hover:bg-white/5 shadow-none text-foreground/80 hover:text-foreground"
                  >
                    {savingName ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      t("common:actions.save")
                    )}
                  </Button>
                )}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1 rounded-2xl bg-black/5 dark:bg-white/5 border border-transparent p-4">
                <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground/80 font-medium">
                  {t("settingsDialog.agentIdLabel")}
                </p>
                <p className="font-mono text-[13px] text-foreground">
                  {agent.id}
                </p>
              </div>
              <div className="space-y-1 rounded-2xl bg-black/5 dark:bg-white/5 border border-transparent p-4">
                <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground/80 font-medium">
                  {t("settingsDialog.modelLabel")}
                </p>
                <p className="text-[13.5px] text-foreground">
                  {agent.modelDisplay}
                  {agent.inheritedModel ? ` (${t("inherited")})` : ""}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-serif text-foreground font-normal tracking-tight">
                  {t("settingsDialog.channelsTitle")}
                </h3>
                <p className="text-[14px] text-foreground/70 mt-1">
                  {t("settingsDialog.channelsDescription")}
                </p>
              </div>
              <Button
                onClick={() => setShowChannelModal(true)}
                className="h-9 text-[13px] font-medium rounded-full px-4 shadow-none"
              >
                <Plus className="h-3.5 w-3.5 mr-2" />
                {t("settingsDialog.addChannel")}
              </Button>
            </div>

            {assignedChannels.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 p-4 text-[13.5px] text-muted-foreground">
                {t("settingsDialog.noChannels")}
              </div>
            ) : (
              <div className="space-y-3">
                {assignedChannels.map((channel) => (
                  <div
                    key={channel.channelType}
                    className="flex items-center justify-between rounded-2xl bg-black/5 dark:bg-white/5 border border-transparent p-4"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-[40px] w-[40px] shrink-0 flex items-center justify-center text-foreground bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-full shadow-sm">
                        <ChannelLogo type={channel.channelType} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[15px] font-semibold text-foreground">
                          {channel.name}
                        </p>
                        <p className="text-[13.5px] text-muted-foreground">
                          {CHANNEL_NAMES[channel.channelType]}
                        </p>
                        {channel.error && (
                          <p className="text-xs text-destructive mt-1">
                            {channel.error}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge status={channel.status} />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setChannelToRemove(channel.channelType)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {showChannelModal && (
        <ChannelConfigModal
          configuredTypes={agent.channelTypes}
          showChannelName={false}
          allowExistingConfig
          agentId={agent.id}
          onClose={() => setShowChannelModal(false)}
          onChannelSaved={async (channelType) => {
            await handleChannelSaved(channelType);
            setShowChannelModal(false);
          }}
        />
      )}

      <ConfirmDialog
        open={!!channelToRemove}
        title={t("removeChannelDialog.title")}
        message={
          channelToRemove
            ? t("removeChannelDialog.message", {
                name: CHANNEL_NAMES[channelToRemove] || channelToRemove,
              })
            : ""
        }
        confirmLabel={t("common:actions.delete")}
        cancelLabel={t("common:actions.cancel")}
        variant="destructive"
        onConfirm={async () => {
          if (!channelToRemove) return;
          try {
            await removeChannel(agent.id, channelToRemove);
            await fetchChannels();
            toast.success(
              t("toast.channelRemoved", {
                channel: CHANNEL_NAMES[channelToRemove] || channelToRemove,
              }),
            );
          } catch (error) {
            toast.error(
              t("toast.channelRemoveFailed", { error: String(error) }),
            );
          } finally {
            setChannelToRemove(null);
          }
        }}
        onCancel={() => setChannelToRemove(null)}
      />
    </div>
  );
}

export default Agents;
