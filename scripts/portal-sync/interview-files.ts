/**
 * Scan json/interviews/** the way scripts/import-interviews-weaviate.ts sees it: which story each
 * JSON file holds and which collection id (hence Testimony UUID) the importer would give it.
 * Used by the legacy cleanup helper and by manifest `removals`.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { normalizeCollectionId } from '../lib/testimony-ids';

export const COLLECTION_META_JSON_FILES = ['collection.json', 'collection.config.json'];
const IGNORED_COLLECTION_FOLDERS = new Set(['example-collection']);

export type InterviewFile = {
  /** Absolute path. */
  file: string;
  /** TheirStory story `_id` from the payload ('' if none). */
  storyId: string;
  /** Collection id the importer derives for this file (null for ignored folders). */
  collectionId: string | null;
};

export async function listJsonFiles(dir: string): Promise<string[]> {
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
export async function collectionIdFor(interviewsDir: string, file: string): Promise<string | null> {
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

/** Story id of an interview JSON file (raw payload, or `{ payload }` wrapper); '' if none/unreadable. */
export async function readStoryId(file: string): Promise<string> {
  try {
    const raw = JSON.parse(await readFile(file, 'utf-8'));
    const payload = raw?.payload && typeof raw.payload === 'object' ? raw.payload : raw;
    return String(payload?.story?._id || payload?.transcript?.storyId || '').trim();
  } catch {
    return '';
  }
}

/** Every interview JSON file (collection metadata files excluded) with its story id and collection id. */
export async function scanInterviewFiles(interviewsDir: string): Promise<InterviewFile[]> {
  const out: InterviewFile[] = [];
  for (const file of await listJsonFiles(interviewsDir)) {
    const name = file.split(sep).pop()!.toLowerCase();
    if (COLLECTION_META_JSON_FILES.includes(name)) continue;
    const storyId = await readStoryId(file);
    if (!storyId) continue;
    out.push({ file, storyId, collectionId: await collectionIdFor(interviewsDir, file) });
  }
  return out;
}
