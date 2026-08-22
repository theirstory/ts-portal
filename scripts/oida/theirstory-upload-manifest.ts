#!/usr/bin/env node

/**
 * Build the hand-off checklist for getting the OIDA recordings transcribed.
 *
 * TheirStory has no ingest API endpoint, so the recordings are uploaded by hand. This
 * writes a checklist with the local file, the title and description to paste in, and the
 * provenance links — plus the exact commands to run afterwards to pull the finished
 * transcripts back into the portal.
 *
 * Usage:
 *   yarn oida:upload-manifest
 */

import { readFile, writeFile } from 'node:fs/promises';
import { stat } from 'node:fs/promises';
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
  genre: string;
  sourceUrl: string;
  archiveUrl: string;
  mediaPath: string;
  mediaBytes: number;
  durationSeconds: number;
  relatedIds: string[];
  idlTranscriptChars: number;
};

type Corpus = {
  collection: { id: string; name: string; description: string };
  recordings: RecordingRecord[];
};

const ROOT = process.cwd();
const CORPUS_PATH = path.join(ROOT, 'json', 'oida', 'corpus.json');
const OUTPUT_PATH = path.join(ROOT, 'media', 'oida', 'UPLOAD_TO_THEIRSTORY.md');

function formatDuration(seconds: number): string {
  if (!seconds) return 'unknown';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function formatSize(bytes: number): string {
  if (!bytes) return '—';
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  return `${(bytes / 1e6).toFixed(0)} MB`;
}

async function onDisk(relativePath: string): Promise<boolean> {
  if (!relativePath) return false;
  try {
    await stat(path.join(ROOT, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const corpus = JSON.parse(await readFile(CORPUS_PATH, 'utf-8')) as Corpus;
  const recordings = corpus.recordings;

  const rows: string[] = [];
  let present = 0;
  let totalSeconds = 0;
  let totalBytes = 0;

  for (const [index, recording] of recordings.entries()) {
    const exists = await onDisk(recording.mediaPath);
    if (exists) present += 1;
    totalSeconds += recording.durationSeconds;
    totalBytes += recording.mediaBytes;

    const description = [
      recording.description || recording.title,
      recording.role ? `Role: ${recording.role}.` : '',
      `Source: Opioid Industry Documents Archive, ${recording.collectionName} (${recording.collectionCode}).`,
      `Document id ${recording.id}.`,
    ]
      .filter(Boolean)
      .join(' ');

    rows.push(
      [
        `### ${index + 1}. ${recording.title}`,
        '',
        `- [ ] **Uploaded to TheirStory**`,
        `- [ ] **Transcribed** (note the TheirStory story id here: \`____________________\`)`,
        '',
        `| | |`,
        `|---|---|`,
        `| File | \`${recording.mediaPath || '(not downloaded)'}\` ${exists ? '' : '— **missing, re-run `yarn oida:fetch`**'} |`,
        `| Type | ${recording.kind} |`,
        `| Size | ${formatSize(recording.mediaBytes)} |`,
        `| Duration | ${formatDuration(recording.durationSeconds)} |`,
        `| Date | ${recording.date || 'unknown'} |`,
        `| Collection | ${recording.collectionName} |`,
        `| IDL record | ${recording.sourceUrl} |`,
        `| Internet Archive | ${recording.archiveUrl} |`,
        `| Linked documents | ${recording.relatedIds.length ? recording.relatedIds.map((id) => `\`${id}\``).join(', ') : 'none'} |`,
        '',
        '**Description to paste into TheirStory:**',
        '',
        '> ' + description,
        '',
      ].join('\n'),
    );
  }

  const document = [
    '# Upload the OIDA recordings to TheirStory',
    '',
    'TheirStory has no ingest API, so these are uploaded by hand. TheirStory then runs',
    'speech-to-text, which is what gives the portal word-level timings — the thing that makes',
    'click-to-seek, deep-linked search results, and timestamped citations work. The IDL ships its',
    'own transcripts for some of these, but they have no timings and are visibly garbled, so they',
    'are not used.',
    '',
    '## Status',
    '',
    `- Recordings in the sample: **${recordings.length}**`,
    `- Downloaded locally: **${present}/${recordings.length}**`,
    `- Total media: **${formatSize(totalBytes)}**, **${formatDuration(totalSeconds)}** to transcribe`,
    '',
    '## After the transcripts are ready',
    '',
    'Collect the TheirStory story ids from the checkboxes below, then pull them back in:',
    '',
    '```bash',
    "export THEIRSTORY_AUTH_TOKEN='YOUR_TOKEN'",
    '',
    '# 1. Export import-ready interview JSON for the uploaded stories',
    'yarn theirstory:import-stories \\',
    "  --ids 'STORY_ID_1,STORY_ID_2,...' \\",
    '  --out-dir json/interviews/oida-opioid-archive \\',
    '  --generate-missing',
    '',
    '# 2. Ingest them into Weaviate (chunks, embeddings, NER)',
    '#    Run the nlp-processor with a GPU/MPS device — page and media embedding on CPU is painful.',
    'yarn weaviate:import',
    '```',
    '',
    'The recordings then appear alongside the documents and images at `/search`, retrieved by the',
    'same query vector, with no further work.',
    '',
    '## Recordings',
    '',
    ...rows,
  ].join('\n');

  await writeFile(OUTPUT_PATH, `${document}\n`, 'utf-8');

  console.log(`[oida] wrote ${path.relative(ROOT, OUTPUT_PATH)}`);
  console.log(`   ${recordings.length} recordings, ${present} downloaded, ${formatDuration(totalSeconds)} of media`);
}

main().catch((error) => {
  console.error('[oida] upload manifest failed:', error);
  process.exit(1);
});
