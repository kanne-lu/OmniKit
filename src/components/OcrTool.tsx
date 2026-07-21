import { Check, ClipboardPaste, Copy, FileImage, LoaderCircle, ScanText, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { chooseFile, isDesktopRuntime, native, readClipboardImage, writeClipboardText } from '../lib/native';

export function OcrTool() {
  const [result, setResult] = useState('');
  const [source, setSource] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const desktop = isDesktopRuntime();

  const runRecognition = async (sourceName: string, action: () => Promise<{ text: string }>) => {
    setPending(true);
    setMessage('');
    try {
      const next = await action();
      setSource(sourceName);
      setResult(next.text);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '文字识别失败，请重试');
    } finally {
      setPending(false);
    }
  };

  const recognizeClipboard = () => runRecognition('剪贴板截图', async () => native.recognizeClipboardImage(await readClipboardImage()));

  const recognizeFile = async () => {
    try {
      const path = await chooseFile([{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'bmp', 'webp'] }]);
      if (!path) return;
      const fileName = path.split(/[\\/]/).pop() ?? '本地图片';
      await runRecognition(fileName, () => native.recognizeImageFile(path));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '无法选择图片');
    }
  };

  const copyResult = async () => {
    if (!result.trim()) return;
    setMessage('');
    try {
      await writeClipboardText(result);
      setMessage('识别结果已复制到系统剪贴板');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '复制失败，请重试');
    }
  };

  return (
    <section className="tool-screen">
      <div className="tool-breadcrumb">图片处理 <span>/</span> 截图识字</div>
      <div className="tool-titlebar"><div><h1>截图识字</h1><p>识别截图或本地图片中的中文、英文文字，整个过程仅在本机完成。</p></div></div>
      {!desktop && <p className="desktop-only-note"><ShieldCheck size={17} /> OCR 需要 Windows 桌面版与本机已安装的 OCR 语言功能。</p>}

      <div className="ocr-entry-grid">
        <button className="ocr-source-card" type="button" disabled={pending} onClick={() => void recognizeClipboard()}>
          <span className="ocr-source-icon"><ClipboardPaste size={25} /></span>
          <span><strong>识别剪贴板截图</strong><small>先按 Win + Shift + S 截图，再点击这里</small></span>
          {pending ? <LoaderCircle className="spin" size={18} /> : <ScanText size={19} />}
        </button>
        <button className="ocr-source-card" type="button" disabled={pending} onClick={() => void recognizeFile()}>
          <span className="ocr-source-icon"><FileImage size={25} /></span>
          <span><strong>选择本地图片</strong><small>支持 JPG、PNG、BMP 与 WebP 图片</small></span>
          <ScanText size={19} />
        </button>
      </div>

      <div className="ocr-workflow-note"><span>01</span><p>使用 Windows 截图快捷键截取需要的区域，或直接选择一张图片。</p><span>02</span><p>识别完成后可以编辑文字，再一键复制到其他应用。</p></div>

      <section className="ocr-result-panel" aria-label="识别结果">
        <div className="pane-heading"><span>识别结果 {source && <small>来自 {source}</small>}</span><button className="quiet-button" type="button" disabled={!result.trim()} onClick={() => void copyResult()}><Copy size={16} /> 复制结果</button></div>
        <textarea value={result} onChange={(event) => setResult(event.target.value)} placeholder="识别后的文字会显示在这里，可直接编辑。" aria-label="可编辑的识别结果" />
        <footer>{result ? <span>{result.length} 个字符</span> : <span>图片不会上传到网络</span>} {result && <Check size={16} />}</footer>
      </section>
      {message && <p className={message.includes('已复制') ? 'clipboard-message' : 'inline-error'}>{message.includes('已复制') ? <Check size={16} /> : null} {message}</p>}
    </section>
  );
}
