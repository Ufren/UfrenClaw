/**
 * Chat Toolbar
 * Session selector, new session, refresh, and thinking toggle.
 * Rendered in the Header when on the Chat page.
 */
import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { RefreshCw, Brain, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useChatStore } from "@/stores/chat";
import { useAgentsStore } from "@/stores/agents";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { getHoverLift, getTapScale, motionTransition } from "@/lib/motion";

export function ChatToolbar() {
  const refresh = useChatStore((s) => s.refresh);
  const loading = useChatStore((s) => s.loading);
  const showThinking = useChatStore((s) => s.showThinking);
  const toggleThinking = useChatStore((s) => s.toggleThinking);
  const currentAgentId = useChatStore((s) => s.currentAgentId);
  const agents = useAgentsStore((s) => s.agents);
  const { t } = useTranslation("chat");
  const prefersReducedMotion = useReducedMotion();
  const currentAgentName = useMemo(
    () =>
      agents.find((agent) => agent.id === currentAgentId)?.name ??
      currentAgentId,
    [agents, currentAgentId],
  );

  return (
    <div className="flex items-center gap-2">
      <motion.div
        className="hidden sm:flex items-center gap-1.5 rounded-full border border-black/10 bg-white/70 px-3 py-1.5 text-[12px] font-medium text-foreground/80 shadow-sm dark:border-white/10 dark:bg-white/5"
        whileHover={getHoverLift(prefersReducedMotion, { y: -2, scale: 1.01 })}
        transition={motionTransition.gentle}
      >
        <Bot className="h-3.5 w-3.5 text-primary" />
        <span>{t("toolbar.currentAgent", { agent: currentAgentName })}</span>
      </motion.div>
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.div
            whileHover={getHoverLift(prefersReducedMotion, {
              y: -1,
              scale: 1.04,
            })}
            whileTap={getTapScale(prefersReducedMotion)}
            transition={motionTransition.snappy}
          >
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={() => refresh()}
              disabled={loading}
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
          </motion.div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{t("toolbar.refresh")}</p>
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <motion.div
            whileHover={getHoverLift(prefersReducedMotion, {
              y: -1,
              scale: 1.04,
            })}
            whileTap={getTapScale(prefersReducedMotion)}
            transition={motionTransition.snappy}
          >
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8 rounded-full transition-colors",
                showThinking && "bg-primary/10 text-primary shadow-sm",
              )}
              onClick={toggleThinking}
            >
              <Brain className="h-4 w-4" />
            </Button>
          </motion.div>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {showThinking
              ? t("toolbar.hideThinking")
              : t("toolbar.showThinking")}
          </p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
