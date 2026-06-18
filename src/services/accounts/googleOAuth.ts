// Google OAuth (installed-app / loopback flow) for Gmail. The Rust `oauth_listen` command catches
// the redirect on 127.0.0.1; we exchange the code for tokens here. Client id/secret come from
// .env.local (gitignored). Google deprecated the copy/paste OOB flow, so loopback is the way.

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

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: clientId, client_secret: clientSecret, redirect_uri: REDIRECT, grant_type: 'authorization_code',
    }).toString(),
  })
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${await res.text()}`)
  const t = await res.json() as { access_token: string; refresh_token?: string; expires_in: number }

  // who did they connect as?
  let email: string | undefined
  try {
    const me = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${t.access_token}` } })
    if (me.ok) email = (await me.json() as { email?: string }).email
  } catch { /* non-fatal */ }

  return { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: Date.now() + t.expires_in * 1000, email }
}

// Mint a fresh access token from a stored refresh token.
export async function refreshGoogle(refreshToken: string): Promise<{ accessToken: string; expiresAt: number } | null> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  const clientSecret = import.meta.env.VITE_GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token' }).toString(),
  })
  if (!res.ok) return null
  const t = await res.json() as { access_token: string; expires_in: number }
  return { accessToken: t.access_token, expiresAt: Date.now() + t.expires_in * 1000 }
}
