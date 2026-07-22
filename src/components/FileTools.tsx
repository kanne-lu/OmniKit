import { CheckCircle2, FileUp, FolderOpen, Image as ImageIcon, LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { chooseFile, chooseFolder, native, type HashResult, type ImageResult, type RenamePreviewItem } from '../lib/native';

function basename(path: string | null): string {
  return path?.split(/[\\/]/).pop() ?? '未选择';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function NativeError({ message }: { message: string }) {
  return message ? <p className="inline-error">{message}</p> : null;
}

export function HashTool() {
  const [path, setPath] = useState<string | null>(null);
  const [result, setResult] = useState<HashResult | null>(null);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const select = async () => {
    try { const nextPath = await chooseFile(); if (nextPath) { setPath(nextPath); setResult(null); setMessage(''); } }
    catch (error) { setMessage(error instanceof Error ? error.message : '无法选择文件'); }
  };
  const calculate = async () => {
    if (!path) return;
    setPending(true); setMessage('');
    try { setResult(await native.hashFile(path)); } catch (error) { setMessage(error instanceof Error ? error.message : '计算失败'); } finally { setPending(false); }
  };
  return <section className="tool-screen">
    <div className="tool-breadcrumb">文件工具 <span>/</span> 文件哈希</div>
    <div className="tool-titlebar"><div><h1>文件哈希</h1><p>计算 MD5、SHA-1 与 SHA-256 校验值。</p></div></div>
    <div className="native-workbench">
      <div className="file-picker"><FileUp size={25} /><div><strong>{basename(path)}</strong><small>{path ? '已选择文件，准备计算。' : '选择一个本地文件开始。'}</small></div><button className="secondary-button" type="button" onClick={() => void select()}>选择文件</button></div>
      <button className="primary-button" type="button" disabled={!path || pending} onClick={() => void calculate()}>{pending ? <LoaderCircle className="spin" size={18} /> : <RefreshCw size={18} />} 计算哈希</button>
      <NativeError message={message} />
      {result && <div className="hash-results"><div className="hash-file"><CheckCircle2 size={20} /><strong>{result.fileName}</strong><span>{formatBytes(result.bytes)}</span></div>{(['md5', 'sha1', 'sha256'] as const).map((algorithm) => <label key={algorithm}><span>{algorithm.toUpperCase()}</span><code>{result[algorithm]}</code></label>)}</div>}
    </div>
  </section>;
}

export function RenameTool() {
  const [inputDir, setInputDir] = useState<string | null>(null);
  const [outputDir, setOutputDir] = useState<string | null>(null);
  const [prefix, setPrefix] = useState('OmniKit 文件');
  const [startNumber, setStartNumber] = useState(1);
  const [separator, setSeparator] = useState('-');
  const [preview, setPreview] = useState<RenamePreviewItem[]>([]);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const selectFolder = async (setPath: (value: string) => void) => {
    try { const nextPath = await chooseFolder(); if (nextPath) { setPath(nextPath); setPreview([]); setMessage(''); } } catch (error) { setMessage(error instanceof Error ? error.message : '无法选择文件夹'); }
  };
  const createPreview = async () => {
    if (!inputDir || !outputDir) return;
    setPending(true); setMessage('');
    try { setPreview(await native.previewRename(inputDir, outputDir, prefix, startNumber, separator)); } catch (error) { setMessage(error instanceof Error ? error.message : '无法生成预览'); } finally { setPending(false); }
  };
  const copyFiles = async () => {
    if (!inputDir || !outputDir || !preview.length || preview.some((item) => item.conflict)) return;
    setPending(true); setMessage('');
    try { const count = await native.copyRenamedFiles(inputDir, outputDir, prefix, startNumber, separator); setMessage(`已输出 ${count} 个副本，原始文件未修改。`); } catch (error) { setMessage(error instanceof Error ? error.message : '输出失败'); } finally { setPending(false); }
  };
  return <section className="tool-screen">
    <div className="tool-breadcrumb">文件工具 <span>/</span> 批量重命名</div>
    <div className="tool-titlebar"><div><h1>批量重命名</h1><p>先预览新文件名，再输出保留原文件的副本。</p></div></div>
    <div className="rename-form">
      <button className="path-field" type="button" onClick={() => void selectFolder(setInputDir)}><FolderOpen size={20} /><span><small>输入文件夹</small><strong>{inputDir ?? '选择要处理的文件夹'}</strong></span></button>
      <button className="path-field" type="button" onClick={() => void selectFolder(setOutputDir)}><FolderOpen size={20} /><span><small>输出文件夹</small><strong>{outputDir ?? '选择保存副本的位置'}</strong></span></button>
      <label><span>文件名前缀</span><input value={prefix} onChange={(event) => setPrefix(event.target.value)} /></label>
      <label><span>起始编号</span><input type="number" min="0" value={startNumber} onChange={(event) => setStartNumber(Number(event.target.value))} /></label>
      <label><span>分隔符</span><input value={separator} maxLength={4} onChange={(event) => setSeparator(event.target.value)} /></label>
    </div>
    <div className="tool-footer-actions"><button className="primary-button" type="button" disabled={!inputDir || !outputDir || pending} onClick={() => void createPreview()}>{pending ? <LoaderCircle className="spin" size={18} /> : <RefreshCw size={18} />} 生成预览</button><button className="secondary-button" type="button" disabled={!preview.length || pending || preview.some((item) => item.conflict)} onClick={() => void copyFiles()}>输出重命名副本</button></div>
    <NativeError message={message} />
    {preview.length > 0 && <div className="rename-preview"><div className="preview-heading"><span>原文件名</span><span>新文件名</span></div>{preview.slice(0, 8).map((item) => <div className={item.conflict ? 'preview-row has-conflict' : 'preview-row'} key={item.originalName}><span>{item.originalName}</span><span>{item.nextName}</span></div>)}{preview.length > 8 && <p>还有 {preview.length - 8} 个文件。</p>}</div>}
  </section>;
}

export function ImageTool() {
  const [inputPath, setInputPath] = useState<string | null>(null);
  const [outputDir, setOutputDir] = useState<string | null>(null);
  const [format, setFormat] = useState('jpg');
  const [maxDimension, setMaxDimension] = useState(1920);
  const [quality, setQuality] = useState(82);
  const [result, setResult] = useState<ImageResult | null>(null);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const pickImage = async () => { try { const path = await chooseFile([{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]); if (path) { setInputPath(path); setResult(null); setMessage(''); } } catch (error) { setMessage(error instanceof Error ? error.message : '无法选择图片'); } };
  const pickOutput = async () => { try { const path = await chooseFolder(); if (path) { setOutputDir(path); setResult(null); setMessage(''); } } catch (error) { setMessage(error instanceof Error ? error.message : '无法选择文件夹'); } };
  const convert = async () => { if (!inputPath || !outputDir) return; setPending(true); setMessage(''); try { setResult(await native.convertImage(inputPath, outputDir, format, maxDimension, quality)); } catch (error) { setMessage(error instanceof Error ? error.message : '图片处理失败'); } finally { setPending(false); } };
  return <section className="tool-screen">
    <div className="tool-breadcrumb">图片工具 <span>/</span> 图片压缩</div>
    <div className="tool-titlebar"><div><h1>图片压缩</h1><p>压缩或转换 JPG、PNG 与 WebP 图片。</p></div></div>
    <div className="image-layout"><div className="image-picker"><ImageIcon size={31} /><strong>{basename(inputPath)}</strong><small>{inputPath ? '已选择图片。' : '选择一张 JPG、PNG 或 WebP 图片。'}</small><button className="secondary-button" type="button" onClick={() => void pickImage()}>选择图片</button></div><div className="image-options"><button className="path-field" type="button" onClick={() => void pickOutput()}><FolderOpen size={20} /><span><small>输出文件夹</small><strong>{outputDir ?? '选择输出位置'}</strong></span></button><label><span>输出格式</span><select value={format} onChange={(event) => setFormat(event.target.value)}><option value="jpg">JPG</option><option value="png">PNG</option><option value="webp">WebP</option></select></label><label><span>最长边　{maxDimension}px</span><input type="range" min="640" max="3840" step="160" value={maxDimension} onChange={(event) => setMaxDimension(Number(event.target.value))} /></label><label><span>JPG 质量　{quality}</span><input type="range" min="40" max="100" value={quality} onChange={(event) => setQuality(Number(event.target.value))} /></label></div></div>
    <div className="tool-footer-actions"><button className="primary-button" type="button" disabled={!inputPath || !outputDir || pending} onClick={() => void convert()}>{pending ? <LoaderCircle className="spin" size={18} /> : <ImageIcon size={18} />} 开始处理</button></div>
    <NativeError message={message} />
    {result && <div className="success-panel"><ShieldCheck size={22} /><span><strong>图片已输出</strong><small>{result.width} × {result.height}　·　{formatBytes(result.bytes)}　·　{result.outputPath}</small></span></div>}
  </section>;
}
