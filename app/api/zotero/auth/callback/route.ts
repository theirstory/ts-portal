import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/zotero/oauth';
import { getOAuthPending, clearOAuthPending, setZoteroSession } from '@/lib/zotero/cookies';

export async function GET(request: NextRequest) {
  try {
    const oauthToken = request.nextUrl.searchParams.get('oauth_token');
    const oauthVerifier = request.nextUrl.searchParams.get('oauth_verifier');

    if (!oauthToken || !oauthVerifier) {
      return Response.json({ error: 'Missing oauth_token or oauth_verifier' }, { status: 400 });
    }

    // Retrieve the pending OAuth session from the encrypted cookie
    const pending = await getOAuthPending();
    if (!pending) {
      return Response.json({ error: 'OAuth session expired. Please try connecting again.' }, { status: 400 });
    }

    // Exchange for access token
    const { oauthToken: apiKey, userID, username } = await getAccessToken(
      oauthToken,
      pending.oauthTokenSecret,
      oauthVerifier,
    );

    // Store the Zotero session in an encrypted cookie
    await setZoteroSession({ apiKey, userID, username });

    // Clean up the pending cookie
    await clearOAuthPending();

    // Redirect back to the page the user was on
    const returnTo = pending.returnTo || '/';
    const separator = returnTo.includes('?') ? '&' : '?';
    const redirectUrl = `${request.nextUrl.origin}${returnTo}${separator}zotero=connected`;

    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error('Zotero callback error:', error);
    // Redirect to home with error indicator
    return NextResponse.redirect(`${request.nextUrl.origin}/?zotero=error`);
  }
}
