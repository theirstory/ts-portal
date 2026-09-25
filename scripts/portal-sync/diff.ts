import { createHash } from 'node:crypto';
import { humanizeCollectionName, normalizeCollectionId } from '../lib/testimony-ids';
import type { CollectionRef, LocalItem, LocalState, Manifest, ManifestItem } from './types';

export type ChangeReason = 'new' | 'version' | 'collection' | 'collection-meta';

export type PlannedUpdate = {
  item: ManifestItem;
  reason: ChangeReason;
  previous?: LocalItem;
};

export type PlannedRemoval = {
  storyId: string;
  previous: LocalItem;
};

export type SyncPlan = {
  updates: PlannedUpdate[];
  removals: PlannedRemoval[];
  unchanged: number;
  warnings: string[];
};

/** Story ids become file names; only allow a conservative character set. */
export const SAFE_STORY_ID = /^[A-Za-z0-9_-]{1,128}$/;

export function collectionMetaHash(collection: Pick<CollectionRef, 'name' | 'description'>): string {
  return createHash('sha256')
    .update(JSON.stringify([collection.name ?? '', collection.description ?? '']))
    .digest('hex')
    .slice(0, 16);
}

/** Collection metadata for an id, falling back to a humanized name if the manifest omits it. */
export function resolveCollection(manifest: Manifest, collectionId: string): CollectionRef {
  const found = manifest.collections?.find((c) => c.id === collectionId);
  return {
    id: collectionId,
    name: (found?.name ?? '').trim() || humanizeCollectionName(normalizeCollectionId(collectionId)),
    description: (found?.description ?? '').trim(),
  };
}

/**
 * Compare the publisher manifest with local state.
 *
 * - updates: items that are new, whose version changed, whose collection changed (the old Testimony
 *   UUID must be deleted before processing), or whose collection name/description changed
 *   (Testimonies/Chunks carry the collection name, so they are re-processed).
 * - removals: local items that are no longer in the manifest.
 */
export function planSync(manifest: Manifest, state: LocalState): SyncPlan {
  const warnings: string[] = [];
  const seen = new Set<string>();
  const updates: PlannedUpdate[] = [];
  let unchanged = 0;

  for (const item of manifest.items ?? []) {
    if (!item || typeof item.storyId !== 'string' || !item.storyId) {
      warnings.push('manifest item without storyId ignored');
      continue;
    }
    if (seen.has(item.storyId)) {
      warnings.push(`duplicate storyId ${item.storyId} in manifest; using first occurrence`);
      continue;
    }
    seen.add(item.storyId);

    const previous = state.items[item.storyId];
    if (!previous) {
      updates.push({ item, reason: 'new' });
      continue;
    }
    if (previous.collectionId !== normalizeCollectionId(item.collectionId ?? '')) {
      updates.push({ item, reason: 'collection', previous });
      continue;
    }
    if (previous.version !== item.version) {
      updates.push({ item, reason: 'version', previous });
      continue;
    }
    if (previous.collectionMeta !== collectionMetaHash(resolveCollection(manifest, item.collectionId))) {
      updates.push({ item, reason: 'collection-meta', previous });
      continue;
    }
    unchanged += 1;
  }

  const removals: PlannedRemoval[] = Object.entries(state.items)
    .filter(([storyId]) => !seen.has(storyId))
    .map(([storyId, previous]) => ({ storyId, previous }))
    .sort((a, b) => a.storyId.localeCompare(b.storyId));

  return { updates, removals, unchanged, warnings };
}

export function summarizeRun(
  results: { state: 'synced' | 'removed' | 'failed' }[],
): 'succeeded' | 'partial' | 'failed' {
  const failed = results.filter((r) => r.state === 'failed').length;
  if (failed === 0) return 'succeeded';
  return failed === results.length ? 'failed' : 'partial';
}
