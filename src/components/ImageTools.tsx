import { convertFileSrc } from '@tauri-apps/api/core';
import {
  ArrowDown,
  ArrowUp,
  Check,
  CircleStop,
  Crop,
  FileImage,
  FlipHorizontal2,
  FlipVertical2,
  FolderOpen,
  Grid3X3,
  Image as ImageIcon,
  ImagePlus,
  Layers3,
  ListRestart,
  LoaderCircle,
  Move,
  Play,
  RotateCcw,
  RotateCw,
  Scissors,
  ShieldCheck,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import {
  addImageQueueItems,
  clearImageQueue,
  completeImageQueueItem,
  createImageQueue,
  failImageQueueItem,
  MAX_IMAGE_QUEUE_ITEMS,
  removeImageQueueItem,
  requestImageQueueStop,
  startNextImageQueueItem,
} from '../lib/imageQueue';
import {
  chooseFile,
  chooseFiles,
  chooseFolder,
  native,
  type ImageJobResult,
  type ImageOutputFormat,
  type ImagePreviewResult,
  type ImageRotation,
  type ImageWatermarkPosition,
  type NormalizedImageCrop,
} from '../lib/native';

const IMAGE_FILTERS = [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp'] }];
const FORMAT_OPTIONS: { value: ImageOutputFormat; label: string }[] = [
  { value: 'preserve', label: '跟随原格式' },
  { value: 'jpg', label: 'JPG' },
  { value: 'png', label: 'PNG' },
  { value: 'webp', label: 'WebP' },
];

type NoticeTone = 'neutral' | 'success' | 'error';
type Notice = { tone: NoticeTone; text: string } | null;

function basename(path: string | null): string {
  return path?.split(/[\\/]/).pop() ?? '未选择';
}

function normalizedPathKey(path: string): string {
  return path.replaceAll('/', '\\').toLocaleLowerCase();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
}

function previewUrl(path: string | null | undefined): string | null {
  return path ? convertFileSrc(path) : null;
}

function previewFrameStyle(preview: ImagePreviewResult, maxWidth = 720, maxHeight = 500): CSSProperties {
  const ratio = preview.width / preview.height;
  return {
    aspectRatio: `${preview.width} / ${preview.height}`,
    width: Math.max(1, Math.min(maxWidth, maxHeight * ratio)),
    maxWidth: '100%',
  };
}

function releasePreview(path: string): void {
  void native.removeImagePreview(path).catch(() => undefined);
}

function usePreviewCleanup(paths: readonly (string | null | undefined)[]): void {
  const activePaths = useRef(new Set<string>());
  const unmountTimer = useRef<number | null>(null);
  const signature = paths.filter((path): path is string => Boolean(path)).join('\0');

  useEffect(() => {
    const nextPaths = new Set(signature ? signature.split('\0') : []);
    activePaths.current.forEach((path) => {
      if (!nextPaths.has(path)) releasePreview(path);
    });
    activePaths.current = nextPaths;
  }, [signature]);

  useEffect(() => {
    if (unmountTimer.current !== null) window.clearTimeout(unmountTimer.current);
    return () => {
      const pathsToRelease = [...activePaths.current];
      unmountTimer.current = window.setTimeout(() => pathsToRelease.forEach(releasePreview), 0);
    };
  }, []);
}

function outputSaving(result: ImageJobResult): string {
  if (result.inputBytes <= 0) return formatBytes(result.outputBytes);
  const saving = Math.round((1 - result.outputBytes / result.inputBytes) * 100);
  return saving > 0
    ? `${formatBytes(result.outputBytes)}，减少 ${saving}%`
    : `${formatBytes(result.outputBytes)}，体积未减少`;
}

function ImageToolHeading({ title, description }: { title: string; description: string }) {
  return <>
    <div className="tool-breadcrumb">图片工具 <span>/</span> {title}</div>
    <div className="tool-titlebar"><div><h1>{title}</h1><p>{description}</p></div></div>
    <p className="image-local-note"><ShieldCheck size={16} /> 全程在本机处理并另存为新文件；输出为重新编码的静态图片，不保留原始元数据或动画。</p>
  </>;
}

function NoticeLine({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return <p className={`image-notice is-${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>{notice.text}</p>;
}

function OutputFolderButton({ path, disabled, onSelect }: { path: string | null; disabled?: boolean; onSelect: () => void }) {
  return <button className="path-field compact-path-field" type="button" disabled={disabled} onClick={onSelect}>
    <FolderOpen size={20} />
    <span><small>输出文件夹</small><strong>{path ?? '选择保存新文件的位置'}</strong></span>
    <span className="path-action">选择</span>
  </button>;
}

function FormatFields({
  format,
  quality,
  disabled,
  onFormatChange,
  onQualityChange,
}: {
  format: ImageOutputFormat;
  quality: number;
  disabled?: boolean;
  onFormatChange: (format: ImageOutputFormat) => void;
  onQualityChange: (quality: number) => void;
}) {
  return <div className="image-field-pair">
    <label className="image-field"><span>输出格式</span><select disabled={disabled} value={format} onChange={(event) => onFormatChange(event.target.value as ImageOutputFormat)}>{FORMAT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
    <label className={`image-field ${format !== 'jpg' ? 'is-disabled' : ''}`}><span>JPG 质量 <b>{quality}</b></span><input aria-label="JPG 质量" disabled={disabled || format !== 'jpg'} type="range" min="40" max="100" value={quality} onChange={(event) => onQualityChange(Number(event.target.value))} /></label>
  </div>;
}

function ResultCard({ result, title = '结果已保存' }: { result: ImageJobResult; title?: string }) {
  return <div className="image-result-card"><Check size={20} /><span><strong>{title}</strong><small>{result.width} × {result.height}　·　{outputSaving(result)}</small><code>{result.outputPath}</code></span></div>;
}

function PreviewEmpty({ children }: { children: string }) {
  return <div className="image-workbench-empty"><ImageIcon size={30} /><span>{children}</span></div>;
}

export function BatchImageTool() {
  const [queue, setQueue] = useState(() => createImageQueue([]));
  const [outputDir, setOutputDir] = useState<string | null>(null);
  const [format, setFormat] = useState<ImageOutputFormat>('preserve');
  const [resizeEnabled, setResizeEnabled] = useState(true);
  const [maxDimension, setMaxDimension] = useState(1920);
  const [quality, setQuality] = useState(82);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const stopRequested = useRef(false);

  const counts = useMemo(() => ({
    success: queue.items.filter((item) => item.status === 'success').length,
    error: queue.items.filter((item) => item.status === 'error').length,
    waiting: queue.items.filter((item) => item.status === 'pending').length,
  }), [queue.items]);

  const addFiles = async () => {
    try {
      const paths = await chooseFiles(IMAGE_FILTERS);
      if (!paths.length) return;
      const nextQueue = addImageQueueItems(queue, paths);
      const added = nextQueue.items.length - queue.items.length;
      setQueue(nextQueue);
      if (paths.length > added) setNotice({ tone: 'neutral', text: `已忽略重复文件或超出上限的图片；单批最多处理 ${MAX_IMAGE_QUEUE_ITEMS} 张。` });
      else setNotice(null);
    } catch (error) {
      setNotice({ tone: 'error', text: getErrorMessage(error, '无法选择图片。') });
    }
  };

  const selectOutput = async () => {
    try {
      const path = await chooseFolder();
      if (path) { setOutputDir(path); setNotice(null); }
    } catch (error) {
      setNotice({ tone: 'error', text: getErrorMessage(error, '无法选择输出文件夹。') });
    }
  };

  const startBatch = async () => {
    if (!outputDir || !queue.items.length || pending) return;
    stopRequested.current = false;
    setPending(true);
    setNotice({ tone: 'neutral', text: '正在串行处理图片；当前文件完成后才会开始下一张。' });

    let working = createImageQueue(queue.items.map((item) => item.inputPath));
    setQueue(working);

    while (true) {
      if (stopRequested.current) {
        working = requestImageQueueStop(working);
        setQueue(working);
        break;
      }

      const next = startNextImageQueueItem(working);
      working = next.state;
      setQueue(working);
      if (!next.item) break;

      try {
        const result = await native.processImage({
          inputPath: next.item.inputPath,
          outputDir,
          format,
          maxDimension: resizeEnabled ? maxDimension : null,
          jpegQuality: quality,
        });
        working = completeImageQueueItem(working, next.item.id, result);
      } catch (error) {
        working = failImageQueueItem(working, next.item.id, getErrorMessage(error, '处理失败。'));
      }
      setQueue(working);
    }

    setPending(false);
    const success = working.items.filter((item) => item.status === 'success').length;
    const failed = working.items.filter((item) => item.status === 'error').length;
    setNotice(stopRequested.current
      ? { tone: 'neutral', text: `已停止后续任务，已完成 ${success} 张${failed ? `，失败 ${failed} 张` : ''}。` }
      : failed
        ? { tone: 'error', text: `批量任务结束：成功 ${success} 张，失败 ${failed} 张。已成功的文件不会被撤销。` }
        : { tone: 'success', text: `已完成 ${success} 张图片，所有结果均保存为新文件。` });
  };

  const requestStop = () => {
    stopRequested.current = true;
    setQueue((current) => requestImageQueueStop(current));
    setNotice({ tone: 'neutral', text: '停止请求已记录；当前图片完成后不会再开始新任务。' });
  };

  return <section className="tool-screen image-tool-screen">
    <ImageToolHeading title="批量图片处理" description="统一压缩、缩放或转换多张 JPG、PNG 与 WebP 图片。" />
    <div className="image-workbench-grid batch-image-workbench">
      <section className="image-control-panel" aria-label="批量处理设置">
        <div className="image-panel-heading"><span>处理设置</span><small>最多 {MAX_IMAGE_QUEUE_ITEMS} 张</small></div>
        <button className="image-select-button" type="button" disabled={pending || queue.items.length >= MAX_IMAGE_QUEUE_ITEMS} onClick={() => void addFiles()}><ImagePlus size={22} /><span><strong>添加图片</strong><small>可一次选择多张，重复文件会被忽略</small></span></button>
        <OutputFolderButton path={outputDir} disabled={pending} onSelect={() => void selectOutput()} />
        <FormatFields format={format} quality={quality} disabled={pending} onFormatChange={(value) => { setFormat(value); setNotice(null); }} onQualityChange={(value) => { setQuality(value); setNotice(null); }} />
        <label className="image-check-row"><input checked={resizeEnabled} disabled={pending} type="checkbox" onChange={(event) => { setResizeEnabled(event.target.checked); setNotice(null); }} /><span><strong>限制最长边</strong><small>只缩小超出尺寸的图片，不放大小图</small></span></label>
        <label className={`image-field ${!resizeEnabled ? 'is-disabled' : ''}`}><span>最长边 <b>{maxDimension}px</b></span><input disabled={pending || !resizeEnabled} type="range" min="640" max="3840" step="160" value={maxDimension} onChange={(event) => { setMaxDimension(Number(event.target.value)); setNotice(null); }} /></label>
        <div className="image-primary-actions">
          <button className="primary-button" type="button" disabled={pending || !outputDir || !queue.items.length} onClick={() => void startBatch()}>{pending ? <LoaderCircle className="spin" size={17} /> : <Play size={17} />} {pending ? '处理中' : '开始批量处理'}</button>
          {pending && <button className="secondary-button" type="button" onClick={requestStop}><CircleStop size={16} /> 停止后续任务</button>}
        </div>
        <NoticeLine notice={notice} />
      </section>

      <section className="image-queue-panel" aria-label="待处理图片">
        <div className="image-panel-heading"><span>文件队列</span><div><small>{queue.items.length}/{MAX_IMAGE_QUEUE_ITEMS} 张</small><button type="button" disabled={pending || !queue.items.length} onClick={() => { setQueue((current) => clearImageQueue(current)); setNotice(null); }}><Trash2 size={15} /> 清空</button></div></div>
        {queue.items.length === 0
          ? <PreviewEmpty>添加图片后，这里会显示逐项处理状态。</PreviewEmpty>
          : <div className="image-queue-list">{queue.items.map((item, index) => <article className={`image-queue-row is-${item.status}${item.status === 'pending' && queue.stopRequested ? ' is-stopped' : ''}`} key={item.id}>
            <span className="queue-index">{String(index + 1).padStart(2, '0')}</span>
            <div className="queue-copy"><strong title={item.inputPath}>{item.fileName}</strong><small>{item.status === 'pending' && (queue.stopRequested ? '已停止，未开始处理' : '等待处理')}{item.status === 'processing' && '正在处理，请稍候…'}{item.status === 'success' && item.result && `${item.result.width} × ${item.result.height}　·　${outputSaving(item.result)}`}{item.status === 'error' && (item.error || '处理失败')}</small></div>
            <span className="queue-state">{item.status === 'processing' ? <LoaderCircle className="spin" size={17} /> : item.status === 'success' ? <Check size={17} /> : item.status === 'error' ? <X size={17} /> : null}</span>
            <button className="queue-remove" aria-label={`移除 ${item.fileName}`} type="button" disabled={pending} onClick={() => setQueue((current) => removeImageQueueItem(current, item.id))}><X size={15} /></button>
          </article>)}</div>}
        {queue.items.length > 0 && <footer className="image-queue-summary"><span>等待 {counts.waiting}</span><span className="is-success">成功 {counts.success}</span><span className="is-error">失败 {counts.error}</span></footer>}
      </section>
    </div>
  </section>;
}

type CropRatio = 'free' | '1:1' | '4:3' | '3:4' | '16:9' | '9:16';
type NormalizedPoint = { x: number; y: number };

const CROP_RATIOS: { value: CropRatio; label: string; ratio: number | null }[] = [
  { value: 'free', label: '自由', ratio: null },
  { value: '1:1', label: '1:1', ratio: 1 },
  { value: '4:3', label: '4:3', ratio: 4 / 3 },
  { value: '3:4', label: '3:4', ratio: 3 / 4 },
  { value: '16:9', label: '16:9', ratio: 16 / 9 },
  { value: '9:16', label: '9:16', ratio: 9 / 16 },
];

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function pointFromPointer(event: ReactPointerEvent<HTMLElement>): NormalizedPoint {
  const bounds = event.currentTarget.getBoundingClientRect();
  return {
    x: clamp((event.clientX - bounds.left) / bounds.width),
    y: clamp((event.clientY - bounds.top) / bounds.height),
  };
}

function centeredCrop(preview: ImagePreviewResult, ratio: number | null): NormalizedImageCrop {
  if (!ratio) return { x: 0.08, y: 0.08, width: 0.84, height: 0.84 };
  const sourceRatio = preview.width / preview.height;
  let width = 0.82;
  let height = width * sourceRatio / ratio;
  if (height > 0.82) {
    height = 0.82;
    width = height * ratio / sourceRatio;
  }
  return { x: (1 - width) / 2, y: (1 - height) / 2, width, height };
}

function cropFromDrag(start: NormalizedPoint, end: NormalizedPoint, ratio: number | null, preview: ImagePreviewResult): NormalizedImageCrop {
  const directionX = end.x >= start.x ? 1 : -1;
  const directionY = end.y >= start.y ? 1 : -1;
  let width = Math.abs(end.x - start.x);
  let height = Math.abs(end.y - start.y);

  if (ratio && width > 0 && height > 0) {
    const pixelWidth = width * preview.width;
    const pixelHeight = height * preview.height;
    if (pixelWidth / pixelHeight > ratio) width = (pixelHeight * ratio) / preview.width;
    else height = (pixelWidth / ratio) / preview.height;
  }

  return {
    x: clamp(directionX > 0 ? start.x : start.x - width),
    y: clamp(directionY > 0 ? start.y : start.y - height),
    width: Math.min(width, directionX > 0 ? 1 - start.x : start.x),
    height: Math.min(height, directionY > 0 ? 1 - start.y : start.y),
  };
}

export function ImageCropTool() {
  const [inputPath, setInputPath] = useState<string | null>(null);
  const [outputDir, setOutputDir] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImagePreviewResult | null>(null);
  const [ratio, setRatio] = useState<CropRatio>('free');
  const [crop, setCrop] = useState<NormalizedImageCrop>({ x: 0, y: 0, width: 1, height: 1 });
  const [rotation, setRotation] = useState<ImageRotation>(0);
  const [flipHorizontal, setFlipHorizontal] = useState(false);
  const [flipVertical, setFlipVertical] = useState(false);
  const [format, setFormat] = useState<ImageOutputFormat>('preserve');
  const [quality, setQuality] = useState(88);
  const [busy, setBusy] = useState<'preview' | 'export' | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [result, setResult] = useState<ImageJobResult | null>(null);
  const dragStart = useRef<NormalizedPoint | null>(null);
  const cropBeforeDrag = useRef<NormalizedImageCrop>(crop);
  usePreviewCleanup([preview?.previewPath]);

  const ratioValue = CROP_RATIOS.find((item) => item.value === ratio)?.ratio ?? null;
  const cropWidth = preview ? Math.max(1, Math.round(preview.width * crop.width)) : 0;
  const cropHeight = preview ? Math.max(1, Math.round(preview.height * crop.height)) : 0;
  const outputWidth = rotation === 90 || rotation === 270 ? cropHeight : cropWidth;
  const outputHeight = rotation === 90 || rotation === 270 ? cropWidth : cropHeight;

  const selectInput = async () => {
    try {
      const path = await chooseFile(IMAGE_FILTERS);
      if (!path) return;
      setBusy('preview');
      setNotice({ tone: 'neutral', text: '正在生成轻量预览…' });
      const nextPreview = await native.prepareImagePreview({ inputPath: path });
      setInputPath(path);
      setPreview(nextPreview);
      setCrop({ x: 0, y: 0, width: 1, height: 1 });
      setRatio('free');
      setRotation(0);
      setFlipHorizontal(false);
      setFlipVertical(false);
      setResult(null);
      setNotice(null);
    } catch (error) {
      setNotice({ tone: 'error', text: getErrorMessage(error, '无法读取这张图片。') });
    } finally {
      setBusy(null);
    }
  };

  const selectOutput = async () => {
    try {
      const path = await chooseFolder();
      if (path) { setOutputDir(path); setResult(null); setNotice(null); }
    } catch (error) {
      setNotice({ tone: 'error', text: getErrorMessage(error, '无法选择输出文件夹。') });
    }
  };

  const invalidateResult = () => {
    setResult(null);
    setNotice(null);
  };

  const chooseRatio = (nextRatio: CropRatio) => {
    setRatio(nextRatio);
    if (!preview) return;
    const value = CROP_RATIOS.find((item) => item.value === nextRatio)?.ratio ?? null;
    setCrop(centeredCrop(preview, value));
    invalidateResult();
  };

  const beginCrop = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!preview || busy) return;
    cropBeforeDrag.current = crop;
    dragStart.current = pointFromPointer(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    setCrop({ x: dragStart.current.x, y: dragStart.current.y, width: 0, height: 0 });
    invalidateResult();
  };

  const updateCrop = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!preview || !dragStart.current) return;
    setCrop(cropFromDrag(dragStart.current, pointFromPointer(event), ratioValue, preview));
  };

  const finishCrop = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    dragStart.current = null;
    if (crop.width < 0.01 || crop.height < 0.01) setCrop(cropBeforeDrag.current);
  };

  const resetTransform = () => {
    setRatio('free');
    setCrop({ x: 0, y: 0, width: 1, height: 1 });
    setRotation(0);
    setFlipHorizontal(false);
    setFlipVertical(false);
    invalidateResult();
  };

  const exportImage = async () => {
    if (!inputPath || !outputDir || !preview || crop.width <= 0 || crop.height <= 0) return;
    setBusy('export');
    setResult(null);
    setNotice({ tone: 'neutral', text: '正在从原图裁剪并导出新文件…' });
    try {
      const nextResult = await native.transformImage({
        inputPath,
        outputDir,
        crop,
        rotation,
        flipHorizontal,
        flipVertical,
        format,
        jpegQuality: quality,
      });
      setResult(nextResult);
      setNotice({ tone: 'success', text: '裁剪与方向变换已完成，原图未修改。' });
    } catch (error) {
      setNotice({ tone: 'error', text: getErrorMessage(error, '图片导出失败。') });
    } finally {
      setBusy(null);
    }
  };

  const sourceUrl = previewUrl(preview?.previewPath);
  return <section className="tool-screen image-tool-screen">
    <ImageToolHeading title="裁剪与旋转" description="框选保留区域，修正图片方向，再将结果另存为新文件。" />
    <div className="image-workbench-grid">
      <section className="image-control-panel" aria-label="裁剪与旋转设置">
        <div className="image-panel-heading"><span>编辑设置</span><small>{preview ? `${preview.width} × ${preview.height}` : '单张图片'}</small></div>
        <button className="image-select-button" type="button" disabled={busy !== null} onClick={() => void selectInput()}>{busy === 'preview' ? <LoaderCircle className="spin" size={22} /> : <FileImage size={22} />}<span><strong>{basename(inputPath)}</strong><small>{inputPath ? `${formatBytes(preview?.inputBytes ?? 0)}，点击更换图片` : '选择 JPG、PNG 或 WebP 图片'}</small></span></button>
        <OutputFolderButton path={outputDir} disabled={busy !== null} onSelect={() => void selectOutput()} />

        <fieldset className="image-control-group" disabled={!preview || busy !== null}><legend>裁剪比例</legend><div className="image-choice-grid crop-ratio-grid">{CROP_RATIOS.map((item) => <button className={ratio === item.value ? 'is-selected' : ''} type="button" key={item.value} onClick={() => chooseRatio(item.value)}>{item.label}</button>)}</div></fieldset>
        <fieldset className="image-control-group" disabled={!preview || busy !== null}><legend>方向 <span className="orientation-state">当前 {rotation === 0 ? '未旋转' : `旋转 ${rotation}°`}</span></legend><div className="image-icon-actions">
          <button type="button" onClick={() => { setRotation(((rotation + 270) % 360) as ImageRotation); invalidateResult(); }}><RotateCcw size={17} /> 向左 90°</button>
          <button type="button" onClick={() => { setRotation(((rotation + 90) % 360) as ImageRotation); invalidateResult(); }}><RotateCw size={17} /> 向右 90°</button>
          <button aria-pressed={flipHorizontal} className={flipHorizontal ? 'is-selected' : ''} type="button" onClick={() => { setFlipHorizontal((value) => !value); invalidateResult(); }}><FlipHorizontal2 size={17} /> 水平翻转</button>
          <button aria-pressed={flipVertical} className={flipVertical ? 'is-selected' : ''} type="button" onClick={() => { setFlipVertical((value) => !value); invalidateResult(); }}><FlipVertical2 size={17} /> 垂直翻转</button>
        </div></fieldset>
        <div className="crop-dimensions"><span><small>框选区域</small><strong>{preview ? `${cropWidth} × ${cropHeight}` : '—'}</strong></span><span><small>预计输出</small><strong>{preview ? `${outputWidth} × ${outputHeight}` : '—'}</strong></span></div>
        <FormatFields format={format} quality={quality} disabled={busy !== null} onFormatChange={(value) => { setFormat(value); invalidateResult(); }} onQualityChange={(value) => { setQuality(value); invalidateResult(); }} />
        <div className="image-primary-actions"><button className="primary-button" type="button" disabled={!preview || !inputPath || !outputDir || busy !== null || crop.width < 0.01 || crop.height < 0.01} onClick={() => void exportImage()}>{busy === 'export' ? <LoaderCircle className="spin" size={17} /> : <Crop size={17} />} {busy === 'export' ? '正在导出' : '导出裁剪结果'}</button><button className="secondary-button" type="button" disabled={!preview || busy !== null} onClick={resetTransform}><ListRestart size={16} /> 重置</button></div>
        <NoticeLine notice={notice} />
        {result && <ResultCard result={result} />}
      </section>

      <section className="image-preview-panel" aria-label="裁剪预览">
        <div className="image-panel-heading"><span>框选预览</span><small>{preview ? '拖动框选保留区域' : '等待选择图片'}</small></div>
        <div className="image-preview-stage crop-preview-stage">
          {sourceUrl && preview
            ? <div
              className="image-crop-media"
              style={previewFrameStyle(preview)}
              onPointerDown={beginCrop}
              onPointerMove={updateCrop}
              onPointerUp={finishCrop}
              onPointerCancel={finishCrop}
            >
              <img draggable={false} src={sourceUrl} alt="待裁剪图片" />
              <span className="crop-selection" style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.width * 100}%`, height: `${crop.height * 100}%` }}><i /><i /><i /><i /></span>
            </div>
            : <PreviewEmpty>选择图片后，可直接在这里拖动框选。</PreviewEmpty>}
        </div>
        <footer className="image-preview-caption"><Move size={15} /><span>框选坐标以原图为准；旋转与翻转会在导出时应用。</span></footer>
      </section>
    </div>
  </section>;
}

const WATERMARK_POSITIONS: { value: ImageWatermarkPosition; label: string }[] = [
  { value: 'topLeft', label: '左上' },
  { value: 'topCenter', label: '上方居中' },
  { value: 'topRight', label: '右上' },
  { value: 'centerLeft', label: '左侧居中' },
  { value: 'center', label: '正中' },
  { value: 'centerRight', label: '右侧居中' },
  { value: 'bottomLeft', label: '左下' },
  { value: 'bottomCenter', label: '下方居中' },
  { value: 'bottomRight', label: '右下' },
];

function WatermarkVisual({
  kind,
  text,
  imageUrl,
  tiled,
}: {
  kind: 'text' | 'image';
  text: string;
  imageUrl: string | null;
  tiled: boolean;
}) {
  const content = kind === 'text'
    ? <span className="watermark-text">{text.trim() || '水印文字'}</span>
    : imageUrl
      ? <img className="watermark-image" src={imageUrl} alt="水印图" />
      : <span className="watermark-placeholder"><ImageIcon size={18} /> 水印图</span>;

  if (!tiled) return <div className={`watermark-single is-${kind}`}>{content}</div>;
  return <div className={`watermark-tile-grid is-${kind}`}>{Array.from({ length: 400 }, (_, index) => <div key={index}>{kind === 'text' ? <span className="watermark-text">{text.trim() || '水印文字'}</span> : imageUrl ? <img className="watermark-image" src={imageUrl} alt="" /> : <span className="watermark-placeholder">水印图</span>}</div>)}</div>;
}

export function ImageWatermarkTool() {
  const [inputPath, setInputPath] = useState<string | null>(null);
  const [outputDir, setOutputDir] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImagePreviewResult | null>(null);
  const [kind, setKind] = useState<'text' | 'image'>('text');
  const [text, setText] = useState('OmniKit · 本地创作');
  const [watermarkPath, setWatermarkPath] = useState<string | null>(null);
  const [watermarkPreview, setWatermarkPreview] = useState<ImagePreviewResult | null>(null);
  const [position, setPosition] = useState<ImageWatermarkPosition>('bottomRight');
  const [opacity, setOpacity] = useState(0.42);
  const [size, setSize] = useState(0.22);
  const [margin, setMargin] = useState(24);
  const [tiled, setTiled] = useState(false);
  const [format, setFormat] = useState<ImageOutputFormat>('preserve');
  const [quality, setQuality] = useState(88);
  const [busy, setBusy] = useState<'source' | 'watermark' | 'export' | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [result, setResult] = useState<ImageJobResult | null>(null);
  usePreviewCleanup([preview?.previewPath, watermarkPreview?.previewPath]);

  const selectSource = async () => {
    try {
      const path = await chooseFile(IMAGE_FILTERS);
      if (!path) return;
      setBusy('source');
      setNotice({ tone: 'neutral', text: '正在生成轻量预览…' });
      const nextPreview = await native.prepareImagePreview({ inputPath: path });
      setInputPath(path);
      setPreview(nextPreview);
      setResult(null);
      setNotice(null);
    } catch (error) {
      setNotice({ tone: 'error', text: getErrorMessage(error, '无法读取底图。') });
    } finally {
      setBusy(null);
    }
  };

  const selectWatermark = async () => {
    try {
      const path = await chooseFile(IMAGE_FILTERS);
      if (!path) return;
      setBusy('watermark');
      const nextPreview = await native.prepareImagePreview({ inputPath: path });
      setWatermarkPath(path);
      setWatermarkPreview(nextPreview);
      setResult(null);
      setNotice(null);
    } catch (error) {
      setNotice({ tone: 'error', text: getErrorMessage(error, '无法读取水印图片。') });
    } finally {
      setBusy(null);
    }
  };

  const selectOutput = async () => {
    try {
      const path = await chooseFolder();
      if (path) { setOutputDir(path); setResult(null); setNotice(null); }
    } catch (error) {
      setNotice({ tone: 'error', text: getErrorMessage(error, '无法选择输出文件夹。') });
    }
  };

  const invalidateWatermarkResult = () => {
    setResult(null);
    setNotice(null);
  };

  const exportImage = async () => {
    if (!inputPath || !outputDir || !preview || (kind === 'text' ? !text.trim() : !watermarkPath)) return;
    setBusy('export');
    setResult(null);
    setNotice({ tone: 'neutral', text: '正在从原图生成带水印的新文件…' });
    try {
      const nextResult = await native.watermarkImage({
        inputPath,
        outputDir,
        kind,
        text: kind === 'text' ? text.trim() : null,
        watermarkPath: kind === 'image' ? watermarkPath : null,
        opacity,
        size,
        margin,
        position,
        tiled,
        format,
        jpegQuality: quality,
      });
      setResult(nextResult);
      setNotice({ tone: 'success', text: '水印图片已保存，原图未修改。' });
    } catch (error) {
      setNotice({ tone: 'error', text: getErrorMessage(error, '水印导出失败。') });
    } finally {
      setBusy(null);
    }
  };

  const baseUrl = previewUrl(preview?.previewPath);
  const markUrl = previewUrl(watermarkPreview?.previewPath);
  const previewStyle = {
    '--watermark-opacity': String(opacity),
    '--watermark-size': `${size * 100}%`,
    '--watermark-font-size': `${size * 22}cqw`,
    '--watermark-margin': `${preview ? margin / Math.max(1, preview.width) * 100 : 0}cqw`,
    '--watermark-gap': `${preview ? margin / Math.max(1, preview.width) * 100 : 0}cqw`,
  } as CSSProperties;
  const canExport = Boolean(preview && inputPath && outputDir && (kind === 'text' ? text.trim() : watermarkPath));

  return <section className="tool-screen image-tool-screen">
    <ImageToolHeading title="图片加水印" description="添加文字或图片水印，先确认位置与覆盖效果，再导出副本。" />
    <div className="image-workbench-grid watermark-workbench">
      <section className="image-control-panel" aria-label="水印设置">
        <div className="image-panel-heading"><span>水印设置</span><small>单层水印</small></div>
        <button className="image-select-button" type="button" disabled={busy !== null} onClick={() => void selectSource()}>{busy === 'source' ? <LoaderCircle className="spin" size={22} /> : <FileImage size={22} />}<span><strong>{basename(inputPath)}</strong><small>{inputPath ? `${preview?.width ?? 0} × ${preview?.height ?? 0}，点击更换底图` : '先选择一张底图'}</small></span></button>
        <OutputFolderButton path={outputDir} disabled={busy !== null} onSelect={() => void selectOutput()} />

        <div className="image-tab-control" role="tablist" aria-label="水印类型"><button className={kind === 'text' ? 'is-selected' : ''} role="tab" aria-selected={kind === 'text'} type="button" disabled={busy !== null} onClick={() => { setKind('text'); invalidateWatermarkResult(); }}><Type size={16} /> 文字水印</button><button className={kind === 'image' ? 'is-selected' : ''} role="tab" aria-selected={kind === 'image'} type="button" disabled={busy !== null} onClick={() => { setKind('image'); invalidateWatermarkResult(); }}><ImageIcon size={16} /> 图片水印</button></div>
        {kind === 'text'
          ? <label className="image-field"><span>水印文字</span><input disabled={busy !== null} maxLength={80} value={text} onChange={(event) => { setText(event.target.value); invalidateWatermarkResult(); }} placeholder="输入要显示的文字" /></label>
          : <button className="image-select-button is-compact" type="button" disabled={busy !== null} onClick={() => void selectWatermark()}>{busy === 'watermark' ? <LoaderCircle className="spin" size={19} /> : <ImagePlus size={19} />}<span><strong>{basename(watermarkPath)}</strong><small>建议使用带透明背景的 PNG</small></span></button>}

        <fieldset className="image-control-group" disabled={busy !== null || tiled}><legend><Grid3X3 size={15} /> 九宫格位置</legend><div className="watermark-position-grid">{WATERMARK_POSITIONS.map((item) => <button aria-label={item.label} title={item.label} className={position === item.value ? 'is-selected' : ''} type="button" key={item.value} onClick={() => { setPosition(item.value); invalidateWatermarkResult(); }}><span /></button>)}</div></fieldset>
        <div className="image-range-stack">
          <label className="image-field"><span>透明度 <b>{Math.round(opacity * 100)}%</b></span><input disabled={busy !== null} type="range" min="0.1" max="1" step="0.05" value={opacity} onChange={(event) => { setOpacity(Number(event.target.value)); invalidateWatermarkResult(); }} /></label>
          <label className="image-field"><span>大小 <b>{Math.round(size * 100)}%</b></span><input disabled={busy !== null} type="range" min="0.05" max="0.5" step="0.01" value={size} onChange={(event) => { setSize(Number(event.target.value)); invalidateWatermarkResult(); }} /></label>
          <label className="image-field"><span>{tiled ? '平铺间距' : '边距'} <b>{margin}px</b></span><input disabled={busy !== null} type="range" min="0" max="100" step="2" value={margin} onChange={(event) => { setMargin(Number(event.target.value)); invalidateWatermarkResult(); }} /></label>
        </div>
        <label className="image-check-row"><input checked={tiled} disabled={busy !== null} type="checkbox" onChange={(event) => { setTiled(event.target.checked); invalidateWatermarkResult(); }} /><span><strong>平铺覆盖</strong><small>均匀重复水印，九宫格位置暂不生效</small></span></label>
        <FormatFields format={format} quality={quality} disabled={busy !== null} onFormatChange={(value) => { setFormat(value); invalidateWatermarkResult(); }} onQualityChange={(value) => { setQuality(value); invalidateWatermarkResult(); }} />
        <div className="image-primary-actions"><button className="primary-button" type="button" disabled={!canExport || busy !== null} onClick={() => void exportImage()}>{busy === 'export' ? <LoaderCircle className="spin" size={17} /> : <Layers3 size={17} />} {busy === 'export' ? '正在导出' : '导出水印图片'}</button></div>
        <NoticeLine notice={notice} />
        {result && <ResultCard result={result} />}
      </section>

      <section className="image-preview-panel" aria-label="水印预览">
        <div className="image-panel-heading"><span>效果预览</span><small>{preview ? `${preview.width} × ${preview.height}` : '等待选择底图'}</small></div>
        <div className="image-preview-stage watermark-preview-stage">
          {baseUrl && preview
            ? <div className={`watermark-preview-media is-${position} ${tiled ? 'is-tiled' : ''}`} style={{ ...previewStyle, ...previewFrameStyle(preview, 760) }}><img className="watermark-base-image" src={baseUrl} alt="水印底图" /><WatermarkVisual kind={kind} text={text} imageUrl={markUrl} tiled={tiled} /></div>
            : <PreviewEmpty>选择底图后，这里会显示水印的近似效果。</PreviewEmpty>}
        </div>
        <footer className="image-preview-caption"><ShieldCheck size={15} /><span>预览用于确认布局；导出时会按原图尺寸精确计算。</span></footer>
      </section>
    </div>
  </section>;
}

type StitchPreviewItem = { inputPath: string; preview: ImagePreviewResult };

export function ImageStitchTool() {
  const [mode, setMode] = useState<'stitch' | 'split'>('stitch');
  const [stitchItems, setStitchItems] = useState<StitchPreviewItem[]>([]);
  const [direction, setDirection] = useState<'vertical' | 'horizontal'>('vertical');
  const [splitPath, setSplitPath] = useState<string | null>(null);
  const [splitPreview, setSplitPreview] = useState<ImagePreviewResult | null>(null);
  const [splitMode, setSplitMode] = useState<'fixedHeight' | 'nineGrid'>('fixedHeight');
  const [pieceHeight, setPieceHeight] = useState(1080);
  const [outputDir, setOutputDir] = useState<string | null>(null);
  const [format, setFormat] = useState<ImageOutputFormat>('preserve');
  const [quality, setQuality] = useState(88);
  const [busy, setBusy] = useState<'prepare' | 'export' | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [stitchResult, setStitchResult] = useState<ImageJobResult | null>(null);
  const [splitResults, setSplitResults] = useState<ImageJobResult[]>([]);
  usePreviewCleanup([
    ...stitchItems.map((item) => item.preview.previewPath),
    splitPreview?.previewPath,
  ]);

  const stitchDimensions = useMemo(() => {
    if (!stitchItems.length) return { width: 0, height: 0 };
    if (direction === 'vertical') return {
      width: Math.max(...stitchItems.map((item) => item.preview.width)),
      height: stitchItems.reduce((total, item) => total + item.preview.height, 0),
    };
    return {
      width: stitchItems.reduce((total, item) => total + item.preview.width, 0),
      height: Math.max(...stitchItems.map((item) => item.preview.height)),
    };
  }, [direction, stitchItems]);
  const canvasTooLarge = stitchDimensions.width * stitchDimensions.height > 60_000_000;
  const splitCount = splitPreview
    ? splitMode === 'nineGrid' ? 9 : Math.max(1, Math.ceil(splitPreview.height / Math.max(1, pieceHeight)))
    : 0;
  const splitTooMany = splitCount > 500;

  const addStitchImages = async () => {
    try {
      const paths = await chooseFiles(IMAGE_FILTERS);
      if (!paths.length) return;
      const known = new Set(stitchItems.map((item) => normalizedPathKey(item.inputPath)));
      const candidates: string[] = [];
      for (const path of paths) {
        const key = normalizedPathKey(path);
        if (known.has(key)) continue;
        if (stitchItems.length + candidates.length >= 30) break;
        known.add(key);
        candidates.push(path);
      }
      if (!candidates.length) {
        setNotice({ tone: 'neutral', text: '没有新增图片；拼接最多支持 30 张。' });
        return;
      }
      setBusy('prepare');
      setNotice({ tone: 'neutral', text: `正在准备 ${candidates.length} 张轻量预览…` });
      const prepared: StitchPreviewItem[] = [];
      const failed: string[] = [];
      for (const inputPath of candidates) {
        try {
          prepared.push({ inputPath, preview: await native.prepareImagePreview({ inputPath }) });
        } catch {
          failed.push(basename(inputPath));
        }
      }
      setStitchItems((current) => [...current, ...prepared].slice(0, 30));
      setStitchResult(null);
      if (failed.length) setNotice({ tone: 'error', text: `已添加 ${prepared.length} 张，另有 ${failed.length} 张无法读取。` });
      else if (paths.length > candidates.length) setNotice({ tone: 'neutral', text: '已忽略重复文件或超出上限的图片；拼接最多支持 30 张。' });
      else setNotice(null);
    } catch (error) {
      setNotice({ tone: 'error', text: getErrorMessage(error, '无法选择图片。') });
    } finally {
      setBusy(null);
    }
  };

  const selectSplitImage = async () => {
    try {
      const path = await chooseFile(IMAGE_FILTERS);
      if (!path) return;
      setBusy('prepare');
      setNotice({ tone: 'neutral', text: '正在生成轻量预览…' });
      const nextPreview = await native.prepareImagePreview({ inputPath: path });
      setSplitPath(path);
      setSplitPreview(nextPreview);
      setSplitResults([]);
      setNotice(null);
    } catch (error) {
      setNotice({ tone: 'error', text: getErrorMessage(error, '无法读取这张图片。') });
    } finally {
      setBusy(null);
    }
  };

  const selectOutput = async () => {
    try {
      const path = await chooseFolder();
      if (path) { setOutputDir(path); setStitchResult(null); setSplitResults([]); setNotice(null); }
    } catch (error) {
      setNotice({ tone: 'error', text: getErrorMessage(error, '无法选择输出文件夹。') });
    }
  };

  const moveStitchItem = (index: number, offset: -1 | 1) => {
    const target = index + offset;
    if (target < 0 || target >= stitchItems.length) return;
    setStitchItems((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setStitchResult(null);
  };

  const exportStitch = async () => {
    if (!outputDir || stitchItems.length < 2 || canvasTooLarge) return;
    setBusy('export');
    setStitchResult(null);
    setNotice({ tone: 'neutral', text: '正在按当前顺序拼接原图…' });
    try {
      const result = await native.stitchImages({
        inputPaths: stitchItems.map((item) => item.inputPath),
        outputDir,
        direction,
        format,
        jpegQuality: quality,
      });
      setStitchResult(result);
      setNotice({ tone: 'success', text: '拼接图片已保存，所有来源图片均未修改。' });
    } catch (error) {
      setNotice({ tone: 'error', text: getErrorMessage(error, '图片拼接失败。') });
    } finally {
      setBusy(null);
    }
  };

  const exportSplit = async () => {
    if (!outputDir || !splitPath || !splitPreview || splitTooMany || (splitMode === 'fixedHeight' && pieceHeight < 100)) return;
    setBusy('export');
    setSplitResults([]);
    setNotice({ tone: 'neutral', text: '正在从原图生成有序切片…' });
    try {
      const results = await native.splitImage({
        inputPath: splitPath,
        outputDir,
        mode: splitMode,
        pieceHeight: splitMode === 'fixedHeight' ? pieceHeight : null,
        format,
        jpegQuality: quality,
      });
      setSplitResults(results);
      setNotice({ tone: 'success', text: `已按阅读顺序保存 ${results.length} 张切片，原图未修改。` });
    } catch (error) {
      setNotice({ tone: 'error', text: getErrorMessage(error, '图片切分失败。') });
    } finally {
      setBusy(null);
    }
  };

  const maxStitchWidth = Math.max(1, ...stitchItems.map((item) => item.preview.width));
  const totalStitchWidth = Math.max(1, stitchItems.reduce((total, item) => total + item.preview.width, 0));
  const splitLines = splitMode === 'fixedHeight' && splitPreview
    ? Array.from(
      { length: Math.min(24, Math.max(0, splitCount - 1)) },
      (_, index) => Math.min(1, ((index + 1) * pieceHeight) / splitPreview.height),
    )
    : [];

  return <section className="tool-screen image-tool-screen">
    <ImageToolHeading title="拼接与切图" description="按顺序拼成长图或横图，也可以按固定高度或九宫格切分。" />
    <div className="image-mode-switch" role="tablist" aria-label="拼接与切图模式"><button className={mode === 'stitch' ? 'is-selected' : ''} role="tab" aria-selected={mode === 'stitch'} type="button" disabled={busy !== null} onClick={() => { setMode('stitch'); setNotice(null); }}><Layers3 size={17} /> 多图拼接</button><button className={mode === 'split' ? 'is-selected' : ''} role="tab" aria-selected={mode === 'split'} type="button" disabled={busy !== null} onClick={() => { setMode('split'); setNotice(null); }}><Scissors size={17} /> 长图切分</button></div>

    {mode === 'stitch' ? <div className="image-workbench-grid stitch-workbench">
      <section className="image-control-panel" aria-label="图片拼接设置">
        <div className="image-panel-heading"><span>拼接设置</span><small>{stitchItems.length}/30 张</small></div>
        <button className="image-select-button" type="button" disabled={busy !== null || stitchItems.length >= 30} onClick={() => void addStitchImages()}>{busy === 'prepare' ? <LoaderCircle className="spin" size={22} /> : <ImagePlus size={22} />}<span><strong>添加拼接图片</strong><small>选择后可调整上下顺序</small></span></button>
        <OutputFolderButton path={outputDir} disabled={busy !== null} onSelect={() => void selectOutput()} />
        <fieldset className="image-control-group" disabled={busy !== null}><legend>拼接方向</legend><div className="image-direction-choice"><button className={direction === 'vertical' ? 'is-selected' : ''} type="button" onClick={() => { setDirection('vertical'); setStitchResult(null); }}><ArrowDown size={17} /> 纵向长图</button><button className={direction === 'horizontal' ? 'is-selected' : ''} type="button" onClick={() => { setDirection('horizontal'); setStitchResult(null); }}><ArrowUp className="turn-right" size={17} /> 横向排列</button></div></fieldset>
        <div className={`stitch-size-readout ${canvasTooLarge ? 'is-error' : ''}`}><span><small>预计画布</small><strong>{stitchItems.length ? `${stitchDimensions.width} × ${stitchDimensions.height}` : '—'}</strong></span><small>{canvasTooLarge ? '超过 6000 万像素上限，请减少图片' : '短边图片将在画布中居中'}</small></div>
        <FormatFields format={format} quality={quality} disabled={busy !== null} onFormatChange={setFormat} onQualityChange={setQuality} />
        <div className="image-primary-actions"><button className="primary-button" type="button" disabled={busy !== null || !outputDir || stitchItems.length < 2 || canvasTooLarge} onClick={() => void exportStitch()}>{busy === 'export' ? <LoaderCircle className="spin" size={17} /> : <Layers3 size={17} />} {busy === 'export' ? '正在拼接' : '导出拼接图片'}</button><button className="secondary-button" type="button" disabled={busy !== null || !stitchItems.length} onClick={() => { setStitchItems([]); setStitchResult(null); setNotice(null); }}><Trash2 size={16} /> 清空</button></div>
        <NoticeLine notice={notice} />
        {stitchResult && <ResultCard result={stitchResult} title="拼接结果已保存" />}
      </section>

      <section className="image-preview-panel" aria-label="拼接顺序与预览">
        <div className="image-panel-heading"><span>顺序与预览</span><small>{stitchItems.length >= 2 ? `${direction === 'vertical' ? '纵向' : '横向'}拼接` : '至少添加 2 张'}</small></div>
        {stitchItems.length
          ? <div className="stitch-preview-body"><div className="stitch-order-list">{stitchItems.map((item, index) => <article key={item.inputPath}><img src={previewUrl(item.preview.previewPath) ?? ''} alt="" /><span><strong>{basename(item.inputPath)}</strong><small>{item.preview.width} × {item.preview.height}</small></span><div><button aria-label="上移" type="button" disabled={busy !== null || index === 0} onClick={() => moveStitchItem(index, -1)}><ArrowUp size={15} /></button><button aria-label="下移" type="button" disabled={busy !== null || index === stitchItems.length - 1} onClick={() => moveStitchItem(index, 1)}><ArrowDown size={15} /></button><button aria-label="移除" type="button" disabled={busy !== null} onClick={() => { setStitchItems((current) => current.filter((_, itemIndex) => itemIndex !== index)); setStitchResult(null); }}><X size={15} /></button></div></article>)}</div><div className={`stitch-canvas is-${direction}`}>{stitchItems.map((item) => <figure key={item.inputPath} style={direction === 'vertical' ? { width: `${item.preview.width / maxStitchWidth * 100}%` } : { width: `${item.preview.width / totalStitchWidth * 100}%` }}><img src={previewUrl(item.preview.previewPath) ?? ''} alt={basename(item.inputPath)} /></figure>)}</div></div>
          : <PreviewEmpty>添加至少两张图片后，可调整顺序并预览拼接方向。</PreviewEmpty>}
      </section>
    </div> : <div className="image-workbench-grid split-workbench">
      <section className="image-control-panel" aria-label="长图切分设置">
        <div className="image-panel-heading"><span>切图设置</span><small>单张长图</small></div>
        <button className="image-select-button" type="button" disabled={busy !== null} onClick={() => void selectSplitImage()}>{busy === 'prepare' ? <LoaderCircle className="spin" size={22} /> : <FileImage size={22} />}<span><strong>{basename(splitPath)}</strong><small>{splitPreview ? `${splitPreview.width} × ${splitPreview.height}，点击更换` : '选择要切分的图片'}</small></span></button>
        <OutputFolderButton path={outputDir} disabled={busy !== null} onSelect={() => void selectOutput()} />
        <fieldset className="image-control-group" disabled={busy !== null}><legend>切分方式</legend><div className="image-direction-choice"><button className={splitMode === 'fixedHeight' ? 'is-selected' : ''} type="button" onClick={() => { setSplitMode('fixedHeight'); setSplitResults([]); }}><Scissors size={17} /> 固定高度</button><button className={splitMode === 'nineGrid' ? 'is-selected' : ''} type="button" onClick={() => { setSplitMode('nineGrid'); setSplitResults([]); }}><Grid3X3 size={17} /> 九宫格</button></div></fieldset>
        {splitMode === 'fixedHeight' && <label className="image-field"><span>每段高度</span><div className="image-number-field"><input disabled={busy !== null} type="number" min="100" max="60000000" step="10" value={pieceHeight} onChange={(event) => { setPieceHeight(Math.min(60_000_000, Math.max(100, Number(event.target.value) || 100))); setSplitResults([]); setNotice(null); }} /><span>px</span></div></label>}
        <div className={`stitch-size-readout ${splitTooMany ? 'is-error' : ''}`}><span><small>预计输出</small><strong>{splitPreview ? `${splitCount} 张` : '—'}</strong></span><small>{splitTooMany ? '超过 500 张上限，请增大每段高度' : splitMode === 'nineGrid' ? '按从左到右、从上到下编号' : '最后一段会保留剩余高度'}</small></div>
        <FormatFields format={format} quality={quality} disabled={busy !== null} onFormatChange={setFormat} onQualityChange={setQuality} />
        <div className="image-primary-actions"><button className="primary-button" type="button" disabled={busy !== null || !outputDir || !splitPreview || !splitPath || splitTooMany || (splitMode === 'fixedHeight' && pieceHeight < 100)} onClick={() => void exportSplit()}>{busy === 'export' ? <LoaderCircle className="spin" size={17} /> : <Scissors size={17} />} {busy === 'export' ? '正在切分' : '导出有序切片'}</button></div>
        <NoticeLine notice={notice} />
        {splitResults.length > 0 && <div className="split-result-list"><div><Check size={18} /><strong>已保存 {splitResults.length} 张切片</strong></div>{splitResults.slice(0, 9).map((item, index) => <code key={item.outputPath}>{String(index + 1).padStart(2, '0')}　{item.outputPath}</code>)}{splitResults.length > 9 && <small>另有 {splitResults.length - 9} 张已保存到同一文件夹</small>}</div>}
      </section>

      <section className="image-preview-panel" aria-label="切分预览">
        <div className="image-panel-heading"><span>切分预览</span><small>{splitPreview ? `${splitPreview.width} × ${splitPreview.height}` : '等待选择图片'}</small></div>
        <div className="image-preview-stage split-preview-stage">{splitPreview && previewUrl(splitPreview.previewPath)
          ? <div className={`split-preview-media is-${splitMode}`} style={previewFrameStyle(splitPreview)}><img src={previewUrl(splitPreview.previewPath) ?? ''} alt="待切分图片" />{splitMode === 'nineGrid' ? <span className="nine-grid-overlay"><i /><i /><i /><i /></span> : <span className="fixed-split-overlay">{splitLines.map((position) => <i key={position} style={{ top: `${position * 100}%` }} />)}</span>}</div>
          : <PreviewEmpty>选择长图后，这里会标出预计切分位置。</PreviewEmpty>}</div>
        <footer className="image-preview-caption"><Grid3X3 size={15} /><span>{splitPreview ? `预计生成 ${splitCount} 张，文件名将按阅读顺序编号。` : '切分结果始终保存为新文件。'}</span></footer>
      </section>
    </div>}
  </section>;
}
