import { readFileSync, existsSync, cpSync, rmSync } from 'fs';
import path from 'path';
const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));

function normWin(p) {
  if (process.platform !== 'win32') return p;
  if (p.startsWith('\\\\?\\')) return p;
  return '\\\\?\\' + p.replace(/\//g, '\\');
}

export default /** @type import('electron-builder').Configuration */
({
  appId: 'com.ufren.app',
  productName: 'UfrenClaw',
  compression: 'maximum',
  directories: {
    output: 'dist',
    buildResources: 'buildResources',
  },
  generateUpdatesFilesForAllChannels: true,
  asar: true,
  npmRebuild: false,
  beforeBuild: async () => {
    const winUnpacked = path.join(process.cwd(), 'dist', 'win-unpacked');
    if (existsSync(normWin(winUnpacked))) {
      rmSync(normWin(winUnpacked), { recursive: true, force: true });
    }
  },
  asarUnpack: [
    // 解壓原生模組，避免 asar 中無法被原生綁定載入
    'node_modules/sqlite3/**',
    'node_modules/node-pty/**',
    'node_modules/.pnpm/**/node-pty/**',
    // 解壓內置資源（如可執行檔），讓主進程可從 process.resourcesPath 訪問
    'buildResources/ollama/**',
  ],
  afterPack: async (context) => {
    const appOutDir = context.appOutDir;
    const platform = context.electronPlatformName;
    let resourcesDir;
    if (platform === 'darwin') {
      const appName = context.packager.appInfo.productFilename;
      resourcesDir = path.join(appOutDir, `${appName}.app`, 'Contents', 'Resources');
    } else {
      resourcesDir = path.join(appOutDir, 'resources');
    }

    const llamaDir = path.join(resourcesDir, 'llama.cpp');
    if (existsSync(normWin(llamaDir))) {
      rmSync(normWin(llamaDir), { recursive: true, force: true });
    }

    const projectDir = context.packager.projectDir;
    const src = path.join(projectDir, 'build', 'openclaw', 'node_modules');
    const openclawRoot = path.join(resourcesDir, 'node_modules', 'openclaw');
    const dest = path.join(openclawRoot, 'node_modules');

    if (!existsSync(normWin(src))) {
      console.warn('[afterPack] build/openclaw/node_modules not found, skipping.');
      return;
    }

    try {
      cpSync(normWin(src), normWin(dest), { recursive: true, dereference: true });
    } catch (e) {
      console.warn(`[afterPack] Failed to copy openclaw node_modules: ${e?.message || e}`);
      throw e;
    }
  },
  extraResources: [
    {
      // 打包 uv 二进制
      from: 'resources/bin/win32-x64/uv.exe',
      to: 'bin/uv.exe',
      filter: ['*.exe']
    },
    {
      // 打包 Go 划词监听器
      from: 'native/selection-monitor/selection-monitor.exe',
      to: 'bin/selection-monitor.exe',
      filter: ['*.exe']
    },
    {
      from: 'build/openclaw/',
      to: 'node_modules/openclaw/',
      filter: ['**/*']
    },
    {
      from: 'build/openclaw-plugins/',
      to: 'openclaw-plugins/',
      filter: ['**/*']
    },
    {
      from: 'build/preinstalled-skills/',
      to: 'resources/preinstalled-skills/',
      filter: ['**/*']
    },
    {
      // 打包 OpenClaw 二进制
      from: 'buildResources/bin/openclaw.exe',
      to: 'bin/openclaw.exe',
      filter: ['*.exe']
    },
    {
      from: 'resources/',
      to: 'resources/',
      filter: ['**/*']
    }
  ],
  win: {
    target: [
      {
        target: 'nsis',
        arch: ['x64']
      }
    ],
    icon: 'buildResources/icon.ico',
    artifactName: '${productName}-${version}-win-${arch}.${ext}'
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowElevation: true,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: '${productName}'
  },
  linux: {
    target: ['deb'],
  },
  /**
   * It is recommended to avoid using non-standard characters such as spaces in artifact names,
   * as they can unpredictably change during deployment, making them impossible to locate and download for update.
   */
  artifactName: '${productName}-${version}-${os}-${arch}.${ext}',
  files: [
    'LICENSE*',
    pkg.main,
    'packages/main/dist/**',
    'packages/preload/dist/**',
    'packages/renderer-react/dist/**',
    // 內置 Ollama 二進位
    'buildResources/ollama/**',
    // 應用圖標文件
    'buildResources/icon.*',
    'packages/electron-versions/**',
    '!packages/*/src/**',
    '!packages/*/node_modules/**',
    '!packages/*/*.config.*',
    '!packages/*/tsconfig.*',
    '!packages/integrate-renderer/**',
  ],
});
