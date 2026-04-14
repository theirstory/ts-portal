import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

function buildWeaviateUrl(): string {
  const host = process.env.WEAVIATE_HOST_URL ?? 'weaviate';
  const port = process.env.WEAVIATE_PORT ?? '8080';
  const secure = process.env.WEAVIATE_SECURE === 'true';
  return `${secure ? 'https' : 'http'}://${host}:${port}`;
}

function buildNlpUrl(): string {
  const host = process.env.NLP_HOST ?? 'nlp-processor';
  const port = process.env.NLP_PORT ?? '7070';
  const secure = process.env.NLP_SECURE === 'true';
  return `${secure ? 'https' : 'http'}://${host}:${port}`;
}

const WEAVIATE_URL = buildWeaviateUrl();
const NLP_URL = buildNlpUrl();

const INTERVIEWS_DIR = process.env.INTERVIEWS_DIR ?? './json/interviews';
const RESET_WEAVIATE_DATA = process.env.RESET_WEAVIATE_DATA === 'true';
const SKIP_IMPORTED_INTERVIEWS = process.env.SKIP_IMPORTED_INTERVIEWS !== 'false';
const IGNORED_INTERVIEW_FILENAME = 'example-minimum-interview.json';
const IGNORED_COLLECTION_FOLDERS = new Set(['example-collection']);
const COLLECTION_META_JSON_FILES = new Set(['collection.json', 'collection.config.json']);
const COLLECTION_META_MD_FILES = ['COLLECTION.md', 'collection.md', 'README.md'];
const UUID_NAMESPACE_URL = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type CollectionMetadata = {
  id: string;
  name: string;
  description: string;
  folderPath: string;
};

type FolderMetadata = {
  id: string;
  name: string;
  path: string;
};

type InterviewImportJob = {
  filePath: string;
  collection: CollectionMetadata;
  folder: FolderMetadata;
};

type FailedInterviewImport = {
  filePath: string;
  collectionId: string;
  error: string;
};

type SkippedInterviewImport = {
  filePath: string;
  collectionId: string;
  testimonyUuid: string;
  chunkCount: number;
};

type DirectoryEntryLike = {
  name: string;
  isFile: () => boolean;
  isDirectory: () => boolean;
};

function formatError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 1000 ? `${message.slice(0, 1000)}...` : message;
}

function getNestedString(value: unknown, path: string[]): string {
  let current = value;
  for (const segment of path) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return '';
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === 'string' ? current.trim() : '';
}

function formatUuidHex(hex: string): string {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function uuidToBytes(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ''), 'hex');
}

function uuidV5(value: string, namespace: string): string {
  const bytes = createHash('sha1').update(Buffer.concat([uuidToBytes(namespace), Buffer.from(value)])).digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return formatUuidHex(bytes.subarray(0, 16).toString('hex'));
}

function convertToUuid(rawId: string): string {
  const value = rawId.trim();
  const compact = value.replace(/-/g, '');

  if (/^[0-9a-fA-F]{32}$/.test(compact)) {
    return formatUuidHex(compact.toLowerCase());
  }

  if (compact && /^[0-9a-fA-F]+$/.test(compact)) {
    return formatUuidHex(compact.toLowerCase().padEnd(32, '0').slice(0, 32));
  }

  return uuidV5(value || 'default', UUID_NAMESPACE_URL);
}

function extractPayload(raw: any): any {
  return raw && typeof raw === 'object' && raw.payload && typeof raw.payload === 'object' ? raw.payload : raw;
}

function normalizeCollectionId(input: string): string {
  const normalized = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'default';
}

