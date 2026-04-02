'use client';

import { Citation } from '@/types/chat';
import { colors } from '@/lib/theme';

export const CHAPTER_COLOR = colors.success.main;
export const CLIP_COLOR = colors.primary.main;

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
  chapters: (Citation & { clips: Citation[] })[];
  ungroupedClips: Citation[];
};

export function groupByRecording(citations: Citation[]): RecordingGroup[] {
  const recordingMap = new Map<string, { chapters: Citation[]; clips: Citation[] }>();
  const recordingOrder: string[] = [];
  const recordingMeta = new Map<string, { interviewTitle: string; videoUrl: string; isAudioFile: boolean }>();

  for (const citation of citations) {
    const id = citation.theirstoryId;
    if (!recordingMap.has(id)) {
      recordingMap.set(id, { chapters: [], clips: [] });
      recordingOrder.push(id);
      recordingMeta.set(id, {
        interviewTitle: citation.interviewTitle,
        videoUrl: citation.videoUrl,
        isAudioFile: citation.isAudioFile ?? false,
      });
    }

    if (citation.isChapterSynopsis) {
      recordingMap.get(id)!.chapters.push(citation);
    } else {
      recordingMap.get(id)!.clips.push(citation);
    }
  }

  return recordingOrder.map((id) => {
    const { chapters, clips } = recordingMap.get(id)!;
    const meta = recordingMeta.get(id)!;
    const sortedChapters = [...chapters].sort((a, b) => a.startTime - b.startTime);
    const assignedClipIndexes = new Set<number>();
    const chaptersWithClips = sortedChapters.map((chapter) => {
      const chapterClips: Citation[] = [];
      clips.forEach((clip, idx) => {
        if (!assignedClipIndexes.has(idx) && clip.startTime >= chapter.startTime && clip.startTime < chapter.endTime) {
          chapterClips.push(clip);
          assignedClipIndexes.add(idx);
        }
      });
      chapterClips.sort((a, b) => a.startTime - b.startTime);
      return { ...chapter, clips: chapterClips };
    });

    const ungroupedClips = clips.filter((_, idx) => !assignedClipIndexes.has(idx));
    ungroupedClips.sort((a, b) => a.startTime - b.startTime);

    return {
      theirstoryId: id,
      interviewTitle: meta.interviewTitle,
      videoUrl: meta.videoUrl,
      isAudioFile: meta.isAudioFile,
      chapters: chaptersWithClips,
      ungroupedClips,
    };
  });
}
