#!/usr/bin/env node

/**
 * OIDA sample corpus fetcher.
 *
 * Reads json/oida/manifest.json (a curated list of UCSF Industry Documents Library ids),
 * resolves metadata from the IDL Solr API, then downloads the primary sources locally:
 *
 *   - recordings (video/audio) from the Internet Archive mirror -> media/oida/{video,audio}
 *   - exhibit PDFs + OCR sidecars from the IDL download host   -> media/oida/docs
 *   - one rendered page image per exhibit page (150 DPI PNG)   -> public/oida/pages/<id>
 *
 * IDL ships a single OCR sidecar per document with form-feed page separators, so per-page
 * text is recovered by splitting on \f rather than re-OCRing anything.
 *
 * Output: json/oida/corpus.json — the resolved corpus with local paths, consumed by
 * scripts/oida/ingest-exhibits.ts and scripts/oida/theirstory-upload-manifest.ts.
 *
 * Usage:
 *   yarn oida:fetch                  # everything
 *   yarn oida:fetch --skip-video     # metadata + exhibits only (video is the slow leg)
 *   yarn oida:fetch --max-pages 10   # cap pages rendered per document
 */

import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);

const SOLR_URL = 'https://solr.idl.ucsf.edu/solr/ltdl3/select';
const IDL_DOWNLOAD = 'https://download.industrydocuments.ucsf.edu';
const IA_DOWNLOAD = 'https://archive.org/download';
const IA_METADATA = 'https://archive.org/metadata';
const USER_AGENT = 'Mozilla/5.0 (ts-portal multimodal research corpus)';

const ROOT = process.cwd();
const MANIFEST_PATH = path.join(ROOT, 'json', 'oida', 'manifest.json');
const CORPUS_PATH = path.join(ROOT, 'json', 'oida', 'corpus.json');
const MEDIA_DIR = path.join(ROOT, 'media', 'oida');
const DOCS_DIR = path.join(MEDIA_DIR, 'docs');
const PAGES_DIR = path.join(ROOT, 'public', 'oida', 'pages');
const RENDER_DPI = 150;

type Manifest = {
  collection: { id: string; name: string; description: string };
  recordings: {
    video: { id: string; part: string; role?: string }[];
    audio: { id: string; note?: string }[];
  };
  exhibits: {
    documents: string[];
    images: Record<string, string[]>;
  };
};

/**
 * One IDL Solr record. The field names are the library's own two-letter conventions:
 * `ti` title, `au` author, `rc` recipient, `bn` Bates number, `dd` document date, and so on.
 */
type SolrDoc = {
  id: string;
  ti?: string;
  ot?: string;
  desc?: string;
  dd?: string | number;
  ddu?: string;
  dt?: string[];
  pg?: string | number;
  type?: string | string[];
  collection?: string[];
  collectioncode?: string[];
  custodian?: string[];
  en?: string;
  genre?: string;
  originalformat?: string;
  related?: string[];
  artifact?: string[];
  access?: string | string[];
  // Litigation provenance.
  bn?: string;
  pgmap?: string[];
  case?: string[];
  au?: string[];
  rc?: string[];
  cc?: string[];
  fn?: string;
  // Email fields, present on produced correspondence.
  conversation?: string;
  datesent?: string;
  timesent?: string;
  datereceived?: string;
  timereceived?: string;
  attachment?: string[];
  attachmentnum?: number[];
  // Production and access.
  filename?: string;
  filepath?: string[];
  redact?: string;
  redaction?: string[];
  redactedby?: string[];
  lg?: string;
  industry?: string;
  industrycode?: string;
  dg?: string[];
  availability?: string[];
  availabilitystatus?: string[];
  tid?: string;
  [key: string]: unknown;
};

export type ExhibitPage = {
  page: number;
  imagePath: string;
  ocrText: string;
  ocrChars: number;
};

