import type { TraceStep } from '../../../services/ToolRouter'
import { AgentContextStore } from '../../memory'
import type { AgentContext, AgentTurn } from '../../memory'

// The Agent control hub. The Agent is no longer one session — it's a set of CONTEXTS, each a
// named chat with its own conversation scope, optionally linked to a Project and feeding the
// World-Model graph. The hub holds the contexts in memory (so the UI reads them synchronously),
// persists every mutation to IndexedDB (DB v7), and is reactive via subscribe(). A synchronous
// starter context is created in the constructor so the UI is never empty; init() then swaps in
// persisted history once IndexedDB resolves (and migrates the old single localStorage session).

export type { AgentTurn }

const LEGACY_KEY = 'piku.agent.turns'
const store = new AgentContextStore()

type Listener = () => void

function deriveTitle(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ')
  if (!t) return 'New context'
  return t.length > 46 ? `${t.slice(0, 46).trimEnd()}…` : t
}

function blank(): AgentContext {
  const now = Date.now()
  return { id: crypto.randomUUID(), title: 'New context', turns: [], createdAt: now, updatedAt: now }
}

class AgentHub {
  contexts: AgentContext[]
  activeId: string | null
  trace: TraceStep[] = []         // ephemeral — the active run's reasoning/actions
  ready = false
  private starterId: string
  private listeners = new Set<Listener>()

  constructor() {
    const starter = blank()       // synchronous: the UI always has a live context immediately
    this.starterId = starter.id
    this.contexts  = [starter]
    this.activeId  = starter.id
    void this.init()
  }

  subscribe(fn: Listener): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }
  private emit() { this.listeners.forEach(l => l()) }

  private async init() {
    try {
      let loaded = await store.getAll()
      if (loaded.length === 0) {
        const migrated = this.migrateLegacy()
        if (migrated) { await store.save(migrated); loaded = [migrated] }
      }
      const starter     = this.contexts.find(c => c.id === this.starterId)
      const starterUsed = !!starter && starter.turns.length > 0   // user typed before IDB resolved
      if (loaded.length > 0) {
        this.contexts = starterUsed ? [starter!, ...loaded] : loaded
        this.activeId = starterUsed ? starter!.id : (this.contexts[0]?.id ?? null)
        if (starterUsed) void store.save(starter!).catch(() => {})
      } else if (starter) {
        void store.save(starter).catch(() => {})   // nothing persisted — keep + persist the starter
      }
    } catch {
      /* IndexedDB unavailable — keep the in-memory starter so the Agent still works */
    }
    this.ready = true
    this.emit()
  }

  private migrateLegacy(): AgentContext | null {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LEGACY_KEY) : null
      if (!raw) return null
      const turns = JSON.parse(raw) as AgentTurn[]
      if (!Array.isArray(turns) || turns.length === 0) return null
      const firstYou = turns.find(t => t.role === 'you')
      const now = Date.now()
      try { localStorage.removeItem(LEGACY_KEY) } catch { /* ignore */ }
      return { id: crypto.randomUUID(), title: firstYou ? deriveTitle(firstYou.text) : 'Imported session', turns, createdAt: now, updatedAt: now }
    } catch { return null }
  }

  active(): AgentContext | null { return this.contexts.find(c => c.id === this.activeId) ?? null }

  // Replace a context immutably, keep the list sorted most-recent-first, persist + notify.
  private commit(ctx: AgentContext, persist = true) {
    this.contexts = [ctx, ...this.contexts.filter(c => c.id !== ctx.id)].sort((a, b) => b.updatedAt - a.updatedAt)
    if (persist) void store.save(ctx).catch(() => {})
    this.emit()
  }

  createContext(): AgentContext {
    const ctx = blank()
    this.contexts = [ctx, ...this.contexts]
    this.activeId = ctx.id
    this.trace = []
    void store.save(ctx).catch(() => {})
    this.emit()
    return ctx
  }

  switchTo(id: string) {
    if (id === this.activeId) return
    this.activeId = id
    this.trace = []
    this.emit()
  }

  rename(id: string, title: string) {
    const ctx = this.contexts.find(c => c.id === id); if (!ctx) return
    this.commit({ ...ctx, title: title.trim() || 'Untitled' })   // keep updatedAt → no reorder on rename
  }

  remove(id: string) {
    this.contexts = this.contexts.filter(c => c.id !== id)
    void store.delete(id).catch(() => {})
    if (this.activeId === id) {
      this.activeId = this.contexts[0]?.id ?? null
      this.trace = []
      if (!this.activeId) this.createContext(); else this.emit()
    } else this.emit()
  }

  addTurn(turn: AgentTurn) {
    const ctx = this.active(); if (!ctx) return
    const title = ctx.title === 'New context' && turn.role === 'you' ? deriveTitle(turn.text) : ctx.title
    this.commit({ ...ctx, turns: [...ctx.turns, turn], title, updatedAt: Date.now() })
  }

  setTrace(tr: TraceStep[]) { this.trace = tr; this.emit() }

  linkProject(projectId: string | undefined) {
    const ctx = this.active(); if (!ctx) return
    this.commit({ ...ctx, projectId })   // keep updatedAt → no reorder on link
  }
}

export const agentHub = new AgentHub()
