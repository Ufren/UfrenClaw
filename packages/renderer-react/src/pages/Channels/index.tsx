import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AlertCircle, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useChannelsStore } from "@/stores/channels";
import { useGatewayStore } from "@/stores/gateway";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { hostApiFetch } from "@/lib/host-api";
import { subscribeHostEvent } from "@/lib/host-events";
import { ChannelConfigModal } from "@/components/channels/ChannelConfigModal";
import { cn } from "@/lib/utils";
import {
  WorkspacePage,
  WorkspacePanel,
  WorkspacePanelHeader,
} from "@/components/layout/WorkspacePage";
import {
  createStaggeredList,
  getHoverLift,
  getTapScale,
  motionTransition,
  motionVariants,
} from "@/lib/motion";
import {
  CHANNEL_ICONS,
  CHANNEL_NAMES,
  CHANNEL_META,
  getPrimaryChannels,
  type ChannelType,
  type Channel,
} from "@/types/channel";
import { useTranslation } from "react-i18next";

import telegramIcon from "@/assets/channels/telegram.svg";
import discordIcon from "@/assets/channels/discord.svg";
import whatsappIcon from "@/assets/channels/whatsapp.svg";
import dingtalkIcon from "@/assets/channels/dingtalk.svg";
import feishuIcon from "@/assets/channels/feishu.svg";
import wecomIcon from "@/assets/channels/wecom.svg";
import qqIcon from "@/assets/channels/qq.svg";

