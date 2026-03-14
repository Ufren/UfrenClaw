import { readFileSync, existsSync } from 'fs';
import path from 'path';
const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));

// 允许通过环境变量选择要打包的 llama.cpp 依赖风味（cpu / vulkan / cuda / 其他自定义）
const LLAMA_FLAVOR = process.env.LLAMA_FLAVOR || 'cpu';
const platformArch = `${process.platform}-${process.arch}`; // e.g. win32-x64

function resolveLlamaSourceDir() {
  const candidates = [
    path.join('buildResources', 'llama.cpp', platformArch, LLAMA_FLAVOR),
    path.join('buildResources', 'llama.cpp', LLAMA_FLAVOR, platformArch),
    path.join('buildResources', 'llama.cpp', LLAMA_FLAVOR),
    path.join('buildResources', 'llama.cpp', platformArch),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return path.join('buildResources', 'llama.cpp');
}

const llamaSourceDir = resolveLlamaSourceDir();
function resolveLlamaTargetDir(sourceDir) {
  const base = path.join('buildResources', 'llama.cpp');
  const rel = path.relative(base, sourceDir);
  if (!rel || rel.startsWith('..')) return 'llama.cpp';
  const parts = rel.split(path.sep).filter(Boolean);
  if (parts.length === 0) return 'llama.cpp';
  if (parts.length === 1) return path.join('llama.cpp', parts[0]);
  return path.join('llama.cpp', parts[0], parts[1]);
}
const llamaTargetDir = resolveLlamaTargetDir(llamaSourceDir);

export default /** @type import('electron-builder').Configuration */
({
  appId: 'com.ufren.app',
  productName: 'UfrenClaw',
  directories: {
    output: 'dist',
    buildResources: 'buildResources',
  },
  generateUpdatesFilesForAllChannels: true,
  asar: true,
  npmRebuild: false,
  asarUnpack: [
    // 解壓原生模組，避免 asar 中無法被原生綁定載入
    'node_modules/sqlite3/**',
    'node_modules/node-pty/**',
    'node_modules/.pnpm/**/node-pty/**',
    // 解壓內置資源（如可執行檔），讓主進程可從 process.resourcesPath 訪問
    'buildResources/ollama/**',
  ],
  extraResources: [
    {
      // 打包 Go 划词监听器
      from: 'native/selection-monitor/selection-monitor.exe',
      to: 'bin/selection-monitor.exe',
      filter: ['*.exe']
    },
    {
      from: 'build/openclaw/',
      to: 'openclaw/',
      filter: ['**/*']
    },
    {
      // 打包 OpenClaw 二进制
      from: 'buildResources/bin/openclaw.exe',
      to: 'bin/openclaw.exe',
      filter: ['*.exe']
    },
    {
      // 打包 llama.cpp 服务器及依赖
      from: llamaSourceDir,
      to: llamaTargetDir,
      filter: ['**/*']
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
