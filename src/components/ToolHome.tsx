import { Clock3, ShieldCheck, Star } from 'lucide-react';
import { TOOL_BY_ID, type ToolDefinition, type ToolId } from '../lib/registry';
import { ToolIconGlyph } from './Icon';

interface ToolHomeProps {
  title: string;
  description: string;
  emptyMessage: string;
  tools: ToolDefinition[];
  recent: ToolId[];
  favorites: ToolId[];
  homeMascotVideoSrc?: string;
  emptyStateMascotVideoSrc?: string;
  reducedMotion: boolean;
  onOpenTool: (id: ToolId) => void;
  onToggleFavorite: (id: ToolId) => void;
}

export function ToolHome({ title, description, emptyMessage, tools, recent, favorites, homeMascotVideoSrc, emptyStateMascotVideoSrc, reducedMotion, onOpenTool, onToggleFavorite }: ToolHomeProps) {
  const visibleRecents = recent.map((id) => TOOL_BY_ID.get(id)).filter((tool): tool is ToolDefinition => Boolean(tool)).slice(0, 7);
  return (
    <section className="home-view">
      <header className={homeMascotVideoSrc ? 'home-header has-mascot-video' : 'home-header'}>
        <div className="home-hero-copy">
          <span className="section-kicker">OMNIKIT · 本地工具箱</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {homeMascotVideoSrc && <video className="home-mascot-video" src={homeMascotVideoSrc} autoPlay={!reducedMotion} loop muted playsInline preload="metadata" disablePictureInPicture controlsList="nodownload noremoteplayback" aria-hidden="true" tabIndex={-1} draggable={false} onContextMenu={(event) => event.preventDefault()} />}
        <div className="local-status" aria-label="本机处理状态">
          <span className="status-dot" />
          <div><strong>本机处理</strong><small>数据不离开设备</small></div>
        </div>
      </header>

      <div className="home-layout">
        <section className="tool-catalog" aria-label="工具列表">
          <div className="section-heading">
            <div><h2>工具</h2><p>{tools.length} 个可用工具</p></div>
          </div>
          <div className="tool-list">
          {tools.map((tool) => {
            const isFavorite = favorites.includes(tool.id);
            return (
              <article className="tool-row" data-tool={tool.id} key={tool.id}>
                <button className="tool-row-main" type="button" onClick={() => onOpenTool(tool.id)}>
                  <span className="tool-icon"><ToolIconGlyph name={tool.icon} /></span>
                  <span className="tool-copy"><small className="tool-category">{tool.category}</small><strong>{tool.name}</strong><small>{tool.description}</small></span>
                  <span className="tool-row-arrow" aria-hidden="true">›</span>
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
          {!tools.length && <div className={emptyStateMascotVideoSrc ? 'empty-state has-mascot-video' : 'empty-state'}>
            {emptyStateMascotVideoSrc && <video className="empty-state-mascot-video" src={emptyStateMascotVideoSrc} autoPlay={!reducedMotion} loop muted playsInline preload="metadata" disablePictureInPicture controlsList="nodownload noremoteplayback" aria-hidden="true" tabIndex={-1} draggable={false} onContextMenu={(event) => event.preventDefault()} />}
            <div className="empty-state-copy"><strong>{emptyMessage}</strong><span>试试更换分类，或清除搜索条件。</span></div>
          </div>}
          </div>
          <p className="privacy-note"><ShieldCheck size={19} /> 所有文本与文件仅在本机处理</p>
        </section>

        <aside className="recent-rail" aria-label="最近使用">
          <div className="rail-heading"><h2>最近使用</h2><Clock3 size={18} /></div>
          {visibleRecents.length ? visibleRecents.map((tool, index) => (
            <button className="recent-row" type="button" key={tool.id} onClick={() => onOpenTool(tool.id)}>
              <span className="recent-icon"><ToolIconGlyph name={tool.icon} size={18} /></span>
              <span>{tool.name}</span>
              <small>{index === 0 ? '刚刚' : `${index * 8} 分钟前`}</small>
            </button>
          )) : <div className="recent-empty"><strong>暂无记录</strong><p>打开工具后，会显示在这里。</p></div>}
        </aside>
      </div>
    </section>
  );
}
