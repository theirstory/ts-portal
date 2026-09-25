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

export type Manifest = {
  protocol: number;
  portalId: string;
  generatedAt?: string;
  collections: CollectionRef[];
  items: ManifestItem[];
};

export type ItemSnapshot = {
  storyId: string;
  version: string;
  collection: CollectionRef;
  folder?: FolderRef;
  payload: any;
};

export type ItemResultState = 'synced' | 'removed' | 'failed';
export type ItemResult = { storyId: string; version: string; state: ItemResultState; error?: string };

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

export type LocalState = {
  stateVersion: 1;
  portalId?: string;
  lastSync?: { syncId: string; state: RunState; startedAt: string; finishedAt: string; message?: string };
  items: Record<string, LocalItem>;
};
