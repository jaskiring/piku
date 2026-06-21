import type { ServiceAccount } from '../types'
import { accountService } from '../AccountService'
import { refreshGoogle } from '../googleOAuth'

// Google Calendar via the Calendar REST API. Mirrors GmailConnector: the account's `token` is the
// OAuth access token (shared with Gmail via one consent — see googleOAuth.ts SCOPES); when it's
// expired we mint a new one from `refreshToken` and persist it. Read-only for now.

export interface CalendarEvent {
  id: string
  title: string
  start: string      // ISO or date string as returned by the API
  end: string
  location?: string
  attendees?: string[]
  meetLink?: string
  status?: 'confirmed' | 'tentative' | 'cancelled'
}

async function freshToken(account: ServiceAccount): Promise<string | null> {
  if (account.token && account.tokenExpiresAt && account.tokenExpiresAt > Date.now() + 60_000) return account.token
  if (!account.refreshToken) return account.token || null
  const r = await refreshGoogle(account.refreshToken)
  if (!r) return account.token || null
  await accountService.save({ ...account, token: r.accessToken, tokenExpiresAt: r.expiresAt, lastUsedAt: Date.now() })
  return r.accessToken
}

// Calendar API GETs go through Rust curl (no CORS), same as Gmail.
async function api<T>(token: string, path: string): Promise<T | null> {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const raw = await invoke<string>('http_get', { url: `https://www.googleapis.com/calendar/v3${path}`, authorization: `Bearer ${token}` })
    const data = JSON.parse(raw)
    return data?.error ? null : data as T
  } catch { return null }
}

function toISO(s: { dateTime?: string; date?: string } | undefined): string {
  return s?.dateTime ?? s?.date ?? ''
}

export class CalendarConnector {
  readonly service = 'calendar' as const
  readonly label = 'Google Calendar'

  async test(account: ServiceAccount): Promise<boolean> {
    const token = await freshToken(account)
    if (!token) return false
    return (await api<{ id: string }>(token, '/users/me/calendarList/primary')) !== null
  }

  // Upcoming events from the primary calendar, between timeMin and timeMax (ISO strings).
  async list(account: ServiceAccount, timeMinISO: string, timeMaxISO: string, max = 20): Promise<CalendarEvent[]> {
    const token = await freshToken(account)
    if (!token) return []
    const q = new URLSearchParams({
      timeMin: timeMinISO,
      timeMax: timeMaxISO,
      maxResults: String(max),
      singleEvents: 'true',
      orderBy: 'startTime',
    }).toString()
    const data = await api<{ items?: any[] }>(token, `/calendars/primary/events?${q}`)
    if (!data?.items) return []
    return data.items.map(it => ({
      id:        it.id,
      title:     it.summary ?? '(no title)',
      start:     toISO(it.start),
      end:       toISO(it.end),
      location:  it.location,
      attendees: (it.attendees ?? []).map((a: any) => a.email).filter(Boolean),
      meetLink:  (it.conferenceData?.entryPoints ?? []).find((e: any) => e.entryPointType === 'video')?.uri,
      status:    it.status,
    }))
  }

  // Convenience: the next N upcoming events from now.
  async upcoming(account: ServiceAccount, max = 10): Promise<CalendarEvent[]> {
    const now = new Date()
    const horizon = new Date(now.getTime() + 14 * 864e5)   // 14-day lookahead by default
    return this.list(account, now.toISOString(), horizon.toISOString(), max)
  }

  async fetch(account: ServiceAccount): Promise<CalendarEvent[]> {
    return this.upcoming(account)
  }
}

export const calendarConnector = new CalendarConnector()
