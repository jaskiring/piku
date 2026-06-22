import { useEffect, useRef, useState } from 'react'
import type { ReactNode, FC } from 'react'
import { Card } from '../Card'
import { HudPanel, HudChip, chamfer } from '../Hud'
import type { NavKey } from '../Sidebar'
import { ScreenShell, BuildStatus, Hint } from './ScreenShell'
import { graphService } from '../../graph'
import { projectService } from '../../projects/components/ProjectDashboard'
import { ollamaService, ACTIVE_BRAIN } from '../../../services/OllamaService'
import { opencodeProvider, OPENCODE_MODEL } from '../../../services/OpencodeProvider'
import { AgentScreen } from './AgentScreen'
import { CanvasScreen } from './Canvas'
import { PlaygroundScreen } from './Playground'
import { AutomationsScreen } from './Automations'

const AddBtn = ({ label }: { label: string }) => (
  <button className="text-[12px] text-cyan-200 bg-cyan-500/12 hover:bg-cyan-500/20 border border-cyan-400/20 rounded-xl px-3 py-1.5 transition-colors">{label}</button>
)
const Pill = ({ children, tone = 'idle' }: { children: ReactNode; tone?: 'run' | 'idle' }) => (
  <span className={`text-[9px] px-1.5 py-0.5 rounded ${tone === 'run' ? 'text-cyan-300/80 bg-cyan-500/10' : 'text-white/40 bg-white/5'}`}>{children}</span>
)

/* ───────────────────────── Models ───────────────────────── */

// Known local-model blurbs; anything else discovered via listModels() falls back to a generic
// descriptor, so freshly-pulled models still show up.
const KNOWN_MODELS: Record<string, { kind: string; glyph: string }> = {
  'qwen3:4b':         { kind: 'Chat · default',         glyph: '◈' },
  'qwen3:14b':        { kind: 'Chat · heavy reasoning', glyph: '◈' },
  'nomic-embed-text': { kind: 'Embeddings · 137M',      glyph: '≈' },
}
function modelMeta(name: string) {
  return KNOWN_MODELS[name]
    ?? KNOWN_MODELS[name.split(':')[0]]
    ?? { kind: /embed/i.test(name) ? 'Embeddings' : 'Chat · local', glyph: '◈' }
}

// Assistants you can open for YOURSELF (manual handoff) — launched via the open_app / open_in_app
// Rust commands; desktop apps fall back to their web app in Chrome if not installed. (opencode is
// NOT here — it's a real reasoning backend, see panel 02.)
interface Assistant { key: string; name: string; kind: string; glyph: string; app?: string; fallbackApp?: string; web?: string }
const ASSISTANTS: Assistant[] = [
  { key: 'chatgpt', name: 'ChatGPT', kind: 'OpenAI · app',    glyph: '✦', app: 'ChatGPT', web: 'https://chatgpt.com' },
  { key: 'claude',  name: 'Claude',  kind: 'Anthropic · app', glyph: '✶', app: 'Claude',  web: 'https://claude.ai' },
  { key: 'gemini',  name: 'Gemini',  kind: 'Google · web',    glyph: '✧', web: 'https://gemini.google.com/app' },
]
const OPENCODE: Assistant = { key: 'opencode', name: 'opencode', kind: 'CLI · free models', glyph: '⌘', app: 'opencode', fallbackApp: 'Terminal' }

async function launchAssistant(a: Assistant): Promise<void> {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    if (a.app) {
      try { await invoke('open_app', { name: a.app }); return }
      catch { /* not installed → try the fallbacks */ }
    }
    if (a.fallbackApp) {
      try { await invoke('open_app', { name: a.fallbackApp }); return }
      catch { /* fall through to web */ }
    }
    if (a.web) await invoke('open_in_app', { app: 'Google Chrome', target: a.web })
  } catch { /* not running inside the desktop app */ }
}

// Chamfered glyph badge — the HUD language (matches Home), not a rounded glass chip.
const Glyph = ({ children, accent = 'cyan' }: { children: ReactNode; accent?: 'cyan' | 'violet' }) => (
  <span className={`w-9 h-9 shrink-0 flex items-center justify-center text-[15px] ${accent === 'violet' ? 'text-fuchsia-200/80' : 'text-cyan-300/80'}`}
    style={{ ...chamfer(7), background: accent === 'violet' ? 'rgba(217,70,239,0.08)' : 'rgba(34,211,238,0.08)', boxShadow: `inset 0 0 0 1px ${accent === 'violet' ? 'rgba(217,70,239,0.25)' : 'rgba(34,211,238,0.25)'}` }}>
    {children}
  </span>
)

