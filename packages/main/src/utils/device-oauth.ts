/**
 * Device OAuth Manager
 *
 * Delegates MiniMax and Qwen OAuth to the OpenClaw extension oauth.ts functions
 * imported directly from the bundled openclaw package at build time.
 *
 * This approach:
 * - Avoids hardcoding client_id (lives in openclaw extension)
 * - Avoids duplicating HTTP OAuth logic
 * - Avoids spawning CLI process (which requires interactive TTY)
 * - Works identically on macOS, Windows, and Linux
 *
 * The extension oauth.ts files only use `node:crypto` and global `fetch` —
 * they are pure Node.js HTTP functions, no TTY, no prompter needed.
 *
 * We provide our own callbacks (openUrl/note/progress) that hook into
 * the Electron IPC system to display UI in the UfrenClaw frontend.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { EventEmitter } from "events";
import { BrowserWindow, shell } from "electron";
import { logger } from "./logger";
import { saveProvider, getProvider, ProviderConfig } from "./secure-storage";
import { getProviderDefaultModel } from "./provider-registry";
import { getOpenClawResolvedDir, isOpenClawPresent } from "./paths";
import {
  saveOAuthTokenToOpenClaw,
  setOpenClawDefaultModelWithOverride,
} from "./openclaw-auth";
import { proxyAwareFetch } from "./proxy-fetch";

export type OAuthProviderType =
  | "minimax-portal"
  | "minimax-portal-cn"
  | "qwen-portal";
export type MiniMaxRegion = "cn" | "global";

export interface MiniMaxOAuthToken {
  access: string;
  refresh: string;
  expires: number;
  resourceUrl?: string;
  notification_message?: string;
}

interface QwenOAuthToken {
  access: string;
  refresh: string;
  expires: number;
  resourceUrl?: string;
}

interface OAuthProgress {
  update: (message: string) => void;
  stop: (message?: string) => void;
}

interface OAuthInteractiveOptions {
  openUrl: (url: string) => Promise<void>;
  note: (message: string, title?: string) => Promise<void>;
  progress: OAuthProgress;
}

interface MiniMaxOAuthOptions extends OAuthInteractiveOptions {
  region?: MiniMaxRegion;
}

type QwenOAuthOptions = OAuthInteractiveOptions;

type LegacyQwenPortalOAuthModule = {
  loginQwenPortalOAuth: (options: QwenOAuthOptions) => Promise<QwenOAuthToken>;
};

type TokenResult =
  | { status: "success"; token: MiniMaxOAuthToken }
  | { status: "pending"; message?: string }
  | { status: "error"; message: string };

const require = createRequire(import.meta.url);

const MINIMAX_OAUTH_CONFIG = {
  cn: {
    baseUrl: "https://api.minimaxi.com",
    clientId: "78257093-7e40-4613-99e0-527b14b39113",
  },
  global: {
    baseUrl: "https://api.minimax.io",
    clientId: "78257093-7e40-4613-99e0-527b14b39113",
  },
} as const;

const MINIMAX_OAUTH_SCOPE = "group_id profile model.completion";
const MINIMAX_OAUTH_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:user_code";

let cachedLegacyQwenPortalOAuth:
  | Promise<LegacyQwenPortalOAuthModule>
  | undefined;

// ─────────────────────────────────────────────────────────────
// DeviceOAuthManager
// ─────────────────────────────────────────────────────────────

class DeviceOAuthManager extends EventEmitter {
  private activeProvider: OAuthProviderType | null = null;
  private activeAccountId: string | null = null;
  private activeLabel: string | null = null;
  private active: boolean = false;
  private mainWindow: BrowserWindow | null = null;

  setWindow(window: BrowserWindow) {
    this.mainWindow = window;
  }

  async startFlow(
    provider: OAuthProviderType,
    region: MiniMaxRegion = "global",
    options?: { accountId?: string; label?: string },
  ): Promise<boolean> {
    if (this.active) {
      await this.stopFlow();
    }

    this.active = true;
    this.emit("oauth:start", {
      provider,
      accountId: options?.accountId || provider,
    });
    this.activeProvider = provider;
    this.activeAccountId = options?.accountId || provider;
    this.activeLabel = options?.label || null;

    try {
      if (provider === "minimax-portal" || provider === "minimax-portal-cn") {
        const actualRegion =
          provider === "minimax-portal-cn" ? "cn" : region || "global";
        await this.runMiniMaxFlow(actualRegion, provider);
      } else if (provider === "qwen-portal") {
        await this.runQwenFlow();
      } else {
        throw new Error(`Unsupported OAuth provider type: ${provider}`);
      }
      return true;
    } catch (error) {
      if (!this.active) {
        // Flow was cancelled — not an error
        return false;
      }
      logger.error(`[DeviceOAuth] Flow error for ${provider}:`, error);
      this.emitError(error instanceof Error ? error.message : String(error));
      this.active = false;
      this.activeProvider = null;
      this.activeAccountId = null;
      this.activeLabel = null;
      return false;
    }
  }

  async stopFlow(): Promise<void> {
    this.active = false;
    this.activeProvider = null;
    this.activeAccountId = null;
    this.activeLabel = null;
    logger.info("[DeviceOAuth] Flow explicitly stopped");
  }

  // ─────────────────────────────────────────────────────────
  // MiniMax flow
  // ─────────────────────────────────────────────────────────

  private async runMiniMaxFlow(
    region?: MiniMaxRegion,
    providerType: OAuthProviderType = "minimax-portal",
  ): Promise<void> {
    if (!isOpenClawPresent()) {
      throw new Error("OpenClaw package not found");
    }
    const provider = this.activeProvider!;

    const token: MiniMaxOAuthToken = await loginMiniMaxPortalOAuth({
      region,
      openUrl: async (url) => {
        logger.info(`[DeviceOAuth] MiniMax opening browser: ${url}`);
        // Open the authorization URL in the system browser
        shell
          .openExternal(url)
          .catch((err) =>
            logger.warn(`[DeviceOAuth] Failed to open browser:`, err),
          );
      },
      note: async (message, _title) => {
        if (!this.active) return;
        // The extension calls note() with a message containing
        // the user_code and verification_uri — parse them for the UI
        const { verificationUri, userCode } = this.parseNote(message);
        if (verificationUri && userCode) {
          this.emitCode({
            provider,
            verificationUri,
            userCode,
            expiresIn: 300,
          });
        } else {
          logger.info(`[DeviceOAuth] MiniMax note: ${message}`);
        }
      },
      progress: {
        update: (msg) => logger.info(`[DeviceOAuth] MiniMax progress: ${msg}`),
        stop: (msg) =>
          logger.info(`[DeviceOAuth] MiniMax progress done: ${msg ?? ""}`),
      },
    });

    if (!this.active) return;

    await this.onSuccess(providerType, {
      access: token.access,
      refresh: token.refresh,
      expires: token.expires,
      // MiniMax returns a per-account resourceUrl as the API base URL
      resourceUrl: token.resourceUrl,
      // Revert back to anthropic-messages
      api: "anthropic-messages",
      region,
    });
  }

  // ─────────────────────────────────────────────────────────
  // Qwen flow
  // ─────────────────────────────────────────────────────────

  private async runQwenFlow(): Promise<void> {
    if (!isOpenClawPresent()) {
      throw new Error("OpenClaw package not found");
    }
    const provider = this.activeProvider!;

    const token: QwenOAuthToken = await loginQwenPortalOAuth({
      openUrl: async (url) => {
        logger.info(`[DeviceOAuth] Qwen opening browser: ${url}`);
        shell
          .openExternal(url)
          .catch((err) =>
            logger.warn(`[DeviceOAuth] Failed to open browser:`, err),
          );
      },
      note: async (message, _title) => {
        if (!this.active) return;
        const { verificationUri, userCode } = this.parseNote(message);
        if (verificationUri && userCode) {
          this.emitCode({
            provider,
            verificationUri,
            userCode,
            expiresIn: 300,
          });
        } else {
          logger.info(`[DeviceOAuth] Qwen note: ${message}`);
        }
      },
      progress: {
        update: (msg) => logger.info(`[DeviceOAuth] Qwen progress: ${msg}`),
        stop: (msg) =>
          logger.info(`[DeviceOAuth] Qwen progress done: ${msg ?? ""}`),
      },
    });

    if (!this.active) return;

    await this.onSuccess("qwen-portal", {
      access: token.access,
      refresh: token.refresh,
      expires: token.expires,
      // Qwen returns a per-account resourceUrl as the API base URL
      resourceUrl: token.resourceUrl,
      // Qwen uses OpenAI Completions API format
      api: "openai-completions",
    });
  }

  // ─────────────────────────────────────────────────────────
  // Success handler
  // ─────────────────────────────────────────────────────────

  private async onSuccess(
    providerType: OAuthProviderType,
    token: {
      access: string;
      refresh: string;
      expires: number;
      resourceUrl?: string;
      api: "anthropic-messages" | "openai-completions";
      region?: MiniMaxRegion;
    },
  ) {
    const accountId = this.activeAccountId || providerType;
    const accountLabel = this.activeLabel;
    this.active = false;
    this.activeProvider = null;
    this.activeAccountId = null;
    this.activeLabel = null;
    logger.info(
      `[DeviceOAuth] Successfully completed OAuth for ${providerType}`,
    );

    // 1. Write OAuth token to OpenClaw's auth-profiles.json in native OAuth format.
    //    (matches what `openclaw models auth login` → upsertAuthProfile writes).
    //    We save both MiniMax providers to the generic "minimax-portal" profile
    //    so OpenClaw's gateway auto-refresher knows how to find it.
    try {
      const tokenProviderId = providerType.startsWith("minimax-portal")
        ? "minimax-portal"
        : providerType;
      await saveOAuthTokenToOpenClaw(tokenProviderId, {
        access: token.access,
        refresh: token.refresh,
        expires: token.expires,
      });
    } catch (err) {
      logger.warn(`[DeviceOAuth] Failed to save OAuth token to OpenClaw:`, err);
    }

    // 2. Write openclaw.json: set default model + provider config (baseUrl/api/models)
    //    This mirrors what the OpenClaw plugin's configPatch does after CLI login.
    //    The baseUrl comes from token.resourceUrl (per-account URL from the OAuth server)
    //    or falls back to the provider's default public endpoint.
    const defaultBaseUrl =
      providerType === "minimax-portal"
        ? "https://api.minimax.io/anthropic"
        : providerType === "minimax-portal-cn"
          ? "https://api.minimaxi.com/anthropic"
          : "https://portal.qwen.ai/v1";

    let baseUrl = token.resourceUrl || defaultBaseUrl;

    // Ensure baseUrl has a protocol prefix
    if (
      baseUrl &&
      !baseUrl.startsWith("http://") &&
      !baseUrl.startsWith("https://")
    ) {
      baseUrl = "https://" + baseUrl;
    }

    // Ensure the base URL ends with /anthropic
    if (providerType.startsWith("minimax-portal") && baseUrl) {
      baseUrl =
        baseUrl
          .replace(/\/v1$/, "")
          .replace(/\/anthropic$/, "")
          .replace(/\/$/, "") + "/anthropic";
    } else if (providerType === "qwen-portal" && baseUrl) {
      // Ensure Qwen API gets /v1 at the end
      if (!baseUrl.endsWith("/v1")) {
        baseUrl = baseUrl.replace(/\/$/, "") + "/v1";
      }
    }

    try {
      const tokenProviderId = providerType.startsWith("minimax-portal")
        ? "minimax-portal"
        : providerType;
      await setOpenClawDefaultModelWithOverride(tokenProviderId, undefined, {
        baseUrl,
        api: token.api,
        // Tells OpenClaw's anthropic adapter to use `Authorization: Bearer` instead of `x-api-key`
        authHeader: providerType.startsWith("minimax-portal")
          ? true
          : undefined,
        // OAuth placeholder — tells Gateway to resolve credentials
        // from auth-profiles.json (type: 'oauth') instead of a static API key.
        apiKeyEnv:
          tokenProviderId === "minimax-portal" ? "minimax-oauth" : "qwen-oauth",
      });
    } catch (err) {
      logger.warn(`[DeviceOAuth] Failed to configure openclaw models:`, err);
    }

    // 3. Save provider record in UfrenClaw's own store so UI shows it as configured
    const existing = await getProvider(accountId);
    const nameMap: Record<OAuthProviderType, string> = {
      "minimax-portal": "MiniMax (Global)",
      "minimax-portal-cn": "MiniMax (CN)",
      "qwen-portal": "Qwen",
    };
    const providerConfig: ProviderConfig = {
      id: accountId,
      name:
        accountLabel ||
        nameMap[providerType as OAuthProviderType] ||
        providerType,
      type: providerType,
      enabled: existing?.enabled ?? true,
      baseUrl, // Save the dynamically resolved URL (Global vs CN)

      model: existing?.model || getProviderDefaultModel(providerType),
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveProvider(providerConfig);

    // 4. Emit success internally so the main process can restart the Gateway
    this.emit("oauth:success", { provider: providerType, accountId });

    // 5. Emit success to frontend
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send("oauth:success", {
        provider: providerType,
        accountId,
        success: true,
      });
    }
  }

  // ─────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────

  /**
   * Parse user_code and verification_uri from the note message sent by
   * the OpenClaw extension's loginXxxPortalOAuth function.
   *
   * Note format (minimax-portal-auth/oauth.ts):
   *   "Open https://platform.minimax.io/oauth-authorize?user_code=dyMj_wOhpK&client=... to approve access.\n"
   *   "If prompted, enter the code dyMj_wOhpK.\n"
   *   ...
   *
   * user_code format: mixed-case alphanumeric with underscore, e.g. "dyMj_wOhpK"
   */
  private parseNote(message: string): {
    verificationUri?: string;
    userCode?: string;
  } {
    // Primary: extract URL (everything between "Open " and " to")
    const urlMatch = message.match(/Open\s+(https?:\/\/\S+?)\s+to/i);
    const verificationUri = urlMatch?.[1];

    let userCode: string | undefined;

    // Method 1: extract user_code from URL query param (most reliable)
    if (verificationUri) {
      try {
        const parsed = new URL(verificationUri);
        const qp = parsed.searchParams.get("user_code");
        if (qp) userCode = qp;
      } catch {
        // fall through to text-based extraction
      }
    }

    // Method 2: text-based extraction — matches mixed-case alnum + underscore/hyphen codes
    if (!userCode) {
      const codeMatch = message.match(
        /enter.*?code\s+([A-Za-z0-9][A-Za-z0-9_-]{3,})/i,
      );
      if (codeMatch?.[1]) userCode = codeMatch[1].replace(/\.$/, ""); // strip trailing period
    }

    return { verificationUri, userCode };
  }

  private emitCode(data: {
    provider: string;
    verificationUri: string;
    userCode: string;
    expiresIn: number;
  }) {
    this.emit("oauth:code", data);
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send("oauth:code", data);
    }
  }

  private emitError(message: string) {
    this.emit("oauth:error", { message });
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send("oauth:error", { message });
    }
  }
}

