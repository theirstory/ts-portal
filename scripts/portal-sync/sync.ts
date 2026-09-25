import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { normalizeCollectionId, testimonyUuid } from '../lib/testimony-ids';
import type { ListedTestimony } from './backends';
import type { PortalSyncConfig } from './config';
import { bumpDataVersion } from './data-version';
import { collectionMetaHash, planSync, resolveCollection, SAFE_STORY_ID, summarizeRun } from './diff';
import type { PlannedRemoval, PlannedUpdate } from './diff';
import { scanInterviewFiles } from './interview-files';
import type { InterviewFile } from './interview-files';
import { reportInventory } from './inventory';
import { acquireLock, describeLock } from './lock';
import { formatError, log } from './log';
import { loadState, saveState, writeFileAtomic } from './state';
import type {
  CollectionRef,
  FolderRef,
  InventoryReport,
  ItemResult,
  ItemSnapshot,
  LocalItem,
  LocalState,
  Manifest,
  ManifestRemoval,
  RunState,
  StatusReport,
} from './types';

export type SyncDeps = {
  publisher: {
    getManifest(): Promise<Manifest>;
    getItem(storyId: string): Promise<ItemSnapshot | null>;
    postStatus(report: StatusReport): Promise<void>;
    postInventory(report: InventoryReport): Promise<void>;
  };
  weaviate: {
    waitUntilReady(): Promise<void>;
    deleteTestimony(uuid: string): Promise<{ chunksDeleted: number }>;
    listTestimonies(): Promise<ListedTestimony[]>;
    getTestimonyStoryId(uuid: string): Promise<string | null>;
  };
  nlp: {
    waitUntilReady(): Promise<void>;
    processStory(body: { payload: any; collection: CollectionRef; folder: FolderRef }): Promise<{ chunks?: number }>;
  };
  postProcess?: (vars: {
    STORY_ID: string;
    STORY_UUID: string;
    COLLECTION_ID: string;
    STORY_FILE: string;
  }) => Promise<void>;
};

export type RunSummary = {
  syncId: string;
  state: RunState | 'skipped';
  startedAt: string;
  finishedAt: string;
  message: string;
  items: ItemResult[];
};

const EMPTY_FOLDER: FolderRef = { id: '', name: '', path: '' };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sanitizeFolderSegments(path: string): string[] {
  return path
    .split(/[\\/]+/g)
    .map((segment) => segment.trim().replace(/[^A-Za-z0-9 _.()-]+/g, '-'))
    .filter((segment) => segment && segment !== '.' && segment !== '..');
}

function normalizeFolder(folder: Partial<FolderRef> | undefined): FolderRef {
  return {
    id: String(folder?.id ?? '').trim(),
    name: String(folder?.name ?? '').trim(),
    path: String(folder?.path ?? '').trim(),
  };
}

function payloadStoryId(payload: any): string {
  const fromStory = payload?.story?._id;
  const fromTranscript = payload?.transcript?.storyId;
  return String(
    (typeof fromStory === 'string' && fromStory.trim()) ||
      (typeof fromTranscript === 'string' && fromTranscript.trim()) ||
      '',
  );
}

async function removeFileIfExists(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

/** Write/merge <collectionDir>/collection.json so `yarn weaviate:import` sees the same collection metadata. */
async function ensureCollectionJson(collectionDir: string, collection: CollectionRef): Promise<void> {
  const path = join(collectionDir, 'collection.json');
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(await readFile(path, 'utf-8'));
  } catch {
    // missing or invalid: start fresh
  }
  const next = { ...existing, id: collection.id, name: collection.name, description: collection.description };
  if (JSON.stringify(next) === JSON.stringify(existing)) return;
  await writeFileAtomic(path, `${JSON.stringify(next, null, 2)}\n`);
}

class SyncRun {
  private readonly results: ItemResult[] = [];
  private weaviateReady: Promise<void> | null = null;
  private nlpReady: Promise<void> | null = null;

  constructor(
    private readonly config: PortalSyncConfig,
    private readonly deps: SyncDeps,
    private readonly state: LocalState,
    private readonly manifest: Manifest,
  ) {}

  get items(): ItemResult[] {
    return this.results;
  }

  private ensureWeaviate(): Promise<void> {
    this.weaviateReady ??= this.deps.weaviate.waitUntilReady();
    return this.weaviateReady;
  }

