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
import { unlink } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { testimonyUuid } from '../lib/testimony-ids';
import { Weaviate } from './backends';
import { loadConfig } from './config';
import { scanInterviewFiles } from './interview-files';
import { formatError, log } from './log';
import { loadState } from './state';

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const config = loadConfig('');
  const state = await loadState(config.stateFile);
  const managedFiles = new Set(Object.values(state.items).map((item) => resolve(config.interviewsDir, item.file)));

  const duplicates: { file: string; storyId: string; legacyUuid: string; sameUuid: boolean }[] = [];
  for (const { file, storyId, collectionId } of await scanInterviewFiles(config.interviewsDir)) {
    if (managedFiles.has(file)) continue;
    const managed = state.items[storyId];
    if (!managed || !collectionId) continue;
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
