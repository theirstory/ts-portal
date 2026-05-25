import { createHmac, randomBytes } from 'crypto';
import type { OAuthRequestTokenResponse, OAuthAccessTokenResponse } from './types';

const ZOTERO_REQUEST_TOKEN_URL = 'https://www.zotero.org/oauth/request';
const ZOTERO_AUTHORIZE_URL = 'https://www.zotero.org/oauth/authorize';
const ZOTERO_ACCESS_TOKEN_URL = 'https://www.zotero.org/oauth/access';

function getConsumerKey(): string {
  const key = process.env.ZOTERO_CLIENT_KEY;
  if (!key) throw new Error('ZOTERO_CLIENT_KEY environment variable is not set');
  return key;
}

function getConsumerSecret(): string {
  const secret = process.env.ZOTERO_CLIENT_SECRET;
  if (!secret) throw new Error('ZOTERO_CLIENT_SECRET environment variable is not set');
  return secret;
}

function percentEncode(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function generateNonce(): string {
  return randomBytes(16).toString('hex');
}

function generateTimestamp(): string {
  return Math.floor(Date.now() / 1000).toString();
}

function buildSignatureBaseString(method: string, url: string, params: Record<string, string>): string {
  // Sort parameters alphabetically by key
  const sortedKeys = Object.keys(params).sort();
  const paramString = sortedKeys.map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`).join('&');
  return `${method.toUpperCase()}&${percentEncode(url)}&${percentEncode(paramString)}`;
}

function sign(baseString: string, consumerSecret: string, tokenSecret = ''): string {
  const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
  return createHmac('sha1', signingKey).update(baseString).digest('base64');
}

function buildAuthorizationHeader(params: Record<string, string>): string {
  const parts = Object.entries(params)
    .map(([k, v]) => `${percentEncode(k)}="${percentEncode(v)}"`)
    .join(', ');
  return `OAuth ${parts}`;
}

function parseFormResponse(body: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of body.split('&')) {
    const [key, value] = pair.split('=');
    if (key) result[decodeURIComponent(key)] = decodeURIComponent(value || '');
  }
  return result;
}

// ── Step 1: Request Token ──────────────────────────────────────────────

export async function getRequestToken(callbackUrl: string): Promise<OAuthRequestTokenResponse> {
  const consumerKey = getConsumerKey();
  const consumerSecret = getConsumerSecret();

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: generateTimestamp(),
    oauth_nonce: generateNonce(),
    oauth_version: '1.0',
    oauth_callback: callbackUrl,
  };

  const baseString = buildSignatureBaseString('POST', ZOTERO_REQUEST_TOKEN_URL, oauthParams);
  oauthParams.oauth_signature = sign(baseString, consumerSecret);

  const response = await fetch(ZOTERO_REQUEST_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: buildAuthorizationHeader(oauthParams),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to get request token: ${response.status} ${text}`);
  }

  const body = await response.text();
  const parsed = parseFormResponse(body);

  if (!parsed.oauth_token || !parsed.oauth_token_secret) {
    throw new Error('Invalid request token response from Zotero');
  }

  return {
    oauthToken: parsed.oauth_token,
    oauthTokenSecret: parsed.oauth_token_secret,
  };
}

// ── Step 2: Build Authorization URL ────────────────────────────────────

export function buildAuthorizeUrl(oauthToken: string): string {
  const params = new URLSearchParams({
    oauth_token: oauthToken,
    library_access: '1',
    notes_access: '1',
    write_access: '1',
    all_groups: 'write',
  });
  return `${ZOTERO_AUTHORIZE_URL}?${params.toString()}`;
}

// ── Step 3: Exchange for Access Token ──────────────────────────────────

export async function getAccessToken(
  oauthToken: string,
  oauthTokenSecret: string,
  oauthVerifier: string,
): Promise<OAuthAccessTokenResponse> {
  const consumerKey = getConsumerKey();
  const consumerSecret = getConsumerSecret();

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_token: oauthToken,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: generateTimestamp(),
    oauth_nonce: generateNonce(),
    oauth_version: '1.0',
    oauth_verifier: oauthVerifier,
  };

  const baseString = buildSignatureBaseString('POST', ZOTERO_ACCESS_TOKEN_URL, oauthParams);
  oauthParams.oauth_signature = sign(baseString, consumerSecret, oauthTokenSecret);

  const response = await fetch(ZOTERO_ACCESS_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: buildAuthorizationHeader(oauthParams),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to get access token: ${response.status} ${text}`);
  }

  const body = await response.text();
  const parsed = parseFormResponse(body);

  if (!parsed.oauth_token || !parsed.userID) {
    throw new Error('Invalid access token response from Zotero');
  }

  return {
    oauthToken: parsed.oauth_token,
    userID: parsed.userID,
    username: parsed.username || '',
  };
}
