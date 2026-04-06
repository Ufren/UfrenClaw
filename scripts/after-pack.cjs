const { cpSync, existsSync, readdirSync, rmSync, statSync, mkdirSync, realpathSync } = require('fs');
const { join, dirname, basename, relative } = require('path');

function normWin(p) {
  if (process.platform !== 'win32') return p;
  if (p.startsWith('\\\\?\\')) return p;
  return '\\\\?\\' + p.replace(/\//g, '\\');
}

const ARCH_MAP = { 0: 'ia32', 1: 'x64', 2: 'armv7l', 3: 'arm64', 4: 'universal' };

function resolveArch(archEnum) {
  return ARCH_MAP[archEnum] || 'x64';
}

function cleanupUnnecessaryFiles(dir) {
  let removedCount = 0;

  const REMOVE_DIRS = new Set([
    'test', 'tests', '__tests__', '.github', 'examples', 'example',
  ]);
  const REMOVE_FILE_EXTS = ['.d.ts', '.d.ts.map', '.js.map', '.mjs.map', '.ts.map', '.markdown'];
  const REMOVE_FILE_NAMES = new Set([
    '.DS_Store', 'README.md', 'CHANGELOG.md', 'LICENSE.md', 'CONTRIBUTING.md',
    'tsconfig.json', '.npmignore', '.eslintrc', '.prettierrc', '.editorconfig',
  ]);

  function walk(currentDir) {
    let entries;
    try { entries = readdirSync(currentDir, { withFileTypes: true }); } catch { return; }

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (REMOVE_DIRS.has(entry.name)) {
          try { rmSync(fullPath, { recursive: true, force: true }); removedCount++; } catch { }
        } else {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        const name = entry.name;
        if (REMOVE_FILE_NAMES.has(name) || REMOVE_FILE_EXTS.some(e => name.endsWith(e))) {
          try { rmSync(fullPath, { force: true }); removedCount++; } catch { }
        }
      }
    }
  }

  walk(dir);
  return removedCount;
}

function cleanupKoffi(nodeModulesDir, platform, arch) {
  const koffiDir = join(nodeModulesDir, 'koffi', 'build', 'koffi');
  if (!existsSync(koffiDir)) return 0;

  const keepTarget = `${platform}_${arch}`;
  let removed = 0;
  for (const entry of readdirSync(koffiDir)) {
    if (entry !== keepTarget) {
      try { rmSync(join(koffiDir, entry), { recursive: true, force: true }); removed++; } catch { }
    }
  }
  return removed;
}

const PLATFORM_NATIVE_SCOPES = {
  '@napi-rs': /^canvas-(darwin|linux|win32)-(x64|arm64)/,
  '@img': /^sharp(?:-libvips)?-(darwin|linux|win32)-(x64|arm64)/,
  '@mariozechner': /^clipboard-(darwin|linux|win32)-(x64|arm64|universal)/,
};

function cleanupNativePlatformPackages(nodeModulesDir, platform, arch) {
  let removed = 0;

  for (const [scope, pattern] of Object.entries(PLATFORM_NATIVE_SCOPES)) {
    const scopeDir = join(nodeModulesDir, scope);
    if (!existsSync(scopeDir)) continue;

    for (const entry of readdirSync(scopeDir)) {
      const match = entry.match(pattern);
      if (!match) continue;

      const pkgPlatform = match[1];
      const pkgArch = match[2];

      const isMatch =
        pkgPlatform === platform &&
        (pkgArch === arch || pkgArch === 'universal');

      if (!isMatch) {
        try {
          rmSync(join(scopeDir, entry), { recursive: true, force: true });
          removed++;
        } catch { }
      }
    }
  }

  return removed;
}

const MODULE_PATCHES = {
  'node-domexception/index.js': [
    "'use strict';",
    'const dom = globalThis.DOMException ||',
    '  class DOMException extends Error {',
    "    constructor(msg, name) { super(msg); this.name = name || 'Error'; }",
    '  };',
    'module.exports = dom;',
    'module.exports.DOMException = dom;',
    'module.exports.default = dom;',
  ].join('\n') + '\n',
};

