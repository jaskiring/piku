import { useEffect, useState } from 'react'
import { Card } from './Card'
import type { NavKey } from './Sidebar'
import type { PresenceState } from '../../types'
import { Orb } from '../orb'
import { projectService } from '../projects/components/ProjectDashboard'
import { graphService } from '../graph'
import { ollamaService, ACTIVE_BRAIN } from '../../services/OllamaService'

interface Props {
  inputText:     string
  onInputChange: (t: string) => void
  isSending:     boolean
  onAsk:         () => void
  onNavigate:    (k: NavKey) => void
  presence:      PresenceState
}

function greeting(): string {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}
function dateline(): string {
  const d = new Date()
  return `${d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
}

interface Project { name: string; state: string }

export function Dashboard({ inputText, onInputChange, isSending, onAsk, onNavigate, presence }: Props) {
  const [projects, setProjects] = useState<Project[]>([])
  const [ollamaUp, setOllamaUp] = useState<boolean | null>(null)
  const [nodeCount, setNodeCount] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const all = await projectService.getAllProjects()
        if (!cancelled) setProjects(all.slice(0, 5).map(p => ({ name: p.name, state: p.currentState || 'Active' })))
      } catch { /* leave empty */ }
      try { const up = await ollamaService.isReachable(); if (!cancelled) setOllamaUp(up) } catch { if (!cancelled) setOllamaUp(false) }
      try { const nodes = await graphService.getAllNodes(); if (!cancelled) setNodeCount(nodes.length) } catch { /* skip */ }
    })()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="px-8 py-7 pb-28 max-w-[1200px] mx-auto">
      {/* Greeting */}
      <div className="text-center mb-5">
        <div className="text-xs text-white/40 mb-2">{dateline()}</div>
        <h1 className="text-3xl font-semibold tracking-tight text-white/95">
          {greeting()}, Jaskirat <span className="text-cyan-300">✦</span>
        </h1>
        <p className="text-white/45 mt-1">Ask, or let me get something done.</p>
      </div>

      {/* Ask bar */}
      <div className="max-w-2xl mx-auto mb-7">
        <div className="relative flex items-center gap-3 rounded-2xl bg-gradient-to-b from-white/[0.08] to-white/[0.02] backdrop-blur-2xl border border-white/12 ring-1 ring-inset ring-white/5 pl-4 pr-2.5 py-3 shadow-[0_18px_70px_-14px_rgba(0,0,0,0.9),0_0_60px_-22px_rgba(34,211,238,0.55)]">
          <span className="text-cyan-300 text-lg">✦</span>
          <input
            value={inputText}
            onChange={e => onInputChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && inputText.trim() && !isSending) { e.preventDefault(); onAsk() } }}
            placeholder="Ask piku anything…"
            className="flex-1 bg-transparent text-[15px] text-white/90 placeholder:text-white/35 outline-none"
          />
          <button onClick={() => { if (inputText.trim() && !isSending) onAsk() }}
            className="w-9 h-9 rounded-xl bg-cyan-500/20 text-cyan-200 flex items-center justify-center hover:bg-cyan-500/30 transition-colors">≋</button>
        </div>
      </div>

      {/* Real, useful surfaces only */}
      <div className="grid grid-cols-12 gap-4">
        {/* Agent entry */}
        <Card title="Agent" className="col-span-12 md:col-span-6">
          <p className="text-xs text-white/50 mb-3">Talk to Piku and have it act on your Mac — open apps, files, and links.</p>
          <button onClick={() => onNavigate('agent')}
            className="text-[12px] text-cyan-200 bg-cyan-500/12 hover:bg-cyan-500/20 border border-cyan-400/25 rounded-xl px-3 py-1.5 transition-colors">Open Agent →</button>
        </Card>

        {/* piku presence */}
        <Card className="col-span-12 md:col-span-6">
          <div className="flex items-center gap-4">
            <Orb presence={presence} size={84} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-white/85">piku</div>
              <p className="text-xs text-white/45 mt-0.5">Local-first companion that remembers, and builds a private model of your world.</p>
            </div>
          </div>
        </Card>

        {/* Projects (real) */}
        <Card title="Projects" action={projects.length > 0 ? <button onClick={() => onNavigate('projects')} className="text-[11px] text-cyan-300/60">View all →</button> : undefined} className="col-span-12 md:col-span-6 lg:col-span-4">
          {projects.length === 0 ? (
            <div className="text-xs text-white/35 leading-relaxed">No projects yet — they appear here as Piku learns about your work.</div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {projects.map(p => (
                <div key={p.name} className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-400/15 flex items-center justify-center text-cyan-300/70 text-xs shrink-0">▤</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-white/85 truncate">{p.name}</div>
                    <div className="text-[10px] text-white/35 truncate">{p.state}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Knowledge graph (real) */}
        <Card title="World Model" action={<button onClick={() => onNavigate('knowledge')} className="text-[11px] text-cyan-300/60">Open →</button>} className="col-span-12 md:col-span-6 lg:col-span-4">
          <MiniGraph />
          <div className="text-[11px] text-white/40 mt-1">{nodeCount === null ? 'Loading…' : `${nodeCount} nodes in the graph`}</div>
        </Card>

        {/* Real system status */}
        <Card title="System" className="col-span-12 lg:col-span-4">
          <div className="flex flex-col gap-2.5 pt-0.5 text-xs">
            <Row label="Ollama" value={ollamaUp === null ? 'checking…' : ollamaUp ? 'online' : 'offline'} ok={ollamaUp ?? undefined} />
            <Row label="Chat model" value={`${ACTIVE_BRAIN.model} · ${ACTIVE_BRAIN.where}`} ok />
            <Row label="Embeddings" value="nomic-embed-text" ok />
            <Row label="World Model" value={nodeCount === null ? '…' : `${nodeCount} nodes`} ok />
          </div>
        </Card>
      </div>
    </div>
  )
}

function Row({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-white/55 flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full ${ok === false ? 'bg-white/25' : 'bg-cyan-400'}`} />{label}
      </span>
      <span className={ok === false ? 'text-white/40' : 'text-cyan-300/80'}>{value}</span>
    </div>
  )
}

function MiniGraph() {
  const hub = { x: 60, y: 55 }
  const nodes = [
    { x: 95, y: 32 }, { x: 26, y: 28 }, { x: 20, y: 78 }, { x: 98, y: 86 }, { x: 54, y: 100 },
  ]
  return (
    <svg viewBox="0 0 120 115" className="w-full h-24">
      {nodes.map((n, i) => (
        <line key={i} x1={hub.x} y1={hub.y} x2={n.x} y2={n.y} stroke="#22D3EE" strokeOpacity={0.28} strokeWidth={0.7} />
      ))}
      {nodes.map((n, i) => (
        <circle key={'n' + i} cx={n.x} cy={n.y} r={3} fill="#7DD3FC" />
      ))}
      <circle cx={hub.x} cy={hub.y} r={7} fill="#22D3EE" opacity={0.25} />
      <circle cx={hub.x} cy={hub.y} r={4.5} fill="#22D3EE" />
    </svg>
  )
}
