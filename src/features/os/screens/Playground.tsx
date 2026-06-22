import { useEffect, useRef, useState } from 'react'
import type { MailSummary } from '../../../services/accounts'
import { accountService, gmailConnector, gitHubConnector, useConnectorFeed, useInbox, useUpcomingEvents } from '../../../services/accounts'
import { ollamaService, ACTIVE_BRAIN } from '../../../services/OllamaService'
import { projectService } from '../../projects/components/ProjectDashboard'
import type { Project } from '../../projects/types'
import { graphService } from '../../graph'
import { CornerTicks } from '../Hud'
import type { Accent } from '../Hud'

// ─────────────────────────────────────────────────────────────────────────────
// Playground — VR-like infinite desktop. Every Piku feature lives as a draggable
// + resizable tile on an infinite pannable canvas. Scroll/pan freely in all
// directions (like Figma). Everything stays open and working where you place it.
// Geometry persists to localStorage. Webview embeds (WhatsApp/LinkedIn) follow
// their frames. You're meant to arrange your whole workspace once and have it
// stay — the live Piku desktop.
// ─────────────────────────────────────────────────────────────────────────────

type TileId = string
type Persona = 'office' | 'personal'
interface Geom { x: number; y: number; w: number; h: number; z: number; collapsed?: boolean }

const GRID = 24
const MIN_W = 280
const MIN_H = 200
const LS_KEY = 'piku.playground.v1'

const EMAIL: Record<Persona, string> = { office: 'work@example.com', personal: 'personal@example.com' }
const GH: Record<Persona, string>    = { office: 'work-user', personal: 'jaskiring' }

const snap = (v: number) => Math.round(v / GRID) * GRID

const openInChrome = async (url: string) => {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('open_in_piku_chrome', { url });   // Piku's dedicated, logged-in Chrome profile
  } catch {}
}

function accentName(rgb: string): Accent {
  if (rgb.startsWith('217,70,239')) return 'violet'
  if (rgb.startsWith('245,158,11')) return 'amber'
  return 'cyan'
}

// ── Tile definitions — one per Piku feature ─────────────────────────────────

interface TileDef { id: TileId; name: string; kind: 'dom' | 'embed'; accent: string }
const TILES: TileDef[] = [
  { id: 'inbox',     name: 'Inbox',         kind: 'dom',   accent: '217,70,239' },
  { id: 'calendar',  name: 'Calendar',      kind: 'dom',   accent: '34,211,238' },
  { id: 'github',    name: 'GitHub',         kind: 'dom',   accent: '34,211,238' },
  { id: 'projects',  name: 'Projects',       kind: 'dom',   accent: '245,158,11' },
  { id: 'system',    name: 'System',         kind: 'dom',   accent: '34,211,238' },
  { id: 'graph',     name: 'World Model',    kind: 'dom',   accent: '34,211,238' },
  { id: 'agent',     name: 'Agent',          kind: 'dom',   accent: '217,70,239' },
  { id: 'models',    name: 'Models',         kind: 'dom',   accent: '34,211,238' },
  { id: 'whatsapp',  name: 'WhatsApp',       kind: 'dom', accent: '255,255,255' },
  { id: 'linkedin',  name: 'LinkedIn',       kind: 'dom', accent: '255,255,255' },
]

function defaultLayout(): Record<TileId, Geom> {
  const row1y = 16
  const row2y = 460
  const row3y = 900
  const col1 = 16
  const col2 = 480
  const col3 = 944
  const col4 = 1408
  const w = 440
  const h = 420
  return {
    inbox:    { x: col1, y: row1y, w, h, z: 1 },
    calendar: { x: col2, y: row1y, w, h, z: 2 },
    github:   { x: col3, y: row1y, w, h, z: 3 },
    whatsapp: { x: col4, y: row1y, w, h, z: 4 },
    projects: { x: col1, y: row2y, w, h, z: 5 },
    system:   { x: col2, y: row2y, w: 340, h: 280, z: 6 },
    graph:    { x: col3, y: row2y, w, h, z: 7 },
    agent:    { x: col1, y: row3y, w: 540, h: 480, z: 8 },
    models:   { x: col2 + 340 + 16, y: row2y, w: 340, h: 280, z: 9 },
    linkedin: { x: col3, y: row3y, w, h, z: 10 },
  }
}

