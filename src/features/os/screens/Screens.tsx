import { useEffect, useState } from 'react'
import type { ReactNode, FC } from 'react'
import { Card } from '../Card'
import type { NavKey } from '../Sidebar'
import { ScreenShell, BuildStatus, Hint } from './ScreenShell'
import { projectService } from '../../projects/components/ProjectDashboard'
import { activeAppObserver } from '../../../services/ActiveAppObserver'
import type { ObserverState } from '../../../services/ActiveAppObserver'
import { AgentScreen } from './AgentScreen'

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

/* ───────────────────────── Apps (the observation loop's senses) ───────────────────────── */
const fmtDur = (ms: number) => { const m = Math.round(ms / 60000); return m >= 1 ? `${m}m` : `${Math.round(ms / 1000)}s` }

export function AppsScreen() {
  const [obs, setObs] = useState<ObserverState | null>(null)
  useEffect(() => {
    activeAppObserver.start()                       // consent-on-visit: starts observing when you open Apps
    return activeAppObserver.subscribe(setObs)      // keeps running in the background after you leave
  }, [])

  const topApps = obs ? Object.entries(obs.appTotalsMs).sort((a, b) => b[1] - a[1]).slice(0, 6) : []
  const planned = [
    { name: 'Git',      desc: 'Observe commits & repo activity', glyph: '⎇' },
    { name: 'Browser',  desc: 'Capture pages you read',          glyph: '◉' },
    { name: 'Calendar', desc: 'Pull events into the timeline',   glyph: '◷' },
    { name: 'Mail',     desc: 'Summarize threads',               glyph: '✉' },
    { name: 'Files',    desc: 'Watch folders for changes',       glyph: '▭' },
  ]

  return (
    <ScreenShell title="Apps" subtitle="The senses of the observation loop — what Piku watches to build your World Model.">
      <div className="grid grid-cols-12 gap-4">
        {/* The live observer — the loop's first heartbeat */}
        <Card title="Active-App Observer" className="col-span-12 lg:col-span-7"
          action={<span className="text-[10px] flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${obs?.observing ? 'bg-cyan-400 animate-pulse' : 'bg-white/30'}`} />
            <span className={obs?.observing ? 'text-cyan-300/80' : 'text-white/40'}>{obs?.observing ? 'observing' : 'idle'}</span>
          </span>}>
          {!activeAppObserver.isTauri ? (
            <Hint>Runs in the desktop app — it watches whichever app you're working in.</Hint>
          ) : obs && !obs.permissionOk ? (
            <Hint>Needs macOS <span className="text-white/70">Automation</span> permission to see the active app — approve the prompt (or System Settings → Privacy &amp; Security → Automation → piku).</Hint>
          ) : (
            <>
              <div className="rounded-xl bg-cyan-500/[0.06] border border-cyan-400/15 px-3 py-2.5 mb-3">
                <div className="text-[10px] text-cyan-300/60 mb-0.5">now observing</div>
                <div className="text-sm text-white/90 truncate">{obs?.current?.app || '—'}</div>
                {obs?.current?.title && <div className="text-[11px] text-white/40 truncate">{obs.current.title}</div>}
              </div>
              <div className="text-[10px] text-white/35 mb-2">{obs?.observationCount ?? 0} observations this session · held as proposals (P6: a World-Model write needs your approval)</div>
              <div className="flex flex-col gap-1.5">
                {(obs?.sessions ?? []).slice(0, 6).map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="w-1 h-1 rounded-full bg-cyan-300/50 shrink-0" />
                    <span className="text-white/75 truncate">{s.app}{s.title ? ` — ${s.title}` : ''}</span>
                  </div>
                ))}
                {(!obs || obs.sessions.length === 0) && <Hint>Switch to another app — Piku will note it here.</Hint>}
              </div>
            </>
          )}
        </Card>

        {/* Time-per-app */}
        <Card title="Focus this session" className="col-span-12 lg:col-span-5">
          {topApps.length === 0 ? <Hint>No focus data yet — give it a minute.</Hint> : (
            <div className="flex flex-col gap-2.5 pt-0.5">
              {topApps.map(([app, ms]) => (
                <div key={app} className="flex items-center justify-between text-xs">
                  <span className="text-white/70 truncate pr-2">{app}</span>
                  <span className="text-cyan-300/70">{fmtDur(ms)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Planned senses */}
        {planned.map(a => (
          <Card key={a.name} className="col-span-12 md:col-span-6 lg:col-span-4">
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/55">{a.glyph}</span>
              <div className="flex-1 min-w-0"><div className="text-sm text-white/90">{a.name}</div><div className="text-[10px] text-white/40 truncate">{a.desc}</div></div>
              <span className="text-[11px] text-cyan-200/60 border border-cyan-300/20 rounded-lg px-2 py-1">soon</span>
            </div>
          </Card>
        ))}
      </div>
      <BuildStatus items={[
        { label: 'Active-App observer (live)', state: 'active' },
        { label: 'Rust active_window command', state: 'built' },
        { label: 'World-Model graph + applyApprovedDiff', state: 'built' },
        { label: 'Approval surface for WM writes', state: 'planned' },
        { label: 'Git / Browser / Calendar observers', state: 'planned' },
      ]} />
    </ScreenShell>
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
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const events: Record<number, { t: string; tone: string }[]> = {
    1: [{ t: 'Shipped 2.5-A', tone: 'bg-cyan-500/20 text-cyan-100' }],
    3: [{ t: 'Persistence', tone: 'bg-cyan-500/15 text-cyan-200' }],
    4: [{ t: 'GDD cleanup', tone: 'bg-white/10 text-white/70' }],
  }
  return (
    <ScreenShell title="Calendar" subtitle="A timeline of what happened — observations and milestones by day.">
      <Card className="col-span-12">
        <div className="grid grid-cols-7 gap-2">
          {days.map((d, i) => (
            <div key={d} className="min-h-28 rounded-xl bg-white/[0.02] border border-white/8 p-2">
              <div className="text-[10px] text-white/35 mb-2">{d}</div>
              <div className="flex flex-col gap-1">
                {(events[i] || []).map(e => <span key={e.t} className={`text-[10px] rounded px-1.5 py-1 ${e.tone}`}>{e.t}</span>)}
              </div>
            </div>
          ))}
        </div>
      </Card>
      <BuildStatus items={[
        { label: 'Activity log (graphActivityLog)', state: 'built' },
        { label: 'Calendar observer', state: 'planned' },
        { label: 'Temporal observation view', state: 'planned' },
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
import { accountService, gitHubConnector, connectGoogle, googleConfigured } from '../../../services/accounts'
import type { ServiceAccount, ServiceType } from '../../../services/accounts'

function GmailCard() {
  const [accounts, setAccounts] = useState<ServiceAccount[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const load = () => { void accountService.getByService('email').then(setAccounts) }
  useEffect(() => { load() }, [])
  const connect = async () => {
    setErr(''); setBusy(true)
    try {
      const t = await connectGoogle()
      const acc = await accountService.create('email', 'Gmail', t.accessToken, { email: t.email })
      await accountService.save({ ...acc, refreshToken: t.refreshToken, tokenExpiresAt: t.expiresAt })
      load()
    } catch (e) { setErr(String(e instanceof Error ? e.message : e)) } finally { setBusy(false) }
  }
  return (
    <Card title="Gmail" className="col-span-12 md:col-span-6">
      {accounts.length === 0
        ? <p className="text-xs text-white/25 py-2">No Gmail connected.</p>
        : accounts.map(a => (
            <div key={a.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
              <span className="text-sm text-white/80 flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />{a.email ?? a.label}</span>
              <button onClick={() => void accountService.delete(a.id).then(load)} className="font-hud text-[10px] text-white/25 hover:text-red-300">remove</button>
            </div>
          ))}
      {googleConfigured()
        ? <button onClick={connect} disabled={busy} className="font-hud text-[10px] text-cyan-300/70 hover:text-cyan-200 border border-cyan-400/20 px-3 py-1.5 mt-2 transition-colors disabled:opacity-40">{busy ? 'connecting…' : '+ Connect Gmail'}</button>
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
        <ServiceCard service="whatsapp" title="WhatsApp" />
        <ServiceCard service="slack" title="Slack" />
        <ServiceCard service="calendar" title="Calendar" />
        <ServiceCard service="gitlab" title="GitLab" />

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
  agent:    AgentScreen,
  models:   ModelsScreen,
  projects: ProjectsScreen,
  datasets: DatasetsScreen,
  apps:     AppsScreen,
  files:    FilesScreen,
  calendar: CalendarScreen,
  people:   PeopleScreen,
  settings: SettingsScreen,
}
