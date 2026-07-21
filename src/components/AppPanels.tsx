import { CircleHelp, Database, ShieldCheck, Trash2 } from 'lucide-react';

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

export function AboutPanel() {
  return <section className="info-view about-view" aria-labelledby="about-title">
    <header className="info-heading"><span className="section-kicker">OMNIKIT</span><h1 id="about-title">关于</h1><p>为日常处理任务准备的本地工具箱。</p></header>
    <div className="about-layout">
      <article className="about-card">
        <div className="about-card-header"><div className="about-mark"><span className="brand-mark" aria-hidden="true"><span /></span><div><strong>OmniKit</strong><small>桌面端全能工具集合</small></div></div><span className="about-version">v0.1.0</span></div>
        <p className="about-summary">把常用的文本、文件和图片处理任务集中到一个安静的本地工作台中。</p>
        <dl className="about-specs"><div><dt>运行方式</dt><dd>本机处理</dd></div><div><dt>内置工具</dt><dd>5 项</dd></div><div><dt>界面字体</dt><dd>HarmonyOS Sans SC</dd></div><div><dt>输出策略</dt><dd>先预览，再生成副本</dd></div></dl>
        <p className="about-note"><ShieldCheck size={19} /> 文本与文件默认不会上传到网络。</p>
      </article>
      <aside className="about-aside" aria-label="使用原则">
        <span className="section-kicker">使用原则</span>
        <ol className="about-principles"><li><span>01</span><div><strong>本地优先</strong><p>处理过程留在当前设备。</p></div></li><li><span>02</span><div><strong>结果可控</strong><p>文件任务先确认，再写入输出。</p></div></li></ol>
      </aside>
    </div>
  </section>;
}
