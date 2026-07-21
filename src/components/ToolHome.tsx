import { ChevronRight, Clock3, ShieldCheck, Star } from 'lucide-react';
import { TOOL_BY_ID, type ToolDefinition, type ToolId } from '../lib/registry';
import { ToolIconGlyph } from './Icon';

interface ToolHomeProps {
  tools: ToolDefinition[];
  recent: ToolId[];
  favorites: ToolId[];
  onOpenTool: (id: ToolId) => void;
  onToggleFavorite: (id: ToolId) => void;
}

export function ToolHome({ tools, recent, favorites, onOpenTool, onToggleFavorite }: ToolHomeProps) {
  const visibleRecents = recent.map((id) => TOOL_BY_ID.get(id)).filter((tool): tool is ToolDefinition => Boolean(tool)).slice(0, 7);
  return (
    <section className="home-view">
      <div className="home-heading">
        <div>
          <h1>开始处理</h1>
          <p>从一个工具开始，所有内容仅在你的电脑上处理。</p>
        </div>
      </div>

      <div className="home-layout">
        <div className="tool-list" aria-label="工具列表">
          {tools.map((tool) => {
            const isFavorite = favorites.includes(tool.id);
            return (
              <article className="tool-row" key={tool.id}>
                <button className="tool-row-main" type="button" onClick={() => onOpenTool(tool.id)}>
                  <span className="tool-icon"><ToolIconGlyph name={tool.icon} /></span>
                  <span className="tool-copy"><strong>{tool.name}</strong><small>{tool.description}</small></span>
                  <ChevronRight className="tool-chevron" size={24} />
                </button>
                <button
                  className={isFavorite ? 'favorite-button is-favorite' : 'favorite-button'}
                  type="button"
                  onClick={() => onToggleFavorite(tool.id)}
                  aria-label={isFavorite ? `取消收藏 ${tool.name}` : `收藏 ${tool.name}`}
                >
                  <Star size={18} fill={isFavorite ? 'currentColor' : 'none'} />
                </button>
              </article>
            );
          })}
          {!tools.length && <div className="empty-state">没有找到匹配的工具。</div>}
          <p className="privacy-note"><ShieldCheck size={21} /> 所有内容仅在本机处理</p>
        </div>

        <aside className="recent-rail">
          <div className="rail-heading"><h2>最近使用</h2><Clock3 size={19} /></div>
          {visibleRecents.length ? visibleRecents.map((tool, index) => (
            <button className="recent-row" type="button" key={tool.id} onClick={() => onOpenTool(tool.id)}>
              <span className="recent-icon"><ToolIconGlyph name={tool.icon} size={18} /></span>
              <span>{tool.name}</span>
              <small>{index === 0 ? '刚刚' : `${index * 8} 分钟前`}</small>
            </button>
          )) : <p className="recent-empty">打开一个工具后，最近使用会显示在这里。</p>}
        </aside>
      </div>
    </section>
  );
}