function getMiniMaxOAuthEndpoints(region: MiniMaxRegion) {
  const config = MINIMAX_OAUTH_CONFIG[region];
  return {
    codeEndpoint: `${config.baseUrl}/oauth/code`,
    tokenEndpoint: `${config.baseUrl}/oauth/token`,
    clientId: config.clientId,
  };
}

function generatePkce(): {
  verifier: string;
  challenge: string;
  state: string;
} {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(16).toString("base64url");
  return { verifier, challenge, state };
}

function toFormUrlEncoded(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}

async function requestMiniMaxOAuthCode(params: {
  challenge: string;
  state: string;
  region: MiniMaxRegion;
}): Promise<{
  user_code: string;
  verification_uri: string;
  expired_in: number;
  interval?: number;
  state: string;
}> {
  const endpoints = getMiniMaxOAuthEndpoints(params.region);
  const response = await proxyAwareFetch(endpoints.codeEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "x-request-id": randomUUID(),
    },
    body: toFormUrlEncoded({
      response_type: "code",
      client_id: endpoints.clientId,
      scope: MINIMAX_OAUTH_SCOPE,
      code_challenge: params.challenge,
      code_challenge_method: "S256",
      state: params.state,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `MiniMax OAuth authorization failed: ${text || response.statusText}`,
    );
  }

  const payload = (await response.json()) as {
    user_code?: string;
    verification_uri?: string;
    expired_in?: number;
    interval?: number;
    state?: string;
    error?: string;
  };

  if (!payload.user_code || !payload.verification_uri || !payload.expired_in) {
    throw new Error(
      payload.error ??
        "MiniMax OAuth authorization returned an incomplete payload.",
    );
  }

  if (payload.state !== params.state) {
    throw new Error("MiniMax OAuth state mismatch.");
  }

  return {
    user_code: payload.user_code,
    verification_uri: payload.verification_uri,
    expired_in: payload.expired_in,
    interval: payload.interval,
    state: payload.state,
  };
}

