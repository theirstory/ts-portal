/**
 * Server-side: the portal's data version, bumped by the portal-sync service after every run that
 * changed Weaviate (json/.portal-sync/data-version.json, see docs/PORTAL_SYNC.md).
 *
 * Use it to key in-memory caches and in ETags so a sync is visible within a few seconds.
 * Returns "0" when the file doesn't exist (sync not set up, or nothing synced yet).
 */
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const CHECK_INTERVAL_MS = 2_000;

type Memo = { value: string; checkedAt: number; stamp: string };

// One memo per process, even if this module is bundled into several route chunks.
const globalMemo = globalThis as typeof globalThis & { __portalDataVersion?: Memo };

export function dataVersionFile(): string {
  return resolve(process.env.PORTAL_SYNC_DATA_VERSION_FILE || './json/.portal-sync/data-version.json');
}

function readVersion(file: string): string {
  const raw = readFileSync(file, 'utf-8');
  const version = Number(JSON.parse(raw)?.version);
  if (!Number.isSafeInteger(version) || version < 0) throw new Error('invalid data version');
  return String(version);
}

export function getDataVersion(): string {
  const now = Date.now();
  const memo = globalMemo.__portalDataVersion;
  if (memo && now - memo.checkedAt < CHECK_INTERVAL_MS) return memo.value;

  const file = dataVersionFile();
  let value = '0';
  let stamp = 'missing';
  try {
    const stat = statSync(file);
    stamp = `${stat.mtimeMs}:${stat.size}`;
    if (memo && memo.stamp === stamp) {
      value = memo.value;
    } else {
      try {
        value = readVersion(file);
      } catch {
        // Unreadable / mid-write (the writer renames atomically, so this is rare): fall back to
        // the file's mtime so a change still invalidates caches.
        value = `m${Math.floor(stat.mtimeMs)}`;
      }
    }
  } catch {
    // Missing file (or directory not mounted): "0".
  }
  globalMemo.__portalDataVersion = { value, checkedAt: now, stamp };
  return value;
}
