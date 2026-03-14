/**
 * TitleBar Component
 * macOS: empty drag region (native traffic lights handled by hiddenInset).
 * Windows/Linux: drag region on left, minimize/maximize/close on right.
 */
import { useState, useEffect } from 'react';
import { Minus, Square, X, Copy } from 'lucide-react';
import { invokeIpc } from '@/lib/api-client';
import { useTranslation } from 'react-i18next';

const isMac = window.electron?.platform === 'darwin';

export function TitleBar() {
  if (isMac) {
    // macOS: just a drag region, traffic lights are native
    return <div className="drag-region h-10 shrink-0 border-b bg-background" />;
  }

  return <WindowsTitleBar />;
}

function WindowsTitleBar() {
  const { t } = useTranslation('common');
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    // Check initial state
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

  return (
    <div className="drag-region flex h-10 shrink-0 items-center justify-end border-b bg-background">

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
