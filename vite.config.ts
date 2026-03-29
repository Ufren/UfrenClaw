import { defineConfig } from "vite";
import { resolve } from "path";
import react from "@vitejs/plugin-react-swc";
import { fileURLToPath } from "url";
import { dirname } from "path";

// ESM environment fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 获取 Electron 版本信息
function getElectronVersion() {
  try {
    const electronPackage = require("electron/package.json");
    return electronPackage.version;
  } catch {
    return "37.0.0"; // 默认版本
  }
}

function getChromeMajorVersion() {
  try {
    const electronVersion = getElectronVersion();
    // Electron 37.x 对应 Chrome 128
    const versionMap: Record<string, string> = {
      "37": "128",
      "36": "127",
      "35": "126",
    };
    const majorVersion = electronVersion.split(".")[0];
    return versionMap[majorVersion] || "128";
  } catch {
    return "128";
  }
}

export default defineConfig(({ command: _command, mode }) => {
  const isProduction = mode === "production";
  const chromeMajorVersion = getChromeMajorVersion();
  const isRenderer = process.env.VITE_TARGET === "renderer";
  const rendererRoot = "packages/renderer-react";
  const apiTarget = process.env.API_TARGET || "";
  return {
    // 根据构建目标设置不同的根目录
    root: isRenderer ? rendererRoot : ".",

    plugins: [...(isRenderer ? [react()] : [])],

    define: {
      "import.meta.env.VITE_API_BASE_URL": JSON.stringify(apiTarget),
    },

    resolve: {
      alias: isRenderer
        ? {
            "@": resolve(__dirname, rendererRoot, "src"),
          }
        : {
            // 主进程和预加载脚本的别名
            "@main": resolve(__dirname, "packages/main/src"),
            "@preload": resolve(__dirname, "packages/preload/src"),
            "@renderer": resolve(__dirname, "packages/renderer-react/src"),
            "@types": resolve(__dirname, "types"),
          },
    },

    build: {
      // 根据目标设置不同的构建配置
      ...(process.env.VITE_TARGET === "main" && {
        ssr: true,
        sourcemap: isProduction ? false : "inline",
        outDir: "packages/main/dist",
        target: `node${process.versions.node}`,
        lib: {
          entry: "packages/main/src/main/index.ts",
          formats: ["es"],
          fileName: () => "index.js",
        },
        rollupOptions: {
          external: [
            "electron",
            "sqlite3",
            "electron-log",
            "node-fetch",
            "node-pty",
          ],
        },
      }),

      ...(process.env.VITE_TARGET === "preload" && {
        ssr: true,
        sourcemap: isProduction ? false : "inline",
        outDir: "packages/preload/dist",
        target: `chrome${chromeMajorVersion}`,
        lib: {
          entry: "packages/preload/src/index.ts",
          formats: ["es"],
          fileName: () => "index.js",
        },
        rollupOptions: {
          external: ["electron"],
        },
      }),

      ...(process.env.VITE_TARGET === "renderer" && {
        outDir: "dist",
        base: "./", // 强制相对路径，确保 Electron 中正确加载
        target: `chrome${chromeMajorVersion}`,
        rollupOptions: {
          input: {
            main: resolve(__dirname, rendererRoot, "index.html"),
          },
          output: {
            // 确保资源路径正确
            assetFileNames: "assets/[name]-[hash][extname]",
            chunkFileNames: "assets/[name]-[hash].js",
            entryFileNames: "assets/[name]-[hash].js",
          },
        },
      }),
    },

    // 开发服务器配置（仅用于渲染进程）
    server: {
      port: 3001,
      strictPort: true,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
        "/chat": {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
