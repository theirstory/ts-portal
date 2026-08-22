import { NextResponse } from 'next/server';
import { browseSources, type SourceType } from '@/lib/weaviate/multimodalSearch';

const VALID_SOURCE_TYPES: SourceType[] = ['recording', 'document', 'image'];

/** Lists material without a query, so /search opens showing the collection. */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      sourceTypes?: string[];
      limit?: number;
    };

    const sourceTypes = (body.sourceTypes ?? []).filter((type): type is SourceType =>
      VALID_SOURCE_TYPES.includes(type as SourceType),
    );

    const { results, perTypeCounts } = await browseSources({
      limit: Math.min(Math.max(body.limit ?? 60, 1), 200),
      sourceTypes: sourceTypes.length ? sourceTypes : undefined,
    });

    return NextResponse.json({ results, perTypeCounts });
  } catch (error) {
    console.error('Browse error:', error);
    const message = error instanceof Error ? error.message : 'Browse failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
