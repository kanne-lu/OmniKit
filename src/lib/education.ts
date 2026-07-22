export type CopybookTemplate = 'tian' | 'mi' | 'line';

export interface CopybookPreset {
  id: string;
  label: string;
  value: string;
}

export interface TextStatistics {
  totalCharacters: number;
  hanCharacters: number;
  englishWords: number;
  lines: number;
}

const HAN_CHARACTER = /^\p{Script=Han}$/u;
const WHITESPACE = /^\s$/u;
const ENGLISH_WORD = /[A-Za-z]+(?:'[A-Za-z]+)?/g;

export const COPYBOOK_PRESETS: readonly CopybookPreset[] = [
  { id: 'grade-1', label: '基础笔画', value: '一二三十木禾上下土个八入大天人火文六七儿九无口日中' },
  { id: 'grade-2', label: '常用汉字', value: '春夏秋冬风雨山水花草校园老师同学读书写字' },
  { id: 'grade-3', label: '成语练习', value: '专心致志脚踏实地温故知新积少成多自强不息' },
];

export function extractHanCharacters(value: string): { characters: string[]; discarded: number } {
  const input = Array.from(value);
  const characters = input.filter((character) => HAN_CHARACTER.test(character));
  return { characters, discarded: input.length - characters.length };
}

export function buildCopybookCells(characters: readonly string[], limit = 48): string[] {
  const cells: string[] = [];
  for (const character of characters) {
    if (cells.length >= limit) break;
    cells.push(character);
    if (cells.length < limit) cells.push('');
    if (cells.length < limit) cells.push('');
  }
  return cells;
}

export function countText(value: string): TextStatistics {
  const characters = Array.from(value);
  const meaningful = characters.filter((character) => !WHITESPACE.test(character));
  return {
    totalCharacters: meaningful.length,
    hanCharacters: meaningful.filter((character) => HAN_CHARACTER.test(character)).length,
    englishWords: value.match(ENGLISH_WORD)?.length ?? 0,
    lines: value ? value.split(/\r?\n/).length : 0,
  };
}