/** The archival metadata IDL holds for an exhibit, beyond what is needed to render it. */
export type ExhibitMetadata = {
  /** Bates number: the identifier a filing cites this document by. */
  batesNumber: string;
  /** Per-page Bates numbers, where the library records them. */
  batesByPage: string[];
  caseNumbers: string[];
  authors: string[];
  recipients: string[];
  copied: string[];
  genre: string;
  industry: string;
  drugs: string[];
  /** Email header fields, present on produced correspondence. */
  conversation: string;
  dateSent: string;
  timeSent: string;
  dateReceived: string;
  attachments: string[];
  /** How the file arrived in the production. */
  originalFilename: string;
  originalFormat: string;
  productionPath: string;
  /** Redaction, which a researcher needs to know before quoting. */
  redacted: string;
  redactionTypes: string[];
  redactedBy: string[];
  language: string;
  availability: string[];
  dateAdded: string;
  alternateTitle: string;
  idlShortId: string;
};

export type ExhibitRecord = {
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
  metadata: ExhibitMetadata;
};

export type RecordingRecord = {
  id: string;
  kind: 'video' | 'audio';
  title: string;
  description: string;
  role: string;
  date: string;
  collectionName: string;
  collectionCode: string;
  genre: string;
  sourceUrl: string;
  archiveUrl: string;
  mediaPath: string;
  mediaBytes: number;
  durationSeconds: number;
  relatedIds: string[];
  idlTranscriptChars: number;
};

export type Corpus = {
  generatedAt: string;
  collection: Manifest['collection'];
  recordings: RecordingRecord[];
  exhibits: ExhibitRecord[];
};

function parseArgs() {
  const argv = process.argv.slice(2);
  const maxPagesIndex = argv.indexOf('--max-pages');
  return {
    skipVideo: argv.includes('--skip-video'),
    skipAudio: argv.includes('--skip-audio'),
    skipExhibits: argv.includes('--skip-exhibits'),
    maxPages: maxPagesIndex >= 0 ? Number(argv[maxPagesIndex + 1]) : 40,
  };
}

/** IDL lays artifacts out under a fan-out path built from the first four id characters. */
function idlBase(id: string): string {
  const fan = id.slice(0, 4).split('').join('/');
  return `${IDL_DOWNLOAD}/${fan}/${id}/${id}`;
}

function first<T>(value: T | T[] | undefined, fallback: T): T {
  if (Array.isArray(value)) return value.length ? value[0] : fallback;
  return value ?? fallback;
}

function asString(value: unknown, fallback = ''): string {
  if (value === undefined || value === null) return fallback;
  return String(value);
}

async function fileExists(filePath: string): Promise<number | null> {
  try {
    const info = await stat(filePath);
    return info.size;
  } catch {
    return null;
  }
}

/**
 * The Internet Archive throttles and intermittently 502s under concurrent load, so every
 * request goes through a bounded retry with linear backoff.
 */
async function fetchWithRetry(url: string, attempts = 5): Promise<Response> {
  let lastError = '';

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (res.ok) return res;
      lastError = `HTTP ${res.status}`;
      // 404 is a real answer, not a transient failure.
      if (res.status === 404) break;
    } catch (error) {
      lastError = (error as Error).message;
    }

    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 4000));
  }

  throw new Error(`${lastError} for ${url}`);
}

async function solrLookup(ids: string[]): Promise<Map<string, SolrDoc>> {
  const found = new Map<string, SolrDoc>();
  const batchSize = 25;

  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const params = new URLSearchParams({
      q: `id:(${batch.join(' OR ')})`,
      rows: String(batch.length),
      // Everything IDL populates. A hand-picked list silently drops the fields that
      // matter most to a legal researcher — Bates numbers, case numbers, author and
      // recipient, redaction status — so the record is taken whole and filtered later.
      fl: '*',
      wt: 'json',
    });

    const res = await fetch(`${SOLR_URL}?${params}`, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) throw new Error(`[oida] Solr lookup failed: HTTP ${res.status}`);

    const body = (await res.json()) as { response: { docs: SolrDoc[] } };
    for (const doc of body.response.docs) found.set(doc.id, doc);
  }

  return found;
}

async function download(url: string, destination: string): Promise<number> {
  const existing = await fileExists(destination);
  if (existing) return existing;

  const res = await fetchWithRetry(url);
  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(destination, buffer);
  return buffer.byteLength;
}

async function tryDownloadText(url: string, destination: string): Promise<string> {
  try {
    await download(url, destination);
    return await readFile(destination, 'utf-8');
  } catch {
    return '';
  }
}

