// ── Zotero session stored in encrypted cookie ──────────────────────────
export type ZoteroSession = {
  apiKey: string;
  userID: string;
  username: string;
};

// ── OAuth 1.0a ─────────────────────────────────────────────────────────
export type OAuthPendingSession = {
  oauthTokenSecret: string;
  returnTo: string;
};

export type OAuthRequestTokenResponse = {
  oauthToken: string;
  oauthTokenSecret: string;
};

export type OAuthAccessTokenResponse = {
  oauthToken: string; // this IS the API key
  userID: string;
  username: string;
};

// ── Zotero item creation ───────────────────────────────────────────────
export type ZoteroCreator = {
  creatorType: string;
  firstName?: string;
  lastName?: string;
  name?: string; // single-field name (e.g. organizations)
};

export type ZoteroTag = {
  tag: string;
  type?: number; // 1 = automatic
};

export type ZoteroItemPayload = {
  itemType: string;
  title?: string;
  creators?: ZoteroCreator[];
  date?: string;
  interviewMedium?: string;
  url?: string;
  abstractNote?: string;
  archive?: string;
  language?: string;
  tags?: ZoteroTag[];
  collections?: string[];
  relations?: Record<string, string>;
  runningTime?: string;
  extra?: string;
  [key: string]: unknown;
};

export type ZoteroNotePayload = {
  itemType: 'note';
  parentItem: string;
  note: string;
  tags?: ZoteroTag[];
};

export type ZoteroWriteResponse = {
  successful: Record<string, { key: string; version: number; data: Record<string, unknown> }>;
  unchanged: Record<string, string>;
  failed: Record<string, { key: string; code: number; message: string }>;
};

// ── Zotero search results ──────────────────────────────────────────────
export type ZoteroSearchItem = {
  key: string;
  version: number;
  itemType: string;
  title: string;
  creators: string; // formatted string
  date: string;
  abstractNote: string;
  url: string;
  tags: string[];
};

// ── Interview metadata for saving ──────────────────────────────────────
export type InterviewSaveData = {
  title: string;
  participants: string[];
  recordingDate: string;
  isAudio: boolean;
  url: string;
  description: string;
  archiveName: string;
  duration: number;
  researchNote?: string;
};

export type NoteSaveData = {
  parentItemKey: string;
  selectedText: string;
  startTime: number;
  endTime: number;
  speaker: string;
  sectionTitle: string;
  interviewTitle: string;
  sourceUrl: string;
  researchNote?: string;
};
