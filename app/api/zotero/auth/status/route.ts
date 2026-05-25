import { getZoteroSession } from '@/lib/zotero/cookies';

export async function GET() {
  try {
    const session = await getZoteroSession();

    if (!session) {
      return Response.json({ authenticated: false });
    }

    return Response.json({
      authenticated: true,
      userID: session.userID,
      username: session.username,
    });
  } catch {
    return Response.json({ authenticated: false });
  }
}
