import { app } from "electron";
import path from "path";
import { cpSync, existsSync, mkdirSync, rmSync } from "fs";
import { homedir } from "os";
import { getAllSettings } from "../utils/store";
import {
  getApiKey,
  getDefaultProvider,
  getProvider,
} from "../utils/secure-storage";
import {
  getProviderEnvVar,
  getKeyableProviderTypes,
} from "../utils/provider-registry";
import {
  getOpenClawDir,
  getOpenClawEntryPath,
  isOpenClawBuilt,
  isOpenClawPresent,
} from "../utils/paths";
import { getUvMirrorEnv } from "../utils/uv-env";
import {
  listConfiguredChannels,
  readOpenClawConfig,
} from "../utils/channel-config";
import {
  syncGatewayTokenToConfig,
  syncBrowserConfigToOpenClaw,
  sanitizeOpenClawConfig,
} from "../utils/openclaw-auth";
import { buildProxyEnv, resolveProxySettings } from "../utils/proxy";
import { syncProxyConfigToOpenClaw } from "../utils/openclaw-proxy";
import { logger } from "../utils/logger";

export interface GatewayLaunchContext {
  appSettings: Awaited<ReturnType<typeof getAllSettings>>;
  openclawDir: string;
  entryScript: string;
  gatewayArgs: string[];
  forkEnv: Record<string, string | undefined>;
  mode: "dev" | "packaged";
  binPathExists: boolean;
  loadedProviderKeyCount: number;
  proxySummary: string;
  channelStartupSummary: string;
}

export async function syncGatewayConfigBeforeLaunch(
  appSettings: Awaited<ReturnType<typeof getAllSettings>>,
): Promise<void> {
  await syncProxyConfigToOpenClaw(appSettings);

  try {
    await ensureBundledChannelPluginsInstalled();
  } catch (err) {
    logger.warn("Failed to install bundled OpenClaw plugins:", err);
  }

  try {
    await sanitizeOpenClawConfig();
  } catch (err) {
    logger.warn("Failed to sanitize openclaw.json:", err);
  }

  try {
    await syncGatewayTokenToConfig(appSettings.gatewayToken);
  } catch (err) {
    logger.warn("Failed to sync gateway token to openclaw.json:", err);
  }

  try {
    await syncBrowserConfigToOpenClaw();
  } catch (err) {
    logger.warn("Failed to sync browser config to openclaw.json:", err);
  }
}

async function ensureBundledChannelPluginsInstalled(): Promise<void> {
  const config = await readOpenClawConfig();
  const channels =
    config.channels && typeof config.channels === "object"
      ? config.channels
      : {};

  const shouldEnsure = (channelType: string): boolean => {
    const section = (channels as Record<string, unknown>)[channelType] as
      | Record<string, unknown>
      | undefined;
    if (!section || typeof section !== "object") return false;
    if (section.enabled === false) return false;
    return true;
  };

  if (shouldEnsure("dingtalk")) {
    ensureBundledPluginInstalled("dingtalk", ["dingtalk"]);
  }
  if (shouldEnsure("wecom")) {
    ensureBundledPluginInstalled("wecom", ["wecom"]);
  }
  if (shouldEnsure("qqbot")) {
    ensureBundledPluginInstalled("qqbot", ["qqbot"]);
  }
  if (shouldEnsure("feishu")) {
    ensureBundledPluginInstalled("openclaw-lark", [
      "openclaw-lark",
      "feishu-openclaw-plugin",
    ]);
  }
  if (shouldEnsure("openclaw-weixin")) {
    ensureBundledPluginInstalled("openclaw-weixin", ["openclaw-weixin"]);
  }
}

function ensureBundledPluginInstalled(
  targetId: string,
  mirrorDirCandidates: string[],
): void {
  const extensionsDir = path.join(homedir(), ".openclaw", "extensions");
  const targetDir = path.join(extensionsDir, targetId);
  const targetManifest = path.join(targetDir, "openclaw.plugin.json");
  if (existsSync(targetManifest)) return;

  for (const legacyId of mirrorDirCandidates) {
    if (legacyId === targetId) continue;
    const legacyDir = path.join(extensionsDir, legacyId);
    const legacyManifest = path.join(legacyDir, "openclaw.plugin.json");
    if (existsSync(legacyManifest)) {
      try {
        mkdirSync(extensionsDir, { recursive: true });
        rmSync(targetDir, { recursive: true, force: true });
        cpSync(legacyDir, targetDir, { recursive: true, dereference: true });
        if (existsSync(targetManifest)) return;
      } catch {
        // Fall through to bundled mirror install
      }
    }
  }

  const candidateSources = app.isPackaged
    ? mirrorDirCandidates.flatMap((id) => [
        path.join(process.resourcesPath, "openclaw-plugins", id),
        path.join(
          process.resourcesPath,
          "app.asar.unpacked",
          "build",
          "openclaw-plugins",
          id,
        ),
        path.join(
          process.resourcesPath,
          "app.asar.unpacked",
          "openclaw-plugins",
          id,
        ),
      ])
    : mirrorDirCandidates.flatMap((id) => [
        path.join(app.getAppPath(), "build", "openclaw-plugins", id),
        path.join(process.cwd(), "build", "openclaw-plugins", id),
      ]);

  const sourceDir = candidateSources.find((dir) =>
    existsSync(path.join(dir, "openclaw.plugin.json")),
  );
  if (!sourceDir) return;

  mkdirSync(extensionsDir, { recursive: true });
  rmSync(targetDir, { recursive: true, force: true });
  cpSync(sourceDir, targetDir, { recursive: true, dereference: true });
}

