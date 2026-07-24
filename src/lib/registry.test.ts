import { describe, expect, it } from 'vitest';
import { CATEGORIES, searchTools, TOOL_BY_ID } from './registry';

describe('tool categories', () => {
  it('keeps the sidebar taxonomy focused on installed tools', () => {
    expect(CATEGORIES).toEqual(['图片工具', '文本工具', '文件工具', '开发工具', '教育工具']);
  });

  it('places coding formats and encodings in developer tools', () => {
    expect(searchTools('', '开发工具').map((tool) => tool.id)).toEqual(['json', 'base64']);
  });

  it('filters image, text, file and education utilities independently', () => {
    expect(searchTools('', '图片工具').map((tool) => tool.id)).toEqual([
      'image',
      'image-crop',
      'image-watermark',
      'image-stitch',
      'id-photo-background',
      'smart-cutout',
      'old-photo-restoration',
      'ai-upscale',
      'ocr',
    ]);
    expect(searchTools('', '文本工具').map((tool) => tool.id)).toEqual(['clipboard']);
    expect(searchTools('', '文件工具').map((tool) => tool.id)).toEqual(['hash', 'rename']);
    expect(searchTools('', '教育工具').map((tool) => tool.id)).toEqual(['copybook', 'wordcount', 'handwriting-removal']);
  });

  it('preserves the existing image tool id after the batch upgrade', () => {
    expect(TOOL_BY_ID.get('image')?.name).toBe('批量图片处理');
  });

  it('keeps the all-tools search available', () => {
    expect(searchTools('', 'all')).toHaveLength(17);
    expect(searchTools('base64', '开发工具').map((tool) => tool.id)).toEqual(['base64']);
    expect(searchTools('去手写', '教育工具').map((tool) => tool.id)).toEqual(['handwriting-removal']);
  });
});
