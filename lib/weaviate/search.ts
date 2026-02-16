'use server';
import { Chunks, Testimonies, SchemaMap, SchemaTypes } from '@/types/weaviate';
import { initWeaviateClient } from './client';
import { FilterValue, QueryProperty } from 'weaviate-client';
import { readdir, readFile } from 'node:fs/promises';
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

  // 1) BM25
  const bm25Res = await myCollection.query.bm25(searchTerm, {
    limit,
    offset,
    returnMetadata: ['score'],
    filters: combinedFilter,
    returnProperties,
  });

  // normalize score bm25 a 0..1
  const bmScores = bm25Res.objects.map((o) => o.metadata?.score ?? 0);
  const bmMax = Math.max(...bmScores, 0);
  const bmMin = Math.min(...bmScores, 0);

  const bmMap = new Map<string, number>();
  for (const obj of bm25Res.objects) {
    const id = (obj as any).uuid ?? (obj as any).id ?? '';
    const raw = obj.metadata?.score ?? 0;
    const norm = bmMax === bmMin ? 1 : (raw - bmMin) / (bmMax - bmMin);
    if (id) bmMap.set(id, norm);
  }

  // 2) Vector search (nearVector) using local embedding
  const vector = await getLocalEmbedding(searchTerm);
  const vecRes = await myCollection.query.nearVector(vector, {
    limit,
    offset,
    returnMetadata: ['distance', 'certainty'],
    filters: combinedFilter,
    returnProperties,
  });

  // Convert certainty to 0..1 (usually already 0..1)
  const vecMap = new Map<string, number>();
  for (const obj of vecRes.objects) {
    const id = (obj as any).uuid ?? (obj as any).id ?? '';
    const certainty = obj.metadata?.certainty ?? 0;
    if (id) vecMap.set(id, certainty);
  }

  // 3) Merge with combined score
  // We combine both scores into a single one. If only one exists, use it fully.
  // weights: adjust as desired (e.g. 0.55 vector / 0.45 bm25)
  const hasBm25 = bm25Res.objects.length > 0;

  const W_VEC = hasBm25 ? 0.55 : 1;
  const W_BM25 = hasBm25 ? 0.45 : 0;

  const mergedById = new Map<string, any>();

  const upsert = (obj: any) => {
    const id = obj?.uuid ?? obj?.id ?? obj?.metadata?.id ?? '';
    if (!id) return;

    const bm = bmMap.get(id) ?? 0;
    const vec = vecMap.get(id) ?? obj?.metadata?.certainty ?? 0; // fallback al certainty real si existe
    const combined = W_VEC * vec + W_BM25 * bm;

    const prev = mergedById.get(id);
    if (!prev || (prev.metadata?.score ?? 0) < combined) {
      mergedById.set(id, {
        ...obj,
        metadata: {
          ...(obj.metadata ?? {}),
          score: combined,
          bm25_score: bm,
          vector_score: vec,
        },
      });
    }
  };

  bm25Res.objects.forEach(upsert);
  vecRes.objects.forEach(upsert);

  // sort by combined score descending
  let merged = Array.from(mergedById.values()).sort((a, b) => (b.metadata?.score ?? 0) - (a.metadata?.score ?? 0));

  const scoresDebug = merged.map((x) => x?.metadata?.score ?? 0);
  const maxCombined = Math.max(...scoresDebug, 0);
  console.log('[hybridSearch] combined score max:', maxCombined, 'minValue:', minValue);

  // apply min/max on combined score (0..1)
  merged = merged.filter((item) => {
    const score = item?.metadata?.score ?? 0;
    return (minValue === undefined || score >= minValue) && (maxValue === undefined || score <= maxValue);
  });

  // dedupe by start_time
  const seen = new Set<number>();
  const uniqueByStartTime = merged.filter((item) => {
    const start = (item.properties as any)?.start_time;
    if (typeof start !== 'number') return false;
    if (seen.has(start)) return false;
    seen.add(start);
    return true;
  });

  return {
    ...vecRes,
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

  // 1) BM25
  const bm25Res = await myCollection.query.bm25(searchTerm, {
    limit,
    returnMetadata: ['score'],
    filters: combinedFilter,
  });

  // Normalize BM25 scores to 0..1
  const bmScores = bm25Res.objects.map((o) => o.metadata?.score ?? 0);
  const bmMax = Math.max(...bmScores, 0);
  const bmMin = Math.min(...bmScores, 0);

  const bmMap = new Map<string, number>();
  for (const obj of bm25Res.objects) {
    const id = (obj as any).uuid ?? (obj as any).id ?? '';
    const raw = obj.metadata?.score ?? 0;
    const norm = bmMax === bmMin ? 1 : (raw - bmMin) / (bmMax - bmMin);
    if (id) bmMap.set(id, norm);
  }

  // 2) Vector search using local embedding
  const vector = await getLocalEmbedding(searchTerm);
  const vecRes = await myCollection.query.nearVector(vector, {
    limit,
    returnMetadata: ['distance', 'certainty'],
    filters: combinedFilter,
  });

  const vecMap = new Map<string, number>();
  for (const obj of vecRes.objects) {
    const id = (obj as any).uuid ?? (obj as any).id ?? '';
    const certainty = obj.metadata?.certainty ?? 0;
    if (id) vecMap.set(id, certainty);
  }

  // 3) Merge both searches with weighted scores
  const hasBm25 = bm25Res.objects.length > 0;
  const W_VEC = hasBm25 ? 0.55 : 1;
  const W_BM25 = hasBm25 ? 0.45 : 0;

  const mergedById = new Map<string, any>();

  const upsert = (obj: any) => {
    const id = obj?.uuid ?? obj?.id ?? '';
    if (!id) return;

    const bm = bmMap.get(id) ?? 0;
    const vec = vecMap.get(id) ?? obj?.metadata?.certainty ?? 0;
    const combined = W_VEC * vec + W_BM25 * bm;

    const prev = mergedById.get(id);
    if (!prev || (prev.metadata?.score ?? 0) < combined) {
      mergedById.set(id, {
        ...obj,
        metadata: {
          ...(obj.metadata ?? {}),
          score: combined,
          bm25_score: bm,
          vector_score: vec,
        },
      });
    }
  };

  bm25Res.objects.forEach(upsert);
  vecRes.objects.forEach(upsert);

  // Sort by combined score descending
  let merged = Array.from(mergedById.values()).sort((a, b) => (b.metadata?.score ?? 0) - (a.metadata?.score ?? 0));

  // Apply min/max filters
  merged = merged.filter((item) => {
    const score = item?.metadata?.score ?? 0;
    return (minValue === undefined || score >= minValue) && (maxValue === undefined || score <= maxValue);
  });

  // Dedupe by start_time
  const seen = new Set<number>();
  const uniqueByStartTime = merged.filter((item) => {
    const start = (item.properties as any)?.start_time;
    if (typeof start !== 'number') return false;
    if (seen.has(start)) return false;
    seen.add(start);
    return true;
  });

  return {
    ...vecRes,
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
