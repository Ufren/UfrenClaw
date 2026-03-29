import {build, createServer} from 'vite';
import path from 'path';

/**
 * 设置控制台编码以支持中文字符
 */
if (process.platform === 'win32') {
  // 设置环境变量
  process.env.PYTHONIOENCODING = 'utf-8';
  process.env.LANG = 'zh_CN.UTF-8';

  // 尝试设置控制台代码页为 UTF-8
  try {
    const { execSync } = await import('child_process');
    execSync('chcp 65001', { stdio: 'ignore' });
    console.log('Console code page set to UTF-8 (65001)');
  } catch (error) {
    console.warn('Failed to set console code page:', error.message);
  }
}

/**
 * This script is designed to run multiple packages of your application in a special development mode.
 * To do this, you need to follow a few steps:
 */


/**
 * 1. We create a few flags to let everyone know that we are in development mode.
 */
const mode = 'development';
process.env.NODE_ENV = mode;
process.env.MODE = mode;


/**
 * 2. We create a development server for the renderer. It is assumed that the renderer exists and is located in the “renderer” package.
 * This server should be started first because other packages depend on its settings.
 */
// 设置环境变量
process.env.VITE_TARGET = 'renderer';

/**
 * @type {import('vite').ViteDevServer}
 */
const rendererWatchServer = await createServer({
  mode,
  configFile: path.resolve('vite.config.ts'),
});

await rendererWatchServer.listen();

// 设置开发服务器 URL 环境变量
const serverUrl = `http://localhost:${rendererWatchServer.config.server.port}`;
process.env.VITE_DEV_SERVER_URL = serverUrl;
console.log(`🚀 开发服务器启动: ${serverUrl}`);


/**
 * 3. We are creating a simple provider plugin.
 * Its only purpose is to provide access to the renderer dev-server to all other build processes.
 */
/** @type {import('vite').Plugin} */
const rendererWatchServerProvider = {
  name: '@app/renderer-watch-server-provider',
  api: {
    provideRendererWatchServer() {
      return rendererWatchServer;
    },
  },
};


/**
 * 4. Start building all other packages.
 * For each of them, we add a plugin provider so that each package can implement its own hot update mechanism.
 */

/** @type {Array<{name: string, target: string}>} */
const packagesToStart = [
  { name: 'preload', target: 'preload' },
  { name: 'main', target: 'main' },
];

for (const pkg of packagesToStart) {
  // 设置环境变量
  process.env.VITE_TARGET = pkg.target;

  await build({
    mode,
    configFile: path.resolve('vite.config.ts'),
    plugins: [
      rendererWatchServerProvider,
    ],
  });
}

/**
 * 5. Start Electron app
 */
import { spawn } from 'child_process';
import electron from 'electron';

const electronProcess = spawn(electron, [path.resolve('packages/entry-point.mjs')], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: mode,
  },
});

electronProcess.on('close', () => {
  process.exit();
});
