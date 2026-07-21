import { ArrowUpRight, Clock3, Command, ShieldCheck, Sparkles, Star } from 'lucide-react';
import { TOOL_BY_ID, type ToolDefinition, type ToolId } from '../lib/registry';
import { ToolIconGlyph } from './Icon';

interface ToolHomeProps {
  title: string;
  description: string;
  emptyMessage: string;
  tools: ToolDefinition[];
  recent: ToolId[];
  favorites: ToolId[];
  onOpenTool: (id: ToolId) => void;
  onToggleFavorite: (id: ToolId) => void;
}

export function ToolHome({ title, description, emptyMessage, tools, recent, favorites, onOpenTool, onToggleFavorite }: ToolHomeProps) {
  const visibleRecents = recent.map((id) => TOOL_BY_ID.get(id)).filter((tool): tool is ToolDefinition => Boolean(tool)).slice(0, 7);
  return (
    <section className="home-view">
      <header className="home-hero">
        <div className="hero-copy">
          <span className="eyebrow"><Sparkles size={15} /> OmniKit 工作台</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className="hero-status" aria-label="本机处理状态">
          <span className="status-dot" />
          <div><strong>本机处理</strong><small>数据不会离开你的设备</small></div>
          <span className="tool-count">{tools.length} 个工具</span>
        </div>
      </header>

      <div className="home-layout">
        <section className="tool-catalog" aria-label="工具列表">
          <div className="section-heading">
            <div><span>工具箱</span><h2>选择一个工具开始</h2></div>
            <p><Command size={16} /> 使用顶部搜索快速定位</p>
          </div>
          <div className="tool-list">
          {tools.map((tool) => {
            const isFavorite = favorites.includes(tool.id);
            return (
              <article className="tool-row" data-tool={tool.id} key={tool.id}>
                <button className="tool-row-main" type="button" onClick={() => onOpenTool(tool.id)}>
                  <span className="tool-icon"><ToolIconGlyph name={tool.icon} /></span>
                  <span className="tool-copy"><strong>{tool.name}</strong><small>{tool.description}</small><em>打开工具 <ArrowUpRight size={15} /></em></span>
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
          {!tools.length && <div className="empty-state"><Sparkles size={22} /><strong>{emptyMessage}</strong><span>试试更换分类，或清除搜索条件。</span></div>}
          </div>
          <p className="privacy-note"><ShieldCheck size={19} /> 所有文本与文件仅在本机处理</p>
        </section>

        <aside className="recent-rail" aria-label="最近使用">
          <div className="rail-heading"><div><span>继续工作</span><h2>最近使用</h2></div><Clock3 size={19} /></div>
          {visibleRecents.length ? visibleRecents.map((tool, index) => (
            <button className="recent-row" type="button" key={tool.id} onClick={() => onOpenTool(tool.id)}>
              <span className="recent-icon"><ToolIconGlyph name={tool.icon} size={18} /></span>
              <span>{tool.name}</span>
              <small>{index === 0 ? '刚刚' : `${index * 8} 分钟前`}</small>
            </button>
          )) : <div className="recent-empty"><span className="recent-empty-icon"><Clock3 size={20} /></span><strong>还没有使用记录</strong><p>选择一个工具后，它会出现在这里，方便下次继续。</p></div>}
        </aside>
      </div>
    </section>
  );
}
