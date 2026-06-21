import { useEffect, useState } from 'react'
import { accountService } from './AccountService'
import { gitHubConnector } from './connectors/GitHubConnector'
import { gmailConnector, type MailSummary } from './connectors/GmailConnector'
import { calendarConnector, type CalendarEvent } from './connectors/CalendarConnector'
import { logger } from '../../lib/logger'

// ─────────────────────────────────────────────────────────────────────────────
// ConnectorFeed — the shared in-memory cache for connector data.
//
// Before this existed, every screen (Home, GmailWidget, Canvas, Settings) re-fetched
// the same Gmail/GitHub data independently via its own useEffect — so opening three
// surfaces that show "unread email" fired three separate API calls.
//
// This singleton holds one snapshot per source, dedupes concurrent fetches, refreshes
// on a stale-check interval, and notifies subscribers. Screens read via the hooks
// below (useInbox, useCommits, useConnectorFeed) instead of calling connectors directly.
//
// Pattern mirrors agentHub / graphService: one module-level instance, pub/sub emit().
// ─────────────────────────────────────────────────────────────────────────────

export interface InboxSnapshot {
  messages: MailSummary[]
  fetchedAt: number
}
export interface CommitsSnapshot {
  total: number
  byRepo: Record<string, number>
  fetchedAt: number
}
export interface EventsSnapshot {
  events: CalendarEvent[]
  fetchedAt: number
}
export interface FeedState {
  inbox: InboxSnapshot | null
  commits: CommitsSnapshot | null
  events: EventsSnapshot | null
  loading: boolean
  error: string | null
  lastRefreshAt: number | null
}

const FRESH_MS = 60_000   // snapshots are reused for 60s before a refetch is allowed

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)   // YYYY-MM-DD, local-day is close enough
}

class ConnectorFeed {
  private state: FeedState = { inbox: null, commits: null, events: null, loading: false, error: null, lastRefreshAt: null }
  private listeners = new Set<() => void>()
  private inflight: Promise<void> | null = null
  private timer: ReturnType<typeof setInterval> | null = null

  getState(): FeedState { return this.state }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  private emit() { for (const l of this.listeners) l() }

  private set(patch: Partial<FeedState>) {
    this.state = { ...this.state, ...patch }
    this.emit()
  }

  /** Refresh all sources. Deduped: concurrent callers share one fetch. */
  async refresh(force = false): Promise<void> {
    // Reuse a fresh snapshot if we have one and aren't forcing.
    if (!force && this.state.lastRefreshAt && Date.now() - this.state.lastRefreshAt < FRESH_MS) return
    if (this.inflight) return this.inflight

    this.inflight = this.doRefresh()
    try { await this.inflight } finally { this.inflight = null }
  }

  private async doRefresh(): Promise<void> {
    this.set({ loading: true, error: null })
    try {
      const [inbox, commits, events] = await Promise.allSettled([this.fetchInbox(), this.fetchCommits(), this.fetchEvents()])
      const patch: Partial<FeedState> = { loading: false, lastRefreshAt: Date.now() }
      if (inbox.status === 'fulfilled')   patch.inbox   = inbox.value
      if (commits.status === 'fulfilled') patch.commits = commits.value
      if (events.status === 'fulfilled')  patch.events  = events.value
      const errs = [inbox, commits, events].filter(r => r.status === 'rejected')
      if (errs.length) patch.error = errs.map(e => (e as PromiseRejectedResult).reason).join('; ')
      this.set(patch)
    } catch (e) {
      this.set({ loading: false, error: String(e) })
    }
  }

  private async fetchInbox(): Promise<InboxSnapshot | null> {
    const accounts = (await accountService.getByService('email')).filter(a => a.enabled && a.token)
    if (!accounts.length) return null
    // Pull unread + recent from every connected inbox, merge, newest-first.
    const all: MailSummary[] = []
    for (const acct of accounts) {
      try {
        const msgs = await gmailConnector.search(acct, 'in:inbox newer_than:14d', 25)
        all.push(...msgs)
      } catch (e) { logger.error('feed: inbox fetch failed', { acct: acct.label, error: String(e) }) }
    }
    all.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    return { messages: all.slice(0, 40), fetchedAt: Date.now() }
  }

  private async fetchCommits(): Promise<CommitsSnapshot | null> {
    const accounts = (await accountService.getByService('github')).filter(a => a.enabled && a.token)
    if (!accounts.length) return null
    const since = todayISO()
    let total = 0
    const byRepo: Record<string, number> = {}
    for (const acct of accounts) {
      try {
        const r = await gitHubConnector.commitsSince(acct, since)
        if (r) { total += r.total; for (const [repo, n] of Object.entries(r.byRepo)) byRepo[repo] = (byRepo[repo] ?? 0) + n }
      } catch (e) { logger.error('feed: commits fetch failed', { acct: acct.label, error: String(e) }) }
    }
    return { total, byRepo, fetchedAt: Date.now() }
  }

  // Calendar events from connected Google accounts. Reuses the same Gmail OAuth token (one consent
  // grants both scopes). Reads the 'calendar' service — accounts created with calendar.readonly.
  private async fetchEvents(): Promise<EventsSnapshot | null> {
    const accounts = (await accountService.getByService('calendar')).filter(a => a.enabled && a.token)
    if (!accounts.length) return null
    const all: CalendarEvent[] = []
    for (const acct of accounts) {
      try {
        const evs = await calendarConnector.upcoming(acct, 15)
        all.push(...evs)
      } catch (e) { logger.error('feed: calendar fetch failed', { acct: acct.label, error: String(e) }) }
    }
    all.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
    return { events: all.slice(0, 25), fetchedAt: Date.now() }
  }

  /** Start a background refresh loop. Call once on app boot. */
  startAutoRefresh(intervalMs = 5 * 60_000) {
    if (this.timer) return
    this.timer = setInterval(() => { void this.refresh() }, intervalMs)
  }

  stopAutoRefresh() {
    if (this.timer) { clearInterval(this.timer); this.timer = null }
  }
}

export const connectorFeed = new ConnectorFeed()

// ── React hooks: typed selectors that subscribe to the store ─────────────────

function useFeedState(): FeedState {
  const [s, setS] = useState<FeedState>(connectorFeed.getState())
  useEffect(() => connectorFeed.subscribe(() => setS(connectorFeed.getState())), [])
  return s
}

/** The unified inbox across all connected Gmail accounts. Auto-refreshes on mount. */
export function useInbox(): { inbox: InboxSnapshot | null; loading: boolean } {
  const s = useFeedState()
  useEffect(() => { void connectorFeed.refresh() }, [])
  return { inbox: s.inbox, loading: s.loading }
}

/** Today's commits across all connected GitHub accounts. Auto-refreshes on mount. */
export function useCommits(): { commits: CommitsSnapshot | null; loading: boolean } {
  const s = useFeedState()
  useEffect(() => { void connectorFeed.refresh() }, [])
  return { commits: s.commits, loading: s.loading }
}

/** Upcoming calendar events across all connected Google accounts. Auto-refreshes on mount. */
export function useUpcomingEvents(): { events: EventsSnapshot | null; loading: boolean } {
  const s = useFeedState()
  useEffect(() => { void connectorFeed.refresh() }, [])
  return { events: s.events, loading: s.loading }
}

/** Full feed state — for surfaces (Home) that show everything. Auto-refreshes on mount. */
export function useConnectorFeed(): FeedState {
  const s = useFeedState()
  useEffect(() => { void connectorFeed.refresh() }, [])
  return s
}
