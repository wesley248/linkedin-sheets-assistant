// Google OAuth via chrome.identity.launchWebAuthFlow.
// We use the implicit (response_type=token) flow so we never need a server.
// The user's OAuth client must be type "Web application" with the redirect URI
// set to: https://<EXTENSION_ID>.chromiumapp.org/
//
// We cache the access token in chrome.storage.session until 60s before expiry.

const TOKEN_KEY = 'lsa.googleAccessToken';
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

export async function getRedirectUri() {
  // chrome.identity.getRedirectURL() returns https://<extId>.chromiumapp.org/
  return chrome.identity.getRedirectURL();
}

export async function getStoredClientId() {
  const { 'lsa.googleClientId': clientId } = await chrome.storage.sync.get('lsa.googleClientId');
  return clientId || null;
}

async function readCachedToken() {
  const store = await chrome.storage.session.get(TOKEN_KEY);
  const t = store[TOKEN_KEY];
  if (!t) return null;
  if (!t.expiresAt || Date.now() > t.expiresAt - 60_000) return null;
  return t.accessToken;
}

async function writeCachedToken(token, expiresInSec) {
  await chrome.storage.session.set({
    [TOKEN_KEY]: {
      accessToken: token,
      expiresAt: Date.now() + expiresInSec * 1000
    }
  });
}

export async function clearToken() {
  await chrome.storage.session.remove(TOKEN_KEY);
}

/**
 * Returns a valid Google access token, prompting the user via the OAuth
 * consent screen if necessary. `interactive` defaults to true.
 */
export async function getAccessToken({ interactive = true } = {}) {
  const cached = await readCachedToken();
  if (cached) return cached;

  const clientId = await getStoredClientId();
  if (!clientId) {
    const err = new Error('No Google OAuth client ID configured. Open the extension Options to set one.');
    err.code = 'NO_CLIENT_ID';
    throw err;
  }

  const redirectUri = await getRedirectUri();
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'token',
    redirect_uri: redirectUri,
    scope: SCOPES.join(' '),
    prompt: 'consent',
    include_granted_scopes: 'true'
  });
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  const responseUrl = await chrome.identity.launchWebAuthFlow({
    url: authUrl,
    interactive
  });
  if (!responseUrl) {
    throw new Error('OAuth flow cancelled or failed.');
  }
  // launchWebAuthFlow returns the redirect URL with #access_token=...&expires_in=...
  const hash = responseUrl.split('#')[1] || '';
  const out = new URLSearchParams(hash);
  const accessToken = out.get('access_token');
  const expiresIn = parseInt(out.get('expires_in') || '3600', 10);
  if (!accessToken) {
    throw new Error('OAuth response did not include an access_token.');
  }
  await writeCachedToken(accessToken, expiresIn);
  return accessToken;
}
