import { NextResponse } from 'next/server';
import { getAllStoriesFromCollection, getChaptersGroupedByStory } from '@/lib/weaviate/search';
import { SchemaTypes } from '@/types/weaviate';

const INDEXES_STORIES_LIMIT = 500;
const STORIES_RETURN_PROPERTIES = [
  'interview_title',
  'interview_description',
  'interview_duration',
  'ner_labels',
  'isAudioFile',
  'video_url',
  'collection_id',
  'collection_name',
  'collection_description',
  'transcription',
] as const;

export type IndexesStory = {
  uuid: string;
  interview_title: string;
  interview_description: string;
  interview_duration: number;
  ner_labels: string[];
  isAudioFile: boolean;
  video_url: string;
  collection_id: string;
  collection_name: string;
  collection_description: string;
};

export type IndexChapter = {
  section_id: number;
  section_title: string;
  start_time: number;
  end_time: number;
  synopsis?: string;
};

export type IndexesApiResponse = {
  stories: IndexesStory[];
  chaptersByStoryId: Record<string, IndexChapter[]>;
};

export async function GET() {
  try {
    const [storiesResponse, chaptersByStoryId] = await Promise.all([
      getAllStoriesFromCollection(SchemaTypes.Testimonies, [...STORIES_RETURN_PROPERTIES], INDEXES_STORIES_LIMIT, 0),
      getChaptersGroupedByStory(),
    ]);

    const stories: IndexesStory[] = (storiesResponse?.objects ?? []).map((obj) => {
      const p = obj.properties as Record<string, unknown>;
      return {
        uuid: obj.uuid ?? '',
        interview_title: String(p?.interview_title ?? ''),
        interview_description: String(p?.interview_description ?? ''),
        interview_duration: Number(p?.interview_duration ?? 0),
        ner_labels: Array.isArray(p?.ner_labels) ? (p.ner_labels as string[]) : [],
        isAudioFile: Boolean(p?.isAudioFile),
        video_url: String(p?.video_url ?? ''),
        collection_id: String(p?.collection_id ?? ''),
        collection_name: String(p?.collection_name ?? ''),
        collection_description: String(p?.collection_description ?? ''),
      };
    });

    // Build section synopses from transcription JSON (sections[].synopsis) per story
    const synopsisByStoryId: Record<string, string[]> = {};
    for (const obj of storiesResponse?.objects ?? []) {
      const uuid = obj.uuid ?? '';
      const raw = (obj.properties as Record<string, unknown>)?.transcription;
      if (typeof raw !== 'string' || !raw) {
        synopsisByStoryId[uuid] = [];
        continue;
      }
      try {
        const parsed = JSON.parse(raw) as { sections?: Array<{ synopsis?: string }> };
        const sections = parsed?.sections ?? [];
        synopsisByStoryId[uuid] = sections.map((s) => String(s?.synopsis ?? '').trim());
      } catch {
        synopsisByStoryId[uuid] = [];
      }
    }

    // Enrich chapters with synopsis by section_id (index)
    const enrichedChaptersByStoryId: Record<string, IndexChapter[]> = {};
    for (const [storyId, chapters] of Object.entries(chaptersByStoryId)) {
      const synopses = synopsisByStoryId[storyId] ?? [];
      enrichedChaptersByStoryId[storyId] = chapters.map((ch) => ({
        ...ch,
        synopsis: synopses[ch.section_id] ?? undefined,
      }));
    }

    return NextResponse.json({
      stories,
      chaptersByStoryId: enrichedChaptersByStoryId,
    } satisfies IndexesApiResponse);
  } catch (error) {
    console.error('Error fetching indexes:', error);
    return NextResponse.json({ error: 'Failed to fetch indexes' }, { status: 500 });
  }
}
