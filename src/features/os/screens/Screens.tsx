import { useEffect, useRef, useState } from 'react'
import type { ReactNode, FC } from 'react'
import { Card } from '../Card'
import type { NavKey } from '../Sidebar'
import { ScreenShell, BuildStatus, Hint } from './ScreenShell'
import { projectService } from '../../projects/components/ProjectDashboard'
import { AgentScreen } from './AgentScreen'
import { CanvasScreen } from './Canvas'
import { PlaygroundScreen } from './Playground'

const AddBtn = ({ label }: { label: string }) => (
  <button className="text-[12px] text-cyan-200 bg-cyan-500/12 hover:bg-cyan-500/20 border border-cyan-400/20 rounded-xl px-3 py-1.5 transition-colors">{label}</button>
)
const Pill = ({ children, tone = 'idle' }: { children: ReactNode; tone?: 'run' | 'idle' }) => (
  <span className={`text-[9px] px-1.5 py-0.5 rounded ${tone === 'run' ? 'text-cyan-300/80 bg-cyan-500/10' : 'text-white/40 bg-white/5'}`}>{children}</span>
)

/* ───────────────────────── Models ───────────────────────── */
export function ModelsScreen() {
  const models = [
    { name: 'qwen3:4b',         kind: 'Chat · default',          status: 'Running', note: 'Streaming + live thinking', glyph: '◈' },
    { name: 'qwen3:14b',        kind: 'Chat · heavy reasoning',  status: 'Idle',    note: 'Swaps in for hard tasks',  glyph: '◈' },
    { name: 'nomic-embed-text', kind: 'Embeddings · 137M',       status: 'Idle',    note: 'Memory & retrieval vectors', glyph: '≈' },
  ]
  return (
    <ScreenShell title="Models" subtitle="Local inference today; capability-based routing tomorrow." action={<AddBtn label="+ Pull model" />}>
      <div className="grid grid-cols-12 gap-4">
        {models.map(m => (
          <Card key={m.name} className="col-span-12 md:col-span-4">
            <div className="flex items-center gap-2.5 mb-2">
              <span className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-400/15 flex items-center justify-center text-cyan-300/80">{m.glyph}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white/90 truncate">{m.name}</div>
                <div className="text-[10px] text-white/35">{m.kind}</div>
              </div>
              <Pill tone={m.status === 'Running' ? 'run' : 'idle'}>{m.status}</Pill>
            </div>
            <Hint>{m.note}</Hint>
          </Card>
        ))}
        <Card title="Routing" className="col-span-12">
          <div className="flex flex-col sm:flex-row gap-3 text-xs">
            <div className="flex-1 rounded-xl bg-cyan-500/[0.06] border border-cyan-400/15 p-3">
              <div className="text-cyan-300/80 mb-1">Now — local only</div>
              <Hint>Every request goes through <span className="text-white/70">OllamaService</span>, hardcoded to qwen3. No network, no key.</Hint>
            </div>
            <div className="flex-1 rounded-xl bg-cyan-400/[0.05] border border-cyan-300/20 p-3">
              <div className="text-cyan-200/80 mb-1">Next — ProviderRegistry</div>
              <Hint>Route by capability: local Ollama for most, escalate hard tasks to Claude via the <span className="text-white/70">claude CLI</span> (K2: never an API key).</Hint>
            </div>
          </div>
        </Card>
      </div>
      <BuildStatus items={[
        { label: 'OllamaService — local, streaming', state: 'built' },
        { label: 'Embeddings → IndexedDB', state: 'built' },
        { label: 'ProviderRegistry / capability routing', state: 'planned' },
        { label: 'Claude-CLI Tier-2 escalation', state: 'planned' },
      ]} />
    </ScreenShell>
  )
}

