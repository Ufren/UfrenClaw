import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, "build", "openclaw");
const NODE_MODULES = path.join(ROOT, "node_modules");

function normWin(p) {
  if (process.platform !== "win32") return p;
  if (p.startsWith("\\\\?\\")) return p;
  return "\\\\?\\" + p.replace(/\//g, "\\");
}

function getVirtualStoreNodeModules(realPkgPath) {
  let dir = realPkgPath;
  while (dir !== path.dirname(dir)) {
    if (path.basename(dir) === "node_modules") {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return null;
}

function listPackages(nodeModulesDir) {
  const result = [];
  const nDir = normWin(nodeModulesDir);
  if (!fs.existsSync(nDir)) return result;

  for (const entry of fs.readdirSync(nDir)) {
    if (entry === ".bin") continue;
    const entryPath = path.join(nodeModulesDir, entry);

    if (entry.startsWith("@")) {
      try {
        const scopeEntries = fs.readdirSync(normWin(entryPath));
        for (const sub of scopeEntries) {
          result.push({
            name: `${entry}/${sub}`,
            fullPath: path.join(entryPath, sub),
          });
        }
      } catch {}
    } else {
      result.push({ name: entry, fullPath: entryPath });
    }
  }
  return result;
}

function safeRemoveDir(target) {
  try {
    fs.rmSync(normWin(target), { recursive: true, force: true });
  } catch {}
}

function copyDir(src, dest) {
  fs.mkdirSync(normWin(path.dirname(dest)), { recursive: true });
  fs.cpSync(normWin(src), normWin(dest), { recursive: true, dereference: true });
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(normWin(p), "utf-8"));
  } catch {
    return null;
  }
}

function writeJson(p, obj) {
  fs.mkdirSync(normWin(path.dirname(p)), { recursive: true });
  fs.writeFileSync(normWin(p), JSON.stringify(obj, null, 2), "utf-8");
}

function ensureFile(p, content) {
  if (fs.existsSync(normWin(p))) return;
  fs.mkdirSync(normWin(path.dirname(p)), { recursive: true });
  fs.writeFileSync(normWin(p), content, "utf-8");
}

function patchChalk(outputNodeModules) {
  const pkgPath = path.join(outputNodeModules, "chalk", "package.json");
  const pkg = readJson(pkgPath);
  if (!pkg) return;

  const exportsValue = pkg.exports && typeof pkg.exports === "object" ? pkg.exports : {};
  if (!exportsValue.require) {
    exportsValue.import = exportsValue.import || "./source/index.js";
    exportsValue.require = "./source/index.cjs";
    pkg.exports = exportsValue;
    writeJson(pkgPath, pkg);
  }

  ensureFile(
    path.join(outputNodeModules, "chalk", "source", "index.cjs"),
    [
      "function createChalkStub() {",
      "  let proxy;",
      "  const fn = (...args) => args.map((v) => String(v)).join(\"\");",
      "  proxy = new Proxy(fn, {",
      "    get(_target, _prop) {",
      "      return proxy;",
      "    },",
      "    apply(_target, _thisArg, argArray) {",
      "      return fn(...argArray);",
      "    },",
      "  });",
      "  return proxy;",
      "}",
      "",
      "const thisProxy = createChalkStub();",
      "",
      "module.exports = thisProxy;",
      "",
    ].join("\n"),
  );
}

function patchNodeFetch(outputNodeModules) {
  const pkgPath = path.join(outputNodeModules, "node-fetch", "package.json");
  const pkg = readJson(pkgPath);
  if (!pkg) return;

  const exportsValue = pkg.exports && typeof pkg.exports === "object" ? pkg.exports : {};
  if (!exportsValue.require) {
    exportsValue.import = exportsValue.import || "./src/index.js";
    exportsValue.require = "./src/index.cjs";
    pkg.exports = exportsValue;
    writeJson(pkgPath, pkg);
  }

  ensureFile(
    path.join(outputNodeModules, "node-fetch", "src", "index.cjs"),
    [
      "const fetchFn = (...args) => fetch(...args);",
      "",
      "module.exports = fetchFn;",
      "module.exports.default = fetchFn;",
      "module.exports.Headers = Headers;",
      "module.exports.Request = Request;",
      "module.exports.Response = Response;",
      "module.exports.FormData = FormData;",
      "",
    ].join("\n"),
  );
}

function walkFiles(dir, out = []) {
  const entries = fs.readdirSync(normWin(dir), { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkFiles(full, out);
    else out.push(full);
  }
  return out;
}

function patchTmpDirForWindows(outputRoot) {
  const distDir = path.join(outputRoot, "dist");
  if (!fs.existsSync(normWin(distDir))) return;

  const marker = "const existingPreferredState = resolveDirState(POSIX_OPENCLAW_TMP_DIR);";
  const re = /(^|\n)([ \t]*)const existingPreferredState = resolveDirState\(POSIX_OPENCLAW_TMP_DIR\);/m;
  const files = walkFiles(distDir).filter((p) => p.endsWith(".js"));
  for (const file of files) {
    let raw;
    try {
      raw = fs.readFileSync(normWin(file), "utf-8");
    } catch {
      continue;
    }
    if (!raw.includes(marker)) continue;
    const next = raw.replace(
      re,
      ($0, eol, indent) =>
        `${eol}${indent}if (process.platform === "win32") return ensureTrustedFallbackDir();${eol}${indent}const existingPreferredState = resolveDirState(POSIX_OPENCLAW_TMP_DIR);`,
    );
    if (next !== raw) {
      try {
        fs.writeFileSync(normWin(file), next, "utf-8");
      } catch {}
    }
  }
}

function main() {
  const openclawLink = path.join(NODE_MODULES, "openclaw");
  if (!fs.existsSync(openclawLink)) {
    console.error("node_modules/openclaw not found. Please install dependencies first.");
    process.exit(1);
  }

  const openclawReal = fs.realpathSync(openclawLink);

  safeRemoveDir(OUTPUT);
  fs.mkdirSync(normWin(OUTPUT), { recursive: true });

  copyDir(openclawReal, OUTPUT);

  const openclawVirtualNM = getVirtualStoreNodeModules(openclawReal);
  if (!openclawVirtualNM) {
    console.error("Could not determine pnpm virtual store for openclaw.");
    process.exit(1);
  }

  const collected = new Map();
  const queue = [{ nodeModulesDir: openclawVirtualNM, skipPkg: "openclaw" }];
  const skipPackages = new Set(["typescript", "@playwright/test"]);
  const skipScopes = ["@types/"];

  while (queue.length > 0) {
    const { nodeModulesDir, skipPkg } = queue.shift();
    const packages = listPackages(nodeModulesDir);

    for (const { name, fullPath } of packages) {
      if (name === skipPkg) continue;
      if (skipPackages.has(name) || skipScopes.some((s) => name.startsWith(s))) {
        continue;
      }

      let realPath;
      try {
        realPath = fs.realpathSync(fullPath);
      } catch {
        continue;
      }

      if (collected.has(realPath)) continue;
      collected.set(realPath, name);

      const depVirtualNM = getVirtualStoreNodeModules(realPath);
      if (depVirtualNM && depVirtualNM !== nodeModulesDir) {
        queue.push({ nodeModulesDir: depVirtualNM, skipPkg: name });
      }
    }
  }

  const outputNodeModules = path.join(OUTPUT, "node_modules");
  fs.mkdirSync(normWin(outputNodeModules), { recursive: true });

  const copiedNames = new Set();
  for (const [realPath, pkgName] of collected) {
    if (copiedNames.has(pkgName)) continue;
    copiedNames.add(pkgName);
    const dest = path.join(outputNodeModules, pkgName);
    try {
      copyDir(realPath, dest);
    } catch {}
  }

  patchChalk(outputNodeModules);
  patchNodeFetch(outputNodeModules);
  patchTmpDirForWindows(OUTPUT);
}

main();
