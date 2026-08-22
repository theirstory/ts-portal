# Multimodal Search

The portal started as a transcript search engine: recordings in, sentence chunks out, one text
embedding model over the lot. This document covers the extension to **unified multimodal search** —
recordings, documents, and images retrieved by a single query, out of a single vector space.

## What changed

| | Before | After |
|---|---|---|
| Embedding model | `sentence-transformers/LaBSE` (text only, 768 dims) | `Qwen/Qwen3-VL-Embedding-2B` (text + image, 2048 dims) |
| Weaviate classes | `Testimonies`, `Chunks` | plus `Exhibits` (one object per document page or image) |
| Search | transcript chunks | `multimodalSearch()` across `Chunks` + `Exhibits` |
| UI | recordings gallery | plus `/search` — "All sources" |

Because the vector width changed (768 → 2048), swapping the model is **not** an env-var flip: the
Weaviate collections have to be recreated and the corpus re-embedded.

## The modality gap — the thing that will bite you

A shared vector space does *not* mean comparable scores. Measured on this corpus with
Qwen3-VL-Embedding-2B, querying for the *same item*:

| Query | Item as text | Item as page image |
|---|---|---|
| "a photograph of a pharmaceutical production line…" | **0.802** | **0.394** |
| "chart of per capita opioid shipments to Florida…" | **0.737** | **0.417** |

Text-to-text similarity runs roughly twice text-to-image. Merge raw scores from a single index and
every image and photograph sinks below every mediocre transcript match — "unified search" quietly
becomes text search dragging dead weight, and it looks like it is working.

`lib/weaviate/multimodalSearch.ts` handles this by subtracting a **fixed per-source-type
calibration offset** from the raw certainty. Two relative schemes were tried first and both
failed, because they depend on the composition of the candidate pool rather than on absolute
quality:

- *Min-max within each type* maps every type's best candidate to 1.0, so a type holding nothing
  relevant still promotes its top item — an unrelated news report (0.635) tied with the correct
  photograph (0.799).
- *Standardising against each type's own pool* is worse here, because pages from one multi-page
  PDF are highly correlated: the document pool's background is tight and low, so a mediocre
  document earned a **higher** z-score (+3.17) than the correct photograph (+2.47).

The offsets are small, and measured. On the full index (1,430 transcript chunks, 88 exhibit pages,
8 queries across all three types), the best result per query scored: **recording 0.795, document
0.764, image 0.738**. So only recordings need correction, at **0.05** — inside the measured
+0.031…+0.057 range. The earlier same-item probe suggesting ~0.20 compared a *title string* against
a page image and badly overstated the real case; using it demoted transcript chunks that were
genuinely the best match.

Three knobs, none requiring code changes:

- `calibrationOffsets` — the per-type offsets above.
- `weights` — per-source-type multipliers applied after calibration. Raise to surface more visual
  material, lower to favour spoken testimony.
- `minCertainty` — per-type floors on Weaviate's `certainty`, which is `(1 + cosine) / 2`, so 0.5
  means orthogonal rather than "half relevant". Defaults (`recording` 0.55, `document` 0.55,
  `image` 0.52) are deliberately loose: a correct top-1 lands at 0.70–0.82 regardless of type,
  while clearly irrelevant matches still reach ~0.61, so ranking is the calibration's job and not
  the floor's.

One more thing ranking has to do: **cap results per source**. Transcripts outnumber exhibit pages
16:1, so a query for "red flag prescriptions" returned 39 recording chunks out of 40 results with
the top four from one deposition. `maxPerSource` (default 3) keeps the unified list showing the
range of material that matched.

Every result keeps its raw `certainty`, and the "Show scores" toggle surfaces `rank`, `raw`, and
which modality produced the vector.

## Two retrieval modes

`/search` offers **Semantic** and **Keyword**, both across all three source types. There is no
hybrid mode, deliberately: benchmarking on this portal's multilingual corpus showed equal-weight
RRF fusion dropping cross-lingual recall from 0.875 to **0.000**, because the keyword retriever
votes with confidence when it is out of its depth.

