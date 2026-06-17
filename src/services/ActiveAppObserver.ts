import { logger } from '../lib/logger'

// Sprint 3 — the observation loop's first sense. Polls the frontmost app (via the Rust
// `active_window` command), tracks focus sessions, and surfaces them. It deliberately does NOT
// write to the permanent World Model — per P6/K6 (WM writes only via an approved diff), captured
// observations stay proposals until the approval surface (PLANNED) gates them in.

export interface FocusSession { app: string; title: string; startedAt: number; endedAt?: number }
export interface ObserverState {
  observing:        boolean
  current:          { app: string; title: string } | null
  sessions:         FocusSession[]            // recent, newest first
  appTotalsMs:      Record<string, number>
  observationCount: number
  permissionOk:     boolean
}

const POLL_MS = 5_000
const SELF    = ['piku']   // ignore Piku's own window — it observes the *other* app you're in

type Listener = (s: ObserverState) => void

class ActiveAppObserver {
  private timer: ReturnType<typeof setInterval> | null = null
  private listeners = new Set<Listener>()
  private lastApp: string | null = null
  private lastPollAt = 0
  private state: ObserverState = {
    observing: false, current: null, sessions: [], appTotalsMs: {}, observationCount: 0, permissionOk: true,
  }

  get isTauri(): boolean {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    fn(this.snapshot())
    return () => { this.listeners.delete(fn) }
  }

  private snapshot(): ObserverState {
    return { ...this.state, sessions: [...this.state.sessions], appTotalsMs: { ...this.state.appTotalsMs } }
  }
  private emit() { const s = this.snapshot(); this.listeners.forEach(l => l(s)) }

  start(): void {
    if (this.timer || !this.isTauri) return
    this.state.observing = true
    void this.poll()
    this.timer = setInterval(() => void this.poll(), POLL_MS)
    logger.info?.('active-app observer started', {})
    this.emit()
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null }
    this.state.observing = false
    this.emit()
  }

  private async poll(): Promise<void> {
    const now = Date.now()
    let raw = ''
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      raw = await invoke<string>('active_window')
      this.state.permissionOk = true
    } catch (err) {
      this.state.permissionOk = false
      logger.error('active-app poll failed', { error: String(err) })
      this.emit()
      return
    }

    // Accumulate time spent on the previously-seen (non-self) app.
    if (this.lastApp && this.lastPollAt) {
      this.state.appTotalsMs[this.lastApp] = (this.state.appTotalsMs[this.lastApp] || 0) + (now - this.lastPollAt)
    }
    this.lastPollAt = now

    const [app = '', title = ''] = (raw || '').split('||')
    const isSelf = !app || SELF.some(s => app.toLowerCase().includes(s))
    if (isSelf) { this.lastApp = null; return }   // Piku focused / nothing → don't record

    const changed = !this.state.current || this.state.current.app !== app || this.state.current.title !== title
    if (changed) {
      const prev = this.state.sessions[0]
      if (prev && !prev.endedAt) prev.endedAt = now
      this.state.sessions = [{ app, title, startedAt: now }, ...this.state.sessions].slice(0, 25)
      this.state.observationCount += 1
    }
    this.state.current = { app, title }
    this.lastApp = app
    this.emit()
  }
}

export const activeAppObserver = new ActiveAppObserver()
