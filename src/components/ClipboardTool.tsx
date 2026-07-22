import { Check, ClipboardList, Copy, Pause, Pin, Play, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { searchClipboardHistory, type ClipboardHistoryEntry } from '../lib/clipboardHistory';
import { isDesktopRuntime, writeClipboardText } from '../lib/native';

interface ClipboardToolProps {
  entries: ClipboardHistoryEntry[];
  isRecording: boolean;
  error: string | null;
  onRecordingChange: (value: boolean) => void;
  onRemove: (id: string) => void;
  onTogglePin: (id: string) => void;
  onClear: () => void;
  onCopied: (text: string) => void;
}

function formatCapturedAt(value: number): string {
  const date = new Date(value);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(date)
    : new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

export function ClipboardTool({ entries, isRecording, error, onRecordingChange, onRemove, onTogglePin, onClear, onCopied }: ClipboardToolProps) {
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const visibleEntries = useMemo(() => searchClipboardHistory(entries, query), [entries, query]);
  const desktop = isDesktopRuntime();
  const recordingActive = isRecording && desktop && !error;
  const pinnedCount = entries.filter((entry) => entry.pinned).length;

  const copyEntry = async (entry: ClipboardHistoryEntry) => {
    setMessage('');
    try {
      await writeClipboardText(entry.text);
      onCopied(entry.text);
      setMessage('已复制到系统剪贴板');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '复制失败，请重试');
    }
  };

  return (
    <section className="tool-screen">
      <div className="tool-breadcrumb">文本与编码 <span>/</span> 剪贴板历史</div>
      <div className="tool-titlebar">
        <div><h1>剪贴板历史</h1><p>在 OmniKit 运行期间保留复制过的文本与链接，随时再次取用。</p></div>
        <div className="tool-actions">
          <button className="secondary-button" type="button" disabled={!entries.some((entry) => !entry.pinned)} onClick={onClear}><Trash2 size={16} /> 清空未置顶</button>
          <button className={recordingActive ? 'primary-button' : 'secondary-button'} type="button" disabled={!desktop} onClick={() => onRecordingChange(!isRecording)}>
            {recordingActive ? <Pause size={16} /> : <Play size={16} />} {desktop ? (isRecording ? '暂停记录' : '继续记录') : '桌面版可用'}
          </button>
        </div>
      </div>

      {!desktop && <p className="desktop-only-note"><ShieldCheck size={17} /> 剪贴板监听仅在已安装的 OmniKit 桌面版中可用。</p>}

      <div className="clipboard-panel">
        <div className="clipboard-panel-header">
          <label className="history-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索复制过的内容" aria-label="搜索剪贴板历史" /></label>
          <div className={recordingActive ? 'recording-state' : 'recording-state is-paused'}>
            <span className="status-dot" />{recordingActive ? '正在记录' : error ?? '记录已暂停'}
          </div>
        </div>

        <div className="clipboard-summary"><ClipboardList size={18} /><span>已保存 <strong>{entries.length}</strong> 条</span><span>置顶 <strong>{pinnedCount}</strong> 条</span><small>关闭 OmniKit 后停止记录</small></div>

        <div className="clipboard-list">
          {visibleEntries.map((entry) => (
            <article className={entry.pinned ? 'clipboard-entry is-pinned' : 'clipboard-entry'} key={entry.id}>
              <button className="clipboard-entry-copy" type="button" onClick={() => void copyEntry(entry)} title="再次复制">
                <span className="clipboard-entry-text">{entry.text}</span>
                <span className="clipboard-entry-meta">{entry.pinned && <Pin size={13} fill="currentColor" />} {formatCapturedAt(entry.capturedAt)}</span>
              </button>
              <div className="clipboard-entry-actions">
                <button className={entry.pinned ? 'icon-button is-selected' : 'icon-button'} type="button" onClick={() => onTogglePin(entry.id)} aria-label={entry.pinned ? '取消置顶' : '置顶'}><Pin size={16} fill={entry.pinned ? 'currentColor' : 'none'} /></button>
                <button className="icon-button" type="button" onClick={() => onRemove(entry.id)} aria-label="删除这条记录"><Trash2 size={16} /></button>
                <button className="icon-button copy-button" type="button" onClick={() => void copyEntry(entry)} aria-label="复制这条记录"><Copy size={16} /></button>
              </div>
            </article>
          ))}
          {!visibleEntries.length && <div className="clipboard-empty"><ClipboardList size={25} /><strong>{query ? '没有匹配的历史记录' : '还没有可用的剪贴板记录'}</strong><span>{desktop ? '从其他应用复制文本后，它会显示在这里。' : '请在桌面安装包中打开此工具。'}</span></div>}
        </div>
      </div>
      {message && <p className="clipboard-message"><Check size={16} /> {message}</p>}
    </section>
  );
}