async function pdfPageCount(pdfPath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync('pdfinfo', [pdfPath]);
    const match = stdout.match(/^Pages:\s+(\d+)/m);
    return match ? Number(match[1]) : 0;
  } catch {
    return 0;
  }
}

/**
 * Render pages to PNG. pdftoppm writes <prefix>-<n>.png, zero-padded to the page-count width.
 */
async function renderPages(pdfPath: string, outputDir: string, pageCount: number): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  const prefix = path.join(outputDir, 'p');

  await execFileAsync('pdftoppm', [
    '-png',
    '-r',
    String(RENDER_DPI),
    '-f',
    '1',
    '-l',
    String(pageCount),
    pdfPath,
    prefix,
  ]);
}

/** pdftoppm zero-pads the page suffix to the width of the last page number it was given. */
function renderedPageName(page: number, pageCount: number): string {
  const width = String(pageCount).length;
  return `p-${String(page).padStart(width, '0')}.png`;
}

/** IDL OCR sidecars separate pages with form feeds. */
function splitOcrByPage(ocrText: string, pageCount: number): string[] {
  const cleaned = ocrText.replace(/\r\n/g, '\n');
  const parts = cleaned
    .split('\f')
    .map((part) => part.trim())
    .filter((part, index, all) => !(index === all.length - 1 && part.length === 0));

  if (parts.length === pageCount) return parts;

  // Some sidecars carry a leading banner or a trailing empty segment; pad or trim to fit.
  if (parts.length > pageCount) return parts.slice(0, pageCount);
  return [...parts, ...Array(pageCount - parts.length).fill('')];
}

async function fetchArchiveMetadata(archiveId: string): Promise<{ files: any[]; title: string }> {
  const res = await fetchWithRetry(`${IA_METADATA}/${archiveId}`);
  const body = (await res.json()) as { files?: any[]; metadata?: { title?: string } };
  return { files: body.files ?? [], title: body.metadata?.title ?? '' };
}

/** IDL writes "N/A" where a field does not apply; that is absence, not a value. */
function isPlaceholder(value: string): boolean {
  return !value || ['n/a', 'na', 'none', 'unknown'].includes(value.trim().toLowerCase());
}

function cleanList(value: unknown): string[] {
  const items = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  return items.map((item) => String(item).trim()).filter((item) => !isPlaceholder(item));
}

function cleanString(value: unknown): string {
  const [first] = cleanList(value);
  return first ?? '';
}

/**
 * IDL's "other title" (`ot`) is sometimes a genuine alternate title and sometimes the
 * document's entire extracted text — on email exhibits it can be the whole thread. Keep it
 * only when it reads like a title: different from the main one, and short enough to be one.
 */
const MAX_ALTERNATE_TITLE_CHARS = 180;

function alternateTitle(doc: SolrDoc): string {
  const other = cleanString(doc.ot);
  const main = cleanString(doc.ti);

  if (!other || other === main) return '';
  if (other.length > MAX_ALTERNATE_TITLE_CHARS) return '';
  return other;
}

function buildMetadata(doc: SolrDoc): ExhibitMetadata {
  return {
    batesNumber: cleanString(doc.bn),
    batesByPage: cleanList(doc.pgmap),
    caseNumbers: cleanList(doc.case),
    authors: cleanList(doc.au),
    recipients: cleanList(doc.rc),
    copied: cleanList(doc.cc),
    genre: cleanString(doc.genre),
    industry: cleanString(doc.industry),
    drugs: cleanList(doc.dg),
    conversation: cleanString(doc.conversation),
    dateSent: cleanString(doc.datesent),
    timeSent: cleanString(doc.timesent),
    dateReceived: cleanString(doc.datereceived),
    attachments: cleanList(doc.attachment),
    originalFilename: cleanString(doc.filename),
    originalFormat: cleanString(doc.originalformat),
    productionPath: cleanString(doc.filepath),
    redacted: cleanString(doc.redact),
    redactionTypes: cleanList(doc.redaction),
    redactedBy: cleanList(doc.redactedby),
    language: cleanString(doc.lg),
    availability: cleanList(doc.availability),
    dateAdded: cleanString(doc.ddu),
    alternateTitle: alternateTitle(doc),
    idlShortId: cleanString(doc.tid),
  };
}