export function ModelsScreen() {
  const [localModels, setLocalModels] = useState<string[]>(Object.keys(KNOWN_MODELS))
  const [ocOnline, setOcOnline] = useState<boolean | null>(null)
  const [ollamaUp, setOllamaUp] = useState<boolean | null>(null)
  useEffect(() => {
    void ollamaService.listModels().then(names => { if (names.length) setLocalModels(names) }).catch(() => {})
    void opencodeProvider.isReachable().then(setOcOnline).catch(() => setOcOnline(false))
    void ollamaService.isReachable().then(setOllamaUp).catch(() => setOllamaUp(false))
  }, [])
  const defaultModel = ACTIVE_BRAIN.model

  return (
    <ScreenShell title="Models" subtitle="Piku's brains — fast & private on-device, capable & free via opencode.">
      <div className="grid grid-cols-12 gap-4">

        {/* ── Local brain ── */}
        <HudPanel className="col-span-12 lg:col-span-7" label="Local brain" code="01">
          <div className="flex flex-col gap-2">
            {localModels.map(name => {
              const m = modelMeta(name)
              const isActive = name === defaultModel
              const badgeText = ollamaUp === false
                ? 'offline'
                : isActive && ollamaUp === true
                  ? 'running'
                  : ollamaUp === null
                    ? 'checking'
                    : 'idle'
              const isDim = !(isActive && ollamaUp === true)
              return (
                <div key={name} className="flex items-center gap-3 px-3 py-2.5" style={{ ...chamfer(8), background: 'rgba(255,255,255,0.025)' }}>
                  <Glyph>{m.glyph}</Glyph>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] text-white/90 truncate">{name}</div>
                    <div className="font-hud text-[9.5px] uppercase tracking-wider text-white/35 mt-0.5">{m.kind}</div>
                  </div>
                  <HudChip dim={isDim}>{badgeText}</HudChip>
                </div>
              )
            })}
          </div>
          <div className="font-hud text-[9.5px] uppercase tracking-[0.18em] text-cyan-300/40 mt-3">On-device · private · instant — handles ambient + quick turns</div>
        </HudPanel>

        {/* ── opencode brain (free, capable) ── */}
        <HudPanel className="col-span-12 lg:col-span-5" label="opencode" code="02" accent="violet"
          action={<HudChip accent="violet" dim={ocOnline !== true}>{ocOnline === null ? 'checking' : ocOnline ? 'online' : 'offline'}</HudChip>}>
          <div className="flex items-start gap-3">
            <Glyph accent="violet">⌘</Glyph>
            <p className="text-[12.5px] leading-relaxed text-white/65">
              Piku's <span className="text-fuchsia-200/90">deep-thinking brain</span> — now wired: conversation &amp; reasoning run on a free, capable model (<span className="text-fuchsia-200/90">{OPENCODE_MODEL.modelID}</span>) through a headless opencode server, so the hard asks aren't limited by the local 4B. Piku keeps building your context locally and hands it over each turn.
            </p>
          </div>
          <button onClick={() => void launchAssistant(OPENCODE)}
            className="mt-3 w-full font-hud text-[10px] uppercase tracking-[0.18em] text-fuchsia-100 bg-fuchsia-500/12 hover:bg-fuchsia-500/20 py-2.5 transition-colors"
            style={{ ...chamfer(8), boxShadow: 'inset 0 0 0 1px rgba(217,70,239,0.3)' }}>
            Open opencode app →
          </button>
        </HudPanel>

        {/* ── Open for yourself (manual handoff) ── */}
        <HudPanel className="col-span-12" label="Open for yourself" code="03">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {ASSISTANTS.map(a => (
              <div key={a.key} className="flex items-center gap-3 px-3 py-2.5" style={{ ...chamfer(8), background: 'rgba(255,255,255,0.025)' }}>
                <Glyph>{a.glyph}</Glyph>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] text-white/90 truncate">{a.name}</div>
                  <div className="font-hud text-[9.5px] uppercase tracking-wider text-white/35 mt-0.5">{a.kind}</div>
                </div>
                <button onClick={() => void launchAssistant(a)}
                  className="font-hud text-[9.5px] uppercase tracking-[0.15em] text-cyan-200 hover:text-cyan-100 px-2.5 py-1.5 transition-colors"
                  style={{ ...chamfer(6), boxShadow: 'inset 0 0 0 1px rgba(34,211,238,0.25)' }}>Open</button>
              </div>
            ))}
          </div>
          <div className="font-hud text-[9.5px] uppercase tracking-[0.18em] text-white/30 mt-3">Opens the app for you — your account, your tab. Piku doesn't drive these.</div>
        </HudPanel>

        {/* ── Routing ── */}
        <HudPanel className="col-span-12" label="Routing" code="04">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 p-3" style={{ ...chamfer(8), background: 'rgba(34,211,238,0.05)', boxShadow: 'inset 0 0 0 1px rgba(34,211,238,0.15)' }}>
              <div className="font-hud text-[10px] uppercase tracking-[0.18em] text-cyan-300/80 mb-1.5">Now — local tools + opencode brain</div>
              <Hint>Tools (open apps, mail, calendar) &amp; embeddings stay on local Ollama — private, instant. Conversation &amp; reasoning route to <span className="text-white/70">opencode</span> (free, capable), with Ollama as automatic fallback if it's offline.</Hint>
            </div>
            <div className="flex-1 p-3" style={{ ...chamfer(8), background: 'rgba(217,70,239,0.05)', boxShadow: 'inset 0 0 0 1px rgba(217,70,239,0.18)' }}>
              <div className="font-hud text-[10px] uppercase tracking-[0.18em] text-fuchsia-200/80 mb-1.5">Next — your own model</div>
              <Hint>Swap opencode for a self-hosted private model later — capability routing is unchanged and a model name never leaks past the provider (P1).</Hint>
            </div>
          </div>
        </HudPanel>
      </div>
      <HudPanel label="Build status" code="05" className="mt-6">
        <div className="flex flex-wrap gap-1.5">
          {([
            { label: 'OllamaService — local, streaming', state: 'built' as const },
            { label: 'Embeddings → IndexedDB', state: 'built' as const },
            { label: 'Open assistants — ChatGPT / Claude / Gemini', state: 'built' as const },
            { label: 'opencode brain — free capable reasoning (serve API)', state: 'built' as const },
            { label: 'Routing — local tools/embeds ↔ opencode chat', state: 'active' as const },
            { label: 'Self-hosted private model swap', state: 'planned' as const },
          ] as const).map(it => (
            <span key={it.label}
              className={`font-hud text-[9.5px] px-2.5 py-1 tracking-[0.12em] uppercase border ${
                it.state === 'built' ? 'text-cyan-300/80 bg-cyan-500/10 border-cyan-400/20'
                : 'text-cyan-200/75 bg-cyan-400/[0.07] border-cyan-300/20'
              }`}
              style={{ ...chamfer(6) }}>
              <span className="mr-1.5 opacity-60 text-[8px]">{it.state === 'built' ? '✓' : '○'}</span>
              {it.label}
            </span>
          ))}
        </div>
      </HudPanel>
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
      <HudPanel label="Projects" code="01" action={<HudChip dim>{projects.length} tracked</HudChip>}>
        {live && projects.length === 0 ? (
          <div className="font-hud text-[11px] uppercase tracking-[0.14em] text-cyan-300/45 py-6 text-center">
            No projects yet — Piku creates them as it learns about your work.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {projects.map(p => (
              <div key={p.name} className="flex items-center gap-3 px-3 py-2.5" style={{ ...chamfer(8), background: 'rgba(255,255,255,0.025)' }}>
                <Glyph>▤</Glyph>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] text-white/90 truncate">{p.name}</div>
                  <div className="font-hud text-[9.5px] uppercase tracking-wider text-white/35 mt-0.5">{p.docs} docs · context tracked</div>
                </div>
                <HudChip dim>{p.state}</HudChip>
                <button onClick={() => openGraph(p.name)}
                  className="font-hud text-[9.5px] uppercase tracking-[0.15em] text-cyan-200 hover:text-cyan-100 px-2.5 py-1.5 transition-colors"
                  style={{ ...chamfer(6), boxShadow: 'inset 0 0 0 1px rgba(34,211,238,0.25)' }}>✦ graph</button>
              </div>
            ))}
          </div>
        )}
      </HudPanel>
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

interface DatasetsState {
  // Projects
  projectCount: number
  projectNames: string[]
  projectsLoading: boolean

  // World Model graph
  nodeCount: number
  edgeCount: number
  graphLoading: boolean

  // Local models + opencode
  localModels: string[]
  modelsLoading: boolean

  // Project-brain vaults
  brainEntries: import('../../../services/ProjectBrainService').BrainGraphEntry[]
  brainLoading: boolean

  // Memory / embeddings
  memTotal: number
  memConfirmed: number
  memLoading: boolean
}

