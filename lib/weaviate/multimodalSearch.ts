'use server';

/**
 * Unified search across every primary-source type.
 *
 * Transcript chunks live in `Chunks`, document pages and images live in `Exhibits`, and a
 * multimodal embedding model puts both in one vector space — so a single query vector can
 * retrieve all of them.
 *
 * The catch, measured on this corpus with Qwen3-VL-Embedding-2B: for the *same item*, a
 * text query scores ~0.80 cosine against its text and only ~0.39 against its page image.
 * Raw scores are therefore not comparable across modalities — merging them directly buries
 * every image and photograph beneath any mediocre transcript match, and "unified search"
 * silently degrades into text search carrying dead weight.
 *
 * So each modality is queried separately, its candidate scores are normalised within that
 * modality, and the normalised scores are merged. Every result keeps its raw certainty so
 * the ranking stays auditable, and per-modality weights are tunable without code changes.
 */

import { Chunks, Exhibits, SchemaTypes, Testimonies } from '@/types/weaviate';
import { initWeaviateClient } from './client';
import { getLocalEmbedding } from './search';
import type { FilterValue, QueryProperty } from 'weaviate-client';

export type SourceType = 'recording' | 'document' | 'image';

/**
 * How to retrieve. 'semantic' embeds the query and compares vectors, so it finds material
 * that means the same thing in different words — and photographs, which have no words at
 * all. 'keyword' is BM25 over the indexed text, so it finds the exact terms and nothing
 * else, which is what you want for a name, a drug, or an acronym like DEA.
 *
 * Hybrid is deliberately absent: benchmarking on this portal's multilingual corpus showed
 * equal-weight fusion dropping cross-lingual recall from 0.875 to 0.000, because the keyword
 * retriever votes with confidence when it is out of its depth.
 */
export type SearchMode = 'semantic' | 'keyword';

export type MultimodalResult = {
  /** Stable Weaviate object id. */
  uuid: string;
  sourceType: SourceType;
  title: string;
  /** Snippet shown in the result list: transcript text, or OCR text for a page. */
  snippet: string;
  /**
   * Raw cosine certainty from Weaviate, for semantic searches — not comparable across
   * source types. Zero in keyword mode, where BM25 relevance is reported in `score`.
   */
  certainty: number;
  /** Which retrieval produced this result. */
  mode: SearchMode;
  /**
   * Ranking score: raw certainty minus this source type's calibration offset, then weighted.
   * Comparable across source types, unlike `certainty`.
   */
  score: number;
  collectionId: string;
  collectionName: string;
  folderId: string;
  folderName: string;

  // Recording-only fields (transcript chunk).
  storyId?: string;
  startTime?: number;
  endTime?: number;
  speaker?: string;
  sectionTitle?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  isAudioFile?: boolean;

  // Exhibit-only fields (document page or image).
  sourceId?: string;
  page?: number;
  pageCount?: number;
  imageUrl?: string;
  sourceUrl?: string;
  exhibitNumber?: string;
  imageCategory?: string;
  /** How this object's vector was produced: 'image', 'text', or 'image+text'. */
  embeddedModality?: string;
  /** Archival metadata as the Industry Documents Library records it. */
  archival?: ArchivalMetadata;
};

/**
 * What the library knows about an exhibit beyond its content: who wrote it, what case it
 * was produced in, what was redacted. Every field is searchable in keyword mode, so a
 * researcher can find a document by its Bates number or its author.
 */
export type ArchivalMetadata = {
  batesNumber: string;
  /**
   * The Bates number for this specific page.
   *
   * IDL usually records only the number a document *starts* at, even when every page is
   * stamped separately, so for later pages this is arithmetic rather than something the
   * library supplied. `batesForPageIsDerived` says which, because a citation identifier the
   * portal calculated should not be presented with the same authority as one it was given.
   */
  batesForPage: string;
  batesForPageIsDerived: boolean;
  custodians: string[];
  documentDate: string;
  caseNumbers: string[];
  authors: string[];
  recipients: string[];
  copied: string[];
  genre: string;
  industry: string;
  drugs: string[];
  alternateTitle: string;
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
  idlShortId: string;
};

