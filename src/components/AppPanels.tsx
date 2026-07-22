import { useEffect, useState } from 'react';
import { Braces, CircleCheck, CircleHelp, Database, Download, Files, Image as ImageIcon, KeyRound, RefreshCw, Save, ShieldCheck, Sparkles, Trash2, TriangleAlert } from 'lucide-react';
import type { Update } from '@tauri-apps/plugin-updater';
import { BrandMark } from './BrandMark';
import { AI_SERVICE_STORAGE_KEY, getNativeErrorMessage, normalizeAiServiceConfig, parseAiServiceConfig, validateAiServiceConfig } from '../lib/aiService';
import { isDesktopRuntime, native, type AiServiceConfig } from '../lib/native';
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
  const desktop = isDesktopRuntime();
  const [aiConfig, setAiConfig] = useState<AiServiceConfig>(() => parseAiServiceConfig(localStorage.getItem(AI_SERVICE_STORAGE_KEY)));
  const [apiKey, setApiKey] = useState('');
  const [keyConfigured, setKeyConfigured] = useState(false);
  const [aiMessage, setAiMessage] = useState('');
  const [aiPending, setAiPending] = useState(false);

  useEffect(() => {
    if (!desktop) return;
    let cancelled = false;
    void native.getAiApiKeyStatus()
      .then((status) => { if (!cancelled) setKeyConfigured(status.configured); })
      .catch(() => { if (!cancelled) setAiMessage('无法读取 AI 密钥状态，请在桌面版中重试。'); });
    return () => { cancelled = true; };
  }, [desktop]);

  const saveAiConfiguration = async () => {
    const validation = validateAiServiceConfig(aiConfig);
    if (validation) { setAiMessage(validation); return; }
    if (!desktop) { setAiMessage('AI 去手写仅可在 OmniKit 桌面客户端中配置。'); return; }
    setAiPending(true);
    setAiMessage('');
    try {
      const normalized = normalizeAiServiceConfig(aiConfig);
      if (apiKey.trim()) {
        await native.saveAiApiKey(apiKey.trim());
        setApiKey('');
        setKeyConfigured(true);
      }
      localStorage.setItem(AI_SERVICE_STORAGE_KEY, JSON.stringify(normalized));
      setAiConfig(normalized);
      setAiMessage(keyConfigured || apiKey.trim() ? 'AI 服务配置已保存在当前设备。' : '地址与模型已保存；请继续填写 API 密钥。');
    } catch (error) {
      setAiMessage(getNativeErrorMessage(error, '保存 AI 配置失败，请重试。'));
    } finally {
      setAiPending(false);
    }
  };

  const deleteAiKey = async () => {
    if (!desktop) return;
    setAiPending(true);
    setAiMessage('');
    try {
      await native.deleteAiApiKey();
      setKeyConfigured(false);
      setApiKey('');
      setAiMessage('已从 Windows 凭据管理器删除 API 密钥。');
    } catch (error) {
      setAiMessage(getNativeErrorMessage(error, '删除 API 密钥失败，请重试。'));
    } finally {
      setAiPending(false);
    }
  };

  return <section className="info-view" aria-labelledby="settings-title">
    <header className="info-heading"><span className="section-kicker">应用偏好</span><h1 id="settings-title">设置</h1><p>偏好保存在当前设备；AI 密钥仅保存在 Windows 凭据管理器。</p></header>
    <div className="settings-grid">
      <article className="settings-panel"><div className="panel-icon"><CircleHelp size={21} /></div><div><h2>界面反馈</h2><p>保留按钮和卡片的轻微过渡效果。</p></div><label className="switch-row"><span>减少动态效果</span><input type="checkbox" checked={reducedMotion} onChange={(event) => onReducedMotionChange(event.target.checked)} /><i aria-hidden="true" /></label></article>
      <article className="settings-panel"><div className="panel-icon"><Database size={21} /></div><div><h2>本机记录</h2><p>最近使用和收藏只存储在此设备的浏览器数据中。</p></div><div className="data-actions"><button type="button" className="secondary-button" disabled={!recentCount} onClick={onClearRecent}><Trash2 size={17} /> 清空最近使用 <small>{recentCount}</small></button><button type="button" className="secondary-button" disabled={!favoriteCount} onClick={onClearFavorites}><Trash2 size={17} /> 清空收藏 <small>{favoriteCount}</small></button></div></article>
      <article className="settings-panel ai-service-panel">
        <div className="panel-icon"><KeyRound size={21} /></div>
        <div><h2>AI 服务</h2><p>仅用于你主动发起的 AI 去手写。支持直连 OpenAI 图像编辑接口，或通过已部署的 Lindon API 代理转发。</p></div>
        <div className="ai-service-form">
          <label><span>连接方式</span><select value={aiConfig.connectionMode} onChange={(event) => setAiConfig((current) => ({ ...current, connectionMode: event.target.value === 'lindon-proxy' ? 'lindon-proxy' : 'direct' }))}><option value="direct">直连图片编辑接口</option><option value="lindon-proxy">Lindon API 代理</option></select></label>
          <label><span>{aiConfig.connectionMode === 'lindon-proxy' ? '代理地址' : '完整 API 地址'}</span><input value={aiConfig.endpoint} onChange={(event) => setAiConfig((current) => ({ ...current, endpoint: event.target.value }))} placeholder={aiConfig.connectionMode === 'lindon-proxy' ? 'https://example.com/api-proxy.php' : 'https://example.com/v1/images/edits'} autoComplete="url" /></label>
          {aiConfig.connectionMode === 'lindon-proxy' && <label><span>上游 API Base URL</span><input value={aiConfig.upstreamBaseUrl} onChange={(event) => setAiConfig((current) => ({ ...current, upstreamBaseUrl: event.target.value }))} placeholder="https://api.example.com/v1" autoComplete="url" /></label>}
          <label><span>模型名</span><input value={aiConfig.model} onChange={(event) => setAiConfig((current) => ({ ...current, model: event.target.value }))} placeholder="你的图像编辑模型" autoComplete="off" /></label>
          <label className="ai-key-field"><span>API 密钥 {keyConfigured && <small>已安全保存</small>}</span><input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={keyConfigured ? '如需更换，请输入新密钥' : '输入后将保存至 Windows 凭据管理器'} autoComplete="new-password" /></label>
          {aiConfig.connectionMode === 'lindon-proxy' && <p className="ai-proxy-hint">代理模式会请求“代理地址 / images / edits”，并通过代理转发到上游 Base URL；上游地址只填写到 <code>/v1</code>，不要填写 <code>/images/edits</code>。</p>}
        </div>
        <div className="data-actions ai-service-actions"><button type="button" className="primary-button" disabled={aiPending} onClick={() => void saveAiConfiguration()}><Save size={16} /> {aiPending ? '保存中' : '保存 AI 配置'}</button><button type="button" className="secondary-button" disabled={aiPending || !keyConfigured} onClick={() => void deleteAiKey()}><Trash2 size={16} /> 删除已保存密钥</button></div>
        {aiMessage && <p className={aiMessage.includes('已') ? 'inline-success' : 'inline-error'}>{aiMessage}</p>}
      </article>
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
        <div className="about-card-header"><div className="about-mark"><BrandMark /><div><strong>OmniKit</strong><small>桌面端全能工具集合</small></div></div><span className="about-version">v0.1.3</span></div>
        <div className="about-intro">
          <div>
            <span className="section-kicker">一站式本地工具箱</span>
            <h2>把高频的小任务，收进一个安静的工作台。</h2>
            <p>OmniKit 为文本、文件、图片和开发任务准备了顺手的本地工具。无需在网页、临时脚本和多个小软件之间来回切换，打开即可开始处理。</p>
          </div>
          <span className="about-spark" aria-hidden="true"><Sparkles size={28} /></span>
        </div>
        <div className="about-capabilities" aria-label="OmniKit 覆盖的工具类型">
          <span><Braces size={17} /> 开发工具</span>
          <span><Files size={17} /> 文件工具</span>
          <span><ImageIcon size={17} /> 图片工具</span>
        </div>
        <p className="about-note"><ShieldCheck size={19} /> 文本与文件默认不会上传到网络。</p>
        <UpdatePanel />
      </article>
      <aside className="about-aside" aria-label="OmniKit 简介">
        <span className="section-kicker">为什么是 OmniKit</span>
        <h2>少一点切换，多一点专注。</h2>
        <p className="about-aside-summary">把日常会反复遇到的处理需求留在一个轻量、清晰的桌面应用中。</p>
        <ol className="about-principles"><li><span>01</span><div><strong>常用工具集中</strong><p>从格式化文本到处理图片，随时打开即可使用。</p></div></li><li><span>02</span><div><strong>本地处理为先</strong><p>内容留在设备中，让隐私和结果都更安心。</p></div></li><li><span>03</span><div><strong>体验保持简单</strong><p>专注完成任务，不用学习复杂的工作流程。</p></div></li></ol>
      </aside>
    </div>
  </section>;
}
