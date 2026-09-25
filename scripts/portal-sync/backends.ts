/** Weaviate + NLP processor calls (REST, like scripts/import-interviews-weaviate.ts). */
import { log } from './log';
import type { CollectionRef, FolderRef } from './types';

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
