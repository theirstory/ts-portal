import { createHmac, timingSafeEqual } from 'node:crypto';

/** Maximum allowed distance between X-Portal-Timestamp and now, in seconds (spec: 5 minutes). */
export const MAX_SKEW_SECONDS = 5 * 60;

export type VerifyResult = { ok: true } | { ok: false; reason: string };

export function signPing(token: string, timestamp: string, rawBody: string | Buffer): string {
  const hmac = createHmac('sha256', token);
  hmac.update(`${timestamp}.`);
  hmac.update(rawBody);
  return `sha256=${hmac.digest('hex')}`;
}

/**
 * Verify a "sync now" ping: X-Portal-Signature = sha256=<hex HMAC-SHA256(token, "<timestamp>.<raw body>")>,
 * X-Portal-Timestamp within MAX_SKEW_SECONDS of now. Constant-time signature comparison.
 */
export function verifyPing(params: {
  token: string;
  timestampHeader: string | undefined;
  signatureHeader: string | undefined;
  rawBody: Buffer;
  nowSeconds?: number;
}): VerifyResult {
  const { token, timestampHeader, signatureHeader, rawBody } = params;
  const nowSeconds = params.nowSeconds ?? Math.floor(Date.now() / 1000);

  if (!token) return { ok: false, reason: 'sync token not configured' };
  if (!timestampHeader || !/^\d{1,12}$/.test(timestampHeader.trim())) {
    return { ok: false, reason: 'missing or malformed X-Portal-Timestamp' };
  }
  const timestamp = timestampHeader.trim();
  if (Math.abs(nowSeconds - Number(timestamp)) > MAX_SKEW_SECONDS) {
    return { ok: false, reason: 'timestamp outside allowed window' };
  }

  const match = /^sha256=([0-9a-fA-F]{64})$/.exec((signatureHeader ?? '').trim());
  if (!match) return { ok: false, reason: 'missing or malformed X-Portal-Signature' };

  const expected = Buffer.from(signPing(token, timestamp, rawBody).slice('sha256='.length), 'hex');
  const provided = Buffer.from(match[1].toLowerCase(), 'hex');
  // Both are 32 bytes here (regex guarantees 64 hex chars), so timingSafeEqual cannot throw.
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return { ok: false, reason: 'signature mismatch' };
  }
  return { ok: true };
}