export type MultimodalSearchOptions = {
  limit?: number;
  /** Defaults to 'semantic'. */
  mode?: SearchMode;
  /** Restrict to a subset of source types. Defaults to all of them. */
  sourceTypes?: SourceType[];
  collectionFilters?: string[];
  folderFilters?: string[];
  /**
   * Per-modality multipliers applied after normalisation. Raise the exhibit weights to
   * surface more visual material, lower them to favour spoken testimony.
   */
  weights?: Partial<Record<SourceType, number>>;
  /** Overrides the fixed per-source-type calibration offsets subtracted from raw certainty. */
  calibrationOffsets?: Partial<Record<SourceType, number>>;
  /**
   * Maximum results from any single recording or document. A 70-minute deposition yields
   * hundreds of chunks and a 17-page report yields 17 pages, so without a cap one source
   * fills the whole list. Set to 0 to disable.
   */
  maxPerSource?: number;
  /**
   * Minimum Weaviate certainty per modality, i.e. (1 + cosine) / 2. Image-only objects sit
   * lower on this scale than text for equally relevant matches, so their floor is lower.
   */
  minCertainty?: Partial<Record<SourceType, number>>;
};

const CHUNK_RETURN_PROPERTIES: QueryProperty<Chunks>[] = [
  'transcription',
  'interview_title',
  'speaker',
  'section_title',
  'start_time',
  'end_time',
  'theirstory_id',
  'video_url',
  'thumbnail_url',
  'isAudioFile',
  'collection_id',
  'collection_name',
  'folder_id',
  'folder_name',
];

const EXHIBIT_RETURN_PROPERTIES: QueryProperty<Exhibits>[] = [
  'source_id',
  'source_type',
  'image_category',
  'title',
  'description',
  'ocr_text',
  'page',
  'page_count',
  'image_url',
  'source_url',
  'exhibit_number',
  'embedded_modality',
  'collection_id',
  'collection_name',
  'folder_id',
  'folder_name',
  'custodians',
  'document_date',
  'bates_number',
  'bates_by_page',
  'bates_is_derived',
  'case_numbers',
  'authors',
  'recipients',
  'copied',
  'genre',
  'industry',
  'drugs',
  'alternate_title',
  'conversation',
  'date_sent',
  'time_sent',
  'date_received',
  'attachments',
  'original_filename',
  'original_format',
  'production_path',
  'redacted',
  'redaction_types',
  'redacted_by',
  'language',
  'availability',
  'date_added',
  'idl_short_id',
];

const DEFAULT_WEIGHTS: Record<SourceType, number> = {
  recording: 1,
  document: 1,
  image: 1,
};

/**
 * Subtracted from raw certainty before ranking, to put text and image scores on one scale.
 *
 * Document pages and photographs share an encoding scale, so they need no correction. Only
 * transcript chunks, being pure text, sit systematically higher.
 *
 * On how small this is: probing one item encoded both ways (0.901 as text against 0.697 as
 * a page image) suggests ~0.20, but that compares a title string against a page image and
 * badly overstates the real case.
 *
 * Measured on the full index (1,430 transcript chunks, 88 exhibit pages, 8 queries spanning
 * all three source types), comparing the best result of each type per query:
 *
 *   recording 0.795   document 0.764   image 0.738
 *
 * So recordings run +0.031 above documents and +0.057 above images, and 0.05 sits inside
 * that range. Raise it and genuinely-best transcript chunks get demoted below weaker pages;
 * drop it to zero and long depositions crowd out the visual material, since transcripts
 * outnumber exhibit pages 16:1 in the candidate pool.
 */
const DEFAULT_CALIBRATION_OFFSETS: Record<SourceType, number> = {
  recording: 0.05,
  document: 0,
  image: 0,
};

