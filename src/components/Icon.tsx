import type { LucideIcon } from 'lucide-react';
import {
  Binary,
  Braces,
  ClipboardList,
  Crop,
  Eraser,
  Files,
  Hash,
  Image,
  Layers2,
  NotebookPen,
  ScanText,
  Stamp,
  TextCursorInput,
} from 'lucide-react';
import type { ToolIcon } from '../lib/registry';

const iconByName: Record<ToolIcon, LucideIcon> = {
  braces: Braces,
  binary: Binary,
  clipboard: ClipboardList,
  hash: Hash,
  rename: Files,
  image: Image,
  crop: Crop,
  watermark: Stamp,
  stitch: Layers2,
  ocr: ScanText,
  copybook: NotebookPen,
  wordcount: TextCursorInput,
  handwriting: Eraser,
};

export function ToolIconGlyph({ name, size = 22 }: { name: ToolIcon; size?: number }) {
  const Icon = iconByName[name];
  return <Icon aria-hidden="true" size={size} strokeWidth={1.9} />;
}
