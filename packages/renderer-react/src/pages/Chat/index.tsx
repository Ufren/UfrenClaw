/**
 * Chat Page
 * Native React implementation communicating with OpenClaw Gateway
 * via gateway:rpc IPC. Session selector, thinking toggle, and refresh
 * are in the toolbar; messages render with markdown + streaming.
 */
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AlertCircle, Loader2, Sparkles } from "lucide-react";
import { useChatStore, type RawMessage } from "@/stores/chat";
import { useGatewayStore } from "@/stores/gateway";
import { useAgentsStore } from "@/stores/agents";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { ChatMessage } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import { ChatToolbar } from "./ChatToolbar";
import {
  extractImages,
  extractText,
  extractThinking,
  extractToolUse,
} from "./message-utils";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  createStaggeredList,
  getFloatingAnimation,
  getFloatingTransition,
  getHoverLift,
  getTapScale,
  motionTransition,
  motionVariants,
} from "@/lib/motion";

export function Chat() {
  const { t } = useTranslation("chat");
  const prefersReducedMotion = useReducedMotion() ?? false;
  const gatewayStatus = useGatewayStore((s) => s.status);
  const isGatewayRunning = gatewayStatus.state === "running";

  const messages = useChatStore((s) => s.messages);
  const loading = useChatStore((s) => s.loading);
  const sending = useChatStore((s) => s.sending);
  const error = useChatStore((s) => s.error);
  const showThinking = useChatStore((s) => s.showThinking);
  const streamingMessage = useChatStore((s) => s.streamingMessage);
  const streamingTools = useChatStore((s) => s.streamingTools);
  const pendingFinal = useChatStore((s) => s.pendingFinal);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const abortRun = useChatStore((s) => s.abortRun);
  const clearError = useChatStore((s) => s.clearError);
  const fetchAgents = useAgentsStore((s) => s.fetchAgents);

  const cleanupEmptySession = useChatStore((s) => s.cleanupEmptySession);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [streamingTimestamp, setStreamingTimestamp] = useState<number>(0);

  // Load data when gateway is running.
  // When the store already holds messages for this session (i.e. the user
  // is navigating *back* to Chat), use quiet mode so the existing messages
  // stay visible while fresh data loads in the background.  This avoids
  // an unnecessary messages → spinner → messages flicker.
  useEffect(() => {
    return () => {
      // If the user navigates away without sending any messages, remove the
      // empty session so it doesn't linger as a ghost entry in the sidebar.
      cleanupEmptySession();
    };
  }, [cleanupEmptySession]);

  useEffect(() => {
    void fetchAgents();
  }, [fetchAgents]);

  // Auto-scroll on new messages, streaming, or activity changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingMessage, sending, pendingFinal]);

  // Update timestamp when sending starts
  useEffect(() => {
    if (sending && streamingTimestamp === 0) {
      setStreamingTimestamp(Date.now() / 1000);
    } else if (!sending && streamingTimestamp !== 0) {
      setStreamingTimestamp(0);
    }
  }, [sending, streamingTimestamp]);

  // Gateway not running block has been completely removed so the UI always renders.

  const streamMsg =
    streamingMessage && typeof streamingMessage === "object"
      ? (streamingMessage as unknown as {
          role?: string;
          content?: unknown;
          timestamp?: number;
        })
      : null;
  const streamText = streamMsg
    ? extractText(streamMsg)
    : typeof streamingMessage === "string"
      ? streamingMessage
      : "";
  const hasStreamText = streamText.trim().length > 0;
  const streamThinking = streamMsg ? extractThinking(streamMsg) : null;
  const hasStreamThinking =
    showThinking && !!streamThinking && streamThinking.trim().length > 0;
  const streamTools = streamMsg ? extractToolUse(streamMsg) : [];
  const hasStreamTools = streamTools.length > 0;
  const streamImages = streamMsg ? extractImages(streamMsg) : [];
  const hasStreamImages = streamImages.length > 0;
  const hasStreamToolStatus = streamingTools.length > 0;
  const shouldRenderStreaming =
    sending &&
    (hasStreamText ||
      hasStreamThinking ||
      hasStreamTools ||
      hasStreamImages ||
      hasStreamToolStatus);
  const hasAnyStreamContent =
    hasStreamText ||
    hasStreamThinking ||
    hasStreamTools ||
    hasStreamImages ||
    hasStreamToolStatus;

  const isEmpty = messages.length === 0 && !loading && !sending;

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden -m-3 transition-colors duration-500 dark:bg-background",
      )}
    >
      <motion.div
        className="flex shrink-0 items-center justify-end border-b border-border/60 bg-background/70 px-4 py-3 backdrop-blur-xl"
        initial="hidden"
        animate="show"
        variants={motionVariants.fadeUp}
      >
        <ChatToolbar />
      </motion.div>

      <div className="scroll-container-stable flex-1 min-h-0 overflow-y-auto px-4 py-4 sm:px-5">
        <motion.div
          className="mx-auto max-w-4xl space-y-4"
          initial="hidden"
          animate="show"
          variants={createStaggeredList(prefersReducedMotion ? 0 : 0.04)}
        >
          {loading && !sending ? (
            <div className="flex h-[60vh] items-center justify-center">
              <LoadingSpinner size="lg" />
            </div>
          ) : isEmpty ? (
            <WelcomeScreen />
          ) : (
            <>
              {messages.map((msg, idx) => (
                <ChatMessage
                  key={msg.id || `msg-${idx}`}
                  message={msg}
                  showThinking={showThinking}
                />
              ))}

              {/* Streaming message */}
              {shouldRenderStreaming && (
                <ChatMessage
                  message={
                    (streamMsg
                      ? {
                          ...(streamMsg as Record<string, unknown>),
                          role: (typeof streamMsg.role === "string"
                            ? streamMsg.role
                            : "assistant") as RawMessage["role"],
                          content: streamMsg.content ?? streamText,
                          timestamp: streamMsg.timestamp ?? streamingTimestamp,
                        }
                      : {
                          role: "assistant",
                          content: streamText,
                          timestamp: streamingTimestamp,
                        }) as RawMessage
                  }
                  showThinking={showThinking}
                  isStreaming
                  streamingTools={streamingTools}
                />
              )}

              {/* Activity indicator: waiting for next AI turn after tool execution */}
              {sending && pendingFinal && !shouldRenderStreaming && (
                <ActivityIndicator phase="tool_processing" />
              )}

              {/* Typing indicator when sending but no stream content yet */}
              {sending && !pendingFinal && !hasAnyStreamContent && (
                <TypingIndicator />
              )}
            </>
          )}

          {/* Scroll anchor */}
          <div ref={messagesEndRef} />
        </motion.div>
      </div>

      {error && (
        <motion.div
          className="border-t border-destructive/20 bg-destructive/10 px-4 py-2"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={motionTransition.gentle}
        >
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <p className="text-sm text-destructive flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              {error}
            </p>
            <button
              onClick={clearError}
              className="rounded-full px-2 py-1 text-xs text-destructive/60 underline transition-colors hover:text-destructive"
            >
              {t("common:actions.dismiss")}
            </button>
          </div>
        </motion.div>
      )}

      <ChatInput
        onSend={sendMessage}
        onStop={abortRun}
        disabled={!isGatewayRunning}
        sending={sending}
        isEmpty={isEmpty}
      />
    </div>
  );
}

