import { describe, expect, it } from 'vitest';
import { describeAiServiceDestination, getNativeErrorMessage, normalizeAiServiceConfig, parseAiServiceConfig, validateAiServiceConfig } from './aiService';

describe('AI service configuration', () => {
  it('loads only non-secret preferences and migrates existing direct settings', () => {
    expect(parseAiServiceConfig('{"endpoint":"https://api.example.com/v1/images/edits","model":"image-edit"}')).toEqual({
      connectionMode: 'direct',
      endpoint: 'https://api.example.com/v1/images/edits',
      upstreamBaseUrl: '',
      model: 'image-edit',
    });
    expect(parseAiServiceConfig('{"connectionMode":"lindon-proxy","endpoint":"https://tools.example.com/api-proxy.php","upstreamBaseUrl":"https://api.example.com/v1","model":"image-edit","apiKey":"must-not-load"}')).toEqual({
      connectionMode: 'lindon-proxy',
      endpoint: 'https://tools.example.com/api-proxy.php',
      upstreamBaseUrl: 'https://api.example.com/v1',
      model: 'image-edit',
    });
    expect(parseAiServiceConfig('{"apiKey":"must-not-load"}')).toEqual({ connectionMode: 'direct', endpoint: '', upstreamBaseUrl: '', model: '' });
  });

  it('rejects malformed or insecure remote API addresses', () => {
    expect(validateAiServiceConfig({ connectionMode: 'direct', endpoint: 'https://api.example.com/v1/images/edits', upstreamBaseUrl: '', model: 'image-edit' })).toBeNull();
    expect(validateAiServiceConfig({ connectionMode: 'direct', endpoint: 'http://localhost:8080/v1/images/edits', upstreamBaseUrl: '', model: 'image-edit' })).toBeNull();
    expect(validateAiServiceConfig({ connectionMode: 'direct', endpoint: 'https://api.example.com/v1', upstreamBaseUrl: '', model: 'image-edit' })).toContain('/images/edits');
    expect(validateAiServiceConfig({ connectionMode: 'direct', endpoint: 'http://api.example.com/v1/images/edits', upstreamBaseUrl: '', model: 'image-edit' })).toContain('HTTPS');
    expect(validateAiServiceConfig({ connectionMode: 'direct', endpoint: 'not a url', upstreamBaseUrl: '', model: 'image-edit' })).toContain('无效');
  });

  it('validates Lindon proxy settings without exposing a credential', () => {
    const proxy = {
      connectionMode: 'lindon-proxy' as const,
      endpoint: 'https://tools.example.com/api-proxy.php',
      upstreamBaseUrl: 'https://api.example.com/v1',
      model: 'image-edit',
    };
    expect(validateAiServiceConfig(proxy)).toBeNull();
    expect(validateAiServiceConfig({ ...proxy, upstreamBaseUrl: '' })).toContain('Base URL');
    expect(validateAiServiceConfig({ ...proxy, upstreamBaseUrl: 'https://api.example.com/v1/images/edits' })).toContain('Base URL');
    expect(validateAiServiceConfig({ ...proxy, endpoint: 'http://tools.example.com/api-proxy.php' })).toContain('HTTPS');
    expect(validateAiServiceConfig({ ...proxy, upstreamBaseUrl: 'https://name:secret@api.example.com/v1' })).toContain('密钥');
  });

  it('normalizes saved preferences and discloses the first image recipient', () => {
    const proxy = normalizeAiServiceConfig({
      connectionMode: 'lindon-proxy',
      endpoint: ' https://tools.example.com/api-proxy.php ',
      upstreamBaseUrl: ' https://api.example.com/v1 ',
      model: ' image-edit ',
    });
    expect(proxy).toEqual({
      connectionMode: 'lindon-proxy',
      endpoint: 'https://tools.example.com/api-proxy.php',
      upstreamBaseUrl: 'https://api.example.com/v1',
      model: 'image-edit',
    });
    expect(describeAiServiceDestination(proxy)).toContain('https://tools.example.com/api-proxy.php');
    expect(describeAiServiceDestination(proxy)).toContain('https://api.example.com/v1');
  });

  it('keeps safe native error messages visible to the user', () => {
    expect(getNativeErrorMessage('AI 服务请求失败（HTTP 404）。', 'AI 去手写失败，请检查配置和网络。')).toBe('AI 服务请求失败（HTTP 404）。');
    expect(getNativeErrorMessage(new Error('无法连接 AI 服务，请检查 API 地址和网络。'), 'fallback')).toBe('无法连接 AI 服务，请检查 API 地址和网络。');
    expect(getNativeErrorMessage({ detail: 'not shown' }, 'fallback')).toBe('fallback');
  });
});
