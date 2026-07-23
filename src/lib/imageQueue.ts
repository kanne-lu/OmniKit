import type { ImageJobResult } from './native';

export const MAX_IMAGE_QUEUE_ITEMS = 50;

export type ImageQueueItemStatus = 'pending' | 'processing' | 'success' | 'error';

export interface ImageQueueItem {
  readonly id: string;
  readonly inputPath: string;
  readonly fileName: string;
  readonly status: ImageQueueItemStatus;
  readonly result: ImageJobResult | null;
  readonly error: string | null;
}

export interface ImageQueueState {
  readonly items: readonly ImageQueueItem[];
  readonly stopRequested: boolean;
}

export interface ImageQueueStartResult {
  readonly state: ImageQueueState;
  readonly item: ImageQueueItem | null;
}

export interface ImageQueueSummary {
  readonly total: number;
  readonly pending: number;
  readonly processing: number;
  readonly success: number;
  readonly error: number;
  readonly completed: number;
  readonly remaining: number;
  readonly stopRequested: boolean;
  readonly isStopped: boolean;
  readonly isComplete: boolean;
}

function queueItemId(inputPath: string): string {
  return inputPath.replaceAll('/', '\\').toLocaleLowerCase();
}

function fileNameFromPath(inputPath: string): string {
  return inputPath.split(/[\\/]/).at(-1) || inputPath;
}

function createQueueItem(inputPath: string): ImageQueueItem {
  return {
    id: queueItemId(inputPath),
    inputPath,
    fileName: fileNameFromPath(inputPath),
    status: 'pending',
    result: null,
    error: null,
  };
}

export function createImageQueue(inputPaths: readonly string[] = []): ImageQueueState {
  return addImageQueueItems({ items: [], stopRequested: false }, inputPaths);
}

export function addImageQueueItems(state: ImageQueueState, inputPaths: readonly string[]): ImageQueueState {
  const knownIds = new Set(state.items.map((item) => item.id));
  const additions: ImageQueueItem[] = [];

  inputPaths.forEach((inputPath) => {
    if (state.items.length + additions.length >= MAX_IMAGE_QUEUE_ITEMS) return;
    if (!inputPath.trim()) return;
    const item = createQueueItem(inputPath);
    if (knownIds.has(item.id)) return;
    knownIds.add(item.id);
    additions.push(item);
  });

  if (additions.length === 0) return state;
  return { ...state, items: [...state.items, ...additions] };
}

export function removeImageQueueItem(state: ImageQueueState, idOrPath: string): ImageQueueState {
  const id = queueItemId(idOrPath);
  const items = state.items.filter((item) => item.id !== id);
  return items.length === state.items.length ? state : { ...state, items };
}

export function clearImageQueue(state: ImageQueueState): ImageQueueState {
  if (state.items.length === 0 && !state.stopRequested) return state;
  return { items: [], stopRequested: false };
}

export function startNextImageQueueItem(state: ImageQueueState): ImageQueueStartResult {
  if (state.stopRequested || state.items.some((item) => item.status === 'processing')) {
    return { state, item: null };
  }

  const nextIndex = state.items.findIndex((item) => item.status === 'pending');
  if (nextIndex === -1) return { state, item: null };

  const nextItem: ImageQueueItem = {
    ...state.items[nextIndex],
    status: 'processing',
    result: null,
    error: null,
  };
  const items = [...state.items];
  items[nextIndex] = nextItem;
  return { state: { ...state, items }, item: nextItem };
}

export function completeImageQueueItem(
  state: ImageQueueState,
  idOrPath: string,
  result: ImageJobResult,
): ImageQueueState {
  return settleImageQueueItem(state, idOrPath, {
    status: 'success',
    result,
    error: null,
  });
}

export function failImageQueueItem(state: ImageQueueState, idOrPath: string, error: string): ImageQueueState {
  return settleImageQueueItem(state, idOrPath, {
    status: 'error',
    result: null,
    error,
  });
}

function settleImageQueueItem(
  state: ImageQueueState,
  idOrPath: string,
  settled: Pick<ImageQueueItem, 'status' | 'result' | 'error'>,
): ImageQueueState {
  const id = queueItemId(idOrPath);
  const index = state.items.findIndex((item) => item.id === id && item.status === 'processing');
  if (index === -1) return state;

  const items = [...state.items];
  items[index] = { ...items[index], ...settled };
  return { ...state, items };
}

export function requestImageQueueStop(state: ImageQueueState): ImageQueueState {
  return state.stopRequested ? state : { ...state, stopRequested: true };
}

export function summarizeImageQueue(state: ImageQueueState): ImageQueueSummary {
  const counts = state.items.reduce(
    (summary, item) => ({ ...summary, [item.status]: summary[item.status] + 1 }),
    { pending: 0, processing: 0, success: 0, error: 0 },
  );
  const completed = counts.success + counts.error;
  const remaining = counts.pending + counts.processing;

  return {
    total: state.items.length,
    ...counts,
    completed,
    remaining,
    stopRequested: state.stopRequested,
    isStopped: state.stopRequested && counts.processing === 0,
    isComplete: state.items.length > 0 && remaining === 0,
  };
}
