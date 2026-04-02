import { SchemaTypes, Chunks } from '@/types/weaviate';
import { vectorSearchForStoryId, bm25SearchForStoryId } from '@/lib/weaviate/search';
import type { QueryProperty } from 'weaviate-client';

type ThematicMatch = {
  transcription: string;
  speaker: string;
  sectionTitle: string;
  startTime: number;
  endTime: number;
  score: number;
};

const TRANSCRIPT_SEARCH_RETURN_PROPERTIES: QueryProperty<Chunks>[] = [
  'transcription',
  'speaker',
  'section_title',
  'start_time',
  'end_time',
];

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      storyId: string;
      query: string;
      searchType?: 'vector' | 'bm25';
    };
    const { storyId, query, searchType = 'vector' } = body;

    if (!storyId || !query?.trim()) {
      return Response.json({ error: 'storyId and query are required' }, { status: 400 });
    }

    const searchFn = searchType === 'bm25' ? bm25SearchForStoryId : vectorSearchForStoryId;
    const response = await searchFn(
      SchemaTypes.Chunks,
      storyId,
      query,
      20,
      undefined,
      0.6,
      1.0,
      TRANSCRIPT_SEARCH_RETURN_PROPERTIES,
    );

    const matches: ThematicMatch[] = response.objects.map((obj) => {
      const props = obj.properties as Chunks;
      return {
        transcription: props.transcription || '',
        speaker: props.speaker || '',
        sectionTitle: props.section_title || '',
        startTime: props.start_time,
        endTime: props.end_time,
        score: obj.metadata?.score ?? 0,
      };
    });

    return Response.json({ matches });
  } catch (error) {
    console.error('Transcript search error:', error);
    return Response.json({ error: 'Search failed' }, { status: 500 });
  }
}