async function buildExhibit(
  id: string,
  kind: 'document' | 'image',
  imageCategory: string | undefined,
  doc: SolrDoc,
  maxPages: number,
): Promise<ExhibitRecord | null> {
  const pdfPath = path.join(DOCS_DIR, `${id}.pdf`);
  const ocrPath = path.join(DOCS_DIR, `${id}.ocr`);

  try {
    await download(`${idlBase(id)}.pdf`, pdfPath);
  } catch (error) {
    console.log(`   ✗ ${id}: PDF download failed (${(error as Error).message})`);
    return null;
  }

  const ocrText = await tryDownloadText(`${idlBase(id)}.ocr`, ocrPath);

  const totalPages = (await pdfPageCount(pdfPath)) || Number(asString(doc.pg, '1')) || 1;
  const renderCount = Math.min(totalPages, maxPages);
  const pageDir = path.join(PAGES_DIR, id);

  try {
    await renderPages(pdfPath, pageDir, renderCount);
  } catch (error) {
    console.log(`   ✗ ${id}: page render failed (${(error as Error).message})`);
    return null;
  }

  const ocrPages = splitOcrByPage(ocrText, totalPages);
  const pages: ExhibitPage[] = [];

  for (let page = 1; page <= renderCount; page++) {
    const fileName = renderedPageName(page, renderCount);
    const absolute = path.join(pageDir, fileName);
    if (!(await fileExists(absolute))) continue;

    const text = ocrPages[page - 1] ?? '';
    pages.push({
      page,
      imagePath: `/oida/pages/${id}/${fileName}`,
      ocrText: text,
      ocrChars: text.length,
    });
  }

  return {
    id,
    kind,
    imageCategory,
    title: asString(doc.ti, id).trim(),
    description: asString(doc.desc).trim(),
    date: asString(doc.dd),
    collectionName: first(doc.collection, ''),
    collectionCode: first(doc.collectioncode, ''),
    exhibitNumber: asString(doc.en),
    custodians: doc.custodian ?? [],
    pageCount: totalPages,
    sourceUrl: `https://www.industrydocuments.ucsf.edu/docs/${id}`,
    pdfPath: path.relative(ROOT, pdfPath),
    pages,
    metadata: buildMetadata(doc),
  };
}

async function buildRecording(
  entry: { id: string; part?: string; role?: string; note?: string },
  kind: 'video' | 'audio',
  doc: SolrDoc,
  skip: boolean,
): Promise<RecordingRecord | null> {
  const { id } = entry;
  const archiveId = `opioids_${id}`;
  const title = asString(doc.ti, id).trim();

  let mediaName = '';
  let durationSeconds = 0;
  let mediaBytes = 0;
  let mediaCandidates: { name: string; bytes: number; seconds: number }[] = [];

  try {
    const { files } = await fetchArchiveMetadata(archiveId);
    const candidates = files.filter((file: any) => {
      const name = String(file.name ?? '');
      if (name.includes('.ia.')) return false;
      if (kind === 'video') return name.endsWith('.mp4');
      return /\.(m4a|mp3|ogg|wav)$/i.test(name);
    });

    if (!candidates.length) {
      console.log(`   ✗ ${id}: no ${kind} derivative on the Internet Archive`);
      return null;
    }

    // Videos are split into parts; the manifest names which one to take. For audio, IA
    // sometimes lists derivatives it cannot actually serve, so keep every candidate and
    // fall through them at download time.
    const ordered = entry.part
      ? [
          ...candidates.filter((file: any) => String(file.name).includes(`-${entry.part}.`)),
          ...candidates.filter((file: any) => !String(file.name).includes(`-${entry.part}.`)),
        ]
      : candidates.sort((a: any, b: any) => Number(b.size ?? 0) - Number(a.size ?? 0));

    mediaCandidates = ordered.map((file: any) => ({
      name: String(file.name),
      bytes: Number(file.size ?? 0) || 0,
      seconds: Number(file.length ?? 0) || 0,
    }));

    mediaName = mediaCandidates[0].name;
    durationSeconds = mediaCandidates[0].seconds;
    mediaBytes = mediaCandidates[0].bytes;
  } catch (error) {
    console.log(`   ✗ ${id}: ${(error as Error).message}`);
    return null;
  }

  const targetDir = path.join(MEDIA_DIR, kind);
  let mediaPath = path.join(targetDir, mediaName);

  if (!skip) {
    let landed = false;
    for (const candidate of mediaCandidates) {
      const attemptPath = path.join(targetDir, candidate.name);
      try {
        mediaBytes = await download(`${IA_DOWNLOAD}/${archiveId}/${candidate.name}`, attemptPath);
        mediaPath = attemptPath;
        mediaName = candidate.name;
        durationSeconds = candidate.seconds || durationSeconds;
        landed = true;
        break;
      } catch {
        // Try the next derivative.
      }
    }
    if (!landed) console.log(`   ✗ ${id}: no downloadable ${kind} derivative (tried ${mediaCandidates.length})`);
  }

  const onDisk = await fileExists(mediaPath);
  const idlTranscript = await tryDownloadText(`${idlBase(id)}.ocr`, path.join(DOCS_DIR, `${id}.ocr`));

  return {
    id,
    kind,
    title,
    description: asString(doc.desc).trim() || entry.note || '',
    role: entry.role ?? '',
    date: asString(doc.dd),
    collectionName: first(doc.collection, ''),
    collectionCode: first(doc.collectioncode, ''),
    genre: asString(doc.genre),
    sourceUrl: `https://www.industrydocuments.ucsf.edu/docs/${id}`,
    archiveUrl: `https://archive.org/details/${archiveId}`,
    mediaPath: onDisk ? path.relative(ROOT, mediaPath) : '',
    mediaBytes: onDisk ?? mediaBytes,
    durationSeconds,
    relatedIds: doc.related ?? [],
    idlTranscriptChars: idlTranscript.length,
  };
}

