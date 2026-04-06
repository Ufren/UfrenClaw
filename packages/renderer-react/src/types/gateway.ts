/**
 * Gateway Type Definitions
 * Types for Gateway communication and data structures
 */

/**
 * Gateway connection status
 */
export interface GatewayStatus {
  state: "stopped" | "starting" | "running" | "error" | "reconnecting";
  port: number;
  pid?: number;
  uptime?: number;
  error?: string;
  connectedAt?: number;
  version?: string;
  reconnectAttempts?: number;
}

/**
 * Gateway RPC response
 */
export interface GatewayRpcResponse<T = unknown> {
  success: boolean;
  result?: T;
  error?: string;
}

/**
 * Gateway health check response
 */
export interface GatewayHealth {
  ok: boolean;
  error?: string;
  uptime?: number;
  version?: string;
}

/**
 * Gateway notification (server-initiated event)
 */
export interface GatewayNotification {
  method: string;
  params?: unknown;
}

export type GatewayApprovalKind = "exec" | "plugin";

export type GatewayApprovalDecision = "allow-once" | "allow-always" | "deny";

export interface GatewayApprovalRequest {
  id: string;
  kind: GatewayApprovalKind;
  request: Record<string, unknown>;
  createdAtMs?: number;
  expiresAtMs?: number;
  title?: string | null;
  description?: string | null;
  severity?: string | null;
  toolName?: string | null;
  pluginId?: string | null;
  commandText?: string | null;
  commandPreview?: string | null;
  commandArgv: string[];
  cwd?: string | null;
  host?: string | null;
  nodeId?: string | null;
  agentId?: string | null;
  sessionKey?: string | null;
  timeoutMs?: number | null;
  resolving: boolean;
  error: string | null;
}

/**
 * Provider configuration
 */
export interface ProviderConfig {
  id: string;
  name: string;
  type: "openai" | "anthropic" | "ollama" | "custom";
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  enabled: boolean;
}
