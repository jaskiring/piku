import { useEffect, useState } from 'react'
import { HudPanel, HudChip, chamfer } from '../Hud'
import { ScreenShell, BuildStatus } from './ScreenShell'
import type { NavKey } from '../Sidebar'
import { agentHub } from './agentSession'

// ── Capability registry — sourced directly from ToolRouter.ts ──────────────────────────────
// These are the ACTUAL tools registered in TOOLS: Record<string, ToolDef> in ToolRouter.ts.
// Groups: OS/Apps, Comms, Dev/GitHub, Web, Memory.

interface Capability {
  name:    string
  glyph:  string
  desc:   string
  example: string
}

interface CapabilityGroup {
  key:    string
  label:  string
  items:  Capability[]
}

const CAPABILITY_GROUPS: CapabilityGroup[] = [
  {
    key:   'os',
    label: 'OS / Apps',
    items: [
      { name: 'open_app',   glyph: '⊞', desc: 'Open or focus any Mac application by name.', example: '"Open Spotify"' },
      { name: 'open_link',  glyph: '↗', desc: 'Open a URL, file path, or folder with the default app.', example: '"Open ~/Documents"' },
      { name: 'open_web',   glyph: '◉', desc: "Open any website in Piku's signed-in Chrome profile.", example: '"Open LinkedIn"' },
      { name: 'open_email', glyph: '✉', desc: "Open Gmail (work or personal) in Piku's Chrome profile.", example: '"Open my work email"' },
      { name: 'list_files', glyph: '▭', desc: "List files and folders in a directory under the user's home.", example: '"What is in my Documents?"' },
    ],
  },
  {
    key:   'comms',
    label: 'Comms',
    items: [
      { name: 'gmail_check',    glyph: '✉', desc: "Check Gmail across all connected accounts — unread, important, or by sender.", example: '"Any important email today?"' },
      { name: 'calendar_check', glyph: '◷', desc: "Check Google Calendar events across connected accounts — today or further ahead.", example: '"What is on my calendar this week?"' },
    ],
  },
  {
    key:   'dev',
    label: 'Dev / GitHub',
    items: [
      { name: 'github_commits_today',   glyph: '⎇', desc: "Summarise all commits pushed today across connected GitHub accounts.", example: '"What did I ship today?"' },
      { name: 'github_list_repos',      glyph: '▤', desc: "List GitHub repositories for a connected account.", example: '"Show my office GitHub repos"' },
      { name: 'github_recent_activity', glyph: '◈', desc: "Get recent GitHub activity — pushes, PRs, issues — for a connected account.", example: '"What have I been working on?"' },
    ],
  },
  {
    key:   'web',
    label: 'Web',
    items: [
      { name: 'web_search', glyph: '⌕', desc: "Search the web — opens in Chrome AND fetches top results for Piku to summarise.", example: '"Search: latest AI news"' },
    ],
  },
  {
    key:   'memory',
    label: 'Memory',
    items: [
      { name: 'save_memory',   glyph: '✦', desc: "Save a durable fact about you to long-term memory.", example: '"Remember I prefer dark mode"' },
      { name: 'recall_memory', glyph: '✧', desc: "Search long-term memory for relevant facts before answering a personal question.", example: '"What do you know about me?"' },
      { name: 'get_datetime',  glyph: '◇', desc: "Get the current local date and time.", example: '"What time is it?"' },
    ],
  },
]

// ── Automation type + localStorage persistence ──────────────────────────────────────────────

interface Automation {
  id:        string
  name:      string
  instruction: string
  trigger:   string   // optional trigger phrase
  createdAt: number
}

const LS_KEY = 'piku.automations'

function loadAutomations(): Automation[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

function saveAutomations(list: Automation[]): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(list)) } catch { /* ignore */ }
}

// ── Glyph badge — matches HUD language from Screens.tsx ────────────────────────────────────
function Glyph({ children, accent = 'cyan' }: { children: React.ReactNode; accent?: 'cyan' | 'violet' }) {
  return (
    <span
      className={`w-9 h-9 shrink-0 flex items-center justify-center text-[15px] ${accent === 'violet' ? 'text-fuchsia-200/80' : 'text-cyan-300/80'}`}
      style={{
        ...chamfer(7),
        background: accent === 'violet' ? 'rgba(217,70,239,0.08)' : 'rgba(34,211,238,0.08)',
        boxShadow: `inset 0 0 0 1px ${accent === 'violet' ? 'rgba(217,70,239,0.25)' : 'rgba(34,211,238,0.25)'}`,
      }}>
      {children}
    </span>
  )
}

