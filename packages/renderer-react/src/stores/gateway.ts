/**
 * Gateway State Store
 * Uses Host API + SSE for lifecycle/status and a direct renderer WebSocket for runtime RPC.
 */
import { create } from "zustand";
import { hostApiFetch } from "@/lib/host-api";
import { invokeIpc } from "@/lib/api-client";
import { subscribeHostEvent } from "@/lib/host-events";
import type {
  GatewayApprovalDecision,
  GatewayApprovalKind,
  GatewayApprovalRequest,
  GatewayStatus,
} from "../types/gateway";

let gatewayInitPromise: Promise<void> | null = null;
let gatewayEventUnsubscribers: Array<() => void> | null = null;

interface GatewayHealth {
  ok: boolean;
  error?: string;
  uptime?: number;
}

interface GatewayState {
  status: GatewayStatus;
  health: GatewayHealth | null;
  isInitialized: boolean;
  lastError: string | null;
  pendingApprovals: GatewayApprovalRequest[];
  init: () => Promise<void>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  restart: () => Promise<void>;
  checkHealth: () => Promise<GatewayHealth>;
  rpc: <T>(method: string, params?: unknown, timeoutMs?: number) => Promise<T>;
  resolveApproval: (
    approvalId: string,
    decision: GatewayApprovalDecision,
  ) => Promise<void>;
  setStatus: (status: GatewayStatus) => void;
  clearError: () => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function toOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function upsertPendingApproval(
  approvals: GatewayApprovalRequest[],
  approval: GatewayApprovalRequest,
): GatewayApprovalRequest[] {
  return [
    ...approvals.filter((item) => item.id !== approval.id),
    approval,
  ].sort((left, right) => (right.createdAtMs ?? 0) - (left.createdAtMs ?? 0));
}

function removePendingApproval(
  approvals: GatewayApprovalRequest[],
  approvalId: string,
): GatewayApprovalRequest[] {
  return approvals.filter((item) => item.id !== approvalId);
}

function isApprovalLookupError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return /approval.*not found|APPROVAL_NOT_FOUND|expired/i.test(message);
}

function buildApprovalResolveMethods(
  approval: GatewayApprovalRequest,
): string[] {
  const preferredKind: GatewayApprovalKind =
    approval.id.startsWith("plugin:") || approval.kind === "plugin"
      ? "plugin"
      : "exec";
  const fallbackKind: GatewayApprovalKind =
    preferredKind === "plugin" ? "exec" : "plugin";

  return [
    `${preferredKind}.approval.resolve`,
    `${fallbackKind}.approval.resolve`,
  ];
}

function normalizeApprovalRequest(
  kind: GatewayApprovalKind,
  payload: Record<string, unknown>,
): GatewayApprovalRequest | null {
  const id = toOptionalString(payload.id);
  if (!id) {
    return null;
  }

  const request = isRecord(payload.request) ? payload.request : {};
  const systemRunPlan = isRecord(request.systemRunPlan)
    ? request.systemRunPlan
    : null;
  const commandArgv =
    toStringArray(request.commandArgv).length > 0
      ? toStringArray(request.commandArgv)
      : toStringArray(systemRunPlan?.commandArgv ?? systemRunPlan?.argv);
  const commandText =
    toOptionalString(systemRunPlan?.commandText) ??
    toOptionalString(request.command) ??
    (commandArgv.length > 0 ? commandArgv.join(" ") : null);
  const commandPreview =
    toOptionalString(systemRunPlan?.commandPreview) ?? commandText;

  return {
    id,
    kind,
    request,
    createdAtMs: toOptionalNumber(payload.createdAtMs),
    expiresAtMs: toOptionalNumber(payload.expiresAtMs),
    title: toOptionalString(request.title),
    description:
      toOptionalString(request.description) ??
      toOptionalString(systemRunPlan?.reason),
    severity: toOptionalString(request.severity),
    toolName: toOptionalString(request.toolName),
    pluginId: toOptionalString(request.pluginId),
    commandText,
    commandPreview,
    commandArgv,
    cwd:
      toOptionalString(request.cwd) ??
      toOptionalString(systemRunPlan?.workingDirectory),
    host: toOptionalString(request.host),
    nodeId: toOptionalString(request.nodeId),
    agentId: toOptionalString(request.agentId),
    sessionKey: toOptionalString(request.sessionKey),
    timeoutMs:
      toOptionalNumber(request.timeoutMs) ??
      toOptionalNumber(systemRunPlan?.timeoutMs),
    resolving: false,
    error: null,
  };
}

