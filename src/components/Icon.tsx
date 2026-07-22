import type { LucideIcon } from 'lucide-react';
import {
  Binary,
  Braces,
  ClipboardList,
  Eraser,
  Files,
  Hash,
  Image,
  NotebookPen,
  ScanText,
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
  ocr: ScanText,
  copybook: NotebookPen,
  wordcount: TextCursorInput,
  handwriting: Eraser,
};

export function ToolIconGlyph({ name, size = 22 }: { name: ToolIcon; size?: number }) {
  const Icon = iconByName[name];
  return <Icon aria-hidden="true" size={size} strokeWidth={1.9} />;
}
