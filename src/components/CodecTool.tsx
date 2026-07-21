import { Copy, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { decodeBase64, decodeUrl, encodeBase64, encodeUrl, type TransformResult } from '../lib/textTransforms';

type CodecMode = 'base64Encode' | 'base64Decode' | 'urlEncode' | 'urlDecode';

const MODE_LABELS: Record<CodecMode, string> = {
  base64Encode: '编码 Base64',
  base64Decode: '解码 Base64',
  urlEncode: 'URL 编码',
  urlDecode: 'URL 解码',
};

function transform(mode: CodecMode, value: string): TransformResult {
  if (mode === 'base64Encode') return encodeBase64(value);
  if (mode === 'base64Decode') return decodeBase64(value);
  if (mode === 'urlEncode') return encodeUrl(value);
  return decodeUrl(value);
}

export function CodecTool() {
  const [mode, setMode] = useState<CodecMode>('base64Encode');
  const [input, setInput] = useState('OmniKit：所有内容仅在本机处理。');
  const [result, setResult] = useState('');
  const [message, setMessage] = useState('选择一种转换方式后运行。');

  const run = () => {
    const transformed = transform(mode, input);
    if (transformed.ok) { setResult(transformed.value); setMessage('转换完成'); }
    else { setResult(''); setMessage(transformed.message); }
  };
  return (
    <section className="tool-screen">
      <div className="tool-breadcrumb">文本与编码 <span>/</span> Base64 编解码</div>
      <div className="tool-titlebar"><div><h1>Base64 编解码</h1><p>在普通文本、Base64 与 URL 编码之间转换。</p></div></div>
      <div className="segmented-control" role="tablist" aria-label="转换方式">
        {(Object.keys(MODE_LABELS) as CodecMode[]).map((option) => <button key={option} type="button" role="tab" aria-selected={mode === option} className={mode === option ? 'is-selected' : ''} onClick={() => setMode(option)}>{MODE_LABELS[option]}</button>)}
      </div>
      <div className="text-tool-grid">
        <label className="editor-pane"><span className="pane-heading">输入</span><textarea value={input} onChange={(event) => setInput(event.target.value)} /></label>
        <div className="editor-pane result-pane"><div className="pane-heading">结果</div><pre>{result || '转换后的内容会显示在这里。'}</pre><footer>{message}</footer></div>
      </div>
      <div className="tool-footer-actions"><button className="primary-button" type="button" onClick={run}><RefreshCw size={18} /> 执行转换</button><button className="secondary-button" type="button" disabled={!result} onClick={() => void navigator.clipboard.writeText(result)}><Copy size={18} /> 复制结果</button></div>
    </section>
  );
}