  private ensureNlp(): Promise<void> {
    this.nlpReady ??= this.deps.nlp.waitUntilReady();
    return this.nlpReady;
  }

  private abs(relativeFile: string): string {
    const full = resolve(this.config.interviewsDir, relativeFile);
    // Defense in depth: never touch files outside the interviews dir.
    if (!full.startsWith(this.config.interviewsDir + sep))
      throw new Error(`refusing path outside interviews dir: ${relativeFile}`);
    return full;
  }

  private async persist(): Promise<void> {
    await saveState(this.config.stateFile, this.state);
  }

  /** Delete Testimony + Chunks and the JSON file of a local item, then forget it. */
  private async deleteLocal(storyId: string, previous: LocalItem): Promise<void> {
    await this.ensureWeaviate();
    const { chunksDeleted } = await this.deps.weaviate.deleteTestimony(previous.uuid);
    await removeFileIfExists(this.abs(previous.file));
    delete this.state.items[storyId];
    await this.persist();
    log.info(`Removed ${storyId} (uuid=${previous.uuid}, chunks deleted=${chunksDeleted}, file=${previous.file})`);
  }

  async remove({ storyId, previous }: PlannedRemoval): Promise<void> {
    log.info(`Removing ${storyId}: no longer in manifest`);
    try {
      await this.deleteLocal(storyId, previous);
      this.results.push({ storyId, version: previous.version, state: 'removed' });
    } catch (error) {
      const message = formatError(error);
      log.error(`Remove failed for ${storyId}: ${message}`);
      this.results.push({ storyId, version: previous.version, state: 'failed', error: message });
    }
  }

  /**
   * Manifest `removals`: delete an unmanaged Testimony (Chunks + object) and every JSON file under
   * the interviews dir for its story, so a later `weaviate:import` doesn't bring it back.
   * Skipped when the uuid is managed (in local state, or about to be synced from this manifest).
   */
  async removeUnmanaged(
    removal: ManifestRemoval,
    protectedUuids: Set<string>,
    files: () => Promise<InterviewFile[]>,
  ): Promise<void> {
    const uuid = String(removal?.uuid ?? '')
      .trim()
      .toLowerCase();
    const storyId = String(removal?.storyId ?? '').trim();
    if (protectedUuids.has(uuid)) {
      log.info(`Ignoring removal of ${uuid} (${storyId || 'no story id'}): it is managed by portal-sync`);
      return;
    }
    log.info(`Removing unmanaged Testimony ${uuid} (${storyId || 'no story id'}) as requested by the publisher`);
    try {
      if (!UUID_RE.test(uuid)) throw new Error(`invalid uuid "${uuid.slice(0, 80)}"`);
      if (storyId && !SAFE_STORY_ID.test(storyId)) throw new Error(`unsafe storyId "${storyId.slice(0, 80)}"`);
      await this.ensureWeaviate();
      // Already gone is fine: deleteTestimony ignores missing objects.
      const { chunksDeleted } = await this.deps.weaviate.deleteTestimony(uuid);
      const managedFiles = new Set(Object.values(this.state.items).map((item) => this.abs(item.file)));
      const deletedFiles: string[] = [];
      if (storyId) {
        for (const f of await files()) {
          if (f.storyId !== storyId || managedFiles.has(f.file)) continue;
          await removeFileIfExists(f.file);
          deletedFiles.push(f.file);
        }
      }
      log.info(
        `Removed unmanaged ${uuid} (chunks deleted=${chunksDeleted}, files deleted=${deletedFiles.length}` +
          `${deletedFiles.length ? `: ${deletedFiles.join(', ')}` : ''})`,
      );
      this.results.push({ storyId, uuid, state: 'removed' });
    } catch (error) {
      const message = formatError(error);
      log.error(`Removal of unmanaged ${uuid} failed: ${message}`);
      this.results.push({ storyId, uuid, state: 'failed', error: message });
    }
  }

  async update(update: PlannedUpdate): Promise<void> {
    const { item } = update;
    const storyId = item.storyId;
    log.info(`Syncing ${storyId} (${update.reason}${item.title ? `: ${item.title}` : ''})`);
    try {
      const outcome = await this.applyUpdate(update);
      if (outcome) this.results.push(outcome);
    } catch (error) {
      const message = formatError(error);
      log.error(`Sync failed for ${storyId}: ${message}`);
      this.results.push({ storyId, version: item.version, state: 'failed', error: message });
    }
  }