/* ───────────────────────── Projects ───────────────────────── */
const MOCK_PROJECTS = [
  { name: 'Piku OS Core',          state: 'In Progress', docs: 12 },
  { name: 'Personal AI Assistant', state: 'In Progress', docs: 7 },
  { name: 'Research Copilot',      state: 'Planning',    docs: 3 },
]
export function ProjectsScreen({ onNavigateToGalaxy, onNavigate }: { onNavigateToGalaxy?: (name: string) => void; onNavigate?: (v: string) => void }) {
  const [projects, setProjects] = useState<{ name: string; state: string; docs: number }[]>(MOCK_PROJECTS)
  const [live, setLive] = useState(false)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const all = await projectService.getAllProjects()
        if (!cancelled && all.length) {
          setProjects(all.map(p => ({ name: p.name, state: p.currentState || 'Active', docs: 0 })))
          setLive(true)
        }
      } catch { /* keep mock */ }
    })()
    return () => { cancelled = true }
  }, [])
  const openGraph = (name: string) => {
    onNavigateToGalaxy?.(name)
    onNavigate?.('knowledge')
  }
  return (
    <ScreenShell title="Projects" subtitle={live ? 'Live from your local project store.' : 'Sample projects — your real ones load from IndexedDB.'} action={<AddBtn label="+ New project" />}>
      <div className="grid grid-cols-12 gap-4">
        {projects.map(p => (
          <Card key={p.name} className="col-span-12 md:col-span-6 lg:col-span-4">
            <div className="flex items-center gap-2.5 mb-3">
              <span className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-400/15 flex items-center justify-center text-cyan-300/80">▤</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white/90 truncate">{p.name}</div>
                <div className="text-[10px] text-white/40">{p.state}</div>
              </div>
              <button onClick={() => openGraph(p.name)}
                className="font-hud text-[9px] uppercase tracking-[0.12em] text-cyan-300/50 hover:text-cyan-200 border border-cyan-400/15 hover:border-cyan-400/30 px-2 py-1 transition-colors">
                ✦ graph
              </button>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-white/40">
              <span>{p.docs} docs</span><span>·</span><span>context tracked</span>
            </div>
          </Card>
        ))}
      </div>
      <BuildStatus items={[
        { label: 'ProjectService / ProjectStore', state: 'built' },
        { label: 'Extraction + retrieval + context versions', state: 'built' },
        { label: 'Project detail / editor UI', state: 'planned' },
        { label: 'pendingProjectUpdates review', state: 'planned' },
      ]} />
    </ScreenShell>
  )
}

