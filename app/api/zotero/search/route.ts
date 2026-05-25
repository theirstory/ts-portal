import { getZoteroSession } from '@/lib/zotero/cookies';
import { searchUserLibrary } from '@/lib/zotero/client';

export async function POST(request: Request) {
  try {
    const session = await getZoteroSession();
    if (!session) {
      return Response.json({ error: 'Not authenticated with Zotero' }, { status: 401 });
    }

    const { query, limit } = (await request.json()) as { query: string; limit?: number };

    if (!query?.trim()) {
      return Response.json({ error: 'Query is required' }, { status: 400 });
    }

    const items = await searchUserLibrary(session.apiKey, session.userID, query, limit ?? 10);
    return Response.json({ items });
  } catch (error) {
    console.error('Zotero search error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to search Zotero library' },
      { status: 500 },
    );
  }
}