// ── Welcome Screen ──────────────────────────────────────────────

function WelcomeScreen() {
  const { t } = useTranslation("chat");
  const prefersReducedMotion = useReducedMotion() ?? false;
  return (
    <motion.div
      className="flex h-[60vh] flex-col items-center justify-center text-center"
      initial="hidden"
      animate="show"
      variants={createStaggeredList(prefersReducedMotion ? 0 : 0.08)}
    >
      <motion.h1
        className="text-6xl md:text-7xl font-serif text-foreground mb-3 font-normal tracking-tight"
        style={{
          fontFamily: 'Georgia, Cambria, "Times New Roman", Times, serif',
        }}
        variants={motionVariants.softScale}
      >
        {t("welcome.title")}
      </motion.h1>
      <motion.p
        className="mb-8 text-[17px] font-medium text-foreground/80"
        variants={motionVariants.fadeUp}
      >
        {t("welcome.subtitle")}
      </motion.p>

      <motion.div
        className="flex w-full max-w-lg flex-wrap items-center justify-center gap-2.5"
        variants={createStaggeredList(prefersReducedMotion ? 0 : 0.05)}
      >
        {[
          t("welcome.askQuestions"),
          t("welcome.creativeTasks"),
          t("welcome.brainstorming"),
        ].map((label, i) => (
          <motion.button
            key={i}
            className="px-4 py-1.5 rounded-full border border-black/10 dark:border-white/10 text-[13px] font-medium text-foreground/70 hover:bg-black/5 dark:hover:bg-white/5 transition-colors bg-black/[0.02]"
            variants={motionVariants.fadeUp}
            whileHover={getHoverLift(prefersReducedMotion, {
              y: -2,
              scale: 1.02,
            })}
            whileTap={getTapScale(prefersReducedMotion)}
            transition={motionTransition.snappy}
          >
            {label}
          </motion.button>
        ))}
      </motion.div>
    </motion.div>
  );
}

// ── Typing Indicator ────────────────────────────────────────────

function TypingIndicator() {
  const prefersReducedMotion = useReducedMotion() ?? false;
  return (
    <motion.div
      className="flex gap-3"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={motionTransition.gentle}
    >
      <motion.div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white"
        animate={getFloatingAnimation(prefersReducedMotion, 2)}
        transition={getFloatingTransition(prefersReducedMotion, 2.4, 3.5)}
      >
        <Sparkles className="h-4 w-4" />
      </motion.div>
      <motion.div
        className="bg-muted rounded-2xl px-4 py-3"
        whileHover={getHoverLift(prefersReducedMotion, { y: -1, scale: 1.01 })}
        transition={motionTransition.gentle}
      >
        <div className="flex gap-1">
          <span
            className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce"
            style={{ animationDelay: "0ms" }}
          />
          <span
            className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce"
            style={{ animationDelay: "150ms" }}
          />
          <span
            className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce"
            style={{ animationDelay: "300ms" }}
          />
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Activity Indicator (shown between tool cycles) ─────────────

function ActivityIndicator({ phase }: { phase: "tool_processing" }) {
  const { t } = useTranslation("chat");
  const prefersReducedMotion = useReducedMotion() ?? false;
  void phase;
  return (
    <motion.div
      className="flex gap-3"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={motionTransition.gentle}
    >
      <motion.div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white"
        animate={getFloatingAnimation(prefersReducedMotion, 2)}
        transition={getFloatingTransition(prefersReducedMotion, 2.6, 4)}
      >
        <Sparkles className="h-4 w-4" />
      </motion.div>
      <motion.div
        className="bg-muted rounded-2xl px-4 py-3"
        whileHover={getHoverLift(prefersReducedMotion, { y: -1, scale: 1.01 })}
        transition={motionTransition.gentle}
      >
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          <span>{t("processingToolResults")}</span>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default Chat;