| | Semantic | Keyword |
|---|---|---|
| Retrieval | `nearVector` on both classes, one query embedding | BM25 over the indexed text |
| Reaches photographs | yes — they have no words to match | no |
| Finds exact terms | only if they happen to be semantically close | yes, that is the point |
| Scoring | certainty minus a per-type calibration offset | raw BM25, comparable across types |
| Cost | one embedding per query | no embedding at all, so faster |

The mode is carried in the URL (`?mode=keyword`), so a shared link reproduces the same results.

## Showing where the match is on the page

Retrieval scores a whole page, which leaves a researcher scanning a dense two-column scan by
eye. Two layers address that, both drawn over the page image in the exhibit drawer:

- **The closest passage** (blue band). `POST /api/search/passages` re-embeds the page's own
  passages and scores them against the query with the same model that retrieved the page. This
  is the only thing that helps when the query and the page share no vocabulary — "newborns
  withdrawing from opioids" locates the "Babies Born Dependent on Opioids" chart, and "methadone
  deaths" locates the methadone paragraph, in both cases with no shared words.
- **Literal query terms** (yellow marks). In semantic mode these are confined to the located
  passage: a natural-language query shares ordinary words like "patient" and "with" with the
  whole page, and marking every occurrence buries the passage band under ~30 stray marks. In
  keyword mode every occurrence is marked, because there the terms *are* the answer.

Word coordinates come from the PDF text layer (`yarn oida:extract-boxes`, run after any
`oida:fetch`), stored as fractions of the page so they overlay at any render size. Three things
worth knowing:

- **Coverage is 52 of 88 pages.** IDL stamps every page with a "Source: <url>" text layer, so a
  scanned page reports two positionable words and no content — including pages that *look* like
  crisp text, such as the scanned email printouts. Those show "no text layer — matched on the
  image" rather than pretending to locate anything.
- **Column layout matters.** Grouping words by vertical position alone interleaves the two
  columns of an academic page, producing garbled passage text and highlights spanning the full
  page width. Lines are grouped by poppler's line index and then clustered into columns by left
  edge; passages never cross a column.
- **Short terms** are dropped to keep "the" and "and" from lighting up a page, except when typed
  in capitals — so DEA, FDA, and MME highlight while stopwords do not.

## Archival metadata

The Industry Documents Library holds far more about each exhibit than its content, and a
first pass captured only 11 of the 67 fields it populates. Everything it provides is now
fetched (`fl=*`), stored on the `Exhibits` class, and **searchable in keyword mode** — so a
researcher can find a document by its Bates number, its case number, or its author.

| Group | Fields |
|---|---|
| Citation | Bates number (per page), exhibit number, case number, IDL document id |
| People | author, recipient, copied, custodian |
| Correspondence | thread subject, date/time sent, date received, attachment Bates numbers |
| Document | date, genre, industry, drugs, language, alternate title |
| Production | original filename, format, path within the production, redaction status and type, availability, date added |

Coverage is uneven and that is inherent to the source: `industry` and `availability` are on
all 24 exhibits, `authors` on 10, `attachments` on 1. Empty fields are dropped from the panel
rather than rendered as blanks.

Two details worth knowing:

- **Per-page Bates numbers.** IDL records only the number a document *starts* at, even when
  every page is stamped separately. The stamp is printed on the page, though, and the word
  coordinates extracted for highlighting contain it — so it is read off the page where
  legible (18 of 50 multi-page pages here) and calculated from the starting number otherwise
  (32). Calculated numbers are flagged `bates_is_derived` and labelled "(derived)" in the UI,
  because a citation identifier the portal computed should not carry the same authority as
  one the library supplied. Spot-checked against the printed stamps on pages 1, 3, 11, 15,
  and 17 of a 17-page report: all matched.
- **IDL's "other title" is not always a title.** On email exhibits `ot` can hold the entire
  extracted thread, so it is kept only when it is under 180 characters and differs from the
  main title — which took it from 24/24 exhibits to a meaningful 5/24.

Adding metadata does **not** require re-embedding: the vectors depend only on the page image
and its OCR text. `yarn oida:update-metadata` PATCHes the properties onto the existing
objects, which takes seconds rather than re-encoding every page.

