import { invoke } from '@tauri-apps/api/core';
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

export const native = {
  hashFile: (path: string) => invoke<HashResult>('hash_file', { path }),
  previewRename: (inputDir: string, outputDir: string, prefix: string, startNumber: number, separator: string) =>
    invoke<RenamePreviewItem[]>('preview_rename', { inputDir, outputDir, prefix, startNumber, separator }),
  copyRenamedFiles: (inputDir: string, outputDir: string, prefix: string, startNumber: number, separator: string) =>
    invoke<number>('copy_renamed_files', { inputDir, outputDir, prefix, startNumber, separator }),
  convertImage: (inputPath: string, outputDir: string, format: string, maxDimension: number, quality: number) =>
    invoke<ImageResult>('convert_image', { inputPath, outputDir, format, maxDimension, quality }),
};
