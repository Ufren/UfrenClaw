import type { IncomingMessage, ServerResponse } from "http";
import { app } from "electron";
import { existsSync, cpSync, mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import {
  deleteChannelConfig,
  getChannelFormValues,
  listConfiguredChannels,
  OPENCLAW_WECHAT_CHANNEL_TYPE,
  saveChannelConfig,
  setChannelEnabled,
  UI_WECHAT_CHANNEL_TYPE,
  validateChannelConfig,
  validateChannelCredentials,
} from "../../utils/channel-config";
import { clearAllBindingsForChannel } from "../../utils/agent-config";
import {
  cancelWeChatLoginSession,
  normalizeOpenClawAccountId,
  saveWeChatAccountState,
  startWeChatLoginSession,
  waitForWeChatLoginSession,
} from "../../utils/wechat-login";
import { whatsAppLoginManager } from "../../utils/whatsapp-login";
import type { HostApiContext } from "../context";
import { parseJsonBody, sendJson } from "../route-utils";

const WECHAT_QR_TIMEOUT_MS = 8 * 60_000;
const activeWeChatLogins = new Map<string, string>();

function scheduleGatewayChannelRestart(
  ctx: HostApiContext,
  reason: string,
): void {
  if (ctx.gatewayManager.getStatus().state === "stopped") {
    return;
  }
  ctx.gatewayManager.debouncedRestart();
  void reason;
}

function buildWeChatLoginKey(accountId?: string): string {
  return accountId?.trim() || "__default__";
}

function emitWeChatEvent(
  ctx: HostApiContext,
  event: "qr" | "success" | "error",
  payload: unknown,
): void {
  const eventName = `channel:wechat-${event}`;
  ctx.eventBus.emit(eventName, payload);
  if (ctx.mainWindow && !ctx.mainWindow.isDestroyed()) {
    ctx.mainWindow.webContents.send(eventName, payload);
  }
}

function clearActiveWeChatLogin(accountId?: string): string | undefined {
  const loginKey = buildWeChatLoginKey(accountId);
  const sessionKey = activeWeChatLogins.get(loginKey);
  activeWeChatLogins.delete(loginKey);
  return sessionKey;
}

async function ensureDingTalkPluginInstalled(): Promise<{
  installed: boolean;
  warning?: string;
}> {
  const targetDir = join(homedir(), ".openclaw", "extensions", "dingtalk");
  const targetManifest = join(targetDir, "openclaw.plugin.json");

  if (existsSync(targetManifest)) {
    return { installed: true };
  }

  const candidateSources = app.isPackaged
    ? [
        join(process.resourcesPath, "openclaw-plugins", "dingtalk"),
        join(
          process.resourcesPath,
          "app.asar.unpacked",
          "build",
          "openclaw-plugins",
          "dingtalk",
        ),
        join(
          process.resourcesPath,
          "app.asar.unpacked",
          "openclaw-plugins",
          "dingtalk",
        ),
      ]
    : [
        join(app.getAppPath(), "build", "openclaw-plugins", "dingtalk"),
        join(process.cwd(), "build", "openclaw-plugins", "dingtalk"),
        join(__dirname, "../../../build/openclaw-plugins/dingtalk"),
      ];

  const sourceDir = candidateSources.find((dir) =>
    existsSync(join(dir, "openclaw.plugin.json")),
  );
  if (!sourceDir) {
    return {
      installed: false,
      warning: `Bundled DingTalk plugin mirror not found. Checked: ${candidateSources.join(" | ")}`,
    };
  }

  try {
    mkdirSync(join(homedir(), ".openclaw", "extensions"), { recursive: true });
    rmSync(targetDir, { recursive: true, force: true });
    cpSync(sourceDir, targetDir, { recursive: true, dereference: true });
    if (!existsSync(targetManifest)) {
      return {
        installed: false,
        warning: "Failed to install DingTalk plugin mirror (manifest missing).",
      };
    }
    return { installed: true };
  } catch {
    return {
      installed: false,
      warning: "Failed to install bundled DingTalk plugin mirror",
    };
  }
}

async function ensureWeComPluginInstalled(): Promise<{
  installed: boolean;
  warning?: string;
}> {
  const targetDir = join(homedir(), ".openclaw", "extensions", "wecom");
  const targetManifest = join(targetDir, "openclaw.plugin.json");

  if (existsSync(targetManifest)) {
    return { installed: true };
  }

  const candidateSources = app.isPackaged
    ? [
        join(process.resourcesPath, "openclaw-plugins", "wecom"),
        join(
          process.resourcesPath,
          "app.asar.unpacked",
          "build",
          "openclaw-plugins",
          "wecom",
        ),
        join(
          process.resourcesPath,
          "app.asar.unpacked",
          "openclaw-plugins",
          "wecom",
        ),
      ]
    : [
        join(app.getAppPath(), "build", "openclaw-plugins", "wecom"),
        join(process.cwd(), "build", "openclaw-plugins", "wecom"),
        join(__dirname, "../../../build/openclaw-plugins/wecom"),
      ];

  const sourceDir = candidateSources.find((dir) =>
    existsSync(join(dir, "openclaw.plugin.json")),
  );
  if (!sourceDir) {
    return {
      installed: false,
      warning: `Bundled WeCom plugin mirror not found. Checked: ${candidateSources.join(" | ")}`,
    };
  }

  try {
    mkdirSync(join(homedir(), ".openclaw", "extensions"), { recursive: true });
    rmSync(targetDir, { recursive: true, force: true });
    cpSync(sourceDir, targetDir, { recursive: true, dereference: true });
    if (!existsSync(targetManifest)) {
      return {
        installed: false,
        warning: "Failed to install WeCom plugin mirror (manifest missing).",
      };
    }
    return { installed: true };
  } catch {
    return {
      installed: false,
      warning: "Failed to install bundled WeCom plugin mirror",
    };
  }
}

async function ensureFeishuPluginInstalled(): Promise<{
  installed: boolean;
  warning?: string;
}> {
  const NEW_FEISHU_ID = "openclaw-lark";
  const LEGACY_FEISHU_ID = "feishu-openclaw-plugin";
  const extensionsDir = join(homedir(), ".openclaw", "extensions");
  const targetDir = join(extensionsDir, NEW_FEISHU_ID);
  const targetManifest = join(targetDir, "openclaw.plugin.json");

  if (existsSync(targetManifest)) {
    return { installed: true };
  }

  const legacyDir = join(extensionsDir, LEGACY_FEISHU_ID);
  const legacyManifest = join(legacyDir, "openclaw.plugin.json");
  if (existsSync(legacyManifest)) {
    try {
      mkdirSync(extensionsDir, { recursive: true });
      rmSync(targetDir, { recursive: true, force: true });
      cpSync(legacyDir, targetDir, { recursive: true, dereference: true });
      if (existsSync(targetManifest)) {
        return { installed: true };
      }
    } catch {
      // Fall through to bundled mirror install
    }
  }

  const candidateSources = app.isPackaged
    ? [
        join(process.resourcesPath, "openclaw-plugins", NEW_FEISHU_ID),
        join(process.resourcesPath, "openclaw-plugins", LEGACY_FEISHU_ID),
        join(
          process.resourcesPath,
          "app.asar.unpacked",
          "build",
          "openclaw-plugins",
          NEW_FEISHU_ID,
        ),
        join(
          process.resourcesPath,
          "app.asar.unpacked",
          "build",
          "openclaw-plugins",
          LEGACY_FEISHU_ID,
        ),
        join(
          process.resourcesPath,
          "app.asar.unpacked",
          "openclaw-plugins",
          NEW_FEISHU_ID,
        ),
        join(
          process.resourcesPath,
          "app.asar.unpacked",
          "openclaw-plugins",
          LEGACY_FEISHU_ID,
        ),
      ]
    : [
        join(app.getAppPath(), "build", "openclaw-plugins", NEW_FEISHU_ID),
        join(app.getAppPath(), "build", "openclaw-plugins", LEGACY_FEISHU_ID),
        join(process.cwd(), "build", "openclaw-plugins", NEW_FEISHU_ID),
        join(process.cwd(), "build", "openclaw-plugins", LEGACY_FEISHU_ID),
        join(__dirname, `../../../build/openclaw-plugins/${NEW_FEISHU_ID}`),
        join(__dirname, `../../../build/openclaw-plugins/${LEGACY_FEISHU_ID}`),
      ];

  const sourceDir = candidateSources.find((dir) =>
    existsSync(join(dir, "openclaw.plugin.json")),
  );
  if (!sourceDir) {
    return {
      installed: false,
      warning: `Bundled Feishu plugin mirror not found. Checked: ${candidateSources.join(" | ")}`,
    };
  }

  try {
    mkdirSync(extensionsDir, { recursive: true });
    rmSync(targetDir, { recursive: true, force: true });
    cpSync(sourceDir, targetDir, { recursive: true, dereference: true });
    if (!existsSync(targetManifest)) {
      return {
        installed: false,
        warning: "Failed to install Feishu plugin mirror (manifest missing).",
      };
    }
    return { installed: true };
  } catch {
    return {
      installed: false,
      warning: "Failed to install bundled Feishu plugin mirror",
    };
  }
}

async function ensureQQBotPluginInstalled(): Promise<{
  installed: boolean;
  warning?: string;
}> {
  const targetDir = join(homedir(), ".openclaw", "extensions", "qqbot");
  const targetManifest = join(targetDir, "openclaw.plugin.json");

  if (existsSync(targetManifest)) {
    return { installed: true };
  }

  const candidateSources = app.isPackaged
    ? [
        join(process.resourcesPath, "openclaw-plugins", "qqbot"),
        join(
          process.resourcesPath,
          "app.asar.unpacked",
          "build",
          "openclaw-plugins",
          "qqbot",
        ),
        join(
          process.resourcesPath,
          "app.asar.unpacked",
          "openclaw-plugins",
          "qqbot",
        ),
      ]
    : [
        join(app.getAppPath(), "build", "openclaw-plugins", "qqbot"),
        join(process.cwd(), "build", "openclaw-plugins", "qqbot"),
        join(__dirname, "../../../build/openclaw-plugins/qqbot"),
      ];

  const sourceDir = candidateSources.find((dir) =>
    existsSync(join(dir, "openclaw.plugin.json")),
  );
  if (!sourceDir) {
    return {
      installed: false,
      warning: `Bundled QQ Bot plugin mirror not found. Checked: ${candidateSources.join(" | ")}`,
    };
  }

  try {
    mkdirSync(join(homedir(), ".openclaw", "extensions"), { recursive: true });
    rmSync(targetDir, { recursive: true, force: true });
    cpSync(sourceDir, targetDir, { recursive: true, dereference: true });
    if (!existsSync(targetManifest)) {
      return {
        installed: false,
        warning: "Failed to install QQ Bot plugin mirror (manifest missing).",
      };
    }
    return { installed: true };
  } catch {
    return {
      installed: false,
      warning: "Failed to install bundled QQ Bot plugin mirror",
    };
  }
}

async function ensureWeChatPluginInstalled(): Promise<{
  installed: boolean;
  warning?: string;
}> {
  const targetDir = join(
    homedir(),
    ".openclaw",
    "extensions",
    OPENCLAW_WECHAT_CHANNEL_TYPE,
  );
  const targetManifest = join(targetDir, "openclaw.plugin.json");

  if (existsSync(targetManifest)) {
    return { installed: true };
  }

  const candidateSources = app.isPackaged
    ? [
        join(
          process.resourcesPath,
          "openclaw-plugins",
          OPENCLAW_WECHAT_CHANNEL_TYPE,
        ),
        join(
          process.resourcesPath,
          "app.asar.unpacked",
          "build",
          "openclaw-plugins",
          OPENCLAW_WECHAT_CHANNEL_TYPE,
        ),
        join(
          process.resourcesPath,
          "app.asar.unpacked",
          "openclaw-plugins",
          OPENCLAW_WECHAT_CHANNEL_TYPE,
        ),
      ]
    : [
        join(
          app.getAppPath(),
          "build",
          "openclaw-plugins",
          OPENCLAW_WECHAT_CHANNEL_TYPE,
        ),
        join(
          process.cwd(),
          "build",
          "openclaw-plugins",
          OPENCLAW_WECHAT_CHANNEL_TYPE,
        ),
        join(
          __dirname,
          `../../../build/openclaw-plugins/${OPENCLAW_WECHAT_CHANNEL_TYPE}`,
        ),
      ];

  const sourceDir = candidateSources.find((dir) =>
    existsSync(join(dir, "openclaw.plugin.json")),
  );
  if (!sourceDir) {
    return {
      installed: false,
      warning: `Bundled WeChat plugin mirror not found. Checked: ${candidateSources.join(" | ")}`,
    };
  }

  try {
    mkdirSync(join(homedir(), ".openclaw", "extensions"), { recursive: true });
    rmSync(targetDir, { recursive: true, force: true });
    cpSync(sourceDir, targetDir, { recursive: true, dereference: true });
    if (!existsSync(targetManifest)) {
      return {
        installed: false,
        warning: "Failed to install WeChat plugin mirror (manifest missing).",
      };
    }
    return { installed: true };
  } catch {
    return {
      installed: false,
      warning: "Failed to install bundled WeChat plugin mirror",
    };
  }
}

async function waitForWeChatQrLogin(
  ctx: HostApiContext,
  sessionKey: string,
  requestedAccountId: string,
): Promise<void> {
  const loginKey = buildWeChatLoginKey(requestedAccountId);

  try {
    const result = await waitForWeChatLoginSession({
      sessionKey,
      accountId: requestedAccountId,
      timeoutMs: WECHAT_QR_TIMEOUT_MS,
      onQrRefresh: async ({ qrcodeUrl }) => {
        if (activeWeChatLogins.get(loginKey) !== sessionKey) {
          return;
        }
        emitWeChatEvent(ctx, "qr", {
          qr: qrcodeUrl,
          raw: qrcodeUrl,
          sessionKey,
        });
      },
    });

    if (activeWeChatLogins.get(loginKey) !== sessionKey) {
      return;
    }

    if (!result.connected || !result.botToken) {
      emitWeChatEvent(
        ctx,
        "error",
        result.message || "WeChat login did not complete",
      );
      return;
    }

    const scopedAccountId = normalizeOpenClawAccountId(
      result.requestedAccountId || requestedAccountId,
    );
    await saveWeChatAccountState(scopedAccountId, {
      token: result.botToken,
      rawAccountId: result.accountId,
      baseUrl: result.baseUrl,
      userId: result.userId,
    });
    await saveChannelConfig(
      UI_WECHAT_CHANNEL_TYPE,
      { enabled: true },
      scopedAccountId,
    );
    scheduleGatewayChannelRestart(
      ctx,
      `channel:saveConfig:${OPENCLAW_WECHAT_CHANNEL_TYPE}`,
    );
    emitWeChatEvent(ctx, "success", {
      accountId: scopedAccountId,
      rawAccountId: result.accountId,
      message: result.message,
    });
  } catch (error) {
    if (activeWeChatLogins.get(loginKey) !== sessionKey) {
      return;
    }
    emitWeChatEvent(ctx, "error", String(error));
  } finally {
    if (activeWeChatLogins.get(loginKey) === sessionKey) {
      activeWeChatLogins.delete(loginKey);
    }
    await cancelWeChatLoginSession(sessionKey).catch(() => {});
  }
}

export async function handleChannelRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  ctx: HostApiContext,
): Promise<boolean> {
  if (url.pathname === "/api/channels/configured" && req.method === "GET") {
    sendJson(res, 200, {
      success: true,
      channels: await listConfiguredChannels(),
    });
    return true;
  }

  if (
    url.pathname === "/api/channels/config/validate" &&
    req.method === "POST"
  ) {
    try {
      const body = await parseJsonBody<{ channelType: string }>(req);
      sendJson(res, 200, {
        success: true,
        ...(await validateChannelConfig(body.channelType)),
      });
    } catch (error) {
      sendJson(res, 500, {
        success: false,
        valid: false,
        errors: [String(error)],
        warnings: [],
      });
    }
    return true;
  }

  if (
    url.pathname === "/api/channels/credentials/validate" &&
    req.method === "POST"
  ) {
    try {
      const body = await parseJsonBody<{
        channelType: string;
        config: Record<string, string>;
      }>(req);
      sendJson(res, 200, {
        success: true,
        ...(await validateChannelCredentials(body.channelType, body.config)),
      });
    } catch (error) {
      sendJson(res, 500, {
        success: false,
        valid: false,
        errors: [String(error)],
        warnings: [],
      });
    }
    return true;
  }

  if (
    url.pathname === "/api/channels/whatsapp/start" &&
    req.method === "POST"
  ) {
    try {
      const body = await parseJsonBody<{ accountId: string }>(req);
      await whatsAppLoginManager.start(body.accountId);
      sendJson(res, 200, { success: true });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (
    url.pathname === "/api/channels/whatsapp/cancel" &&
    req.method === "POST"
  ) {
    try {
      await whatsAppLoginManager.stop();
      sendJson(res, 200, { success: true });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (url.pathname === "/api/channels/wechat/start" && req.method === "POST") {
    try {
      const body = await parseJsonBody<{ accountId?: string }>(req);
      const requestedAccountId = normalizeOpenClawAccountId(body.accountId);
      const installResult = await ensureWeChatPluginInstalled();
      if (!installResult.installed) {
        sendJson(res, 500, {
          success: false,
          error: installResult.warning || "WeChat plugin install failed",
        });
        return true;
      }

      const existingSessionKey = clearActiveWeChatLogin(requestedAccountId);
      if (existingSessionKey) {
        await cancelWeChatLoginSession(existingSessionKey).catch(() => {});
      }

      const startResult = await startWeChatLoginSession({
        accountId: requestedAccountId,
        force: true,
      });
      if (!startResult.qrcodeUrl || !startResult.sessionKey) {
        throw new Error(
          startResult.message || "Failed to generate WeChat QR code",
        );
      }

      activeWeChatLogins.set(
        buildWeChatLoginKey(requestedAccountId),
        startResult.sessionKey,
      );
      emitWeChatEvent(ctx, "qr", {
        qr: startResult.qrcodeUrl,
        raw: startResult.qrcodeUrl,
        sessionKey: startResult.sessionKey,
      });
      void waitForWeChatQrLogin(
        ctx,
        startResult.sessionKey,
        requestedAccountId,
      );
      sendJson(res, 200, { success: true });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (url.pathname === "/api/channels/wechat/cancel" && req.method === "POST") {
    try {
      const body = await parseJsonBody<{ accountId?: string }>(req);
      const requestedAccountId = normalizeOpenClawAccountId(body.accountId);
      const sessionKey = clearActiveWeChatLogin(requestedAccountId);
      if (sessionKey) {
        await cancelWeChatLoginSession(sessionKey);
      }
      sendJson(res, 200, { success: true });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (url.pathname === "/api/channels/config" && req.method === "POST") {
    try {
      const body = await parseJsonBody<{
        channelType: string;
        config: Record<string, unknown>;
        accountId?: string;
      }>(req);
      if (body.channelType === "dingtalk") {
        const installResult = await ensureDingTalkPluginInstalled();
        if (!installResult.installed) {
          sendJson(res, 500, {
            success: false,
            error: installResult.warning || "DingTalk plugin install failed",
          });
          return true;
        }
      }
      if (body.channelType === "wecom") {
        const installResult = await ensureWeComPluginInstalled();
        if (!installResult.installed) {
          sendJson(res, 500, {
            success: false,
            error: installResult.warning || "WeCom plugin install failed",
          });
          return true;
        }
      }
      if (body.channelType === "qqbot") {
        const installResult = await ensureQQBotPluginInstalled();
        if (!installResult.installed) {
          sendJson(res, 500, {
            success: false,
            error: installResult.warning || "QQ Bot plugin install failed",
          });
          return true;
        }
      }
      if (body.channelType === "feishu") {
        const installResult = await ensureFeishuPluginInstalled();
        if (!installResult.installed) {
          sendJson(res, 500, {
            success: false,
            error: installResult.warning || "Feishu plugin install failed",
          });
          return true;
        }
      }
      if (body.channelType === UI_WECHAT_CHANNEL_TYPE) {
        const installResult = await ensureWeChatPluginInstalled();
        if (!installResult.installed) {
          sendJson(res, 500, {
            success: false,
            error: installResult.warning || "WeChat plugin install failed",
          });
          return true;
        }
      }
      await saveChannelConfig(body.channelType, body.config, body.accountId);
      scheduleGatewayChannelRestart(
        ctx,
        `channel:saveConfig:${body.channelType}`,
      );
      sendJson(res, 200, { success: true });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (url.pathname === "/api/channels/config/enabled" && req.method === "PUT") {
    try {
      const body = await parseJsonBody<{
        channelType: string;
        enabled: boolean;
      }>(req);
      await setChannelEnabled(body.channelType, body.enabled);
      scheduleGatewayChannelRestart(
        ctx,
        `channel:setEnabled:${body.channelType}`,
      );
      sendJson(res, 200, { success: true });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (
    url.pathname.startsWith("/api/channels/config/") &&
    req.method === "GET"
  ) {
    try {
      const channelType = decodeURIComponent(
        url.pathname.slice("/api/channels/config/".length),
      );
      const accountId = url.searchParams.get("accountId") || undefined;
      sendJson(res, 200, {
        success: true,
        values: await getChannelFormValues(channelType, accountId),
      });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (
    url.pathname.startsWith("/api/channels/config/") &&
    req.method === "DELETE"
  ) {
    try {
      const channelType = decodeURIComponent(
        url.pathname.slice("/api/channels/config/".length),
      );
      await deleteChannelConfig(channelType);
      await clearAllBindingsForChannel(channelType);
      scheduleGatewayChannelRestart(ctx, `channel:deleteConfig:${channelType}`);
      sendJson(res, 200, { success: true });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  void ctx;
  return false;
}
