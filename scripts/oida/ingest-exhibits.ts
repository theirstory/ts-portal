#!/usr/bin/env node

/**
 * Ingest the OIDA exhibit corpus (document pages and images) into Weaviate.
 *
 * Reads json/oida/corpus.json (written by fetch-corpus.ts), embeds every page through the
 * nlp-processor's multimodal endpoint, and writes one Exhibits object per page.
 *
 * Each page is embedded from its page image plus its OCR text when both exist, so pages
 * whose meaning lives in the layout (charts, letterheads) and pages whose meaning lives in
 * the words are both retrievable. Photographs carry no OCR text at all and are therefore
 * reachable only through the image vector — which is the point of the exercise.
 *
 * The vectors land in the same space as transcript chunks, so one query vector retrieves
 * across recordings, documents, and images.
 *
 * Usage:
 *   yarn oida:ingest                    # embed + insert everything
 *   yarn oida:ingest --modality image   # ignore OCR text; embed page images only
 *   yarn oida:ingest --dry-run          # embed and report, but do not write to Weaviate
 *   yarn oida:ingest --limit 10         # first N pages only, for a quick loop
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

type EmbedModality = 'image+text' | 'image' | 'text';

type ExhibitPage = {
  page: number;
  imagePath: string;
  ocrText: string;
  ocrChars: number;
};

type ExhibitRecord = {
  id: string;
  kind: 'document' | 'image';
  imageCategory?: string;
  title: string;
  description: string;
  date: string;
  collectionName: string;
  collectionCode: string;
  exhibitNumber: string;
  custodians: string[];
  pageCount: number;
  sourceUrl: string;
  pdfPath: string;
  pages: ExhibitPage[];
};

type Corpus = {
  collection: { id: string; name: string; description: string };
  exhibits: ExhibitRecord[];
};

const ROOT = process.cwd();
const CORPUS_PATH = path.join(ROOT, 'json', 'oida', 'corpus.json');
const CALIBRATION_PATH = path.join(ROOT, 'json', 'oida', 'calibration.json');
const CLASS_NAME = 'Exhibits';
const VECTOR_NAME = 'content_vector';
const OCR_TEXT_LIMIT = 6000;
/** A page with less text than this is treated as having none. */
const MIN_OCR_CHARS = 40;

function buildWeaviateUrl(): string {
  const host = process.env.WEAVIATE_HOST_URL ?? 'localhost';
  const port = process.env.WEAVIATE_PORT ?? '8080';
  const secure = process.env.WEAVIATE_SECURE === 'true';
  return `${secure ? 'https' : 'http'}://${host}:${port}`;
}

function buildNlpUrl(): string {
  return process.env.NLP_PROCESSOR_URL ?? 'http://localhost:7070';
}

const WEAVIATE_URL = buildWeaviateUrl();
const NLP_URL = buildNlpUrl();

function parseArgs() {
  const argv = process.argv.slice(2);
  const modalityIndex = argv.indexOf('--modality');
  const limitIndex = argv.indexOf('--limit');
  const batchIndex = argv.indexOf('--batch-size');

  const modality = (modalityIndex >= 0 ? argv[modalityIndex + 1] : 'image+text') as EmbedModality;
  if (!['image+text', 'image', 'text'].includes(modality)) {
    throw new Error(`[oida] --modality must be one of image+text | image | text (got '${modality}')`);
  }

  return {
    modality,
    dryRun: argv.includes('--dry-run'),
    limit: limitIndex >= 0 ? Number(argv[limitIndex + 1]) : Infinity,
    batchSize: batchIndex >= 0 ? Number(argv[batchIndex + 1]) : 4,
  };
}

/** Deterministic UUIDv5-style id so re-running the ingest updates rather than duplicates. */
function pageUuid(sourceId: string, page: number): string {
  const namespace = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
  const hash = createHash('sha1');
  hash.update(Buffer.from(namespace.replace(/-/g, ''), 'hex'));
  hash.update(`${sourceId}#${page}`);
  const bytes = hash.digest();

  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

async function waitForService(name: string, url: string, attempts = 60): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`[oida] ${name} not reachable at ${url}`);
}

type EmbedItem = { text?: string; image_base64?: string };

async function embedBatch(items: EmbedItem[]): Promise<number[][]> {
  const res = await fetch(`${NLP_URL}/embed-multimodal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`[oida] embed failed: HTTP ${res.status} ${detail.slice(0, 400)}`);
  }

  const body = (await res.json()) as { vectors: number[][] };
  return body.vectors;
}

async function insertBatch(objects: unknown[]): Promise<void> {
  const res = await fetch(`${WEAVIATE_URL}/v1/batch/objects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ objects }),
  });

  const text = await res.text().catch(() => '');
  if (!res.ok) throw new Error(`[oida] Weaviate batch insert failed: HTTP ${res.status} ${text.slice(0, 500)}`);

  const parsed = text ? JSON.parse(text) : [];
  const results = Array.isArray(parsed) ? parsed : (parsed.objects ?? []);
  const failures = results.filter((item: any) => {
    const status = item?.result?.status;
    return item?.result?.errors || (status && String(status).toUpperCase() !== 'SUCCESS');
  });

  if (failures.length) {
    throw new Error(`[oida] ${failures.length} object(s) rejected: ${JSON.stringify(failures[0]).slice(0, 500)}`);
  }
}

function folderForExhibit(exhibit: ExhibitRecord): { id: string; name: string; path: string } {
  // Group by source type so the portal's existing folder filters can separate
  // documents from images without any UI-specific plumbing.
  const isImage = exhibit.kind === 'image';
  const segment = isImage ? (exhibit.imageCategory ?? 'images') : 'documents';
  const name = segment
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

  return { id: `oida-${segment}`, name, path: segment };
}

