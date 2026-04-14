import { getZoteroSession } from '@/lib/zotero/cookies';
import { createInterviewItem } from '@/lib/zotero/client';
import type { InterviewSaveData } from '@/lib/zotero/types';

export async function POST(request: Request) {
  try {
    const session = await getZoteroSession();
    if (!session) {
      return Response.json({ error: 'Not authenticated with Zotero' }, { status: 401 });
    }

    const data = (await request.json()) as InterviewSaveData;

    if (!data.title) {
      return Response.json({ error: 'Interview title is required' }, { status: 400 });
    }

    const result = await createInterviewItem(session.apiKey, session.userID, data);
    return Response.json(result);
  } catch (error) {
    console.error('Zotero create item error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to save to Zotero' },
      { status: 500 },
    );
  }
}
