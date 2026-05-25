export type ZoteroContextItem = {
  key: string;
  title: string;
  creators: string;
  date: string;
  itemType: string;
  abstractNote: string;
  url: string;
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  zoteroItems?: ZoteroContextItem[];
};

export type Citation = {
  index: number;
  transcription: string;
  speaker: string;
  interviewTitle: string;
  sectionTitle: string;
  startTime: number;
  endTime: number;
  theirstoryId: string;
  videoUrl: string;
  isAudioFile?: boolean;
  score?: number;
  isChapterSynopsis?: boolean;
};

export type ChatRequest = {
  messages: { role: 'user' | 'assistant'; content: string }[];
  query: string;
  responseLanguage?: string;
  includeZoteroContext?: boolean;
};

export type ChatStreamChunk =
  | { type: 'status'; status: string }
  | { type: 'citations'; citations: Citation[] }
  | { type: 'text'; content: string }
  | { type: 'zotero_context'; items: ZoteroContextItem[] }
  | { type: 'done' };
