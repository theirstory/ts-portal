/**
 * Shared id helpers for Testimony UUIDs and collection ids.
 *
 * These must stay byte-for-byte compatible with the NLP processor
 * (nlp-processor/utils.py `convert_to_uuid` and main.py `uuid_prefix`), which computes the
 * Testimony UUID from `<collection id lowercased>:<story _id>` when writing to Weaviate.
 */
import { createHash } from 'node:crypto';

export const UUID_NAMESPACE_URL = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';

function formatUuidHex(hex: string): string {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function uuidToBytes(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ''), 'hex');
}

export function uuidV5(value: string, namespace: string): string {
  const bytes = createHash('sha1')
    .update(Buffer.concat([uuidToBytes(namespace), Buffer.from(value)]))
    .digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return formatUuidHex(bytes.subarray(0, 16).toString('hex'));
}

export function convertToUuid(rawId: string): string {
  const value = rawId.trim();
  const compact = value.replace(/-/g, '');

  if (/^[0-9a-fA-F]{32}$/.test(compact)) {
    return formatUuidHex(compact.toLowerCase());
  }

  if (compact && /^[0-9a-fA-F]+$/.test(compact)) {
    return formatUuidHex(compact.toLowerCase().padEnd(32, '0').slice(0, 32));
  }

  return uuidV5(value || 'default', UUID_NAMESPACE_URL);
}

/** Testimony UUID as written by the NLP processor for a given collection id + story id. */
export function testimonyUuid(collectionId: string, storyId: string): string {
  return convertToUuid(`${collectionId.trim().toLowerCase() || 'default'}:${storyId}`);
}

export function normalizeCollectionId(input: string): string {
  const normalized = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'default';
}

export function humanizeCollectionName(id: string): string {
  return id
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