/**
 * Floors to drop obvious junk before merging. These are on Weaviate's `certainty` scale,
 * which for cosine distance is (1 + cosine) / 2 — so 0.5 means orthogonal, not "half
 * relevant". Measured on this corpus: a correct top-1 lands at 0.70–0.82 regardless of
 * modality, and clearly irrelevant matches still reach ~0.61, so these floors are
 * deliberately loose. Ranking is handled by within-modality normalisation, not by these.
 */
const DEFAULT_MIN_CERTAINTY: Record<SourceType, number> = {
  recording: 0.55,
  document: 0.55,
  image: 0.52,
};

/**
 * How many candidates to pull per modality before merging. Generous on purpose: the
 * background mean and deviation are estimated from this pool, so a pool of only a handful
 * of top hits would describe the peak rather than the background.
 */
const CANDIDATE_MULTIPLIER = 8;

/**
 * Default cap on results from one recording or document. Measured need: a query for "red
 * flag prescriptions" returned 39 recording chunks out of 40 results, with the top four all
 * from the same deposition, because transcripts outnumber exhibit pages 16:1. Diversifying
 * makes the unified list actually show the range of material that matched.
 */
const DEFAULT_MAX_PER_SOURCE = 3;
const MIN_CANDIDATE_POOL = 80;
const SNIPPET_LENGTH = 320;

/**
 * Matches three or more consecutive whitespace-delimited words of letters only — i.e. a
 * readable phrase.
 *
 * This is how a page's OCR text is judged worth showing. Simpler tests were measured
 * against this corpus and all failed: a length floor passes 48 characters of recogniser
 * noise ("Tiiv a ill!! :# ■ '--J £>**$"), and an alphanumeric-ratio floor is worse than
 * useless because a legitimate chart full of axis labels and figures scores 0.54 while pure
 * noise from a photograph scores 0.72.
 *
 * A phrase test separates them cleanly on all 24 exhibits, and stays script-agnostic (\p{L}
 * rather than A-Z) because the portal's corpora are multilingual. The leading lookbehind
 * matters: without it the run may start mid-symbol, which lets "^Bl BB TBiaTflBBn" pass as
 * three words.
 */
const READABLE_PHRASE = /(?<![^\s])\p{L}{2,}(?:\s+\p{L}{2,}){2,}/u;

/**
 * Returns the OCR text only if it actually reads as text. A page whose text is recogniser
 * noise is better described as "matched on the image itself" than quoted verbatim.
 */
function usableText(text: string | undefined): string {
  const trimmed = (text ?? '').trim();
  return READABLE_PHRASE.test(trimmed) ? trimmed : '';
}

function snippet(text: string): string {
  const collapsed = (text ?? '').replace(/\s+/g, ' ').trim();
  if (collapsed.length <= SNIPPET_LENGTH) return collapsed;
  return `${collapsed.slice(0, SNIPPET_LENGTH).trimEnd()}…`;
}

function buildFilters(
  collection: { filter: { byProperty: unknown } },
  collectionFilters?: string[],
  folderFilters?: string[],
  extra?: FilterValue,
): FilterValue | undefined {
  const byProperty = collection.filter.byProperty as unknown as (
    property: string,
  ) => { containsAny: (values: string[]) => FilterValue };

  const filters: FilterValue[] = [];
  if (collectionFilters?.length) filters.push(byProperty('collection_id').containsAny(collectionFilters));
  if (folderFilters?.length) filters.push(byProperty('folder_id').containsAny(folderFilters));
  if (extra) filters.push(extra);

  if (!filters.length) return undefined;
  if (filters.length === 1) return filters[0];
  return { operator: 'And', filters, value: true } as FilterValue;
}