  private async applyUpdate({ item, previous }: PlannedUpdate): Promise<ItemResult | null> {
    const storyId = item.storyId;
    if (!SAFE_STORY_ID.test(storyId)) throw new Error(`unsafe storyId "${storyId.slice(0, 80)}"`);

    const snapshot = await this.deps.publisher.getItem(storyId);
    if (!snapshot) {
      // Unpublished between manifest and item fetch.
      if (previous) {
        log.info(`${storyId}: item endpoint returned 404; removing locally`);
        await this.deleteLocal(storyId, previous);
        return { storyId, version: previous.version, state: 'removed' };
      }
      log.info(`${storyId}: item endpoint returned 404 and nothing is stored locally; skipping`);
      return null;
    }
    if (snapshot.storyId && snapshot.storyId !== storyId) {
      throw new Error(`item response is for ${snapshot.storyId}, expected ${storyId}`);
    }
    const version = String(snapshot.version || item.version);

    const embeddedId = payloadStoryId(snapshot.payload);
    if (embeddedId !== storyId) {
      // The NLP processor derives the Testimony UUID from payload.story._id; it must match.
      throw new Error(`payload story id "${embeddedId}" does not match storyId`);
    }

    const rawCollectionId = String(snapshot.collection?.id || item.collectionId || '').trim();
    if (!rawCollectionId) throw new Error('item has no collection id');
    const collectionId = normalizeCollectionId(rawCollectionId);
    if (collectionId !== rawCollectionId.toLowerCase()) {
      log.warn(
        `${storyId}: collection id "${rawCollectionId}" normalized to "${collectionId}" (matches weaviate:import)`,
      );
    }
    const inManifest = this.manifest.collections?.some((c) => c.id === rawCollectionId);
    const meta = inManifest
      ? resolveCollection(this.manifest, rawCollectionId)
      : resolveCollection(
          { ...this.manifest, collections: snapshot.collection ? [snapshot.collection] : [] },
          rawCollectionId,
        );
    const collection: CollectionRef = { id: collectionId, name: meta.name, description: meta.description };
    const folder = normalizeFolder(snapshot.folder ?? item.folder ?? EMPTY_FOLDER);

    const uuid = testimonyUuid(collectionId, storyId);
    const file = [collectionId, ...sanitizeFolderSegments(folder.path), `${storyId}.json`].join('/');
    const filePath = this.abs(file);

    // Collection changed: the Testimony UUID changes too, so drop the old one first.
    if (previous && previous.uuid !== uuid) {
      log.info(
        `${storyId}: collection changed ${previous.collectionId} -> ${collectionId}; deleting old uuid ${previous.uuid}`,
      );
      await this.deleteLocal(storyId, previous);
    }
    const kept = this.state.items[storyId];

    await mkdir(dirname(filePath), { recursive: true });
    await writeFileAtomic(filePath, `${JSON.stringify(snapshot.payload, null, 2)}\n`);
    await ensureCollectionJson(this.abs(collectionId), collection);

    // Track the file/uuid immediately so a failure below can still be cleaned up by a later removal.
    // version stays at the previously synced one (or '' for new items) so the item is retried.
    if (!kept || kept.file !== file) {
      this.state.items[storyId] = {
        version: kept?.version ?? '',
        collectionId,
        uuid,
        file,
        collectionMeta: kept?.collectionMeta ?? '',
        syncedAt: kept?.syncedAt ?? '',
      };
      await this.persist();
      if (kept && kept.file !== file) await removeFileIfExists(this.abs(kept.file));
    }

    await this.ensureNlp();
    const { chunks } = await this.deps.nlp.processStory({ payload: snapshot.payload, collection, folder });
    log.info(`${storyId}: NLP OK (uuid=${uuid}, chunks=${chunks ?? 'unknown'})`);

    if (this.deps.postProcess) {
      log.info(`${storyId}: running post-process command`);
      await this.deps.postProcess({
        STORY_ID: storyId,
        STORY_UUID: uuid,
        COLLECTION_ID: collectionId,
        STORY_FILE: filePath,
      });
    }

    this.state.items[storyId] = {
      version,
      collectionId,
      uuid,
      file,
      collectionMeta: collectionMetaHash(meta),
      syncedAt: new Date().toISOString(),
    };
    await this.persist();
    return { storyId, version, state: 'synced' };
  }
}

