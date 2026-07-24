export type UpscaleFactor = 2 | 4;

export function getUpscaleTargetDimensions(width: number, height: number, factor: UpscaleFactor) {
  return {
    width: Math.round(width * factor),
    height: Math.round(height * factor),
  };
}
