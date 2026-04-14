import { clearZoteroSession } from '@/lib/zotero/cookies';

export async function POST() {
  try {
    await clearZoteroSession();
    return Response.json({ success: true });
  } catch (error) {
    console.error('Zotero logout error:', error);
    return Response.json({ error: 'Failed to disconnect' }, { status: 500 });
  }
}
