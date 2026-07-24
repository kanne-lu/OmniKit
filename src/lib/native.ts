import { invoke } from '@tauri-apps/api/core';
import { readImage, readText, writeText } from '@tauri-apps/plugin-clipboard-manager';
import { open, save } from '@tauri-apps/plugin-dialog';

export interface HashResult {
  fileName: string;
  bytes: number;
  md5: string;
  sha1: string;
  sha256: string;
}

export interface RenamePreviewItem {
  originalName: string;
  nextName: string;
  conflict: boolean;
}

export interface ImageResult {
  outputPath: string;
  bytes: number;
  width: number;
  height: number;
}

export type ImageOutputFormat = 'preserve' | 'jpg' | 'png' | 'webp';
export type ImageRotation = 0 | 90 | 180 | 270;
export type ImageWatermarkPosition =
  | 'topLeft'
  | 'topCenter'
  | 'topRight'
  | 'centerLeft'
  | 'center'
  | 'centerRight'
  | 'bottomLeft'
  | 'bottomCenter'
  | 'bottomRight';

export interface NormalizedImageCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PrepareImagePreviewRequest {
  inputPath: string;
}

export interface ImagePreviewResult {
  previewPath: string;
  inputBytes: number;
  width: number;
  height: number;
}

export interface ProcessImageRequest {
  inputPath: string;
  outputDir: string;
  format: ImageOutputFormat;
  maxDimension?: number | null;
  jpegQuality: number;
}

export interface TransformImageRequest {
  inputPath: string;
  outputDir: string;
  crop?: NormalizedImageCrop | null;
  rotation: ImageRotation;
  flipHorizontal: boolean;
  flipVertical: boolean;
  format: ImageOutputFormat;
  jpegQuality: number;
}

export interface WatermarkImageRequest {
  inputPath: string;
  outputDir: string;
  kind: 'text' | 'image';
  text?: string | null;
  watermarkPath?: string | null;
  opacity: number;
  size: number;
  margin: number;
  position: ImageWatermarkPosition;
  tiled: boolean;
  format: ImageOutputFormat;
  jpegQuality: number;
}

export interface StitchImagesRequest {
  inputPaths: string[];
  outputDir: string;
  direction: 'vertical' | 'horizontal';
  format: ImageOutputFormat;
  jpegQuality: number;
}

export interface SplitImageRequest {
  inputPath: string;
  outputDir: string;
  mode: 'fixedHeight' | 'nineGrid';
  pieceHeight?: number | null;
  format: ImageOutputFormat;
  jpegQuality: number;
}

export interface ImageJobResult {
  outputPath: string;
  inputBytes: number;
  outputBytes: number;
  width: number;
  height: number;
}

export interface ClipboardImage {
  width: number;
  height: number;
  bytes: number[];
}

export interface OcrResult {
  text: string;
}

export interface AiServiceConfig {
  endpoint: string;
  model: string;
}

export interface AiApiKeyStatus {
  configured: boolean;
}

export interface AiHandwritingPreview {
  previewPath: string;
  bytes: number;
  width: number;
  height: number;
}

export type AiImageOperation = 'idPhotoBackground' | 'cutout' | 'restore' | 'upscale';

export interface AiImageToolRequest {
  inputPath: string;
  operation: AiImageOperation;
  upscaleFactor?: 2 | 4 | null;
  backgroundColor?: string | null;
  config: AiServiceConfig;
}

export interface SaveAiImageToolResultRequest {
  previewPath: string;
  inputPath: string;
  outputDir: string;
  operation: AiImageOperation;
}

export function isDesktopRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function ensureDesktop(): void {
  if (!isDesktopRuntime()) throw new Error('该功能需要在 OmniKit 桌面客户端中运行');
}

export async function chooseFile(filters?: { name: string; extensions: string[] }[]): Promise<string | null> {
  ensureDesktop();
  const path = await open({ multiple: false, directory: false, filters });
  return typeof path === 'string' ? path : null;
}

