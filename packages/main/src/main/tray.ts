/**
 * System Tray Management
 * Creates and manages the system tray icon and menu
 */
import { Tray, Menu, BrowserWindow, app, nativeImage } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let tray: Tray | null = null;
let currentMainWindow: BrowserWindow | null = null;
let currentLang = 'en';

const translations = {
  en: {
    show: 'Show UfrenClaw',
    gatewayStatus: 'Gateway Status',
    running: '  Running',
    quit: 'Quit UfrenClaw',
  },
  zh: {
    show: '显示 UfrenClaw',
    gatewayStatus: '网关状态',
    running: '  运行中',
    quit: '退出 UfrenClaw',
  },
  ja: {
    show: 'UfrenClawを表示',
    gatewayStatus: 'ゲートウェイステータス',
    running: '  実行中',
    quit: 'UfrenClawを終了',
  },
};

type Language = keyof typeof translations;

/**
 * Resolve the icons directory path (works in both dev and packaged mode)
 */
function getIconsDir(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'resources', 'icons');
  }
  return join(__dirname, '../../../resources/icons');
}

/**
 * Create system tray icon and menu
 */
export function createTray(mainWindow: BrowserWindow): Tray {
  currentMainWindow = mainWindow;
  // Use platform-appropriate icon for system tray
  const iconsDir = getIconsDir();
  let iconPath: string;

  if (process.platform === 'win32') {
    // Windows: use .ico for best quality in system tray
    iconPath = join(iconsDir, 'icon.ico');
  } else if (process.platform === 'darwin') {
    // macOS: use Template.png for proper status bar icon
    // The "Template" suffix tells macOS to treat it as a template image
    iconPath = join(iconsDir, 'tray-icon-Template.png');
  } else {
    // Linux: use 32x32 PNG
    iconPath = join(iconsDir, '32x32.png');
  }

  let icon = nativeImage.createFromPath(iconPath);

  // Fallback to icon.png if platform-specific icon not found
  if (icon.isEmpty()) {
    icon = nativeImage.createFromPath(join(iconsDir, 'icon.png'));
    // Still try to set as template for macOS
    if (process.platform === 'darwin') {
      icon.setTemplateImage(true);
    }
  }

  // Note: Using "Template" suffix in filename automatically marks it as template image
  // But we can also explicitly set it for safety
  if (process.platform === 'darwin') {
    icon.setTemplateImage(true);
  }
  
  tray = new Tray(icon);
  
  // Set tooltip
  tray.setToolTip('UfrenClaw - AI Assistant');
  
  updateTrayMenu(currentLang);
  
  // Click to show window (Windows/Linux)
  tray.on('click', () => {
    if (mainWindow.isDestroyed()) return;
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
  
  // Double-click to show window (Windows)
  tray.on('double-click', () => {
    if (mainWindow.isDestroyed()) return;
    mainWindow.show();
    mainWindow.focus();
  });
  
  return tray;
}

/**
 * Update tray menu with localized strings
 */
export function updateTrayMenu(lang: string): void {
  if (!tray || !currentMainWindow) return;
  
  // Default to en if lang not found
  const safeLang = (translations[lang as Language] ? lang : 'en') as Language;
  currentLang = safeLang;
  const t = translations[safeLang];

  const showWindow = () => {
    if (!currentMainWindow || currentMainWindow.isDestroyed()) return;
    currentMainWindow.show();
    currentMainWindow.focus();
  };

  const contextMenu = Menu.buildFromTemplate([
    {
      label: t.show,
      click: showWindow,
    },
    {
      type: 'separator',
    },
    {
      label: t.gatewayStatus,
      enabled: false,
    },
    {
      label: t.running,
      type: 'checkbox',
      checked: true,
      enabled: false,
    },
    {
      type: 'separator',
    },
    {
      label: t.quit,
      click: () => {
        app.quit();
      },
    },
  ]);
  
  tray.setContextMenu(contextMenu);
}

/**
 * Update tray tooltip with Gateway status
 */
export function updateTrayStatus(status: string): void {
  if (tray) {
    tray.setToolTip(`UfrenClaw - ${status}`);
  }
}

/**
 * Destroy tray icon
 */
export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