/**
 * Calibrate a raw certainty onto the shared ranking scale.
 *
 * Two relative schemes were tried and both failed, for the same underlying reason: they
 * depend on the composition of the candidate pool rather than on absolute quality.
 *
 *  - Min-max within each modality maps every modality's best candidate to 1.0, so a
 *    modality holding nothing relevant still promotes its top item. Observed: for "a
 *    photograph of a factory production line", an unrelated news report (0.635) tied with
 *    the correct photograph (0.799).
 *  - Standardising against each modality's own pool is worse here, because pages from one
 *    multi-page PDF are highly correlated: the document pool's background is tight and low,
 *    so a barely-above-average document earned a *higher* z (+3.17) than the correct
 *    photograph (+2.47).
 *
 * What the measurements actually show is narrower than "every modality needs its own
 * scale". Document pages and photographs are embedded the same way (image, or image plus
 * OCR text) and land on the same certainty scale — a correct top-1 of either type sits at
 * 0.70-0.82 on this corpus. The real gap is against transcript chunks, which are pure text:
 * probing the same item both ways gave 0.901 certainty as text against 0.697 as a page
 * image, a systematic offset of ~0.20.
 *
 * So ranking uses raw certainty minus a fixed per-source-type offset. Fixed, because a
 * constant preserves absolute quality ordering within a query instead of inventing rank
 * from pool statistics.
 */
function calibrate(certainty: number, sourceType: SourceType, offsets: Record<SourceType, number>): number {
  return certainty - (offsets[sourceType] ?? 0);
}

/**
 * Small preview for a result card.
 *
 * Exhibit cards were loading the full 150 DPI page render — one photograph here is a 23 MB
 * PNG — to draw a ~100px thumbnail, which made a result page pull tens of megabytes after
 * the query itself had already returned. `yarn oida:thumbnails` renders a small JPEG beside
 * each page image, found by swapping the extension.
 */
function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  return value ? [String(value)] : [];
}

function toArchival(properties: Exhibits): ArchivalMetadata {
  const perPage = toStringList(properties.bates_by_page)[0] ?? '';

  return {
    batesNumber: properties.bates_number ?? '',
    batesForPage: perPage,
    // Set by the updater: true only when the number was calculated because the page's own
    // stamp could not be read. Numbers read off the page are facts, not inferences.
    batesForPageIsDerived: Boolean(properties.bates_is_derived),
    custodians: toStringList(properties.custodians),
    documentDate: properties.document_date ?? '',
    caseNumbers: toStringList(properties.case_numbers),
    authors: toStringList(properties.authors),
    recipients: toStringList(properties.recipients),
    copied: toStringList(properties.copied),
    genre: properties.genre ?? '',
    industry: properties.industry ?? '',
    drugs: toStringList(properties.drugs),
    alternateTitle: properties.alternate_title ?? '',
    conversation: properties.conversation ?? '',
    dateSent: properties.date_sent ?? '',
    timeSent: properties.time_sent ?? '',
    dateReceived: properties.date_received ?? '',
    attachments: toStringList(properties.attachments),
    originalFilename: properties.original_filename ?? '',
    originalFormat: properties.original_format ?? '',
    productionPath: properties.production_path ?? '',
    redacted: properties.redacted ?? '',
    redactionTypes: toStringList(properties.redaction_types),
    redactedBy: toStringList(properties.redacted_by),
    language: properties.language ?? '',
    availability: toStringList(properties.availability),
    dateAdded: properties.date_added ?? '',
    idlShortId: properties.idl_short_id ?? '',
  };
}

function exhibitThumbnail(imageUrl: string): string {
  return imageUrl ? imageUrl.replace(/\.png$/, '.thumb.jpg') : '';
}

/**
 * Video recordings get a Mux poster frame at the matched moment, so a transcript hit shows
 * what was on screen when it was said. Audio has no frame; the card falls back to an icon.
 */
function recordingThumbnail(videoUrl: string, startTime?: number): string {
  const playbackId = (videoUrl ?? '').match(/stream\.mux\.com\/([^.?/]+)/)?.[1];
  if (!playbackId) return '';

  const at = Math.max(Math.floor(startTime ?? 0), 0);
  return `https://image.mux.com/${playbackId}/thumbnail.jpg?time=${at}&width=320&height=180&fit_mode=crop`;
}


