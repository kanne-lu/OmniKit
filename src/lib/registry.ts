export const CATEGORIES = ['图片工具', '文本工具', '文件工具', '开发工具', '教育工具'] as const;

export type Category = (typeof CATEGORIES)[number];
export type ToolId =
  | 'json'
  | 'base64'
  | 'clipboard'
  | 'hash'
  | 'rename'
  | 'image'
  | 'image-crop'
  | 'image-watermark'
  | 'image-stitch'
  | 'id-photo-background'
  | 'smart-cutout'
  | 'old-photo-restoration'
  | 'ai-upscale'
  | 'ocr'
  | 'copybook'
  | 'wordcount'
  | 'handwriting-removal';
export type ToolIcon =
  | 'braces'
  | 'binary'
  | 'clipboard'
  | 'hash'
  | 'rename'
  | 'image'
  | 'crop'
  | 'watermark'
  | 'stitch'
  | 'id-photo'
  | 'cutout'
  | 'restore'
  | 'upscale'
  | 'ocr'
  | 'copybook'
  | 'wordcount'
  | 'handwriting';

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
    name: '批量图片处理',
    description: '批量压缩、缩放或转换 JPG、PNG 与 WebP 图片',
    category: '图片工具',
    icon: 'image',
    keywords: ['图片', '批量', '压缩', '缩放', '转换', 'jpg', 'png', 'webp'],
  },
  {
    id: 'image-crop',
    name: '裁剪与旋转',
    description: '自由裁剪、按比例取景，并旋转或翻转图片',
    category: '图片工具',
    icon: 'crop',
    keywords: ['图片', '裁剪', '旋转', '翻转', '比例'],
  },
  {
    id: 'image-watermark',
    name: '图片加水印',
    description: '添加文字或图片水印，支持九宫格定位与平铺',
    category: '图片工具',
    icon: 'watermark',
    keywords: ['图片', '水印', '文字水印', '图片水印', '平铺'],
  },
  {
    id: 'image-stitch',
    name: '拼接与切图',
    description: '横向或纵向拼接图片，并支持定高与九宫格切图',
    category: '图片工具',
    icon: 'stitch',
    keywords: ['图片', '长图', '拼接', '切图', '九宫格'],
  },
  {
    id: 'id-photo-background',
    name: '证件照换底色',
    description: '使用配置的 AI 服务生成白、蓝、红或自定义纯色背景证件照',
    category: '图片工具',
    icon: 'id-photo',
    keywords: ['证件照', '换底色', '背景色', '人像', 'ai'],
  },
  {
    id: 'smart-cutout',
    name: '智能抠图',
    description: '使用配置的 AI 服务提取主体并输出透明背景 PNG',
    category: '图片工具',
    icon: 'cutout',
    keywords: ['抠图', '去背景', '透明背景', 'png', 'ai'],
  },
  {
    id: 'old-photo-restoration',
    name: '老照片修复',
    description: '保守修复划痕、灰尘、褪色和轻微模糊，不强制上色',
    category: '图片工具',
    icon: 'restore',
    keywords: ['老照片', '修复', '划痕', '降噪', 'ai'],
  },
  {
    id: 'ai-upscale',
    name: '图片放大增强',
    description: '使用 AI 超分辨率将图片放大 2 倍或 4 倍',
    category: '图片工具',
    icon: 'upscale',
    keywords: ['图片放大', '增强', '超分辨率', '2倍', '4倍', 'ai'],
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
