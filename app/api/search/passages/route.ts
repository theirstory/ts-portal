import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Locate, on a page image, the passage a semantic search actually considered relevant.
 *
 * A page is embedded as one vector, so retrieval tells you the page matched but not where.
 * And because the match is semantic, the query's words are frequently nowhere on the page —
 * which is why term highlighting alone leaves a researcher scanning a dense two-column
 * scan by eye.
 *
 * This re-embeds the page's own passages, built from the positioned words extracted at
 * ingest, and scores them against the query with the same model that retrieved the page.
 * The best-scoring passage is returned as boxes to draw. It is a second, finer-grained pass
 * of exactly the comparison that produced the hit, rather than a keyword approximation.
 */

type WordBox = { t: string; x: number; y: number; w: number; h: number; b?: number; l?: number };
type Line = { words: WordBox[]; y: number; height: number; block: number; column: number };
type Passage = { text: string; lines: Line[] };

/**
 * Roughly a paragraph: long enough to carry meaning, short enough to localise.
 *
 * Each passage costs one forward pass of a 2B-parameter model, so this number is the whole
 * latency budget. At 45 words a dense page produced 24 passages and took 1.3-6s, which is
 * long enough that the highlight appeared well after the page image. Longer passages mean
 * fewer of them, trading a little precision for a response that lands with the image.
 */
const TARGET_PASSAGE_WORDS = 95;
/** Lines shared between neighbouring passages, so a match spanning a boundary is still found. */
const PASSAGE_OVERLAP_LINES = 1;
const MAX_PASSAGES = 14;
/**
 * Left edges within this fraction of the page width belong to the same column. Poppler's
 * own <block> grouping is too fine to use for this — a block is frequently a single line,
 * so treating block boundaries as passage boundaries reduced every passage to one line and
 * dropped similarity from ~0.70 to ~0.25.
 */
const COLUMN_GAP = 0.15;
/** Cosine floor. Below this the page matched for reasons no single passage explains. */
const MIN_PASSAGE_SIMILARITY = 0.35;

/**
 * Group words into lines using the block/line indices poppler assigned, falling back to
 * vertical position for coordinate files written before those were recorded.
 *
 * This matters on multi-column pages: grouping by vertical position alone merges the left
 * and right columns into single lines, which garbles the passage text and produces
 * highlights spanning the whole page width instead of marking the passage.
 */
function groupIntoLines(words: WordBox[]): Line[] {
  const hasLayout = words.some((word) => typeof word.l === 'number' && word.l >= 0);

  if (hasLayout) {
    const byLine = new Map<string, Line>();

    for (const word of words) {
      const block = word.b ?? 0;
      const key = `${block}:${word.l ?? 0}`;
      const line = byLine.get(key);

      if (line) {
        line.words.push(word);
        line.y = Math.min(line.y, word.y);
        line.height = Math.max(line.height, word.h);
        continue;
      }

      byLine.set(key, { words: [word], y: word.y, height: word.h, block, column: 0 });
    }

    const lines = [...byLine.values()];
    for (const line of lines) line.words.sort((a, b) => a.x - b.x);
    return assignColumns(lines);
  }

  const sorted = [...words].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: Line[] = [];

  for (const word of sorted) {
    const current = lines[lines.length - 1];
    if (current && Math.abs(current.y - word.y) < Math.max(word.h, current.height) * 0.6) {
      current.words.push(word);
      current.height = Math.max(current.height, word.h);
      continue;
    }
    lines.push({ words: [word], y: word.y, height: word.h, block: 0, column: 0 });
  }

  for (const line of lines) line.words.sort((a, b) => a.x - b.x);
  return assignColumns(lines);
}

/**
 * Assign each line to a column by clustering left edges, then order lines in reading order:
 * down one column, then down the next. This is what keeps a two-column page from
 * interleaving, while still letting a passage span consecutive paragraphs of one column.
 */
function assignColumns(lines: Line[]): Line[] {
  const edges = [...new Set(lines.map((line) => Math.min(...line.words.map((word) => word.x))))].sort(
    (a, b) => a - b,
  );

  const columnStarts: number[] = [];
  for (const edge of edges) {
    if (!columnStarts.length || edge - columnStarts[columnStarts.length - 1] > COLUMN_GAP) {
      columnStarts.push(edge);
    }
  }

  for (const line of lines) {
    const left = Math.min(...line.words.map((word) => word.x));
    let column = 0;
    for (let i = 0; i < columnStarts.length; i++) {
      if (left >= columnStarts[i] - 0.001) column = i;
    }
    line.column = column;
  }

  return [...lines].sort((a, b) => a.column - b.column || a.y - b.y);
}