/* ───────────────────────── Datasets ───────────────────────── */
export function DatasetsScreen() {
  const sets = [
    { name: 'product_data_v2.csv', kind: 'CSV · 2.4 MB',  status: 'Absorbed' },
    { name: 'meeting_notes/',      kind: 'Folder · 38 md', status: 'Absorbed' },
    { name: 'arxiv_papers/',       kind: 'PDF · 11 files', status: 'Queued' },
  ]
  return (
    <ScreenShell title="Datasets" subtitle="Documents absorbed into Piku's memory and World Model." action={<AddBtn label="+ Add source" />}>
      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-12" bodyClass="!p-0">
          <div className="divide-y divide-white/5">
            {sets.map(s => (
              <div key={s.name} className="flex items-center gap-3 px-4 py-3">
                <span className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-white/45 text-xs">≣</span>
                <div className="flex-1 min-w-0"><div className="text-sm text-white/85 truncate">{s.name}</div><div className="text-[10px] text-white/35">{s.kind}</div></div>
                <Pill tone={s.status === 'Absorbed' ? 'run' : 'idle'}>{s.status}</Pill>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <BuildStatus items={[
        { label: 'DocumentAbsorptionService', state: 'built' },
        { label: 'DocumentChunker + EntityExtractor', state: 'built' },
        { label: 'Drag-drop ingestion UI', state: 'planned' },
        { label: 'PDF / folder watchers', state: 'planned' },
      ]} />
    </ScreenShell>
  )
}

/* ───────────────────────── Apps — comms + coding dashboard ───────────────────────── */

const NOTCH8 = 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))'
const COMMS = [
  { key: 'whatsapp', label: 'wa', name: 'WhatsApp', url: 'https://web.whatsapp.com' },
  { key: 'linkedin', label: 'li', name: 'LinkedIn', url: 'https://www.linkedin.com/feed/' },
  { key: 'gmail',    label: 'gm', name: 'Gmail',    url: '' },
] as const
type CommsKey = typeof COMMS[number]['key']

// Apps = communications, embedded INSIDE Piku. WhatsApp/LinkedIn render as a real native web panel
// (Tauri multi-webview) positioned over the region below; Gmail is the native client.
export function AppsScreen() {
  const [tab, setTab] = useState<CommsKey>('whatsapp')
  const region = useRef<HTMLDivElement>(null)
  const active = COMMS.find(c => c.key === tab)!

  useEffect(() => {
    if (tab === 'gmail') { void hideAllEmbeds(); return }
    const id = window.setTimeout(() => {
      const el = region.current; if (!el) return
      const r = el.getBoundingClientRect()
      void embedPanel(active.label, active.url, r)
    }, 70)
    const onResize = () => {
      const el = region.current; if (!el) return
      void repositionEmbed(active.label, el.getBoundingClientRect())
    }
    window.addEventListener('resize', onResize)
    return () => { window.clearTimeout(id); window.removeEventListener('resize', onResize) }
  }, [tab, active.label, active.url])

  useEffect(() => () => { void hideAllEmbeds() }, [])   // hide panels when leaving Apps

  return (
    <div className="h-full flex flex-col px-6 pt-6 pb-24">
      <div className="flex items-end justify-between mb-4 gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white/95">Apps</h1>
          <p className="text-white/45 mt-1 text-sm">Your communication — all inside Piku.</p>
        </div>
        <div className="flex items-center gap-1 font-hud text-[11px] uppercase tracking-wider">
          {COMMS.map(c => (
            <button key={c.key} onClick={() => setTab(c.key)}
              className={`px-3.5 py-1.5 transition-colors ${tab === c.key ? 'text-cyan-100' : 'text-white/40 hover:text-white/70'}`}
              style={tab === c.key ? { clipPath: NOTCH8, background: 'rgba(34,211,238,0.12)', boxShadow: 'inset 0 0 0 1px rgba(34,211,238,0.3)' } : undefined}>{c.name}</button>
          ))}
        </div>
      </div>
      <div className="flex-1 min-h-0 relative bg-[#070b14]/60" style={{ boxShadow: 'inset 0 0 0 1px rgba(34,211,238,0.14)' }}>
        {tab === 'gmail'
          ? <div className="absolute inset-0 overflow-y-auto p-4"><GmailWidget /></div>
          : <div ref={region} className="absolute inset-0">
              <div className="absolute inset-0 flex items-center justify-center text-white/25 font-hud text-xs uppercase tracking-[0.3em] pointer-events-none">loading {active.name}…</div>
            </div>}
      </div>
    </div>
  )
}

export function WorkScreen() {
  return (
    <ScreenShell title="Work" subtitle="Your coding & productivity world — commits, tickets, docs, terminal, all in one place.">
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-6"><CodingWidget /></div>
        <Card title="Terminal" className="col-span-12 lg:col-span-6">
          <Hint>Embedded terminal with a one-click git-identity switch — <span className="text-white/65">jaskiring ⇄ work-user</span> changes who your commits are authored as. Coming next.</Hint>
        </Card>
        <Card title="Jira" className="col-span-12 md:col-span-4"><Hint>Tickets, threaded to your work email & the commits that close them. Coming.</Hint></Card>
        <Card title="Confluence" className="col-span-12 md:col-span-4"><Hint>Docs & specs. Coming.</Hint></Card>
        <Card title="Notion" className="col-span-12 md:col-span-4"><Hint>Notes & brainstorming. Coming.</Hint></Card>
      </div>
      <BuildStatus items={[
        { label: 'GitHub commits (live, both accounts)', state: 'built' },
        { label: 'Embedded terminal + git-identity switch', state: 'planned' },
        { label: 'Jira / Confluence / Notion connectors', state: 'planned' },
        { label: 'Email → ticket → commit thread', state: 'planned' },
      ]} />
    </ScreenShell>
  )
}

function mailTime(raw: string): string {
  const d = new Date(raw)
  if (isNaN(d.getTime())) return ''
  const now = new Date()
  return d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function MailRow({ m }: { m: MailSummary }) {
  const name = (m.from.replace(/<.*>/, '').replace(/"/g, '').trim() || m.from).slice(0, 40)
  const initial = (name[0] || '?').toUpperCase()
  return (
    <div className="flex items-start gap-2.5 py-2 px-1 border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors">
      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] shrink-0 ${m.unread ? 'bg-cyan-500/25 text-cyan-100' : 'bg-white/8 text-white/50'}`}>{initial}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-[12.5px] truncate ${m.unread ? 'text-white font-medium' : 'text-white/70'}`}>{name}</span>
          <span className="text-[10px] text-white/30 shrink-0 font-hud">{mailTime(m.date)}</span>
        </div>
        <div className={`text-[12px] truncate ${m.unread ? 'text-white/85' : 'text-white/50'}`}>{m.subject}</div>
        <div className="text-[11px] text-white/35 truncate">{m.snippet}</div>
      </div>
    </div>
  )
}

function GmailWidget() {
  const [groups, setGroups] = useState<{ acct: string; label: string; mail: MailSummary[] }[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const accts = (await accountService.getByService('email')).filter(a => a.enabled && a.token)
      const out: { acct: string; label: string; mail: MailSummary[] }[] = []
      for (const a of accts) {
        try { out.push({ acct: a.email ?? a.label, label: a.label, mail: await gmailConnector.search(a, 'in:inbox newer_than:14d', 25) }) }
        catch { out.push({ acct: a.email ?? a.label, label: a.label, mail: [] }) }
      }
      if (!cancelled) { setGroups(out); setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [])
  return (
    <Card title="Gmail" action={<button onClick={() => void openWebWindow(WEB_APPS.gmail.label, WEB_APPS.gmail.url, WEB_APPS.gmail.title)} className="font-hud text-[10px] uppercase tracking-wider text-cyan-300/60 hover:text-cyan-200">Open ↗</button>}>
      <div className="max-h-[440px] overflow-y-auto -mx-1 px-1">
        {loading ? <Hint>loading inbox…</Hint>
          : groups.length === 0 ? <Hint>No Gmail connected — Settings → Gmail.</Hint>
          : groups.map(g => (
            <div key={g.acct} className="mb-1.5 last:mb-0">
              <div className="font-hud text-[9.5px] uppercase tracking-wider text-cyan-300/50 sticky top-0 bg-[#0a1120]/80 backdrop-blur-sm py-1.5 z-10">{g.label} · {g.acct}</div>
              {g.mail.length === 0 ? <div className="text-[11px] text-white/30 py-1">inbox empty (14d)</div>
                : g.mail.map(m => <MailRow key={m.id} m={m} />)}
            </div>
          ))}
      </div>
    </Card>
  )
}

function CodingWidget() {
  const [rows, setRows] = useState<{ label: string; user: string; total: number; repos: string[] }[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const accts = (await accountService.getByService('github')).filter(a => a.enabled && a.token)
      const d = new Date(Date.now() - 7 * 864e5)
      const since = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const out: { label: string; user: string; total: number; repos: string[] }[] = []
      for (const a of accts) {
        const r = await gitHubConnector.commitsSince(a, since)
        out.push({
          label: a.label, user: a.username ?? '', total: r?.total ?? 0,
          repos: r ? Object.entries(r.byRepo).sort((x, y) => y[1] - x[1]).slice(0, 4).map(([rp, n]) => `${rp.split('/').pop()} (${n})`) : [],
        })
      }
      if (!cancelled) { setRows(out); setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [])
  return (
    <Card title="GitHub — commits, last 7 days" action={<button onClick={() => void openWebWindow(WEB_APPS.github.label, WEB_APPS.github.url, WEB_APPS.github.title)} className="font-hud text-[10px] uppercase tracking-wider text-cyan-300/60 hover:text-cyan-200">Open ↗</button>}>
      <div className="max-h-[320px] overflow-y-auto -mx-1 px-1">
        {loading ? <Hint>loading…</Hint>
          : rows.length === 0 ? <Hint>No GitHub connected — Settings → GitHub.</Hint>
          : rows.map(r => (
            <div key={r.label} className="py-2 border-b border-white/5 last:border-0">
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/85">{r.label} <span className="text-white/35 text-xs">@{r.user}</span></span>
                <span className="text-cyan-300/80 text-xs tabular-nums">{r.total} commits</span>
              </div>
              {r.repos.length > 0 && <div className="text-[11px] text-white/45 mt-1 truncate">{r.repos.join('  ·  ')}</div>}
            </div>
          ))}
      </div>
      <div className="mt-3 pt-2.5 border-t border-white/5 text-[11px] text-white/40 leading-relaxed">
        <span className="text-cyan-300/60">+ Jira</span> — next: thread <span className="text-white/60">work email → ticket → the commits that close it</span>.
      </div>
    </Card>
  )
}

/* ───────────────────────── Files ───────────────────────── */
export function FilesScreen() {
  const tree = [
    { n: 'piku-vault/', d: 'Runtime World Model', t: 'folder' },
    { n: 'projects/',   d: 'Per-project context', t: 'folder' },
    { n: 'memories/',   d: 'Extracted memories',  t: 'folder' },
    { n: 'README.md',   d: 'Vault overview',       t: 'file' },
  ]
  return (
    <ScreenShell title="Files" subtitle="What Piku has absorbed and where it keeps its world.">
      <Card className="col-span-12" bodyClass="!p-0">
        <div className="divide-y divide-white/5">
          {tree.map(f => (
            <div key={f.n} className="flex items-center gap-3 px-4 py-2.5">
              <span className="text-white/40 w-5 text-center">{f.t === 'folder' ? '▸' : '·'}</span>
              <span className="text-sm text-white/80 flex-1">{f.n}</span>
              <span className="text-[10px] text-white/35">{f.d}</span>
            </div>
          ))}
        </div>
      </Card>
      <BuildStatus items={[
        { label: 'IndexedDB stores', state: 'built' },
        { label: 'Runtime vault (piku-vault/)', state: 'planned' },
        { label: 'File browser + preview', state: 'planned' },
        { label: 'Vault capture (2.5-V)', state: 'planned' },
      ]} />
    </ScreenShell>
  )
}

/* ───────────────────────── Calendar ───────────────────────── */
export function CalendarScreen() {
  const { events, loading } = useUpcomingEvents()
  const [connecting, setConnecting] = useState(false)
  const [calAccounts, setCalAccounts] = useState<number>(0)

  useEffect(() => {
    void (async () => {
      try { setCalAccounts((await accountService.getByService('calendar')).filter(a => a.enabled && a.token).length) }
      catch { /* ignore */ }
    })()
  }, [])

  const connect = async () => {
    setConnecting(true)
    try {
      const t = await connectGoogle()
      const acc = await accountService.create('calendar', t.email ?? 'Google Calendar', t.accessToken, { email: t.email })
      await accountService.save({ ...acc, refreshToken: t.refreshToken, tokenExpiresAt: t.expiresAt })
      setCalAccounts(c => c + 1)
      void connectorFeed.refresh(true)
    } catch { /* user cancelled or error — leave as-is */ }
    finally { setConnecting(false) }
  }

  const byDay = new Map<string, { dateLabel: string; items: CalendarEvent[] }>()
  for (const e of events?.events ?? []) {
    const d = new Date(e.start)
    const key = d.toDateString()
    const dateLabel = d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
    if (!byDay.has(key)) byDay.set(key, { dateLabel, items: [] })
    byDay.get(key)!.items.push(e)
  }

  return (
    <ScreenShell title="Calendar" subtitle="Your upcoming Google Calendar events — pulled live from connected accounts.">
      {calAccounts === 0 ? (
        <Card className="col-span-12">
          <div className="py-8 text-center">
            <div className="text-sm text-white/70 mb-1">No Google Calendar connected</div>
            <div className="text-[11px] text-white/40 mb-5">Connect to see your schedule here, on Home, and via the agent ("what's on my calendar").</div>
            <button onClick={connect} disabled={connecting || !googleConfigured()}
              className="font-hud text-[11px] uppercase tracking-wider text-cyan-100 bg-cyan-500/15 hover:bg-cyan-500/25 disabled:opacity-40 px-5 py-2.5 transition-colors"
              style={{ clipPath: NOTCH8 }}>
              {connecting ? 'Connecting…' : googleConfigured() ? '+ Connect Google Calendar' : 'Set VITE_GOOGLE_* in .env.local'}
            </button>
          </div>
        </Card>
      ) : loading && !events ? (
        <Card className="col-span-12"><Hint>loading calendar…</Hint></Card>
      ) : !events || events.events.length === 0 ? (
        <Card className="col-span-12"><Hint>Nothing on the calendar for the next 14 days.</Hint></Card>
      ) : (
        <Card className="col-span-12" title="Upcoming" action={
          <button onClick={connect} disabled={connecting} className="font-hud text-[10px] uppercase tracking-wider text-cyan-300/60 hover:text-cyan-200 disabled:opacity-40">+ Add account</button>
        }>
          <div className="max-h-[560px] overflow-y-auto -mx-1 px-1">
            {[...byDay.values()].map(group => (
              <div key={group.dateLabel} className="mb-4 last:mb-0">
                <div className="font-hud text-[9.5px] uppercase tracking-wider text-cyan-300/50 sticky top-0 bg-[#0a1120]/80 backdrop-blur-sm py-1.5 z-10">{group.dateLabel}</div>
                {group.items.map(e => {
                  const when = new Date(e.start).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
                  const end = new Date(e.end).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
                  return (
                    <div key={e.id} className="flex items-start gap-3 py-2 border-b border-white/5 last:border-0">
                      <div className="font-hud text-[11px] text-cyan-200/70 w-20 shrink-0 pt-0.5 tabular-nums">{when}{end && end !== when ? `–${end}` : ''}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] text-white/85">{e.title}</div>
                        {e.location && <div className="text-[11px] text-white/40 truncate">📍 {e.location}</div>}
                        {e.attendees && e.attendees.length > 0 && <div className="text-[10px] text-white/30 truncate">{e.attendees.slice(0, 4).join(', ')}</div>}
                        {e.meetLink && <a href={e.meetLink} target="_blank" rel="noreferrer" className="text-[10px] text-cyan-300/60 hover:text-cyan-200">Join meeting ↗</a>}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </Card>
      )}
      <BuildStatus items={[
        { label: 'Google Calendar (read-only, OAuth)', state: 'built' },
        { label: 'Shared connector feed', state: 'built' },
        { label: 'Agent calendar_check tool', state: 'built' },
        { label: 'Calendar → World Model graph', state: 'planned' },
      ]} />
    </ScreenShell>
  )
}

/* ───────────────────────── People ───────────────────────── */
export function PeopleScreen() {
  const people = [
    { n: 'Jaskirat Singh', r: 'Owner · solo developer', seen: 'now' },
    { n: 'Salescode team', r: 'Org context',            seen: 'this week' },
  ]
  return (
    <ScreenShell title="People" subtitle="Person-entities Piku knows about, drawn from the World Model graph.">
      <div className="grid grid-cols-12 gap-4">
        {people.map(p => (
          <Card key={p.n} className="col-span-12 md:col-span-6 lg:col-span-4">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-full bg-cyan-400/15 border border-cyan-400/25 flex items-center justify-center text-cyan-200">◍</span>
              <div className="flex-1 min-w-0"><div className="text-sm text-white/90 truncate">{p.n}</div><div className="text-[10px] text-white/40">{p.r}</div></div>
              <span className="text-[10px] text-white/30">{p.seen}</span>
            </div>
          </Card>
        ))}
      </div>
      <BuildStatus items={[
        { label: 'WorldModelQueryService', state: 'built' },
        { label: 'Graph person-entity type', state: 'built' },
        { label: 'People view → live graph query', state: 'planned' },
        { label: 'Relationship timeline', state: 'planned' },
      ]} />
    </ScreenShell>
  )
}

/* ───────────────────────── Settings ───────────────────────── */
import { accountService, gitHubConnector, gmailConnector, connectGoogle, googleConfigured, useUpcomingEvents, connectorFeed } from '../../../services/accounts'
import type { ServiceAccount, ServiceType, MailSummary, CalendarEvent } from '../../../services/accounts'
import { openWebWindow, WEB_APPS } from '../../../services/webwin'
import { embedPanel, repositionEmbed, hideAllEmbeds } from '../../../services/embed'

function GmailCard() {
  const [accounts, setAccounts] = useState<ServiceAccount[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [label, setLabel] = useState('')
  const load = () => { void accountService.getByService('email').then(setAccounts) }
  useEffect(() => { load() }, [])
  const connect = async () => {
    setErr(''); setBusy(true)
    try {
      const t = await connectGoogle()
      const lbl = label.trim() || (t.email ? t.email.split('@')[0] : 'Gmail')
      // upsert by email so reconnecting the same account updates instead of duplicating
      const existing = (await accountService.getByService('email')).find(a => a.email && t.email && a.email.toLowerCase() === t.email.toLowerCase())
      if (existing) {
        await accountService.save({ ...existing, label: lbl, token: t.accessToken, refreshToken: t.refreshToken ?? existing.refreshToken, tokenExpiresAt: t.expiresAt })
      } else {
        const acc = await accountService.create('email', lbl, t.accessToken, { email: t.email })
        await accountService.save({ ...acc, refreshToken: t.refreshToken, tokenExpiresAt: t.expiresAt })
      }
      setLabel(''); load()
    } catch (e) { setErr(String(e instanceof Error ? e.message : e)) } finally { setBusy(false) }
  }
  return (
    <Card title="Gmail" className="col-span-12 md:col-span-6">
      {accounts.length === 0
        ? <p className="text-xs text-white/25 py-2">No Gmail connected.</p>
        : accounts.map(a => (
            <div key={a.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
              <span className="text-sm text-white/80 flex items-center gap-2 min-w-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                <span className="font-hud text-[10px] uppercase tracking-wider text-cyan-300/60">{a.label}</span>
                <span className="truncate text-white/60">{a.email}</span>
              </span>
              <button onClick={() => void accountService.delete(a.id).then(load)} className="font-hud text-[10px] text-white/25 hover:text-red-300 shrink-0">remove</button>
            </div>
          ))}
      {googleConfigured()
        ? (
          <div className="flex items-center gap-2 mt-2">
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="label (e.g. Work)" className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white/70 placeholder:text-white/20 outline-none font-hud" />
            <button onClick={connect} disabled={busy} className="font-hud text-[10px] text-cyan-300/70 hover:text-cyan-200 border border-cyan-400/20 px-3 py-1.5 transition-colors disabled:opacity-40 shrink-0">{busy ? 'connecting…' : '+ Connect Gmail'}</button>
          </div>
        )
        : <p className="font-hud text-[10px] text-amber-300/70 mt-2 leading-relaxed">Set VITE_GOOGLE_CLIENT_ID / _SECRET in .env.local (Google Cloud → OAuth client → Desktop app) to enable.</p>}
      {err && <p className="text-[10px] text-red-400/70 mt-1.5 break-words">{err}</p>}
    </Card>
  )
}

function AccountRow({ account, onDelete }: { account: ServiceAccount; onDelete: () => void }) {
  const [info, setInfo] = useState<{ ok: boolean; repos?: number; name?: string }>({ ok: false })
  const [checking, setChecking] = useState(true)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const ok = await gitHubConnector.test(account)
        if (cancelled) return
        if (ok) {
          const repos = await gitHubConnector.listRepos(account)
          if (!cancelled) setInfo({ ok: true, repos: repos.length })
        } else {
          if (!cancelled) setInfo({ ok: false })
        }
      } catch { if (!cancelled) setInfo({ ok: false }) }
      if (!cancelled) setChecking(false)
    })()
    return () => { cancelled = true }
  }, [account])
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
      <div className="flex items-center gap-2.5">
        <span className={`w-2 h-2 rounded-full ${info.ok ? 'bg-cyan-400/60' : checking ? 'bg-white/20' : 'bg-red-400/40'}`} />
        <div>
          <div className="text-sm text-white/80">
            {account.label}
            {account.username && <span className="text-white/35 ml-1.5 text-xs">@{account.username}</span>}
          </div>
          {checking ? (
            <div className="text-[10px] text-white/25">checking…</div>
          ) : info.ok ? (
            <div className="text-[10px] text-green-400/50">{info.repos ?? '?'} repos · connected</div>
          ) : (
            <div className="text-[10px] text-red-400/40">unreachable{account.token ? '' : ' (no token — public only)'}</div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={onDelete} className="font-hud text-[9px] text-white/20 hover:text-red-400/60 uppercase tracking-[0.1em] transition-colors">✕</button>
      </div>
    </div>
  )
}

function AddAccountForm({ service, onAdded }: { service: ServiceType; onAdded: () => void }) {
  const [label, setLabel] = useState('')
  const [token, setToken] = useState('')
  const [adding, setAdding] = useState(false)
  const handleAdd = async () => {
    if (!label.trim() || !token.trim()) return
    setAdding(true)
    await accountService.create(service, label.trim(), token.trim())
    setLabel(''); setToken(''); setAdding(false)
    onAdded()
  }
  return (
    <div className="flex items-center gap-2 mt-2">
      <input value={label} onChange={e => setLabel(e.target.value)} placeholder="label (e.g. Personal)" className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white/70 placeholder:text-white/20 outline-none font-hud" />
      <input value={token} onChange={e => setToken(e.target.value)} placeholder="token / API key" type="password" className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white/70 placeholder:text-white/20 outline-none font-hud" />
      <button onClick={handleAdd} disabled={adding || !label.trim() || !token.trim()} className="font-hud text-[10px] text-cyan-300/60 hover:text-cyan-200 border border-cyan-400/20 px-2.5 py-1 transition-colors disabled:opacity-30">add</button>
    </div>
  )
}

function WebAppCard({ app, name, desc }: { app: 'whatsapp' | 'linkedin'; name: string; desc: string }) {
  const a = WEB_APPS[app]
  return (
    <Card title={name} className="col-span-12 md:col-span-6">
      <p className="text-xs text-white/45 mb-3 leading-relaxed">{desc}</p>
      <button onClick={() => void openWebWindow(a.label, a.url, a.title)}
        className="font-hud text-[10px] uppercase tracking-wider text-cyan-200 bg-cyan-500/12 hover:bg-cyan-500/20 border border-cyan-400/20 px-3 py-1.5 transition-colors">
        Open {name} ↗
      </button>
    </Card>
  )
}

function ServiceCard({ service, title }: { service: ServiceType; title: string }) {
  const [accounts, setAccounts] = useState<ServiceAccount[]>([])
  const load = () => { void accountService.getByService(service).then(setAccounts) }
  useEffect(() => { load() }, [service])
  return (
    <Card title={title} className="col-span-12 md:col-span-6">
      {accounts.length === 0 ? (
        <p className="text-xs text-white/25 py-2">No accounts connected.</p>
      ) : (
        accounts.map(a => (
          <AccountRow key={a.id} account={a} onDelete={() => { void accountService.delete(a.id).then(load) }} />
        ))
      )}
      <AddAccountForm service={service} onAdded={load} />
    </Card>
  )
}

export function SettingsScreen() {
  const Row = ({ label, value, tone = 'idle' }: { label: string; value: string; tone?: 'run' | 'idle' }) => (
    <div className="flex items-center justify-between py-2.5 border-b border-white/5 last:border-0">
      <span className="text-sm text-white/70">{label}</span>
      <Pill tone={tone}>{value}</Pill>
    </div>
  )
  return (
    <ScreenShell title="Settings" subtitle="Models, accounts, privacy — how Piku lives on your machine.">
      <div className="grid grid-cols-12 gap-4">

        {/* Core settings */}
        <Card title="Models" className="col-span-12 md:col-span-6">
          <Row label="Chat model" value="qwen3:4b" tone="run" />
          <Row label="Embedding model" value="nomic-embed-text" />
          <Row label="Tier-2 escalation" value="planned" />
        </Card>
        <Card title="Privacy" className="col-span-12 md:col-span-6">
          <Row label="Local-first (P4)" value="On" tone="run" />
          <Row label="Data egress (K4)" value="Off — opt-in only" tone="run" />
          <Row label="External AI via API key (K2)" value="Never" tone="run" />
        </Card>
        <Card title="Storage" className="col-span-12 md:col-span-6">
          <Row label="Database" value="IndexedDB v8" tone="run" />
          <Row label="Runtime vault" value="piku-vault/ (planned)" />
        </Card>
        <Card title="Identity" className="col-span-12 md:col-span-6">
          <Row label="Personality source" value="hardcoded prompt" />
          <Row label="Personality-as-data (P7)" value="planned" />
        </Card>

        {/* Connected accounts — multi-account per service */}
        <ServiceCard service="github" title="GitHub" />
        <GmailCard />
        <WebAppCard app="whatsapp" name="WhatsApp" desc="Opens WhatsApp Web in a dedicated window — scan the QR once, stays signed in." />
        <WebAppCard app="linkedin" name="LinkedIn" desc="Opens LinkedIn in a dedicated window — log in once, stays signed in." />

      </div>
      <BuildStatus items={[
        { label: 'OllamaService config', state: 'built' },
        { label: 'Multi-account service', state: 'built' },
        { label: 'GitHub connector', state: 'built' },
        { label: 'Email / WhatsApp connectors', state: 'planned' },
        { label: 'Settings persistence', state: 'planned' },
        { label: 'Identity Layer (pikuIdentity v8)', state: 'planned' },
      ]} />
    </ScreenShell>
  )
}

/* ───────────────────────── Router map ───────────────────────── */
export const SCREENS: Partial<Record<NavKey, FC>> = {
  agent:     AgentScreen,
  models:    ModelsScreen,
  projects:  ProjectsScreen,
  datasets:  DatasetsScreen,
  apps:      CanvasScreen,
  work:      WorkScreen,
  files:     FilesScreen,
  calendar:  CalendarScreen,
  people:    PeopleScreen,
  playground: PlaygroundScreen,
  settings:  SettingsScreen,
}
