import { describe, expect, it } from 'vitest';
import { compactJson, decodeBase64, decodeUrl, encodeBase64, encodeUrl, formatJson } from './textTransforms';

describe('JSON transforms', () => {
  it('formats valid JSON with two-space indentation', () => {
    expect(formatJson('{"tool":"OmniKit","ready":true}')).toEqual({
      ok: true,
      value: '{\n  "tool": "OmniKit",\n  "ready": true\n}',
    });
  });

  it('reports invalid JSON without returning a result', () => {
    expect(formatJson('{"tool":}').ok).toBe(false);
  });

  it('minifies valid JSON', () => {
    expect(compactJson('{\n  "tool": "OmniKit"\n}')).toEqual({ ok: true, value: '{"tool":"OmniKit"}' });
  });
});

describe('text encodings', () => {
  it('round-trips Unicode through Base64', () => {
    const encoded = encodeBase64('多功能工具箱 ✨');
    expect(encoded.ok && decodeBase64(encoded.value)).toEqual({ ok: true, value: '多功能工具箱 ✨' });
  });

  it('round-trips URL encoding', () => {
    const encoded = encodeUrl('OmniKit / 工具箱');
    expect(encoded.ok && decodeUrl(encoded.value)).toEqual({ ok: true, value: 'OmniKit / 工具箱' });
  });
});
