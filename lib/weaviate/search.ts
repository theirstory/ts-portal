'use server';
import { Chunks, Testimonies, SchemaMap, SchemaTypes } from '@/types/weaviate';
import { initWeaviateClient } from './client';
import { FilterValue, QueryProperty } from 'weaviate-client';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type CollectionFilterOption = {
  id: string;
  name: string;
  description: string;
  itemCount: number;
  image?: string;
};

type EmbeddingResponse = {
  vector: number[];
  dim: number;
};

type CollectionJsonMetadata = {
  id?: string;
  name?: string;
  description?: string;
  image?: string;
};

async function loadCollectionMetadataMap(): Promise<Map<string, CollectionJsonMetadata>> {
  const collectionsRoot = path.join(process.cwd(), 'json', 'interviews');
  const metadataById = new Map<string, CollectionJsonMetadata>();

  let directoryEntries: Awaited<ReturnType<typeof readdir>>;
  try {
    directoryEntries = await readdir(collectionsRoot, { withFileTypes: true });
  } catch {
    return metadataById;
  }

  for (const entry of directoryEntries) {
    if (!entry.isDirectory()) continue;

    const collectionFile = path.join(collectionsRoot, entry.name, 'collection.json');

    try {
      const raw = await readFile(collectionFile, 'utf-8');
      const parsed = JSON.parse(raw) as CollectionJsonMetadata;
      const id = String(parsed.id || entry.name).trim();
      if (!id) continue;
      metadataById.set(id, parsed);
    } catch {
      // Ignore folders without valid collection metadata.
    }
  }

  return metadataById;
}

function buildCombinedFilters<T extends SchemaTypes>(
  myCollection: any,
  nerFilters?: string[],
  collectionFilters?: string[],
): FilterValue | undefined {
  const filtersArray: FilterValue[] = [];

  if (nerFilters?.length) {
    filtersArray.push(myCollection.filter.byProperty('ner_labels' as any).containsAny(nerFilters as any));
  }

  if (collectionFilters?.length) {
    filtersArray.push(myCollection.filter.byProperty('collection_id' as any).containsAny(collectionFilters as any));
  }

  if (!filtersArray.length) return undefined;
  if (filtersArray.length === 1) return filtersArray[0];

  return {
    operator: 'And',
    filters: filtersArray,
    value: true,
  } as FilterValue;
}