function humanizeCollectionName(id: string): string {
  return id
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeFolderPath(input: string): string {
  return input
    .split(/[\\/]+/g)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('/');
}

function buildFolderMetadata(collectionId: string, relativeFolderPath: string): FolderMetadata {
  const normalizedPath = normalizeFolderPath(relativeFolderPath);

  if (!normalizedPath) {
    return {
      id: '',
      name: '',
      path: '',
    };
  }

  const segments = normalizedPath.split('/');
  const folderName = segments[segments.length - 1] ?? normalizedPath;

  return {
    id: normalizeCollectionId(`${collectionId}-${normalizedPath.split('/').join('-')}`),
    name: humanizeCollectionName(folderName),
    path: normalizedPath,
  };
}

async function waitForReady(): Promise<void> {
  const url = `${WEAVIATE_URL}/v1/.well-known/ready`;

  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // ignore
    }
    await sleep(1000);
  }

  throw new Error(`[weaviate-import] Weaviate not ready after timeout: ${url}`);
}

async function waitForNlpReady(): Promise<void> {
  const url = `${NLP_URL}/health`;
  const maxWaitSeconds = 300;

  for (let i = 0; i < maxWaitSeconds; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        return;
      }
    } catch {
      // ignore
    }
    if (i > 0 && i % 15 === 0) {
      console.log(`[weaviate-import] Still waiting for NLP at ${url}... (${i}s)`);
    }
    await sleep(1000);
  }

  throw new Error(`[weaviate-import] NLP not ready after ${maxWaitSeconds}s: ${url}`);
}