export function Channels() {
  const { t } = useTranslation(["channels", "common"]);
  const prefersReducedMotion = useReducedMotion() ?? false;
  const { channels, loading, error, fetchChannels, deleteChannel } =
    useChannelsStore();
  const gatewayStatus = useGatewayStore((state) => state.status);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedChannelType, setSelectedChannelType] =
    useState<ChannelType | null>(null);
  const [configuredTypes, setConfiguredTypes] = useState<string[]>([]);
  const [channelToDelete, setChannelToDelete] = useState<{ id: string } | null>(
    null,
  );

  useEffect(() => {
    void fetchChannels();
  }, [fetchChannels]);

  const fetchConfiguredTypes = useCallback(async () => {
    try {
      const result = await hostApiFetch<{
        success: boolean;
        channels?: string[];
      }>("/api/channels/configured");
      if (result.success && result.channels) {
        setConfiguredTypes(result.channels);
      }
    } catch {
      // Ignore refresh errors here and keep the last known state.
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchConfiguredTypes();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchConfiguredTypes]);

  useEffect(() => {
    const unsubscribe = subscribeHostEvent("gateway:channel-status", () => {
      void fetchChannels();
      void fetchConfiguredTypes();
    });
    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, [fetchChannels, fetchConfiguredTypes]);

  const displayedChannelTypes = useMemo(() => getPrimaryChannels(), []);

  const handleRefresh = () => {
    void Promise.all([fetchChannels(), fetchConfiguredTypes()]);
  };

  const openChannelDialog = useCallback((type: ChannelType | null = null) => {
    setSelectedChannelType(type);
    setShowAddDialog(true);
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col -m-6 dark:bg-background min-h-[calc(100vh-2.5rem)] items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const safeChannels = Array.isArray(channels) ? channels : [];
  const configuredPlaceholderChannels: Channel[] = displayedChannelTypes
    .filter(
      (type) =>
        configuredTypes.includes(type) &&
        !safeChannels.some((channel) => channel.type === type),
    )
    .map((type) => ({
      id: `${type}-default`,
      type,
      name: CHANNEL_NAMES[type] || CHANNEL_META[type].name,
      status: "disconnected",
    }));
  const availableChannels = [...safeChannels, ...configuredPlaceholderChannels];
  const connectedCount = safeChannels.filter(
    (channel) => channel.status === "connected",
  ).length;
  const attentionCount = availableChannels.filter(
    (channel) =>
      channel.status === "error" || channel.status === "disconnected",
  ).length;
  const discoverableChannels = displayedChannelTypes.filter(
    (type) => !availableChannels.some((channel) => channel.type === type),
  );
  const stats = [
    {
      label: t("stats.total"),
      value: displayedChannelTypes.length,
      hint: t("supportedChannels"),
    },
    {
      label: t("configured"),
      value: availableChannels.length,
      hint: t("configuredDesc"),
    },
    {
      label: t("stats.connected"),
      value: connectedCount,
      hint: t("overviewDesc"),
    },
    {
      label: t("overviewAttention"),
      value: attentionCount,
      hint: attentionCount > 0 ? t("tipsDisconnected") : t("tipsHealthy"),
    },
  ];
  const aside = (
    <div className="space-y-4">
      <WorkspacePanel className="space-y-4">
        <WorkspacePanelHeader
          title={t("overviewTitle")}
          description={t("overviewDesc")}
        />
        <div className="grid gap-3">
          <ChannelInsightRow
            label={t("common:sidebar.channels")}
            value={String(availableChannels.length)}
          />
          <ChannelInsightRow
            label={t("stats.connected")}
            value={String(connectedCount)}
            tone={connectedCount > 0 ? "positive" : "muted"}
          />
          <ChannelInsightRow
            label={t("availableChannels")}
            value={String(discoverableChannels.length)}
          />
          <ChannelInsightRow
            label={t("overviewAttention")}
            value={String(attentionCount)}
            tone={attentionCount > 0 ? "warning" : "positive"}
          />
        </div>
      </WorkspacePanel>
      <WorkspacePanel className="space-y-4">
        <WorkspacePanelHeader
          title={t("tipsTitle")}
          description={
            gatewayStatus.state === "running"
              ? t("tipsHealthy")
              : t("tipsGatewayDown")
          }
        />
        <div className="space-y-3">
          <div className="rounded-2xl border border-border/70 bg-background/55 p-4 text-[13px] leading-6 text-muted-foreground">
            {gatewayStatus.state !== "running"
              ? t("tipsGatewayDown")
              : availableChannels.length === 0
                ? t("tipsFirstChannel")
                : attentionCount > 0
                  ? t("tipsDisconnected")
                  : t("tipsHealthy")}
          </div>
          <motion.div whileTap={getTapScale(prefersReducedMotion)}>
            <Button
              onClick={() => openChannelDialog(null)}
              className="h-10 w-full rounded-full px-4 text-[13px] shadow-none"
            >
              <Plus className="mr-2 h-4 w-4" />
              {t("addChannel")}
            </Button>
          </motion.div>
        </div>
      </WorkspacePanel>
    </div>
  );

  return (
    <>
      <WorkspacePage
        eyebrow={t("common:sidebar.channels")}
        title={t("title")}
        description={t("subtitle")}
        actions={
          <>
            <motion.div whileTap={getTapScale(prefersReducedMotion)}>
              <Button
                variant="outline"
                onClick={handleRefresh}
                disabled={gatewayStatus.state !== "running"}
                className="h-10 rounded-full border-border/70 bg-background/70 px-4 text-[13px] shadow-none hover:bg-accent/80"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                {t("refresh")}
              </Button>
            </motion.div>
            <motion.div whileTap={getTapScale(prefersReducedMotion)}>
              <Button
                onClick={() => openChannelDialog(null)}
                className="h-10 rounded-full px-4 text-[13px] shadow-none"
              >
                <Plus className="mr-2 h-4 w-4" />
                {t("addChannel")}
              </Button>
            </motion.div>
          </>
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
          {stats.map((stat) => (
            <motion.div key={stat.label} variants={motionVariants.softScale}>
              <ChannelStatCard
                label={stat.label}
                value={String(stat.value)}
                hint={stat.hint}
                prefersReducedMotion={prefersReducedMotion}
              />
            </motion.div>
          ))}
        </motion.div>

        {gatewayStatus.state !== "running" ? (
          <div className="flex items-center gap-3 rounded-[24px] border border-yellow-500/40 bg-yellow-500/10 px-4 py-3">
            <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            <span className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
              {t("gatewayWarning")}
            </span>
          </div>
        ) : null}

        {error ? (
          <div className="flex items-center gap-3 rounded-[24px] border border-destructive/40 bg-destructive/10 px-4 py-3">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <span className="text-sm font-medium text-destructive">
              {error}
            </span>
          </div>
        ) : null}

        <WorkspacePanel className="space-y-4">
          <WorkspacePanelHeader
            title={t("configured")}
            description={t("configuredDesc")}
            action={
              <Badge
                variant="secondary"
                className="rounded-full border-0 bg-primary/10 px-3 py-1 text-[11px] text-primary"
              >
                {availableChannels.length}
              </Badge>
            }
          />
          {availableChannels.length > 0 ? (
            <motion.div
              initial="hidden"
              animate="show"
              variants={createStaggeredList(prefersReducedMotion ? 0 : 0.04)}
              className="grid gap-4 md:grid-cols-2"
            >
              {availableChannels.map((channel) => (
                <motion.div key={channel.id} variants={motionVariants.fadeUp}>
                  <ChannelCard
                    channel={channel}
                    onClick={() => openChannelDialog(channel.type)}
                    onDelete={() => setChannelToDelete({ id: channel.id })}
                    prefersReducedMotion={prefersReducedMotion}
                  />
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <div className="flex min-h-[240px] flex-col items-center justify-center rounded-[28px] border border-dashed border-border/70 bg-background/40 px-6 py-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Sparkles className="h-6 w-6" />
              </div>
              <div className="mt-4 text-lg font-semibold text-foreground">
                {t("emptyConfiguredTitle")}
              </div>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                {t("emptyConfiguredDesc")}
              </p>
              <motion.div
                className="mt-5"
                whileTap={getTapScale(prefersReducedMotion)}
              >
                <Button
                  onClick={() => openChannelDialog(null)}
                  className="h-10 rounded-full px-5 text-[13px] shadow-none"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {t("addChannel")}
                </Button>
              </motion.div>
            </div>
          )}
        </WorkspacePanel>

        <WorkspacePanel className="space-y-4">
          <WorkspacePanelHeader
            title={t("available")}
            description={t("availableDesc")}
            action={
              <Badge
                variant="secondary"
                className="rounded-full border-0 bg-background/70 px-3 py-1 text-[11px] text-muted-foreground"
              >
                {discoverableChannels.length}
              </Badge>
            }
          />
          {discoverableChannels.length > 0 ? (
            <motion.div
              initial="hidden"
              animate="show"
              variants={createStaggeredList(prefersReducedMotion ? 0 : 0.04)}
              className="grid gap-4 md:grid-cols-2"
            >
              {discoverableChannels.map((type) => (
                <motion.div key={type} variants={motionVariants.fadeUp}>
                  <SupportedChannelCard
                    type={type}
                    onClick={() => openChannelDialog(type)}
                    prefersReducedMotion={prefersReducedMotion}
                  />
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <div className="rounded-[24px] border border-border/70 bg-background/45 px-4 py-5 text-sm text-muted-foreground">
              {t("tipsHealthy")}
            </div>
          )}
        </WorkspacePanel>
      </WorkspacePage>

      {showAddDialog && (
        <ChannelConfigModal
          initialSelectedType={selectedChannelType}
          configuredTypes={configuredTypes}
          onClose={() => {
            setShowAddDialog(false);
            setSelectedChannelType(null);
          }}
          onChannelSaved={async () => {
            await Promise.all([fetchChannels(), fetchConfiguredTypes()]);
            setShowAddDialog(false);
            setSelectedChannelType(null);
          }}
        />
      )}

      <ConfirmDialog
        open={!!channelToDelete}
        title={t("common:actions.confirm")}
        message={t("deleteConfirm")}
        confirmLabel={t("common:actions.delete")}
        cancelLabel={t("common:actions.cancel")}
        variant="destructive"
        onConfirm={async () => {
          if (channelToDelete) {
            await deleteChannel(channelToDelete.id);
            const [channelType] = channelToDelete.id.split("-");
            setConfiguredTypes((prev) =>
              prev.filter((type) => type !== channelType),
            );
            setChannelToDelete(null);
          }
        }}
        onCancel={() => setChannelToDelete(null)}
      />
    </>
  );
}

function ChannelLogo({ type }: { type: ChannelType }) {
  switch (type) {
    case "telegram":
      return (
        <img
          src={telegramIcon}
          alt="Telegram"
          className="w-[22px] h-[22px] dark:invert"
        />
      );
    case "discord":
      return (
        <img
          src={discordIcon}
          alt="Discord"
          className="w-[22px] h-[22px] dark:invert"
        />
      );
    case "whatsapp":
      return (
        <img
          src={whatsappIcon}
          alt="WhatsApp"
          className="w-[22px] h-[22px] dark:invert"
        />
      );
    case "dingtalk":
      return (
        <img
          src={dingtalkIcon}
          alt="DingTalk"
          className="w-[22px] h-[22px] dark:invert"
        />
      );
    case "feishu":
      return (
        <img
          src={feishuIcon}
          alt="Feishu"
          className="w-[22px] h-[22px] dark:invert"
        />
      );
    case "wecom":
      return (
        <img
          src={wecomIcon}
          alt="WeCom"
          className="w-[22px] h-[22px] dark:invert"
        />
      );
    case "qqbot":
      return (
        <img src={qqIcon} alt="QQ" className="w-[22px] h-[22px] dark:invert" />
      );
    default:
      return <span className="text-[22px]">{CHANNEL_ICONS[type] || "💬"}</span>;
  }
}

interface ChannelCardProps {
  channel: Channel;
  onClick: () => void;
  onDelete: () => void;
  prefersReducedMotion: boolean;
}

function ChannelCard({
  channel,
  onClick,
  onDelete,
  prefersReducedMotion,
}: ChannelCardProps) {
  const { t } = useTranslation(["channels", "common"]);
  const meta = CHANNEL_META[channel.type];
  const statusTone =
    channel.status === "connected"
      ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
      : channel.status === "connecting"
        ? "bg-yellow-500/12 text-yellow-700 dark:text-yellow-300"
        : channel.status === "error"
          ? "bg-destructive/12 text-destructive"
          : "bg-muted text-muted-foreground";
  const statusLabel =
    channel.status === "connected"
      ? t("common:status.connected")
      : channel.status === "connecting"
        ? t("common:status.connecting")
        : channel.status === "error"
          ? t("common:status.error")
          : t("common:status.disconnected");

  return (
    <motion.div
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      whileHover={getHoverLift(prefersReducedMotion, { y: -3, scale: 1.006 })}
      transition={motionTransition.gentle}
      role="button"
      tabIndex={0}
      className="group flex items-start gap-4 rounded-[24px] border border-border/70 bg-background/50 p-4 text-left transition-all hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
    >
      <div className="mt-0.5 flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full border border-black/5 bg-black/5 text-foreground shadow-sm dark:border-white/10 dark:bg-white/5">
        <ChannelLogo type={channel.type} />
      </div>
      <div className="mt-1 flex min-w-0 flex-1 flex-col py-0.5">
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="text-[16px] font-semibold text-foreground truncate">
              {channel.name}
            </h3>
            {meta?.isPlugin && (
              <Badge
                variant="secondary"
                className="font-mono text-[10px] font-medium px-2 py-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.08] border-0 shadow-none text-foreground/70"
              >
                {t("pluginBadge", "Plugin")}
              </Badge>
            )}
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 rounded-full text-muted-foreground opacity-80 transition-all hover:bg-destructive/10 hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100"
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
            aria-label={t("common:actions.delete")}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        {channel.error ? (
          <p className="text-[13.5px] text-destructive line-clamp-2 leading-[1.5]">
            {channel.error}
          </p>
        ) : (
          <p className="text-[13.5px] text-muted-foreground line-clamp-2 leading-[1.5]">
            {meta
              ? t(meta.description.replace("channels:", ""))
              : CHANNEL_NAMES[channel.type]}
          </p>
        )}
        <div className="mt-4 flex items-center justify-between gap-3">
          <Badge
            variant="secondary"
            className={cn(
              "rounded-full border-0 px-2.5 py-1 text-[11px]",
              statusTone,
            )}
          >
            {statusLabel}
          </Badge>
          <span className="text-[12px] font-medium text-primary">
            {t("common:actions.edit")}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

function SupportedChannelCard({
  type,
  onClick,
  prefersReducedMotion,
}: {
  type: ChannelType;
  onClick: () => void;
  prefersReducedMotion: boolean;
}) {
  const { t } = useTranslation("channels");
  const meta = CHANNEL_META[type];

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={getHoverLift(prefersReducedMotion, { y: -3, scale: 1.006 })}
      transition={motionTransition.gentle}
      className="group flex w-full items-start gap-4 rounded-[24px] border border-border/70 bg-background/45 p-4 text-left hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
    >
      <div className="mt-0.5 flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full border border-black/5 bg-black/5 text-foreground shadow-sm dark:border-white/10 dark:bg-white/5">
        <ChannelLogo type={type} />
      </div>
      <div className="mt-1 flex min-w-0 flex-1 flex-col">
        <div className="mb-1 flex items-center gap-2">
          <h3 className="truncate text-[16px] font-semibold text-foreground">
            {meta.name}
          </h3>
          {meta.isPlugin ? (
            <Badge
              variant="secondary"
              className="rounded-full border-0 bg-black/[0.04] px-2 py-0.5 font-mono text-[10px] font-medium text-foreground/70 shadow-none dark:bg-white/[0.08]"
            >
              {t("pluginBadge")}
            </Badge>
          ) : null}
        </div>
        <p className="line-clamp-2 text-[13.5px] leading-[1.5] text-muted-foreground">
          {t(meta.description.replace("channels:", ""))}
        </p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <Badge
            variant="secondary"
            className="rounded-full border-0 bg-background/70 px-2.5 py-1 text-[11px] text-muted-foreground"
          >
            {t("availableChannels")}
          </Badge>
          <span className="text-[12px] font-medium text-primary">
            {t("addChannel")}
          </span>
        </div>
      </div>
    </motion.button>
  );
}

function ChannelStatCard({
  label,
  value,
  hint,
  prefersReducedMotion,
}: {
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
      <div className="text-[12px] font-medium text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-[22px] font-semibold tracking-[-0.02em] text-foreground">
        {value}
      </div>
      <div className="mt-3 text-[12px] leading-5 text-muted-foreground">
        {hint}
      </div>
    </motion.div>
  );
}

function ChannelInsightRow({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "positive" | "warning" | "muted";
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
            : tone === "warning"
              ? "text-yellow-700 dark:text-yellow-300"
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

export default Channels;
