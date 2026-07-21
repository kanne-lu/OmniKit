export const CATEGORIES = ['文本与编码', '文件处理', '图片处理', '开发工具'] as const;

export type Category = (typeof CATEGORIES)[number];
export type ToolId = 'json' | 'base64' | 'hash' | 'rename' | 'image';
export type ToolIcon = 'braces' | 'binary' | 'hash' | 'rename' | 'image';

export interface ToolDefinition {
  id: ToolId;
  name: string;
  description: string;
  category: Category;
  icon: ToolIcon;
  keywords: string[];
}

export const TOOL_REGISTRY: readonly ToolDefinition[] = [
  {
    id: 'json',
    name: 'JSON 格式化',
    description: '格式化、校验与压缩 JSON 数据',
    category: '文本与编码',
    icon: 'braces',
    keywords: ['json', '格式化', '校验', '压缩'],
  },
  {
    id: 'base64',
    name: 'Base64 编解码',
    description: '在文本、Base64 与 URL 编码之间转换',
    category: '文本与编码',
    icon: 'binary',
    keywords: ['base64', '编码', '解码', 'url'],
  },
  {
    id: 'hash',
    name: '文件哈希',
    description: '计算 MD5、SHA-1 与 SHA-256 校验值',
    category: '文件处理',
    icon: 'hash',
    keywords: ['hash', 'md5', 'sha1', 'sha256', '校验'],
  },
  {
    id: 'rename',
    name: '批量重命名',
    description: '预览新文件名，再输出保留原文件的副本',
    category: '文件处理',
    icon: 'rename',
    keywords: ['重命名', '批量', '文件'],
  },
  {
    id: 'image',
    name: '图片压缩',
    description: '压缩或转换 JPG、PNG 与 WebP 图片',
    category: '图片处理',
    icon: 'image',
    keywords: ['图片', '压缩', '转换', 'jpg', 'png', 'webp'],
  },
];

export const TOOL_BY_ID = new Map(TOOL_REGISTRY.map((tool) => [tool.id, tool]));

export function searchTools(query: string, category: Category | 'all'): ToolDefinition[] {
  const normalized = query.trim().toLocaleLowerCase();
  return TOOL_REGISTRY.filter((tool) => {
    const categoryMatches = category === 'all' || tool.category === category;
    const queryMatches = !normalized || [tool.name, tool.description, ...tool.keywords]
      .some((value) => value.toLocaleLowerCase().includes(normalized));
    return categoryMatches && queryMatches;
  });
}