function handleGatewayApprovalNotification(
  notification:
    | { method?: string; params?: Record<string, unknown> }
    | undefined,
): boolean {
  if (!notification || typeof notification.method !== "string") {
    return false;
  }

  if (
    notification.method !== "exec.approval.requested" &&
    notification.method !== "plugin.approval.requested" &&
    notification.method !== "exec.approval.resolved" &&
    notification.method !== "plugin.approval.resolved"
  ) {
    return false;
  }

  if (!isRecord(notification.params)) {
    return true;
  }

  if (notification.method.endsWith(".requested")) {
    const kind: GatewayApprovalKind = notification.method.startsWith("plugin.")
      ? "plugin"
      : "exec";
    const approval = normalizeApprovalRequest(kind, notification.params);
    if (!approval) {
      return true;
    }
    useGatewayStore.setState((state) => ({
      pendingApprovals: upsertPendingApproval(state.pendingApprovals, approval),
    }));
    return true;
  }

  const approvalId = toOptionalString(notification.params.id);
  if (!approvalId) {
    return true;
  }

  useGatewayStore.setState((state) => ({
    pendingApprovals: removePendingApproval(state.pendingApprovals, approvalId),
  }));
  return true;
}

function handleGatewayNotification(
  notification:
    | { method?: string; params?: Record<string, unknown> }
    | undefined,
): void {
  const payload = notification;
  if (handleGatewayApprovalNotification(payload)) {
    return;
  }
  if (
    !payload ||
    payload.method !== "agent" ||
    !payload.params ||
    typeof payload.params !== "object"
  ) {
    return;
  }

  const p = payload.params;
  const data =
    p.data && typeof p.data === "object"
      ? (p.data as Record<string, unknown>)
      : {};
  const phase = data.phase ?? p.phase;
  const hasChatData = (p.state ?? data.state) || (p.message ?? data.message);

  if (hasChatData) {
    const normalizedEvent: Record<string, unknown> = {
      ...data,
      runId: p.runId ?? data.runId,
      sessionKey: p.sessionKey ?? data.sessionKey,
      stream: p.stream ?? data.stream,
      seq: p.seq ?? data.seq,
      state: p.state ?? data.state,
      message: p.message ?? data.message,
    };
    import("./chat")
      .then(({ useChatStore }) => {
        useChatStore.getState().handleChatEvent(normalizedEvent);
      })
      .catch(() => {});
  }

  const runId = p.runId ?? data.runId;
  const sessionKey = p.sessionKey ?? data.sessionKey;
  if (phase === "started" && runId != null && sessionKey != null) {
    import("./chat")
      .then(({ useChatStore }) => {
        useChatStore.getState().handleChatEvent({
          state: "started",
          runId,
          sessionKey,
        });
      })
      .catch(() => {});
  }

  if (
    phase === "completed" ||
    phase === "done" ||
    phase === "finished" ||
    phase === "end"
  ) {
    import("./chat")
      .then(({ useChatStore }) => {
        const state = useChatStore.getState();
        state.loadHistory(true);
        if (state.sending) {
          useChatStore.setState({
            sending: false,
            activeRunId: null,
            pendingFinal: false,
            lastUserMessageAt: null,
          });
        }
      })
      .catch(() => {});
  }
}

function handleGatewayChatMessage(data: unknown): void {
  import("./chat")
    .then(({ useChatStore }) => {
      const chatData = data as Record<string, unknown>;
      const payload =
        "message" in chatData && typeof chatData.message === "object"
          ? (chatData.message as Record<string, unknown>)
          : chatData;

      if (payload.state) {
        useChatStore.getState().handleChatEvent(payload);
        return;
      }

      useChatStore.getState().handleChatEvent({
        state: "final",
        message: payload,
        runId: chatData.runId ?? payload.runId,
      });
    })
    .catch(() => {});
}

function mapChannelStatus(
  status: string,
): "connected" | "connecting" | "disconnected" | "error" {
  switch (status) {
    case "connected":
    case "running":
      return "connected";
    case "connecting":
    case "starting":
      return "connecting";
    case "error":
    case "failed":
      return "error";
    default:
      return "disconnected";
  }
}

