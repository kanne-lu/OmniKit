import { describe, expect, it } from 'vitest';
import { parseAiServiceConfig, validateAiServiceConfig } from './aiService';

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
    expect(validateAiServiceConfig({ endpoint: 'http://api.example.com/v1/images/edits', model: 'image-edit' })).toContain('HTTPS');
    expect(validateAiServiceConfig({ endpoint: 'not a url', model: 'image-edit' })).toContain('无效');
  });
});
