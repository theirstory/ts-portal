import type {
  ZoteroItemPayload,
  ZoteroNotePayload,
  ZoteroWriteResponse,
  ZoteroSearchItem,
  InterviewSaveData,
  NoteSaveData,
} from './types';

const ZOTERO_API_BASE = 'https://api.zotero.org';

function zoteroHeaders(apiKey: string): HeadersInit {
  return {
    'Zotero-API-Key': apiKey,
    'Content-Type': 'application/json',
    'Zotero-API-Version': '3',
  };
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatCreators(data: InterviewSaveData): { creatorType: string; firstName: string; lastName: string }[] {
  const creators: { creatorType: string; firstName: string; lastName: string }[] = [];

  for (const participant of data.participants) {
    const parts = participant.trim().split(/\s+/);
    const lastName = parts.length >= 2 ? parts[parts.length - 1] : participant.trim();
    const firstName = parts.length >= 2 ? parts.slice(0, -1).join(' ') : '';
    // First participant is interviewee, rest are interviewers
    const creatorType = creators.length === 0 ? 'interviewee' : 'interviewer';
    creators.push({ creatorType, firstName, lastName });
  }

  return creators;
}

// ── Create interview item ──────────────────────────────────────────────

export async function createInterviewItem(
  apiKey: string,
  userID: string,
  data: InterviewSaveData,
): Promise<{ itemKey: string }> {
  const item: ZoteroItemPayload = {
    itemType: 'interview',
    title: data.title,
    creators: formatCreators(data),
    date: data.recordingDate,
    interviewMedium: data.isAudio ? 'Audio' : 'Video',
    url: data.url,
    abstractNote: data.description,
    archive: data.archiveName,
    language: 'en',
    extra: data.duration > 0 ? `Running Time: ${formatDuration(data.duration)}` : '',
    tags: [{ tag: 'oral-history' }, { tag: 'theirstory-portal', type: 1 }],
    relations: {},
  };

  const response = await fetch(`${ZOTERO_API_BASE}/users/${userID}/items`, {
    method: 'POST',
    headers: zoteroHeaders(apiKey),
    body: JSON.stringify([item]),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Zotero API error: ${response.status} ${text}`);
  }

  const result = (await response.json()) as ZoteroWriteResponse;

  const firstSuccess = result.successful?.['0'];
  if (!firstSuccess) {
    const firstFailure = result.failed?.['0'];
    throw new Error(firstFailure?.message || 'Failed to create Zotero item');
  }

  return { itemKey: firstSuccess.key };
}

// ── Create child note ──────────────────────────────────────────────────

export async function createChildNote(
  apiKey: string,
  userID: string,
  data: NoteSaveData,
): Promise<{ noteKey: string }> {
  const noteHtml = [
    `<p><strong>Transcript excerpt</strong> (${formatTime(data.startTime)} \u2013 ${formatTime(data.endTime)})</p>`,
    `<blockquote><p>${escapeHtml(data.selectedText)}</p></blockquote>`,
    data.speaker ? `<p><strong>Speaker:</strong> ${escapeHtml(data.speaker)}</p>` : '',
    data.sectionTitle ? `<p><strong>Section:</strong> ${escapeHtml(data.sectionTitle)}</p>` : '',
    data.researchNote ? `<hr/><p><strong>Research note:</strong> ${escapeHtml(data.researchNote)}</p>` : '',
    `<p>Source: <a href="${escapeHtml(data.sourceUrl)}">${escapeHtml(data.interviewTitle)}</a></p>`,
  ]
    .filter(Boolean)
    .join('\n');

  const note: ZoteroNotePayload = {
    itemType: 'note',
    parentItem: data.parentItemKey,
    note: noteHtml,
    tags: [{ tag: 'transcript-excerpt' }, { tag: 'theirstory-portal', type: 1 }],
  };

  const response = await fetch(`${ZOTERO_API_BASE}/users/${userID}/items`, {
    method: 'POST',
    headers: zoteroHeaders(apiKey),
    body: JSON.stringify([note]),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Zotero API error: ${response.status} ${text}`);
  }

  const result = (await response.json()) as ZoteroWriteResponse;

  const firstSuccess = result.successful?.['0'];
  if (!firstSuccess) {
    const firstFailure = result.failed?.['0'];
    throw new Error(firstFailure?.message || 'Failed to create Zotero note');
  }

  return { noteKey: firstSuccess.key };
}

// ── Create standalone research note ─────────────────────────────────────

export async function createResearchNote(
  apiKey: string,
  userID: string,
  parentItemKey: string,
  researchNote: string,
): Promise<{ noteKey: string }> {
  const noteHtml = `<p><strong>Research note:</strong> ${escapeHtml(researchNote)}</p>`;

  const note: ZoteroNotePayload = {
    itemType: 'note',
    parentItem: parentItemKey,
    note: noteHtml,
    tags: [{ tag: 'research-note' }, { tag: 'theirstory-portal', type: 1 }],
  };

  const response = await fetch(`${ZOTERO_API_BASE}/users/${userID}/items`, {
    method: 'POST',
    headers: zoteroHeaders(apiKey),
    body: JSON.stringify([note]),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Zotero API error: ${response.status} ${text}`);
  }

  const result = (await response.json()) as ZoteroWriteResponse;

  const firstSuccess = result.successful?.['0'];
  if (!firstSuccess) {
    const firstFailure = result.failed?.['0'];
    throw new Error(firstFailure?.message || 'Failed to create Zotero note');
  }

  return { noteKey: firstSuccess.key };
}

// ── Search user library ────────────────────────────────────────────────

export async function searchUserLibrary(
  apiKey: string,
  userID: string,
  query: string,
  limit = 10,
): Promise<ZoteroSearchItem[]> {
  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
    format: 'json',
    sort: 'relevance',
  });

  const response = await fetch(`${ZOTERO_API_BASE}/users/${userID}/items?${params.toString()}`, {
    method: 'GET',
    headers: zoteroHeaders(apiKey),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Zotero search error: ${response.status} ${text}`);
  }

  const items = (await response.json()) as Array<{
    key: string;
    version: number;
    data: Record<string, unknown>;
  }>;

  return items.map((item) => {
    const d = item.data;
    const creators = Array.isArray(d.creators)
      ? (d.creators as Array<{ firstName?: string; lastName?: string; name?: string }>)
          .map((c) => (c.name ? c.name : [c.firstName, c.lastName].filter(Boolean).join(' ')))
          .join('; ')
      : '';

    const tags = Array.isArray(d.tags) ? (d.tags as Array<{ tag: string }>).map((t) => t.tag) : [];

    return {
      key: item.key,
      version: item.version,
      itemType: String(d.itemType || ''),
      title: String(d.title || ''),
      creators,
      date: String(d.date || ''),
      abstractNote: String(d.abstractNote || ''),
      url: String(d.url || ''),
      tags,
    };
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
