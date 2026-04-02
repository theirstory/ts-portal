import { NextResponse } from 'next/server';
import { retrieveChunksForSearch } from '@/lib/weaviate/chatRetrieval';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      query: string;
      searchType?: 'bm25' | 'vector' | 'hybrid';
    };
    const { query, searchType = 'hybrid' } = body;

    if (!query?.trim()) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    const citations = await retrieveChunksForSearch(query, searchType, 10);
    return NextResponse.json({ citations });
  } catch (error) {
    console.error('Chat search error:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
