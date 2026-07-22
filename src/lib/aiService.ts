import type { AiServiceConfig } from './native';

export const AI_SERVICE_STORAGE_KEY = 'omnikit.v1.ai-service';

export const EMPTY_AI_SERVICE_CONFIG: AiServiceConfig = {
  connectionMode: 'direct',
  endpoint: '',
  upstreamBaseUrl: '',
  model: '',
};

export function parseAiServiceConfig(value: string | null): AiServiceConfig {
  if (!value) return { ...EMPTY_AI_SERVICE_CONFIG };
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return { ...EMPTY_AI_SERVICE_CONFIG };
    const candidate = parsed as Partial<AiServiceConfig>;
    return {
      connectionMode: candidate.connectionMode === 'lindon-proxy' ? 'lindon-proxy' : 'direct',
      endpoint: typeof candidate.endpoint === 'string' ? candidate.endpoint : '',
      upstreamBaseUrl: typeof candidate.upstreamBaseUrl === 'string' ? candidate.upstreamBaseUrl : '',
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
    connectionMode: config.connectionMode === 'lindon-proxy' ? 'lindon-proxy' : 'direct',
    endpoint: config.endpoint.trim(),
    upstreamBaseUrl: config.upstreamBaseUrl.trim(),
    model: config.model.trim(),
  };
}

export function validateAiServiceConfig(config: AiServiceConfig): string | null {
  if (!config.endpoint.trim()) return '请填写完整 API 地址。';
  if (!config.model.trim()) return '请填写 AI 模型名。';
  const endpointLabel = config.connectionMode === 'lindon-proxy' ? '代理地址' : 'API 地址';
  const endpoint = validateHttpUrl(config.endpoint, endpointLabel);
  if (typeof endpoint === 'string') return endpoint;

  const pathname = endpoint.pathname.replace(/\/+$/, '');
  if (config.connectionMode === 'direct') {
    if (!/\/images\/edits$/i.test(pathname)) {
      return '请填写图像编辑完整地址，例如 https://example.com/v1/images/edits。';
    }
    return null;
  }

  if (!config.upstreamBaseUrl.trim()) return '请填写上游 API Base URL。';
  const upstream = validateHttpUrl(config.upstreamBaseUrl, '上游 API Base URL');
  if (typeof upstream === 'string') return upstream;
  const upstreamPath = upstream.pathname.replace(/\/+$/, '');
  if (/\/(?:images|responses)(?:\/|$)/i.test(upstreamPath)) {
    return '上游地址应填写 Base URL，例如 https://example.com/v1，不能填写具体接口路径。';
  }

  return null;
}

export function describeAiServiceDestination(config: AiServiceConfig): string {
  if (config.connectionMode === 'lindon-proxy') {
    return `图片会先发送至 ${config.endpoint}，再由代理转发到 ${config.upstreamBaseUrl}。`;
  }
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
