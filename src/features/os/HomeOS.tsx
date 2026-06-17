import { useEffect, useRef, useState } from 'react'
import type { NavKey } from './Sidebar'
import type { PresenceState } from '../../types'
import { Orb } from '../orb'
import { projectService } from '../projects/components/ProjectDashboard'
import { graphService } from '../graph'
import { ollamaService, ACTIVE_BRAIN } from '../../services/OllamaService'
import { HudPanel, HudChip, chamfer } from './Hud'

// HomeOS — the functional home as a premium cyberpunk HUD. Real content (ask bar, projects,
// world model, agent, today, system) framed in chamfered neon panels over the shared backdrop.
// Restrained neon, monospace readouts, micro-motion only. Same wiring as the old Dashboard.

interface Props {
  inputText:     string
  onInputChange: (t: string) => void
  isSending:     boolean
  onAsk:         () => void
  onNavigate:    (k: NavKey) => void
  presence:      PresenceState
}

interface Project { name: string; state: string }

function greeting(): string {
  const h = new Date().getHours()
  return h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

export function HomeOS({ inputText, onInputChange, isSending, onAsk, onNavigate, presence }: Props) {
  const [now, setNow] = useState(() => new Date())
  const [projects, setProjects] = useState<Project[]>([])
  const [ollamaUp, setOllamaUp] = useState<boolean | null>(null)
  const [nodeCount, setNodeCount] = useState<number | null>(null)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { const id = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(id) }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try { const all = await projectService.getAllProjects(); if (!cancelled) setProjects(all.slice(0, 4).map(p => ({ name: p.name, state: p.currentState || 'Active' }))) } catch { /* leave empty */ }
      try { const up = await ollamaService.isReachable(); if (!cancelled) setOllamaUp(up) } catch { if (!cancelled) setOllamaUp(false) }
      try { const nodes = await graphService.getAllNodes(); if (!cancelled) setNodeCount(nodes.length) } catch { /* skip */ }
    })()
    return () => { cancelled = true }
  }, [])

  const dateUp = now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()
  const time = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="relative h-full overflow-y-auto">
      <div className="mx-auto max-w-[1200px] px-10 pt-9 pb-32">

        {/* HUD top bar */}
        <div className="flex items-center justify-between pb-3 mb-8 border-b border-cyan-400/[0.12]">
          <div className="flex items-center gap-3 font-hud text-[10.5px] tracking-[0.2em] uppercase">
            <span className="text-cyan-300/80 text-glow-cyan">PIKU://HOME</span>
            <span className="text-white/20">|</span>
            <span className="text-white/40">{dateUp}</span>
            <span className="text-white/25">{time}</span>
          </div>
          <div className="flex items-center gap-2">
            <HudChip accent={ollamaUp === false ? 'amber' : 'cyan'} dim={ollamaUp === false}>
              <span className={`w-1.5 h-1.5 rounded-full ${ollamaUp === false ? 'bg-amber-400' : 'bg-emerald-400'}`} />
              {ollamaUp === false ? 'Offline' : 'Local · Private'}
            </HudChip>
            <HudChip><span className="text-cyan-300/80">◈</span>{ACTIVE_BRAIN.model}</HudChip>
          </div>
        </div>

        {/* hero */}
        <div className="flex items-center gap-5 mb-7">
          <div className="shrink-0"><Orb presence={presence} size={64} /></div>
          <div>
            <div className="font-hud text-[10px] tracking-[0.3em] text-cyan-300/45 uppercase mb-1.5">// Operator · Jaskirat</div>
            <h1 className="text-[32px] leading-none font-light tracking-tight text-white/90">
              {greeting()}, <span className="font-normal text-cyan-50 text-glow-cyan">Jaskirat</span>
            </h1>
          </div>
        </div>

        {/* terminal ask bar */}
        <div className="relative mb-9" style={{ filter: 'drop-shadow(0 18px 40px rgba(0,0,0,0.5))' }}>
          <div className="absolute inset-0 transition-colors"
            style={{ ...chamfer(14), background: focused ? 'linear-gradient(120deg,rgba(34,211,238,0.85),rgba(217,70,239,0.4))' : 'linear-gradient(120deg,rgba(34,211,238,0.35),rgba(120,160,210,0.12))' }} />
          <div className="relative flex items-center gap-3 px-5 py-4 m-[1.2px] bg-[#070b14]/90 backdrop-blur-2xl"
            style={chamfer(13)} onClick={() => inputRef.current?.focus()}>
            <span className={`font-hud text-lg leading-none transition-colors ${focused ? 'text-cyan-300 text-glow-cyan' : 'text-white/35'}`}>›</span>
            <input
              ref={inputRef}
              value={inputText}
              onChange={e => onInputChange(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={e => { if (e.key === 'Enter' && inputText.trim() && !isSending) { e.preventDefault(); onAsk() } }}
              placeholder="Ask Piku anything, or tell it to do something on your Mac…"
              style={{ caretColor: '#22d3ee' }}
              className="flex-1 bg-transparent text-[15px] text-white/90 placeholder:text-white/30 placeholder:font-hud placeholder:text-[13px] outline-none"
            />
            <kbd className="hidden sm:block font-hud text-[10px] text-white/30 border border-white/10 rounded px-1.5 py-0.5">⏎</kbd>
            <button onClick={() => { if (inputText.trim() && !isSending) onAsk() }} disabled={!inputText.trim() || isSending}
              className="w-9 h-9 flex items-center justify-center text-cyan-100 bg-cyan-500/20 hover:bg-cyan-500/30 disabled:opacity-30 transition-colors"
              style={{ clipPath: 'polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))' }}>→</button>
          </div>
        </div>

        {/* bento */}
        <div className="grid grid-cols-6 gap-4">

          <HudPanel className="col-span-6 md:col-span-3" label="Projects" code="01"
            action={projects.length > 0 ? <LinkBtn onClick={() => onNavigate('projects')}>All</LinkBtn> : undefined}>
            {projects.length === 0 ? (
              <div className="font-hud text-[11px] text-white/35 leading-relaxed py-1">NO PROJECTS YET — they appear as Piku learns about your work.</div>
            ) : (
              <div className="flex flex-col -mx-1">
                {projects.map((p, i) => (
                  <button key={p.name} onClick={() => onNavigate('projects')}
                    className="group/row flex items-center gap-3 px-1 py-2 hover:bg-cyan-500/[0.05] transition-colors text-left">
                    <span className="font-hud text-[9px] text-cyan-300/50 w-4">{String(i + 1).padStart(2, '0')}</span>
                    <span className="w-1.5 h-1.5 bg-cyan-400/80 shrink-0 shadow-[0_0_6px_rgba(34,211,238,0.7)]" />
                    <span className="flex-1 min-w-0 text-[13px] text-white/85 truncate group-hover/row:text-white">{p.name}</span>
                    <span className="font-hud text-[9px] uppercase tracking-wider text-white/35 truncate">{p.state}</span>
                  </button>
                ))}
              </div>
            )}
          </HudPanel>

          <HudPanel className="col-span-6 md:col-span-3" label="World Model" code="02"
            action={<LinkBtn onClick={() => onNavigate('knowledge')}>Open graph</LinkBtn>}>
            <div className="flex items-end justify-between">
              <div>
                <div className="font-hud text-[36px] leading-none font-light text-white/90 tabular-nums text-glow-cyan">
                  {nodeCount === null ? '––' : String(nodeCount).padStart(2, '0')}
                </div>
                <div className="font-hud text-[10px] uppercase tracking-[0.15em] text-white/40 mt-2.5">nodes · private graph</div>
              </div>
              <Constellation />
            </div>
          </HudPanel>

          <HudPanel className="col-span-6 md:col-span-2" label="Agent" code="03" accent="violet">
            <p className="text-[12.5px] text-white/55 leading-relaxed mb-3.5">
              Talk to Piku and let it act on your Mac — open apps, files, links, search the web.
            </p>
            <button onClick={() => onNavigate('agent')}
              className="w-full font-hud text-[11px] uppercase tracking-[0.15em] text-fuchsia-100 bg-fuchsia-500/12 hover:bg-fuchsia-500/22 py-2.5 transition-colors"
              style={{ clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))', boxShadow: 'inset 0 0 0 1px rgba(217,70,239,0.3)' }}>
              Open Agent →
            </button>
          </HudPanel>

          <HudPanel className="col-span-6 md:col-span-2" label="Today" code="04">
            <div className="text-[18px] text-white/85 leading-none">{now.toLocaleDateString(undefined, { weekday: 'long' })}</div>
            <div className="font-hud text-[11px] uppercase tracking-wider text-white/40 mt-1.5 mb-3.5">{now.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}</div>
            <button onClick={() => onNavigate('calendar')}
              className="font-hud text-[10.5px] uppercase tracking-wider text-white/40 hover:text-cyan-200 transition-colors">+ Connect calendar</button>
          </HudPanel>

          <HudPanel className="col-span-6 md:col-span-2" label="System" code="05">
            <div className="flex flex-col gap-2.5 font-hud text-[11px]">
              <Stat label="Ollama" value={ollamaUp === null ? 'checking' : ollamaUp ? 'online' : 'offline'} dim={ollamaUp === false} />
              <Stat label="Brain" value={ACTIVE_BRAIN.model} />
              <Stat label="Embed" value="nomic-embed" />
            </div>
          </HudPanel>

        </div>

        {/* status ticker */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-7 font-hud text-[9.5px] uppercase tracking-[0.18em] text-white/30">
          <Tick dot="bg-fuchsia-400" >Agent idle</Tick>
          <Tick dot="bg-cyan-400">Memory synced</Tick>
          <Tick dot="bg-cyan-400">{nodeCount ?? 0} nodes indexed</Tick>
          <Tick dot={ollamaUp === false ? 'bg-amber-400' : 'bg-emerald-400'}>{ollamaUp === false ? 'Ollama offline' : 'Ollama online'}</Tick>
        </div>

      </div>
    </div>
  )
}

function LinkBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button onClick={onClick} className="font-hud text-[9.5px] uppercase tracking-[0.15em] text-white/40 hover:text-cyan-200 transition-colors">{children} →</button>
}

