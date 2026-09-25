import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { verifyPing } from './hmac';
import { log } from './log';

export const MAX_TRIGGER_BODY_BYTES = 8 * 1024;

export type ServerHandlers = {
  token: string;
  enabled: boolean;
  onTrigger: (reason: string) => 'started' | 'queued';
  health: () => Record<string, unknown>;
};

function send(res: ServerResponse, status: number, body: Record<string, unknown>): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text) });
  res.end(text);
}

function readBody(req: IncomingMessage, limit: number): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length'] ?? 0);
    if (declared > limit) {
      req.resume();
      return resolve(null);
    }
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        tooLarge = true;
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(tooLarge ? null : Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

export function createTriggerServer(handlers: ServerHandlers): Server {
  return createServer(async (req, res) => {
    const path = (req.url ?? '/').split('?')[0];
    try {
      if (req.method === 'GET' && path === '/health') {
        return send(res, 200, { ok: true, ...handlers.health() });
      }

      if (path === '/trigger') {
        if (req.method !== 'POST') {
          res.setHeader('Allow', 'POST');
          return send(res, 405, { error: 'method not allowed' });
        }
        const body = await readBody(req, MAX_TRIGGER_BODY_BYTES);
        if (!body) return send(res, 413, { error: 'body too large' });
        if (!handlers.enabled) return send(res, 503, { error: 'portal sync is not configured on this portal' });

        const verdict = verifyPing({
          token: handlers.token,
          timestampHeader: header(req, 'x-portal-timestamp'),
          signatureHeader: header(req, 'x-portal-signature'),
          rawBody: body,
        });
        if (!verdict.ok) {
          log.warn(`Rejected /trigger: ${verdict.reason}`);
          return send(res, 401, { error: 'invalid signature' });
        }

        let reason = 'ping';
        try {
          const parsed = JSON.parse(body.toString('utf-8'));
          if (typeof parsed?.reason === 'string') reason = `ping:${parsed.reason.slice(0, 40)}`;
        } catch {
          // The ping carries no data we depend on.
        }
        const outcome = handlers.onTrigger(reason);
        log.info(`Accepted /trigger (${reason}); run ${outcome}`);
        return send(res, 202, { accepted: true, run: outcome });
      }

      return send(res, 404, { error: 'not found' });
    } catch (error) {
      log.error(`HTTP handler error: ${error instanceof Error ? error.message : String(error)}`);
      if (!res.headersSent) send(res, 500, { error: 'internal error' });
    }
  });
}