## How pages get embedded

Each document page becomes one `Exhibits` object carrying the rendered page image *and* its OCR
text, embedded together as a single multimodal input. This measurably beats either alone for pages
whose meaning is split between the two — a chart with an axis label, a memo with a letterhead.

The IDL ships one OCR sidecar per document with form-feed page separators, so per-page text comes
from splitting on `\f`. Nothing is re-OCRed.

Photographs are the honest test: several carry **zero** OCR characters, so they are retrievable only
through the image vector. `embedded_modality` on every object records what it was
(`image`, `text`, or `image+text`).

## Running it locally

Apple Silicon matters here: encoding a 150 DPI page image costs roughly an order of magnitude more
than encoding text, so the embedding service runs **natively on the host** to reach MPS, while
Weaviate stays in Docker. Docker cannot see MPS.

```bash
# 1. Weaviate only (host port 8081 -> container 8080)
docker compose --profile local up -d weaviate

# 2. Embedding service natively, on MPS
cd nlp-processor
python3.12 -m venv .venv
./.venv/bin/pip install -r requirements.txt
EMBEDDING_DEVICE=mps CONFIG_PATH=../config.json \
  ./.venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 7070

# 3. Schema (recreates the classes — destroys existing vectors)
WEAVIATE_HOST_URL=localhost WEAVIATE_PORT=8081 WEAVIATE_RESET_SCHEMA=true \
  yarn weaviate:generate-schemas

# 4. Frontend against the host services
WEAVIATE_HOST_URL=localhost WEAVIATE_PORT=8081 WEAVIATE_GRPC_HOST_URL=localhost \
  NLP_PROCESSOR_URL=http://127.0.0.1:7070 yarn dev
```

Relevant settings, all overridable by environment variable:

| Variable | Default | Notes |
|---|---|---|
| `EMBEDDING_MODEL` | `Qwen/Qwen3-VL-Embedding-2B` | A text-only model here disables image ingest, and `/embed-multimodal` will say so rather than fail obscurely |
| `EMBEDDING_DEVICE` | auto (`cuda` → `mps` → `cpu`) | `USE_GPU=true` still selects CUDA |
| `EMBEDDING_TRUNCATE_DIM` | `0` (native 2048) | Matryoshka truncation; changing it requires recreating collections |
| `EMBEDDING_IMAGE_BATCH_SIZE` | `2` | Images are far heavier than text |
| `EMBEDDING_IMAGE_MAX_EDGE` | `1600` | Bounds peak memory on large scans |

Throughput on an M-series host: **~5 s per page image**, versus milliseconds for a text chunk. Budget
accordingly — and put a GPU in the ingest path before running this at archive scale, because
`nlp-processor` defaults to `USE_GPU=false`.

## The OIDA sample corpus

`json/oida/manifest.json` curates a sample from the UCSF Industry Documents Library's opioid
collection. `yarn oida:fetch` resolves metadata from the IDL Solr API, downloads media and PDFs,
and renders page images; `yarn oida:ingest` embeds and inserts them.

```bash
yarn oida:fetch                  # metadata + media + page rendering
yarn oida:fetch --skip-video     # skip the slow leg
yarn oida:ingest                 # embed page image + OCR text, insert into Exhibits
yarn oida:ingest --modality image --dry-run   # compare encodings without writing
yarn oida:extract-boxes          # word coordinates for on-page highlighting
yarn oida:thumbnails             # small page thumbnails for result cards
yarn oida:update-metadata        # archival metadata onto existing objects (no re-embedding)
yarn oida:enrich-exports         # restore archival titles/dates onto TheirStory exports
yarn oida:upload-manifest        # checklist for uploading recordings to TheirStory
```

Recordings take a different path, because **TheirStory has no ingest API**: the media is downloaded
locally, uploaded by hand, transcribed by TheirStory (which is what produces word-level timings),
then pulled back via `yarn theirstory:import-stories`. See
`media/oida/UPLOAD_TO_THEIRSTORY.md`, generated by the command above.

Archive.org rate-limits hard and answers `503` under concurrency, so `media/oida/download-video.sh`
is deliberately sequential with long backoff, and resumable.
