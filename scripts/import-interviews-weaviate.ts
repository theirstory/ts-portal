import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

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
const IGNORED_INTERVIEW_FILENAME = 'example-minimum-interview.json';
const IGNORED_COLLECTION_FOLDERS = new Set(['example-collection']);
const COLLECTION_META_JSON_FILES = new Set(['collection.json', 'collection.config.json']);
const COLLECTION_META_MD_FILES = ['COLLECTION.md', 'collection.md', 'README.md'];

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type CollectionMetadata = {
  id: string;
  name: string;
  description: string;
  folderPath: string;
};

type InterviewImportJob = {
  filePath: string;
  collection: CollectionMetadata;
};

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

  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // ignore
    }
    await sleep(1000);
  }

  throw new Error(`[weaviate-import] NLP not ready after timeout: ${url}`);
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

async function listInterviewJsonFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && isInterviewJsonFile(entry.name))
      .map((entry) => join(dir, entry.name))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

async function discoverInterviewJobs(rootDir: string): Promise<InterviewImportJob[]> {
  let entries: Awaited<ReturnType<typeof readdir>> = [];
  try {
    entries = await readdir(rootDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const jobs: InterviewImportJob[] = [];

  // Backward-compatible behavior: JSON files directly under root belong to "default" collection.
  const rootFiles = entries
    .filter((entry) => entry.isFile() && isInterviewJsonFile(entry.name))
    .map((entry) => join(rootDir, entry.name))
    .sort((a, b) => a.localeCompare(b));

  if (rootFiles.length > 0) {
    const defaultCollection = await loadCollectionMetadata(rootDir, 'default');
    defaultCollection.id = 'default';
    if (!defaultCollection.name || defaultCollection.name === humanizeCollectionName('default')) {
      defaultCollection.name = 'Default';
    }
    for (const filePath of rootFiles) {
      jobs.push({ filePath, collection: defaultCollection });
    }
  }

  // New behavior: each subfolder acts as a collection.
  const collectionFolders = entries.filter((entry) => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
  for (const folder of collectionFolders) {
    if (IGNORED_COLLECTION_FOLDERS.has(folder.name.toLowerCase())) {
      console.log(`[weaviate-import] Skipping sample collection folder: ${folder.name}`);
      continue;
    }

    const folderPath = join(rootDir, folder.name);
    const files = await listInterviewJsonFiles(folderPath);
    if (files.length === 0) continue;

    const collection = await loadCollectionMetadata(folderPath, folder.name);
    for (const filePath of files) {
      jobs.push({ filePath, collection });
    }
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
};

function wrapAsProcessRequest(raw: any, collection: CollectionMetadata): ProcessStoryRequest {
  const payload = raw && typeof raw === 'object' && raw.payload && typeof raw.payload === 'object' ? raw.payload : raw;

  return {
    payload,
    collection: {
      id: collection.id,
      name: collection.name,
      description: collection.description,
    },
  };
}

async function processInterviewFileThroughNlp(job: InterviewImportJob): Promise<void> {
  const raw = await loadJson<any>(job.filePath);
  const body = wrapAsProcessRequest(raw, job.collection);

  const url = `${NLP_URL}/process-story?write_to_weaviate=true&run_ner=true`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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

  await waitForReady();
  await clearAllData();

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

  for (const job of jobs) {
    await processInterviewFileThroughNlp(job);
  }

  console.log('');
  console.log('==================================================');
  console.log('✅ Local Weaviate is READY');
  console.log(`📍 Weaviate: ${WEAVIATE_URL}`);
  console.log('🧠 NLP: processed interview json(s) and wrote to Weaviate');
  console.log('==================================================');
  console.log('');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
