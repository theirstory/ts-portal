#!/usr/bin/env node

/**
 * Extract per-page word coordinates so search hits can be highlighted on the page image.
 *
 * The drawer already highlights query terms in a page's OCR text, but that text has no
 * spatial relationship to the image beside it — a researcher looking at a dense two-column
 * page still has to hunt for the passage. These coordinates let the UI draw the highlight
 * directly on the page.
 *
 * Coordinates come from the PDF text layer via `pdftotext -bbox-layout`, which reports word
 * boxes in PDF points along with the page size. The IDL OCR sidecars cannot substitute, as
 * they are plain text with no positions.
 *
 * Coverage is partial and that is inherent: IDL stamps every page with a "Source: <url>"
 * text layer, so a scanned page reports two positionable words and no content. On this
 * corpus 52 of 88 pages carry real positionable text; the other 36 are scans whose only
 * text layer is that stamp. Those get no highlight file, and the drawer falls back to
 * showing the page image with no overlay rather than pretending to locate a passage.
 *
 * Output: public/oida/pages/<id>/p-<n>.words.json, fetched lazily by the exhibit drawer.
 *
 * Usage:
 *   yarn oida:extract-boxes
 *   yarn oida:extract-boxes --id ffbd0426
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);

const ROOT = process.cwd();
const CORPUS_PATH = path.join(ROOT, 'json', 'oida', 'corpus.json');
const PAGES_DIR = path.join(ROOT, 'public', 'oida', 'pages');

type ExhibitPage = { page: number; imagePath: string; ocrChars: number };
type ExhibitRecord = { id: string; title: string; pdfPath: string; pages: ExhibitPage[] };
type Corpus = { exhibits: ExhibitRecord[] };

/**
 * A word, its box in fractions of the page (so the UI is resolution-independent), and the
 * block and line poppler assigned it.
 *
 * The block/line indices are what make multi-column pages work. Grouping words by vertical
 * position alone interleaves the columns of a two-column page — the passage text comes out
 * as alternating fragments from each column, and a highlight drawn from it spans the full
 * page width instead of marking the passage. Poppler has already done the layout analysis,
 * so this keeps its answer rather than re-deriving a worse one.
 */
type WordBox = { t: string; x: number; y: number; w: number; h: number; b: number; l: number };
type PageWords = { page: number; words: WordBox[] };

