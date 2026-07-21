import { isTauri } from '@tauri-apps/api/core';
import type { Update } from '@tauri-apps/plugin-updater';

export interface UpdateRuntime {
  check: () => Promise<Update | null>;
  relaunch: () => Promise<void>;
}

export async function getUpdateRuntime(): Promise<UpdateRuntime | null> {
  if (!isTauri()) return null;

  const [{ check }, { relaunch }] = await Promise.all([
    import('@tauri-apps/plugin-updater'),
    import('@tauri-apps/plugin-process'),
  ]);

  return { check, relaunch };
}

export async function checkForUpdate(runtime: UpdateRuntime): Promise<Update | null> {
  return runtime.check();
}

export async function installUpdate(runtime: UpdateRuntime, update: Update): Promise<void> {
  await update.downloadAndInstall();
  await runtime.relaunch();
}
