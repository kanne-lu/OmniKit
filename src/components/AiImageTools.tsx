import { convertFileSrc } from '@tauri-apps/api/core';
import {
  Check,
  FileImage,
  FolderOpen,
  KeyRound,
  LoaderCircle,
  Save,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AI_SERVICE_STORAGE_KEY,
  describeAiServiceDestination,
  getNativeErrorMessage,
  parseAiServiceConfig,
  validateAiServiceConfig,
} from '../lib/aiService';
import { getUpscaleTargetDimensions, type UpscaleFactor } from '../lib/aiImageTools';
import {
  chooseFile,
  chooseFolder,
  isDesktopRuntime,
  native,
  type AiHandwritingPreview,
  type AiImageOperation,
  type AiServiceConfig,
  type ImageResult,
} from '../lib/native';

type AiImageToolVariant = 'background' | 'cutout' | 'restore' | 'upscale';
type MessageTone = 'neutral' | 'success' | 'error';

interface ToolCopy {
  title: string;
  description: string;
  operation: AiImageOperation;
  action: string;
  resultAlt: string;
  note: string;
}

const TOOL_COPY: Record<AiImageToolVariant, ToolCopy> = {
  background: {
    title: '证件照换底色',
    description: 'AI 提取人像一次，背景换色与保存都在本机完成。',
    operation: 'cutout',
    action: '开始提取人像',
    resultAlt: '更换底色后的证件照预览',
    note: 'AI 仅负责人像抠图；白、蓝、红或自定义底色均在本机合成，换色不会重复调用 AI。',
  },
  cutout: {
    title: '智能抠图',
    description: '提取图片主体并生成带真实透明通道的 PNG。',
    operation: 'cutout',
    action: '开始智能抠图',
    resultAlt: '透明背景抠图结果',
    note: '结果必须包含真实透明通道；如果模型只返回白色背景，OmniKit 会拒绝保存。',
  },
  restore: {
    title: '老照片修复',
    description: '保守处理划痕、灰尘、褪色与轻微模糊，保持原貌。',
    operation: 'restore',
    action: '开始修复照片',
    resultAlt: '老照片修复结果',
    note: '默认不强制上色、不美颜、不改变构图；AI 仍可能误改细节，请在保存前仔细对比。',
  },
  upscale: {
    title: '图片放大增强',
    description: '使用 AI 超分辨率生成实际像素更大的 2× 或 4× 图片。',
    operation: 'upscale',
    action: '开始放大增强',
    resultAlt: '图片放大增强结果',
    note: 'OmniKit 会检查返回图片的实际尺寸；只有宽高都大于原图的结果才能保存。',
  },
};

const BACKGROUND_PRESETS = [
  { label: '白色', value: '#FFFFFF' },
  { label: '蓝色', value: '#438EDB' },
  { label: '红色', value: '#D9474D' },
] as const;

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

