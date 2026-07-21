import { CircleHelp, Database, Info, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';

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
    <header className="info-heading"><span className="eyebrow"><Sparkles size={15} /> 应用偏好</span><h1 id="settings-title">设置</h1><p>这些偏好只保存在当前设备上。</p></header>
    <div className="settings-grid">
      <article className="settings-panel"><div className="panel-icon"><CircleHelp size={21} /></div><div><h2>界面反馈</h2><p>保留按钮和卡片的轻微过渡效果。</p></div><label className="switch-row"><span>减少动态效果</span><input type="checkbox" checked={reducedMotion} onChange={(event) => onReducedMotionChange(event.target.checked)} /><i aria-hidden="true" /></label></article>
      <article className="settings-panel"><div className="panel-icon"><Database size={21} /></div><div><h2>本机记录</h2><p>最近使用和收藏只存储在此设备的浏览器数据中。</p></div><div className="data-actions"><button type="button" className="secondary-button" disabled={!recentCount} onClick={onClearRecent}><Trash2 size={17} /> 清空最近使用 <small>{recentCount}</small></button><button type="button" className="secondary-button" disabled={!favoriteCount} onClick={onClearFavorites}><Trash2 size={17} /> 清空收藏 <small>{favoriteCount}</small></button></div></article>
    </div>
  </section>;
}

export function AboutPanel() {
  return <section className="info-view" aria-labelledby="about-title">
    <header className="info-heading"><span className="eyebrow"><Info size={15} /> OmniKit</span><h1 id="about-title">关于</h1><p>为日常处理任务准备的本地优先工具箱。</p></header>
    <div className="about-card">
      <div className="about-mark"><span className="brand-mark" aria-hidden="true"><span /></span><div><strong>OmniKit</strong><small>桌面端全能工具集合</small></div></div>
      <dl><div><dt>版本</dt><dd>0.1.0</dd></div><div><dt>运行方式</dt><dd>本机处理</dd></div><div><dt>内置工具</dt><dd>5 项</dd></div></dl>
      <p className="about-note"><ShieldCheck size={19} /> 文本与文件默认不会上传到网络。文件类工具先预览，再生成输出副本。</p>
    </div>
  </section>;
}
