/** Weaviate + NLP processor calls (REST, like scripts/import-interviews-weaviate.ts). */
import { log } from './log';
import type { CollectionRef, FolderRef } from './types';

export type ListedTestimony = { uuid: string; collectionId: string; title: string };

/** Story id from a Testimony's `transcription` property (JSON string written by the NLP processor). */
export function storyIdFromTranscription(transcription: unknown): string {
  if (typeof transcription !== 'string' || !transcription) return '';
  try {
    const parsed = JSON.parse(transcription);
    const id = parsed?.id ?? parsed?.story?._id ?? parsed?.storyId;
    return typeof id === 'string' || typeof id === 'number' ? String(id).trim() : '';
  } catch {
    return '';
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function waitFor(url: string, label: string, maxSeconds: number): Promise<void> {
  for (let i = 0; i < maxSeconds; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) return;
    } catch {
      // not up yet
    }
    if (i > 0 && i % 30 === 0) log.info(`Still waiting for ${label} at ${url}... (${i}s)`);
    await sleep(1000);
  }
  throw new Error(`${label} not ready after ${maxSeconds}s: ${url}`);
}

export class Weaviate {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey = '',
  ) {}

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
    };
  }

  waitUntilReady(maxSeconds = 120): Promise<void> {
    return waitFor(`${this.baseUrl}/v1/.well-known/ready`, 'Weaviate', maxSeconds);
  }

  private async graphql(query: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/v1/graphql`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(120_000),
    });
    const text = await res.text().catch(() => '');
    if (!res.ok) throw new Error(`Weaviate GraphQL failed: HTTP ${res.status} ${text.slice(0, 500)}`);
    return text ? JSON.parse(text) : {};
  }

  /**
   * Every Testimony (id, collection_id, interview_title), paginated with the `after` cursor.
   * Only small properties are selected; `transcription` is not fetched here.
   */
  async listTestimonies(pageSize = 200): Promise<ListedTestimony[]> {
    const out: ListedTestimony[] = [];
    let after = '';
    for (let page = 0; page < 10_000; page++) {
      const args = `limit: ${pageSize}${after ? `, after: ${JSON.stringify(after)}` : ''}`;
      const parsed = await this.graphql(
        `{ Get { Testimonies(${args}) { collection_id interview_title _additional { id } } } }`,
      );
      if (parsed?.errors?.length) {
        const message = String(parsed.errors[0]?.message ?? 'unknown error');
        // No Testimonies class yet (fresh portal): nothing to report.
        if (/Cannot query field "Testimonies"/i.test(message)) return [];
        throw new Error(`Weaviate GraphQL listing Testimonies: ${message.slice(0, 500)}`);
      }
      const rows: any[] = parsed?.data?.Get?.Testimonies ?? [];
      for (const row of rows) {
        const uuid = String(row?._additional?.id ?? '');
        if (!uuid) continue;
        out.push({
          uuid,
          collectionId: String(row?.collection_id ?? ''),
          title: String(row?.interview_title ?? ''),
        });
      }
      if (rows.length < pageSize) return out;
      after = String(rows[rows.length - 1]?._additional?.id ?? '');
      if (!after) return out;
    }
    throw new Error('Weaviate listing Testimonies: too many pages');
  }

  /**
   * The TheirStory story id of one Testimony. The schema has no story-id property; the NLP
   * processor stores it as `id` inside the `transcription` JSON. null if the Testimony is gone.
   */
  async getTestimonyStoryId(uuid: string): Promise<string | null> {
    const res = await fetch(`${this.baseUrl}/v1/objects/Testimonies/${encodeURIComponent(uuid)}`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(120_000),
    });
    if (res.status === 404) return null;
    const text = await res.text().catch(() => '');
    if (!res.ok) throw new Error(`Weaviate GET Testimony ${uuid}: HTTP ${res.status} ${text.slice(0, 300)}`);
    return storyIdFromTranscription(JSON.parse(text)?.properties?.transcription);
  }

  /** Delete all Chunks for a Testimony, then the Testimony itself. Missing objects are fine. */
  async deleteTestimony(uuid: string): Promise<{ chunksDeleted: number }> {
    let chunksDeleted = 0;
    // Batch delete is capped by QUERY_MAXIMUM_RESULTS per call; loop until nothing matches.
    for (let round = 0; round < 50; round++) {
      const res = await fetch(`${this.baseUrl}/v1/batch/objects`, {
        method: 'DELETE',
        headers: this.headers(),
        body: JSON.stringify({
          match: {
            class: 'Chunks',
            where: { path: ['theirstory_id'], operator: 'Equal', valueText: uuid },
          },
          output: 'minimal',
        }),
        signal: AbortSignal.timeout(120_000),
      });
      const text = await res.text().catch(() => '');
      if (!res.ok)
        throw new Error(`Weaviate chunk delete for ${uuid} failed: HTTP ${res.status} ${text.slice(0, 500)}`);
      const parsed = text ? JSON.parse(text) : {};
      const matches = Number(parsed?.results?.matches ?? 0);
      const failed = Number(parsed?.results?.failed ?? 0);
      if (failed > 0) throw new Error(`Weaviate chunk delete for ${uuid}: ${failed} deletions failed`);
      chunksDeleted += matches;
      if (matches === 0) break;
    }

    const res = await fetch(`${this.baseUrl}/v1/objects/Testimonies/${encodeURIComponent(uuid)}`, {
      method: 'DELETE',
      headers: this.headers(),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok && res.status !== 404) {
      const text = await res.text().catch(() => '');
      throw new Error(`Weaviate Testimony delete for ${uuid} failed: HTTP ${res.status} ${text.slice(0, 500)}`);
    }
    return { chunksDeleted };
  }
}

export class NlpProcessor {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs: number,
  ) {}

  waitUntilReady(maxSeconds = 600): Promise<void> {
    return waitFor(`${this.baseUrl}/health`, 'NLP processor', maxSeconds);
  }

  /** Same request the importer sends; the processor replaces the Testimony's chunks in place. */
  async processStory(body: {
    payload: any;
    collection: CollectionRef;
    folder: FolderRef;
  }): Promise<{ chunks?: number }> {
    const res = await fetch(`${this.baseUrl}/process-story?write_to_weaviate=true&run_ner=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const text = await res.text().catch(() => '');
    if (!res.ok) {
      let detail = text.slice(0, 500);
      try {
        detail = JSON.parse(text)?.error ?? detail;
      } catch {
        // keep raw text
      }
      throw new Error(`NLP /process-story failed: HTTP ${res.status} ${detail}`);
    }
    try {
      return { chunks: JSON.parse(text)?.counts?.chunks };
    } catch {
      return {};
    }
  }
}
