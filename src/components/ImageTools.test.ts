import { describe, expect, it } from 'vitest';
import { pointFromTransformedPreview } from './ImageTools';

describe('pointFromTransformedPreview', () => {
  it('maps a clockwise-rotated preview point back to original coordinates', () => {
    expect(pointFromTransformedPreview({ x: 0.25, y: 0.6 }, 90, false, false)).toEqual({ x: 0.6, y: 0.75 });
  });

  it('maps a counter-clockwise-rotated preview point back to original coordinates', () => {
    expect(pointFromTransformedPreview({ x: 0.25, y: 0.6 }, 270, false, false)).toEqual({ x: 0.4, y: 0.25 });
  });

  it('undoes the post-rotation horizontal and vertical flips before mapping', () => {
    expect(pointFromTransformedPreview({ x: 0.25, y: 0.6 }, 90, true, true)).toEqual({ x: 0.4, y: 0.25 });
  });
});
