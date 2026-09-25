/**
 * Inventory (Portal Sync Protocol 1, additive): after each run, report every Testimony in Weaviate
 * to the publisher so it can offer to adopt or remove recordings imported before sync was set up.
 * Sent only when the inventory changed since the last accepted report, or at least every 24 hours.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { ListedTestimony } from './backends';
import { formatError, log } from './log';
import { writeFileAtomic } from './state';
import type { InventoryCache, InventoryItem, InventoryReport, LocalState } from './types';

export const INVENTORY_RESEND_MS = 24 * 60 * 60 * 1000;
export const INVENTORY_SOFT_LIMIT = 20_000;

export type InventoryDeps = {
  weaviate: {
    waitUntilReady(): Promise<void>;
    listTestimonies(): Promise<ListedTestimony[]>;
    getTestimonyStoryId(uuid: string): Promise<string | null>;
  };
  publisher: { postInventory(report: InventoryReport): Promise<void> };
};

export function emptyInventoryCache(): InventoryCache {
  return { cacheVersion: 1, storyIds: {} };
}

export async function loadInventoryCache(path: string): Promise<InventoryCache> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf-8'));
    if (parsed && typeof parsed === 'object' && parsed.storyIds && typeof parsed.storyIds === 'object') {
      return { ...emptyInventoryCache(), ...parsed };
    }
  } catch {
    // missing or corrupt: a fresh cache only costs re-resolving story ids and one extra report
  }
  return emptyInventoryCache();
}

/** Map uuid -> storyId for sync-managed Testimonies. */
export function managedUuids(state: LocalState): Map<string, string> {
  return new Map(Object.entries(state.items).map(([storyId, item]) => [item.uuid, storyId]));
}

/** Inventory items, sorted by uuid so the hash is stable. */
export function buildInventoryItems(
  listed: ListedTestimony[],
  state: LocalState,
  storyIds: Record<string, string>,
): InventoryItem[] {
  const managed = managedUuids(state);
  const seen = new Set<string>();
  const items: InventoryItem[] = [];
  for (const t of listed) {
    if (seen.has(t.uuid)) continue;
    seen.add(t.uuid);
    const managedStoryId = managed.get(t.uuid);
    items.push({
      uuid: t.uuid,
      storyId: managedStoryId ?? storyIds[t.uuid] ?? '',
      collectionId: t.collectionId,
      title: t.title,
      managed: managedStoryId !== undefined,
    });
  }
  return items.sort((a, b) => (a.uuid < b.uuid ? -1 : a.uuid > b.uuid ? 1 : 0));
}

export function inventoryHash(items: InventoryItem[]): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(items)).digest('hex')}`;
}

export function inventoryDue(hash: string, cache: InventoryCache, nowMs: number): boolean {
  if (!cache.lastSentHash || cache.lastSentHash !== hash) return true;
  const last = cache.lastSentAt ? Date.parse(cache.lastSentAt) : NaN;
  return !Number.isFinite(last) || nowMs - last >= INVENTORY_RESEND_MS;
}

/**
 * Build the inventory and send it if due. Throws on failure (the caller logs and moves on; the
 * next run retries because lastSentHash is only recorded after the publisher accepted it).
 */
export async function reportInventory(
  cacheFile: string,
  deps: InventoryDeps,
  state: LocalState,
  now: () => Date = () => new Date(),
): Promise<'sent' | 'unchanged'> {
  await deps.weaviate.waitUntilReady();
  const listed = await deps.weaviate.listTestimonies();
  const cache = await loadInventoryCache(cacheFile);
  const managed = managedUuids(state);
  const before = JSON.stringify(cache);

  // Resolve story ids for unmanaged Testimonies once; they never change for a given uuid.
  const present = new Set(listed.map((t) => t.uuid));
  for (const uuid of Object.keys(cache.storyIds)) if (!present.has(uuid)) delete cache.storyIds[uuid];
  for (const { uuid } of listed) {
    if (managed.has(uuid) || uuid in cache.storyIds) continue;
    try {
      const storyId = await deps.weaviate.getTestimonyStoryId(uuid);
      if (storyId !== null) cache.storyIds[uuid] = storyId;
    } catch (error) {
      log.warn(`Inventory: could not read story id of Testimony ${uuid}: ${formatError(error)}`);
    }
  }

  const items = buildInventoryItems(listed, state, cache.storyIds);
  const hash = inventoryHash(items);
  let result: 'sent' | 'unchanged' = 'unchanged';
  try {
    if (inventoryDue(hash, cache, now().getTime())) {
      if (items.length > INVENTORY_SOFT_LIMIT) {
        log.warn(`Inventory has ${items.length} Testimonies (publisher accepts up to ${INVENTORY_SOFT_LIMIT})`);
      }
      await deps.publisher.postInventory({ generatedAt: now().toISOString(), items });
      cache.lastSentHash = hash;
      cache.lastSentAt = now().toISOString();
      result = 'sent';
      log.info(`Inventory sent: ${items.length} Testimonies (${items.filter((i) => i.managed).length} managed)`);
    }
  } finally {
    // Keep resolved story ids even when the POST failed.
    if (JSON.stringify(cache) !== before) await writeFileAtomic(cacheFile, `${JSON.stringify(cache, null, 2)}\n`);
  }
  return result;
}
