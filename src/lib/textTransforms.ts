export type TransformResult = { ok: true; value: string } | { ok: false; message: string };

export function formatJson(input: string): TransformResult {
  try {
    return { ok: true, value: JSON.stringify(JSON.parse(input), null, 2) };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'JSON 无效' };
  }
}

export function compactJson(input: string): TransformResult {
  try {
    return { ok: true, value: JSON.stringify(JSON.parse(input)) };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'JSON 无效' };
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value.trim());
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function encodeBase64(input: string): TransformResult {
  return { ok: true, value: bytesToBase64(new TextEncoder().encode(input)) };
}

export function decodeBase64(input: string): TransformResult {
  try {
    return { ok: true, value: new TextDecoder().decode(base64ToBytes(input)) };
  } catch {
    return { ok: false, message: 'Base64 内容无效或无法解码为文本' };
  }
}

export function encodeUrl(input: string): TransformResult {
  return { ok: true, value: encodeURIComponent(input) };
}

export function decodeUrl(input: string): TransformResult {
  try {
    return { ok: true, value: decodeURIComponent(input) };
  } catch {
    return { ok: false, message: 'URL 编码内容无效' };
  }
}
