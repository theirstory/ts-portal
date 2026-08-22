#!/usr/bin/env node

/**
 * Render a small thumbnail for every exhibit page.
 *
 * The result cards were showing the full 150 DPI page render scaled down to about 100px.
 * One photograph in this corpus is a 23 MB PNG, and a 40-result page could pull roughly
 * 39 MB of images to draw a column of thumbnails — which is a large part of why a search
 * felt slow long after the query itself had returned.
 *
 * Thumbnails come straight from the PDF at low DPI rather than by downscaling the big PNG:
 * one pass, better text legibility at small sizes, and no image library needed.
 *
 * Output: public/oida/pages/<id>/p-<n>.thumb.jpg, found by the UI by swapping the page
 * image's extension.
 *
 * Usage:
 *   yarn oida:thumbnails
 *   yarn oida:thumbnails --dpi 36
 */

import { readFile, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);

const ROOT = process.cwd();
const CORPUS_PATH = path.join(ROOT, 'json', 'oida', 'corpus.json');
const PAGES_DIR = path.join(ROOT, 'public', 'oida', 'pages');
/** ~460px on the long edge of a letter page: sharp on a retina card, still tiny. */
const DEFAULT_DPI = 44;

type ExhibitPage = { page: number; imagePath: string };
type ExhibitRecord = { id: string; title: string; pdfPath: string; pages: ExhibitPage[] };
type Corpus = { exhibits: ExhibitRecord[] };

function parseArgs() {
  const argv = process.argv.slice(2);
  const dpiIndex = argv.indexOf('--dpi');
  return {
    dpi: dpiIndex >= 0 ? Number(argv[dpiIndex + 1]) : DEFAULT_DPI,
    force: argv.includes('--force'),
  };
}

async function sizeOf(filePath: string): Promise<number> {
  try {
    return (await stat(filePath)).size;
  } catch {
    return 0;
  }
}

async function main(): Promise<void> {
  const { dpi, force } = parseArgs();
  const corpus = JSON.parse(await readFile(CORPUS_PATH, 'utf-8')) as Corpus;

  console.log(`[oida] rendering thumbnails at ${dpi} DPI\n`);

  let rendered = 0;
  let skipped = 0;
  let failed = 0;
  let fullBytes = 0;
  let thumbBytes = 0;

  for (const exhibit of corpus.exhibits) {
    const pdfPath = path.join(ROOT, exhibit.pdfPath);

    for (const page of exhibit.pages) {
      const baseName = path.basename(page.imagePath, '.png');
      const outputPrefix = path.join(PAGES_DIR, exhibit.id, `${baseName}.thumb`);
      const thumbPath = `${outputPrefix}.jpg`;

      fullBytes += await sizeOf(path.join(ROOT, 'public', page.imagePath));

      if (!force && (await sizeOf(thumbPath))) {
        skipped += 1;
        thumbBytes += await sizeOf(thumbPath);
        continue;
      }

      try {
        await execFileAsync('pdftoppm', [
          '-jpeg',
          '-jpegopt',
          'quality=72',
          '-r',
          String(dpi),
          '-f',
          String(page.page),
          '-l',
          String(page.page),
          '-singlefile',
          pdfPath,
          outputPrefix,
        ]);
        rendered += 1;
        thumbBytes += await sizeOf(thumbPath);
      } catch (error) {
        failed += 1;
        console.log(`   ✗ ${exhibit.id} p${page.page}: ${(error as Error).message.slice(0, 90)}`);
      }
    }
  }

  const saving = fullBytes ? (1 - thumbBytes / fullBytes) * 100 : 0;
  console.log(`[oida] ${rendered} rendered, ${skipped} already present${failed ? `, ${failed} failed` : ''}`);
  console.log(
    `   full pages ${(fullBytes / 1e6).toFixed(1)} MB -> thumbnails ${(thumbBytes / 1e6).toFixed(1)} MB ` +
      `(${saving.toFixed(1)}% smaller)`,
  );
}

main().catch((error) => {
  console.error('[oida] thumbnail rendering failed:', error);
  process.exit(1);
});
