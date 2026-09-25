/**
 * Find (and optionally clean up) interview JSON files that were imported the old way
 * (`theirstory:import-stories` + `weaviate:import`) for stories that portal-sync now manages.
 *
 *   yarn portal-sync:legacy            dry run: list duplicates
 *   yarn portal-sync:legacy --apply    delete those files, and their Weaviate Testimony + Chunks
 *                                      when the legacy copy has a different Testimony UUID
 *
 * A legacy copy with the SAME collection id already has the same Testimony UUID, so portal-sync
 * replaced it in Weaviate in place; only the file is stale (a later `weaviate:import` would
 * re-import it). A copy under a DIFFERENT collection id (e.g. the importer's default
 * `json/interviews/imported/`) is a separate Testimony and shows up twice in the portal until removed.
 */
import 'dotenv/config';
import { readdir, readFile, unlink } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { normalizeCollectionId, testimonyUuid } from '../lib/testimony-ids';
import { Weaviate } from './backends';
import { loadConfig } from './config';
import { formatError, log } from './log';
import { loadState } from './state';

const COLLECTION_META_JSON_FILES = ['collection.json', 'collection.config.json'];
const IGNORED_COLLECTION_FOLDERS = new Set(['example-collection']);

async function listJsonFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const out: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listJsonFiles(full)));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) out.push(full);
  }
  return out;
}

/** Same collection-id derivation as scripts/import-interviews-weaviate.ts. */
async function collectionIdFor(interviewsDir: string, file: string): Promise<string | null> {
  const parts = relative(interviewsDir, file).split(sep);
  if (parts.length === 1) return 'default';
  const top = parts[0];
  if (IGNORED_COLLECTION_FOLDERS.has(top.toLowerCase())) return null;
  for (const meta of COLLECTION_META_JSON_FILES) {
    try {
      const parsed = JSON.parse(await readFile(join(interviewsDir, top, meta), 'utf-8'));
      if (typeof parsed.id === 'string' && parsed.id.trim()) return normalizeCollectionId(parsed.id);
      break;
    } catch {
      // missing / invalid
    }
  }
  return normalizeCollectionId(top);
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const config = loadConfig('');
  const state = await loadState(config.stateFile);
  const managedFiles = new Set(Object.values(state.items).map((item) => resolve(config.interviewsDir, item.file)));

  const duplicates: { file: string; storyId: string; legacyUuid: string; sameUuid: boolean }[] = [];
  for (const file of await listJsonFiles(config.interviewsDir)) {
    const name = file.split(sep).pop()!.toLowerCase();
    if (COLLECTION_META_JSON_FILES.includes(name) || managedFiles.has(file)) continue;
    let payload: any;
    try {
      const raw = JSON.parse(await readFile(file, 'utf-8'));
      payload = raw?.payload && typeof raw.payload === 'object' ? raw.payload : raw;
    } catch {
      continue;
    }
    const storyId = String(payload?.story?._id || payload?.transcript?.storyId || '').trim();
    const managed = storyId ? state.items[storyId] : undefined;
    if (!managed) continue;
    const collectionId = await collectionIdFor(config.interviewsDir, file);
    if (!collectionId) continue;
    const legacyUuid = testimonyUuid(collectionId, storyId);
    duplicates.push({ file, storyId, legacyUuid, sameUuid: legacyUuid === managed.uuid });
  }

  if (!duplicates.length) {
    log.info('No legacy duplicates of sync-managed stories found.');
    return;
  }
  for (const d of duplicates) {
    log.info(
      `${apply ? 'Cleaning' : 'Found'} ${relative(process.cwd(), d.file)} (story ${d.storyId}) — ` +
        (d.sameUuid ? 'same Testimony UUID (file only)' : `separate Testimony ${d.legacyUuid} (duplicate in portal)`),
    );
  }
  if (!apply) {
    log.info(
      `${duplicates.length} legacy file(s). Re-run with --apply to delete them (and their separate Testimonies).`,
    );
    return;
  }

  const weaviate = new Weaviate(config.weaviateUrl, config.weaviateApiKey);
  if (duplicates.some((d) => !d.sameUuid)) await weaviate.waitUntilReady(30);
  let failures = 0;
  for (const d of duplicates) {
    try {
      if (!d.sameUuid) await weaviate.deleteTestimony(d.legacyUuid);
      await unlink(d.file);
    } catch (error) {
      failures += 1;
      log.error(`${d.file}: ${formatError(error)}`);
    }
  }
  log.info(`Cleaned ${duplicates.length - failures}/${duplicates.length} legacy file(s).`);
  if (failures) process.exitCode = 1;
}

main().catch((error) => {
  log.error(formatError(error));
  process.exit(1);
});
