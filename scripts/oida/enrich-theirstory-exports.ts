#!/usr/bin/env node

/**
 * Restore archival metadata onto interview JSONs exported from TheirStory.
 *
 * TheirStory only knows what was uploaded to it: a media file. So the exports come back
 * titled by filename ("fgxh0257-0001") and dated by upload day, which would surface in the
 * portal's gallery and search results instead of "Deposition of Mark Trudeau, President and
 * CEO" recorded in 2020. This maps each export back to its Industry Documents Library record
 * — by the document id embedded in the uploaded filename — and restores:
 *
 *   - story.title        the IDL title, including the deponent's role
 *   - story.record_date  the date the deposition was taken, not the day it was uploaded
 *   - story.description  TheirStory's generated summary, plus a provenance line
 *
 * It also normalises audio playback URLs (see normaliseMuxAudioUrl).
 *
 * Everything else, including the transcript, word timings, and Mux playback URL, is left
 * untouched. Idempotent: re-running after a fresh import is safe.
 *
 * Usage:
 *   yarn oida:enrich-exports
 *   yarn oida:enrich-exports --dir json/interviews/oida-opioid-archive/recordings
 *   yarn oida:enrich-exports --dry-run
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

type RecordingRecord = {
  id: string;
  kind: 'video' | 'audio';
  title: string;
  description: string;
  role: string;
  date: string;
  collectionName: string;
  collectionCode: string;
  sourceUrl: string;
  archiveUrl: string;
  relatedIds: string[];
};

type Corpus = { recordings: RecordingRecord[] };

const ROOT = process.cwd();
const CORPUS_PATH = path.join(ROOT, 'json', 'oida', 'corpus.json');
const DEFAULT_DIR = path.join('json', 'interviews', 'oida-opioid-archive', 'recordings');
/** Marks a description as already carrying provenance, so re-runs do not stack it. */
const PROVENANCE_MARKER = 'Source: Opioid Industry Documents Archive';

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

function parseArgs() {
  const argv = process.argv.slice(2);
  const dirIndex = argv.indexOf('--dir');
  return {
    dir: dirIndex >= 0 ? argv[dirIndex + 1] : DEFAULT_DIR,
    dryRun: argv.includes('--dry-run'),
  };
}

/**
 * Recover the IDL document id, which appears in both the export filename
 * ("ts-portal-fgxh0257-0001-video.json") and, before enrichment, the story title
 * ("fgxh0257-0001", "opioids_ffnj0279", "gxdc0283").
 *
 * The filename is checked first, and that is what makes re-runs safe: enrichment replaces
 * the title with a human one ("Deposition of Mark Trudeau, President and CEO"), which no
 * longer contains the id, so a title-only lookup would match nothing on a second pass.
 */
function findIdlId(...candidates: string[]): string | null {
  for (const candidate of candidates) {
    const match = (candidate ?? '').match(/([a-z]{4}\d{4})/i);
    if (match) return match[1].toLowerCase();
  }
  return null;
}

