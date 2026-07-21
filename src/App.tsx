import { useEffect, useMemo, useState } from 'react';
import { Sidebar } from './components/Sidebar';
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
  const [activeToolId, setActiveToolId] = useState<ToolId | null>(null);
  const [recent, setRecent] = useState<ToolId[]>(() => loadToolList('recent'));
  const [favorites, setFavorites] = useState<ToolId[]>(() => loadToolList('favorites'));

  const recentTools = recent;
  const visibleTools = useMemo(() => searchTools(query, activeCategory), [query, activeCategory]);
  const activeTool = activeToolId ? TOOL_BY_ID.get(activeToolId) : undefined;

  useEffect(() => { localStorage.setItem(`${STORAGE_PREFIX}recent`, JSON.stringify(recentTools)); }, [recentTools]);
  useEffect(() => { localStorage.setItem(`${STORAGE_PREFIX}favorites`, JSON.stringify(favorites)); }, [favorites]);

  const openTool = (id: ToolId) => {
    setActiveToolId(id);
    setRecent((current) => [id, ...current.filter((item) => item !== id)].slice(0, 9));
  };
  const showHome = () => { setActiveToolId(null); setQuery(''); };
  const setCategory = (category: Category | 'all') => { setActiveCategory(category); setActiveToolId(null); };
  const toggleFavorite = (id: ToolId) => setFavorites((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  return (
    <main className="app-shell">
      <Sidebar activeCategory={activeCategory} onCategoryChange={setCategory} onHome={showHome} />
      <section className={activeTool ? 'app-main is-workspace' : 'app-main'}>
        <Topbar compact={Boolean(activeTool)} query={query} onQueryChange={(value) => { setQuery(value); setActiveToolId(null); }} />
        <div className="app-content">
          {activeTool ? <ToolWorkspace tool={activeTool} isFavorite={favorites.includes(activeTool.id)} onBack={showHome} onToggleFavorite={toggleFavorite} /> : <ToolHome tools={visibleTools} recent={recentTools} favorites={favorites} onOpenTool={openTool} onToggleFavorite={toggleFavorite} />}
        </div>
      </section>
    </main>
  );
}