export function DatasetsScreen() {
  const [state, setState] = useState<DatasetsState>({
    projectCount: 0, projectNames: [], projectsLoading: true,
    nodeCount: 0, edgeCount: 0, graphLoading: true,
    localModels: [], modelsLoading: true,
    brainEntries: [], brainLoading: true,
    memTotal: 0, memConfirmed: 0, memLoading: true,
  })

  useEffect(() => {
    let cancelled = false

    // ── Projects ──────────────────────────────────────────────
    void (async () => {
      try {
        const all = await projectService.getAllProjects()
        if (!cancelled) setState(s => ({ ...s, projectCount: all.length, projectNames: all.map(p => p.name), projectsLoading: false }))
      } catch {
        if (!cancelled) setState(s => ({ ...s, projectsLoading: false }))
      }
    })()

    // ── World Model graph ──────────────────────────────────────
    void (async () => {
      try {
        const [nodes, edges] = await Promise.all([graphService.getAllNodes(), graphService.getConfirmedEdges()])
        if (!cancelled) setState(s => ({ ...s, nodeCount: nodes.length, edgeCount: edges.length, graphLoading: false }))
      } catch {
        if (!cancelled) setState(s => ({ ...s, graphLoading: false }))
      }
    })()

    // ── Local models ───────────────────────────────────────────
    void (async () => {
      try {
        const names = await ollamaService.listModels()
        if (!cancelled) setState(s => ({ ...s, localModels: names, modelsLoading: false }))
      } catch {
        if (!cancelled) setState(s => ({ ...s, modelsLoading: false }))
      }
    })()

    // ── Project-brain vaults ───────────────────────────────────
    void (async () => {
      try {
        const { projectBrainService } = await import('../../../services/ProjectBrainService')
        const entries = await projectBrainService.listGraphs()
        if (!cancelled) setState(s => ({ ...s, brainEntries: entries, brainLoading: false }))
      } catch {
        if (!cancelled) setState(s => ({ ...s, brainLoading: false }))
      }
    })()

    // ── Memory / embeddings ────────────────────────────────────
    void (async () => {
      try {
        const { MemoryStore } = await import('../../memory/MemoryStore')
        const stats = await new MemoryStore().stats()
        if (!cancelled) setState(s => ({ ...s, memTotal: stats.total, memConfirmed: stats.confirmed, memLoading: false }))
      } catch {
        if (!cancelled) setState(s => ({ ...s, memLoading: false }))
      }
    })()

    return () => { cancelled = true }
  }, [])

  const totalBrainNodes = state.brainEntries.reduce((acc, e) => acc + e.nodeCount, 0)

  return (
    <ScreenShell title="Datasets" subtitle="Everything Piku knows — the master store of live counts across all stores.">
      <div className="grid grid-cols-12 gap-4">

        {/* ── 01 Projects ── */}
        <HudPanel className="col-span-12 lg:col-span-6" label="Projects" code="01"
          action={<HudChip dim={state.projectsLoading}>{state.projectsLoading ? 'loading' : `${state.projectCount} projects`}</HudChip>}>
          <div className="flex items-start gap-3 mb-3">
            <Glyph>▤</Glyph>
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] text-white/90">ProjectStore — IndexedDB</div>
              <div className="font-hud text-[9.5px] uppercase tracking-wider text-white/35 mt-0.5">
                {state.projectsLoading ? 'querying…' : state.projectCount === 0 ? 'empty — no projects yet' : `${state.projectCount} tracked · IndexedDB · local`}
              </div>
            </div>
          </div>
          {!state.projectsLoading && state.projectNames.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {state.projectNames.slice(0, 5).map(name => (
                <div key={name} className="flex items-center gap-2 px-2.5 py-1.5" style={{ ...chamfer(6), background: 'rgba(255,255,255,0.02)' }}>
                  <span className="text-[11.5px] text-white/70 truncate">{name}</span>
                </div>
              ))}
              {state.projectNames.length > 5 && (
                <div className="font-hud text-[9px] uppercase tracking-[0.15em] text-white/25 pl-1">+{state.projectNames.length - 5} more</div>
              )}
            </div>
          )}
          <div className="font-hud text-[9.5px] uppercase tracking-[0.18em] text-cyan-300/40 mt-3">
            Source: projectService.getAllProjects() → ProjectStore (IDB)
          </div>
        </HudPanel>

        {/* ── 02 World Model graph ── */}
        <HudPanel className="col-span-12 lg:col-span-6" label="World Model — Knowledge Graph" code="02"
          action={<HudChip dim={state.graphLoading}>{state.graphLoading ? 'loading' : `${state.nodeCount}N · ${state.edgeCount}E`}</HudChip>}>
          <div className="flex items-start gap-3">
            <Glyph>✦</Glyph>
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] text-white/90">GraphService — IndexedDB</div>
              <div className="font-hud text-[9.5px] uppercase tracking-wider text-white/35 mt-0.5">
                {state.graphLoading
                  ? 'querying…'
                  : state.nodeCount === 0
                    ? 'empty — graph grows as Piku learns'
                    : `${state.nodeCount} nodes · ${state.edgeCount} confirmed edges`}
              </div>
            </div>
          </div>
          <div className="font-hud text-[9.5px] uppercase tracking-[0.18em] text-cyan-300/40 mt-3">
            Source: graphService.getAllNodes() + getConfirmedEdges() → GraphStore (IDB)
          </div>
        </HudPanel>

        {/* ── 03 Models ── */}
        <HudPanel className="col-span-12 lg:col-span-6" label="Models" code="03"
          action={<HudChip dim={state.modelsLoading}>{state.modelsLoading ? 'loading' : `${state.localModels.length} local`}</HudChip>}>
          <div className="flex flex-col gap-2">
            {/* opencode brain — always shown, static descriptor */}
            <div className="flex items-center gap-3 px-3 py-2.5" style={{ ...chamfer(8), background: 'rgba(217,70,239,0.06)', boxShadow: 'inset 0 0 0 1px rgba(217,70,239,0.18)' }}>
              <Glyph accent="violet">⌘</Glyph>
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] text-fuchsia-100/90 truncate">{OPENCODE_MODEL.modelID}</div>
                <div className="font-hud text-[9.5px] uppercase tracking-wider text-fuchsia-200/35 mt-0.5">opencode · deep reasoning · free cloud</div>
              </div>
              <HudChip accent="violet">brain</HudChip>
            </div>
            {/* live local models from Ollama */}
            {state.modelsLoading
              ? <div className="font-hud text-[10px] uppercase tracking-[0.15em] text-white/30 py-1">scanning ollama…</div>
              : state.localModels.length === 0
                ? <div className="font-hud text-[10px] uppercase tracking-[0.15em] text-white/25 py-1">ollama offline or no models pulled</div>
                : state.localModels.map(name => {
                    const m = modelMeta(name)
                    return (
                      <div key={name} className="flex items-center gap-3 px-3 py-2.5" style={{ ...chamfer(8), background: 'rgba(255,255,255,0.025)' }}>
                        <Glyph>{m.glyph}</Glyph>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13.5px] text-white/90 truncate">{name}</div>
                          <div className="font-hud text-[9.5px] uppercase tracking-wider text-white/35 mt-0.5">{m.kind} · local · private</div>
                        </div>
                        <HudChip dim>ollama</HudChip>
                      </div>
                    )
                  })}
          </div>
          <div className="font-hud text-[9.5px] uppercase tracking-[0.18em] text-cyan-300/40 mt-3">
            Source: ollamaService.listModels() + OPENCODE_MODEL (static)
          </div>
        </HudPanel>

        {/* ── 04 Project-brain vaults ── */}
        <HudPanel className="col-span-12 lg:col-span-6" label="Project-Brain Vaults" code="04"
          action={<HudChip dim={state.brainLoading}>{state.brainLoading ? 'loading' : `${state.brainEntries.length} brains · ${totalBrainNodes} nodes`}</HudChip>}>
          <div className="flex items-start gap-3 mb-3">
            <Glyph>◈</Glyph>
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] text-white/90">Piku-Vault — filesystem</div>
              <div className="font-hud text-[9.5px] uppercase tracking-wider text-white/35 mt-0.5">
                {state.brainLoading
                  ? 'scanning vault…'
                  : state.brainEntries.length === 0
                    ? 'empty — brains created per project / brainstorm / execute session'
                    : `${state.brainEntries.length} saved brains · ${totalBrainNodes} graph nodes total`}
              </div>
            </div>
          </div>
          {!state.brainLoading && state.brainEntries.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {state.brainEntries.slice(0, 5).map(e => (
                <div key={`${e.category}/${e.slug}`} className="flex items-center gap-2 px-2.5 py-1.5" style={{ ...chamfer(6), background: 'rgba(255,255,255,0.02)' }}>
                  <span className="font-hud text-[8.5px] uppercase tracking-wider text-white/30 w-20 shrink-0">{e.category}</span>
                  <span className="text-[11.5px] text-white/70 flex-1 truncate">{e.slug}</span>
                  <span className="font-hud text-[9px] text-cyan-300/50 tabular-nums shrink-0">{e.nodeCount}N</span>
                </div>
              ))}
              {state.brainEntries.length > 5 && (
                <div className="font-hud text-[9px] uppercase tracking-[0.15em] text-white/25 pl-1">+{state.brainEntries.length - 5} more</div>
              )}
            </div>
          )}
          <div className="font-hud text-[9.5px] uppercase tracking-[0.18em] text-cyan-300/40 mt-3">
            Source: projectBrainService.listGraphs() → ~/Documents/Piku-Vault/
          </div>
        </HudPanel>

        {/* ── 05 Memory / Embeddings ── */}
        <HudPanel className="col-span-12 lg:col-span-6" label="Memory — Extracted Facts" code="05"
          action={<HudChip dim={state.memLoading}>{state.memLoading ? 'loading' : `${state.memTotal} total`}</HudChip>}>
          <div className="flex items-start gap-3">
            <Glyph>≈</Glyph>
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] text-white/90">MemoryStore — IndexedDB</div>
              <div className="font-hud text-[9.5px] uppercase tracking-wider text-white/35 mt-0.5">
                {state.memLoading
                  ? 'querying…'
                  : state.memTotal === 0
                    ? 'empty — facts extracted from conversations over time'
                    : `${state.memTotal} memories · ${state.memConfirmed} confirmed · embedded`}
              </div>
            </div>
          </div>
          <div className="font-hud text-[9.5px] uppercase tracking-[0.18em] text-cyan-300/40 mt-3">
            Source: MemoryStore.stats() → IDB 'memories' store
          </div>
        </HudPanel>

        {/* ── 06 Piku source — static descriptor ── */}
        <HudPanel className="col-span-12 lg:col-span-6" label="Piku Source" code="06"
          action={<HudChip dim>static</HudChip>}>
          <div className="flex items-start gap-3">
            <Glyph>⌥</Glyph>
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] text-white/90">Tauri v2 + React/TS + Rust</div>
              <div className="font-hud text-[9.5px] uppercase tracking-wider text-white/35 mt-0.5">
                ~/piku · branch glm-piku · not yet live-indexed
              </div>
            </div>
          </div>
          <div className="font-hud text-[9.5px] uppercase tracking-[0.18em] text-white/25 mt-3">
            Live source indexing (chunker → graph → retrieval) is to-build — see build status below.
          </div>
        </HudPanel>

      </div>

      <BuildStatus items={[
        { label: 'Projects — projectService.getAllProjects()', state: 'built' },
        { label: 'World Model graph — nodes + confirmed edges', state: 'built' },
        { label: 'Local models — ollamaService.listModels()', state: 'built' },
        { label: 'opencode brain model — OPENCODE_MODEL', state: 'built' },
        { label: 'Project-brain vaults — projectBrainService.listGraphs()', state: 'built' },
        { label: 'Memory / embeddings — MemoryStore.stats()', state: 'built' },
        { label: 'DocumentAbsorptionService — drag-drop ingestion', state: 'planned' },
        { label: 'DocumentChunker + EntityExtractor pipeline', state: 'planned' },
        { label: 'PDF / folder watchers', state: 'planned' },
        { label: 'Piku source — live code indexing', state: 'planned' },
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

/* ───────────────────────── Git Identity switcher ───────────────────────── */

const PERSONAL_EMAIL_KEY = 'personal@example.com'
const WORK_EMAIL_KEY     = 'work@example.com'

function GitIdentityCard() {
  const [name, setName]   = useState<string>('')
  const [email, setEmail] = useState<string>('')
  const [busy, setBusy]   = useState(false)
  const [err, setErr]     = useState('')

  const refresh = async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const [n, e] = await invoke<[string, string]>('git_identity_get')
      setName(n); setEmail(e)
    } catch { /* not in Tauri */ }
  }

  useEffect(() => { void refresh() }, [])

  const switchTo = async (which: 'personal' | 'work') => {
    setBusy(true); setErr('')
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const [n, e] = await invoke<[string, string]>('git_identity_set', { which })
      setName(n); setEmail(e)
    } catch (ex) { setErr(String(ex instanceof Error ? ex.message : ex)) }
    finally { setBusy(false) }
  }

  const isPersonal = email === PERSONAL_EMAIL_KEY
  const isWork     = email === WORK_EMAIL_KEY
  const tone       = isPersonal ? 'cyan' : isWork ? 'violet' : undefined

  return (
    <HudPanel label="Git identity" code="GIT" accent={tone === 'violet' ? 'violet' : undefined}
      action={<HudChip accent={tone === 'violet' ? 'violet' : undefined} dim={!isPersonal && !isWork}>
        {isPersonal ? 'personal' : isWork ? 'work' : name ? 'custom' : 'unset'}
      </HudChip>}>
      {/* Current identity display */}
      <div className="flex items-center gap-3 mb-3">
        <Glyph accent={tone === 'violet' ? 'violet' : 'cyan'}>⎇</Glyph>
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] text-white/90 truncate">{name || <span className="text-white/35">—</span>}</div>
          <div className="font-hud text-[9.5px] uppercase tracking-wider text-white/35 mt-0.5 truncate">{email || 'not set'}</div>
        </div>
      </div>

      {/* Toggle buttons */}
      <div className="flex gap-2">
        <button
          disabled={busy}
          onClick={() => void switchTo('personal')}
          className="flex-1 font-hud text-[10px] uppercase tracking-[0.18em] py-2 transition-colors disabled:opacity-40"
          style={{
            ...chamfer(7),
            background: isPersonal ? 'rgba(34,211,238,0.15)' : 'rgba(34,211,238,0.06)',
            boxShadow: `inset 0 0 0 1px ${isPersonal ? 'rgba(34,211,238,0.45)' : 'rgba(34,211,238,0.2)'}`,
            color: isPersonal ? '#a5f3fc' : 'rgba(165,243,252,0.5)',
          }}>
          Personal<br />
          <span className="text-[8.5px] normal-case tracking-normal opacity-60">jaskiring</span>
        </button>
        <button
          disabled={busy}
          onClick={() => void switchTo('work')}
          className="flex-1 font-hud text-[10px] uppercase tracking-[0.18em] py-2 transition-colors disabled:opacity-40"
          style={{
            ...chamfer(7),
            background: isWork ? 'rgba(217,70,239,0.15)' : 'rgba(217,70,239,0.06)',
            boxShadow: `inset 0 0 0 1px ${isWork ? 'rgba(217,70,239,0.45)' : 'rgba(217,70,239,0.2)'}`,
            color: isWork ? '#f0abfc' : 'rgba(240,171,252,0.5)',
          }}>
          Work<br />
          <span className="text-[8.5px] normal-case tracking-normal opacity-60">work-user</span>
        </button>
      </div>

      {err && <div className="font-hud text-[9px] text-red-400/70 mt-2 truncate">{err}</div>}
      {busy && <div className="font-hud text-[9px] text-white/30 mt-2 uppercase tracking-[0.15em]">applying…</div>}
      <div className="font-hud text-[9.5px] uppercase tracking-[0.18em] text-white/25 mt-3">
        Sets global <span className="text-white/45">user.name</span> &amp; <span className="text-white/45">user.email</span> — affects all repos on this machine
      </div>
    </HudPanel>
  )
}

