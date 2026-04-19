import { NextRequest } from 'next/server';
import { getAccessToken } from '@/lib/zotero/oauth';
import { getOAuthPending, clearOAuthPending, setZoteroSession } from '@/lib/zotero/cookies';

function popupClosePage(status: 'connected' | 'error') {
  // Returns an HTML page that notifies the parent window and closes itself
  const html = `<!DOCTYPE html>
<html><head><title>Zotero</title></head>
<body>
<p>${status === 'connected' ? 'Connected! This window will close...' : 'Authentication failed. You can close this window.'}</p>
<script>
  if (window.opener) {
    window.opener.postMessage({ type: 'zotero-auth', status: '${status}' }, '*');
    window.close();
  } else {
    window.location.href = '/?zotero=${status}';
  }
</script>
</body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html' } });
}

export async function GET(request: NextRequest) {
  try {
    const oauthToken = request.nextUrl.searchParams.get('oauth_token');
    const oauthVerifier = request.nextUrl.searchParams.get('oauth_verifier');

    if (!oauthToken || !oauthVerifier) {
      return popupClosePage('error');
    }

    const pending = await getOAuthPending();
    if (!pending) {
      return popupClosePage('error');
    }

    const { oauthToken: apiKey, userID, username } = await getAccessToken(
      oauthToken,
      pending.oauthTokenSecret,
      oauthVerifier,
    );

    await setZoteroSession({ apiKey, userID, username });
    await clearOAuthPending();

    return popupClosePage('connected');
  } catch (error) {
    console.error('Zotero callback error:', error);
    return popupClosePage('error');
  }
}