async function readExistingCorpus(): Promise<Corpus | null> {
  try {
    return JSON.parse(await readFile(CORPUS_PATH, 'utf-8')) as Corpus;
  } catch {
    return null;
  }
}

/**
 * Keep previously-resolved entries that this run skipped, but only for ids the manifest
 * still declares.
 *
 * A plain union was wrong: it meant removing an entry from the manifest never removed it
 * from the corpus, so an excluded recording silently persisted through every later run.
 * The manifest is the authority on what belongs; the previous file only supplies detail for
 * work this invocation chose not to redo.
 */
function mergeById<T extends { id: string }>(previous: T[], current: T[], declaredIds: Set<string>): T[] {
  const merged = new Map(previous.filter((entry) => declaredIds.has(entry.id)).map((entry) => [entry.id, entry]));
  for (const entry of current) merged.set(entry.id, entry);
  return [...merged.values()];
}

async function main(): Promise<void> {
  const options = parseArgs();

  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf-8')) as Manifest;
  await mkdir(DOCS_DIR, { recursive: true });
  await mkdir(path.join(MEDIA_DIR, 'video'), { recursive: true });
  await mkdir(path.join(MEDIA_DIR, 'audio'), { recursive: true });
  await mkdir(PAGES_DIR, { recursive: true });

  const imageEntries = Object.entries(manifest.exhibits.images).filter(([key]) => !key.startsWith('_'));
  const imageIds = imageEntries.flatMap(([, ids]) => ids);
  const categoryById = new Map<string, string>();
  for (const [category, ids] of imageEntries) {
    for (const id of ids) categoryById.set(id, category);
  }

  const allIds = [
    ...manifest.recordings.video.map((entry) => entry.id),
    ...manifest.recordings.audio.map((entry) => entry.id),
    ...manifest.exhibits.documents,
    ...imageIds,
  ];

  console.log(`[oida] resolving ${allIds.length} ids against the IDL Solr API`);
  const metadata = await solrLookup(allIds);
  const missing = allIds.filter((id) => !metadata.has(id));
  if (missing.length) console.log(`[oida] ⚠ not found in Solr: ${missing.join(', ')}`);

  const recordings: RecordingRecord[] = [];
  const exhibits: ExhibitRecord[] = [];

  console.log(`\n[oida] recordings — video (${manifest.recordings.video.length})`);
  for (const entry of manifest.recordings.video) {
    const doc = metadata.get(entry.id);
    if (!doc) continue;
    const record = await buildRecording(entry, 'video', doc, options.skipVideo);
    if (record) {
      recordings.push(record);
      const size = record.mediaBytes ? `${(record.mediaBytes / 1e6).toFixed(0)}MB` : 'pending';
      const mins = record.durationSeconds ? `${(record.durationSeconds / 60).toFixed(0)}min` : '?';
      console.log(`   ✓ ${entry.id} ${size.padStart(7)} ${mins.padStart(6)}  ${record.title.slice(0, 62)}`);
    }
  }

  console.log(`\n[oida] recordings — audio (${manifest.recordings.audio.length})`);
  for (const entry of manifest.recordings.audio) {
    const doc = metadata.get(entry.id);
    if (!doc) continue;
    const record = await buildRecording(entry, 'audio', doc, options.skipAudio);
    if (record) {
      recordings.push(record);
      const size = record.mediaBytes ? `${(record.mediaBytes / 1e3).toFixed(0)}KB` : 'pending';
      console.log(`   ✓ ${entry.id} ${size.padStart(7)}  ${record.title.slice(0, 62)}`);
    }
  }

  if (!options.skipExhibits) {
    console.log(`\n[oida] exhibits — documents (${manifest.exhibits.documents.length})`);
    for (const id of manifest.exhibits.documents) {
      const doc = metadata.get(id);
      if (!doc) continue;
      const record = await buildExhibit(id, 'document', undefined, doc, options.maxPages);
      if (record) {
        exhibits.push(record);
        const withText = record.pages.filter((page) => page.ocrChars > 40).length;
        console.log(
          `   ✓ ${id} ${String(record.pages.length).padStart(3)}pp (${withText} with text)  ${record.title.slice(0, 56)}`,
        );
      }
    }

    console.log(`\n[oida] exhibits — images (${imageIds.length})`);
    for (const id of imageIds) {
      const doc = metadata.get(id);
      if (!doc) continue;
      const record = await buildExhibit(id, 'image', categoryById.get(id), doc, options.maxPages);
      if (record) {
        exhibits.push(record);
        const chars = record.pages[0]?.ocrChars ?? 0;
        console.log(
          `   ✓ ${id} ocr=${String(chars).padStart(5)} ${(record.imageCategory ?? '').padEnd(12)} ${record.title.slice(0, 52)}`,
        );
      }
    }
  }

  // Skipped sections must be carried over from the previous run, not blanked: fetching only
  // the audio (--skip-exhibits) would otherwise wipe the exhibit records that the ingest
  // depends on, even though their files are still on disk.
  const previous = await readExistingCorpus();

  const declaredRecordingIds = new Set([
    ...manifest.recordings.video.map((entry) => entry.id),
    ...manifest.recordings.audio.map((entry) => entry.id),
  ]);

  const corpus: Corpus = {
    generatedAt: new Date().toISOString(),
    collection: manifest.collection,
    recordings: mergeById(previous?.recordings ?? [], recordings, declaredRecordingIds),
    exhibits: options.skipExhibits ? (previous?.exhibits ?? exhibits) : exhibits,
  };

  await writeFile(CORPUS_PATH, `${JSON.stringify(corpus, null, 2)}\n`, 'utf-8');

  // Report what the file now contains, not just what this run fetched — otherwise a
  // --skip-exhibits run claims zero exhibits while writing all of them.
  const pageTotal = corpus.exhibits.reduce((sum, exhibit) => sum + exhibit.pages.length, 0);
  const imageOnly = corpus.exhibits.flatMap((e) => e.pages).filter((page) => page.ocrChars <= 40).length;
  const mediaBytes = corpus.recordings.reduce((sum, record) => sum + record.mediaBytes, 0);
  const dropped = (previous?.recordings.length ?? 0) - corpus.recordings.length;

  console.log(`\n[oida] corpus written to ${path.relative(ROOT, CORPUS_PATH)}`);
  console.log(`   recordings: ${corpus.recordings.length} (${(mediaBytes / 1e9).toFixed(2)} GB on disk)`);
  if (dropped > 0) console.log(`   dropped ${dropped} recording(s) no longer listed in the manifest`);
  console.log(`   exhibits:   ${corpus.exhibits.length} items / ${pageTotal} pages`);
  console.log(`   pages with little or no OCR text (image-only retrieval): ${imageOnly}`);
}

main().catch((error) => {
  console.error('[oida] fetch failed:', error);
  process.exit(1);
});
