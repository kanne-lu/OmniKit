import { describe, expect, it } from 'vitest';
import { getNativeErrorMessage, parseAiServiceConfig, validateAiServiceConfig } from './aiService';

describe('AI service configuration', () => {
  it('loads only non-secret endpoint and model preferences', () => {
    expect(parseAiServiceConfig('{"endpoint":"https://api.example.com/v1/images/edits","model":"image-edit"}')).toEqual({
      endpoint: 'https://api.example.com/v1/images/edits',
      model: 'image-edit',
    });
    expect(parseAiServiceConfig('{"apiKey":"must-not-load"}')).toEqual({ endpoint: '', model: '' });
  });

  it('rejects malformed or insecure remote API addresses', () => {
    expect(validateAiServiceConfig({ endpoint: 'https://api.example.com/v1/images/edits', model: 'image-edit' })).toBeNull();
    expect(validateAiServiceConfig({ endpoint: 'http://localhost:8080/v1/images/edits', model: 'image-edit' })).toBeNull();
    expect(validateAiServiceConfig({ endpoint: 'https://api.example.com/v1', model: 'image-edit' })).toContain('/images/edits');
    expect(validateAiServiceConfig({ endpoint: 'http://api.example.com/v1/images/edits', model: 'image-edit' })).toContain('HTTPS');
    expect(validateAiServiceConfig({ endpoint: 'not a url', model: 'image-edit' })).toContain('无效');
  });

  it('keeps safe native error messages visible to the user', () => {
    expect(getNativeErrorMessage('AI 服务请求失败（HTTP 404）。', 'AI 去手写失败，请检查配置和网络。')).toBe('AI 服务请求失败（HTTP 404）。');
    expect(getNativeErrorMessage(new Error('无法连接 AI 服务，请检查 API 地址和网络。'), 'fallback')).toBe('无法连接 AI 服务，请检查 API 地址和网络。');
    expect(getNativeErrorMessage({ detail: 'not shown' }, 'fallback')).toBe('fallback');
  });
});
