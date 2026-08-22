#!/usr/bin/env node

/**
 * Write the archival metadata from json/oida/corpus.json onto the Exhibits already in
 * Weaviate, without re-embedding anything.
 *
 * The vectors depend only on the page image and its OCR text, so adding Bates numbers,
 * case numbers, authors, and redaction status does not change them. A full re-ingest would
 * spend about seven minutes re-encoding pages to arrive at exactly the same vectors, so this
 * PATCHes properties instead and leaves them alone.
 *
 * Usage:
 *   yarn oida:update-metadata
 *   yarn oida:update-metadata --dry-run
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const PAGES_DIR = path.join(process.cwd(), 'public', 'oida', 'pages');

type ExhibitMetadata = {
  batesNumber: string;
  batesByPage: string[];
  caseNumbers: string[];
  authors: string[];
  recipients: string[];
  copied: string[];
  genre: string;
  industry: string;
  drugs: string[];
  conversation: string;
  dateSent: string;
  timeSent: string;
  dateReceived: string;
  attachments: string[];
  originalFilename: string;
  originalFormat: string;
  productionPath: string;
  redacted: string;
  redactionTypes: string[];
  redactedBy: string[];
  language: string;
  availability: string[];
  dateAdded: string;
  alternateTitle: string;
  idlShortId: string;
};

type ExhibitPage = { page: number; imagePath: string };
type WordBox = { t: string };
type ExhibitRecord = { id: string; title: string; pages: ExhibitPage[]; metadata?: ExhibitMetadata };
type Corpus = { exhibits: ExhibitRecord[] };

const ROOT = process.cwd();
const CORPUS_PATH = path.join(ROOT, 'json', 'oida', 'corpus.json');
const CLASS_NAME = 'Exhibits';

function buildWeaviateUrl(): string {
  const host = process.env.WEAVIATE_HOST_URL ?? 'localhost';
  const port = process.env.WEAVIATE_PORT ?? '8080';
  const secure = process.env.WEAVIATE_SECURE === 'true';
  return `${secure ? 'https' : 'http'}://${host}:${port}`;
}

const WEAVIATE_URL = buildWeaviateUrl();

/** Must match the id scheme used at ingest, or the PATCH would create orphans. */
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

/**
 * The Bates number for one page, and whether it had to be inferred.
 *
 * IDL records a single starting Bates per document even when each page carries its own, so
 * a later page's number is not supplied. But the number is *printed on the page*, and the
 * word coordinates extracted at ingest contain it — so where the stamp is legible it is read
 * off the page and returned as fact.
 *
 * Arithmetic is the fallback for pages whose stamp did not survive OCR. It is right whenever
 * numbering is sequential, which it usually is, but a production with attachments or gaps
 * can break it — hence the flag, so the UI can mark a calculated citation as calculated.
 */
async function batesForPage(
  metadata: ExhibitMetadata,
  exhibitId: string,
  page: ExhibitPage,
): Promise<{ value: string; derived: boolean }> {
  if (metadata.batesByPage.length >= page.page) {
    return { value: metadata.batesByPage[page.page - 1], derived: false };
  }
  if (!metadata.batesNumber) return { value: '', derived: false };
  if (page.page === 1) return { value: metadata.batesNumber, derived: false };

  const match = metadata.batesNumber.match(/^(.*?)(\d+)$/);
  if (!match) return { value: '', derived: false };

  const [, prefix, digits] = match;
  const expected = `${prefix}${String(Number(digits) + page.page - 1).padStart(digits.length, '0')}`;

  // Prefer the stamp actually printed on this page.
  try {
    const wordsPath = path.join(
      PAGES_DIR,
      exhibitId,
      `${path.basename(page.imagePath, '.png')}.words.json`,
    );
    const parsed = JSON.parse(await readFile(wordsPath, 'utf-8')) as { words: WordBox[] };
    // OCR often splits a stamp across tokens, so match against the page's joined text.
    const joined = parsed.words.map((word) => word.t).join('');
    const stampPattern = new RegExp(`${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\d{${digits.length}}`);
    const found = joined.match(stampPattern);
    if (found) return { value: found[0], derived: false };
  } catch {
    // No text layer on this page; fall through to arithmetic.
  }

  return { value: expected, derived: true };
}

