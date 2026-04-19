import { getZoteroSession } from '@/lib/zotero/cookies';
import { createChildNote } from '@/lib/zotero/client';
import type { NoteSaveData } from '@/lib/zotero/types';

export async function POST(request: Request) {
  try {
    const session = await getZoteroSession();
    if (!session) {
      return Response.json({ error: 'Not authenticated with Zotero' }, { status: 401 });
    }

    const data = (await request.json()) as NoteSaveData;

    if (!data.parentItemKey) {
      return Response.json({ error: 'Parent item key is required' }, { status: 400 });
    }

    if (!data.selectedText) {
      return Response.json({ error: 'Selected text is required' }, { status: 400 });
    }

    const result = await createChildNote(session.apiKey, session.userID, data);
    return Response.json(result);
  } catch (error) {
    console.error('Zotero create note error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to save note to Zotero' },
      { status: 500 },
    );
  }
}
