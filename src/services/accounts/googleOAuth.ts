// Google OAuth (installed-app / loopback flow) for Gmail. The Rust `oauth_listen` command catches
// the redirect on 127.0.0.1; token exchange + userinfo go through Rust curl (`http_post_form` /
// `http_get`) because Google's endpoints don't send CORS headers, so a webview fetch() is blocked.
// Client id/secret come from .env.local (gitignored). Google deprecated the OOB copy/paste flow.

const PORT = 8731
const REDIRECT = `http://127.0.0.1:${PORT}`
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
]

async function invokeTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

export function googleConfigured(): boolean {
  return !!import.meta.env.VITE_GOOGLE_CLIENT_ID && !!import.meta.env.VITE_GOOGLE_CLIENT_SECRET
}

export interface GoogleTokens { accessToken: string; refreshToken?: string; expiresAt: number; email?: string }

// Run the full consent → code → token exchange. Opens the browser, waits for the loopback redirect.
export async function connectGoogle(): Promise<GoogleTokens> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  const clientSecret = import.meta.env.VITE_GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('Set VITE_GOOGLE_CLIENT_ID and VITE_GOOGLE_CLIENT_SECRET in .env.local')

  const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
  }).toString()

  // Start the loopback listener, then open the consent page in the default browser.
  const codePromise = invokeTauri<string>('oauth_listen', { port: PORT, timeoutSecs: 300 })
  await invokeTauri('open_path', { target: authUrl })
  const code = await codePromise

  // Exchange the code via Rust curl (Google's token endpoint has no CORS for webview fetch).
  const body = new URLSearchParams({
    code, client_id: clientId, client_secret: clientSecret, redirect_uri: REDIRECT, grant_type: 'authorization_code',
  }).toString()
  const raw = await invokeTauri<string>('http_post_form', { url: 'https://oauth2.googleapis.com/token', body })
  let t: { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string }
  try { t = JSON.parse(raw) } catch { throw new Error(`token exchange — unexpected response: ${raw.slice(0, 180)}`) }
  if (t.error || !t.access_token) throw new Error(`token exchange failed: ${t.error ?? ''} ${t.error_description ?? raw.slice(0, 180)}`)

  let email: string | undefined
  try {
    const meRaw = await invokeTauri<string>('http_get', { url: 'https://www.googleapis.com/oauth2/v2/userinfo', authorization: `Bearer ${t.access_token}` })
    email = (JSON.parse(meRaw) as { email?: string }).email
  } catch { /* non-fatal */ }

  return { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000, email }
}

// Mint a fresh access token from a stored refresh token (via Rust curl).
export async function refreshGoogle(refreshToken: string): Promise<{ accessToken: string; expiresAt: number } | null> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  const clientSecret = import.meta.env.VITE_GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  const body = new URLSearchParams({ refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token' }).toString()
  try {
    const raw = await invokeTauri<string>('http_post_form', { url: 'https://oauth2.googleapis.com/token', body })
    const t = JSON.parse(raw) as { access_token?: string; expires_in?: number }
    if (!t.access_token) return null
    return { accessToken: t.access_token, expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000 }
  } catch { return null }
}
