import { CheckCircle2, Copy, Save, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { saveText } from '../lib/native';
import { compactJson, formatJson } from '../lib/textTransforms';

const INITIAL_JSON = '{\n  "workspace": "OmniKit",\n  "mode": "local",\n  "tools": ["JSON", "Base64", "Hash"],\n  "ready": true\n}';

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

export function JsonTool() {
  const [input, setInput] = useState(INITIAL_JSON);
  const [result, setResult] = useState(INITIAL_JSON);
  const [message, setMessage] = useState('JSON 有效');
  const [isValid, setIsValid] = useState(true);

  const lines = useMemo(() => result.split('\n').length, [result]);
  const run = (kind: 'format' | 'compact' | 'validate') => {
    const transformed = kind === 'compact' ? compactJson(input) : formatJson(input);
    if (!transformed.ok) {
      setMessage(transformed.message);
      setIsValid(false);
      return;
    }
    if (kind !== 'validate') setResult(transformed.value);
    setMessage('JSON 有效');
    setIsValid(true);
  };

  return (
    <section className="tool-screen json-tool">
      <div className="tool-breadcrumb">文本与编码 <span>/</span> JSON 格式化</div>
      <div className="tool-titlebar">
        <div><h1>JSON 格式化</h1><p>格式化、校验与压缩 JSON 数据</p></div>
        <button className="quiet-button" type="button" onClick={() => { setInput(''); setResult(''); setMessage('等待输入'); setIsValid(false); }}><Trash2 size={17} /> 清空</button>
      </div>
      <div className="tool-actions">
        <button className="primary-button" type="button" onClick={() => run('format')}>格式化</button>
        <button className="secondary-button" type="button" onClick={() => run('compact')}>压缩</button>
        <button className="secondary-button" type="button" onClick={() => run('validate')}>校验</button>
      </div>

      <div className="editor-grid">
        <label className="editor-pane"><span className="pane-heading">输入</span><textarea value={input} onChange={(event) => setInput(event.target.value)} spellCheck={false} /></label>
        <div className="editor-pane result-pane">
          <div className="pane-heading"><span>结果</span><span className={isValid ? 'validation is-valid' : 'validation'}><CheckCircle2 size={18} /> {message}</span></div>
          <pre>{result || '结果会显示在这里。'}</pre>
          <footer>JSON　{result.length} 字符 <span>{lines} 行</span></footer>
        </div>
      </div>
      <div className="tool-footer-actions">
        <button className="secondary-button" type="button" disabled={!result} onClick={() => void copyText(result)}><Copy size={18} /> 复制结果</button>
        <button className="primary-button" type="button" disabled={!result} onClick={() => void saveText(result, 'omnikit.json')}><Save size={18} /> 保存为文件</button>
      </div>
    </section>
  );
}