function buildPassages(lines: Line[]): Passage[] {
  const passages: Passage[] = [];
  let index = 0;

  while (index < lines.length && passages.length < MAX_PASSAGES) {
    const group: Line[] = [];
    let wordCount = 0;

    const startColumn = lines[index].column;

    while (index < lines.length && wordCount < TARGET_PASSAGE_WORDS) {
      // A passage that jumps columns is not a passage.
      if (group.length && lines[index].column !== startColumn) break;
      group.push(lines[index]);
      wordCount += lines[index].words.length;
      index += 1;
    }

    if (group.length) {
      passages.push({
        text: group.map((line) => line.words.map((word) => word.t).join(' ')).join(' '),
        lines: group,
      });
    }

    // Back up for overlap only when the group was long enough to spare a line. Backing up
    // after a single-line group — which happens at every column boundary — would advance the
    // index by nothing at all, spinning in place until MAX_PASSAGES and leaving the rest of
    // the page unexamined.
    if (index < lines.length && group.length > PASSAGE_OVERLAP_LINES) {
      index -= PASSAGE_OVERLAP_LINES;
    }
  }

  return passages;
}

/** One box per line, spanning that line's words. */
function lineBoxes(lines: Line[]): { x: number; y: number; w: number; h: number }[] {
  return lines.map((line) => {
    const left = Math.min(...line.words.map((word) => word.x));
    const right = Math.max(...line.words.map((word) => word.x + word.w));
    const top = Math.min(...line.words.map((word) => word.y));
    const bottom = Math.max(...line.words.map((word) => word.y + word.h));
    return {
      x: Number(left.toFixed(4)),
      y: Number(top.toFixed(4)),
      w: Number((right - left).toFixed(4)),
      h: Number((bottom - top).toFixed(4)),
    };
  });
}

async function embedTexts(texts: string[]): Promise<number[][]> {
  const baseUrl = process.env.NLP_PROCESSOR_URL ?? 'http://nlp-processor:7070';

  const res = await fetch(`${baseUrl}/embed-multimodal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: texts.map((text) => ({ text })) }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Embedding service failed: ${res.status} ${detail.slice(0, 200)}`);
  }

  const body = (await res.json()) as { vectors: number[][] };
  return body.vectors;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}


/**
 * Opening the same page twice, or reopening it from a shared link, should not re-embed
 * anything. Keyed by page and query, which is exactly what the answer depends on.
 */
const PASSAGE_CACHE_LIMIT = 400;
const passageCache = new Map<string, unknown>();

function cacheGet(key: string): unknown {
  const hit = passageCache.get(key);
  if (hit === undefined) return undefined;
  // Refresh recency so the map evicts genuinely cold entries.
  passageCache.delete(key);
  passageCache.set(key, hit);
  return hit;
}

function cacheSet(key: string, value: unknown): void {
  if (passageCache.size >= PASSAGE_CACHE_LIMIT) {
    const oldest = passageCache.keys().next().value;
    if (oldest !== undefined) passageCache.delete(oldest);
  }
  passageCache.set(key, value);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { imageUrl?: string; query?: string };
    const query = (body.query ?? '').trim();
    const imageUrl = (body.imageUrl ?? '').trim();

    if (!query || !imageUrl) {
      return NextResponse.json({ error: 'imageUrl and query are required' }, { status: 400 });
    }

    // Only ever read the generated word files, never an arbitrary path from the client.
    if (!/^\/oida\/pages\/[A-Za-z0-9_-]+\/p-\d+\.png$/.test(imageUrl)) {
      return NextResponse.json({ error: 'unsupported imageUrl' }, { status: 400 });
    }

    const cacheKey = `${imageUrl}\u0000${query}`;
    const cached = cacheGet(cacheKey);
    if (cached !== undefined) {
      return NextResponse.json(cached as Record<string, unknown>);
    }

    const wordsPath = path.join(process.cwd(), 'public', imageUrl.replace(/\.png$/, '.words.json'));

    let words: WordBox[];
    try {
      const parsed = JSON.parse(await readFile(wordsPath, 'utf-8')) as { words: WordBox[] };
      words = parsed.words ?? [];
    } catch {
      // Scanned pages have no positioned text; that is expected, not an error.
      const answer = { passages: [], reason: 'no-text-layer' };
      cacheSet(cacheKey, answer);
      return NextResponse.json(answer);
    }

    const passages = buildPassages(groupIntoLines(words));
    if (!passages.length) {
      const answer = { passages: [], reason: 'no-passages' };
      cacheSet(cacheKey, answer);
      return NextResponse.json(answer);
    }

    const vectors = await embedTexts([query, ...passages.map((passage) => passage.text)]);
    const queryVector = vectors[0];

    const scored = passages
      .map((passage, index) => ({ passage, similarity: cosine(queryVector, vectors[index + 1]) }))
      .sort((a, b) => b.similarity - a.similarity);

    const best = scored[0];
    if (!best || best.similarity < MIN_PASSAGE_SIMILARITY) {
      const answer = { passages: [], reason: 'below-threshold', best: best?.similarity ?? 0 };
      cacheSet(cacheKey, answer);
      return NextResponse.json(answer);
    }

    const answer = {
      passages: [
        {
          similarity: Number(best.similarity.toFixed(4)),
          text: best.passage.text.slice(0, 600),
          boxes: lineBoxes(best.passage.lines),
        },
      ],
      considered: passages.length,
    };

    cacheSet(cacheKey, answer);
    return NextResponse.json(answer);
  } catch (error) {
    console.error('Passage localisation error:', error);
    const message = error instanceof Error ? error.message : 'Passage localisation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
