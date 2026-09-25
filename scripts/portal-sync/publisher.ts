import type { InventoryReport, ItemSnapshot, Manifest, StatusReport } from './types';

export class PublisherError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** Client for the Portal Publisher's /api/portal/v1 endpoints. Never include the token in errors. */
export class PublisherClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  private async request(path: string, init: RequestInit & { timeoutMs: number }): Promise<Response> {
    const url = `${this.baseUrl}/api/portal/v1${path}`;
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers: {
          Accept: 'application/json',
          ...(init.headers ?? {}),
          Authorization: `Bearer ${this.token}`,
        },
        signal: AbortSignal.timeout(init.timeoutMs),
      });
    } catch (error) {
      const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      throw new PublisherError(`${init.method ?? 'GET'} ${url} failed: ${reason}`);
    }
    if (res.status === 401) {
      throw new PublisherError(
        `${init.method ?? 'GET'} ${url}: 401 Unauthorized (PORTAL_SYNC_TOKEN unknown or revoked)`,
        401,
      );
    }
    return res;
  }

  private static async failure(res: Response, what: string): Promise<PublisherError> {
    const text = (await res.text().catch(() => '')).slice(0, 500);
    return new PublisherError(`${what}: HTTP ${res.status}${text ? ` ${text}` : ''}`, res.status);
  }

  async getManifest(): Promise<Manifest> {
    const res = await this.request('/manifest', { method: 'GET', timeoutMs: 60_000 });
    if (!res.ok) throw await PublisherClient.failure(res, 'GET /manifest');
    const manifest = (await res.json()) as Manifest;
    if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.items)) {
      throw new PublisherError('GET /manifest: response is not a manifest');
    }
    if (manifest.protocol !== 1) {
      throw new PublisherError(
        `GET /manifest: unsupported protocol ${String(manifest.protocol)} (this portal speaks 1)`,
      );
    }
    return manifest;
  }

  /** Returns null on 404 (no longer published to this portal). */
  async getItem(storyId: string): Promise<ItemSnapshot | null> {
    const res = await this.request(`/items/${encodeURIComponent(storyId)}`, { method: 'GET', timeoutMs: 5 * 60_000 });
    if (res.status === 404) return null;
    if (!res.ok) throw await PublisherClient.failure(res, `GET /items/${storyId}`);
    const item = (await res.json()) as ItemSnapshot;
    if (!item || typeof item !== 'object' || !item.payload || typeof item.payload !== 'object') {
      throw new PublisherError(`GET /items/${storyId}: response has no payload`);
    }
    return item;
  }

  async postStatus(report: StatusReport): Promise<void> {
    const res = await this.request('/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
      timeoutMs: 30_000,
    });
    if (!res.ok) throw await PublisherClient.failure(res, 'POST /status');
  }

  async postInventory(report: InventoryReport): Promise<void> {
    const res = await this.request('/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
      timeoutMs: 120_000,
    });
    if (!res.ok) throw await PublisherClient.failure(res, 'POST /inventory');
  }
}