export const useGatewayStore = create<GatewayState>((set, get) => ({
  status: {
    state: "stopped",
    port: 18789,
  },
  health: null,
  isInitialized: false,
  lastError: null,
  pendingApprovals: [],

  init: async () => {
    if (get().isInitialized) return;
    if (gatewayInitPromise) {
      await gatewayInitPromise;
      return;
    }

    gatewayInitPromise = (async () => {
      try {
        const status = await hostApiFetch<GatewayStatus>("/api/gateway/status");
        set({ status, isInitialized: true });

        if (!gatewayEventUnsubscribers) {
          const unsubscribers: Array<() => void> = [];
          unsubscribers.push(
            subscribeHostEvent<GatewayStatus>("gateway:status", (payload) => {
              set({ status: payload });
            }),
          );
          unsubscribers.push(
            subscribeHostEvent<{ message?: string }>(
              "gateway:error",
              (payload) => {
                set({ lastError: payload.message || "Gateway error" });
              },
            ),
          );
          unsubscribers.push(
            subscribeHostEvent<{
              method?: string;
              params?: Record<string, unknown>;
            }>("gateway:notification", (payload) => {
              handleGatewayNotification(payload);
            }),
          );
          unsubscribers.push(
            subscribeHostEvent("gateway:chat-message", (payload) => {
              handleGatewayChatMessage(payload);
            }),
          );
          unsubscribers.push(
            subscribeHostEvent<{ channelId?: string; status?: string }>(
              "gateway:channel-status",
              (update) => {
                import("./channels")
                  .then(({ useChannelsStore }) => {
                    if (!update.channelId || !update.status) return;
                    const state = useChannelsStore.getState();
                    const channel = state.channels.find(
                      (item) => item.type === update.channelId,
                    );
                    if (channel) {
                      state.updateChannel(channel.id, {
                        status: mapChannelStatus(update.status),
                      });
                    }
                  })
                  .catch(() => {});
              },
            ),
          );
          gatewayEventUnsubscribers = unsubscribers;
        }
      } catch (error) {
        console.error("Failed to initialize Gateway:", error);
        set({ lastError: String(error) });
      } finally {
        gatewayInitPromise = null;
      }
    })();

    await gatewayInitPromise;
  },

  start: async () => {
    try {
      set({ status: { ...get().status, state: "starting" }, lastError: null });
      const result = await hostApiFetch<{ success: boolean; error?: string }>(
        "/api/gateway/start",
        {
          method: "POST",
        },
      );
      if (!result.success) {
        set({
          status: { ...get().status, state: "error", error: result.error },
          lastError: result.error || "Failed to start Gateway",
        });
      }
    } catch (error) {
      set({
        status: { ...get().status, state: "error", error: String(error) },
        lastError: String(error),
      });
    }
  },

  stop: async () => {
    try {
      await hostApiFetch("/api/gateway/stop", { method: "POST" });
      set({ status: { ...get().status, state: "stopped" }, lastError: null });
    } catch (error) {
      console.error("Failed to stop Gateway:", error);
      set({ lastError: String(error) });
    }
  },

  restart: async () => {
    try {
      set({ status: { ...get().status, state: "starting" }, lastError: null });
      const result = await hostApiFetch<{ success: boolean; error?: string }>(
        "/api/gateway/restart",
        {
          method: "POST",
        },
      );
      if (!result.success) {
        set({
          status: { ...get().status, state: "error", error: result.error },
          lastError: result.error || "Failed to restart Gateway",
        });
      }
    } catch (error) {
      set({
        status: { ...get().status, state: "error", error: String(error) },
        lastError: String(error),
      });
    }
  },

  checkHealth: async () => {
    try {
      const result = await hostApiFetch<GatewayHealth>("/api/gateway/health");
      set({ health: result });
      return result;
    } catch (error) {
      const health: GatewayHealth = { ok: false, error: String(error) };
      set({ health });
      return health;
    }
  },

  rpc: async <T>(
    method: string,
    params?: unknown,
    timeoutMs?: number,
  ): Promise<T> => {
    const response = await invokeIpc<{
      success: boolean;
      result?: T;
      error?: string;
    }>("gateway:rpc", method, params, timeoutMs);
    if (!response.success) {
      throw new Error(response.error || `Gateway RPC failed: ${method}`);
    }
    return response.result as T;
  },

  resolveApproval: async (
    approvalId: string,
    decision: GatewayApprovalDecision,
  ) => {
    const approval = get().pendingApprovals.find(
      (item) => item.id === approvalId,
    );
    if (!approval) {
      throw new Error(`Approval request not found: ${approvalId}`);
    }

    set((state) => ({
      pendingApprovals: state.pendingApprovals.map((item) =>
        item.id === approvalId
          ? { ...item, resolving: true, error: null }
          : item,
      ),
    }));

    const methods = buildApprovalResolveMethods(approval);
    let lastError: unknown = null;

    for (const method of methods) {
      try {
        await get().rpc(method, { id: approvalId, decision });
        set((state) => ({
          pendingApprovals: removePendingApproval(
            state.pendingApprovals,
            approvalId,
          ),
        }));
        return;
      } catch (error) {
        lastError = error;
        if (!isApprovalLookupError(error)) {
          break;
        }
      }
    }

    const message =
      lastError instanceof Error
        ? lastError.message
        : typeof lastError === "string"
          ? lastError
          : "Failed to resolve approval request";

    set((state) => ({
      pendingApprovals: state.pendingApprovals.map((item) =>
        item.id === approvalId
          ? { ...item, resolving: false, error: message }
          : item,
      ),
    }));

    throw new Error(message);
  },

  setStatus: (status) => set({ status }),
  clearError: () => set({ lastError: null }),
}));