function patchBrokenModules(nodeModulesDir) {
  const { writeFileSync, readFileSync } = require('fs');
  let count = 0;
  for (const [rel, content] of Object.entries(MODULE_PATCHES)) {
    const target = join(nodeModulesDir, rel);
    if (existsSync(target)) {
      writeFileSync(target, content, 'utf8');
      count++;
    }
  }

  const hpaPkgPath = join(nodeModulesDir, 'https-proxy-agent', 'package.json');
  if (existsSync(hpaPkgPath)) {
    try {
      const raw = readFileSync(hpaPkgPath, 'utf8');
      const pkg = JSON.parse(raw);
      const exp = pkg.exports;
      if (exp && exp.import && !exp.require && !exp['.']) {
        pkg.exports = {
          '.': {
            import: exp.import,
            require: exp.import,
            default: typeof exp.import === 'string' ? exp.import : exp.import.default,
          },
        };
        writeFileSync(hpaPkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
        count++;
        console.log('[after-pack] 🩹 Patched https-proxy-agent exports for CJS compatibility');
      }
    } catch (err) {
      console.warn('[after-pack] ⚠️  Failed to patch https-proxy-agent:', err.message);
    }
  }

  function patchAllLruCacheInstances(rootDir) {
    let lruCount = 0;
    const stack = [rootDir];

    while (stack.length > 0) {
      const dir = stack.pop();
      let entries;
      try {
        entries = readdirSync(normWin(dir), { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        let isDirectory = entry.isDirectory();
        if (!isDirectory) {
          try {
            isDirectory = statSync(normWin(fullPath)).isDirectory();
          } catch {
            isDirectory = false;
          }
        }
        if (!isDirectory) continue;

        if (entry.name === 'lru-cache') {
          const pkgPath = join(fullPath, 'package.json');
          if (!existsSync(normWin(pkgPath))) {
            stack.push(fullPath);
            continue;
          }

          try {
            const pkg = JSON.parse(readFileSync(normWin(pkgPath), 'utf8'));
            if (pkg.type !== 'module') {
              const mainFile = pkg.main || 'index.js';
              const entryFile = join(fullPath, mainFile);
              if (existsSync(normWin(entryFile))) {
                const original = readFileSync(normWin(entryFile), 'utf8');
                if (!original.includes('exports.LRUCache')) {
                  const patched = [
                    original,
                    '',
                    'if (typeof module.exports === "function" && !module.exports.LRUCache) {',
                    '  module.exports.LRUCache = module.exports;',
                    '}',
                    '',
                  ].join('\n');
                  writeFileSync(normWin(entryFile), patched, 'utf8');
                  lruCount++;
                  console.log(`[after-pack] 🩹 Patched lru-cache CJS (v${pkg.version}) at ${relative(rootDir, fullPath)}`);
                }
              }
            }

            const moduleFile = typeof pkg.module === 'string' ? pkg.module : null;
            if (moduleFile) {
              const esmEntry = join(fullPath, moduleFile);
              if (existsSync(normWin(esmEntry))) {
                const esmOriginal = readFileSync(normWin(esmEntry), 'utf8');
                if (
                  esmOriginal.includes('export default LRUCache') &&
                  !esmOriginal.includes('export { LRUCache')
                ) {
                  const esmPatched = [esmOriginal, '', 'export { LRUCache }', ''].join('\n');
                  writeFileSync(normWin(esmEntry), esmPatched, 'utf8');
                  lruCount++;
                  console.log(`[after-pack] 🩹 Patched lru-cache ESM (v${pkg.version}) at ${relative(rootDir, fullPath)}`);
                }
              }
            }
          } catch (err) {
            console.warn(`[after-pack] ⚠️  Failed to patch lru-cache at ${fullPath}:`, err.message);
          }
        } else {
          stack.push(fullPath);
        }
      }
    }

    return lruCount;
  }

  count += patchAllLruCacheInstances(nodeModulesDir);

  if (count > 0) {
    console.log(`[after-pack] 🩹 Patched ${count} broken module(s) in ${nodeModulesDir}`);
  }
}

function getVirtualStoreNodeModules(realPkgPath) {
  let dir = realPkgPath;
  while (dir !== dirname(dir)) {
    if (basename(dir) === 'node_modules') return dir;
    dir = dirname(dir);
  }
  return null;
}

function listPkgs(nodeModulesDir) {
  const result = [];
  const nDir = normWin(nodeModulesDir);
  if (!existsSync(nDir)) return result;
  for (const entry of readdirSync(nDir)) {
    if (entry === '.bin') continue;
    const fullPath = join(nodeModulesDir, entry);
    if (entry.startsWith('@')) {
      let subs;
      try { subs = readdirSync(normWin(fullPath)); } catch { continue; }
      for (const sub of subs) {
        result.push({ name: `${entry}/${sub}`, fullPath: join(fullPath, sub) });
      }
    } else {
      result.push({ name: entry, fullPath });
    }
  }
  return result;
}

function bundlePlugin(nodeModulesRoot, npmName, destDir) {
  const pkgPath = join(nodeModulesRoot, ...npmName.split('/'));
  if (!existsSync(pkgPath)) {
    console.warn(`[after-pack] ⚠️  Plugin package not found: ${pkgPath}. Run pnpm install.`);
    return false;
  }

  let realPluginPath;
  try { realPluginPath = realpathSync(pkgPath); } catch { realPluginPath = pkgPath; }

  if (existsSync(normWin(destDir))) rmSync(normWin(destDir), { recursive: true, force: true });
  mkdirSync(normWin(destDir), { recursive: true });
  cpSync(normWin(realPluginPath), normWin(destDir), { recursive: true, dereference: true });

  const collected = new Map();
  const queue = [];

  const rootVirtualNM = getVirtualStoreNodeModules(realPluginPath);
  if (!rootVirtualNM) {
    console.warn(`[after-pack] ⚠️  Could not find virtual store for ${npmName}, skipping deps.`);
    return true;
  }
  queue.push({ nodeModulesDir: rootVirtualNM, skipPkg: npmName });

  const SKIP_PACKAGES = new Set(['typescript', '@playwright/test']);
  const SKIP_SCOPES = ['@types/'];
  try {
    const pluginPkg = JSON.parse(
      require('fs').readFileSync(join(destDir, 'package.json'), 'utf8')
    );
    for (const peer of Object.keys(pluginPkg.peerDependencies || {})) {
      SKIP_PACKAGES.add(peer);
    }
  } catch { }

  while (queue.length > 0) {
    const { nodeModulesDir, skipPkg } = queue.shift();
    for (const { name, fullPath } of listPkgs(nodeModulesDir)) {
      if (name === skipPkg) continue;
      if (SKIP_PACKAGES.has(name) || SKIP_SCOPES.some(s => name.startsWith(s))) continue;
      let rp;
      try { rp = realpathSync(fullPath); } catch { continue; }
      if (collected.has(rp)) continue;
      collected.set(rp, name);
      const depVirtualNM = getVirtualStoreNodeModules(rp);
      if (depVirtualNM && depVirtualNM !== nodeModulesDir) {
        queue.push({ nodeModulesDir: depVirtualNM, skipPkg: name });
      }
    }
  }

  const destNM = join(destDir, 'node_modules');
  mkdirSync(destNM, { recursive: true });
  const copiedNames = new Set();
  let count = 0;
  for (const [rp, pkgName] of collected) {
    if (copiedNames.has(pkgName)) continue;
    copiedNames.add(pkgName);
    const d = join(destNM, pkgName);
    try {
      mkdirSync(normWin(dirname(d)), { recursive: true });
      cpSync(normWin(rp), normWin(d), { recursive: true, dereference: true });
      count++;
    } catch (e) {
      console.warn(`[after-pack]   Skipped dep ${pkgName}: ${e.message}`);
    }
  }
  console.log(`[after-pack] ✅ Plugin ${npmName}: copied ${count} deps to ${destDir}`);
  return true;
}

function copyDirectoryEntries(srcDir, destDir) {
  if (existsSync(normWin(destDir))) {
    rmSync(normWin(destDir), { recursive: true, force: true });
  }
  mkdirSync(normWin(destDir), { recursive: true });
  let copied = 0;
  for (const entry of readdirSync(normWin(srcDir), { withFileTypes: true })) {
    const from = join(srcDir, entry.name);
    const to = join(destDir, entry.name);
    mkdirSync(normWin(dirname(to)), { recursive: true });
    cpSync(normWin(from), normWin(to), { recursive: true, dereference: true });
    copied++;
  }
  return copied;
}

exports.default = async function afterPack(context) {
  const appOutDir = context.appOutDir;
  const platform = context.electronPlatformName;
  const arch = resolveArch(context.arch);

  console.log(`[after-pack] Target: ${platform}/${arch}`);

  const src = join(__dirname, '..', 'build', 'openclaw', 'node_modules');

  let resourcesDir;
  if (platform === 'darwin') {
    const appName = context.packager.appInfo.productFilename;
    resourcesDir = join(appOutDir, `${appName}.app`, 'Contents', 'Resources');
  } else {
    resourcesDir = join(appOutDir, 'resources');
  }

  const openclawRoot = join(resourcesDir, 'node_modules', 'openclaw');
  const dest = join(openclawRoot, 'node_modules');
  const nodeModulesRoot = join(__dirname, '..', 'node_modules');
  const pluginsDestRoot = join(resourcesDir, 'openclaw-plugins');

  if (!existsSync(src)) {
    console.warn('[after-pack] ⚠️  build/openclaw/node_modules not found. Run bundle-openclaw first.');
    return;
  }

  const depCount = readdirSync(src, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name !== '.bin')
    .length;

  console.log(`[after-pack] Copying ${depCount} openclaw dependencies to ${dest} ...`);
  const copiedEntries = copyDirectoryEntries(src, dest);
  console.log(`[after-pack] ✅ openclaw node_modules copied (${copiedEntries} top-level entries).`);

  patchBrokenModules(dest);

  const BUNDLED_PLUGINS = [
    { npmName: '@soimy/dingtalk', pluginId: 'dingtalk' },
    { npmName: '@wecom/wecom-openclaw-plugin', pluginId: 'wecom' },
    { npmName: '@sliverp/qqbot', pluginId: 'qqbot' },
    { npmName: '@larksuite/openclaw-lark', pluginId: 'openclaw-lark' },
    { npmName: '@tencent-weixin/openclaw-weixin', pluginId: 'openclaw-weixin' },
  ];

  mkdirSync(pluginsDestRoot, { recursive: true });
  for (const { npmName, pluginId } of BUNDLED_PLUGINS) {
    const pluginDestDir = join(pluginsDestRoot, pluginId);
    console.log(`[after-pack] Bundling plugin ${npmName} -> ${pluginDestDir}`);
    const ok = bundlePlugin(nodeModulesRoot, npmName, pluginDestDir);
    if (ok) {
      const pluginNM = join(pluginDestDir, 'node_modules');
      cleanupUnnecessaryFiles(pluginDestDir);
      if (existsSync(pluginNM)) {
        cleanupKoffi(pluginNM, platform, arch);
        cleanupNativePlatformPackages(pluginNM, platform, arch);
      }
    }
  }

  const buildExtDir = join(__dirname, '..', 'build', 'openclaw', 'dist', 'extensions');
  const packExtDir = join(openclawRoot, 'dist', 'extensions');
  if (existsSync(buildExtDir)) {
    let extNMCount = 0;
    let mergedPkgCount = 0;

    for (const extEntry of readdirSync(buildExtDir, { withFileTypes: true })) {
      if (!extEntry.isDirectory()) continue;
      const srcNM = join(buildExtDir, extEntry.name, 'node_modules');
      if (!existsSync(srcNM)) continue;

      const destExtNM = join(packExtDir, extEntry.name, 'node_modules');
      if (!existsSync(destExtNM)) {
        cpSync(srcNM, destExtNM, { recursive: true });
      }
      extNMCount++;

      for (const pkgEntry of readdirSync(srcNM, { withFileTypes: true })) {
        if (!pkgEntry.isDirectory() || pkgEntry.name === '.bin') continue;
        const srcPkg = join(srcNM, pkgEntry.name);
        const destPkg = join(dest, pkgEntry.name);

        if (pkgEntry.name.startsWith('@')) {
          for (const scopeEntry of readdirSync(srcPkg, { withFileTypes: true })) {
            if (!scopeEntry.isDirectory()) continue;
            const srcScoped = join(srcPkg, scopeEntry.name);
            const destScoped = join(destPkg, scopeEntry.name);
            if (!existsSync(destScoped)) {
              mkdirSync(dirname(destScoped), { recursive: true });
              cpSync(srcScoped, destScoped, { recursive: true });
              mergedPkgCount++;
            }
          }
        } else if (!existsSync(destPkg)) {
          cpSync(srcPkg, destPkg, { recursive: true });
          mergedPkgCount++;
        }
      }
    }

    if (extNMCount > 0) {
      console.log(`[after-pack] ✅ Copied node_modules for ${extNMCount} built-in extension(s), merged ${mergedPkgCount} packages into top-level.`);
    }
  }

  console.log('[after-pack] 🧹 Cleaning up unnecessary files ...');
  const removedRoot = cleanupUnnecessaryFiles(openclawRoot);
  console.log(`[after-pack] ✅ Removed ${removedRoot} unnecessary files/directories.`);

  const koffiRemoved = cleanupKoffi(dest, platform, arch);
  if (koffiRemoved > 0) {
    console.log(`[after-pack] ✅ koffi: removed ${koffiRemoved} non-target platform binaries (kept ${platform}_${arch}).`);
  }

  const nativeRemoved = cleanupNativePlatformPackages(dest, platform, arch);
  if (nativeRemoved > 0) {
    console.log(`[after-pack] ✅ Removed ${nativeRemoved} non-target native platform packages.`);
  }
};