// ── Capability row ──────────────────────────────────────────────────────────────────────────
function CapRow({ cap }: { cap: Capability }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5" style={{ ...chamfer(8), background: 'rgba(255,255,255,0.025)' }}>
      <Glyph>{cap.glyph}</Glyph>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-white/90 font-mono truncate">{cap.name}</div>
        <div className="text-[11.5px] text-white/55 mt-0.5 leading-snug">{cap.desc}</div>
      </div>
      <span className="font-hud text-[9px] tracking-wider text-cyan-300/50 shrink-0 max-w-[140px] text-right leading-snug hidden sm:block">{cap.example}</span>
    </div>
  )
}

// ── Main screen ────────────────────────────────────────────────────────────────────────────
export function AutomationsScreen({ onNavigate }: { onNavigate?: (v: NavKey) => void }) {
  // ── Automations state ──
  const [automations, setAutomations] = useState<Automation[]>(loadAutomations)

  // Persist whenever list changes
  useEffect(() => { saveAutomations(automations) }, [automations])

  // Add form state
  const [formName, setFormName] = useState('')
  const [formInst, setFormInst] = useState('')
  const [formTrigger, setFormTrigger] = useState('')
  const [runFeedback, setRunFeedback] = useState<Record<string, string>>({})

  const addAutomation = () => {
    const name = formName.trim()
    const instruction = formInst.trim()
    if (!name || !instruction) return
    const newAuto: Automation = {
      id: crypto.randomUUID(),
      name,
      instruction,
      trigger: formTrigger.trim(),
      createdAt: Date.now(),
    }
    setAutomations(prev => [newAuto, ...prev])
    setFormName('')
    setFormInst('')
    setFormTrigger('')
  }

  const deleteAutomation = (id: string) => {
    setAutomations(prev => prev.filter(a => a.id !== id))
    setRunFeedback(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  const runAutomation = async (auto: Automation) => {
    // Best-effort: seed a new Agent session with the instruction and navigate there.
    // If onNavigate is available, go to agent; otherwise copy to clipboard.
    const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
    try {
      agentHub.createContext()
      agentHub.addTurn({ role: 'you', text: auto.instruction })
      // Navigate to agent to run it
      if (onNavigate) {
        onNavigate('agent')
        setRunFeedback(prev => ({ ...prev, [auto.id]: '→ Agent' }))
        setTimeout(() => setRunFeedback(prev => { const n = { ...prev }; delete n[auto.id]; return n }), 2500)
        return
      }
      // onNavigate unavailable — copy to clipboard as fallback
      if (isTauri) {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('copy_to_clipboard', { text: auto.instruction })
        setRunFeedback(prev => ({ ...prev, [auto.id]: 'Copied — paste in Agent' }))
      } else {
        await navigator.clipboard.writeText(auto.instruction)
        setRunFeedback(prev => ({ ...prev, [auto.id]: 'Copied — paste in Agent' }))
      }
    } catch {
      setRunFeedback(prev => ({ ...prev, [auto.id]: 'Seeded in Agent' }))
    }
    setTimeout(() => setRunFeedback(prev => { const n = { ...prev }; delete n[auto.id]; return n }), 3000)
  }

  return (
    <ScreenShell
      title="Automations"
      subtitle="What Piku can do — real tools + your custom one-click actions.">

      {/* ── PART 1: What Piku can do ── */}
      <div className="mb-6">
        <div className="font-hud text-[10px] uppercase tracking-[0.22em] text-cyan-300/55 mb-3 px-0.5">
          What Piku can do <span className="text-white/25 ml-1">// {CAPABILITY_GROUPS.reduce((s, g) => s + g.items.length, 0)} tools</span>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {CAPABILITY_GROUPS.map(group => (
            <HudPanel key={group.key} label={group.label}>
              <div className="flex flex-col gap-2">
                {group.items.map(cap => <CapRow key={cap.name} cap={cap} />)}
              </div>
            </HudPanel>
          ))}
        </div>
      </div>

      {/* ── PART 2: Custom automations ── */}
      <HudPanel label="Custom automations" code="USER" accent="violet"
        action={<HudChip accent="violet" dim={automations.length === 0}>{automations.length} saved</HudChip>}>

        {/* Add form */}
        <div className="mb-4 flex flex-col gap-2.5"
          style={{ ...chamfer(8), background: 'rgba(217,70,239,0.04)', boxShadow: 'inset 0 0 0 1px rgba(217,70,239,0.15)', padding: '14px 14px' }}>
          <div className="font-hud text-[9.5px] uppercase tracking-[0.2em] text-fuchsia-200/55 mb-0.5">Add automation</div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={formName}
              onChange={e => setFormName(e.target.value)}
              placeholder="Name  (e.g. Morning brief)"
              className="flex-1 bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-[12.5px] text-white/80 placeholder:text-white/20 outline-none font-hud focus:border-fuchsia-400/35 transition-colors"
              onKeyDown={e => { if (e.key === 'Enter') addAutomation() }}
            />
            <input
              value={formTrigger}
              onChange={e => setFormTrigger(e.target.value)}
              placeholder="Trigger phrase  (optional)"
              className="flex-1 bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-[12.5px] text-white/80 placeholder:text-white/20 outline-none font-hud focus:border-fuchsia-400/35 transition-colors"
              onKeyDown={e => { if (e.key === 'Enter') addAutomation() }}
            />
          </div>
          <textarea
            value={formInst}
            onChange={e => setFormInst(e.target.value)}
            placeholder="Natural-language instruction  (e.g. Check my Gmail for important emails, check my calendar for today, then summarise both)"
            rows={2}
            className="w-full bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-[12.5px] text-white/80 placeholder:text-white/20 outline-none font-hud focus:border-fuchsia-400/35 transition-colors resize-none"
          />
          <div className="flex justify-end">
            <button
              onClick={addAutomation}
              disabled={!formName.trim() || !formInst.trim()}
              className="font-hud text-[10px] uppercase tracking-[0.18em] text-fuchsia-100 bg-fuchsia-500/12 hover:bg-fuchsia-500/20 disabled:opacity-30 disabled:pointer-events-none px-4 py-2 transition-colors"
              style={{ ...chamfer(7), boxShadow: 'inset 0 0 0 1px rgba(217,70,239,0.3)' }}>
              + Add automation
            </button>
          </div>
        </div>

        {/* Saved automations list */}
        {automations.length === 0 ? (
          <div className="font-hud text-[10px] uppercase tracking-[0.18em] text-white/25 text-center py-6">
            No automations yet — add one above.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {automations.map(auto => (
              <div key={auto.id} className="flex items-center gap-3 px-3 py-2.5"
                style={{ ...chamfer(8), background: 'rgba(255,255,255,0.025)' }}>
                <Glyph accent="violet">⚡</Glyph>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-white/90 truncate">{auto.name}</div>
                  <div className="text-[11px] text-white/45 truncate mt-0.5">{auto.instruction}</div>
                  {auto.trigger && (
                    <div className="font-hud text-[9px] text-fuchsia-200/50 mt-0.5 truncate">trigger: "{auto.trigger}"</div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {runFeedback[auto.id] ? (
                    <span className="font-hud text-[9.5px] text-cyan-300/70 uppercase tracking-wider">{runFeedback[auto.id]}</span>
                  ) : (
                    <button
                      onClick={() => void runAutomation(auto)}
                      className="font-hud text-[9.5px] uppercase tracking-[0.15em] text-fuchsia-100 hover:text-white px-2.5 py-1.5 transition-colors"
                      style={{ ...chamfer(6), boxShadow: 'inset 0 0 0 1px rgba(217,70,239,0.3)' }}>
                      ▶ Run
                    </button>
                  )}
                  <button
                    onClick={() => deleteAutomation(auto.id)}
                    className="font-hud text-[9.5px] text-white/20 hover:text-red-400/60 uppercase tracking-[0.1em] transition-colors px-1.5 py-1.5">
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </HudPanel>

      <BuildStatus items={[
        { label: '14 real tools — open_app / open_link / open_web / open_email / list_files / gmail_check / calendar_check / github_commits_today / github_list_repos / github_recent_activity / web_search / save_memory / recall_memory / get_datetime', state: 'built' },
        { label: 'Custom automations — add / delete / persist to localStorage', state: 'built' },
        { label: 'Run → seeds Agent session + navigates', state: 'built' },
        { label: 'Trigger phrase → ambient intent matching', state: 'planned' },
        { label: 'Scheduled automations (cron / time-based)', state: 'planned' },
      ]} />
    </ScreenShell>
  )
}
