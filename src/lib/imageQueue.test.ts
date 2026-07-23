import { describe, expect, it } from 'vitest';
import type { ImageJobResult } from './native';
import {
  addImageQueueItems,
  clearImageQueue,
  completeImageQueueItem,
  createImageQueue,
  failImageQueueItem,
  MAX_IMAGE_QUEUE_ITEMS,
  removeImageQueueItem,
  requestImageQueueStop,
  startNextImageQueueItem,
  summarizeImageQueue,
} from './imageQueue';

const imageResult: ImageJobResult = {
  outputPath: 'C:\\output\\first-processed.jpg',
  inputBytes: 1_000,
  outputBytes: 600,
  width: 800,
  height: 600,
};

describe('image batch queue', () => {
  it('deduplicates selected Windows paths without changing their original display value', () => {
    const initial = createImageQueue(['C:\\Images\\First.jpg', 'c:/images/first.jpg', 'C:\\Images\\Second.png']);
    const next = addImageQueueItems(initial, ['C:/IMAGES/SECOND.PNG', 'C:\\Images\\Third.webp']);

    expect(next.items.map((item) => item.inputPath)).toEqual([
      'C:\\Images\\First.jpg',
      'C:\\Images\\Second.png',
      'C:\\Images\\Third.webp',
    ]);
    expect(next.items.map((item) => item.fileName)).toEqual(['First.jpg', 'Second.png', 'Third.webp']);
  });

  it('removes one selected item and clears the remaining selection', () => {
    const initial = createImageQueue(['C:\\Images\\First.jpg', 'C:\\Images\\Second.png']);
    const removed = removeImageQueueItem(initial, 'c:/images/first.jpg');

    expect(removed.items.map((item) => item.fileName)).toEqual(['Second.png']);
    expect(clearImageQueue(removed)).toEqual({ items: [], stopRequested: false });
  });

  it('moves items through processing, success and error states sequentially', () => {
    const initial = createImageQueue(['C:\\Images\\First.jpg', 'C:\\Images\\Second.png']);
    const first = startNextImageQueueItem(initial);
    const whileBusy = startNextImageQueueItem(first.state);
    const firstDone = completeImageQueueItem(first.state, first.item!.id, imageResult);
    const second = startNextImageQueueItem(firstDone);
    const finished = failImageQueueItem(second.state, second.item!.id, '图片格式不受支持');

    expect(initial.items.map((item) => item.status)).toEqual(['pending', 'pending']);
    expect(whileBusy.item).toBeNull();
    expect(finished.items.map((item) => item.status)).toEqual(['success', 'error']);
    expect(finished.items[0].result).toEqual(imageResult);
    expect(finished.items[1].error).toBe('图片格式不受支持');
  });

  it('finishes the active item but does not start another after stop is requested', () => {
    const started = startNextImageQueueItem(createImageQueue([
      'C:\\Images\\First.jpg',
      'C:\\Images\\Second.png',
    ]));
    const stopping = requestImageQueueStop(started.state);
    const currentDone = completeImageQueueItem(stopping, started.item!.id, imageResult);
    const next = startNextImageQueueItem(currentDone);

    expect(next.item).toBeNull();
    expect(next.state.items.map((item) => item.status)).toEqual(['success', 'pending']);
  });

  it('summarizes completed, remaining and stopped work', () => {
    const started = startNextImageQueueItem(createImageQueue([
      'C:\\Images\\First.jpg',
      'C:\\Images\\Second.png',
      'C:\\Images\\Third.webp',
    ]));
    const firstDone = completeImageQueueItem(started.state, started.item!.id, imageResult);
    const stopped = requestImageQueueStop(firstDone);

    expect(summarizeImageQueue(stopped)).toEqual({
      total: 3,
      pending: 2,
      processing: 0,
      success: 1,
      error: 0,
      completed: 1,
      remaining: 2,
      stopRequested: true,
      isStopped: true,
      isComplete: false,
    });
  });

  it('enforces the batch limit after path-normalized duplicate removal', () => {
    const paths = Array.from({ length: MAX_IMAGE_QUEUE_ITEMS - 1 }, (_, index) => `C:\\Images\\${index}.png`);
    const queue = addImageQueueItems(createImageQueue(paths), [
      'c:/images/0.PNG',
      'C:\\Images\\last.png',
      'C:\\Images\\overflow.png',
    ]);

    expect(queue.items).toHaveLength(MAX_IMAGE_QUEUE_ITEMS);
    expect(queue.items.at(-1)?.fileName).toBe('last.png');
  });

  it('marks a fully settled queue as complete', () => {
    const started = startNextImageQueueItem(createImageQueue(['C:\\Images\\Only.png']));
    const completed = completeImageQueueItem(started.state, started.item!.id, imageResult);

    expect(summarizeImageQueue(completed).isComplete).toBe(true);
  });
});
