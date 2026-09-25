/** Wire types for Portal Sync Protocol v1 (see docs/PORTAL_SYNC.md). */

export type CollectionRef = { id: string; name: string; description: string };
export type FolderRef = { id: string; name: string; path: string };

export type ManifestItem = {
  storyId: string;
  collectionId: string;
  folder?: FolderRef;
  version: string;
  title?: string;
  publishedAt?: string;
};

/** An unmanaged Testimony (reported in the inventory) the publisher wants deleted. */
export type ManifestRemoval = { uuid: string; storyId?: string; requestedAt?: string };

export type Manifest = {
  protocol: number;
  portalId: string;
  generatedAt?: string;
  collections: CollectionRef[];
  items: ManifestItem[];
  /** Optional (protocol 1, additive). */
  removals?: ManifestRemoval[];
};

export type ItemSnapshot = {
  storyId: string;
  version: string;
  collection: CollectionRef;
  folder?: FolderRef;
  payload: any;
};

export type ItemResultState = 'synced' | 'removed' | 'failed';
export type ItemResult = {
  storyId: string;
  /** Omitted for manifest `removals` (unmanaged Testimonies have no published version). */
  version?: string;
  /** Testimony UUID; set for manifest `removals`. */
  uuid?: string;
  state: ItemResultState;
  error?: string;
};

export type InventoryItem = {
  uuid: string;
  /** TheirStory story id ('' if unknown). */
  storyId: string;
  collectionId: string;
  title: string;
  /** True when the uuid is synced from the manifest (present in local state). */
  managed: boolean;
};

export type InventoryReport = { generatedAt: string; items: InventoryItem[] };

export type RunState = 'running' | 'succeeded' | 'partial' | 'failed';

export type StatusReport = {
  syncId: string;
  state: RunState;
  startedAt: string;
  finishedAt?: string;
  portalVersion?: string;
  message?: string;
  items: ItemResult[];
};

/** Local record of one synced story. */
export type LocalItem = {
  version: string;
  /** Collection id as used locally (normalized; see testimony-ids.normalizeCollectionId). */
  collectionId: string;
  uuid: string;
  /** JSON file path relative to the interviews dir. */
  file: string;
  /** Hash of the collection name/description the item was processed with. */
  collectionMeta: string;
  syncedAt: string;
};

/** Sidecar to the state file: inventory bookkeeping (json/.portal-sync/inventory.json). */
export type InventoryCache = {
  cacheVersion: 1;
  /** uuid -> story id for unmanaged Testimonies (resolved once from the Testimony's transcription). */
  storyIds: Record<string, string>;
  lastSentHash?: string;
  lastSentAt?: string;
};

/** json/.portal-sync/data-version.json: bumped after every run that changed Weaviate. */
export type DataVersion = { version: number; updatedAt: string };

export type LocalState = {
  stateVersion: 1;
  portalId?: string;
  lastSync?: { syncId: string; state: RunState; startedAt: string; finishedAt: string; message?: string };
  items: Record<string, LocalItem>;
};
