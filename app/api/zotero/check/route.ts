import { getZoteroSession } from '@/lib/zotero/cookies';
import { findItemByUrl } from '@/lib/zotero/client';

export async function POST(request: Request) {
  try {
    const session = await getZoteroSession();
    if (!session) {
      return Response.json({ exists: false });
    }

    const { url } = (await request.json()) as { url: string };
    if (!url) {
      return Response.json({ exists: false });
    }

    const itemKey = await findItemByUrl(session.apiKey, session.userID, url);
    return Response.json({ exists: Boolean(itemKey), itemKey });
  } catch {
    return Response.json({ exists: false });
  }
}
