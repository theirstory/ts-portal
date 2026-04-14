import { NextResponse } from 'next/server';
import { getAllStoriesFromCollection } from '@/lib/weaviate/search';
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
  'folder_id',
  'folder_name',
  'folder_path',
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
  folder_id: string;
  folder_name: string;
  folder_path: string;
};

export type IndexChapter = {
  section_id: number;
  section_title: string;
  start_time: number;
  end_time: number;
  synopsis?: string;
  keywords?: string[];
};

export type IndexesApiResponse = {
  stories: IndexesStory[];
  chaptersByStoryId: Record<string, IndexChapter[]>;
};

export async function GET() {
  try {
    const storiesResponse = await getAllStoriesFromCollection(
      SchemaTypes.Testimonies,
      [...STORIES_RETURN_PROPERTIES],
      INDEXES_STORIES_LIMIT,
      0,
    );

    const stories: IndexesStory[] = (storiesResponse?.objects ?? []).map((obj: any) => {
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
        folder_id: String(p?.folder_id ?? ''),
        folder_name: String(p?.folder_name ?? ''),
        folder_path: String(p?.folder_path ?? ''),
      };
    });

    // Build chapter summaries from the structured testimony transcript sections.
    function parseKeywords(value: unknown): string[] {
      if (Array.isArray(value)) {
        return value
          .map((keyword) => String(keyword ?? '').replace(/\*\*/g, '').trim())
          .filter(Boolean);
      }
      if (typeof value !== 'string' || !value.trim()) return [];
      const raw = value.replace(/\*\*/g, '').trim();
      return raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }

    const chaptersByStoryId: Record<string, IndexChapter[]> = {};
    for (const obj of storiesResponse?.objects ?? []) {
      const uuid = obj.uuid ?? '';
      const raw = (obj.properties as Record<string, unknown>)?.transcription;
      if (typeof raw !== 'string' || !raw) {
        chaptersByStoryId[uuid] = [];
        continue;
      }
      try {
        const parsed = JSON.parse(raw) as {
          sections?: Array<{
            title?: string;
            start?: number;
            end?: number;
            synopsis?: string;
            keywords?: string | string[];
          }>;
        };
        const sections = parsed?.sections ?? [];
        chaptersByStoryId[uuid] = sections.map((section, section_id) => {
          const keywords = parseKeywords(section?.keywords);
          return {
            section_id,
            section_title: String(section?.title ?? '').trim() || 'Untitled section',
            start_time: Number(section?.start ?? 0),
            end_time: Number(section?.end ?? 0),
            synopsis: String(section?.synopsis ?? '').trim() || undefined,
            keywords: keywords.length ? keywords : undefined,
          };
        });
      } catch {
        chaptersByStoryId[uuid] = [];
      }
    }

    return NextResponse.json({
      stories,
      chaptersByStoryId,
    } satisfies IndexesApiResponse);
  } catch (error) {
    console.error('Error fetching indexes:', error);
    return NextResponse.json({ error: 'Failed to fetch indexes' }, { status: 500 });
  }
}
