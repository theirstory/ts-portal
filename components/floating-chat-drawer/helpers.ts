'use client';

import { Citation } from '@/types/chat';

export type SearchType = 'bm25' | 'vector' | 'hybrid';

export const SEARCH_TYPE_LABELS: Record<string, string> = {
  bm25: 'Keyword',
  vector: 'Thematic',
  hybrid: 'Hybrid',
};

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export type RecordingGroup = {
  theirstoryId: string;
  interviewTitle: string;
  videoUrl: string;
  isAudioFile: boolean;
  results: Citation[];
};

export function groupByRecording(citations: Citation[]): RecordingGroup[] {
  const map = new Map<string, Citation[]>();
  const order: string[] = [];
  const meta = new Map<string, { interviewTitle: string; videoUrl: string; isAudioFile: boolean }>();

  for (const c of citations) {
    const id = c.theirstoryId;
    if (!map.has(id)) {
      map.set(id, []);
      order.push(id);
      meta.set(id, {
        interviewTitle: c.interviewTitle,
        videoUrl: c.videoUrl,
        isAudioFile: c.isAudioFile ?? false,
      });
    }
    map.get(id)!.push(c);
  }

  return order.map((id) => ({
    theirstoryId: id,
    ...meta.get(id)!,
    results: map.get(id)!.sort((a, b) => a.startTime - b.startTime),
  }));
}