/**
 * List material without a query, so the page opens showing what is in the collection rather
 * than an empty box. Recordings are listed once each (from Testimonies) rather than once per
 * transcript chunk, which is the right granularity for browsing.
 *
 * Scores are zero here: nothing has been ranked, and pretending otherwise would put a
 * meaningless relevance bar on every card.
 */
export async function browseSources(
  options: { limit?: number; sourceTypes?: SourceType[] } = {},
): Promise<{ results: MultimodalResult[]; perTypeCounts: Record<SourceType, number> }> {
  const limit = options.limit ?? 60;
  const sourceTypes = options.sourceTypes?.length
    ? options.sourceTypes
    : (['recording', 'document', 'image'] as SourceType[]);

  const client = await initWeaviateClient();
  const wantsRecordings = sourceTypes.includes('recording');
  const wantsExhibits = sourceTypes.includes('document') || sourceTypes.includes('image');

  const [recordings, exhibits] = await Promise.all([
    wantsRecordings
      ? client.collections.get<Testimonies>(SchemaTypes.Testimonies).query.fetchObjects({
          limit,
          returnProperties: [
            'interview_title',
            'interview_description',
            'interview_duration',
            'video_url',
            'isAudioFile',
            'collection_id',
            'collection_name',
            'folder_id',
            'folder_name',
          ],
        })
      : Promise.resolve(null),
    wantsExhibits
      ? client.collections.get<Exhibits>(SchemaTypes.Exhibits).query.fetchObjects({
          limit,
          returnProperties: EXHIBIT_RETURN_PROPERTIES,
        })
      : Promise.resolve(null),
  ]);

  const results: MultimodalResult[] = [];
  const perTypeCounts: Record<SourceType, number> = { recording: 0, document: 0, image: 0 };

  for (const object of recordings?.objects ?? []) {
    const properties = object.properties as Testimonies;
    perTypeCounts.recording += 1;

    results.push({
      uuid: object.uuid,
      sourceType: 'recording',
      mode: 'semantic',
      title: properties.interview_title ?? '',
      snippet: snippet(properties.interview_description ?? ''),
      certainty: 0,
      score: 0,
      collectionId: properties.collection_id ?? '',
      collectionName: properties.collection_name ?? '',
      folderId: properties.folder_id ?? '',
      folderName: properties.folder_name ?? '',
      // A Testimonies object's own id is the story id the portal routes on.
      storyId: object.uuid,
      videoUrl: properties.video_url ?? '',
      isAudioFile: Boolean(properties.isAudioFile),
      thumbnailUrl: properties.isAudioFile ? '' : recordingThumbnail(properties.video_url ?? '', 5),
    });
  }

  for (const object of exhibits?.objects ?? []) {
    const properties = object.properties as Exhibits;
    const sourceType: SourceType = properties.source_type === 'image' ? 'image' : 'document';
    if (!sourceTypes.includes(sourceType)) continue;

    perTypeCounts[sourceType] += 1;

    results.push({
      uuid: object.uuid,
      sourceType,
      mode: 'semantic',
      title: properties.title ?? '',
      snippet: snippet(usableText(properties.ocr_text) || properties.description || ''),
      certainty: 0,
      score: 0,
      collectionId: properties.collection_id ?? '',
      collectionName: properties.collection_name ?? '',
      folderId: properties.folder_id ?? '',
      folderName: properties.folder_name ?? '',
      sourceId: properties.source_id ?? '',
      page: properties.page,
      pageCount: properties.page_count,
      imageUrl: properties.image_url ?? '',
      thumbnailUrl: exhibitThumbnail(properties.image_url ?? ''),
      sourceUrl: properties.source_url ?? '',
      exhibitNumber: properties.exhibit_number ?? '',
      imageCategory: properties.image_category ?? '',
      embeddedModality: properties.embedded_modality ?? '',
      archival: toArchival(properties),
    });
  }

  // Recordings first, then documents, then images: least numerous to most, so browsing does
  // not open on 88 near-identical page thumbnails.
  const order: Record<SourceType, number> = { recording: 0, document: 1, image: 2 };
  results.sort((a, b) => order[a.sourceType] - order[b.sourceType]);

  return { results, perTypeCounts };
}

