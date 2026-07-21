export const CLIPBOARD_HISTORY_LIMIT = 100;

export interface ClipboardHistoryEntry {
  id: string;
  text: string;
  capturedAt: number;
  pinned: boolean;
}

function createEntryId(capturedAt: number, text: string): string {
  return String(capturedAt) + '-' + text.slice(0, 16);
}

function capHistory(entries: ClipboardHistoryEntry[]): ClipboardHistoryEntry[] {
  const next = [...entries];
  while (next.length > CLIPBOARD_HISTORY_LIMIT) {
    const removableIndex = next.map((entry) => entry.pinned).lastIndexOf(false);
    if (removableIndex < 0) return next.slice(0, CLIPBOARD_HISTORY_LIMIT);
    next.splice(removableIndex, 1);
  }
  return next;
}

export function appendClipboardText(entries: ClipboardHistoryEntry[], value: string, capturedAt: number): ClipboardHistoryEntry[] {
  const text = value.trim();
  if (!text) return entries;

  const latest = entries[0];
  if (latest?.text === text) {
    return [{ ...latest, capturedAt }, ...entries.slice(1)];
  }

  return capHistory([{ id: createEntryId(capturedAt, text), text, capturedAt, pinned: false }, ...entries]);
}

export function removeClipboardEntry(entries: ClipboardHistoryEntry[], id: string): ClipboardHistoryEntry[] {
  return entries.filter((entry) => entry.id !== id);
}

export function toggleClipboardPin(entries: ClipboardHistoryEntry[], id: string): ClipboardHistoryEntry[] {
  return entries.map((entry) => entry.id === id ? { ...entry, pinned: !entry.pinned } : entry);
}

export function clearUnpinnedClipboardEntries(entries: ClipboardHistoryEntry[]): ClipboardHistoryEntry[] {
  return entries.filter((entry) => entry.pinned);
}

export function searchClipboardHistory(entries: ClipboardHistoryEntry[], query: string): ClipboardHistoryEntry[] {
  const normalized = query.trim().toLocaleLowerCase();
  return normalized ? entries.filter((entry) => entry.text.toLocaleLowerCase().includes(normalized)) : entries;
}

function isClipboardHistoryEntry(value: unknown): value is ClipboardHistoryEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<ClipboardHistoryEntry>;
  return typeof entry.id === 'string'
    && typeof entry.text === 'string'
    && typeof entry.capturedAt === 'number'
    && typeof entry.pinned === 'boolean';
}

export function loadClipboardHistory(value: string | null): ClipboardHistoryEntry[] {
  try {
    const parsed: unknown = JSON.parse(value ?? '[]');
    return Array.isArray(parsed) ? capHistory(parsed.filter(isClipboardHistoryEntry)) : [];
  } catch {
    return [];
  }
}