export async function getLocalEmbedding(text: string): Promise<number[]> {
  const baseUrl = process.env.NLP_PROCESSOR_URL ?? 'http://nlp-processor:7070';

  const res = await fetch(`${baseUrl}/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`Embedding service failed: ${res.status} ${msg}`);
  }

  const data = (await res.json()) as EmbeddingResponse;
  return data.vector;
}

export async function fetchStoryTranscriptByUuid(StoryUuid: string) {
  const client = await initWeaviateClient();
  const myCollection = client.collections.get<Testimonies>('Testimonies');

  const response = await myCollection.query.fetchObjectById(StoryUuid);

  return response;
}

export async function getStoryByUuid(StoryUuid: string) {
  const client = await initWeaviateClient();
  const myCollection = client.collections.get<Chunks>('Chunks');
  const response = await myCollection.query.fetchObjectById(StoryUuid);
  return response;
}

export async function getAllStoriesFromCollection<T extends SchemaTypes>(
  collection: T,
  returnProperties?: QueryProperty<SchemaMap[T]>[] | undefined,
  limit = 1000,
  offset = 0,
  collectionFilters?: string[],
) {
  const client = await initWeaviateClient();
  const myCollection = client.collections.get<SchemaMap[T]>(collection);
  const combinedFilter = buildCombinedFilters(myCollection, undefined, collectionFilters);

  const response = await myCollection.query.fetchObjects({
    limit,
    offset,
    filters: combinedFilter,
    returnProperties: returnProperties,
  });

  return response;
}

export async function getAvailableCollections(limit = 5000): Promise<CollectionFilterOption[]> {
  const client = await initWeaviateClient();
  const myCollection = client.collections.get<Testimonies>('Testimonies');
  const collectionMetadataMap = await loadCollectionMetadataMap();

  const response = await myCollection.query.fetchObjects({
    limit,
    returnProperties: ['collection_id', 'collection_name', 'collection_description'] as any,
  });

  const map = new Map<string, CollectionFilterOption>();

  for (const item of response.objects) {
    const props: any = item.properties || {};
    const id = String(props.collection_id || '').trim();
    if (!id) continue;

    // Source of truth today:
    // - `id` always comes from Weaviate (`collection_id`)
    // - `name`/`description` prefer local JSON metadata, then fall back to Weaviate properties
    // - `image` only comes from local JSON metadata
    const metadata = collectionMetadataMap.get(id);
    const name = String(metadata?.name || props.collection_name || '').trim() || id;
    const description = String(metadata?.description || props.collection_description || '').trim();
    const image = String(metadata?.image || '').trim() || undefined;
    const existing = map.get(id);
    if (!existing) {
      map.set(id, { id, name, description, image, itemCount: 1 });
    } else {
      map.set(id, {
        ...existing,
        image: existing.image || image,
        itemCount: existing.itemCount + 1,
      });
    }
  }

  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function vectorSearch<T extends SchemaTypes>(
  collection: T,
  searchTerm: string,
  limit = 1000,
  offset = 0,
  filters?: string[],
  collectionFilters?: string[],
  returnProperties?: QueryProperty<SchemaMap[T]>[] | undefined,
  minValue?: number,
  maxValue?: number,
) {
  const client = await initWeaviateClient();
  const myCollection = client.collections.get<SchemaMap[T]>(collection);

  const combinedFilter = buildCombinedFilters(myCollection, filters, collectionFilters);

  const vector = await getLocalEmbedding(searchTerm);

  const rawResults = await myCollection.query.nearVector(vector, {
    limit,
    offset,
    returnMetadata: ['score', 'certainty', 'distance'],
    filters: combinedFilter,
    returnProperties,
  });

  const filteredObjects = rawResults.objects.filter((item) => {
    const score = item.metadata?.certainty;
    if (score === undefined) return false;
    return (minValue === undefined || score >= minValue) && (maxValue === undefined || score <= maxValue);
  });

  const seen = new Set<number>();

  const uniqueByStartTime = filteredObjects.filter((item) => {
    const start = (item.properties as any)?.start_time;
    if (typeof start !== 'number') return false;
    if (seen.has(start)) return false;
    seen.add(start);
    return true;
  });

  return {
    ...rawResults,
    objects: uniqueByStartTime.slice(0, limit),
  };
}

export async function hybridSearch<T extends SchemaTypes>(
  collection: T,
  searchTerm: string,
  limit = 1000,
  offset = 0,
  filters?: string[],
  collectionFilters?: string[],
  returnProperties?: QueryProperty<SchemaMap[T]>[] | undefined,
  minValue?: number,
  maxValue?: number,
) {
  const client = await initWeaviateClient();
  const myCollection = client.collections.get<SchemaMap[T]>(collection);
  const combinedFilter = buildCombinedFilters(myCollection, filters, collectionFilters);

  const vector = await getLocalEmbedding(searchTerm);
  const response = await myCollection.query.hybrid(searchTerm, {
    vector,
    alpha: 0.55,
    fusionType: 'RelativeScore',
    limit,
    offset,
    returnMetadata: ['score', 'distance', 'certainty'],
    filters: combinedFilter,
    returnProperties,
  });

  const filteredObjects = response.objects.filter((item) => {
    const score = item?.metadata?.score ?? 0;
    return (minValue === undefined || score >= minValue) && (maxValue === undefined || score <= maxValue);
  });

  const seen = new Set<number>();
  const uniqueByStartTime = filteredObjects.filter((item) => {
    const start = (item.properties as any)?.start_time;
    if (typeof start !== 'number') return false;
    if (seen.has(start)) return false;
    seen.add(start);
    return true;
  });

  return {
    ...response,
    objects: uniqueByStartTime.slice(0, limit),
  };
}

export async function bm25Search<T extends SchemaTypes>(
  collection: T,
  searchTerm: string,
  limit = 1000,
  offset = 0,
  filters?: string[],
  collectionFilters?: string[],
  returnProperties?: QueryProperty<SchemaMap[T]>[] | undefined,
  minValue?: number,
  maxValue?: number,
) {
  const client = await initWeaviateClient();
  const myCollection = client.collections.get<SchemaMap[T]>(collection);
  const combinedFilter = buildCombinedFilters(myCollection, filters, collectionFilters);

  const response = await myCollection.query.bm25(searchTerm, {
    limit: limit,
    offset: offset,
    returnMetadata: ['distance', 'score', 'certainty'],
    filters: combinedFilter,
    returnProperties: returnProperties,
  });

  const scores = response.objects.map((obj) => obj.metadata?.score ?? 0);
  const maxScore = Math.max(...scores);
  const minScore = Math.min(...scores);

  // Normalizes the score from bm25 to a 0-1 range
  const normalizedObjects = response.objects.map((obj) => {
    const rawScore = obj.metadata?.score ?? 0;
    const normalizedScore = maxScore === minScore ? 1 : (rawScore - minScore) / (maxScore - minScore);

    return {
      ...obj,
      metadata: {
        ...obj.metadata,
        score: normalizedScore,
      },
    };
  });

  const filteredObjects = normalizedObjects.filter((obj) => {
    const score = obj.metadata?.score ?? 0;
    return score >= (minValue ?? 0) && score <= (maxValue ?? 1);
  });

  const seen = new Set<number>();
  const uniqueByStartTime = filteredObjects.filter((item) => {
    const start = (item.properties as any)?.start_time;
    if (typeof start !== 'number') return false;
    if (seen.has(start)) return false;
    seen.add(start);
    return true;
  });

  return {
    ...response,
    objects: uniqueByStartTime.slice(0, limit),
  };
}

export async function hybridSearchForStoryId<T extends SchemaTypes>(
  collection: T,
  theirStoryId: string,
  searchTerm: string,
  limit = 1000,
  nerFilters?: string[],
  minValue?: number,
  maxValue?: number,
) {
  const client = await initWeaviateClient();
  const myCollection = client.collections.get<SchemaMap[T]>(collection);

  const filtersArray: FilterValue[] = [myCollection.filter.byProperty('theirstory_id' as any).equal(theirStoryId)];

  if (nerFilters?.length) {
    filtersArray.push(myCollection.filter.byProperty('ner_labels' as any).containsAny(nerFilters as any));
  }

  const combinedFilter: FilterValue =
    filtersArray.length > 1 ? { operator: 'And', filters: filtersArray, value: true } : filtersArray[0];

  const vector = await getLocalEmbedding(searchTerm);
  const response = await myCollection.query.hybrid(searchTerm, {
    vector,
    alpha: 0.55,
    fusionType: 'RelativeScore',
    limit,
    returnMetadata: ['score', 'distance', 'certainty'],
    filters: combinedFilter,
  });

  const filteredObjects = response.objects.filter((item) => {
    const score = item?.metadata?.score ?? 0;
    return (minValue === undefined || score >= minValue) && (maxValue === undefined || score <= maxValue);
  });

  const seen = new Set<number>();
  const uniqueByStartTime = filteredObjects.filter((item) => {
    const start = (item.properties as any)?.start_time;
    if (typeof start !== 'number') return false;
    if (seen.has(start)) return false;
    seen.add(start);
    return true;
  });

  return {
    ...response,
    objects: uniqueByStartTime.slice(0, limit),
  };
}

export async function vectorSearchForStoryId<T extends SchemaTypes>(
  collection: T,
  theirStoryId: string,
  searchTerm: string,
  limit = 1000,
  nerFilters?: string[],
  minValue?: number,
  maxValue?: number,
) {
  const client = await initWeaviateClient();
  const myCollection = client.collections.get<SchemaMap[T]>(collection);

  const filtersArray: FilterValue[] = [myCollection.filter.byProperty('theirstory_id' as any).equal(theirStoryId)];

  if (nerFilters?.length) {
    filtersArray.push(myCollection.filter.byProperty('ner_labels' as any).containsAny(nerFilters as any));
  }

  const combinedFilter: FilterValue =
    filtersArray.length > 1 ? { operator: 'And', filters: filtersArray, value: true } : filtersArray[0];

  const vector = await getLocalEmbedding(searchTerm);

  const response = await myCollection.query.nearVector(vector, {
    filters: combinedFilter,
    limit,
    returnMetadata: ['distance', 'certainty', 'score'],
  });

  const processedObjects = response.objects.map((obj) => {
    const certainty = obj.metadata?.certainty ?? 0;

    return {
      ...obj,
      metadata: {
        ...obj.metadata,
        score: certainty,
      },
    };
  });

  const filteredObjects = processedObjects.filter((obj) => {
    const certainty = obj.metadata?.certainty ?? 0;
    return certainty >= (minValue ?? 0) && certainty <= (maxValue ?? 1);
  });

  return {
    ...response,
    objects: filteredObjects,
  };
}

export async function bm25SearchForStoryId<T extends SchemaTypes>(
  collection: T,
  theirStoryId: string,
  searchTerm: string,
  limit = 1000,
  nerFilters?: string[],
  minValue?: number,
  maxValue?: number,
) {
  const client = await initWeaviateClient();
  const myCollection = client.collections.get<SchemaMap[T]>(collection);

  const filtersArray: FilterValue[] = [myCollection.filter.byProperty('theirstory_id' as any).equal(theirStoryId)];

  if (nerFilters?.length) {
    filtersArray.push(myCollection.filter.byProperty('ner_labels' as any).containsAny(nerFilters as any));
  }

  const combinedFilter: FilterValue =
    filtersArray.length > 1 ? { operator: 'And', filters: filtersArray, value: true } : filtersArray[0];

  const response = await myCollection.query.bm25(searchTerm, {
    filters: combinedFilter,
    limit,
    returnMetadata: ['score'],
  });

  const scores = response.objects.map((obj) => obj.metadata?.score ?? 0);
  const maxScore = Math.max(...scores);
  const minScore = Math.min(...scores);

  // Normalizes the score from bm25 to a 0-1 range
  const normalizedObjects = response.objects.map((obj) => {
    const rawScore = obj.metadata?.score ?? 0;
    const normalizedScore = maxScore === minScore ? 1 : (rawScore - minScore) / (maxScore - minScore);

    return {
      ...obj,
      metadata: {
        ...obj.metadata,
        score: normalizedScore,
      },
    };
  });

  const filteredObjects = normalizedObjects.filter((obj) => {
    const score = obj.metadata?.score ?? 0;
    return score >= (minValue ?? 0) && score <= (maxValue ?? 1);
  });

  return {
    ...response,
    objects: filteredObjects,
  };
}

// Search for NER entities across the collection
export async function searchNerEntitiesAcrossCollection(
  entityText: string,
  entityLabel: string,
  excludeStoryUuid?: string,
  limit = 100,
) {
  const client = await initWeaviateClient();
  const myCollection = client.collections.get<Chunks>('Chunks');

  try {
    const filtersArray: FilterValue[] = [
      myCollection.filter.byProperty('ner_text' as any).containsAny([entityText.toLowerCase()]),
      myCollection.filter.byProperty('ner_labels' as any).containsAny([entityLabel]),
    ];

    if (excludeStoryUuid) {
      filtersArray.push(myCollection.filter.byProperty('theirstory_id' as any).notEqual(excludeStoryUuid));
    }

    const combinedFilter: FilterValue = {
      operator: 'And',
      filters: filtersArray,
      value: true,
    };

    const response = await myCollection.query.fetchObjects({
      limit,
      filters: combinedFilter,
      returnProperties: [
        'interview_title',
        'start_time',
        'end_time',
        'speaker',
        'transcription',
        'ner_labels',
        'theirstory_id',
      ] as any,
    });

    return response;
  } catch (error) {
    console.error('Error searching NER entities across collection:', error);
    throw new Error('Failed to search NER entities across collection');
  }
}

export type IndexChapter = {
  section_id: number;
  section_title: string;
  start_time: number;
  end_time: number;
};

const INDEXES_CHUNKS_LIMIT = 10_000;

/** Fetches chunks and groups by story (theirstory_id) and section_id for the indexes page. */
export async function getChaptersGroupedByStory(): Promise<Record<string, IndexChapter[]>> {
  const client = await initWeaviateClient();
  const myCollection = client.collections.get<Chunks>('Chunks');
  const response = await myCollection.query.fetchObjects({
    limit: INDEXES_CHUNKS_LIMIT,
    returnProperties: [
      'theirstory_id',
      'section_id',
      'section_title',
      'start_time',
      'end_time',
    ] as any,
  });

  const byStory = new Map<string, Map<number, { title: string; start: number; end: number }>>();
  for (const obj of response.objects) {
    const p = obj.properties as any;
    const storyId = p?.theirstory_id ?? '';
    const sectionId = Number(p?.section_id ?? 0);
    const title = String(p?.section_title ?? '').trim() || 'Untitled section';
    const start = Number(p?.start_time ?? 0);
    const end = Number(p?.end_time ?? 0);
    if (!storyId) continue;
    if (!byStory.has(storyId)) {
      byStory.set(storyId, new Map());
    }
    const sections = byStory.get(storyId)!;
    if (!sections.has(sectionId)) {
      sections.set(sectionId, { title, start, end });
    } else {
      const cur = sections.get(sectionId)!;
      cur.start = Math.min(cur.start, start);
      cur.end = Math.max(cur.end, end);
    }
  }

  const result: Record<string, IndexChapter[]> = {};
  for (const [storyId, sections] of byStory.entries()) {
    const arr = Array.from(sections.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([section_id, { title: section_title, start: start_time, end: end_time }]) => ({
        section_id,
        section_title,
        start_time,
        end_time,
      }));
    result[storyId] = arr;
  }
  return result;
}

const NER_ENTITY_RECORDING_COUNT_KEY = (text: string, label: string) =>
  `${text.toLowerCase()}|${label}`;

/** Returns how many distinct recordings (testimonies) contain each entity. */
export async function getNerEntityRecordingCounts(
  entities: { text: string; label: string }[],
): Promise<Record<string, number>> {
  if (entities.length === 0) return {};
  const client = await initWeaviateClient();
  const myCollection = client.collections.get<Chunks>('Chunks');
  const result: Record<string, number> = {};
  const limit = 1000;

  for (const { text, label } of entities) {
    try {
      const filtersArray: FilterValue[] = [
        myCollection.filter.byProperty('ner_text' as any).containsAny([text.toLowerCase()]),
        myCollection.filter.byProperty('ner_labels' as any).containsAny([label]),
      ];
      const combinedFilter: FilterValue = {
        operator: 'And',
        filters: filtersArray,
        value: true,
      };
      const response = await myCollection.query.fetchObjects({
        limit,
        filters: combinedFilter,
        returnProperties: ['theirstory_id'] as any,
      });
      const ids = new Set<string>();
      for (const obj of response.objects) {
        const id = (obj.properties as any)?.theirstory_id;
        if (id) ids.add(id);
      }
      result[NER_ENTITY_RECORDING_COUNT_KEY(text, label)] = ids.size;
    } catch (err) {
      console.error('Error getting recording count for entity:', text, label, err);
      result[NER_ENTITY_RECORDING_COUNT_KEY(text, label)] = 0;
    }
  }

  return result;
}

const ENTITY_RECORDING_COUNTS_PATH = path.join(process.cwd(), 'json', 'entity-recording-counts.json');

/** Read precomputed entity → recording count map from json/entity-recording-counts.json if it exists. */
export async function getEntityRecordingCountsMap(): Promise<Record<string, number>> {
  try {
    const raw = await readFile(ENTITY_RECORDING_COUNTS_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const result: Record<string, number> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof key === 'string' && typeof value === 'number' && value >= 0) result[key] = value;
      }
      return result;
    }
  } catch {
    // File missing or invalid
  }
  return {};
}

// Weaviate default QUERY_MAXIMUM_RESULTS is 10,000; offset + limit cannot exceed it.
const BUILD_ENTITY_COUNTS_PAGE_SIZE = 100;
const BUILD_ENTITY_COUNTS_MAX_OFFSET = 10_000 - BUILD_ENTITY_COUNTS_PAGE_SIZE;

/** Build entity → recording count map from Weaviate Chunks and optionally write to json/entity-recording-counts.json. */
export async function buildEntityRecordingCountsMap(writeToFile = true): Promise<Record<string, number>> {
  const client = await initWeaviateClient();
  const myCollection = client.collections.get<Chunks>('Chunks');
  const keyToIds = new Map<string, Set<string>>();
  const limit = BUILD_ENTITY_COUNTS_PAGE_SIZE;
  let offset = 0;
  let hasMore = true;

  while (hasMore && offset <= BUILD_ENTITY_COUNTS_MAX_OFFSET) {
    const response = await myCollection.query.fetchObjects({
      limit,
      offset,
      returnProperties: ['ner_text', 'ner_labels', 'theirstory_id'] as any,
    });
    for (const obj of response.objects) {
      const props = obj.properties as any;
      const theirstoryId = props?.theirstory_id;
      if (!theirstoryId) continue;
      const texts: string[] = Array.isArray(props?.ner_text) ? props.ner_text : [];
      const labels: string[] = Array.isArray(props?.ner_labels) ? props.ner_labels : [];
      const len = Math.min(texts.length, labels.length);
      for (let i = 0; i < len; i++) {
        const text = String(texts[i] ?? '').toLowerCase().trim();
        const label = String(labels[i] ?? '').trim();
        if (!text || !label) continue;
        const key = NER_ENTITY_RECORDING_COUNT_KEY(text, label);
        if (!keyToIds.has(key)) keyToIds.set(key, new Set());
        keyToIds.get(key)!.add(theirstoryId);
      }
    }
    hasMore = response.objects.length === limit;
    offset += limit;
  }

  const result: Record<string, number> = {};
  for (const [key, ids] of keyToIds) result[key] = ids.size;

  if (writeToFile && Object.keys(result).length > 0) {
    try {
      await writeFile(ENTITY_RECORDING_COUNTS_PATH, JSON.stringify(result, null, 0), 'utf-8');
    } catch (e) {
      console.error('Failed to write entity-recording-counts.json:', e);
    }
  }
  return result;
}
