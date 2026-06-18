import type { ServiceAccount } from '../types'
import { accountService } from '../AccountService'
import { refreshGoogle } from '../googleOAuth'

// Gmail via the Gmail REST API. The account's `token` is the OAuth access token; when it's expired
// we mint a new one from `refreshToken` and persist it. Read + search + summarize for now.

export interface MailSummary { id: string; from: string; subject: string; snippet: string; date: string; unread: boolean }

async function freshToken(account: ServiceAccount): Promise<string | null> {
  if (account.token && account.tokenExpiresAt && account.tokenExpiresAt > Date.now() + 60_000) return account.token
  if (!account.refreshToken) return account.token || null
  const r = await refreshGoogle(account.refreshToken)
  if (!r) return account.token || null
  await accountService.save({ ...account, token: r.accessToken, tokenExpiresAt: r.expiresAt, lastUsedAt: Date.now() })
  return r.accessToken
}

// Gmail API GETs go through Rust curl (no CORS), same as the OAuth exchange.
async function api<T>(token: string, path: string): Promise<T | null> {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const raw = await invoke<string>('http_get', { url: `https://gmail.googleapis.com/gmail/v1/users/me${path}`, authorization: `Bearer ${token}` })
    const data = JSON.parse(raw)
    return data?.error ? null : data as T
  } catch { return null }
}

const header = (headers: { name: string; value: string }[] | undefined, name: string) =>
  headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''

export class GmailConnector {
  readonly service = 'email' as const
  readonly label = 'Gmail'

  async test(account: ServiceAccount): Promise<boolean> {
    const token = await freshToken(account)
    if (!token) return false
    return (await api<{ emailAddress: string }>(token, '/profile')) !== null
  }

  // Search messages with a Gmail query (e.g. "is:unread newer_than:1d", "from:boss is:important").
  async search(account: ServiceAccount, query: string, max = 12): Promise<MailSummary[]> {
    const token = await freshToken(account)
    if (!token) return []
    const list = await api<{ messages?: { id: string }[] }>(token, `/messages?maxResults=${max}&q=${encodeURIComponent(query)}`)
    const ids = (list?.messages ?? []).map(m => m.id)
    const out: MailSummary[] = []
    for (const id of ids) {
      const msg = await api<{ snippet: string; labelIds?: string[]; payload?: { headers?: { name: string; value: string }[] } }>(
        token, `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      )
      if (!msg) continue
      const h = msg.payload?.headers
      out.push({
        id,
        from:    header(h, 'From'),
        subject: header(h, 'Subject') || '(no subject)',
        snippet: msg.snippet ?? '',
        date:    header(h, 'Date'),
        unread:  (msg.labelIds ?? []).includes('UNREAD'),
      })
    }
    return out
  }

  async fetch(account: ServiceAccount, query?: string): Promise<MailSummary[]> {
    return this.search(account, query ?? 'is:unread newer_than:1d')
  }
}

export const gmailConnector = new GmailConnector()