function parseArgs() {
  const argv = process.argv.slice(2);
  const idIndex = argv.indexOf('--id');
  return { onlyId: idIndex >= 0 ? argv[idIndex + 1] : '' };
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

/**
 * Parse pdftotext's bbox XHTML. Boxes are absolute PDF points, so they are divided by the
 * reported page size to become fractions — the rendered PNG is a different pixel size, and
 * the browser scales it again to fit the drawer.
 */
function parseBboxXhtml(xml: string): WordBox[] {
  const pageMatch = xml.match(/<page width="([\d.]+)" height="([\d.]+)"/);
  if (!pageMatch) return [];

  const pageWidth = Number(pageMatch[1]);
  const pageHeight = Number(pageMatch[2]);
  if (!pageWidth || !pageHeight) return [];

  const words: WordBox[] = [];
  // Walk block and line openings alongside words so each word keeps its layout position.
  const tokenPattern =
    /<block\b|<line\b|<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([\s\S]*?)<\/word>/g;

  let blockIndex = -1;
  let lineIndex = -1;

  for (const match of xml.matchAll(tokenPattern)) {
    if (match[0].startsWith('<block')) {
      blockIndex += 1;
      continue;
    }
    if (match[0].startsWith('<line')) {
      lineIndex += 1;
      continue;
    }

    const text = decodeEntities(match[5]).trim();
    if (!text) continue;

    const xMin = Number(match[1]);
    const yMin = Number(match[2]);
    const xMax = Number(match[3]);
    const yMax = Number(match[4]);

    words.push({
      b: blockIndex,
      l: lineIndex,
      t: text,
      // Rounded to 4 decimals: sub-pixel precision the UI cannot use, and it keeps the
      // JSON roughly a third smaller.
      x: Number((xMin / pageWidth).toFixed(4)),
      y: Number((yMin / pageHeight).toFixed(4)),
      w: Number(((xMax - xMin) / pageWidth).toFixed(4)),
      h: Number(((yMax - yMin) / pageHeight).toFixed(4)),
    });
  }

  return words;
}

/**
 * IDL stamps a "Source: https://www.industrydocuments.ucsf.edu/docs/<id>" line into every
 * page's text layer. It is provenance chrome, not page content, and on a scanned page it is
 * the *only* text — so it is dropped before deciding whether a page is highlightable.
 */
function isSourceStamp(word: string): boolean {
  return word === 'Source:' || /industrydocuments\.ucsf\.edu/i.test(word);
}

/** Below this, a page has no content worth locating (typically only the IDL stamp). */
const MIN_POSITIONABLE_WORDS = 5;

async function extractPage(pdfPath: string, page: number): Promise<WordBox[]> {
  try {
    const { stdout } = await execFileAsync(
      'pdftotext',
      ['-bbox-layout', '-f', String(page), '-l', String(page), pdfPath, '-'],
      { maxBuffer: 64 * 1024 * 1024 },
    );
    return parseBboxXhtml(stdout).filter((word) => !isSourceStamp(word.t));
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  const { onlyId } = parseArgs();
  const corpus = JSON.parse(await readFile(CORPUS_PATH, 'utf-8')) as Corpus;

  const exhibits = onlyId ? corpus.exhibits.filter((e) => e.id === onlyId) : corpus.exhibits;
  if (!exhibits.length) {
    console.log(`[oida] no exhibits matched${onlyId ? ` --id ${onlyId}` : ''}`);
    return;
  }

  console.log(`[oida] extracting word boxes for ${exhibits.length} exhibit(s)\n`);

  let pagesWithText = 0;
  let pagesWithout = 0;
  let wordTotal = 0;

  for (const exhibit of exhibits) {
    const pdfPath = path.join(ROOT, exhibit.pdfPath);
    const outputDir = path.join(PAGES_DIR, exhibit.id);
    await mkdir(outputDir, { recursive: true });

    const covered: number[] = [];

    for (const page of exhibit.pages) {
      const words = await extractPage(pdfPath, page.page);

      if (words.length < MIN_POSITIONABLE_WORDS) {
        pagesWithout += 1;
        continue;
      }

      // Name the file from the rendered image, never from the page number. pdftoppm
      // zero-pads to the page-count width ("p-03.png" in a 17-page document), while the
      // client finds these by swapping the image's extension — so deriving the name any
      // other way silently 404s for pages 1-9 of any document with ten or more pages.
      const wordsName = `${path.basename(page.imagePath, '.png')}.words.json`;
      const payload: PageWords = { page: page.page, words };
      await writeFile(path.join(outputDir, wordsName), JSON.stringify(payload), 'utf-8');

      pagesWithText += 1;
      wordTotal += words.length;
      covered.push(page.page);
    }

    const coverage = `${covered.length}/${exhibit.pages.length}`;
    const note = covered.length ? '' : '  (scanned — no positionable text)';
    console.log(`   ${exhibit.id}  ${coverage.padStart(6)} pages highlightable   ${exhibit.title.slice(0, 42)}${note}`);
  }

  const total = pagesWithText + pagesWithout;
  console.log(
    `\n[oida] ${pagesWithText}/${total} pages highlightable (${wordTotal.toLocaleString()} positioned words). ` +
      `${pagesWithout} page(s) are scans whose only text layer is the IDL source stamp.`,
  );
}

main().catch((error) => {
  console.error('[oida] word box extraction failed:', error);
  process.exit(1);
});
