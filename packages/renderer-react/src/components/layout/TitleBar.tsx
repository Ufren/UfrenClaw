/**
 * TitleBar Component
 * macOS: empty drag region (native traffic lights handled by hiddenInset).
 * Windows/Linux: drag region on left, minimize/maximize/close on right.
 */
import { useState, useEffect } from 'react';
import { Minus, Square, X, Copy, Sun, Moon, Monitor, Globe } from 'lucide-react';
import { invokeIpc } from '@/lib/api-client';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '@/stores/settings';
import { cn } from '@/lib/utils';

const isMac = window.electron?.platform === 'darwin';

export function TitleBar() {
  if (isMac) {
    return <MacTitleBar />;
  }

  return <WindowsTitleBar />;
}

function MacTitleBar() {
  const { i18n } = useTranslation();
  const theme = useSettingsStore((state) => state.theme);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const language = useSettingsStore((state) => state.language);
  const setLanguage = useSettingsStore((state) => state.setLanguage);

  const toggleLanguage = () => {
    const newLang = language === 'en' ? 'zh' : language === 'zh' ? 'ja' : 'en';
    setLanguage(newLang);
    i18n.changeLanguage(newLang);
  };

  const cycleTheme = () => {
    const themes: ('light' | 'dark' | 'system')[] = ['light', 'dark', 'system'];
    const currentIndex = themes.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    setTheme(themes[nextIndex]);
  };

  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;

  return (
    <div className="drag-region flex h-10 shrink-0 items-center justify-end border-b bg-background gap-1 pr-2">
      <button
        onClick={toggleLanguage}
        className="no-drag flex h-7 items-center gap-1 px-2 rounded-md text-muted-foreground hover:bg-accent transition-colors text-xs font-medium"
        title={language === 'en' ? 'English' : language === 'zh' ? '中文' : '日本語'}
      >
        <Globe className="h-3.5 w-3.5" />
        <span className="uppercase">{language}</span>
      </button>
      <button
        onClick={cycleTheme}
        className="no-drag flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent transition-colors"
        title={theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'System'}
      >
        <ThemeIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function WindowsTitleBar() {
  const { t, i18n } = useTranslation('common');
  const [maximized, setMaximized] = useState(false);
  const theme = useSettingsStore((state) => state.theme);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const language = useSettingsStore((state) => state.language);
  const setLanguage = useSettingsStore((state) => state.setLanguage);

  useEffect(() => {
    invokeIpc('window:isMaximized').then((val) => {
      setMaximized(val as boolean);
    });
  }, []);

  const handleMinimize = () => {
    invokeIpc('window:minimize');
  };

  const handleMaximize = () => {
    invokeIpc('window:maximize').then(() => {
      invokeIpc('window:isMaximized').then((val) => {
        setMaximized(val as boolean);
      });
    });
  };

  const handleClose = () => {
    invokeIpc('window:close');
  };

  const toggleLanguage = () => {
    const newLang = language === 'en' ? 'zh' : language === 'zh' ? 'ja' : 'en';
    setLanguage(newLang);
    i18n.changeLanguage(newLang);
  };

  const cycleTheme = () => {
    const themes: ('light' | 'dark' | 'system')[] = ['light', 'dark', 'system'];
    const currentIndex = themes.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    setTheme(themes[nextIndex]);
  };

  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;

  return (
    <div className="drag-region flex h-10 shrink-0 items-center justify-end border-b bg-background">

      {/* Language and Theme Toggle */}
      <div className="no-drag flex h-full items-center pr-1 gap-0.5">
        <button
          onClick={toggleLanguage}
          className="flex h-7 items-center gap-1 px-2 rounded-md text-muted-foreground hover:bg-accent transition-colors text-xs font-medium"
          title={language === 'en' ? 'English' : language === 'zh' ? '中文' : '日本語'}
        >
          <Globe className="h-3.5 w-3.5" />
          <span className="uppercase">{language}</span>
        </button>
        <button
          onClick={cycleTheme}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent transition-colors"
          title={theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'System'}
        >
          <ThemeIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Right: Window Controls */}
      <div className="no-drag flex h-full">
        <button
          onClick={handleMinimize}
          className="flex h-full w-11 items-center justify-center text-muted-foreground hover:bg-accent transition-colors"
          title={t('titleBar.minimize')}
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          onClick={handleMaximize}
          className="flex h-full w-11 items-center justify-center text-muted-foreground hover:bg-accent transition-colors"
          title={maximized ? t('titleBar.restore') : t('titleBar.maximize')}
        >
          {maximized ? <Copy className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={handleClose}
          className="flex h-full w-11 items-center justify-center text-muted-foreground hover:bg-red-500 hover:text-white transition-colors"
          title={t('titleBar.close')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
