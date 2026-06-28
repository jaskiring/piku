import { useSyncExternalStore } from 'react'

// ── Piku settings — the single source of truth for everything the user can change from the UI:
// identity (name, work/personal email + GitHub), models, privacy, and the work-tool links.
// Persisted to localStorage so it survives restarts. Defaults fall back to the VITE_PIKU_* env
// vars (then to placeholders) so existing .env.local setups keep working. Reactive: React code
// uses useSettings(); non-React callers (services) read pikuSettings.get() at call time so they
// always pick up the latest value. NOTE: the embedding model is deliberately NOT here — changing
// it would invalidate every vector already stored in the graph, so it stays pinned in code.

export interface PikuSettings {
  operatorName:   string   // shown in the Home greeting / operator line
  workEmail:      string
  personalEmail:  string
  workGitHub:     string
  personalGitHub: string
  chatModel:      string   // local Ollama chat model (fast/tool turns + fallback brain)
  opencodeModel:  string   // opencode deep-thinking model id
  localOnly:      boolean   // privacy: keep every turn on-device (skip the opencode cloud brain)
  jiraUrl:        string
  confluenceUrl:  string
  notionUrl:      string
}

const env = import.meta.env

export const DEFAULT_SETTINGS: PikuSettings = {
  operatorName:   'Jaskirat',
  workEmail:      env.VITE_PIKU_WORK_EMAIL      ?? 'work@example.com',
  personalEmail:  env.VITE_PIKU_PERSONAL_EMAIL  ?? 'personal@example.com',
  workGitHub:     env.VITE_PIKU_WORK_GH         ?? 'work-user',
  personalGitHub: env.VITE_PIKU_PERSONAL_GH     ?? 'personal-user',
  chatModel:      'qwen3:4b',
  opencodeModel:  'deepseek-v4-flash-free',
  localOnly:      false,
  jiraUrl:        'https://www.atlassian.com/software/jira',
  confluenceUrl:  'https://www.atlassian.com/software/confluence',
  notionUrl:      'https://www.notion.so',
}

const LS_KEY = 'piku.settings.v1'

function loadSettings(): PikuSettings {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PikuSettings>
      // Merge over defaults so newly-added fields always have a value.
      return { ...DEFAULT_SETTINGS, ...parsed }
    }
  } catch { /* malformed JSON or storage unavailable — fall back to defaults */ }
  return { ...DEFAULT_SETTINGS }
}

let current: PikuSettings = loadSettings()
const listeners = new Set<() => void>()

function persist(): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(current)) } catch { /* quota / unavailable */ }
}

export const pikuSettings = {
  /** Current settings snapshot (stable reference until the next set/reset). */
  get(): PikuSettings { return current },
  /** Merge a partial update, persist it, and notify subscribers. */
  set(patch: Partial<PikuSettings>): void {
    current = { ...current, ...patch }
    persist()
    listeners.forEach(l => l())
  },
  /** Restore every field to its default (and clear the persisted copy). */
  reset(): void {
    current = { ...DEFAULT_SETTINGS }
    try { localStorage.removeItem(LS_KEY) } catch { /* ignore */ }
    listeners.forEach(l => l())
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  },
}

/** React hook — re-renders the component whenever any setting changes. */
export function useSettings(): PikuSettings {
  return useSyncExternalStore(pikuSettings.subscribe, pikuSettings.get, pikuSettings.get)
}
