import { NextResponse } from 'next/server';
import { multimodalSearch, type SearchMode, type SourceType } from '@/lib/weaviate/multimodalSearch';

const VALID_SOURCE_TYPES: SourceType[] = ['recording', 'document', 'image'];
const VALID_MODES: SearchMode[] = ['semantic', 'keyword'];

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      query?: string;
      sourceTypes?: string[];
      limit?: number;
      collectionFilters?: string[];
      folderFilters?: string[];
      weights?: Record<string, number>;
      mode?: string;
    };

    const query = (body.query ?? '').trim();
    if (!query) {
      return NextResponse.json({ error: 'query is required' }, { status: 400 });
    }

    const sourceTypes = (body.sourceTypes ?? []).filter((type): type is SourceType =>
      VALID_SOURCE_TYPES.includes(type as SourceType),
    );

    const mode = VALID_MODES.includes(body.mode as SearchMode) ? (body.mode as SearchMode) : 'semantic';

    const { results, perTypeCounts } = await multimodalSearch(query, {
      mode,
      limit: Math.min(Math.max(body.limit ?? 30, 1), 100),
      sourceTypes: sourceTypes.length ? sourceTypes : undefined,
      collectionFilters: body.collectionFilters,
      folderFilters: body.folderFilters,
      weights: body.weights as Partial<Record<SourceType, number>> | undefined,
    });

    return NextResponse.json({ results, perTypeCounts, query, mode });
  } catch (error) {
    console.error('Multimodal search error:', error);
    const message = error instanceof Error ? error.message : 'Search failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
