export const CATEGORIES = ['图片工具', '文本工具', '文件工具', '开发工具', '教育工具'] as const;

export type Category = (typeof CATEGORIES)[number];
export type ToolId = 'json' | 'base64' | 'clipboard' | 'hash' | 'rename' | 'image' | 'ocr' | 'copybook' | 'wordcount' | 'handwriting-removal';
export type ToolIcon = 'braces' | 'binary' | 'clipboard' | 'hash' | 'rename' | 'image' | 'ocr' | 'copybook' | 'wordcount' | 'handwriting';

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
    category: '开发工具',
    icon: 'braces',
    keywords: ['json', '格式化', '校验', '压缩'],
  },
  {
    id: 'base64',
    name: 'Base64 编解码',
    description: '在文本、Base64 与 URL 编码之间转换',
    category: '开发工具',
    icon: 'binary',
    keywords: ['base64', '编码', '解码', 'url'],
  },
  {
    id: 'clipboard',
    name: '剪贴板历史',
    description: '查找、置顶并再次复制最近的文本与链接',
    category: '文本工具',
    icon: 'clipboard',
    keywords: ['剪贴板', '复制', '历史', '文本', '链接'],
  },
  {
    id: 'hash',
    name: '文件哈希',
    description: '计算 MD5、SHA-1 与 SHA-256 校验值',
    category: '文件工具',
    icon: 'hash',
    keywords: ['hash', 'md5', 'sha1', 'sha256', '校验'],
  },
  {
    id: 'rename',
    name: '批量重命名',
    description: '预览新文件名，再输出保留原文件的副本',
    category: '文件工具',
    icon: 'rename',
    keywords: ['重命名', '批量', '文件'],
  },
  {
    id: 'image',
    name: '图片压缩',
    description: '压缩或转换 JPG、PNG 与 WebP 图片',
    category: '图片工具',
    icon: 'image',
    keywords: ['图片', '压缩', '转换', 'jpg', 'png', 'webp'],
  },
  {
    id: 'ocr',
    name: '截图识字',
    description: '识别截图或本地图片中的中文、英文文字',
    category: '图片工具',
    icon: 'ocr',
    keywords: ['ocr', '截图', '识字', '文字识别', '图片文字'],
  },
  {
    id: 'copybook',
    name: '手写字帖生成',
    description: '输入汉字，生成可打印的练字格纸',
    category: '教育工具',
    icon: 'copybook',
    keywords: ['字帖', '练字', '书写', '田字格', '米字格'],
  },
  {
    id: 'wordcount',
    name: '字数计算',
    description: '统计文本总字数、汉字与英文单词',
    category: '教育工具',
    icon: 'wordcount',
    keywords: ['字数', '统计', '汉字', '单词', '字符'],
  },
  {
    id: 'handwriting-removal',
    name: 'AI 去手写',
    description: '使用你配置的 AI 服务清理手写批注',
    category: '教育工具',
    icon: 'handwriting',
    keywords: ['去手写', '手写擦除', '试卷', '批注', 'ai'],
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
