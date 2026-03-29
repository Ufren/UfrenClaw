import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertCircle,
  FileCode,
  FolderOpen,
  Globe,
  Key,
  Lock,
  Package,
  Plus,
  Puzzle,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  WorkspacePage,
  WorkspacePanel,
  WorkspacePanelHeader,
} from "@/components/layout/WorkspacePage";
import { useSkillsStore } from "@/stores/skills";
import { useGatewayStore } from "@/stores/gateway";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { cn } from "@/lib/utils";
import { invokeIpc } from "@/lib/api-client";
import { hostApiFetch } from "@/lib/host-api";
import { trackUiEvent } from "@/lib/telemetry";
import { toast } from "sonner";
import type { MarketplaceSkill, Skill } from "@/types/skill";
import { useTranslation } from "react-i18next";
import {
  createStaggeredList,
  getHoverLift,
  getTapScale,
  motionTransition,
  motionVariants,
} from "@/lib/motion";

interface SkillInspectorProps {
  skill: Skill;
  onToggle: (enabled: boolean) => void;
  onUninstall?: (slug: string) => void;
}

function SkillInspector({ skill, onToggle, onUninstall }: SkillInspectorProps) {
  const { t } = useTranslation("skills");
  const { fetchSkills } = useSkillsStore();
  const prefersReducedMotion = useReducedMotion() ?? false;
  const [envVars, setEnvVars] = useState<Array<{ key: string; value: string }>>(
    [],
  );
  const [apiKey, setApiKey] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setIsSaving(false);
    if (skill.config?.apiKey) {
      setApiKey(String(skill.config.apiKey));
    } else {
      setApiKey("");
    }

    if (skill.config?.env) {
      setEnvVars(
        Object.entries(skill.config.env).map(([key, value]) => ({
          key,
          value: String(value),
        })),
      );
      return;
    }

    setEnvVars([]);
  }, [skill]);

  const handleOpenClawhub = async () => {
    if (!skill.slug) return;
    await invokeIpc("shell:openExternal", `https://clawhub.ai/s/${skill.slug}`);
  };

  const handleOpenEditor = async () => {
    try {
      const result = await hostApiFetch<{ success: boolean; error?: string }>(
        "/api/clawhub/open-readme",
        {
          method: "POST",
          body: JSON.stringify({ skillKey: skill.id, slug: skill.slug }),
        },
      );

      if (result.success) {
        toast.success(t("toast.openedEditor"));
        return;
      }

      toast.error(result.error || t("toast.failedEditor"));
    } catch (error) {
      toast.error(t("toast.failedEditor") + ": " + String(error));
    }
  };

  const handleAddEnv = () => {
    setEnvVars((current) => [...current, { key: "", value: "" }]);
  };

  const handleUpdateEnv = (
    index: number,
    field: "key" | "value",
    value: string,
  ) => {
    setEnvVars((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    );
  };

  const handleRemoveEnv = (index: number) => {
    setEnvVars((current) =>
      current.filter((_, itemIndex) => itemIndex !== index),
    );
  };

  const handleSaveConfig = async () => {
    if (isSaving) {
      return;
    }

    setIsSaving(true);
    try {
      const envObj = envVars.reduce<Record<string, string>>((acc, curr) => {
        const key = curr.key.trim();
        if (key) {
          acc[key] = curr.value.trim();
        }
        return acc;
      }, {});

      const result = (await invokeIpc<{ success: boolean; error?: string }>(
        "skill:updateConfig",
        {
          skillKey: skill.id,
          apiKey: apiKey || "",
          env: envObj,
        },
      )) as { success: boolean; error?: string };

      if (!result.success) {
        throw new Error(result.error || "Unknown error");
      }

      await fetchSkills();
      toast.success(t("detail.configSaved"));
    } catch (error) {
      toast.error(t("toast.failedSave") + ": " + String(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <motion.div
      className="space-y-4"
      key={skill.id}
      initial="hidden"
      animate="show"
      exit="exit"
      variants={motionVariants.panel}
    >
      <WorkspacePanel className="space-y-5">
        <div className="flex items-start gap-4">
          <motion.div
            className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] border border-border/70 bg-background/70 text-3xl shadow-sm"
            whileHover={getHoverLift(prefersReducedMotion, {
              y: -2,
              scale: 1.03,
            })}
            transition={motionTransition.gentle}
          >
            <span>{skill.icon || "🔧"}</span>
            {skill.isCore ? (
              <div className="absolute -bottom-1.5 -right-1.5 rounded-full border border-border/70 bg-background p-1">
                <Lock className="h-3 w-3 text-muted-foreground" />
              </div>
            ) : null}
          </motion.div>

          <div className="min-w-0 space-y-2">
            <WorkspacePanelHeader
              title={skill.name}
              description={skill.description || t("detail.description")}
            />
            <div className="flex flex-wrap gap-2">
              <motion.div
                whileHover={getHoverLift(prefersReducedMotion, {
                  y: -1,
                  scale: 1.02,
                })}
              >
                <Badge
                  variant="secondary"
                  className="rounded-full border-0 bg-foreground/[0.06] px-2.5 py-1 text-[11px] text-foreground/75 dark:bg-white/[0.08]"
                >
                  v{skill.version}
                </Badge>
              </motion.div>
              <motion.div
                whileHover={getHoverLift(prefersReducedMotion, {
                  y: -1,
                  scale: 1.02,
                })}
              >
                <Badge
                  variant="secondary"
                  className="rounded-full border-0 bg-foreground/[0.06] px-2.5 py-1 text-[11px] text-foreground/75 dark:bg-white/[0.08]"
                >
                  {skill.isCore
                    ? t("detail.coreSystem")
                    : skill.isBundled
                      ? t("detail.bundled")
                      : t("detail.userInstalled")}
                </Badge>
              </motion.div>
              <motion.div
                whileHover={getHoverLift(prefersReducedMotion, {
                  y: -1,
                  scale: 1.02,
                })}
              >
                <Badge
                  variant="secondary"
                  className={cn(
                    "rounded-full border-0 px-2.5 py-1 text-[11px]",
                    skill.enabled
                      ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {skill.enabled ? t("detail.enabled") : t("detail.disabled")}
                </Badge>
              </motion.div>
            </div>
          </div>
        </div>

        {skill.slug && !skill.isBundled && !skill.isCore ? (
          <div className="flex flex-wrap gap-2">
            <motion.div whileTap={getTapScale(prefersReducedMotion)}>
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-full border-border/70 bg-background/70 px-3 text-[12px] font-medium text-foreground/80 shadow-none hover:bg-accent/80"
                onClick={handleOpenClawhub}
              >
                <Globe className="mr-1.5 h-3.5 w-3.5" />
                {t("actions.openClawHub")}
              </Button>
            </motion.div>
            <motion.div whileTap={getTapScale(prefersReducedMotion)}>
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-full border-border/70 bg-background/70 px-3 text-[12px] font-medium text-foreground/80 shadow-none hover:bg-accent/80"
                onClick={handleOpenEditor}
              >
                <FileCode className="mr-1.5 h-3.5 w-3.5" />
                {t("detail.openManual")}
              </Button>
            </motion.div>
          </div>
        ) : null}
      </WorkspacePanel>

      {!skill.isCore ? (
        <WorkspacePanel className="space-y-4">
          <WorkspacePanelHeader
            title={t("detail.config")}
            description={t("detail.configurable")}
          />

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground/80">
              <Key className="h-3.5 w-3.5 text-blue-500" />
              {t("detail.apiKey")}
            </div>
            <Input
              placeholder={t("detail.apiKeyPlaceholder")}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              type="password"
              className="h-11 rounded-xl border-border/70 bg-background/70 font-mono text-[13px]"
            />
            <p className="text-xs leading-5 text-muted-foreground">
              {t("detail.apiKeyDesc")}
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="text-[13px] font-semibold text-foreground/80">
                  {t("detail.envVars")}
                </div>
                {envVars.length > 0 ? (
                  <Badge
                    variant="secondary"
                    className="h-5 rounded-full bg-foreground/[0.06] px-2 text-[10px] text-foreground/70 dark:bg-white/[0.08]"
                  >
                    {envVars.length}
                  </Badge>
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 rounded-full px-3 text-[12px] font-medium hover:bg-accent/70"
                onClick={handleAddEnv}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                {t("detail.addVariable")}
              </Button>
            </div>

            <div className="space-y-2">
              {envVars.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/70 bg-background/40 px-4 py-3 text-[13px] text-muted-foreground">
                  {t("detail.noEnvVars")}
                </div>
              ) : null}

              {envVars.map((env, index) => (
                <motion.div
                  className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_40px] gap-2"
                  key={`${skill.id}-${index}`}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={motionTransition.gentle}
                >
                  <Input
                    value={env.key}
                    onChange={(event) =>
                      handleUpdateEnv(index, "key", event.target.value)
                    }
                    className="h-10 rounded-xl border-border/70 bg-background/70 font-mono text-[13px]"
                    placeholder={t("detail.keyPlaceholder")}
                  />
                  <Input
                    value={env.value}
                    onChange={(event) =>
                      handleUpdateEnv(index, "value", event.target.value)
                    }
                    className="h-10 rounded-xl border-border/70 bg-background/70 font-mono text-[13px]"
                    placeholder={t("detail.valuePlaceholder")}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 rounded-xl text-destructive/70 hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => handleRemoveEnv(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <motion.div whileTap={getTapScale(prefersReducedMotion)}>
              <Button
                onClick={handleSaveConfig}
                className="h-10 rounded-full text-[13px] font-medium shadow-none"
                disabled={isSaving}
              >
                {isSaving ? t("detail.saving") : t("detail.saveConfig")}
              </Button>
            </motion.div>
            <motion.div whileTap={getTapScale(prefersReducedMotion)}>
              <Button
                variant="outline"
                className="h-10 rounded-full border-border/70 bg-background/70 text-[13px] font-medium shadow-none hover:bg-accent/80"
                onClick={() => {
                  if (!skill.isBundled && onUninstall && skill.slug) {
                    onUninstall(skill.slug);
                    return;
                  }

                  onToggle(!skill.enabled);
                }}
              >
                {!skill.isBundled && onUninstall
                  ? t("detail.uninstall")
                  : skill.enabled
                    ? t("detail.disable")
                    : t("detail.enable")}
              </Button>
            </motion.div>
          </div>
        </WorkspacePanel>
      ) : null}
    </motion.div>
  );
}

function MarketplaceCard({
  skill,
  isInstalled,
  isInstallLoading,
  onInstall,
  onUninstall,
}: {
  skill: MarketplaceSkill;
  isInstalled: boolean;
  isInstallLoading: boolean;
  onInstall: (slug: string) => void;
  onUninstall: (slug: string) => void;
}) {
  const { t } = useTranslation("common");
  const prefersReducedMotion = useReducedMotion() ?? false;

  return (
    <motion.div
      className="flex items-start gap-4 rounded-[24px] border border-border/60 bg-background/55 p-4 transition-all hover:bg-accent/60"
      whileHover={getHoverLift(prefersReducedMotion, { y: -3, scale: 1.008 })}
      whileTap={getTapScale(prefersReducedMotion)}
      transition={motionTransition.gentle}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-start gap-4 text-left"
        onClick={() =>
          void invokeIpc(
            "shell:openExternal",
            `https://clawhub.ai/s/${skill.slug}`,
          )
        }
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border border-border/70 bg-background/70 text-xl">
          📦
        </div>
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="truncate text-[15px] font-semibold text-foreground">
              {skill.name}
            </div>
            {skill.author ? (
              <span className="text-xs text-muted-foreground">
                • {skill.author}
              </span>
            ) : null}
          </div>
          <p className="line-clamp-2 text-[13px] leading-6 text-muted-foreground">
            {skill.description}
          </p>
          <div className="text-[12px] text-muted-foreground">
            v{skill.version}
          </div>
        </div>
      </button>

      <div className="flex shrink-0 items-center gap-2">
        {isInstalled ? (
          <Button
            variant="destructive"
            size="sm"
            onClick={() => onUninstall(skill.slug)}
            disabled={isInstallLoading}
            className="h-9 rounded-full px-4 shadow-none"
          >
            {isInstallLoading ? (
              <LoadingSpinner size="sm" />
            ) : (
              <>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                {t("actions.uninstall")}
              </>
            )}
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => onInstall(skill.slug)}
            disabled={isInstallLoading}
            className="h-9 rounded-full px-4 text-[12px] font-medium shadow-none"
          >
            {isInstallLoading ? (
              <LoadingSpinner size="sm" />
            ) : (
              t("actions.install")
            )}
          </Button>
        )}
      </div>
    </motion.div>
  );
}

export function Skills() {
  const prefersReducedMotion = useReducedMotion() ?? false;
  const {
    skills,
    loading,
    error,
    fetchSkills,
    enableSkill,
    disableSkill,
    searchResults,
    searchSkills,
    installSkill,
    uninstallSkill,
    searching,
    searchError,
    installing,
  } = useSkillsStore();
  const { t } = useTranslation("skills");
  const gatewayStatus = useGatewayStore((state) => state.status);
  const [searchQuery, setSearchQuery] = useState("");
  const [marketplaceQuery, setMarketplaceQuery] = useState("");
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "marketplace">("all");
  const [selectedSource, setSelectedSource] = useState<
    "all" | "built-in" | "marketplace"
  >("all");
  const [skillsDirPath, setSkillsDirPath] = useState("~/.openclaw/skills");
  const marketplaceDiscoveryAttemptedRef = useRef(false);
  const isGatewayRunning = gatewayStatus.state === "running";
  const [showGatewayWarning, setShowGatewayWarning] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (!isGatewayRunning) {
      timer = setTimeout(() => {
        setShowGatewayWarning(true);
      }, 1500);
    } else {
      timer = setTimeout(() => {
        setShowGatewayWarning(false);
      }, 0);
    }
    return () => clearTimeout(timer);
  }, [isGatewayRunning]);

  useEffect(() => {
    if (isGatewayRunning) {
      void fetchSkills();
    }
  }, [fetchSkills, isGatewayRunning]);

  useEffect(() => {
    void invokeIpc<string>("openclaw:getSkillsDir")
      .then((dir) => setSkillsDirPath(dir as string))
      .catch(() => undefined);
  }, []);

  const safeSkills = useMemo(
    () => (Array.isArray(skills) ? skills : []),
    [skills],
  );
  const filteredSkills = useMemo(
    () =>
      safeSkills
        .filter((skill) => {
          const q = searchQuery.toLowerCase().trim();
          const matchesSearch =
            q.length === 0 ||
            skill.name.toLowerCase().includes(q) ||
            skill.description.toLowerCase().includes(q) ||
            skill.id.toLowerCase().includes(q) ||
            (skill.slug || "").toLowerCase().includes(q) ||
            (skill.author || "").toLowerCase().includes(q);

          if (selectedSource === "built-in") {
            return matchesSearch && Boolean(skill.isBundled);
          }

          if (selectedSource === "marketplace") {
            return matchesSearch && !skill.isBundled;
          }

          return matchesSearch;
        })
        .sort((a, b) => {
          if (a.enabled && !b.enabled) return -1;
          if (!a.enabled && b.enabled) return 1;
          if (a.isCore && !b.isCore) return -1;
          if (!a.isCore && b.isCore) return 1;
          return a.name.localeCompare(b.name);
        }),
    [safeSkills, searchQuery, selectedSource],
  );

  const sourceStats = useMemo(
    () => ({
      all: safeSkills.length,
      builtIn: safeSkills.filter((skill) => skill.isBundled).length,
      marketplace: safeSkills.filter((skill) => !skill.isBundled).length,
    }),
    [safeSkills],
  );
  const enabledCount = safeSkills.filter((skill) => skill.enabled).length;
  const configurableCount = safeSkills.filter((skill) => !skill.isCore).length;
  const hasInstalledSkills = safeSkills.some((skill) => !skill.isBundled);

  useEffect(() => {
    if (!selectedSkill) {
      return;
    }

    const nextSelected = safeSkills.find(
      (skill) => skill.id === selectedSkill.id,
    );
    if (!nextSelected) {
      setSelectedSkill(null);
      return;
    }

    if (nextSelected !== selectedSkill) {
      setSelectedSkill(nextSelected);
    }
  }, [safeSkills, selectedSkill]);

  useEffect(() => {
    if (activeTab !== "all") {
      return;
    }

    if (filteredSkills.length === 0) {
      setSelectedSkill(null);
      return;
    }

    if (
      !selectedSkill ||
      !filteredSkills.some((skill) => skill.id === selectedSkill.id)
    ) {
      setSelectedSkill(filteredSkills[0]);
    }
  }, [activeTab, filteredSkills, selectedSkill]);

  useEffect(() => {
    if (
      activeTab === "marketplace" &&
      marketplaceQuery === "" &&
      marketplaceDiscoveryAttemptedRef.current
    ) {
      void searchSkills("");
    }
  }, [marketplaceQuery, activeTab, searchSkills]);

  useEffect(() => {
    if (activeTab !== "marketplace") {
      return;
    }

    if (marketplaceQuery.trim()) {
      const timer = setTimeout(() => {
        marketplaceDiscoveryAttemptedRef.current = true;
        void searchSkills(marketplaceQuery.trim());
      }, 300);
      return () => clearTimeout(timer);
    }

    if (!searching && !marketplaceDiscoveryAttemptedRef.current) {
      marketplaceDiscoveryAttemptedRef.current = true;
      void searchSkills("");
    }
  }, [activeTab, marketplaceQuery, searching, searchSkills]);

  const bulkToggleVisible = useCallback(
    async (enable: boolean) => {
      const candidates = filteredSkills.filter(
        (skill) => !skill.isCore && skill.enabled !== enable,
      );

      if (candidates.length === 0) {
        toast.info(
          enable
            ? t("toast.noBatchEnableTargets")
            : t("toast.noBatchDisableTargets"),
        );
        return;
      }

      let succeeded = 0;
      for (const skill of candidates) {
        try {
          if (enable) {
            await enableSkill(skill.id);
          } else {
            await disableSkill(skill.id);
          }
          succeeded += 1;
        } catch {
          continue;
        }
      }

      trackUiEvent("skills.batch_toggle", {
        enable,
        total: candidates.length,
        succeeded,
      });

      if (succeeded === candidates.length) {
        toast.success(
          enable
            ? t("toast.batchEnabled", { count: succeeded })
            : t("toast.batchDisabled", { count: succeeded }),
        );
        return;
      }

      toast.warning(
        t("toast.batchPartial", {
          success: succeeded,
          total: candidates.length,
        }),
      );
    },
    [disableSkill, enableSkill, filteredSkills, t],
  );

  const handleToggle = useCallback(
    async (skillId: string, enable: boolean) => {
      try {
        if (enable) {
          await enableSkill(skillId);
          toast.success(t("toast.enabled"));
        } else {
          await disableSkill(skillId);
          toast.success(t("toast.disabled"));
        }
      } catch (error) {
        toast.error(String(error));
      }
    },
    [disableSkill, enableSkill, t],
  );

  const handleOpenSkillsFolder = useCallback(async () => {
    try {
      const skillsDir = await invokeIpc<string>("openclaw:getSkillsDir");
      if (!skillsDir) {
        throw new Error("Skills directory not available");
      }

      const result = await invokeIpc<string>("shell:openPath", skillsDir);
      if (!result) {
        return;
      }

      if (
        result.toLowerCase().includes("no such file") ||
        result.toLowerCase().includes("not found") ||
        result.toLowerCase().includes("failed to open")
      ) {
        toast.error(t("toast.failedFolderNotFound"));
        return;
      }

      throw new Error(result);
    } catch (error) {
      toast.error(t("toast.failedOpenFolder") + ": " + String(error));
    }
  }, [t]);

  const handleInstall = useCallback(
    async (slug: string) => {
      try {
        await installSkill(slug);
        await enableSkill(slug);
        toast.success(t("toast.installed"));
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        if (
          ["installTimeoutError", "installRateLimitError"].includes(
            errorMessage,
          )
        ) {
          toast.error(t(`toast.${errorMessage}`, { path: skillsDirPath }), {
            duration: 10000,
          });
          return;
        }

        toast.error(t("toast.failedInstall") + ": " + errorMessage);
      }
    },
    [enableSkill, installSkill, skillsDirPath, t],
  );

  const handleUninstall = useCallback(
    async (slug: string) => {
      try {
        await uninstallSkill(slug);
        toast.success(t("toast.uninstalled"));
      } catch (error) {
        toast.error(t("toast.failedUninstall") + ": " + String(error));
      }
    },
    [t, uninstallSkill],
  );

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-2.5rem)] items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const aside =
    activeTab === "all" && selectedSkill ? (
      <AnimatePresence mode="wait" initial={false}>
        <SkillInspector
          key={selectedSkill.id}
          skill={selectedSkill}
          onToggle={(enabled) => {
            void handleToggle(selectedSkill.id, enabled);
          }}
          onUninstall={(slug) => {
            void handleUninstall(slug);
          }}
        />
      </AnimatePresence>
    ) : (
      <div className="space-y-4">
        <WorkspacePanel className="space-y-4">
          <WorkspacePanelHeader
            title={
              activeTab === "marketplace"
                ? t("marketplace.title")
                : t("detail.info")
            }
            description={
              activeTab === "marketplace"
                ? t("marketplace.securityNote")
                : t("subtitle")
            }
          />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
                {t("overview.installed")}
              </div>
              <div className="pt-2 text-2xl font-semibold text-foreground">
                {safeSkills.length}
              </div>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
                {t("overview.enabled")}
              </div>
              <div className="pt-2 text-2xl font-semibold text-foreground">
                {enabledCount}
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-dashed border-border/70 bg-background/40 px-4 py-4 text-sm leading-6 text-muted-foreground">
            {activeTab === "marketplace"
              ? t("marketplace.manualInstallHint", { path: skillsDirPath })
              : t("overview.selectedHint")}
          </div>
        </WorkspacePanel>
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
          {hasInstalledSkills ? (
            <Button
              variant="outline"
              onClick={() => void handleOpenSkillsFolder()}
              className="h-9 rounded-full border-border/70 bg-background/70 px-4 text-[13px] font-medium text-foreground/80 shadow-none hover:bg-accent/80 hover:text-foreground"
            >
              <FolderOpen className="mr-2 h-3.5 w-3.5" />
              {t("openFolder")}
            </Button>
          ) : null}
          <Button
            variant="outline"
            onClick={() => void fetchSkills()}
            disabled={!isGatewayRunning}
            className="h-9 rounded-full border-border/70 bg-background/70 px-4 text-[13px] font-medium text-foreground/80 shadow-none hover:bg-accent/80 hover:text-foreground"
          >
            <RefreshCw
              className={cn("mr-2 h-3.5 w-3.5", loading && "animate-spin")}
            />
            {t("refresh")}
          </Button>
        </div>
      }
    >
      <motion.div
        initial="hidden"
        animate="show"
        variants={motionVariants.fadeUp}
        className="flex h-full min-h-0 flex-col gap-4"
      >
        {showGatewayWarning ? (
          <div className="flex items-center gap-3 rounded-[22px] border border-yellow-500/40 bg-yellow-500/10 px-4 py-3">
            <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            <span className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
              {t("gatewayWarning")}
            </span>
          </div>
        ) : null}

        {error && activeTab === "all" ? (
          <div className="flex items-center gap-3 rounded-[22px] border border-destructive/50 bg-destructive/10 px-4 py-3">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <span className="text-sm font-medium text-destructive">
              {[
                "fetchTimeoutError",
                "fetchRateLimitError",
                "timeoutError",
                "rateLimitError",
              ].includes(error)
                ? t(`toast.${error}`, { path: skillsDirPath })
                : error}
            </span>
          </div>
        ) : null}

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
              {t("overview.installed")}
            </div>
            <div className="pt-2 text-2xl font-semibold text-foreground">
              {safeSkills.length}
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
              {t("overview.enabled")}
            </div>
            <div className="pt-2 text-2xl font-semibold text-foreground">
              {enabledCount}
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
              {t("overview.configurable")}
            </div>
            <div className="pt-2 text-2xl font-semibold text-foreground">
              {configurableCount}
            </div>
          </motion.div>
        </motion.div>

        <WorkspacePanel className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <WorkspacePanelHeader
              title={
                activeTab === "marketplace"
                  ? t("marketplace.title")
                  : t("overview.installedTitle")
              }
              description={
                activeTab === "marketplace"
                  ? t("marketplace.securityNote")
                  : t("overview.installedDescription")
              }
            />
            {activeTab === "all" ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void bulkToggleVisible(true)}
                  className="h-8 rounded-full border-border/70 bg-background/70 px-3 text-[12px] font-medium shadow-none hover:bg-accent/80"
                >
                  {t("actions.enableVisible")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void bulkToggleVisible(false)}
                  className="h-8 rounded-full border-border/70 bg-background/70 px-3 text-[12px] font-medium shadow-none hover:bg-accent/80"
                >
                  {t("actions.disableVisible")}
                </Button>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative max-w-xl flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={
                  activeTab === "marketplace" ? marketplaceQuery : searchQuery
                }
                onChange={(event) =>
                  activeTab === "marketplace"
                    ? setMarketplaceQuery(event.target.value)
                    : setSearchQuery(event.target.value)
                }
                placeholder={
                  activeTab === "marketplace"
                    ? t("searchMarketplace")
                    : t("search")
                }
                className="h-11 rounded-full border-border/70 bg-background/70 pl-10 text-[13px]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={activeTab === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setActiveTab("all");
                  setSelectedSource("all");
                }}
                className={cn(
                  "h-8 rounded-full px-3 text-[12px] font-medium shadow-none",
                  activeTab !== "all" &&
                    "border-border/70 bg-background/70 hover:bg-accent/80",
                )}
              >
                {t("filter.all", { count: sourceStats.all })}
              </Button>
              <Button
                variant={activeTab === "marketplace" ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveTab("marketplace")}
                className={cn(
                  "h-8 rounded-full px-3 text-[12px] font-medium shadow-none",
                  activeTab !== "marketplace" &&
                    "border-border/70 bg-background/70 hover:bg-accent/80",
                )}
              >
                {t("filter.marketplace", { count: sourceStats.marketplace })}
              </Button>
            </div>
          </div>

          {activeTab === "all" ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant={selectedSource === "all" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setSelectedSource("all")}
                className="h-8 rounded-full px-3 text-[12px]"
              >
                {t("filter.all", { count: sourceStats.all })}
              </Button>
              <Button
                variant={selectedSource === "built-in" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setSelectedSource("built-in")}
                className="h-8 rounded-full px-3 text-[12px]"
              >
                {t("filter.builtIn", { count: sourceStats.builtIn })}
              </Button>
              <Button
                variant={
                  selectedSource === "marketplace" ? "secondary" : "ghost"
                }
                size="sm"
                onClick={() => setSelectedSource("marketplace")}
                className="h-8 rounded-full px-3 text-[12px]"
              >
                {t("detail.userInstalled")} ({sourceStats.marketplace})
              </Button>
            </div>
          ) : (
            <div className="rounded-[20px] border border-border/70 bg-background/50 px-4 py-3 text-sm leading-6 text-muted-foreground">
              {t("marketplace.manualInstallHint", { path: skillsDirPath })}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {activeTab === "all" ? (
              filteredSkills.length === 0 ? (
                <div className="flex h-full min-h-[280px] flex-col items-center justify-center rounded-[22px] border border-dashed border-border/70 bg-background/35 px-6 text-center text-muted-foreground">
                  <Puzzle className="mb-4 h-10 w-10 opacity-50" />
                  <p className="text-sm font-medium text-foreground/80">
                    {searchQuery ? t("noSkillsSearch") : t("noSkillsAvailable")}
                  </p>
                </div>
              ) : (
                <motion.div
                  initial="hidden"
                  animate="show"
                  variants={createStaggeredList(
                    prefersReducedMotion ? 0 : 0.06,
                  )}
                  className="space-y-3"
                >
                  {filteredSkills.map((skill) => (
                    <motion.div key={skill.id} variants={motionVariants.fadeUp}>
                      <motion.button
                        type="button"
                        onClick={() => setSelectedSkill(skill)}
                        className={cn(
                          "flex w-full items-start gap-4 rounded-[24px] border p-4 text-left transition-all",
                          selectedSkill?.id === skill.id
                            ? "border-border bg-foreground/[0.06] shadow-sm dark:bg-white/[0.08]"
                            : "border-border/60 bg-background/55 hover:bg-accent/60",
                        )}
                        whileHover={getHoverLift(prefersReducedMotion, {
                          y: -3,
                          scale: 1.006,
                        })}
                        whileTap={getTapScale(prefersReducedMotion)}
                        transition={motionTransition.gentle}
                        layout
                      >
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px] border border-border/70 bg-background/70 text-2xl">
                          {skill.icon || "🧩"}
                        </div>
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="truncate text-[15px] font-semibold text-foreground">
                              {skill.name}
                            </div>
                            {skill.isCore ? (
                              <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                            ) : skill.isBundled ? (
                              <Puzzle className="h-3.5 w-3.5 text-blue-500/70" />
                            ) : null}
                            {skill.slug && skill.slug !== skill.name ? (
                              <Badge
                                variant="secondary"
                                className="rounded-full border-0 bg-foreground/[0.06] px-2 py-0.5 text-[10px] font-medium text-foreground/70 dark:bg-white/[0.08]"
                              >
                                {skill.slug}
                              </Badge>
                            ) : null}
                          </div>
                          <p className="line-clamp-2 text-[13px] leading-6 text-muted-foreground">
                            {skill.description || t("detail.description")}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
                            {skill.version ? (
                              <span>v{skill.version}</span>
                            ) : null}
                            {skill.author ? (
                              <span>• {skill.author}</span>
                            ) : null}
                            <span>
                              {skill.isCore
                                ? t("detail.coreSystem")
                                : skill.isBundled
                                  ? t("detail.bundled")
                                  : t("detail.userInstalled")}
                            </span>
                          </div>
                        </div>
                        <div
                          className="flex shrink-0 items-center gap-3"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <Switch
                            checked={skill.enabled}
                            onCheckedChange={(checked) => {
                              void handleToggle(skill.id, checked);
                            }}
                            disabled={skill.isCore}
                          />
                        </div>
                      </motion.button>
                    </motion.div>
                  ))}
                </motion.div>
              )
            ) : (
              <div className="space-y-3">
                {searchError ? (
                  <div className="flex items-center gap-3 rounded-[22px] border border-destructive/50 bg-destructive/10 px-4 py-3">
                    <AlertCircle className="h-5 w-5 text-destructive" />
                    <span className="text-sm font-medium text-destructive">
                      {[
                        "searchTimeoutError",
                        "searchRateLimitError",
                        "timeoutError",
                        "rateLimitError",
                      ].includes(searchError.replace("Error: ", ""))
                        ? t(`toast.${searchError.replace("Error: ", "")}`, {
                            path: skillsDirPath,
                          })
                        : t("marketplace.searchError")}
                    </span>
                  </div>
                ) : null}

                {searching ? (
                  <div className="flex min-h-[280px] flex-col items-center justify-center rounded-[22px] border border-dashed border-border/70 bg-background/35 px-6 text-center text-muted-foreground">
                    <LoadingSpinner size="lg" />
                    <p className="mt-4 text-sm">{t("marketplace.searching")}</p>
                  </div>
                ) : searchResults.length > 0 ? (
                  searchResults.map((skill) => {
                    const isInstalled = safeSkills.some(
                      (installedSkill) =>
                        installedSkill.id === skill.slug ||
                        installedSkill.slug === skill.slug,
                    );

                    return (
                      <MarketplaceCard
                        key={skill.slug}
                        skill={skill}
                        isInstalled={isInstalled}
                        isInstallLoading={Boolean(installing[skill.slug])}
                        onInstall={(slug) => {
                          void handleInstall(slug);
                        }}
                        onUninstall={(slug) => {
                          void handleUninstall(slug);
                        }}
                      />
                    );
                  })
                ) : (
                  <div className="flex min-h-[280px] flex-col items-center justify-center rounded-[22px] border border-dashed border-border/70 bg-background/35 px-6 text-center text-muted-foreground">
                    <Package className="mb-4 h-10 w-10 opacity-50" />
                    <p className="text-sm font-medium text-foreground/80">
                      {marketplaceQuery
                        ? t("marketplace.noResults")
                        : t("marketplace.emptyPrompt")}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </WorkspacePanel>
      </motion.div>
    </WorkspacePage>
  );
}

export default Skills;