// Default URLs for productivity tools — opens in the logged-in Piku Chrome profile so the user
// lands already authenticated. Use the Atlassian / Notion root; they redirect to the right workspace.
const WORK_TOOL_URLS = {
  jira:       'https://www.atlassian.com/software/jira',
  confluence: 'https://www.atlassian.com/software/confluence',
  notion:     'https://www.notion.so',
} as const

async function openInPikuChrome(url: string): Promise<void> {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('open_in_piku_chrome', { url })
  } catch { /* not running inside the desktop app */ }
}

interface WorkToolCardProps {
  glyph: string
  name: string
  kind: string
  blurb: string
  url: string
  className?: string
}

function WorkToolCard({ glyph, name, kind, blurb, url, className }: WorkToolCardProps) {
  return (
    <HudPanel label={name} className={className}>
      <div className="flex items-start gap-3 mb-3">
        <Glyph>{glyph}</Glyph>
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] text-white/90">{name}</div>
          <div className="font-hud text-[9.5px] uppercase tracking-wider text-white/35 mt-0.5">{kind}</div>
        </div>
      </div>
      <div className="text-[12px] text-white/55 leading-relaxed mb-3">{blurb}</div>
      <button
        onClick={() => void openInPikuChrome(url)}
        className="w-full font-hud text-[10px] uppercase tracking-[0.18em] text-cyan-100 bg-cyan-500/12 hover:bg-cyan-500/20 py-2.5 transition-colors"
        style={{ ...chamfer(8), boxShadow: 'inset 0 0 0 1px rgba(34,211,238,0.3)' }}>
        Open in Piku ↗
      </button>
      <div className="font-hud text-[9px] uppercase tracking-[0.14em] text-white/20 mt-2">
        Opens in Piku's Chrome profile — you're already signed in
      </div>
    </HudPanel>
  )
}

