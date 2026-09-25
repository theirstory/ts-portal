/**
 * Public entry point for Portal Publisher's signed "sync now" ping.
 *
 * Paste https://<portal-domain>/api/portal-sync into the portal's sync URL in Portal Publisher.
 * This route does not verify the signature itself: it forwards the raw body and the X-Portal-*
 * headers to the internal portal-sync service (which holds PORTAL_SYNC_TOKEN, verifies, and
 * runs the sync) and relays its status code. See docs/PORTAL_SYNC.md.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 8 * 1024;
const FORWARD_TIMEOUT_MS = 10_000;

function json(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status });
}

/** Read the request body, giving up (null) once it exceeds `limit` bytes. */
async function readLimitedBody(request: Request, limit: number): Promise<Uint8Array | null> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > limit) return null;
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function POST(request: Request) {
  const body = await readLimitedBody(request, MAX_BODY_BYTES);
  if (!body) return json(413, { error: 'body too large' });

  const headers = new Headers({ 'Content-Type': request.headers.get('content-type') ?? 'application/json' });
  for (const [name, value] of request.headers) {
    if (name.toLowerCase().startsWith('x-portal-')) headers.set(name, value);
  }

  const host = process.env.PORTAL_SYNC_HOST || 'portal-sync';
  const port = process.env.PORTAL_SYNC_PORT || '7171';

  let upstream: Response;
  try {
    upstream = await fetch(`http://${host}:${port}/trigger`, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(FORWARD_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch {
    return json(503, { error: 'portal sync service unavailable' });
  }

  // Relay the status (202 accepted, 401 bad signature, 503 not configured, ...). The upstream
  // body is small JSON; pass it through only when it parses.
  const text = await upstream.text().catch(() => '');
  let payload: Record<string, unknown> = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    // ignore
  }
  return json(upstream.status, payload);
}
