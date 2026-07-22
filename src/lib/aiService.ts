import type { AiServiceConfig } from './native';

export const AI_SERVICE_STORAGE_KEY = 'omnikit.v1.ai-service';

export const EMPTY_AI_SERVICE_CONFIG: AiServiceConfig = {
  endpoint: '',
  model: '',
};

export function parseAiServiceConfig(value: string | null): AiServiceConfig {
  if (!value) return { ...EMPTY_AI_SERVICE_CONFIG };
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return { ...EMPTY_AI_SERVICE_CONFIG };
    const candidate = parsed as Partial<AiServiceConfig>;
    return {
      endpoint: typeof candidate.endpoint === 'string' ? candidate.endpoint : '',
      model: typeof candidate.model === 'string' ? candidate.model : '',
    };
  } catch {
    return { ...EMPTY_AI_SERVICE_CONFIG };
  }
}

export function validateAiServiceConfig(config: AiServiceConfig): string | null {
  if (!config.endpoint.trim()) return '请填写完整 API 地址。';
  if (!config.model.trim()) return '请填写 AI 模型名。';
  try {
    const endpoint = new URL(config.endpoint.trim());
    const isLoopback = endpoint.hostname === 'localhost' || endpoint.hostname === '127.0.0.1' || endpoint.hostname === '[::1]';
    if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && isLoopback)) {
      return 'API 地址必须使用 HTTPS；本机调试服务可使用 localhost。';
    }
    if (endpoint.username || endpoint.password) return 'API 地址中不能包含账号或密钥。';
    const pathname = endpoint.pathname.replace(/\/+$/, '');
    if (!pathname || /\/v1$/i.test(pathname)) {
      return '请填写图像编辑完整地址，例如 https://example.com/v1/images/edits。';
    }
  } catch {
    return 'API 地址格式无效。';
  }
  return null;
}

export function getNativeErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
}

export function hasAiServiceEndpoint(config: AiServiceConfig): boolean {
  return !validateAiServiceConfig(config);
}