function loadLayout(): Record<TileId, Geom> {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const g = JSON.parse(raw)
      if (typeof g === 'object' && g !== null) {
        // partial restore is fine — fill missing tiles from defaults
        const defs = defaultLayout()
        for (const id of Object.keys(defs) as TileId[]) {
          if (!g[id]) g[id] = defs[id]
        }
        return g
      }
    }
  } catch { /* fall through */ }
  return defaultLayout()
}

// ── Main component ──────────────────────────────────────────────────────────

export function PlaygroundScreen() {
  const surfaceRef = useRef<HTMLDivElement>(null)
  const [geom, setGeom] = useState<Record<TileId, Geom>>(loadLayout)
  const [persona, setPersona] = useState<Persona>(() => (localStorage.getItem('piku.canvas.persona') as Persona) || 'office')
  const zTop = useRef(10)
  const interacting = useRef(false)
  const gesture = useRef<{ id: TileId; mode: 'drag' | 'resize' | 'pan'; px: number; py: number; ox: number; oy: number; ow: number; oh: number; scrollX0: number; scrollY0: number } | null>(null)
  const [scrollPos, setScrollPos] = useState({ x: 0, y: 0 })

  // persist layout
  useEffect(() => {
    const id = setTimeout(() => { try { localStorage.setItem(LS_KEY, JSON.stringify(geom)) } catch { /* quota */ } }, 200)
    return () => clearTimeout(id)
  }, [geom])

  useEffect(() => { localStorage.setItem('piku.canvas.persona', persona) }, [persona])

  const bringToFront = (id: TileId) => setGeom(g => ({ ...g, [id]: { ...g[id], z: ++zTop.current } }))

  // ── Pan / drag / resize gesture handling ────────────────────────────────
  const onPointerDown = (id: TileId, mode: 'drag' | 'resize') => (e: React.PointerEvent) => {
    e.preventDefault()
    if (e.button === 1) return  // middle-click reserved for pan
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const gx = geom[id]
    gesture.current = { id, mode, px: e.clientX, py: e.clientY, ox: gx.x, oy: gx.y, ow: gx.w, oh: gx.h, scrollX0: scrollPos.x, scrollY0: scrollPos.y }
    interacting.current = true
    bringToFront(id)
  }

  const onCanvasPointerDown = (e: React.PointerEvent) => {
    if (e.button === 1 || (e.button === 0 && e.shiftKey)) {
      e.preventDefault()
      gesture.current = { id: '_pan', mode: 'pan', px: e.clientX, py: e.clientY, ox: 0, oy: 0, ow: 0, oh: 0, scrollX0: scrollPos.x, scrollY0: scrollPos.y }
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const gst = gesture.current; if (!gst) return
    const dx = e.clientX - gst.px, dy = e.clientY - gst.py
    if (gst.mode === 'pan') {
      setScrollPos({ x: gst.scrollX0 - dx, y: gst.scrollY0 - dy })
      return
    }
    setGeom(g => {
      if (!g) return g
      const p = { ...g[gst.id] }
      if (gst.mode === 'drag') {
        p.x = gst.ox + dx
        p.y = gst.oy + dy
      } else {
        p.w = Math.max(MIN_W, gst.ow + dx)
        p.h = Math.max(MIN_H, gst.oh + dy)
      }
      return { ...g, [gst.id]: p }
    })
  }

  const endGesture = () => {
    const gst = gesture.current; if (!gst) return
    gesture.current = null
    if (gst.mode === 'pan') { interacting.current = false; return }
    setGeom(g => {
      if (!g) return g
      const p = { ...g[gst.id], x: snap(g[gst.id].x), y: snap(g[gst.id].y), w: snap(g[gst.id].w), h: snap(g[gst.id].h) }
      return { ...g, [gst.id]: p }
    })
    interacting.current = false
  }

  // Scroll = pan the canvas (like Figma's scroll-to-pan)
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    setScrollPos(s => ({ x: s.x + e.deltaX, y: s.y + e.deltaY }))
  }

  return (
    <div className="absolute inset-0 overflow-hidden"
      onPointerDown={onCanvasPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}>

      {/* ── Header bar ── */}
      <div className="absolute top-0 left-0 right-0 h-12 flex items-center justify-between px-6 z-30 pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-4">
          <span className="text-[15px] font-semibold tracking-tight text-white/90">Playground</span>
          <span className="font-hud text-[9px] uppercase tracking-[0.2em] text-white/30">scroll to pan · drag to move · shift+drag to pan · resize from corner</span>
        </div>
        <div className="pointer-events-auto flex items-center gap-1 font-hud text-[11px] uppercase tracking-wider">
          <span className="text-white/25 mr-2">persona</span>
          {(['office', 'personal'] as Persona[]).map(p => (
            <button key={p} onClick={() => setPersona(p)}
              className={`px-3.5 py-1.5 transition-colors ${persona === p ? 'text-white' : 'text-white/40 hover:text-white/70'}`}
              style={persona === p ? { clipPath: 'polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,8px 100%,0 calc(100% - 8px))', background: `rgba(${p === 'office' ? '34,211,238' : '217,70,239'},0.14)`, boxShadow: `inset 0 0 0 1px rgba(${p === 'office' ? '34,211,238' : '217,70,239'},0.4)` } : undefined}>{p}</button>
          ))}
        </div>
      </div>

      {/* ── The infinite canvas ── */}
      <div ref={surfaceRef} className="absolute inset-0 mt-12"
        onWheel={onWheel}
        style={{ overflow: 'hidden' }}>
        <div style={{ transform: `translate(${-scrollPos.x}px, ${-scrollPos.y}px)`, width: 4000, height: 4000, position: 'relative' }}
          className="cyber-grid">

          {/* subtle origin crosshair */}
          <div className="absolute" style={{ left: 0, top: 0, width: 1, height: 4000, background: 'rgba(34,211,238,0.04)' }} />
          <div className="absolute" style={{ left: 0, top: 0, width: 4000, height: 1, background: 'rgba(34,211,238,0.04)' }} />

          {TILES.map(meta => {
            const g = geom[meta.id]
            if (!g) return null
            const tileAccent = meta.accent
            return (
              <div key={meta.id}
                className="absolute flex flex-col group"
                style={{
                  left: g.x, top: g.y, width: g.w,
                  height: g.collapsed ? 38 : g.h,
                  zIndex: g.z,
                  transition: 'height 0.15s ease',
                  filter: 'drop-shadow(0 14px 34px rgba(0,0,0,0.6))',
                }}>

                {/* neon edge layer — chamfered gradient that forms the hairline frame */}
                <div className="absolute inset-0 pointer-events-none"
                  style={{
                    clipPath: 'polygon(0 0,calc(100% - 12px) 0,100% 12px,100% 100%,12px 100%,0 calc(100% - 12px))',
                    background: `linear-gradient(160deg, rgba(${tileAccent},0.55), rgba(120,160,210,0.12) 45%, rgba(255,255,255,0.04))`,
                  }} />
                {/* dark glass face inset 1.1px to reveal the edge as a crisp hairline */}
                <div className="absolute inset-[1.1px] bg-gradient-to-b from-[#0a1120]/85 to-[#070b14]/80 backdrop-blur-xl pointer-events-none"
                  style={{
                    clipPath: 'polygon(0 0,calc(100% - 11px) 0,100% 11px,100% 100%,11px 100%,0 calc(100% - 11px))',
                  }} />
                {/* hover bloom — soft neon glow on hover */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                  style={{
                    clipPath: 'polygon(0 0,calc(100% - 12px) 0,100% 12px,100% 100%,12px 100%,0 calc(100% - 12px))',
                    boxShadow: `inset 0 0 26px -6px rgba(${tileAccent},0.22)`,
                  }} />

                {/* ── Content ── */}
                <div className="relative flex flex-col flex-1">
                  {/* ── Titlebar (drag handle) ── */}
                  <div onPointerDown={onPointerDown(meta.id, 'drag')}
                    className="h-[38px] shrink-0 flex items-center justify-between px-3 cursor-move select-none"
                    style={{ borderBottom: `1px solid rgba(${tileAccent},0.12)` }}>
                    <span className="font-hud text-[10px] uppercase tracking-[0.18em] text-white/55 flex items-center gap-2">
                      <span className="w-1.5 h-1.5" style={{ background: `rgb(${tileAccent})`, boxShadow: `0 0 7px rgba(${tileAccent},0.7)` }} />
                      {meta.name}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setGeom(g => g && ({ ...g, [meta.id]: { ...g[meta.id], collapsed: !g[meta.id].collapsed } }))}
                        className="text-white/30 hover:text-white/60 text-[10px] w-5 h-5 flex items-center justify-center"
                        title={g.collapsed ? 'expand' : 'minimize'}>
                        {g.collapsed ? '▾' : '▴'}
                      </button>
                    </div>
                  </div>

                  {/* ── Tile body ── */}
                  {!g.collapsed && (
                    <div className="flex-1 min-h-0 relative overflow-hidden">
                      <TileBody id={meta.id} persona={persona} accent={tileAccent} />
                    </div>
                  )}
                </div>

                {/* ── Resize handle ── */}
                {!g.collapsed && (
                  <div onPointerDown={onPointerDown(meta.id, 'resize')}
                    className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize"
                    style={{ background: `linear-gradient(135deg, transparent 50%, rgba(${tileAccent},0.5) 50%)` }} />
                )}

                <CornerTicks accent={accentName(tileAccent)} />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Tile bodies — each feature as a self-contained panel ────────────────────

function LauncherTile({ name, url, accent }: { name: string; url: string; accent: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6">
      <span className="font-hud text-[13px] uppercase tracking-[0.25em]" style={{ color: `rgba(${accent},0.5)` }}>{name}</span>
      <button onClick={() => openInChrome(url)}
        className="font-hud text-[10px] uppercase tracking-wider px-3 py-1.5 transition-colors text-white/70 hover:text-white"
        style={{ clipPath: 'polygon(0 0,calc(100% - 6px) 0,100% 6px,100% 100%,6px 100%,0 calc(100% - 6px))', background: 'rgba(255,255,255,0.03)', boxShadow: `inset 0 0 0 1px rgba(${accent},0.28)` }}>
        Open in browser →
      </button>
      <span className="font-hud text-[9px] text-white/20 uppercase tracking-wider">opens your logged-in Chrome</span>
    </div>
  )
}

function TileBody({ id, persona, accent }: { id: TileId; persona: Persona; accent: string }) {
  switch (id) {
    case 'inbox':    return <InboxTile persona={persona} />
    case 'calendar': return <CalendarTile />
    case 'github':   return <GitHubTile persona={persona} />
    case 'projects': return <ProjectsTile />
    case 'system':   return <SystemTile />
    case 'graph':    return <GraphTile />
    case 'agent':    return <AgentTile />
    case 'models':   return <ModelsTile />
    case 'whatsapp': return <LauncherTile name="WhatsApp" url="https://web.whatsapp.com" accent={accent} />
    case 'linkedin': return <LauncherTile name="LinkedIn" url="https://www.linkedin.com/feed/" accent={accent} />
    default:         return <div className="p-3 text-[11px] text-white/30 font-hud">tile</div>
  }
}

// ── Inbox ───────────────────────────────────────────────────────────────────

function InboxTile({ persona }: { persona: Persona }) {
  const { inbox } = useInbox()
  const [localMail, setLocalMail] = useState<MailSummary[] | null>(null)
  useEffect(() => {
    if (inbox?.messages.length) return
    let c = false
    void (async () => {
      const accts = await accountService.getByService('email')
      const a = accts.find(x => (x.email ?? '').toLowerCase() === EMAIL[persona])
      if (!a || !a.token) { if (!c) setLocalMail([]); return }
      try { const m = await gmailConnector.search(a, 'in:inbox newer_than:14d', 30); if (!c) setLocalMail(m) } catch { if (!c) setLocalMail([]) }
    })()
    return () => { c = true }
  }, [persona, inbox])
  const mail = inbox?.messages ?? localMail ?? null
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/[0.06] shrink-0">
        <span className="font-hud text-[10px] text-white/30 uppercase tracking-wider">inbox (14d)</span>
        <button onClick={() => openInChrome(`https://mail.google.com/mail/u/?authuser=${EMAIL[persona]}`)}
          className="font-hud text-[10px] uppercase tracking-wider text-cyan-300/60 hover:text-cyan-200">
          Open Gmail →
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-1">
        {mail === null ? <div className="text-[11px] text-white/30 p-2 font-hud">loading inbox…</div>
          : mail.length === 0 ? <div className="text-[11px] text-white/30 p-2">inbox empty (14d)</div>
          : mail.map(m => {
            const name = (m.from.replace(/<.*>/, '').replace(/"/g, '').trim() || m.from).slice(0, 40)
            return (
              <div key={m.id} onClick={() => openInChrome(`https://mail.google.com/mail/u/?authuser=${EMAIL[persona]}#all/${m.id}`)}
                className="flex items-start gap-2.5 py-2 border-b border-white/[0.04] cursor-pointer hover:bg-white/[0.02]">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] shrink-0 ${m.unread ? 'bg-violet-500/25 text-violet-100' : 'bg-white/10 text-white/50'}`}>{(name[0] || '?').toUpperCase()}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-[12.5px] truncate ${m.unread ? 'text-white font-medium' : 'text-white/70'}`}>{name}</span>
                  </div>
                  <div className={`text-[12px] truncate ${m.unread ? 'text-white/85' : 'text-white/50'}`}>{m.subject}</div>
                  <div className="text-[11px] text-white/35 truncate">{m.snippet}</div>
                </div>
              </div>
            )
          })}
      </div>
    </div>
  )
}

// ── Calendar ────────────────────────────────────────────────────────────────

function CalendarTile() {
  const { events, loading } = useUpcomingEvents()
  return (
    <div className="absolute inset-0 overflow-y-auto px-3 py-2">
      {loading && !events ? <div className="text-[11px] text-white/30 font-hud">loading…</div>
        : !events || events.events.length === 0 ? <div className="text-[11px] text-white/35 p-2">Nothing on the calendar for the next 14 days.<br/><span className="text-white/20">Connect Google Calendar in Settings → Calendar to see events here.</span></div>
        : events.events.map(e => {
          const when = new Date(e.start)
          const timeStr = when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
          const dateStr = when.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
          return (
            <div key={e.id} className="flex items-start gap-2.5 py-2 border-b border-white/[0.04]">
              <div className="text-[10px] text-cyan-300/60 font-hud w-16 shrink-0 pt-0.5 tabular-nums">{timeStr}</div>
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] text-white/85">{e.title}</div>
                <div className="text-[11px] text-white/35">{dateStr}{e.location ? ` · ${e.location}` : ''}</div>
                {e.meetLink && <a href={e.meetLink} target="_blank" rel="noreferrer" className="text-[10px] text-cyan-300/60 hover:text-cyan-200">Join ↗</a>}
              </div>
            </div>
          )
        })}
    </div>
  )
}

// ── GitHub ───────────────────────────────────────────────────────────────────

function GitHubTile({ persona }: { persona: Persona }) {
  const [data, setData] = useState<{ total: number; repos: string[] } | null>(null)
  const [missing, setMissing] = useState(false)
  useEffect(() => {
    let c = false; setData(null); setMissing(false)
    void (async () => {
      const accts = await accountService.getByService('github')
      const a = accts.find(x => (x.username ?? '').toLowerCase() === GH[persona])
      if (!a || !a.token) { if (!c) setMissing(true); return }
      const d = new Date(Date.now() - 7 * 864e5)
      const since = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const r = await gitHubConnector.commitsSince(a, since)
      if (!c) setData({ total: r?.total ?? 0, repos: r ? Object.entries(r.byRepo).sort((x, y) => y[1] - x[1]).slice(0, 8).map(([rp, n]) => `${rp} (${n})`) : [] })
    })()
    return () => { c = true }
  }, [persona])
  return (
    <div className="absolute inset-0 overflow-y-auto px-4 py-3">
      {missing ? <div className="text-[11px] text-amber-300/60">No {persona} GitHub connected.</div>
        : data === null ? <div className="text-[11px] text-white/30 font-hud">loading…</div>
        : <>
            <div className="flex items-end gap-2">
              <span className="font-hud text-[30px] leading-none text-white/90 tabular-nums">{data.total}</span>
              <span className="font-hud text-[10px] uppercase tracking-wider text-white/40 mb-1">commits · 7d · @{GH[persona]}</span>
            </div>
            <div className="mt-3 flex flex-col gap-1.5">
              {data.repos.length === 0 ? <div className="text-[11px] text-white/30">no commits in 7d</div>
                : data.repos.map(r => <div key={r} className="text-[12px] text-white/70 truncate flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-cyan-400/70" />{r}</div>)}
            </div>
          </>}
    </div>
  )
}

// ── Projects ────────────────────────────────────────────────────────────────

function ProjectsTile() {
  const [projects, setProjects] = useState<Project[]>([])
  useEffect(() => { projectService.getAllProjects().then(p => setProjects(p.slice(0, 8))).catch(() => {}) }, [])
  return (
    <div className="absolute inset-0 overflow-y-auto px-3 py-2">
      {projects.length === 0 ? <div className="text-[11px] text-white/30 font-hud">no projects yet</div>
        : projects.map((p, i) => (
          <div key={p.id ?? i} className="flex items-center gap-2.5 py-2 border-b border-white/[0.04]">
            <span className="font-hud text-[9px] text-amber-300/50 w-4">{String(i + 1).padStart(2, '0')}</span>
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] text-white/85 truncate">{p.name}</div>
              <div className="text-[11px] text-white/35 truncate">{(p.vision || '').slice(0, 60)}</div>
            </div>
          </div>
        ))}
    </div>
  )
}

// ── System ──────────────────────────────────────────────────────────────────

function SystemTile() {
  const [ollamaUp, setOllamaUp] = useState<boolean | null>(null)
  const [nodeCount, setNodeCount] = useState<number | null>(null)
  const feed = useConnectorFeed()
  useEffect(() => { void ollamaService.isReachable().then(setOllamaUp) }, [])
  useEffect(() => { void graphService.getAllNodes().then(n => setNodeCount(n.length)) }, [])
  return (
    <div className="absolute inset-0 overflow-y-auto px-4 py-3">
      <div className="flex flex-col gap-2.5 font-hud text-[11px]">
        <Stat label="Ollama" value={ollamaUp === null ? 'checking' : ollamaUp ? 'online' : 'offline'} dim={ollamaUp === false} />
        <Stat label="Brain" value={ACTIVE_BRAIN.model} />
        <Stat label="Embed" value="nomic-embed" />
        <Stat label="Nodes" value={nodeCount ?? '…'} />
        <Stat label="Inbox" value={feed.inbox ? `${feed.inbox.messages.filter(m => m.unread).length} unread` : '—'} />
        <Stat label="Calendar" value={feed.events ? `${feed.events.events.length} upcoming` : '—'} />
      </div>
    </div>
  )
}

function Stat({ label, value, dim }: { label: string; value: string | number; dim?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="font-hud text-white/45 uppercase tracking-wider">{label}</span>
      <span className={`tabular-nums ${dim ? 'text-amber-300/60' : 'text-white/70'}`}>{value}</span>
    </div>
  )
}

// ── World Model graph stats ─────────────────────────────────────────────────

function GraphTile() {
  const [nodeCount, setNodeCount] = useState<number | null>(null)
  const [types, setTypes] = useState<Record<string, number>>({})
  useEffect(() => {
    void (async () => {
      try {
        const nodes = await graphService.getAllNodes()
        setNodeCount(nodes.length)
        const tc: Record<string, number> = {}
        for (const n of nodes) { tc[n.type] = (tc[n.type] || 0) + 1 }
        setTypes(tc)
      } catch { /* ignore */ }
    })()
  }, [])
  return (
    <div className="absolute inset-0 overflow-y-auto px-4 py-3">
      <div className="flex items-end gap-2 mb-3">
        <span className="font-hud text-[30px] leading-none text-white/90 tabular-nums">{nodeCount ?? '—'}</span>
        <span className="font-hud text-[10px] uppercase tracking-wider text-white/40 mb-1">nodes in world model</span>
      </div>
      <div className="flex flex-col gap-1">
        {Object.entries(types).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
          <div key={type} className="flex items-center justify-between text-[11.5px]">
            <span className="text-white/55 capitalize">{type}</span>
            <span className="text-white/35 font-hud tabular-nums">{count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Agent console ────────────────────────────────────────────────────────────

function AgentTile() {
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<{ role: 'you' | 'piku'; text: string }[]>([])
  const [live, setLive] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const send = async () => {
    const t = input.trim(); if (!t || sending) return
    setInput(''); setHistory(h => [...h, { role: 'you', text: t }]); setSending(true); setLive('')
    try {
      const { PIKU_PERSONA } = await import('../../../lib/persona')
      const sys = `${PIKU_PERSONA}\n\nYou have a continuous memory of this person across conversations.`
      const prior = history.map(m => ({ role: m.role === 'you' ? 'user' as const : 'assistant' as const, content: m.text }))
      let acc = ''
      await ollamaService.chatStream(
        [{ role: 'system', content: sys }, ...prior, { role: 'user', content: t }],
        (chunk) => { acc += chunk; setLive(acc) },
        undefined, 0.7, 240_000, false,
      )
      setHistory(h => [...h, { role: 'piku', text: acc }])
    } catch { setHistory(h => [...h, { role: 'piku', text: '(error — Ollama may be offline)' }]) }
    finally { setSending(false); setLive('') }
  }

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [history, live])

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {history.length === 0 && !live && <div className="text-[11px] text-white/30 font-hud p-2">Type a message to talk to Piku…</div>}
        {history.map((m, i) => (
          <div key={i} className={`py-1.5 text-[12.5px] ${m.role === 'you' ? 'text-cyan-200/70' : 'text-white/80'}`}>
            <span className="font-hud text-[9px] text-white/25 uppercase mr-1.5">{m.role === 'you' ? 'you' : 'piku'}</span>
            {m.text}
          </div>
        ))}
        {live && <div className="py-1.5 text-[12.5px] text-white/80"><span className="font-hud text-[9px] text-white/25 uppercase mr-1.5">piku</span>{live}<span className="animate-pulse text-cyan-300">▌</span></div>}
        <div ref={bottomRef} />
      </div>
      <div className="shrink-0 flex items-center border-t border-white/[0.06] px-2 py-1.5">
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
          placeholder="Ask Piku anything…"
          className="flex-1 bg-transparent text-[12.5px] text-white/85 placeholder-white/30 outline-none" />
        <button onClick={() => void send()} disabled={sending}
          className="ml-2 font-hud text-[10px] uppercase tracking-wider text-cyan-300/60 hover:text-cyan-200 disabled:opacity-30 px-2 py-1">{sending ? '…' : '↵'}</button>
      </div>
    </div>
  )
}

// ── Models ───────────────────────────────────────────────────────────────────

function ModelsTile() {
  const [models, setModels] = useState<string[]>([])
  useEffect(() => {
    void (async () => {
      try {
        const tags = await ollamaService.listModels()
        setModels(tags)
      } catch { setModels([]) }
    })()
  }, [])
  return (
    <div className="absolute inset-0 overflow-y-auto px-4 py-3">
      <div className="font-hud text-[10px] uppercase tracking-wider text-white/40 mb-3">Available models</div>
      {models.length === 0 ? <div className="text-[11px] text-white/30">checking…</div>
        : models.map(m => (
          <div key={m} className="flex items-center justify-between py-1.5 border-b border-white/[0.04]">
            <span className={`text-[12px] ${m === ACTIVE_BRAIN.model ? 'text-cyan-200' : 'text-white/60'}`}>{m}</span>
            {m === ACTIVE_BRAIN.model && <span className="font-hud text-[9px] text-cyan-300/60 uppercase tracking-wider">active</span>}
          </div>
        ))}
    </div>
  )
}