function toWeaviateDate(raw: string): string | null {
  if (!raw) return null;
  const year = /^\d{4}$/.test(raw) ? `${raw}-01-01` : raw;
  const parsed = new Date(year);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

async function main(): Promise<void> {
  const options = parseArgs();

  const corpus = JSON.parse(await readFile(CORPUS_PATH, 'utf-8')) as Corpus;

  console.log(`[oida] ingesting ${corpus.exhibits.length} exhibits (modality=${options.modality})`);

  if (!options.dryRun) {
    await waitForService('Weaviate', `${WEAVIATE_URL}/v1/.well-known/ready`);
  }
  await waitForService('nlp-processor', `${NLP_URL}/health`);

  type Task = {
    exhibit: ExhibitRecord;
    page: ExhibitPage;
    item: EmbedItem;
    modality: EmbedModality;
  };

  const tasks: Task[] = [];

  for (const exhibit of corpus.exhibits) {
    for (const page of exhibit.pages) {
      if (tasks.length >= options.limit) break;

      const hasText = page.ocrChars >= MIN_OCR_CHARS;
      const wantsImage = options.modality !== 'text';
      const wantsText = options.modality !== 'image' && hasText;

      // A page with no usable OCR text falls back to the item title, so a text-only run
      // still has something to embed rather than silently producing a zero vector.
      const text = wantsText
        ? page.ocrText.slice(0, OCR_TEXT_LIMIT)
        : options.modality === 'text'
          ? exhibit.title
          : '';

      const item: EmbedItem = {};
      if (wantsImage) {
        const absolute = path.join(ROOT, 'public', page.imagePath);
        item.image_base64 = (await readFile(absolute)).toString('base64');
      }
      if (text) item.text = text;

      const modality: EmbedModality = item.image_base64 && item.text ? 'image+text' : item.image_base64 ? 'image' : 'text';

      tasks.push({ exhibit, page, item, modality });
    }
  }

  console.log(`[oida] embedding ${tasks.length} pages in batches of ${options.batchSize}\n`);

  const vectors: number[][] = [];
  const startedAt = Date.now();

  for (let i = 0; i < tasks.length; i += options.batchSize) {
    const batch = tasks.slice(i, i + options.batchSize);
    const batchVectors = await embedBatch(batch.map((task) => task.item));
    vectors.push(...batchVectors);

    const done = Math.min(i + options.batchSize, tasks.length);
    const elapsed = (Date.now() - startedAt) / 1000;
    const rate = elapsed / done;
    const remaining = (tasks.length - done) * rate;
    console.log(
      `   ${String(done).padStart(3)}/${tasks.length} pages  ${elapsed.toFixed(0)}s elapsed  ` +
        `~${remaining.toFixed(0)}s left  (${rate.toFixed(1)}s/page)`,
    );
  }

  if (vectors.length !== tasks.length) {
    throw new Error(`[oida] embedding returned ${vectors.length} vectors for ${tasks.length} pages`);
  }

  const objects = tasks.map((task, index) => {
    const { exhibit, page } = task;
    const folder = folderForExhibit(exhibit);
    const isoDate = toWeaviateDate(exhibit.date);

    return {
      class: CLASS_NAME,
      id: pageUuid(exhibit.id, page.page),
      properties: {
        source_id: exhibit.id,
        source_type: exhibit.kind,
        image_category: exhibit.imageCategory ?? '',
        title: exhibit.title,
        description: exhibit.description,
        ocr_text: page.ocrText.slice(0, OCR_TEXT_LIMIT),
        page: page.page,
        page_count: exhibit.pageCount,
        collection_id: corpus.collection.id,
        collection_name: corpus.collection.name,
        collection_description: corpus.collection.description,
        folder_id: folder.id,
        folder_name: folder.name,
        folder_path: folder.path,
        exhibit_number: exhibit.exhibitNumber,
        custodians: exhibit.custodians,
        collection_code: exhibit.collectionCode,
        image_url: page.imagePath,
        thumbnail_url: page.imagePath,
        source_url: exhibit.sourceUrl,
        pdf_url: `${exhibit.sourceUrl}`,
        document_date: exhibit.date,
        related_ids: [],
        embedded_modality: task.modality,
        ...(isoDate ? { date: isoDate } : {}),
      },
      vectors: { [VECTOR_NAME]: vectors[index] },
    };
  });

  const modalityCounts = tasks.reduce<Record<string, number>>((acc, task) => {
    acc[task.modality] = (acc[task.modality] ?? 0) + 1;
    return acc;
  }, {});

  if (options.dryRun) {
    console.log(`\n[oida] dry run — ${objects.length} objects prepared, nothing written`);
    console.log(`   modality breakdown: ${JSON.stringify(modalityCounts)}`);
    return;
  }

  const insertBatchSize = 25;
  for (let i = 0; i < objects.length; i += insertBatchSize) {
    await insertBatch(objects.slice(i, i + insertBatchSize));
  }

  // Record the vector width actually written, so the search layer can detect a mismatch
  // between the index and the currently configured model.
  await writeFile(
    CALIBRATION_PATH,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        vectorDimension: vectors[0]?.length ?? 0,
        pagesIngested: objects.length,
        modalityCounts,
      },
      null,
      2,
    )}\n`,
    'utf-8',
  );

  console.log(`\n[oida] wrote ${objects.length} ${CLASS_NAME} objects (dim=${vectors[0]?.length ?? 0})`);
  console.log(`   modality breakdown: ${JSON.stringify(modalityCounts)}`);
}

main().catch((error) => {
  console.error('[oida] ingest failed:', error);
  process.exit(1);
});