/** IDL dates arrive as "2020 October 02", "2020 October", or "2014". */
function toIsoDate(raw: string): string | null {
  const value = (raw ?? '').trim();
  if (!value) return null;

  const match = value.match(/^(\d{4})(?:\s+([A-Za-z]+))?(?:\s+(\d{1,2}))?$/);
  if (match) {
    const year = Number(match[1]);
    const month = match[2] ? (MONTHS[match[2].toLowerCase()] ?? 0) : 0;
    const day = match[3] ? Number(match[3]) : 1;
    return new Date(Date.UTC(year, month, day)).toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Some IDL records are themselves titled by filename — the voicemails come through as
 * "VOICEATT.WAV" and "message.wav" — so copying the IDL title verbatim would just move the
 * problem. For those, build a readable title from the catalogue description and year.
 */
function looksLikeFilename(title: string): boolean {
  const value = title.trim();
  if (!value) return true;
  if (/\.(wav|mp3|m4a|mp4|mov|pdf|tif|jpe?g|png|docx?|msg|eml)$/i.test(value)) return true;
  // A real title has words; an identifier or filename usually does not.
  return !/\s/.test(value);
}

function buildTitle(record: RecordingRecord): string {
  if (!looksLikeFilename(record.title)) return record.title;

  // Drop parenthetical format hints ("(m4a)") that describe the file, not the content.
  const label = (record.description || `${record.kind} recording`).replace(/\s*\([^)]*\)\s*$/, '').trim();
  const readable = label.charAt(0).toUpperCase() + label.slice(1);
  const year = (record.date ?? '').match(/\d{4}/)?.[0];

  return year ? `${readable}, ${year}` : readable;
}

/**
 * Point audio-only recordings at their HLS manifest instead of the static rendition.
 *
 * TheirStory publishes audio assets as `https://stream.mux.com/<id>/audio.m4a`. Every player
 * in the portal hands that URL straight to mux-player as `src`, and mux-player cannot infer a
 * playable type from the `.m4a` extension — it fails with "Media type  is an unrecognized or
 * unsupported type" and no audio plays. The file itself is fine (HTTP 200, audio/m4a); only
 * the container is unrecognised.
 *
 * `https://stream.mux.com/<id>.m3u8` is the form mux-player expects, and the one the
 * _hlsConfig in StoryVideo is already tuned for. Fixing it here rather than in a component
 * fixes the story page, the Discover side panel, and the floating chat drawer together,
 * since all four players pass this same field.
 *
 * Video keeps its `highest.mp4` rendition, which mux-player types correctly and which works.
 */
function normaliseMuxAudioUrl(url: string): string {
  const match = (url ?? '').match(/^https:\/\/stream\.mux\.com\/([^./?]+)\/audio\.m4a(\?.*)?$/);
  return match ? `https://stream.mux.com/${match[1]}.m3u8` : url;
}

function buildDescription(existing: string, record: RecordingRecord): string {
  const summary = (existing ?? '').trim();
  if (summary.includes(PROVENANCE_MARKER)) return summary;

  const provenance =
    `${PROVENANCE_MARKER} — ${record.collectionName} (${record.collectionCode}), ` +
    `document ${record.id}. ${record.sourceUrl}`;

  // TheirStory's summary describes what is discussed; the provenance line says where it
  // came from. Both matter to a researcher, so keep the summary and append.
  return summary ? `${summary}\n\n${provenance}` : provenance;
}

async function main(): Promise<void> {
  const options = parseArgs();
  const targetDir = path.isAbsolute(options.dir) ? options.dir : path.join(ROOT, options.dir);

  const corpus = JSON.parse(await readFile(CORPUS_PATH, 'utf-8')) as Corpus;
  const byId = new Map(corpus.recordings.map((record) => [record.id, record]));

  const entries = (await readdir(targetDir)).filter((name) => name.toLowerCase().endsWith('.json'));
  if (!entries.length) {
    console.log(`[oida] no interview JSONs in ${options.dir}`);
    return;
  }

  console.log(`[oida] enriching ${entries.length} interview JSONs in ${options.dir}\n`);

  let updated = 0;
  let unmatched = 0;

  for (const entry of entries.sort()) {
    const filePath = path.join(targetDir, entry);
    const raw = JSON.parse(await readFile(filePath, 'utf-8'));
    const payload = raw.payload ?? raw;
    const story = payload.story;

    if (!story) {
      console.log(`   ✗ ${entry}: no story object`);
      unmatched += 1;
      continue;
    }

    const idlId = findIdlId(entry, String(story.title ?? ''));
    const record = idlId ? byId.get(idlId) : undefined;

    if (!record) {
      console.log(`   ✗ ${entry}: no IDL record found (title "${story.title}")`);
      unmatched += 1;
      continue;
    }

    const previousTitle = String(story.title ?? '');
    const nextTitle = buildTitle(record);
    story.title = nextTitle;

    const isoDate = toIsoDate(record.date);
    if (isoDate) story.record_date = isoDate;

    story.description = buildDescription(String(story.description ?? ''), record);

    const originalUrl = String(payload.videoURL ?? '');
    const playableUrl = normaliseMuxAudioUrl(originalUrl);
    const urlFixed = playableUrl !== originalUrl;
    if (urlFixed) payload.videoURL = playableUrl;

    if (!options.dryRun) {
      await writeFile(filePath, `${JSON.stringify(raw, null, 2)}\n`, 'utf-8');
    }

    updated += 1;
    console.log(
      `   ✓ ${idlId}  ${previousTitle.padEnd(18)} -> ${nextTitle.slice(0, 58)}` +
        `${isoDate ? `  (${isoDate.slice(0, 10)})` : ''}${urlFixed ? '  [audio url -> HLS]' : ''}`,
    );
  }

  console.log(
    `\n[oida] ${options.dryRun ? 'would update' : 'updated'} ${updated} file(s)` +
      `${unmatched ? `, ${unmatched} unmatched` : ''}`,
  );
}

main().catch((error) => {
  console.error('[oida] enrich failed:', error);
  process.exit(1);
});
