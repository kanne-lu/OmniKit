import { Minus, Search, Square, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { isDesktopRuntime } from '../lib/native';

interface TopbarProps {
  query: string;
  onQueryChange: (query: string) => void;
  compact?: boolean;
}

async function controlWindow(action: 'minimize' | 'toggleMaximize' | 'close') {
  if (!isDesktopRuntime()) return;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  await getCurrentWindow()[action]();
}

export function Topbar({ query, onQueryChange, compact = false }: TopbarProps) {
  const desktopRuntime = isDesktopRuntime();
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (compact) return;
    const focusSearch = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k') return;
      event.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, [compact]);

  return (
    <header className={compact ? 'topbar is-compact' : 'topbar'} data-tauri-drag-region>
      <label className="search-field">
        <Search size={21} aria-hidden="true" />
        <input ref={searchInputRef} value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="搜索工具" aria-label="搜索工具" aria-keyshortcuts="Control+K Meta+K" />
        <kbd>Ctrl K</kbd>
      </label>
      {desktopRuntime && <div className="window-controls" aria-label="窗口控制">
        <button type="button" onClick={() => void controlWindow('minimize')} aria-label="最小化"><Minus size={17} /></button>
        <button type="button" onClick={() => void controlWindow('toggleMaximize')} aria-label="最大化"><Square size={14} /></button>
        <button className="close-control" type="button" onClick={() => void controlWindow('close')} aria-label="关闭"><X size={18} /></button>
      </div>}
    </header>
  );
}