async function deleteAllObjectsFromClass(className: string): Promise<void> {
  const url = `${WEAVIATE_URL}/v1/batch/objects`;

  const res = await fetch(url, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      match: {
        class: className,
        where: {
          path: ['id'],
          operator: 'Like',
          valueString: '*',
        },
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.warn(`[weaviate-import] Failed to delete ${className}: HTTP ${res.status}. ${text}`);
    return;
  }

  try {
    const result = await res.json();
    const deleted = result?.results?.matches || result?.matches || 'unknown';
    console.log(`[weaviate-import] 🗑️  Deleted ${deleted} objects from ${className}`);
  } catch {
    console.log(`[weaviate-import] 🗑️  Cleared ${className}`);
  }
}

async function clearAllData(): Promise<void> {
  console.log('[weaviate-import] 🧹 Clearing all existing data from Weaviate...');

  await deleteAllObjectsFromClass('Testimonies');
  await deleteAllObjectsFromClass('Chunks');

  await sleep(1000);

  console.log('[weaviate-import] ✅ All data cleared');
}

async function loadJson<T>(path: string): Promise<T> {
  const raw = await readFile(path, 'utf-8');
  return JSON.parse(raw) as T;
}

function parseCollectionMarkdown(markdownRaw: string): { name?: string; description?: string } {
  const markdown = markdownRaw.replace(/\r/g, '').trim();
  if (!markdown) return {};

  const headingMatch = markdown.match(/^#\s+(.+)$/m);
  const heading = headingMatch?.[1]?.trim();

  const description = markdown
    .replace(/^#\s+.+$/m, '')
    .trim();

  return {
    name: heading || undefined,
    description: description || undefined,
  };
}

async function loadCollectionMetadata(collectionDir: string, folderName: string): Promise<CollectionMetadata> {
  let id = normalizeCollectionId(folderName || 'default');
  let name = humanizeCollectionName(id);
  let description = '';
  let hasJsonName = false;

  for (const metaFile of COLLECTION_META_JSON_FILES) {
    const path = join(collectionDir, metaFile);
    try {
      const parsed = await loadJson<Record<string, unknown>>(path);
      const parsedId = typeof parsed.id === 'string' ? parsed.id.trim() : '';
      const parsedName = typeof parsed.name === 'string' ? parsed.name.trim() : '';
      const parsedDescription = typeof parsed.description === 'string' ? parsed.description.trim() : '';

      if (parsedId) id = normalizeCollectionId(parsedId);
      if (parsedName) {
        name = parsedName;
        hasJsonName = true;
      }
      if (parsedDescription) description = parsedDescription;
      break;
    } catch {
      // ignore when file does not exist or is invalid
    }
  }

  for (const metaFile of COLLECTION_META_MD_FILES) {
    const path = join(collectionDir, metaFile);
    try {
      const markdown = await readFile(path, 'utf-8');
      const parsed = parseCollectionMarkdown(markdown);
      if (!hasJsonName && parsed.name) name = parsed.name;
      if (!description && parsed.description) description = parsed.description;
      break;
    } catch {
      // ignore when file does not exist
    }
  }

  return {
    id,
    name: name || humanizeCollectionName(id),
    description,
    folderPath: collectionDir,
  };
}

function isInterviewJsonFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  if (!lower.endsWith('.json')) return false;
  if (lower === IGNORED_INTERVIEW_FILENAME) return false;
  if (COLLECTION_META_JSON_FILES.has(lower)) return false;
  return true;
}

async function discoverCollectionInterviewJobs(
  collectionDir: string,
  collection: CollectionMetadata,
  currentDir = collectionDir,
): Promise<InterviewImportJob[]> {
  let entries: DirectoryEntryLike[] = [];
  try {
    entries = await readdir(currentDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const relativeFolderPath = normalizeFolderPath(relative(collectionDir, currentDir).split(sep).join('/'));
  const folder = buildFolderMetadata(collection.id, relativeFolderPath);

  const files = entries
    .filter((entry: DirectoryEntryLike) => entry.isFile() && isInterviewJsonFile(entry.name))
    .map((entry: DirectoryEntryLike) => join(currentDir, entry.name))
    .sort((a: string, b: string) => a.localeCompare(b));

  const jobs: InterviewImportJob[] = files.map((filePath: string) => ({
    filePath,
    collection,
    folder,
  }));

  const childDirectories = entries
    .filter((entry: DirectoryEntryLike) => entry.isDirectory())
    .sort((a: DirectoryEntryLike, b: DirectoryEntryLike) => a.name.localeCompare(b.name));

  for (const directory of childDirectories) {
    const childJobs = await discoverCollectionInterviewJobs(collectionDir, collection, join(currentDir, directory.name));
    jobs.push(...childJobs);
  }

  return jobs;
}

async function discoverInterviewJobs(rootDir: string): Promise<InterviewImportJob[]> {
  let entries: DirectoryEntryLike[] = [];
  try {
    entries = await readdir(rootDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const jobs: InterviewImportJob[] = [];

  // Backward-compatible behavior: JSON files directly under root belong to "default" collection.
  const rootFiles = entries
    .filter((entry: DirectoryEntryLike) => entry.isFile() && isInterviewJsonFile(entry.name))
    .map((entry: DirectoryEntryLike) => join(rootDir, entry.name))
    .sort((a: string, b: string) => a.localeCompare(b));

  if (rootFiles.length > 0) {
    const defaultCollection = await loadCollectionMetadata(rootDir, 'default');
    defaultCollection.id = 'default';
    if (!defaultCollection.name || defaultCollection.name === humanizeCollectionName('default')) {
      defaultCollection.name = 'Default';
    }
    for (const filePath of rootFiles) {
      jobs.push({ filePath, collection: defaultCollection, folder: buildFolderMetadata(defaultCollection.id, '') });
    }
  }

  // Each top-level subfolder acts as a collection, and nested subfolders become folder metadata.
  const collectionFolders = entries
    .filter((entry: DirectoryEntryLike) => entry.isDirectory())
    .sort((a: DirectoryEntryLike, b: DirectoryEntryLike) => a.name.localeCompare(b.name));
  for (const folder of collectionFolders) {
    if (IGNORED_COLLECTION_FOLDERS.has(folder.name.toLowerCase())) {
      console.log(`[weaviate-import] Skipping sample collection folder: ${folder.name}`);
      continue;
    }

    const folderPath = join(rootDir, folder.name);
    const collection = await loadCollectionMetadata(folderPath, folder.name);
    const collectionJobs = await discoverCollectionInterviewJobs(folderPath, collection);
    jobs.push(...collectionJobs);
  }

  return jobs.sort((a, b) => a.filePath.localeCompare(b.filePath));
}

type ProcessStoryRequest = {
  payload: any;
  collection: {
    id: string;
    name: string;
    description: string;
  };
  folder: {
    id: string;
    name: string;
    path: string;
  };
};

function wrapAsProcessRequest(raw: any, job: InterviewImportJob): ProcessStoryRequest {
  const payload = extractPayload(raw);

  return {
    payload,
    collection: {
      id: job.collection.id,
      name: job.collection.name,
      description: job.collection.description,
    },
    folder: job.folder,
  };
}

function getTestimonyUuid(raw: any, job: InterviewImportJob): string {
  const payload = extractPayload(raw);
  const storyId = getNestedString(payload, ['story', '_id']) || getNestedString(payload, ['transcript', 'storyId']);
  if (!storyId) {
    throw new Error(`[weaviate-import] Missing story id in ${job.filePath}. Expected payload.story._id or payload.transcript.storyId`);
  }
  return convertToUuid(`${job.collection.id.trim().toLowerCase() || 'default'}:${storyId}`);
}

async function weaviateObjectExists(className: string, objectId: string): Promise<boolean> {
  const url = `${WEAVIATE_URL}/v1/objects/${encodeURIComponent(className)}/${encodeURIComponent(objectId)}`;
  const res = await fetch(url);

  if (res.status === 404) {
    return false;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`[weaviate-import] Failed checking ${className}/${objectId}. HTTP ${res.status}. ${text}`);
  }

  return true;
}

async function countChunksForTestimony(testimonyUuid: string): Promise<number> {
  const query = `
    {
      Aggregate {
        Chunks(where: {path: ["theirstory_id"], operator: Equal, valueText: ${JSON.stringify(testimonyUuid)}}) {
          meta {
            count
          }
        }
      }
    }
  `;

  const res = await fetch(`${WEAVIATE_URL}/v1/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });

  const text = await res.text().catch(() => '');
  if (!res.ok) {
    throw new Error(`[weaviate-import] Failed checking chunks for ${testimonyUuid}. HTTP ${res.status}. ${text}`);
  }

  const parsed = JSON.parse(text);
  if (parsed.errors?.length) {
    throw new Error(`[weaviate-import] Failed checking chunks for ${testimonyUuid}. ${JSON.stringify(parsed.errors)}`);
  }

  return parsed?.data?.Aggregate?.Chunks?.[0]?.meta?.count ?? 0;
}

async function getExistingImportStatus(job: InterviewImportJob): Promise<SkippedInterviewImport | null> {
  const raw = await loadJson<any>(job.filePath);
  const testimonyUuid = getTestimonyUuid(raw, job);
  const testimonyExists = await weaviateObjectExists('Testimonies', testimonyUuid);

  if (!testimonyExists) {
    return null;
  }

  const chunkCount = await countChunksForTestimony(testimonyUuid);
  if (chunkCount <= 0) {
    return null;
  }

  return {
    filePath: job.filePath,
    collectionId: job.collection.id,
    testimonyUuid,
    chunkCount,
  };
}

async function processInterviewFileThroughNlp(job: InterviewImportJob): Promise<void> {
  const raw = await loadJson<any>(job.filePath);
  const body = wrapAsProcessRequest(raw, job);

  const url = `${NLP_URL}/process-story?write_to_weaviate=true&run_ner=true`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10 * 60 * 1000), // 10 minutes
  });

  const text = await res.text().catch(() => '');
  if (!res.ok) {
    throw new Error(
      `[weaviate-import] NLP process failed for ${job.filePath} (collection=${job.collection.id}). ` +
        `HTTP ${res.status}. ${text}`,
    );
  }

  try {
    const parsed = JSON.parse(text);
    const chunks = parsed?.counts?.chunks;
    console.log(`[weaviate-import] NLP OK: ${job.filePath} collection=${job.collection.id} chunks=${chunks ?? 'unknown'}`);
  } catch {
    console.log(`[weaviate-import] NLP OK: ${job.filePath} collection=${job.collection.id}`);
  }
}

function logCollectionSummary(jobs: InterviewImportJob[]): void {
  const byCollection = new Map<string, { name: string; count: number }>();

  for (const job of jobs) {
    const existing = byCollection.get(job.collection.id);
    if (existing) {
      existing.count += 1;
      continue;
    }
    byCollection.set(job.collection.id, {
      name: job.collection.name,
      count: 1,
    });
  }

  console.log(`[weaviate-import] Collections detected: ${byCollection.size}`);
  for (const [collectionId, info] of [...byCollection.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`[weaviate-import]   - ${collectionId} (${info.name}): ${info.count} interview(s)`);
  }
}

async function main(): Promise<void> {
  console.log(`[weaviate-import] WEAVIATE_URL=${WEAVIATE_URL}`);
  console.log(`[weaviate-import] INTERVIEWS_DIR=${INTERVIEWS_DIR}`);
  console.log(`[weaviate-import] RESET_WEAVIATE_DATA=${RESET_WEAVIATE_DATA}`);
  console.log(`[weaviate-import] SKIP_IMPORTED_INTERVIEWS=${SKIP_IMPORTED_INTERVIEWS}`);

  await waitForReady();
  if (RESET_WEAVIATE_DATA) {
    await clearAllData();
  } else {
    console.log('[weaviate-import] Keeping existing Weaviate data. Set RESET_WEAVIATE_DATA=true to clear before import.');
  }

  const jobs = await discoverInterviewJobs(INTERVIEWS_DIR);

  if (jobs.length === 0) {
    console.log('[weaviate-import] No interview json files found.');
    console.log('');
    console.log('==================================================');
    console.log('✅ Local Weaviate is READY');
    console.log(`📍 Weaviate: ${WEAVIATE_URL}`);
    console.log('⚠️  No interviews to import');
    console.log('==================================================');
    console.log('');
    return;
  }

  console.log(`[weaviate-import] Found ${jobs.length} interview json(s). Using NLP processor...`);
  logCollectionSummary(jobs);
  await waitForNlpReady();

  const failures: FailedInterviewImport[] = [];
  const skipped: SkippedInterviewImport[] = [];
  let processedCount = 0;

  for (const job of jobs) {
    if (SKIP_IMPORTED_INTERVIEWS) {
      try {
        const existing = await getExistingImportStatus(job);
        if (existing) {
          skipped.push(existing);
          console.log(
            `[weaviate-import] Already imported, skipping: ${job.filePath} ` +
              `collection=${job.collection.id} uuid=${existing.testimonyUuid} chunks=${existing.chunkCount}`,
          );
          continue;
        }
      } catch (error) {
        const formattedError = formatError(error);
        console.warn(`[weaviate-import] Existing-check failed; processing anyway: ${job.filePath}. ${formattedError}`);
      }
    }

    console.log(`[weaviate-import] NLP processing: ${job.filePath} collection=${job.collection.id}`);

    try {
      await processInterviewFileThroughNlp(job);
      processedCount += 1;
    } catch (error) {
      const formattedError = formatError(error);
      failures.push({
        filePath: job.filePath,
        collectionId: job.collection.id,
        error: formattedError,
      });
      console.warn(`[weaviate-import] NLP FAILED, skipping: ${job.filePath} collection=${job.collection.id}. ${formattedError}`);
    }
  }

  console.log('');
  console.log('==================================================');
  console.log('✅ Local Weaviate is READY');
  console.log(`📍 Weaviate: ${WEAVIATE_URL}`);
  console.log(
    `🧠 NLP: processed ${processedCount}, skipped already imported ${skipped.length}, failed ${failures.length}, total ${jobs.length}`,
  );
  if (skipped.length > 0) {
    console.log(`↷ Skipped already imported interview json(s): ${skipped.length}`);
  }
  if (failures.length > 0) {
    console.log(`⚠️  Failed interview json(s): ${failures.length}`);
    for (const failure of failures) {
      console.log(`   - ${failure.filePath} collection=${failure.collectionId}`);
      console.log(`     ${failure.error}`);
    }
    process.exitCode = 1;
  }
  console.log('==================================================');
  console.log('');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
