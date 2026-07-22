import { convertFileSrc } from '@tauri-apps/api/core';
import { Check, FileImage, FolderOpen, KeyRound, LoaderCircle, Printer, Save, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { AI_SERVICE_STORAGE_KEY, parseAiServiceConfig, validateAiServiceConfig } from '../lib/aiService';
import { buildCopybookCells, COPYBOOK_PRESETS, countText, extractHanCharacters, type CopybookTemplate } from '../lib/education';
import { chooseFile, chooseFolder, isDesktopRuntime, native, type AiHandwritingPreview, type AiServiceConfig, type ImageResult } from '../lib/native';

const TEMPLATE_LABELS: Record<CopybookTemplate, string> = {
  tian: '田字格',
  mi: '米字格',
  line: '横线格',
};

function basename(path: string | null): string {
  return path?.split(/[\\/]/).pop() ?? '未选择';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function localImageUrl(path: string | null, desktop: boolean): string | null {
  return path && desktop ? convertFileSrc(path) : null;
}

export function CopybookTool() {
  const [input, setInput] = useState(COPYBOOK_PRESETS[0].value);
  const [template, setTemplate] = useState<CopybookTemplate>('tian');
  const prepared = useMemo(() => extractHanCharacters(input), [input]);
  const cells = useMemo(() => buildCopybookCells(prepared.characters), [prepared.characters]);

  return <section className="tool-screen education-screen">
    <div className="tool-breadcrumb">教育工具 <span>/</span> 手写字帖生成</div>
    <div className="tool-titlebar"><div><h1>手写字帖生成</h1><p>输入要练习的汉字，生成适合打印的本机字帖。</p></div></div>
    <div className="copybook-layout">
      <section className="copybook-controls" aria-label="字帖设置">
        <label className="copybook-field"><span>练习内容</span><textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="输入汉字，非汉字内容会自动忽略。" /></label>
        <label className="copybook-field"><span>内置练习内容</span><select value="" onChange={(event) => { const preset = COPYBOOK_PRESETS.find((item) => item.id === event.target.value); if (preset) setInput(preset.value); }}><option value="" disabled>选择一组内容</option>{COPYBOOK_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select></label>
        <div className="copybook-template" role="group" aria-label="格纸模板"><span>格纸模板</span><div>{(Object.keys(TEMPLATE_LABELS) as CopybookTemplate[]).map((item) => <button key={item} className={template === item ? 'is-selected' : ''} type="button" onClick={() => setTemplate(item)}>{TEMPLATE_LABELS[item]}</button>)}</div></div>
        <p className="copybook-note">{prepared.characters.length ? `已准备 ${prepared.characters.length} 个汉字` : '请输入至少一个汉字'}{prepared.discarded > 0 ? `，已忽略 ${prepared.discarded} 个非汉字内容` : ''}</p>
      </section>
      <section className="copybook-preview-panel" aria-label="字帖预览">
        <div className="copybook-preview-heading"><span><Sparkles size={17} /> 预览</span><button className="secondary-button" type="button" disabled={!cells.length} onClick={() => window.print()}><Printer size={16} /> 打印字帖</button></div>
        <div className={`copybook-page is-${template}`}>
          {cells.length ? cells.map((character, index) => <div className="copybook-cell" key={`${character}-${index}`}><span>{character}</span></div>) : <div className="copybook-empty">输入汉字后，这里会生成字帖预览。</div>}
        </div>
      </section>
    </div>
  </section>;
}

export function WordCountTool() {
  const [input, setInput] = useState('');
  const statistics = useMemo(() => countText(input), [input]);
  const cards = [
    ['总字数', statistics.totalCharacters, '不计空格与换行'],
    ['汉字', statistics.hanCharacters, '仅统计汉字'],
    ['英文单词', statistics.englishWords, '按英文单词分隔'],
    ['行数', statistics.lines, '空内容为 0 行'],
  ] as const;

  return <section className="tool-screen education-screen">
    <div className="tool-breadcrumb">教育工具 <span>/</span> 字数计算</div>
    <div className="tool-titlebar"><div><h1>字数计算</h1><p>输入或粘贴文本，空格与换行不计入总字数。</p></div><div className="tool-actions"><button className="secondary-button" type="button" disabled={!input} onClick={() => setInput('')}><Trash2 size={16} /> 清空内容</button></div></div>
    <div className="wordcount-layout">
      <label className="wordcount-editor"><span className="pane-heading">输入文本</span><textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="在这里输入或粘贴文字…" /><footer>统计结果会随输入即时更新</footer></label>
      <section className="wordcount-results" aria-label="字数统计结果">{cards.map(([label, value, description]) => <article key={label}><span>{label}</span><strong>{value}</strong><small>{description}</small></article>)}</section>
    </div>
  </section>;
}

export function AiHandwritingRemovalTool() {
  const desktop = isDesktopRuntime();
  const [config] = useState<AiServiceConfig>(() => parseAiServiceConfig(localStorage.getItem(AI_SERVICE_STORAGE_KEY)));
  const [keyConfigured, setKeyConfigured] = useState(false);
  const [inputPath, setInputPath] = useState<string | null>(null);
  const [outputDir, setOutputDir] = useState<string | null>(null);
  const [preview, setPreview] = useState<AiHandwritingPreview | null>(null);
  const [savedResult, setSavedResult] = useState<ImageResult | null>(null);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const configError = validateAiServiceConfig(config);
  const sourceUrl = localImageUrl(inputPath, desktop);
  const resultUrl = localImageUrl(savedResult?.outputPath ?? preview?.previewPath ?? null, desktop);

  useEffect(() => {
    if (!desktop) return;
    let cancelled = false;
    void native.getAiApiKeyStatus().then((status) => { if (!cancelled) setKeyConfigured(status.configured); }).catch(() => { if (!cancelled) setMessage('无法读取 AI 密钥状态，请前往设置重新保存。'); });
    return () => { cancelled = true; };
  }, [desktop]);

  const selectInput = async () => {
    try {
      const path = await chooseFile([{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]);
      if (!path) return;
      setInputPath(path);
      setPreview(null);
      setSavedResult(null);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '无法选择图片。');
    }
  };

  const selectOutput = async () => {
    try {
      const path = await chooseFolder();
      if (!path) return;
      setOutputDir(path);
      setSavedResult(null);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '无法选择输出文件夹。');
    }
  };

  const createPreview = async () => {
    if (!desktop) { setMessage('AI 去手写仅可在 OmniKit 桌面客户端中使用。'); return; }
    if (configError) { setMessage('请先前往“设置 > AI 服务”保存完整地址与模型名。'); return; }
    if (!keyConfigured) { setMessage('请先前往“设置 > AI 服务”保存 API 密钥。'); return; }
    if (!inputPath || !outputDir) { setMessage('请选择图片和输出文件夹后再开始。'); return; }
    setPending(true);
    setMessage('正在将选中的图片发送至你配置的 AI 服务…');
    setPreview(null);
    setSavedResult(null);
    try {
      setPreview(await native.previewAiHandwritingRemoval(inputPath, config));
      setMessage('AI 结果已生成，请先检查前后预览，再决定是否保存。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'AI 去手写失败，请检查配置和网络。');
    } finally {
      setPending(false);
    }
  };

  const saveResult = async () => {
    if (!preview || !inputPath || !outputDir) return;
    setPending(true);
    setMessage('');
    try {
      const result = await native.saveAiHandwritingResult(preview.previewPath, inputPath, outputDir);
      setSavedResult(result);
      setMessage('AI 去手写结果已保存为新文件，原图未修改。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存 AI 结果失败，请重试。');
    } finally {
      setPending(false);
    }
  };

  return <section className="tool-screen education-screen">
    <div className="tool-breadcrumb">教育工具 <span>/</span> AI 去手写</div>
    <div className="tool-titlebar"><div><h1>AI 去手写</h1><p>仅在你点击开始后，将选中的图片发送给你配置的 AI 服务处理。</p></div></div>
    {!desktop && <p className="desktop-only-note"><ShieldCheck size={17} /> AI 去手写需要 Windows 桌面版与用户配置的 AI 服务。</p>}
    <div className="ai-removal-layout">
      <section className="ai-removal-controls" aria-label="AI 去手写设置">
        <div className={configError || !keyConfigured ? 'ai-config-note is-warning' : 'ai-config-note is-ready'}><KeyRound size={18} /><span><strong>{configError || !keyConfigured ? '尚未完成 AI 配置' : 'AI 服务已配置'}</strong><small>{configError || !keyConfigured ? '请前往“设置 > AI 服务”填写完整地址、模型名和密钥。' : `图片会发送至 ${config.endpoint}`}</small></span></div>
        <button className="path-field" type="button" disabled={pending} onClick={() => void selectInput()}><FileImage size={21} /><span><small>输入图片</small><strong>{basename(inputPath)}</strong></span><span className="path-action">选择图片</span></button>
        <button className="path-field" type="button" disabled={pending} onClick={() => void selectOutput()}><FolderOpen size={21} /><span><small>输出文件夹</small><strong>{outputDir ?? '选择保存 AI 结果的位置'}</strong></span><span className="path-action">选择文件夹</span></button>
        <p className="ai-removal-note"><ShieldCheck size={17} /> 支持 JPG、PNG、WebP。AI 可能误改内容，请在保存前检查预览；PDF 暂不支持。</p>
        <button className="primary-button ai-removal-start" type="button" disabled={pending || !inputPath || !outputDir} onClick={() => void createPreview()}>{pending ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />} {pending ? 'AI 处理中' : '开始 AI 去手写'}</button>
        {preview && !savedResult && <button className="secondary-button" type="button" disabled={pending} onClick={() => void saveResult()}><Save size={16} /> 确认并保存结果</button>}
        {savedResult && <div className="success-panel"><Check size={21} /><span><strong>结果已保存</strong><small>{savedResult.outputPath}　·　{formatBytes(savedResult.bytes)}</small></span></div>}
        {message && <p className={message.includes('已') ? 'inline-success' : 'inline-error'}>{message}</p>}
      </section>
      <section className="ai-preview-panel" aria-label="AI 去手写预览">
        <div className="ai-preview-heading"><span>处理前后对比</span><small>{preview ? `${preview.width} × ${preview.height}` : '生成后显示预览'}</small></div>
        <div className="ai-preview-grid">
          <figure><figcaption>原图</figcaption>{sourceUrl ? <img src={sourceUrl} alt="待处理的原图" /> : <div className="image-preview-empty">选择图片后显示原图</div>}</figure>
          <figure><figcaption>AI 结果</figcaption>{resultUrl ? <img src={resultUrl} alt="AI 去手写结果" /> : <div className="image-preview-empty">完成处理后显示 AI 结果</div>}</figure>
        </div>
      </section>
    </div>
  </section>;
}
