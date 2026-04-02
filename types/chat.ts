export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
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
};

export type ChatStreamChunk =
  | { type: 'status'; status: string }
  | { type: 'citations'; citations: Citation[] }
  | { type: 'text'; content: string }
  | { type: 'done' };
