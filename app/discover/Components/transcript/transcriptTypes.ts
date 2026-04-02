import { Transcription } from '@/types/transcription';

export type TranscriptData = {
  transcription: Transcription;
  videoUrl: string;
  isAudioFile: boolean;
  interviewTitle: string;
};

export type ThematicMatch = {
  transcription: string;
  speaker: string;
  sectionTitle: string;
  startTime: number;
  endTime: number;
  score: number;
};

export type SearchMode = 'text' | 'thematic';