async function loadProviderEnv(): Promise<{
  providerEnv: Record<string, string>;
  loadedProviderKeyCount: number;
}> {
  const providerEnv: Record<string, string> = {};
  const providerTypes = getKeyableProviderTypes();
  let loadedProviderKeyCount = 0;

  try {
    const defaultProviderId = await getDefaultProvider();
    if (defaultProviderId) {
      const defaultProvider = await getProvider(defaultProviderId);
      const defaultProviderType = defaultProvider?.type;
      const defaultProviderKey = await getApiKey(defaultProviderId);
      if (defaultProviderType && defaultProviderKey) {
        const envVar = getProviderEnvVar(defaultProviderType);
        if (envVar) {
          providerEnv[envVar] = defaultProviderKey;
          loadedProviderKeyCount++;
        }
      }
    }
  } catch (err) {
    logger.warn(
      "Failed to load default provider key for environment injection:",
      err,
    );
  }

  for (const providerType of providerTypes) {
    try {
      const key = await getApiKey(providerType);
      if (key) {
        const envVar = getProviderEnvVar(providerType);
        if (envVar) {
          providerEnv[envVar] = key;
          loadedProviderKeyCount++;
        }
      }
    } catch (err) {
      logger.warn(`Failed to load API key for ${providerType}:`, err);
    }
  }

  return { providerEnv, loadedProviderKeyCount };
}

async function resolveChannelStartupPolicy(): Promise<{
  skipChannels: boolean;
  channelStartupSummary: string;
}> {
  try {
    const configuredChannels = await listConfiguredChannels();
    if (configuredChannels.length === 0) {
      return {
        skipChannels: true,
        channelStartupSummary: "skipped(no configured channels)",
      };
    }

    return {
      skipChannels: false,
      channelStartupSummary: `enabled(${configuredChannels.join(",")})`,
    };
  } catch (error) {
    logger.warn(
      "Failed to determine configured channels for gateway launch:",
      error,
    );
    return {
      skipChannels: false,
      channelStartupSummary: "enabled(unknown)",
    };
  }
}

export async function prepareGatewayLaunchContext(
  port: number,
): Promise<GatewayLaunchContext> {
  const openclawDir = getOpenClawDir();
  const entryScript = getOpenClawEntryPath();

  if (!isOpenClawPresent()) {
    throw new Error(`OpenClaw package not found at: ${openclawDir}`);
  }

  const appSettings = await getAllSettings();
  await syncGatewayConfigBeforeLaunch(appSettings);

  if (!existsSync(entryScript)) {
    throw new Error(`OpenClaw entry script not found at: ${entryScript}`);
  }
  if (!isOpenClawBuilt()) {
    throw new Error(
      `OpenClaw build output not found (expected dist/entry.(m)js) at: ${openclawDir}`,
    );
  }

  const gatewayArgs = [
    "gateway",
    "--port",
    String(port),
    "--token",
    appSettings.gatewayToken,
    "--allow-unconfigured",
  ];
  const mode = app.isPackaged ? "packaged" : "dev";

  const platform = process.platform;
  const arch = process.arch;
  const target = `${platform}-${arch}`;
  const binPath = app.isPackaged
    ? path.join(process.resourcesPath, "bin")
    : path.join(process.cwd(), "resources", "bin", target);
  const binPathExists = existsSync(binPath);
  const finalPath = binPathExists
    ? `${binPath}${path.delimiter}${process.env.PATH || ""}`
    : process.env.PATH || "";

  const { providerEnv, loadedProviderKeyCount } = await loadProviderEnv();
  const { skipChannels, channelStartupSummary } =
    await resolveChannelStartupPolicy();
  const uvEnv = await getUvMirrorEnv();
  const proxyEnv = buildProxyEnv(appSettings);
  const resolvedProxy = resolveProxySettings(appSettings);
  const proxySummary = appSettings.proxyEnabled
    ? `http=${resolvedProxy.httpProxy || "-"}, https=${resolvedProxy.httpsProxy || "-"}, all=${resolvedProxy.allProxy || "-"}`
    : "disabled";

  const { NODE_OPTIONS: _nodeOptions, ...baseEnv } = process.env;
  const forkEnv: Record<string, string | undefined> = {
    ...baseEnv,
    PATH: finalPath,
    ...providerEnv,
    ...uvEnv,
    ...proxyEnv,
    OPENCLAW_GATEWAY_TOKEN: appSettings.gatewayToken,
    OPENCLAW_SKIP_CHANNELS: skipChannels ? "1" : "",
    CLAWDBOT_SKIP_CHANNELS: skipChannels ? "1" : "",
    OPENCLAW_NO_RESPAWN: "1",
  };

  return {
    appSettings,
    openclawDir,
    entryScript,
    gatewayArgs,
    forkEnv,
    mode,
    binPathExists,
    loadedProviderKeyCount,
    proxySummary,
    channelStartupSummary,
  };
}
