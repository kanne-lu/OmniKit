import {
  Clock3,
  Code2,
  Files,
  GraduationCap,
  Grid2X2,
  Image,
  Info,
  Settings2,
  Star,
  Text,
} from 'lucide-react';
import { BrandMark } from './BrandMark';
import { CATEGORIES, type Category } from '../lib/registry';

export type AppView = 'home' | 'recent' | 'favorites' | 'settings' | 'about';

interface SidebarProps {
  activeView: AppView;
  activeCategory: Category | 'all';
  onCategoryChange: (category: Category | 'all') => void;
  onNavigate: (view: AppView) => void;
}

const categoryIcons = {
  '图片工具': Image,
  '文本工具': Text,
  '文件工具': Files,
  '开发工具': Code2,
  '教育工具': GraduationCap,
} satisfies Record<Category, typeof Code2>;

export function Sidebar({ activeView, activeCategory, onCategoryChange, onNavigate }: SidebarProps) {
  const isHomeActive = activeView === 'home' && activeCategory === 'all';

  return (
    <aside className="sidebar">
      <button className="brand" type="button" onClick={() => onNavigate('home')} aria-label="返回 OmniKit 工作台">
        <BrandMark />
        <span className="brand-copy"><strong>OmniKit</strong><small>本地工具箱</small></span>
      </button>

      <nav className="sidebar-primary" aria-label="主导航">
        <span className="sidebar-section-label">工作区</span>
        <button className={isHomeActive ? 'nav-row is-active' : 'nav-row'} type="button" onClick={() => onCategoryChange('all')} aria-current={isHomeActive ? 'page' : undefined}>
          <Grid2X2 size={20} /> <span>全部</span>
        </button>
        <button className={activeView === 'recent' ? 'nav-row is-active' : 'nav-row'} type="button" onClick={() => onNavigate('recent')} aria-current={activeView === 'recent' ? 'page' : undefined}><Clock3 size={20} /> <span>最近使用</span></button>
        <button className={activeView === 'favorites' ? 'nav-row is-active' : 'nav-row'} type="button" onClick={() => onNavigate('favorites')} aria-current={activeView === 'favorites' ? 'page' : undefined}><Star size={20} /> <span>收藏</span></button>
      </nav>

      <div className="sidebar-divider" />
      <nav className="category-nav" aria-label="工具分类">
        <span className="sidebar-section-label">工具分类</span>
        {CATEGORIES.map((category) => {
          const Icon = categoryIcons[category];
          return (
            <button
              className={activeCategory === category ? 'nav-row category-row is-active' : 'nav-row category-row'}
              type="button"
              key={category}
              onClick={() => onCategoryChange(category)}
              aria-current={activeCategory === category ? 'page' : undefined}
            >
              <Icon size={20} /> <span>{category}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <span className="sidebar-section-label">应用</span>
        <button className={activeView === 'settings' ? 'nav-row is-active' : 'nav-row'} type="button" onClick={() => onNavigate('settings')} aria-current={activeView === 'settings' ? 'page' : undefined}><Settings2 size={20} /> <span>设置</span></button>
        <button className={activeView === 'about' ? 'nav-row is-active' : 'nav-row'} type="button" onClick={() => onNavigate('about')} aria-current={activeView === 'about' ? 'page' : undefined}><Info size={20} /> <span>关于</span></button>
        <div className="local-note"><span className="local-dot" /> 本机模式</div>
      </div>
    </aside>
  );
}
