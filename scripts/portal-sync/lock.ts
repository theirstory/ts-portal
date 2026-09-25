import { unlinkSync } from 'node:fs';
import { mkdir, open, readFile, stat, unlink, utimes } from 'node:fs/promises';
import { dirname } from 'node:path';
import { hostname } from 'node:os';

/** A lock whose mtime is older than this is considered abandoned (holder crashed). */
const STALE_MS = 2 * 60_000;
const HEARTBEAT_MS = 20_000;

export type Lock = { release: () => Promise<void> };

const held = new Set<string>();

/** Best-effort synchronous release on process shutdown (SIGTERM from `docker compose stop`). */
export function releaseHeldLocksSync(): void {
  for (const path of held) {
    try {
      unlinkSync(path);
    } catch {
      // already gone
    }
  }
  held.clear();
}

/**
 * Cross-process run lock (service vs. a manual `--once`, which share the state file).
 * Kept alive by a heartbeat that touches the file; a crashed holder's lock goes stale in 2 minutes.
 * Returns null when another live process holds it.
 */
export async function acquireLock(path: string): Promise<Lock | null> {
  await mkdir(dirname(path), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(path, 'wx');
      await handle.writeFile(JSON.stringify({ pid: process.pid, host: hostname(), at: new Date().toISOString() }));
      await handle.close();
      const heartbeat = setInterval(() => {
        const now = new Date();
        utimes(path, now, now).catch(() => {});
      }, HEARTBEAT_MS);
      heartbeat.unref();
      held.add(path);
      return {
        release: async () => {
          clearInterval(heartbeat);
          held.delete(path);
          await unlink(path).catch(() => {});
        },
      };
    } catch (error: any) {
      if (error?.code !== 'EEXIST') throw error;
      const info = await stat(path).catch(() => null);
      if (info && Date.now() - info.mtimeMs < STALE_MS) return null;
      // Stale: remove and retry once.
      await unlink(path).catch(() => {});
    }
  }
  return null;
}

export async function describeLock(path: string): Promise<string> {
  return readFile(path, 'utf-8').catch(() => 'unknown holder');
}
