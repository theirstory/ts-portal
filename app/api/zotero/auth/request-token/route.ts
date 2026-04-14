import { NextRequest } from 'next/server';
import { getRequestToken, buildAuthorizeUrl } from '@/lib/zotero/oauth';
import { setOAuthPending } from '@/lib/zotero/cookies';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { returnTo?: string };
    const returnTo = body.returnTo || '/';

    // Build callback URL from the request's origin
    const origin = request.headers.get('origin') || request.nextUrl.origin;
    const callbackUrl = `${origin}/api/zotero/auth/callback`;

    // Step 1: Get request token from Zotero
    const { oauthToken, oauthTokenSecret } = await getRequestToken(callbackUrl);

    // Store the token secret and returnTo in an encrypted pending cookie
    await setOAuthPending({ oauthTokenSecret, returnTo });

    // Step 2: Build the authorization URL
    const authorizationUrl = buildAuthorizeUrl(oauthToken);

    return Response.json({ authorizationUrl });
  } catch (error) {
    console.error('Zotero request-token error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to start Zotero authentication' },
      { status: 500 },
    );
  }
}
