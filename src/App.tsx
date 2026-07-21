import { useEffect, useMemo, useState } from 'react';
import { AboutPanel, SettingsPanel } from './components/AppPanels';
import { Sidebar, type AppView } from './components/Sidebar';
import { ToolHome } from './components/ToolHome';
import { ToolWorkspace } from './components/ToolWorkspace';
import { Topbar } from './components/Topbar';
import { searchTools, TOOL_BY_ID, type Category, type ToolId } from './lib/registry';

const STORAGE_PREFIX = 'omnikit.v1.';

function loadToolList(key: string): ToolId[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}${key}`) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((value): value is ToolId => typeof value === 'string' && TOOL_BY_ID.has(value as ToolId)) : [];
  } catch {
    return [];
  }
}

export default function App() {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<Category | 'all'>('all');
  const [activeView, setActiveView] = useState<AppView>('home');
  const [activeToolId, setActiveToolId] = useState<ToolId | null>(null);
  const [recent, setRecent] = useState<ToolId[]>(() => loadToolList('recent'));
  const [favorites, setFavorites] = useState<ToolId[]>(() => loadToolList('favorites'));
  const [reducedMotion, setReducedMotion] = useState(() => localStorage.getItem(`${STORAGE_PREFIX}reduced-motion`) === 'true');

  const recentTools = useMemo(() => recent.map((id) => TOOL_BY_ID.get(id)).filter((tool): tool is NonNullable<typeof tool> => Boolean(tool)), [recent]);
  const favoriteTools = useMemo(() => favorites.map((id) => TOOL_BY_ID.get(id)).filter((tool): tool is NonNullable<typeof tool> => Boolean(tool)), [favorites]);
  const visibleTools = useMemo(() => {
    const matchingTools = searchTools(query, activeCategory);
    if (activeView === 'recent') return recentTools.filter((tool) => matchingTools.some((match) => match.id === tool.id));
    if (activeView === 'favorites') return favoriteTools.filter((tool) => matchingTools.some((match) => match.id === tool.id));
    return matchingTools;
  }, [activeCategory, activeView, favoriteTools, query, recentTools]);
  const activeTool = activeToolId ? TOOL_BY_ID.get(activeToolId) : undefined;

  useEffect(() => { localStorage.setItem(`${STORAGE_PREFIX}recent`, JSON.stringify(recent)); }, [recent]);
  useEffect(() => { localStorage.setItem(`${STORAGE_PREFIX}favorites`, JSON.stringify(favorites)); }, [favorites]);
  useEffect(() => { localStorage.setItem(`${STORAGE_PREFIX}reduced-motion`, String(reducedMotion)); }, [reducedMotion]);

  const openTool = (id: ToolId) => {
    setActiveToolId(id);
    setActiveView('home');
    setRecent((current) => [id, ...current.filter((item) => item !== id)].slice(0, 9));
  };
  const showHome = () => { setActiveToolId(null); setActiveView('home'); setActiveCategory('all'); setQuery(''); };
  const navigate = (view: AppView) => { setActiveToolId(null); setActiveView(view); setQuery(''); if (view !== 'home') setActiveCategory('all'); };
  const setCategory = (category: Category | 'all') => { setActiveCategory(category); setActiveToolId(null); setActiveView('home'); };
  const toggleFavorite = (id: ToolId) => setFavorites((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const screenCopy = activeView === 'recent'
    ? { title: '继续上次的工作', description: '最近打开过的工具会按时间排列在这里。', emptyMessage: '最近使用还是空的' }
    : activeView === 'favorites'
      ? { title: '你收藏的工具', description: '把常用工具固定在这里，下一次可以直接进入。', emptyMessage: '还没有收藏工具' }
      : { title: '从一个小任务开始', description: '不上传、不等待。选择一个工具，马上在本机完成处理。', emptyMessage: '没有找到匹配的工具' };

  return (
    <main className={reducedMotion ? 'app-shell reduced-motion' : 'app-shell'}>
      <Sidebar activeView={activeView} activeCategory={activeCategory} onCategoryChange={setCategory} onNavigate={navigate} />
      <section className={activeTool ? 'app-main is-workspace' : 'app-main'}>
        <Topbar compact={Boolean(activeTool)} query={query} onQueryChange={(value) => { setQuery(value); setActiveToolId(null); setActiveView('home'); }} />
        <div className="app-content">
          {activeTool ? <ToolWorkspace tool={activeTool} isFavorite={favorites.includes(activeTool.id)} onBack={showHome} onToggleFavorite={toggleFavorite} /> : activeView === 'settings' ? <SettingsPanel recentCount={recent.length} favoriteCount={favorites.length} reducedMotion={reducedMotion} onReducedMotionChange={setReducedMotion} onClearRecent={() => setRecent([])} onClearFavorites={() => setFavorites([])} /> : activeView === 'about' ? <AboutPanel /> : <ToolHome {...screenCopy} tools={visibleTools} recent={recent} favorites={favorites} onOpenTool={openTool} onToggleFavorite={toggleFavorite} />}
        </div>
      </section>
    </main>
  );
}