export async function chooseFiles(filters?: { name: string; extensions: string[] }[]): Promise<string[]> {
  ensureDesktop();
  const paths = await open({ multiple: true, directory: false, filters });
  if (Array.isArray(paths)) return paths;
  return typeof paths === 'string' ? [paths] : [];
}

export async function chooseFolder(): Promise<string | null> {
  ensureDesktop();
  const path = await open({ multiple: false, directory: true });
  return typeof path === 'string' ? path : null;
}

export async function saveText(contents: string, defaultName: string): Promise<boolean> {
  ensureDesktop();
  const path = await save({ defaultPath: defaultName, filters: [{ name: 'JSON 文件', extensions: ['json'] }] });
  if (!path) return false;
  await invoke('write_text_file', { path, contents });
  return true;
}

export async function readClipboardText(): Promise<string> {
  ensureDesktop();
  return readText();
}

export async function writeClipboardText(contents: string): Promise<void> {
  ensureDesktop();
  await writeText(contents);
}

export async function readClipboardImage(): Promise<ClipboardImage> {
  ensureDesktop();
  const image = await readImage();
  const size = await image.size();
  return {
    width: size.width,
    height: size.height,
    bytes: Array.from(await image.rgba()),
  };
}

export const native = {
  hashFile: (path: string) => invoke<HashResult>('hash_file', { path }),
  getAiApiKeyStatus: () => invoke<AiApiKeyStatus>('get_ai_api_key_status'),
  saveAiApiKey: (apiKey: string) => invoke<void>('save_ai_api_key', { apiKey }),
  deleteAiApiKey: () => invoke<void>('delete_ai_api_key'),
  previewAiHandwritingRemoval: (inputPath: string, config: AiServiceConfig) =>
    invoke<AiHandwritingPreview>('preview_ai_handwriting_removal', { inputPath, config }),
  saveAiHandwritingResult: (previewPath: string, inputPath: string, outputDir: string) =>
    invoke<ImageResult>('save_ai_handwriting_result', { previewPath, inputPath, outputDir }),
  previewAiImageTool: (request: AiImageToolRequest) =>
    invoke<AiHandwritingPreview>('preview_ai_image_tool', { request }),
  removeAiImagePreview: (previewPath: string) =>
    invoke<void>('remove_ai_image_preview', { previewPath }),
  saveAiImageToolResult: (request: SaveAiImageToolResultRequest) =>
    invoke<ImageResult>('save_ai_image_tool_result', { request }),
  previewRename: (inputDir: string, outputDir: string, prefix: string, startNumber: number, separator: string) =>
    invoke<RenamePreviewItem[]>('preview_rename', { inputDir, outputDir, prefix, startNumber, separator }),
  copyRenamedFiles: (inputDir: string, outputDir: string, prefix: string, startNumber: number, separator: string) =>
    invoke<number>('copy_renamed_files', { inputDir, outputDir, prefix, startNumber, separator }),
  convertImage: (inputPath: string, outputDir: string, format: string, maxDimension: number, quality: number) =>
    invoke<ImageResult>('convert_image', { inputPath, outputDir, format, maxDimension, quality }),
  prepareImagePreview: (request: PrepareImagePreviewRequest) =>
    invoke<ImagePreviewResult>('prepare_image_preview', { request }),
  removeImagePreview: (previewPath: string) =>
    invoke<void>('remove_image_preview', { previewPath }),
  processImage: (request: ProcessImageRequest) =>
    invoke<ImageJobResult>('process_image', { request }),
  transformImage: (request: TransformImageRequest) =>
    invoke<ImageJobResult>('transform_image', { request }),
  watermarkImage: (request: WatermarkImageRequest) =>
    invoke<ImageJobResult>('watermark_image', { request }),
  stitchImages: (request: StitchImagesRequest) =>
    invoke<ImageJobResult>('stitch_images', { request }),
  splitImage: (request: SplitImageRequest) =>
    invoke<ImageJobResult[]>('split_image', { request }),
  recognizeImageFile: (path: string) => invoke<OcrResult>('recognize_image_file', { path }),
  recognizeClipboardImage: ({ width, height, bytes }: ClipboardImage) =>
    invoke<OcrResult>('recognize_clipboard_image', { width, height, bytes }),
};
