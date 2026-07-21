import { useState } from 'react';
import { CircleCheck, CircleHelp, Database, Download, RefreshCw, ShieldCheck, Trash2, TriangleAlert } from 'lucide-react';
import type { Update } from '@tauri-apps/plugin-updater';
import { checkForUpdate, getUpdateRuntime, installUpdate, type UpdateRuntime } from '../lib/updater';

interface SettingsPanelProps {
  recentCount: number;
  favoriteCount: number;
  reducedMotion: boolean;
  onReducedMotionChange: (value: boolean) => void;
  onClearRecent: () => void;
  onClearFavorites: () => void;
}

export function SettingsPanel({ recentCount, favoriteCount, reducedMotion, onReducedMotionChange, onClearRecent, onClearFavorites }: SettingsPanelProps) {
  return <section className="info-view" aria-labelledby="settings-title">
    <header className="info-heading"><span className="section-kicker">应用偏好</span><h1 id="settings-title">设置</h1><p>这些偏好只保存在当前设备中。</p></header>
    <div className="settings-grid">
      <article className="settings-panel"><div className="panel-icon"><CircleHelp size={21} /></div><div><h2>界面反馈</h2><p>保留按钮和卡片的轻微过渡效果。</p></div><label className="switch-row"><span>减少动态效果</span><input type="checkbox" checked={reducedMotion} onChange={(event) => onReducedMotionChange(event.target.checked)} /><i aria-hidden="true" /></label></article>
      <article className="settings-panel"><div className="panel-icon"><Database size={21} /></div><div><h2>本机记录</h2><p>最近使用和收藏只存储在此设备的浏览器数据中。</p></div><div className="data-actions"><button type="button" className="secondary-button" disabled={!recentCount} onClick={onClearRecent}><Trash2 size={17} /> 清空最近使用 <small>{recentCount}</small></button><button type="button" className="secondary-button" disabled={!favoriteCount} onClick={onClearFavorites}><Trash2 size={17} /> 清空收藏 <small>{favoriteCount}</small></button></div></article>
    </div>
  </section>;
}

type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'unavailable' }
  | { kind: 'latest' }
  | { kind: 'available'; runtime: UpdateRuntime; update: Update }
  | { kind: 'installing'; version: string }
  | { kind: 'error'; action: 'check' | 'install' };

export function UpdatePanel() {
  const [state, setState] = useState<UpdateState>({ kind: 'idle' });
  const isBusy = state.kind === 'checking' || state.kind === 'installing';

  const checkUpdates = async () => {
    setState({ kind: 'checking' });
    try {
      const runtime = await getUpdateRuntime();
      if (!runtime) {
        setState({ kind: 'unavailable' });
        return;
      }
      const update = await checkForUpdate(runtime);
      setState(update ? { kind: 'available', runtime, update } : { kind: 'latest' });
    } catch {
      setState({ kind: 'error', action: 'check' });
    }
  };

  const installAvailableUpdate = async () => {
    if (state.kind !== 'available') return;
    const { runtime, update } = state;
    setState({ kind: 'installing', version: update.version });
    try {
      await installUpdate(runtime, update);
    } catch {
      setState({ kind: 'error', action: 'install' });
    }
  };

  const message = state.kind === 'checking' ? '正在检查 GitHub Releases…'
    : state.kind === 'latest' ? '当前已是最新版本。'
      : state.kind === 'unavailable' ? '在线更新仅在 OmniKit 桌面安装包中可用。'
        : state.kind === 'available' ? `发现新版本 v${state.update.version}。`
          : state.kind === 'installing' ? `正在下载并安装 v${state.version}，应用将自动重启。`
            : state.kind === 'error' ? (state.action === 'check' ? '检查更新失败，请确认网络连接后重试。' : '安装更新失败，当前版本仍可继续使用。')
              : '从 GitHub Releases 检查并安装已签名的 Windows 更新包。';
  const releaseNotes = state.kind === 'available' ? state.update.body?.trim() : undefined;
  const tone = state.kind === 'latest' ? 'success' : state.kind === 'error' ? 'error' : 'neutral';

  return <section className={`about-update is-${tone}`} aria-live="polite" aria-busy={isBusy}>
    <div className="about-update-copy"><span className="section-kicker">在线更新</span><strong>{state.kind === 'available' ? `v${state.update.version} 可用` : '保持最新'}</strong><p>{message}</p>{releaseNotes && <small className="update-notes">{releaseNotes}</small>}</div>
    <div className="about-update-actions">
      {state.kind === 'available'
        ? <button type="button" className="primary-button" onClick={installAvailableUpdate}><Download size={16} /> 下载并重启</button>
        : <button type="button" className="secondary-button" disabled={isBusy} onClick={checkUpdates}><RefreshCw className={isBusy ? 'spin' : undefined} size={16} /> {state.kind === 'checking' ? '检查中' : '检查更新'}</button>}
      {state.kind === 'latest' && <CircleCheck className="update-result-icon" size={18} aria-label="已是最新版本" />}
      {state.kind === 'error' && <TriangleAlert className="update-result-icon" size={18} aria-label="更新失败" />}
    </div>
  </section>;
}

export function AboutPanel() {
  return <section className="info-view about-view" aria-labelledby="about-title">
    <header className="info-heading"><span className="section-kicker">OMNIKIT</span><h1 id="about-title">关于</h1><p>为日常处理任务准备的本地工具箱。</p></header>
    <div className="about-layout">
      <article className="about-card">
        <div className="about-card-header"><div className="about-mark"><span className="brand-mark" aria-hidden="true"><span /></span><div><strong>OmniKit</strong><small>桌面端全能工具集合</small></div></div><span className="about-version">v0.1.1</span></div>
        <p className="about-summary">把常用的文本、文件和图片处理任务集中到一个安静的本地工作台中。</p>
        <dl className="about-specs"><div><dt>运行方式</dt><dd>本机处理</dd></div><div><dt>内置工具</dt><dd>5 项</dd></div><div><dt>界面字体</dt><dd>HarmonyOS Sans SC</dd></div><div><dt>输出策略</dt><dd>先预览，再生成副本</dd></div></dl>
        <p className="about-note"><ShieldCheck size={19} /> 文本与文件默认不会上传到网络。</p>
        <UpdatePanel />
      </article>
      <aside className="about-aside" aria-label="使用原则">
        <span className="section-kicker">使用原则</span>
        <ol className="about-principles"><li><span>01</span><div><strong>本地优先</strong><p>处理过程留在当前设备。</p></div></li><li><span>02</span><div><strong>结果可控</strong><p>文件任务先确认，再写入输出。</p></div></li></ol>
      </aside>
    </div>
  </section>;
}
