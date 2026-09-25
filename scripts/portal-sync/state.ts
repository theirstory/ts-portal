import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { LocalState } from './types';

export function emptyState(): LocalState {
  return { stateVersion: 1, items: {} };
}

export async function loadState(path: string): Promise<LocalState> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf-8');
  } catch (error: any) {
    if (error?.code === 'ENOENT') return emptyState();
    throw error;
  }
  // A corrupt state file must not silently become "empty" (that would re-process everything and
  // never remove stale items) — fail loudly instead.
  const parsed = JSON.parse(raw) as LocalState;
  if (!parsed || typeof parsed !== 'object' || typeof parsed.items !== 'object' || parsed.items === null) {
    throw new Error(`State file ${path} is malformed`);
  }
  return { ...emptyState(), ...parsed };
}

/** Atomic write: write a temp file in the same directory, then rename over the target. */
export async function writeFileAtomic(path: string, contents: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, contents, 'utf-8');
  await rename(tmp, path);
}

export async function saveState(path: string, state: LocalState): Promise<void> {
  await writeFileAtomic(path, `${JSON.stringify(state, null, 2)}\n`);
}