async function pollMiniMaxOAuthToken(params: {
  userCode: string;
  verifier: string;
  region: MiniMaxRegion;
}): Promise<TokenResult> {
  const endpoints = getMiniMaxOAuthEndpoints(params.region);
  const response = await proxyAwareFetch(endpoints.tokenEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: toFormUrlEncoded({
      grant_type: MINIMAX_OAUTH_GRANT_TYPE,
      client_id: endpoints.clientId,
      user_code: params.userCode,
      code_verifier: params.verifier,
    }),
  });

  const text = await response.text();
  let payload:
    | {
        status?: string;
        base_resp?: { status_code?: number; status_msg?: string };
        access_token?: string | null;
        refresh_token?: string | null;
        expired_in?: number | null;
        resource_url?: string;
        notification_message?: string;
      }
    | undefined;

  if (text) {
    try {
      payload = JSON.parse(text) as typeof payload;
    } catch {
      payload = undefined;
    }
  }

  if (!response.ok) {
    return {
      status: "error",
      message:
        (payload?.base_resp?.status_msg ?? text) ||
        "MiniMax OAuth failed to parse response.",
    };
  }

  if (!payload) {
    return {
      status: "error",
      message: "MiniMax OAuth failed to parse response.",
    };
  }

  if (payload.status === "error") {
    return {
      status: "error",
      message: "An error occurred. Please try again later",
    };
  }

  if (payload.status !== "success") {
    return {
      status: "pending",
      message: "current user code is not authorized",
    };
  }

  if (!payload.access_token || !payload.refresh_token || !payload.expired_in) {
    return {
      status: "error",
      message: "MiniMax OAuth returned incomplete token payload.",
    };
  }

  return {
    status: "success",
    token: {
      access: payload.access_token,
      refresh: payload.refresh_token,
      expires: payload.expired_in,
      resourceUrl: payload.resource_url,
      notification_message: payload.notification_message,
    },
  };
}