async function report(deps: SyncDeps, body: StatusReport): Promise<void> {
  try {
    await deps.publisher.postStatus(body);
  } catch (error) {
    log.warn(`Status report (${body.state}) failed: ${formatError(error)}`);
  }
}

/** One full sync run (manifest → diff → removals → updates → status). */
export async function runSync(config: PortalSyncConfig, deps: SyncDeps, reason: string): Promise<RunSummary> {
  const syncId = randomUUID();
  const startedAt = new Date().toISOString();

  const lock = await acquireLock(config.lockFile);
  if (!lock) {
    const holder = await describeLock(config.lockFile);
    const message = `another sync holds ${config.lockFile} (${holder}); skipping this run`;
    log.warn(message);
    return { syncId, state: 'skipped', startedAt, finishedAt: new Date().toISOString(), message, items: [] };
  }

  log.info(`Sync ${syncId} started (${reason})`);
  let items: ItemResult[] = [];
  let state: RunState = 'failed';
  let message = '';
  let localState: LocalState | null = null;
  let manifestOk = false;

  try {
    localState = await loadState(config.stateFile);
    await report(deps, { syncId, state: 'running', startedAt, portalVersion: config.portalVersion, items: [] });

    const manifest = await deps.publisher.getManifest();
    manifestOk = true;
    if (localState.portalId && manifest.portalId && localState.portalId !== manifest.portalId) {
      log.warn(
        `Manifest portalId ${manifest.portalId} differs from the one in local state (${localState.portalId}); ` +
          'items from the previous portal will be removed.',
      );
    }
    localState.portalId = manifest.portalId;

    const plan = planSync(manifest, localState);
    for (const warning of plan.warnings) log.warn(warning);
    log.info(
      `Manifest: ${manifest.items.length} item(s) in ${manifest.collections?.length ?? 0} collection(s); ` +
        `${plan.updates.length} to sync, ${plan.removals.length} to remove, ${plan.unchanged} unchanged`,
    );

    const run = new SyncRun(config, deps, localState, manifest);
    for (const removal of plan.removals) await run.remove(removal);

    const removals = Array.isArray(manifest.removals) ? manifest.removals : [];
    if (removals.length) {
      // Never delete what we sync: uuids in local state, or that this manifest is about to (re)sync
      // (an adopted recording keeps its uuid).
      const protectedUuids = new Set(Object.values(localState.items).map((item) => item.uuid));
      for (const item of manifest.items) {
        if (item?.storyId && item.collectionId) {
          protectedUuids.add(testimonyUuid(normalizeCollectionId(item.collectionId), item.storyId));
        }
      }
      let scan: Promise<InterviewFile[]> | null = null;
      const files = () => (scan ??= scanInterviewFiles(config.interviewsDir));
      for (const removal of removals) await run.removeUnmanaged(removal, protectedUuids, files);
    }

    for (const update of plan.updates) await run.update(update);
    items = run.items;

    state = summarizeRun(items);
    const counts = (s: string) => items.filter((i) => i.state === s).length;
    message = `${counts('synced')} synced, ${counts('removed')} removed, ${counts('failed')} failed, ${plan.unchanged} unchanged`;
  } catch (error) {
    state = 'failed';
    message = formatError(error);
    log.error(`Sync ${syncId} failed: ${message}`);
  }

  const finishedAt = new Date().toISOString();
  if (localState) {
    localState.lastSync = { syncId, state, startedAt, finishedAt, message };
    await saveState(config.stateFile, localState).catch((error) =>
      log.error(`Could not save state: ${formatError(error)}`),
    );
  }

  const changed = items.filter((i) => i.state === 'synced' || i.state === 'removed').length;
  if (changed > 0) {
    try {
      const { version } = await bumpDataVersion(config.dataVersionFile);
      log.info(`Data version bumped to ${version}`);
    } catch (error) {
      log.error(`Could not bump data version (${config.dataVersionFile}): ${formatError(error)}`);
    }
  }
  await report(deps, { syncId, state, startedAt, finishedAt, portalVersion: config.portalVersion, message, items });

  // Inventory never fails the run; it is retried after the next one.
  if (manifestOk && localState) {
    try {
      await reportInventory(config.inventoryFile, deps, localState);
    } catch (error) {
      log.warn(`Inventory report failed (will retry after the next run): ${formatError(error)}`);
    }
  }
  await lock.release();

  log.info(`Sync ${syncId} ${state}: ${message}`);
  return { syncId, state, startedAt, finishedAt, message, items };
}