export function WorkScreen() {
  return (
    <ScreenShell title="Work" subtitle="Your coding & productivity world — commits, tickets, docs, terminal, all in one place.">
      <div className="grid grid-cols-12 gap-4">
        {/* Git identity switch — prominent at the top */}
        <div className="col-span-12 lg:col-span-6"><GitIdentityCard /></div>
        <Card title="Terminal" className="col-span-12 lg:col-span-6">
          <Hint>Embedded PTY terminal — push / pull without leaving Piku. Coming next.</Hint>
        </Card>
        <div className="col-span-12"><CodingWidget /></div>

        {/* Productivity tools — open real tools in Piku's Chrome profile */}
        <WorkToolCard
          className="col-span-12 md:col-span-4"
          glyph="◧"
          name="Jira"
          kind="Atlassian · project tracking"
          blurb="Tickets, sprints, and backlog — open your logged-in Jira workspace inside the Piku Chrome profile."
          url={WORK_TOOL_URLS.jira}
        />
        <WorkToolCard
          className="col-span-12 md:col-span-4"
          glyph="▦"
          name="Confluence"
          kind="Atlassian · docs & specs"
          blurb="Team wiki and project specs — open your logged-in Confluence space inside the Piku Chrome profile."
          url={WORK_TOOL_URLS.confluence}
        />
        <WorkToolCard
          className="col-span-12 md:col-span-4"
          glyph="◫"
          name="Notion"
          kind="Notion · notes & brainstorm"
          blurb="Notes, databases, and brainstorming — open your logged-in Notion workspace inside the Piku Chrome profile."
          url={WORK_TOOL_URLS.notion}
        />
      </div>
      <BuildStatus items={[
        { label: 'GitHub commits (live, both accounts)', state: 'built' },
        { label: 'Git identity switch (one-click global)', state: 'built' },
        { label: 'Jira — open in Piku Chrome', state: 'built' },
        { label: 'Confluence — open in Piku Chrome', state: 'built' },
        { label: 'Notion — open in Piku Chrome', state: 'built' },
        { label: 'Embedded PTY terminal + git push', state: 'planned' },
        { label: 'In-frame Jira / Confluence / Notion embed', state: 'planned' },
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
  const [entries, setEntries] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const result = await invoke<string[]>('list_dir', { path: '' })
        if (!cancelled) setEntries(result)
      } catch { /* not in Tauri or command unavailable */ }
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])
  return (
    <ScreenShell title="Files" subtitle="Live from your home directory via list_dir.">
      <Card className="col-span-12" bodyClass="!p-0">
        {loading ? (
          <div className="px-4 py-6 text-center">
            <span className="font-hud text-[10px] uppercase tracking-[0.18em] text-white/30">Scanning home directory…</span>
          </div>
        ) : entries.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <span className="font-hud text-[10px] uppercase tracking-[0.18em] text-white/30">No entries found.</span>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {entries.map(f => (
              <div key={f} className="flex items-center gap-3 px-4 py-2.5">
                <span className="text-white/40 w-5 text-center">{f.endsWith('/') ? '▸' : '·'}</span>
                <span className="text-sm text-white/80 flex-1 font-mono">{f}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
      <BuildStatus items={[
        { label: 'list_dir (home) — built', state: 'built' },
        { label: 'Runtime vault (piku-vault/)', state: 'planned' },
        { label: 'File browser + preview', state: 'planned' },
        { label: 'Vault capture (2.5-V)', state: 'planned' },
      ]} />
    </ScreenShell>
  )
}

/* ───────────────────────── Calendar ───────────────────────── */

const CAL_WORK_EMAIL    = 'work@example.com'
const CAL_PERSONAL_EMAIL = 'personal@example.com'

type CalAccountTag = 'work' | 'personal' | 'other'
interface TaggedCalendarEvent extends CalendarEvent {
  _accountTag: CalAccountTag
  _accountEmail: string
}
type CalFilter = 'all' | 'work' | 'personal'

function tagForEmail(email: string | undefined): CalAccountTag {
  const e = (email ?? '').toLowerCase()
  if (e === CAL_WORK_EMAIL) return 'work'
  if (e === CAL_PERSONAL_EMAIL) return 'personal'
  return 'other'
}

export function CalendarScreen() {
  const [connecting, setConnecting] = useState(false)
  const [calAccts, setCalAccts] = useState<ServiceAccount[]>([])
  const [taggedEvents, setTaggedEvents] = useState<TaggedCalendarEvent[] | null>(null)
  const [loadingCal, setLoadingCal] = useState(false)
  const [filter, setFilter] = useState<CalFilter>('all')
  // Accounts that returned a calendar API error (needs reconnect with calendar scope)
  const [authErrors, setAuthErrors] = useState<{ acct: ServiceAccount; code: number }[]>([])

  // Merge 'calendar'-service accounts with 'email'-service accounts (Gmail OAuth tokens carry
  // calendar.readonly scope from the same consent). Dedupe by email so an account connected via
  // both paths appears only once (prefer the 'calendar'-service entry).
  const mergeCalendarAccounts = async (): Promise<ServiceAccount[]> => {
    const [calRows, emailRows] = await Promise.all([
      accountService.getByService('calendar'),
      accountService.getByService('email'),
    ])
    const active = (rows: ServiceAccount[]) => rows.filter(a => a.enabled && a.token)
    const seen = new Map<string, ServiceAccount>()  // email → account, prefer 'calendar'-service
    for (const a of [...active(calRows), ...active(emailRows)]) {
      const key = (a.email ?? a.id).toLowerCase()
      if (!seen.has(key)) seen.set(key, a)   // first-wins: calRows iterated first
    }
    return [...seen.values()]
  }

  // Load accounts + fetch events per account (with 9s timeout each)
  const loadAll = async (force = false) => {
    try {
      const accts = await mergeCalendarAccounts()
      setCalAccts(accts)
      if (!accts.length) return
      if (!force && taggedEvents !== null) return   // already loaded
      setLoadingCal(true)
      const { calendarConnector, CalendarApiError } = await import('../../../services/accounts')
      const now = new Date()
      const horizon = new Date(now.getTime() + 14 * 864e5)
      const allTagged: TaggedCalendarEvent[] = []
      const newAuthErrors: { acct: ServiceAccount; code: number }[] = []
      await Promise.allSettled(accts.map(async acct => {
        try {
          const evs = await Promise.race([
            calendarConnector.list(acct, now.toISOString(), horizon.toISOString(), 20),
            new Promise<CalendarEvent[]>((_, rej) => setTimeout(() => rej(new Error('timeout')), 9000)),
          ])
          const tag = tagForEmail(acct.email)
          for (const ev of evs) {
            allTagged.push({ ...ev, _accountTag: tag, _accountEmail: acct.email ?? acct.label })
          }
        } catch (err) {
          // Surface auth errors so the UI can show an actionable reconnect row.
          if (err instanceof CalendarApiError) {
            newAuthErrors.push({ acct, code: err.code })
          }
          // timeout or other network error — skip silently
        }
      }))
      setAuthErrors(newAuthErrors)
      // Sort by start, then dedupe (same title + same start minute across accounts)
      allTagged.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
      const seen = new Set<string>()
      const deduped = allTagged.filter(ev => {
        const key = `${ev.title}::${ev.start.slice(0, 16)}`
        if (seen.has(key)) return false
        seen.add(key); return true
      })
      setTaggedEvents(deduped)
    } catch { /* ignore */ }
    finally { setLoadingCal(false) }
  }

  useEffect(() => { void loadAll() }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // Persist a fresh Google token back onto a specific account record (by id).
  // If the account is service='email' it stays service='email'; if service='calendar' it stays that.
  // Also upserts a matching 'calendar'-service row so CalendarConnector can always find it.
  const persistGoogleToken = async (t: GoogleTokens) => {
    const lbl = t.email ? t.email.split('@')[0] : 'Calendar'
    // Search BOTH 'email' and 'calendar' service rows for a matching email.
    const [calRows, emailRows] = await Promise.all([
      accountService.getByService('calendar'),
      accountService.getByService('email'),
    ])
    const emailLower = (t.email ?? '').toLowerCase()
    const matchingCal   = calRows.find(a => a.email && a.email.toLowerCase() === emailLower)
    const matchingEmail = emailRows.find(a => a.email && a.email.toLowerCase() === emailLower)

    // Update the existing 'calendar'-service row (or create a new one).
    if (matchingCal) {
      await accountService.save({
        ...matchingCal, label: lbl, token: t.accessToken,
        refreshToken: t.refreshToken ?? matchingCal.refreshToken,
        tokenExpiresAt: t.expiresAt,
      })
    } else {
      const acc = await accountService.create('calendar', lbl, t.accessToken, { email: t.email })
      await accountService.save({ ...acc, refreshToken: t.refreshToken, tokenExpiresAt: t.expiresAt })
    }

    // Also update the 'email'-service row so Gmail keeps working with the new token.
    if (matchingEmail) {
      await accountService.save({
        ...matchingEmail, token: t.accessToken,
        refreshToken: t.refreshToken ?? matchingEmail.refreshToken,
        tokenExpiresAt: t.expiresAt,
      })
    }
  }

  const connect = async () => {
    setConnecting(true)
    try {
      const t = await connectGoogle()
      await persistGoogleToken(t)
      void connectorFeed.refresh(true)
      await loadAll(true)
    } catch { /* user cancelled or error */ }
    finally { setConnecting(false) }
  }

  // Targeted reconnect for a specific account that failed with a 401/403 (missing calendar scope).
  // Runs the full OAuth consent flow (prompt=consent already set in googleOAuth.ts) so Google
  // re-shows the consent screen and the resulting token carries the calendar.readonly scope.
  // After the new token is obtained it is written back onto the EXACT account record that errored
  // (matched by email across both 'email' and 'calendar' service rows) so the next fetch uses it.
  const reconnect = async (acct: ServiceAccount) => {
    setConnecting(true)
    try {
      const t = await connectGoogle()
      await persistGoogleToken(t)
      // Clear the error for this account immediately so the UI stops showing the warning.
      setAuthErrors(prev => prev.filter(e => e.acct.id !== acct.id))
      void connectorFeed.refresh(true)
      await loadAll(true)
    } catch { /* user cancelled */ }
    finally { setConnecting(false) }
  }

  const openGmail = async (email: string) => {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('open_in_piku_chrome', { url: `https://mail.google.com/mail/u/?authuser=${email}` })
    } catch { /* not in desktop app */ }
  }

  const visibleEvents = (taggedEvents ?? []).filter(ev =>
    filter === 'all' || ev._accountTag === filter
  )

  const byDay = new Map<string, { dateLabel: string; items: TaggedCalendarEvent[] }>()
  for (const e of visibleEvents) {
    const d = new Date(e.start)
    const key = d.toDateString()
    const dateLabel = d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
    if (!byDay.has(key)) byDay.set(key, { dateLabel, items: [] })
    byDay.get(key)!.items.push(e)
  }

  const hasWork     = calAccts.some(a => tagForEmail(a.email) === 'work')
  const hasPersonal = calAccts.some(a => tagForEmail(a.email) === 'personal')

  // Account filter + email peek toggle bar
  const FilterBar = () => (
    <div className="flex items-center gap-2 mb-4">
      {(['all', 'work', 'personal'] as CalFilter[]).map(f => (
        <button key={f} onClick={() => setFilter(f)}
          className="font-hud text-[10px] uppercase tracking-[0.16em] px-3 py-1.5 transition-colors"
          style={filter === f ? {
            ...chamfer(6),
            background: f === 'personal' ? 'rgba(217,70,239,0.14)' : 'rgba(34,211,238,0.14)',
            boxShadow: `inset 0 0 0 1px ${f === 'personal' ? 'rgba(217,70,239,0.4)' : 'rgba(34,211,238,0.4)'}`,
            color: f === 'personal' ? '#e879f9' : '#67e8f9',
          } : { color: 'rgba(255,255,255,0.35)' }}>
          {f}
        </button>
      ))}
      <span className="flex-1" />
      {/* Email peek buttons — open Gmail for each account */}
      {hasWork && (
        <button onClick={() => void openGmail(CAL_WORK_EMAIL)}
          className="font-hud text-[9.5px] uppercase tracking-wider px-2.5 py-1 transition-colors hover:brightness-125"
          style={{ ...chamfer(5), color: 'rgba(34,211,238,0.75)', boxShadow: 'inset 0 0 0 1px rgba(34,211,238,0.3)' }}
          title={`Open Gmail for ${CAL_WORK_EMAIL}`}>
          work mail ↗
        </button>
      )}
      {hasPersonal && (
        <button onClick={() => void openGmail(CAL_PERSONAL_EMAIL)}
          className="font-hud text-[9.5px] uppercase tracking-wider px-2.5 py-1 transition-colors hover:brightness-125"
          style={{ ...chamfer(5), color: 'rgba(217,70,239,0.75)', boxShadow: 'inset 0 0 0 1px rgba(217,70,239,0.3)' }}
          title={`Open Gmail for ${CAL_PERSONAL_EMAIL}`}>
          personal mail ↗
        </button>
      )}
    </div>
  )

  return (
    <ScreenShell title="Calendar" subtitle="Your upcoming Google Calendar events — pulled live from all connected accounts.">
      {calAccts.length === 0 ? (
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
      ) : (
        <Card className="col-span-12" title="Upcoming" action={
          <button onClick={connect} disabled={connecting} className="font-hud text-[10px] uppercase tracking-wider text-cyan-300/60 hover:text-cyan-200 disabled:opacity-40">+ Add account</button>
        }>
          <FilterBar />
          {/* Auth-error rows — shown when an account returned 401/403 (missing calendar scope) */}
          {authErrors.map(({ acct, code }) => (
            <div key={acct.id} className="flex items-center gap-3 mb-3 px-3 py-2.5"
              style={{ ...chamfer(8), background: 'rgba(251,191,36,0.06)', boxShadow: 'inset 0 0 0 1px rgba(251,191,36,0.25)' }}>
              <span className="text-amber-300/80 text-[14px] shrink-0">⚠</span>
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] text-amber-100/80 truncate">{acct.email ?? acct.label}</div>
                <div className="font-hud text-[9.5px] uppercase tracking-wider text-amber-300/55 mt-0.5">
                  {code === 401 || code === 403
                    ? 'Calendar access not granted — reconnect to add the Calendar scope'
                    : `Calendar fetch failed (${code}) — reconnect to retry`}
                </div>
              </div>
              <button onClick={() => void reconnect(acct)} disabled={connecting}
                className="font-hud text-[9.5px] uppercase tracking-[0.15em] text-amber-200 hover:text-amber-100 px-2.5 py-1.5 transition-colors shrink-0 disabled:opacity-40"
                style={{ ...chamfer(6), boxShadow: 'inset 0 0 0 1px rgba(251,191,36,0.35)' }}>
                {connecting ? 'Connecting…' : 'Reconnect'}
              </button>
            </div>
          ))}
          {loadingCal && taggedEvents === null ? (
            <Hint>loading calendar…</Hint>
          ) : visibleEvents.length === 0 && authErrors.length === 0 ? (
            <Hint>Nothing scheduled in the next 14 days{filter !== 'all' ? ` for ${filter}` : ''}.</Hint>
          ) : visibleEvents.length === 0 ? null : (
            <div className="max-h-[520px] overflow-y-auto -mx-1 px-1">
              {[...byDay.values()].map(group => (
                <div key={group.dateLabel} className="mb-4 last:mb-0">
                  <div className="font-hud text-[9.5px] uppercase tracking-wider text-cyan-300/50 sticky top-0 bg-[#0a1120]/80 backdrop-blur-sm py-1.5 z-10">{group.dateLabel}</div>
                  {group.items.map(e => {
                    const isAllDay = !e.start.includes('T')
                    const when = isAllDay ? 'all day' : new Date(e.start).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
                    const end  = isAllDay ? '' : new Date(e.end).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
                    const dotColor = e._accountTag === 'personal' ? 'rgb(217,70,239)' : e._accountTag === 'work' ? 'rgb(34,211,238)' : 'rgb(148,163,184)'
                    const dotGlow  = e._accountTag === 'personal' ? 'rgba(217,70,239,0.6)' : e._accountTag === 'work' ? 'rgba(34,211,238,0.6)' : 'rgba(148,163,184,0.3)'
                    return (
                      <div key={`${e.id}::${e._accountTag}`} className="flex items-start gap-3 py-2 border-b border-white/5 last:border-0">
                        {/* account dot */}
                        <span className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ background: dotColor, boxShadow: `0 0 5px ${dotGlow}` }} title={e._accountTag} />
                        <div className="font-hud text-[11px] text-cyan-200/70 w-[4.5rem] shrink-0 pt-0.5 tabular-nums leading-tight">
                          {when}{!isAllDay && end && end !== when ? `–${end}` : ''}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] text-white/85 leading-snug">{e.title}</div>
                          {e.location && <div className="text-[11px] text-white/40 truncate mt-0.5">{e.location}</div>}
                          {e.attendees && e.attendees.length > 0 && <div className="text-[10px] text-white/30 truncate mt-0.5">{e.attendees.slice(0, 4).join(', ')}</div>}
                          {e.meetLink && <a href={e.meetLink} target="_blank" rel="noreferrer" className="text-[10px] text-cyan-300/60 hover:text-cyan-200 mt-0.5 block">Join meeting ↗</a>}
                        </div>
                        {/* account chip */}
                        <span className="font-hud text-[8.5px] uppercase tracking-wider shrink-0 px-1.5 py-0.5 mt-0.5"
                          style={{ ...chamfer(4), color: dotColor, boxShadow: `inset 0 0 0 1px ${dotGlow}`, opacity: 0.85 }}>
                          {e._accountTag}
                        </span>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
      <BuildStatus items={[
        { label: 'Google Calendar (read-only, OAuth)', state: 'built' },
        { label: 'Multi-account fetch + merge + dedupe', state: 'built' },
        { label: 'Account filter (All / Work / Personal)', state: 'built' },
        { label: 'Calendar → World Model graph', state: 'planned' },
      ]} />
    </ScreenShell>
  )
}

/* ───────────────────────── People ───────────────────────── */
const MOCK_PEOPLE = [
  { n: 'Jaskirat Singh', r: 'Owner · solo developer', seen: 'now' },
  { n: 'Salescode team', r: 'Org context',            seen: 'this week' },
]
export function PeopleScreen() {
  const [realPeople, setRealPeople] = useState<{ name: string }[] | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const nodes = await graphService.getAllNodes()
        if (!cancelled) setRealPeople(nodes.filter(n => n.type === 'person').map(n => ({ name: n.name })))
      } catch { /* graph unavailable — realPeople stays null */ }
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])
  const graphAvailable = realPeople !== null
  return (
    <ScreenShell title="People" subtitle="Person-entities Piku knows about, drawn from the World Model graph.">
      <div className="grid grid-cols-12 gap-4">
        {loading ? (
          <div className="col-span-12 text-center py-8">
            <span className="font-hud text-[10px] uppercase tracking-[0.18em] text-white/30">Querying graph…</span>
          </div>
        ) : graphAvailable && realPeople.length === 0 ? (
          <div className="col-span-12">
            <HudPanel accent="amber">
              <div className="text-center py-4">
                <div className="font-hud text-[10px] uppercase tracking-[0.18em] text-amber-200/60">No people yet</div>
                <p className="text-[12.5px] text-white/45 mt-1.5">Piku adds them as it learns about your world.</p>
              </div>
            </HudPanel>
          </div>
        ) : (
          (graphAvailable ? realPeople : MOCK_PEOPLE.map(m => ({ name: m.n, r: m.r, seen: m.seen }))).map(p => (
            <Card key={p.name} className="col-span-12 md:col-span-6 lg:col-span-4">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-full bg-cyan-400/15 border border-cyan-400/25 flex items-center justify-center text-cyan-200">◍</span>
                <div className="flex-1 min-w-0"><div className="text-sm text-white/90 truncate">{p.name}</div>
                  {'r' in p && <div className="text-[10px] text-white/40">{(p as { r?: string }).r}</div>}
                </div>
                {'seen' in p && <span className="text-[10px] text-white/30">{(p as { seen?: string }).seen}</span>}
              </div>
            </Card>
          ))
        )}
      </div>
      <HudPanel label="Build status" code="02" className="mt-6">
        <div className="flex flex-wrap gap-1.5">
          {([
            { label: 'WorldModelQueryService', state: 'planned' as const },
            { label: 'Graph person-entity type', state: 'built' as const },
            { label: 'People view → live graph query', state: 'built' as const },
            { label: 'Relationship timeline', state: 'planned' as const },
          ] as const).map(it => (
            <span key={it.label}
              className={`font-hud text-[9.5px] px-2.5 py-1 tracking-[0.12em] uppercase border ${
                it.state === 'built' ? 'text-cyan-300/80 bg-cyan-500/10 border-cyan-400/20'
                : 'text-cyan-200/75 bg-cyan-400/[0.07] border-cyan-300/20'
              }`}
              style={{ ...chamfer(6) }}>
              <span className="mr-1.5 opacity-60 text-[8px]">{it.state === 'built' ? '✓' : '○'}</span>
              {it.label}
            </span>
          ))}
        </div>
      </HudPanel>
    </ScreenShell>
  )
}

/* ───────────────────────── Settings ───────────────────────── */
import { isOpencodeBrain, setOpencodeBrain } from '../../../features/chat/hooks/useChat'
import { DB_VERSION } from '../../../features/memory/db'
import { accountService, gitHubConnector, gmailConnector, connectGoogle, googleConfigured, connectorFeed } from '../../../services/accounts'
import type { ServiceAccount, ServiceType, MailSummary, CalendarEvent, GoogleTokens } from '../../../services/accounts'
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
              <button onClick={() => { if (window.confirm('Remove this account?')) void accountService.delete(a.id).then(load) }} className="font-hud text-[10px] text-white/25 hover:text-red-300 shrink-0">remove</button>
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
        <button onClick={() => { if (window.confirm('Remove this account?')) onDelete() }} className="font-hud text-[9px] text-white/20 hover:text-red-400/60 uppercase tracking-[0.1em] transition-colors">✕</button>
      </div>
    </div>
  )
}

function AddAccountForm({ service, onAdded }: { service: ServiceType; onAdded: () => void }) {
  const [label, setLabel] = useState('')
  const [token, setToken] = useState('')
  const [username, setUsername] = useState('')
  const [adding, setAdding] = useState(false)
  const handleAdd = async () => {
    if (!label.trim() || !token.trim()) return
    setAdding(true)
    const opts = username.trim() ? { username: username.trim() } : undefined
    await accountService.create(service, label.trim(), token.trim(), opts)
    setLabel(''); setToken(''); setUsername(''); setAdding(false)
    onAdded()
  }
  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center gap-2">
        <input value={label} onChange={e => setLabel(e.target.value)} placeholder="label (e.g. Personal)" className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white/70 placeholder:text-white/20 outline-none font-hud" />
        <input value={token} onChange={e => setToken(e.target.value)} placeholder="token / API key" type="password" className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white/70 placeholder:text-white/20 outline-none font-hud" />
        <button onClick={handleAdd} disabled={adding || !label.trim() || !token.trim()} className="font-hud text-[10px] text-cyan-300/60 hover:text-cyan-200 border border-cyan-400/20 px-2.5 py-1 transition-colors disabled:opacity-30">add</button>
      </div>
      {service === 'github' && (
        <input value={username} onChange={e => setUsername(e.target.value)} placeholder="GitHub username" className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white/70 placeholder:text-white/20 outline-none font-hud" />
      )}
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
  const [localOnly, setLocalOnly] = useState(!isOpencodeBrain())
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
          <Row label="Chat model" value={ACTIVE_BRAIN.model} tone="run" />
          <Row label="Embedding model" value="nomic-embed-text" />
          <Row label="Tier-2 escalation" value="planned" />
        </Card>
        <Card title="Privacy" className="col-span-12 md:col-span-6">
          <div className="flex items-center justify-between py-2.5 border-b border-white/5">
            <span className="text-sm text-white/70">Local-only (private)</span>
            <button onClick={() => { const next = !localOnly; setLocalOnly(next); setOpencodeBrain(!next) }}
              className="relative w-9 h-5 rounded-full transition-colors"
              style={{ background: localOnly ? 'rgba(34,211,238,0.3)' : 'rgba(255,255,255,0.1)', boxShadow: `inset 0 0 0 1px ${localOnly ? 'rgba(34,211,238,0.4)' : 'rgba(255,255,255,0.15)'}` }}>
              <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform"
                style={{ transform: `translateX(${localOnly ? '16px' : '0'})`, background: localOnly ? '#22d3ee' : 'rgba(255,255,255,0.3)' }} />
            </button>
          </div>
          <Row label="Local Ollama" value="On-device · private" tone="run" />
          <Row label="Opencode brain" value={localOnly ? 'Off (local-only)' : `Free cloud · ${OPENCODE_MODEL.modelID}`} tone={localOnly ? 'idle' : 'run'} />
          <div className="font-hud text-[9.5px] uppercase tracking-[0.18em] text-white/30 mt-2 leading-relaxed">
            {localOnly ? 'All turns stay on your machine — fully private.' : 'Conversation routes to opencode\'s free cloud model (no API key). Data leaves the machine.'}
          </div>
        </Card>
        <Card title="Storage" className="col-span-12 md:col-span-6">
          <Row label="Database" value={`IndexedDB v${DB_VERSION}`} tone="run" />
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
      <HudPanel label="Build status" code="06" className="mt-6">
        <div className="flex flex-wrap gap-1.5">
          {([
            { label: 'OllamaService config', state: 'built' as const },
            { label: 'Multi-account service', state: 'built' as const },
            { label: 'GitHub connector', state: 'built' as const },
            { label: 'Email / WhatsApp connectors', state: 'planned' as const },
            { label: 'Settings persistence', state: 'planned' as const },
            { label: 'Identity Layer (pikuIdentity v8)', state: 'planned' as const },
          ] as const).map(it => (
            <span key={it.label}
              className={`font-hud text-[9.5px] px-2.5 py-1 tracking-[0.12em] uppercase border ${
                it.state === 'built' ? 'text-cyan-300/80 bg-cyan-500/10 border-cyan-400/20'
                : 'text-cyan-200/75 bg-cyan-400/[0.07] border-cyan-300/20'
              }`}
              style={{ ...chamfer(6) }}>
              <span className="mr-1.5 opacity-60 text-[8px]">{it.state === 'built' ? '✓' : '○'}</span>
              {it.label}
            </span>
          ))}
        </div>
      </HudPanel>
    </ScreenShell>
  )
}

/* ───────────────────────── Router map ───────────────────────── */
export const SCREENS: Partial<Record<NavKey, FC>> = {
  agent:       AgentScreen,
  models:      ModelsScreen,
  projects:    ProjectsScreen,
  datasets:    DatasetsScreen,
  apps:        CanvasScreen,
  work:        WorkScreen,
  files:       FilesScreen,
  calendar:    CalendarScreen,
  people:      PeopleScreen,
  playground:  PlaygroundScreen,
  automations: AutomationsScreen,
  settings:    SettingsScreen,
}
