import { describe, expect, it } from 'vitest';
import { buildCopybookCells, countText, extractHanCharacters } from './education';

describe('education utilities', () => {
  it('keeps only Han characters for copybook preparation', () => {
    expect(extractHanCharacters('春天! OmniKit 2026')).toEqual({
      characters: ['春', '天'],
      discarded: 14,
    });
  });

  it('gives each copybook character two following practice cells', () => {
    expect(buildCopybookCells(['春', '天'], 6)).toEqual(['春', '', '', '天', '', '']);
    expect(buildCopybookCells(['春', '天'], 4)).toEqual(['春', '', '', '天']);
  });

  it('counts meaningful characters without spaces or line breaks', () => {
    expect(countText('你好， OmniKit!\nHello world')).toEqual({
      totalCharacters: 21,
      hanCharacters: 2,
      englishWords: 3,
      lines: 2,
    });
  });

  it('returns zero values for an empty input', () => {
    expect(countText('')).toEqual({ totalCharacters: 0, hanCharacters: 0, englishWords: 0, lines: 0 });
  });
});
