import {
  Clock3,
  Code2,
  FileText,
  Grid2X2,
  Image,
  Info,
  Settings2,
  Star,
} from 'lucide-react';
import { CATEGORIES, type Category } from '../lib/registry';

interface SidebarProps {
  activeCategory: Category | 'all';
  onCategoryChange: (category: Category | 'all') => void;
  onHome: () => void;
}

const categoryIcons = {
  '文本与编码': Code2,
  '文件处理': FileText,
  '图片处理': Image,
  '开发工具': Code2,
} satisfies Record<Category, typeof Code2>;

export function Sidebar({ activeCategory, onCategoryChange, onHome }: SidebarProps) {
  return (
    <aside className="sidebar">
      <button className="brand" type="button" onClick={onHome} aria-label="返回 OmniKit 工作台">
        <span className="brand-mark" aria-hidden="true"><span /></span>
        <span>OmniKit</span>
      </button>

      <nav className="sidebar-primary" aria-label="主导航">
        <button className={activeCategory === 'all' ? 'nav-row is-active' : 'nav-row'} type="button" onClick={() => onCategoryChange('all')}>
          <Grid2X2 size={20} /> <span>工作台</span>
        </button>
        <button className="nav-row" type="button" onClick={onHome}><Clock3 size={20} /> <span>最近使用</span></button>
        <button className="nav-row" type="button" onClick={onHome}><Star size={20} /> <span>收藏</span></button>
      </nav>

      <div className="sidebar-divider" />
      <nav className="category-nav" aria-label="工具分类">
        {CATEGORIES.map((category) => {
          const Icon = categoryIcons[category];
          return (
            <button
              className={activeCategory === category ? 'nav-row is-active' : 'nav-row'}
              type="button"
              key={category}
              onClick={() => onCategoryChange(category)}
            >
              <Icon size={20} /> <span>{category}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <button className="nav-row" type="button"><Settings2 size={20} /> <span>设置</span></button>
        <button className="nav-row" type="button"><Info size={20} /> <span>关于</span></button>
        <div className="local-note"><span className="local-dot" /> 本机模式</div>
      </div>
    </aside>
  );
}