async function loginMiniMaxPortalOAuth(
  options: MiniMaxOAuthOptions,
): Promise<MiniMaxOAuthToken> {
  const region = options.region ?? "global";
  const { verifier, challenge, state } = generatePkce();
  const oauth = await requestMiniMaxOAuthCode({ challenge, state, region });
  const verificationUrl = oauth.verification_uri;

  await options.note(
    [
      `Open ${verificationUrl} to approve access.`,
      `If prompted, enter the code ${oauth.user_code}.`,
      `Interval: ${oauth.interval ?? "default (2000ms)"}, Expires at: ${oauth.expired_in} unix timestamp`,
    ].join("\n"),
    "MiniMax OAuth",
  );

  try {
    await options.openUrl(verificationUrl);
  } catch {}

  let pollIntervalMs = oauth.interval ?? 2000;
  const expireTimeMs = oauth.expired_in;

  while (Date.now() < expireTimeMs) {
    options.progress.update("Waiting for MiniMax OAuth approval…");
    const result = await pollMiniMaxOAuthToken({
      userCode: oauth.user_code,
      verifier,
      region,
    });

    if (result.status === "success") {
      options.progress.stop();
      return result.token;
    }

    if (result.status === "error") {
      options.progress.stop(result.message);
      throw new Error(result.message);
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    pollIntervalMs = Math.max(pollIntervalMs, 2000);
  }

  options.progress.stop("MiniMax OAuth timed out");
  throw new Error("MiniMax OAuth timed out before authorization completed.");
}

function getLegacyQwenPortalOAuthCandidatePaths(): string[] {
  const openclawResolvedPath = getOpenClawResolvedDir();
  const localOpenclawRoot = dirname(require.resolve("openclaw/package.json"));

  return [
    join(openclawResolvedPath, "extensions", "qwen-portal-auth", "oauth.js"),
    join(openclawResolvedPath, "extensions", "qwen-portal-auth", "oauth.mjs"),
    join(
      openclawResolvedPath,
      "dist",
      "extensions",
      "qwen-portal-auth",
      "oauth.js",
    ),
    join(localOpenclawRoot, "extensions", "qwen-portal-auth", "oauth.js"),
    join(localOpenclawRoot, "extensions", "qwen-portal-auth", "oauth.mjs"),
    join(
      localOpenclawRoot,
      "dist",
      "extensions",
      "qwen-portal-auth",
      "oauth.js",
    ),
  ];
}

async function loadLegacyQwenPortalOAuth(): Promise<LegacyQwenPortalOAuthModule> {
  cachedLegacyQwenPortalOAuth ??= (async () => {
    for (const candidatePath of getLegacyQwenPortalOAuthCandidatePaths()) {
      if (!existsSync(candidatePath)) continue;
      const module = (await import(
        /* @vite-ignore */ pathToFileURL(candidatePath).href
      )) as {
        loginQwenPortalOAuth?: LegacyQwenPortalOAuthModule["loginQwenPortalOAuth"];
      };
      if (typeof module.loginQwenPortalOAuth === "function") {
        return {
          loginQwenPortalOAuth: module.loginQwenPortalOAuth,
        };
      }
    }

    throw new Error(
      "Qwen Portal OAuth is no longer shipped by the installed OpenClaw package. Please use Model Studio or API key authentication instead.",
    );
  })();

  return cachedLegacyQwenPortalOAuth;
}

async function loginQwenPortalOAuth(
  options: QwenOAuthOptions,
): Promise<QwenOAuthToken> {
  const module = await loadLegacyQwenPortalOAuth();
  return module.loginQwenPortalOAuth(options);
}

export const deviceOAuthManager = new DeviceOAuthManager();
