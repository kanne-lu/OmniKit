import type { AiServiceConfig } from './native';

export const AI_SERVICE_STORAGE_KEY = 'omnikit.v1.ai-service';

export const EMPTY_AI_SERVICE_CONFIG: AiServiceConfig = {
  endpoint: '',
  model: '',
};

interface LegacyAiServiceConfig extends Partial<AiServiceConfig> {
  connectionMode?: unknown;
  upstreamBaseUrl?: unknown;
}

function migrateLegacyEndpoint(candidate: LegacyAiServiceConfig): string {
  const endpoint = typeof candidate.endpoint === 'string' ? candidate.endpoint : '';
  if (candidate.connectionMode !== 'lindon-proxy' || typeof candidate.upstreamBaseUrl !== 'string' || !candidate.upstreamBaseUrl.trim()) {
    return endpoint;
  }
  try {
    const upstream = new URL(candidate.upstreamBaseUrl.trim());
    const path = upstream.pathname.replace(/\/+$/, '');
    if (!/\/images\/edits$/i.test(path)) upstream.pathname = `${path}/images/edits`;
    upstream.search = '';
    upstream.hash = '';
    return upstream.toString();
  } catch {
    return endpoint;
  }
}

export function parseAiServiceConfig(value: string | null): AiServiceConfig {
  if (!value) return { ...EMPTY_AI_SERVICE_CONFIG };
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return { ...EMPTY_AI_SERVICE_CONFIG };
    const candidate = parsed as LegacyAiServiceConfig;
    return {
      endpoint: migrateLegacyEndpoint(candidate),
      model: typeof candidate.model === 'string' ? candidate.model : '',
    };
  } catch {
    return { ...EMPTY_AI_SERVICE_CONFIG };
  }
}

function validateHttpUrl(value: string, label: string): URL | string {
  try {
    const url = new URL(value.trim());
    const isLoopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback)) {
      return `${label}必须使用 HTTPS；本机调试服务可使用 localhost。`;
    }
    if (url.username || url.password) return `${label}中不能包含账号或密钥。`;
    return url;
  } catch {
    return `${label}格式无效。`;
  }
}

export function normalizeAiServiceConfig(config: AiServiceConfig): AiServiceConfig {
  return {
    endpoint: config.endpoint.trim(),
    model: config.model.trim(),
  };
}

export function validateAiServiceConfig(config: AiServiceConfig): string | null {
  if (!config.endpoint.trim()) return '请填写完整 API 地址。';
  if (!config.model.trim()) return '请填写 AI 模型名。';
  const endpoint = validateHttpUrl(config.endpoint, 'API 地址');
  if (typeof endpoint === 'string') return endpoint;

  const pathname = endpoint.pathname.replace(/\/+$/, '');
  if (!/\/images\/edits$/i.test(pathname)) {
    return '请填写图像编辑完整地址，例如 https://example.com/v1/images/edits。';
  }
  return null;
}

export function describeAiServiceDestination(config: AiServiceConfig): string {
  return `图片会直接发送至 ${config.endpoint}。`;
}

export function getNativeErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
}

export function hasAiServiceEndpoint(config: AiServiceConfig): boolean {
  return !validateAiServiceConfig(config);
}
