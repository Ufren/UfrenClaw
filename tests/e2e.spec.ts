import type {ElectronApplication, JSHandle} from 'playwright';
import {_electron as electron} from 'playwright';
import {expect, test as base} from '@playwright/test';
import type {BrowserWindow} from 'electron';
import {globSync} from 'glob';
import electronExecutable from 'electron';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {platform} from 'node:process';
import {createHash} from 'node:crypto';
import {parseSseChunkText} from '../packages/main/src/utils/sse.ts';

process.env.PLAYWRIGHT_TEST = 'true';

// Declare the types of your fixtures.
type TestFixtures = {
  electronApp: ElectronApplication;
  electronVersions: NodeJS.ProcessVersions;
};

const test = base.extend<TestFixtures>({
  electronApp: [async ({}, use) => {
    const productName = 'Ufren';

    const usePackaged = process.env.E2E_USE_PACKAGED === 'true';

    const launchConfig = usePackaged
      ? (() => {
          let executablePattern = `dist/*/${productName}{,.*}`;
          if (platform === 'darwin') {
            executablePattern = `dist/*/${productName}.app/Contents/MacOS/${productName}`;
          } else if (platform === 'win32') {
            executablePattern = `dist/*/${productName}.exe`;
          }

          const [executablePath] = globSync(executablePattern);
          if (!executablePath) return null;

          return {
            executablePath,
            args: ['--no-sandbox'],
          };
        })()
      : (() => {
          const entryPoint = path.resolve('packages/entry-point.mjs');
          const mainDist = path.resolve('packages/main/dist/index.js');
          const preloadDist = path.resolve('packages/preload/dist/exposed.js');
          const rendererDist = path.resolve(
            'packages/renderer-react/dist/index.html',
          );

          if (
            !existsSync(entryPoint) ||
            !existsSync(mainDist) ||
            !existsSync(preloadDist) ||
            !existsSync(rendererDist)
          ) {
            return null;
          }

          return {
            executablePath: electronExecutable,
            args: [entryPoint, '--no-sandbox'],
          };
        })();

    if (!launchConfig) {
      await use(null as any);
      return;
    }

    const electronApp = await electron.launch(launchConfig);

    electronApp.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.error(`[electron][${msg.type()}] ${msg.text()}`);
      }
    });

    await use(electronApp);

    // This code runs after all the tests in the worker process.
    await electronApp.close();
  }, {scope: 'worker', auto: true} as any],

  page: async ({electronApp}, use) => {
    if (!electronApp) {
      await use(null as any);
      return;
    }
    const page = await electronApp.firstWindow();
    // capture errors
    page.on('pageerror', (error) => {
      console.error(error);
    });
    // capture console messages
    page.on('console', (msg) => {
      console.log(msg.text());
    });

    await page.waitForLoadState('load');
    await use(page);
  },

  electronVersions: async ({electronApp}, use) => {
    if (!electronApp) {
      await use(null as any);
      return;
    }
    await use(await electronApp.evaluate(() => process.versions));
  },
});

