/**
 * json/.portal-sync/data-version.json — bumped after every run that changed Weaviate, so the
 * frontend (lib/data-version.ts) can drop in-memory caches and use it in ETags.
 */
import { readFile } from 'node:fs/promises';
import { writeFileAtomic } from './state';
import type { DataVersion } from './types';

export async function readDataVersion(path: string): Promise<number> {
  try {
    const version = Number(JSON.parse(await readFile(path, 'utf-8'))?.version);
    return Number.isSafeInteger(version) && version >= 0 ? version : 0;
  } catch {
    return 0;
  }
}

/** Atomically write { version: previous + 1, updatedAt }. */
export async function bumpDataVersion(path: string, now = new Date()): Promise<DataVersion> {
  const next: DataVersion = { version: (await readDataVersion(path)) + 1, updatedAt: now.toISOString() };
  await writeFileAtomic(path, `${JSON.stringify(next)}\n`);
  return next;
}
