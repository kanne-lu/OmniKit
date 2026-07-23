import { ArrowLeft, Star } from 'lucide-react';
import type { ToolDefinition, ToolId } from '../lib/registry';
import type { ClipboardHistoryEntry } from '../lib/clipboardHistory';
import { ClipboardTool } from './ClipboardTool';
import { CodecTool } from './CodecTool';
import { AiHandwritingRemovalTool, CopybookTool, WordCountTool } from './EducationTools';
import { HashTool, RenameTool } from './FileTools';
import { BatchImageTool, ImageCropTool, ImageStitchTool, ImageWatermarkTool } from './ImageTools';
import { JsonTool } from './JsonTool';
import { OcrTool } from './OcrTool';

interface ToolWorkspaceProps {
  tool: ToolDefinition;
  isFavorite: boolean;
  onBack: () => void;
  onToggleFavorite: (id: ToolId) => void;
  clipboardEntries: ClipboardHistoryEntry[];
  isClipboardRecording: boolean;
  clipboardError: string | null;
  onClipboardRecordingChange: (value: boolean) => void;
  onClipboardEntryRemove: (id: string) => void;
  onClipboardPinToggle: (id: string) => void;
  onClipboardClear: () => void;
  onClipboardCopied: (text: string) => void;
}

export function ToolWorkspace({
  tool,
  isFavorite,
  onBack,
  onToggleFavorite,
  clipboardEntries,
  isClipboardRecording,
  clipboardError,
  onClipboardRecordingChange,
  onClipboardEntryRemove,
  onClipboardPinToggle,
  onClipboardClear,
  onClipboardCopied,
}: ToolWorkspaceProps) {
  const content = {
    json: <JsonTool />,
    base64: <CodecTool />,
    clipboard: <ClipboardTool entries={clipboardEntries} isRecording={isClipboardRecording} error={clipboardError} onRecordingChange={onClipboardRecordingChange} onRemove={onClipboardEntryRemove} onTogglePin={onClipboardPinToggle} onClear={onClipboardClear} onCopied={onClipboardCopied} />,
    hash: <HashTool />,
    rename: <RenameTool />,
    image: <BatchImageTool />,
    'image-crop': <ImageCropTool />,
    'image-watermark': <ImageWatermarkTool />,
    'image-stitch': <ImageStitchTool />,
    ocr: <OcrTool />,
    copybook: <CopybookTool />,
    wordcount: <WordCountTool />,
    'handwriting-removal': <AiHandwritingRemovalTool />,
  }[tool.id];

  return (
    <section className="workspace-view">
      <div className="workspace-toolbar">
        <button className="back-button" type="button" onClick={onBack}><ArrowLeft size={18} /> 返回工作台</button>
        <button className={isFavorite ? 'favorite-button is-favorite' : 'favorite-button'} type="button" onClick={() => onToggleFavorite(tool.id)} aria-label="收藏工具"><Star size={18} fill={isFavorite ? 'currentColor' : 'none'} /></button>
      </div>
      {content}
    </section>
  );
}
