import { describe, expect, it } from 'vitest';
import {
  CLIPBOARD_HISTORY_LIMIT,
  appendClipboardText,
  clearUnpinnedClipboardEntries,
  searchClipboardHistory,
  toggleClipboardPin,
  type ClipboardHistoryEntry,
} from './clipboardHistory';

const entry = (id: string, text: string, pinned = false): ClipboardHistoryEntry => ({ id, text, pinned, capturedAt: 1 });

describe('clipboard history', () => {
  it('ignores blank clipboard text and merges consecutive duplicates', () => {
    const initial = [entry('one', 'first')];
    expect(appendClipboardText(initial, '   ', 2)).toBe(initial);
    expect(appendClipboardText(initial, 'first', 3)).toEqual([{ ...initial[0], capturedAt: 3 }]);
  });

  it('keeps pinned entries when capping and clearing history', () => {
    const entries = [
      entry('pin', 'important', true),
      ...Array.from({ length: CLIPBOARD_HISTORY_LIMIT }, (_, index) => entry(String(index), 'item ' + index)),
    ];
    const capped = appendClipboardText(entries, 'new value', 2);
    expect(capped).toHaveLength(CLIPBOARD_HISTORY_LIMIT);
    expect(capped.some((item) => item.id === 'pin')).toBe(true);
    expect(clearUnpinnedClipboardEntries(capped)).toEqual([entry('pin', 'important', true)]);
  });

  it('searches text and toggles a pin without changing item order', () => {
    const entries = [entry('a', 'OmniKit release notes'), entry('b', 'https://example.com')];
    expect(searchClipboardHistory(entries, 'release')).toEqual([entries[0]]);
    expect(toggleClipboardPin(entries, 'b')).toEqual([entries[0], { ...entries[1], pinned: true }]);
  });
});