test.describe('Electron app', () => {
  test.beforeEach(async ({electronApp, page}) => {
    test.skip(
      !electronApp || !page,
      'App not launched. Run pnpm build (or set E2E_USE_PACKAGED=true after compile).',
    );
  });

  test('Main window state', async ({electronApp, page}) => {
    const window: JSHandle<BrowserWindow> = await electronApp.browserWindow(page);
    const windowState = await window.evaluate(
      (mainWindow): Promise<{isVisible: boolean; isDevToolsOpened: boolean; isCrashed: boolean}> => {
        const getState = () => ({
          isVisible: mainWindow.isVisible(),
          isDevToolsOpened: mainWindow.webContents.isDevToolsOpened(),
          isCrashed: mainWindow.webContents.isCrashed(),
        });

        return new Promise(resolve => {
          if (mainWindow.isVisible()) {
            resolve(getState());
          } else {
            mainWindow.once('ready-to-show', () => resolve(getState()));
          }
        });
      },
    );

    expect(windowState.isCrashed, 'The app has crashed').toEqual(false);
    expect(windowState.isVisible, 'The main window was not visible').toEqual(true);
    expect(windowState.isDevToolsOpened, 'The DevTools panel was open').toEqual(false);
  });

  test.describe('Main window web content', () => {
    test('The main window renders the app shell', async ({page}) => {
      await expect(page).toHaveTitle('Ufren');
      const element = page.getByRole('link', { name: 'Ufren' });
      await expect(element).toBeVisible();
    });

    test('The main window exposes main navigation', async ({page}) => {
      const element = page.getByRole('link', { name: /Skills|技能/ });
      await expect(element).toBeVisible();
    });
  });

  test.describe('Preload context should be exposed', () => {
    test.describe(`versions should be exposed`, () => {
      test('with same type`', async ({page}) => {
        const type = await page.evaluate(() => typeof globalThis[btoa('versions')]);
        expect(type).toEqual('object');
      });

      test('with same value', async ({page, electronVersions}) => {
        const value = await page.evaluate(() => globalThis[btoa('versions')]);
        expect(value).toEqual(electronVersions);
      });
    });

    test.describe(`sha256sum should be exposed`, () => {
      test('with same type`', async ({page}) => {
        const type = await page.evaluate(() => typeof globalThis[btoa('sha256sum')]);
        expect(type).toEqual('function');
      });

      test('with same behavior', async ({page}) => {
        const testString = btoa(`${Date.now() * Math.random()}`);
        const expectedValue = createHash('sha256').update(testString).digest('hex');
        const value = await page.evaluate((str) => globalThis[btoa('sha256sum')](str), testString);
        expect(value).toEqual(expectedValue);
      });
    });

    test.describe(`send should be exposed`, () => {
      test('with same type`', async ({page}) => {
        const type = await page.evaluate(() => typeof globalThis[btoa('send')]);
        expect(type).toEqual('function');
      });

      test('with same behavior', async ({page, electronApp}) => {
        await electronApp.evaluate(async ({ipcMain}) => {
          ipcMain.handle('test', (event, message) =>
            btoa(typeof message === 'object' ? message?.data : message),
          );
        });

        const testString = btoa(`${Date.now() * Math.random()}`);
        const expectedValue = btoa(testString);
        const value = await page.evaluate(async (str) => await globalThis[btoa('send')]('test', str), testString);
        expect(value).toEqual(expectedValue);
      });
    });
  });
});

test.describe('SSE parsing', async () => {
  test('parses data lines and keeps rest', async () => {
    const a = parseSseChunkText('data: {"a":1}\n\ndata: {"b":2}\n');
    expect(a.chunks).toEqual([{a: 1}, {b: 2}]);
    expect(a.rest).toEqual('');
    expect(a.sawDone).toEqual(false);

    const b = parseSseChunkText('data: {"a":1');
    expect(b.chunks).toEqual([]);
    expect(b.rest).toEqual('data: {"a":1');
    expect(b.sawDone).toEqual(false);
  });

  test('parses nonstandard json line and done', async () => {
    const x = parseSseChunkText(
      '{"id":"x","choices":[{"delta":{"content":"hi"}}]}\r\n',
    );
    expect(x.chunks.length).toEqual(1);
    expect(x.chunks[0].id).toEqual('x');

    const y = parseSseChunkText('data: [DONE]\n');
    expect(y.chunks).toEqual([]);
    expect(y.sawDone).toEqual(true);
  });

  test('handles chunk boundary split across events', async () => {
    const first = parseSseChunkText('data: {"a":');
    expect(first.chunks).toEqual([]);
    expect(first.rest).toEqual('data: {"a":');

    const second = parseSseChunkText(first.rest + '1}\n\ndata: {"b":2}\n\n');
    expect(second.chunks).toEqual([{a: 1}, {b: 2}]);
    expect(second.rest).toEqual('');
  });
});
