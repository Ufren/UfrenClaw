/**
 * TitleBar Component
 * macOS: empty drag region (native traffic lights handled by hiddenInset).
 * Windows/Linux: drag region on left, minimize/maximize/close on right.
 */
import { useEffect, useMemo, useState } from "react";
import {
  AppWindowMac,
  Minus,
  Square,
  X,
  Copy,
  Sun,
  Moon,
  Monitor,
  Globe,
} from "lucide-react";
import { invokeIpc } from "@/lib/api-client";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "@/stores/settings";
import { useLocation, useNavigate } from "react-router-dom";

const isMac = window.electron?.platform === "darwin";

export function TitleBar() {
  if (isMac) {
    return <MacTitleBar />;
  }

  return <WindowsTitleBar />;
}

function MacTitleBar() {
  const { t, i18n } = useTranslation("common");
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useSettingsStore((state) => state.theme);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const language = useSettingsStore((state) => state.language);
  const setLanguage = useSettingsStore((state) => state.setLanguage);
  const routeLabel = useRouteLabel(location.pathname, t);

  const toggleLanguage = () => {
    const newLang = language === "en" ? "zh" : language === "zh" ? "ja" : "en";
    setLanguage(newLang);
    i18n.changeLanguage(newLang);
  };

  const cycleTheme = () => {
    const themes: ("light" | "dark" | "system")[] = ["light", "dark", "system"];
    const currentIndex = themes.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    setTheme(themes[nextIndex]);
  };

  const ThemeIcon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;

  return (
    <div className="drag-region flex h-12 shrink-0 items-center justify-between px-3">
      <WindowChrome
        routeLabel={routeLabel}
        language={language}
        onNavigateHome={() => navigate("/")}
        onToggleLanguage={toggleLanguage}
        ThemeIcon={ThemeIcon}
        onCycleTheme={cycleTheme}
      />
    </div>
  );
}

function WindowsTitleBar() {
  const { t, i18n } = useTranslation("common");
  const location = useLocation();
  const navigate = useNavigate();
  const [maximized, setMaximized] = useState(false);
  const theme = useSettingsStore((state) => state.theme);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const language = useSettingsStore((state) => state.language);
  const setLanguage = useSettingsStore((state) => state.setLanguage);
  const routeLabel = useRouteLabel(location.pathname, t);

  useEffect(() => {
    invokeIpc("window:isMaximized").then((val) => {
      setMaximized(val as boolean);
    });
  }, []);

  const handleMinimize = () => {
    invokeIpc("window:minimize");
  };

  const handleMaximize = () => {
    invokeIpc("window:maximize").then(() => {
      invokeIpc("window:isMaximized").then((val) => {
        setMaximized(val as boolean);
      });
    });
  };

  const handleClose = () => {
    invokeIpc("window:close");
  };

  const toggleLanguage = () => {
    const newLang = language === "en" ? "zh" : language === "zh" ? "ja" : "en";
    setLanguage(newLang);
    i18n.changeLanguage(newLang);
  };

  const cycleTheme = () => {
    const themes: ("light" | "dark" | "system")[] = ["light", "dark", "system"];
    const currentIndex = themes.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    setTheme(themes[nextIndex]);
  };

  const ThemeIcon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;

  return (
    <div className="drag-region flex h-12 shrink-0 items-center justify-between pl-3">
      <WindowChrome
        routeLabel={routeLabel}
        language={language}
        onNavigateHome={() => navigate("/")}
        onToggleLanguage={toggleLanguage}
        ThemeIcon={ThemeIcon}
        onCycleTheme={cycleTheme}
      />

      <div className="no-drag flex h-full">
        <button
          onClick={handleMinimize}
          className="flex h-full w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-accent/80"
          title={t("titleBar.minimize")}
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          onClick={handleMaximize}
          className="flex h-full w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-accent/80"
          title={maximized ? t("titleBar.restore") : t("titleBar.maximize")}
        >
          {maximized ? (
            <Copy className="h-3.5 w-3.5" />
          ) : (
            <Square className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          onClick={handleClose}
          className="flex h-full w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-red-500 hover:text-white"
          title={t("titleBar.close")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function WindowChrome({
  routeLabel,
  language,
  onNavigateHome,
  onToggleLanguage,
  ThemeIcon,
  onCycleTheme,
}: {
  routeLabel: string;
  language: string;
  onNavigateHome: () => void;
  onToggleLanguage: () => void;
  ThemeIcon: typeof Sun;
  onCycleTheme: () => void;
}) {
  const languageLabel =
    language === "en" ? "English" : language === "zh" ? "中文" : "日本語";

  return (
    <div className="flex flex-1 items-center justify-between gap-3">
      <button
        type="button"
        onClick={onNavigateHome}
        title="UfrenClaw"
        className="no-drag flex min-w-0 items-center gap-2 rounded-full border border-border/70 bg-background/70 px-2 py-1 shadow-sm backdrop-blur-md transition-colors hover:bg-accent/80"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
          <AppWindowMac className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 leading-none">
          <div className="truncate text-[12px] font-semibold text-foreground/85">
            UfrenClaw
          </div>
          <div className="truncate pt-1 text-[11px] text-muted-foreground">
            {routeLabel}
          </div>
        </div>
      </button>

      <div className="no-drag flex items-center gap-1 rounded-full border border-border/70 bg-background/70 p-1 shadow-sm backdrop-blur-md">
        <button
          onClick={onToggleLanguage}
          className="flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/80 hover:text-foreground"
          title={languageLabel}
        >
          <Globe className="h-3.5 w-3.5" />
          <span className="uppercase">{language}</span>
        </button>
        <button
          onClick={onCycleTheme}
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent/80 hover:text-foreground"
          title="Theme"
        >
          <ThemeIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function useRouteLabel(
  pathname: string,
  t: ReturnType<typeof useTranslation>["t"],
) {
  return useMemo(() => {
    if (pathname.startsWith("/settings")) return t("sidebar.settings");
    if (pathname.startsWith("/skills")) return t("sidebar.skills");
    if (pathname.startsWith("/agents")) return t("sidebar.agents");
    if (pathname.startsWith("/channels")) return t("sidebar.channels");
    if (pathname.startsWith("/models")) return t("sidebar.models");
    if (pathname.startsWith("/cron")) return t("sidebar.cronTasks");
    return t("sidebar.newChat");
  }, [pathname, t]);
}
