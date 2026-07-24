import { describe, expect, it } from 'vitest';
import { getUpscaleTargetDimensions } from './aiImageTools';

describe('AI image upscale dimensions', () => {
  it('reports the expected 2x and 4x output sizes', () => {
    expect(getUpscaleTargetDimensions(1200, 800, 2)).toEqual({ width: 2400, height: 1600 });
    expect(getUpscaleTargetDimensions(1200, 800, 4)).toEqual({ width: 4800, height: 3200 });
  });
});
