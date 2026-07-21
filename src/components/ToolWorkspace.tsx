import { ArrowLeft, Star } from 'lucide-react';
import type { ToolDefinition, ToolId } from '../lib/registry';
import { CodecTool } from './CodecTool';
import { HashTool, ImageTool, RenameTool } from './FileTools';
import { JsonTool } from './JsonTool';

interface ToolWorkspaceProps {
  tool: ToolDefinition;
  isFavorite: boolean;
  onBack: () => void;
  onToggleFavorite: (id: ToolId) => void;
}

export function ToolWorkspace({ tool, isFavorite, onBack, onToggleFavorite }: ToolWorkspaceProps) {
  const content = {
    json: <JsonTool />,
    base64: <CodecTool />,
    hash: <HashTool />,
    rename: <RenameTool />,
    image: <ImageTool />,
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