function toProperties(
  metadata: ExhibitMetadata,
  perPageBates: string,
  batesIsDerived: boolean,
): Record<string, unknown> {
  return {
    bates_number: metadata.batesNumber,
    bates_by_page: perPageBates ? [perPageBates] : [],
    bates_is_derived: batesIsDerived,
    case_numbers: metadata.caseNumbers,
    authors: metadata.authors,
    recipients: metadata.recipients,
    copied: metadata.copied,
    genre: metadata.genre,
    industry: metadata.industry,
    drugs: metadata.drugs,
    alternate_title: metadata.alternateTitle,
    conversation: metadata.conversation,
    date_sent: metadata.dateSent,
    time_sent: metadata.timeSent,
    date_received: metadata.dateReceived,
    attachments: metadata.attachments,
    original_filename: metadata.originalFilename,
    original_format: metadata.originalFormat,
    production_path: metadata.productionPath,
    redacted: metadata.redacted,
    redaction_types: metadata.redactionTypes,
    redacted_by: metadata.redactedBy,
    language: metadata.language,
    availability: metadata.availability,
    date_added: metadata.dateAdded,
    idl_short_id: metadata.idlShortId,
  };
}

async function patchObject(uuid: string, properties: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${WEAVIATE_URL}/v1/objects/${CLASS_NAME}/${uuid}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ class: CLASS_NAME, properties }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`PATCH ${uuid} failed: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const corpus = JSON.parse(await readFile(CORPUS_PATH, 'utf-8')) as Corpus;

  const withMetadata = corpus.exhibits.filter((exhibit) => exhibit.metadata);
  if (!withMetadata.length) {
    console.log('[oida] no exhibit metadata in corpus.json — run `yarn oida:fetch` first');
    return;
  }

  console.log(`[oida] updating metadata on ${withMetadata.length} exhibits\n`);

  let updated = 0;
  let failed = 0;
  let derivedCount = 0;
  let readFromPage = 0;
  const populated = new Map<string, number>();

  for (const exhibit of withMetadata) {
    const metadata = exhibit.metadata as ExhibitMetadata;

    for (const [field, value] of Object.entries(metadata)) {
      const has = Array.isArray(value) ? value.length > 0 : Boolean(value);
      if (has) populated.set(field, (populated.get(field) ?? 0) + 1);
    }

    for (const page of exhibit.pages) {
      const bates = await batesForPage(metadata, exhibit.id, page);
      if (bates.derived) derivedCount += 1;
      else if (bates.value && page.page > 1) readFromPage += 1;

      const properties = toProperties(metadata, bates.value, bates.derived);

      if (dryRun) {
        updated += 1;
        continue;
      }

      try {
        await patchObject(pageUuid(exhibit.id, page.page), properties);
        updated += 1;
      } catch (error) {
        failed += 1;
        console.log(`   ✗ ${exhibit.id} p${page.page}: ${(error as Error).message.slice(0, 110)}`);
      }
    }

    const bates = metadata.batesNumber ? `bates ${metadata.batesNumber}` : 'no bates';
    const who = metadata.authors[0] ? ` · ${metadata.authors[0]}` : '';
    console.log(`   ${exhibit.id}  ${String(exhibit.pages.length).padStart(2)}pp  ${bates}${who}`);
  }

  console.log(`\n[oida] ${dryRun ? 'would update' : 'updated'} ${updated} page objects${failed ? `, ${failed} failed` : ''}`);
  console.log(
    `   per-page Bates: ${readFromPage} read from the page stamp, ${derivedCount} calculated from the document's first number`,
  );
  console.log('\n   field coverage across exhibits:');
  for (const [field, count] of [...populated.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`     ${field.padEnd(20)} ${count}/${withMetadata.length}`);
  }
}

main().catch((error) => {
  console.error('[oida] metadata update failed:', error);
  process.exit(1);
});