export async function multimodalSearch(
  query: string,
  options: MultimodalSearchOptions = {},
): Promise<{ results: MultimodalResult[]; perTypeCounts: Record<SourceType, number>; mode: SearchMode }> {
  const limit = options.limit ?? 30;
  const mode: SearchMode = options.mode ?? 'semantic';
  const sourceTypes = options.sourceTypes?.length ? options.sourceTypes : (['recording', 'document', 'image'] as SourceType[]);
  const weights = { ...DEFAULT_WEIGHTS, ...options.weights };
  const offsets = { ...DEFAULT_CALIBRATION_OFFSETS, ...options.calibrationOffsets };
  const maxPerSource = options.maxPerSource ?? DEFAULT_MAX_PER_SOURCE;
  const minCertainty = { ...DEFAULT_MIN_CERTAINTY, ...options.minCertainty };

  const client = await initWeaviateClient();
  const candidateLimit = Math.max(limit * CANDIDATE_MULTIPLIER, MIN_CANDIDATE_POOL);

  // Keyword mode needs no embedding at all, which also makes it markedly faster.
  const vector = mode === 'semantic' ? await getLocalEmbedding(query) : null;

  const wantsRecordings = sourceTypes.includes('recording');
  const wantsExhibits = sourceTypes.includes('document') || sourceTypes.includes('image');

  const [chunkResponse, exhibitResponse] = await Promise.all([
    wantsRecordings
      ? (async () => {
          const collection = client.collections.get<Chunks>(SchemaTypes.Chunks);
          const filters = buildFilters(collection, options.collectionFilters, options.folderFilters);

          if (mode === 'keyword') {
            return collection.query.bm25(query, {
              limit: candidateLimit,
              returnMetadata: ['score'],
              returnProperties: CHUNK_RETURN_PROPERTIES,
              filters,
            });
          }

          return collection.query.nearVector(vector as number[], {
            limit: candidateLimit,
            targetVector: 'transcription_vector',
            returnMetadata: ['certainty', 'distance'],
            returnProperties: CHUNK_RETURN_PROPERTIES,
            filters,
          });
        })()
      : Promise.resolve(null),
    wantsExhibits
      ? (async () => {
          const collection = client.collections.get<Exhibits>(SchemaTypes.Exhibits);
          const byProperty = collection.filter.byProperty as unknown as (
            property: string,
          ) => { containsAny: (values: string[]) => FilterValue };

          // 'document' and 'image' are both Exhibits rows, separated by source_type.
          const requested = sourceTypes.filter((type) => type !== 'recording');
          const typeFilter = requested.length === 1 ? byProperty('source_type').containsAny(requested) : undefined;

          const filters = buildFilters(collection, options.collectionFilters, options.folderFilters, typeFilter);

          if (mode === 'keyword') {
            return collection.query.bm25(query, {
              limit: candidateLimit,
              returnMetadata: ['score'],
              returnProperties: EXHIBIT_RETURN_PROPERTIES,
              filters,
            });
          }

          return collection.query.nearVector(vector as number[], {
            limit: candidateLimit,
            targetVector: 'content_vector',
            returnMetadata: ['certainty', 'distance'],
            returnProperties: EXHIBIT_RETURN_PROPERTIES,
            filters,
          });
        })()
      : Promise.resolve(null),
  ]);

  const staged: { result: MultimodalResult; sourceType: SourceType }[] = [];

  for (const object of chunkResponse?.objects ?? []) {
    const properties = object.properties as Chunks;
    const certainty = object.metadata?.certainty ?? 0;
    const bm25Score = object.metadata?.score ?? 0;
    // Certainty floors describe a cosine scale, so they mean nothing to BM25.
    if (mode === 'semantic' && certainty < minCertainty.recording) continue;

    staged.push({
      sourceType: 'recording',
      result: {
        uuid: object.uuid,
        sourceType: 'recording',
        title: properties.interview_title ?? '',
        snippet: snippet(properties.transcription ?? ''),
        certainty,
        mode,
        score: mode === 'keyword' ? bm25Score : 0,
        collectionId: properties.collection_id ?? '',
        collectionName: properties.collection_name ?? '',
        folderId: properties.folder_id ?? '',
        folderName: properties.folder_name ?? '',
        storyId: properties.theirstory_id ?? '',
        startTime: properties.start_time,
        endTime: properties.end_time,
        speaker: properties.speaker ?? '',
        sectionTitle: properties.section_title ?? '',
        videoUrl: properties.video_url ?? '',
        thumbnailUrl: properties.isAudioFile
          ? ''
          : recordingThumbnail(properties.video_url ?? '', properties.start_time),
        isAudioFile: Boolean(properties.isAudioFile),
      },
    });
  }

  for (const object of exhibitResponse?.objects ?? []) {
    const properties = object.properties as Exhibits;
    const sourceType: SourceType = properties.source_type === 'image' ? 'image' : 'document';
    if (!sourceTypes.includes(sourceType)) continue;

    const certainty = object.metadata?.certainty ?? 0;
    const bm25Score = object.metadata?.score ?? 0;
    if (mode === 'semantic' && certainty < minCertainty[sourceType]) continue;

    staged.push({
      sourceType,
      result: {
        uuid: object.uuid,
        sourceType,
        title: properties.title ?? '',
        snippet: snippet(usableText(properties.ocr_text) || properties.description || ''),
        certainty,
        mode,
        score: mode === 'keyword' ? bm25Score : 0,
        collectionId: properties.collection_id ?? '',
        collectionName: properties.collection_name ?? '',
        folderId: properties.folder_id ?? '',
        folderName: properties.folder_name ?? '',
        sourceId: properties.source_id ?? '',
        page: properties.page,
        pageCount: properties.page_count,
        imageUrl: properties.image_url ?? '',
        thumbnailUrl: exhibitThumbnail(properties.image_url ?? ''),
        sourceUrl: properties.source_url ?? '',
        exhibitNumber: properties.exhibit_number ?? '',
        imageCategory: properties.image_category ?? '',
        embeddedModality: properties.embedded_modality ?? '',
        archival: toArchival(properties),
      },
    });
  }

  // Normalise within each modality, then weight, then merge.
  const perTypeCounts: Record<SourceType, number> = { recording: 0, document: 0, image: 0 };

  for (const sourceType of ['recording', 'document', 'image'] as SourceType[]) {
    const group = staged.filter((entry) => entry.sourceType === sourceType);
    perTypeCounts[sourceType] = group.length;

    for (const entry of group) {
      // BM25 relevance is already a single comparable scale across types, and calibration
      // offsets are a property of the vector space, so keyword scores are left as they are.
      if (mode === 'keyword') {
        entry.result.score = entry.result.score * (weights[sourceType] ?? 1);
        continue;
      }

      entry.result.score = calibrate(entry.result.certainty, sourceType, offsets) * (weights[sourceType] ?? 1);
    }
  }

  const ranked = staged
    .map((entry) => entry.result)
    .sort((a, b) => b.score - a.score || b.certainty - a.certainty);

  // Keep the best few results per source, in rank order, so that one long deposition or
  // multi-page report cannot monopolise the list. Overflow is set aside and used only to
  // backfill if that would otherwise leave the page short.
  const perSourceCount = new Map<string, number>();
  const kept: MultimodalResult[] = [];
  const overflow: MultimodalResult[] = [];

  for (const result of ranked) {
    const sourceKey =
      result.sourceType === 'recording' ? `recording:${result.storyId}` : `exhibit:${result.sourceId}`;
    const seen = perSourceCount.get(sourceKey) ?? 0;

    if (maxPerSource > 0 && seen >= maxPerSource) {
      overflow.push(result);
      continue;
    }

    perSourceCount.set(sourceKey, seen + 1);
    kept.push(result);
  }

  const results = [...kept, ...overflow].slice(0, limit);

  return { results, perTypeCounts, mode };
}