function Stat({ label, value, dim }: { label: string; value: string; dim?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-white/50 uppercase tracking-wider">
        <span className={`w-1.5 h-1.5 rounded-full ${dim ? 'bg-amber-400/80' : 'bg-emerald-400/80'}`} />{label}
      </span>
      <span className={dim ? 'text-white/40' : 'text-cyan-200/80'}>{value}</span>
    </div>
  )
}

function Tick({ children, dot }: { children: React.ReactNode; dot: string }) {
  return <span className="flex items-center gap-1.5"><span className={`w-1.5 h-1.5 rounded-full ${dot}`} />{children}</span>
}

// A refined constellation — decorative, static, premium (neon + glow, not the old crude SVG).
function Constellation() {
  const hub = { x: 52, y: 30 }
  const pts = [{ x: 14, y: 12 }, { x: 86, y: 16 }, { x: 24, y: 52 }, { x: 78, y: 50 }, { x: 50, y: 60 }]
  return (
    <svg viewBox="0 0 100 68" className="w-28 h-[64px]">
      <defs>
        <radialGradient id="cg" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#a5f3fc" /><stop offset="100%" stopColor="#22D3EE" /></radialGradient>
        <filter id="gl"><feGaussianBlur stdDeviation="1.2" /></filter>
      </defs>
      {pts.map((p, i) => <line key={i} x1={hub.x} y1={hub.y} x2={p.x} y2={p.y} stroke="#22D3EE" strokeOpacity={0.25} strokeWidth={0.6} />)}
      {pts.map((p, i) => <circle key={'p' + i} cx={p.x} cy={p.y} r={1.8} fill="#7DD3FC" opacity={0.9} />)}
      <circle cx={hub.x} cy={hub.y} r={7} fill="#22D3EE" opacity={0.25} filter="url(#gl)" />
      <circle cx={hub.x} cy={hub.y} r={3.4} fill="url(#cg)" />
    </svg>
  )
}