function AiImageTool({ variant }: { variant: AiImageToolVariant }) {
  const copy = TOOL_COPY[variant];
  const desktop = isDesktopRuntime();
  const [config] = useState<AiServiceConfig>(() => parseAiServiceConfig(localStorage.getItem(AI_SERVICE_STORAGE_KEY)));
  const [keyConfigured, setKeyConfigured] = useState(false);
  const [inputPath, setInputPath] = useState<string | null>(null);
  const [outputDir, setOutputDir] = useState<string | null>(null);
  const [preview, setPreview] = useState<AiHandwritingPreview | null>(null);
  const [savedResult, setSavedResult] = useState<ImageResult | null>(null);
  const [sourceDimensions, setSourceDimensions] = useState<{ width: number; height: number } | null>(null);
  const [upscaleFactor, setUpscaleFactor] = useState<UpscaleFactor>(2);
  const [backgroundColor, setBackgroundColor] = useState('#FFFFFF');
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<MessageTone>('neutral');
  const [pending, setPending] = useState(false);
  const previewPathRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const configError = validateAiServiceConfig(config);
  const sourceUrl = localImageUrl(inputPath, desktop);
  const resultUrl = localImageUrl(preview?.previewPath ?? null, desktop);
  const expectedDimensions = useMemo(() => sourceDimensions
    ? getUpscaleTargetDimensions(sourceDimensions.width, sourceDimensions.height, upscaleFactor)
    : null, [sourceDimensions, upscaleFactor]);

  useEffect(() => {
    mountedRef.current = true;
    if (desktop) {
      void native.getAiApiKeyStatus()
        .then((status) => { if (mountedRef.current) setKeyConfigured(status.configured); })
        .catch(() => {
          if (mountedRef.current) {
            setMessage('无法读取 AI 密钥状态，请前往设置重新保存。');
            setMessageTone('error');
          }
        });
    }
    return () => {
      mountedRef.current = false;
      const path = previewPathRef.current;
      previewPathRef.current = null;
      if (desktop && path) void native.removeAiImagePreview(path).catch(() => undefined);
    };
  }, [desktop]);

  const clearPreview = async () => {
    const path = previewPathRef.current;
    previewPathRef.current = null;
    setPreview(null);
    setSavedResult(null);
    if (desktop && path) {
      try {
        await native.removeAiImagePreview(path);
      } catch {
        // A stale temporary preview does not block selecting or processing another image.
      }
    }
  };

  const selectInput = async () => {
    try {
      const path = await chooseFile([{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]);
      if (!path) return;
      await clearPreview();
      setInputPath(path);
      setSourceDimensions(null);
      setMessage('');
      setMessageTone('neutral');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '无法选择图片。');
      setMessageTone('error');
    }
  };

  const selectOutput = async () => {
    try {
      const path = await chooseFolder();
      if (!path) return;
      setOutputDir(path);
      setSavedResult(null);
      setMessage('');
      setMessageTone('neutral');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '无法选择输出文件夹。');
      setMessageTone('error');
    }
  };

  const selectUpscaleFactor = async (factor: UpscaleFactor) => {
    if (factor === upscaleFactor) return;
    setUpscaleFactor(factor);
    await clearPreview();
    setMessage('放大倍数已更新，请重新开始 AI 处理。');
    setMessageTone('neutral');
  };

  const createPreview = async () => {
    if (!desktop) {
      setMessage(`${copy.title}仅可在 OmniKit 桌面客户端中使用。`);
      setMessageTone('error');
      return;
    }
    if (configError) {
      setMessage('请先前往“设置 > AI 服务”保存完整地址与模型名。');
      setMessageTone('error');
      return;
    }
    if (!keyConfigured) {
      setMessage('请先前往“设置 > AI 服务”保存 API 密钥。');
      setMessageTone('error');
      return;
    }
    if (!inputPath || !outputDir) {
      setMessage('请选择图片和输出文件夹后再开始。');
      setMessageTone('error');
      return;
    }

    setPending(true);
    setMessage('正在将选中的图片发送至你配置的 AI 服务…');
    setMessageTone('neutral');
    await clearPreview();
    try {
      const result = await native.previewAiImageTool({
        inputPath,
        operation: copy.operation,
        upscaleFactor: copy.operation === 'upscale' ? upscaleFactor : null,
        config,
      });
      if (!mountedRef.current) {
        await native.removeAiImagePreview(result.previewPath).catch(() => undefined);
        return;
      }
      previewPathRef.current = result.previewPath;
      setPreview(result);
      setMessage('AI 结果已生成，请先对比预览，再确认保存副本。');
      setMessageTone('success');
    } catch (error) {
      if (mountedRef.current) {
        setMessage(getNativeErrorMessage(error, `${copy.title}失败，请检查配置和网络。`));
        setMessageTone('error');
      }
    } finally {
      if (mountedRef.current) setPending(false);
    }
  };

  const saveResult = async () => {
    if (!preview || !inputPath || !outputDir) return;
    setPending(true);
    setMessage('正在保存结果副本…');
    setMessageTone('neutral');
    try {
      const result = variant === 'background'
        ? await native.saveAiBackgroundResult({
          previewPath: preview.previewPath,
          inputPath,
          outputDir,
          backgroundColor,
        })
        : await native.saveAiImageToolResult({
          previewPath: preview.previewPath,
          inputPath,
          outputDir,
          operation: copy.operation,
        });
      if (!mountedRef.current) return;
      setSavedResult(result);
      setMessage(`${copy.title}结果已保存为新文件，原图未修改。`);
      setMessageTone('success');
    } catch (error) {
      if (mountedRef.current) {
        setMessage(getNativeErrorMessage(error, '保存 AI 结果失败，请重试。'));
        setMessageTone('error');
      }
    } finally {
      if (mountedRef.current) setPending(false);
    }
  };

  const updateBackgroundColor = (value: string) => {
    setBackgroundColor(value.toUpperCase());
    setSavedResult(null);
    if (preview) {
      setMessage('底色已在本地更新，确认预览后可直接保存，不会再次调用 AI。');
      setMessageTone('neutral');
    }
  };

  const resultStageClass = variant === 'cutout' ? 'ai-image-stage is-checkerboard' : 'ai-image-stage';
  const resultStageStyle = variant === 'background' && preview ? { backgroundColor } : undefined;
  const resultDimensions = preview ? `${preview.width} × ${preview.height}` : '等待 AI 结果';

  return <section className="tool-screen image-tool-screen ai-image-tool-screen">
    <div className="tool-breadcrumb">图片工具 <span>/</span> {copy.title}</div>
    <div className="tool-titlebar"><div><h1>{copy.title}</h1><p>{copy.description}</p></div></div>
    {!desktop && <p className="desktop-only-note"><ShieldCheck size={17} /> {copy.title}需要 Windows 桌面版与用户配置的 AI 服务。</p>}
    <div className="image-workbench-grid ai-image-workbench">
      <section className="image-control-panel" aria-label={`${copy.title}设置`}>
        <div className="image-panel-heading">AI 处理设置</div>
        <div className={configError || !keyConfigured ? 'ai-config-note is-warning' : 'ai-config-note is-ready'}>
          <KeyRound size={18} />
          <span>
            <strong>{configError || !keyConfigured ? '尚未完成 AI 配置' : 'AI 服务已配置'}</strong>
            <small>{configError || !keyConfigured ? '请前往“设置 > AI 服务”填写地址、模型和密钥。' : `${describeAiServiceDestination(config)} 服务方可能按次计费。`}</small>
          </span>
        </div>
        <button className="image-select-button is-compact" type="button" disabled={pending} onClick={() => void selectInput()}>
          <FileImage size={22} />
          <span><strong>{basename(inputPath)}</strong><small>JPG、PNG 或 WebP，最大 20 MB</small></span>
        </button>
        <button className="path-field compact-path-field" type="button" disabled={pending} onClick={() => void selectOutput()}>
          <FolderOpen size={20} />
          <span><small>输出文件夹</small><strong>{outputDir ?? '选择保存副本的位置'}</strong></span>
          <span className="path-action">选择</span>
        </button>

        {variant === 'background' && <fieldset className="image-control-group ai-background-control">
          <legend>证件照底色</legend>
          <div className="ai-color-presets">
            {BACKGROUND_PRESETS.map((preset) => <button
              key={preset.value}
              className={backgroundColor === preset.value ? 'is-selected' : ''}
              type="button"
              disabled={pending}
              onClick={() => updateBackgroundColor(preset.value)}
            ><i style={{ backgroundColor: preset.value }} /> {preset.label}</button>)}
            <label className="ai-custom-color"><input type="color" value={backgroundColor} disabled={pending} onChange={(event) => updateBackgroundColor(event.target.value)} /><span>自定义</span></label>
          </div>
          <small className="ai-color-value">当前颜色 {backgroundColor}</small>
        </fieldset>}

        {variant === 'upscale' && <fieldset className="image-control-group">
          <legend>放大倍数</legend>
          <div className="image-direction-choice" role="group" aria-label="放大倍数">
            {([2, 4] as const).map((factor) => <button key={factor} className={upscaleFactor === factor ? 'is-selected' : ''} type="button" disabled={pending} onClick={() => void selectUpscaleFactor(factor)}>{factor}×</button>)}
          </div>
          <p className="ai-dimension-note">{sourceDimensions && expectedDimensions
            ? `原图 ${sourceDimensions.width} × ${sourceDimensions.height}，期望 ${expectedDimensions.width} × ${expectedDimensions.height}`
            : '选择图片后显示期望输出尺寸'}</p>
        </fieldset>}

        <p className="image-notice">{copy.note}</p>
        <div className="image-primary-actions">
          <button className="primary-button" type="button" disabled={pending || !inputPath || !outputDir} onClick={() => void createPreview()}>
            {pending ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />} {pending ? '处理中' : copy.action}
          </button>
          {preview && <button className="secondary-button" type="button" disabled={pending} onClick={() => void saveResult()}><Save size={16} /> {variant === 'background' ? '保存当前底色' : '确认保存副本'}</button>}
        </div>
        {savedResult && <div className="image-result-card"><Check size={19} /><span><strong>结果已保存</strong><small>{savedResult.width} × {savedResult.height} · {formatBytes(savedResult.bytes)}</small><code title={savedResult.outputPath}>{savedResult.outputPath}</code></span></div>}
        {message && <p className={`image-notice${messageTone === 'success' ? ' is-success' : messageTone === 'error' ? ' is-error' : ''}`} aria-live="polite">{message}</p>}
      </section>

      <section className="image-preview-panel ai-comparison-panel" aria-label={`${copy.title}前后预览`}>
        <div className="image-panel-heading"><span>处理前后对比</span><small>{preview ? `AI 结果 ${resultDimensions}` : '同尺寸预览区域'}</small></div>
        <div className="ai-comparison-grid">
          <figure>
            <figcaption><span>原图</span><small>{sourceDimensions ? `${sourceDimensions.width} × ${sourceDimensions.height}` : '等待选择'}</small></figcaption>
            <div className="ai-image-stage">
              {sourceUrl ? <img src={sourceUrl} alt="待处理的原图" onLoad={(event) => setSourceDimensions({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} /> : <div className="image-workbench-empty"><FileImage size={28} /><span>选择图片后显示原图</span></div>}
            </div>
          </figure>
          <figure>
            <figcaption><span>{variant === 'background' ? `效果预览 · ${backgroundColor}` : 'AI 结果'}</span><small>{resultDimensions}</small></figcaption>
            <div className={resultStageClass} style={resultStageStyle}>
              {resultUrl ? <img src={resultUrl} alt={copy.resultAlt} /> : <div className="image-workbench-empty"><Sparkles size={28} /><span>完成 AI 处理后在这里检查结果</span></div>}
            </div>
          </figure>
        </div>
        <p className="image-preview-caption"><ShieldCheck size={15} /> 预览只用于检查；确认保存后会生成副本，原图始终保留。</p>
      </section>
    </div>
  </section>;
}

export function IdPhotoBackgroundTool() {
  return <AiImageTool variant="background" />;
}

export function SmartCutoutTool() {
  return <AiImageTool variant="cutout" />;
}

export function OldPhotoRestorationTool() {
  return <AiImageTool variant="restore" />;
}

export function AiUpscaleTool() {
  return <AiImageTool variant="upscale" />;
}
