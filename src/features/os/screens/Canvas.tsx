import { useEffect, useReducer, useRef, useState } from 'react'
import { accountService, gitHubConnector } from '../../../services/accounts'

// The Apps "chart paper": a freeform canvas of draggable + resizable panels, all INSIDE Piku.
// Gmail + GitHub are native React panels scoped to the active persona (Office/Personal); WhatsApp +
// LinkedIn are the REAL sites as native child webviews (shared accounts) synced to their frame.
// Native webviews always paint above the DOM and can't be clipped, so: embeds are hidden during any
// drag/resize (a placeholder stands in) and snapped back on drop; one panel can EXPAND to fill the
// canvas (parks the other embeds). Geometry + persona persist in localStorage.

type Persona = 'office' | 'personal'
type PanelId = 'gmail' | 'github' | 'whatsapp' | 'linkedin'
interface Geom { x: number; y: number; w: number; h: number; z: number }

const EMAIL: Record<Persona, string> = { office: 'work@example.com', personal: 'personal@example.com' }
const GH: Record<Persona, string>    = { office: 'work-user', personal: 'jaskiring' }
const GRID = 24
const MIN_W = 300
const MIN_H = 220
const LS_LAYOUT = 'piku.canvas.layout.v1'
const LS_PERSONA = 'piku.canvas.persona'

const PANELS: { id: PanelId; name: string; kind: 'dom' | 'embed' }[] = [
  { id: 'gmail',    name: 'Gmail',    kind: 'dom' },    // Google blocks webview sign-in → '⧉ real' docks the real logged-in Chrome Gmail
  { id: 'github',   name: 'GitHub',   kind: 'dom' },    // API summary + ⧉ real
  { id: 'whatsapp', name: 'WhatsApp', kind: 'embed' },  // embedded web app, inside Piku
  { id: 'linkedin', name: 'LinkedIn', kind: 'embed' },  // embedded web app, inside Piku
]
// Panels rendered as real, in-Piku embedded webviews (vs API-backed DOM panels).
const EMBED_IDS: PanelId[] = PANELS.filter(p => p.kind === 'embed').map(p => p.id)

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const snap = (v: number) => Math.round(v / GRID) * GRID
function defaultLayout(cw: number, ch: number): Record<PanelId, Geom> {
  const w = Math.max(MIN_W, Math.floor((cw - 48) / 2))
  const h = Math.max(MIN_H, Math.floor((ch - 48) / 2))
  return {
    gmail:    { x: 16,          y: 16,          w, h, z: 1 },
    github:   { x: 32 + w,      y: 16,          w, h, z: 2 },
    whatsapp: { x: 16,          y: 32 + h,      w, h, z: 3 },
    linkedin: { x: 32 + w,      y: 32 + h,      w, h, z: 4 },
  }
}

function loadLayout(cw: number, ch: number): Record<PanelId, Geom> {
  try {
    const raw = localStorage.getItem(LS_LAYOUT)
    if (raw) {
      const g = JSON.parse(raw) as Record<PanelId, Geom>
      if (g.gmail && g.github && g.whatsapp && g.linkedin) {
        // clamp restored geometry to the current canvas
        for (const id of Object.keys(g) as PanelId[]) {
          g[id].w = clamp(g[id].w, MIN_W, cw); g[id].h = clamp(g[id].h, MIN_H, ch)
          g[id].x = clamp(g[id].x, 0, Math.max(0, cw - g[id].w))
          g[id].y = clamp(g[id].y, 0, Math.max(0, ch - g[id].h))
        }
        return g
      }
    }
  } catch { /* fall through */ }
  return defaultLayout(cw, ch)
}

export function CanvasScreen() {
  const surfaceRef = useRef<HTMLDivElement>(null)
  const [persona, setPersona] = useState<Persona>(() => (localStorage.getItem(LS_PERSONA) as Persona) || 'office')
  const [geom, setGeom] = useState<Record<PanelId, Geom> | null>(null)
  const [expanded, setExpanded] = useState<PanelId | null>(null)
  const [, force] = useReducer(n => n + 1, 0)
  const zTop = useRef(4)
  const interacting = useRef(false)
  const gesture = useRef<{ id: PanelId; mode: 'drag' | 'resize'; px: number; py: number; ox: number; oy: number; ow: number; oh: number } | null>(null)
  const accent = persona === 'office' ? '34,211,238' : '217,70,239'   // cyan / violet

  // init geometry once we know the canvas size
  useEffect(() => {
    const el = surfaceRef.current; if (!el) return
    const r = el.getBoundingClientRect()
    setGeom(loadLayout(r.width, r.height))
  }, [])

  // persist
  useEffect(() => { if (geom) { const id = setTimeout(() => { try { localStorage.setItem(LS_LAYOUT, JSON.stringify(geom)) } catch { /* quota */ } }, 150); return () => clearTimeout(id) } }, [geom])
  useEffect(() => { localStorage.setItem(LS_PERSONA, persona) }, [persona])

  // ── Embedded web apps, INSIDE Piku ──────────────────────────────────────────
  // WhatsApp/LinkedIn (non-Google → fine in an embedded webview) render as native child webviews
  // (webembed.rs) positioned over their panel body, so the real logged-in site is usable in-place.
  // Gmail/GitHub stay on the API (Gmail MCP-style) — Google login can't run in an embedded webview.
  // Native webviews paint above the DOM + can't be clipped, so we park them during drag and on leave;
  // the DOM placeholder behind stands in.
  const TITLEBAR = 34
  const tauriInvoke = async (cmd: string, args: Record<string, unknown>) => {
    try { const { invoke } = await import('@tauri-apps/api/core'); return await invoke(cmd, args) } catch { return null }
  }
  const embedUrl = (id: PanelId) => (id === 'whatsapp' ? 'https://web.whatsapp.com' : 'https://www.linkedin.com/feed/')
  // Gmail/GitHub can't run in an embedded webview (Google blocks login), so "dock" the REAL logged-in
  // Chrome app window onto the panel's on-screen rect — full real app, inside Piku's frame.
  const dockUrl = (id: PanelId) =>
    id === 'gmail'  ? `https://mail.google.com/mail/u/?authuser=${EMAIL[persona]}`
    : id === 'github' ? `https://github.com/${GH[persona]}`
    : embedUrl(id)
  const dockApp = async (id: PanelId) => {
    if (!geom) return
    const sr = surfaceRef.current?.getBoundingClientRect(); if (!sr) return
    const g = expanded === id ? { x: 8, y: 8, w: sr.width - 16, h: sr.height - 16 } : geom[id]
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      const win = getCurrentWindow()
      const pos = await win.outerPosition(); const scale = await win.scaleFactor()
      const x = pos.x / scale + sr.left + g.x
      const y = pos.y / scale + sr.top + g.y + TITLEBAR
      await invoke('dock_chrome_app', { url: dockUrl(id), x, y, w: g.w, h: Math.max(240, g.h - TITLEBAR) })
    } catch { /* not in the desktop app */ }
  }
  const rectOf = (id: PanelId, g: Record<PanelId, Geom>, exp: PanelId | null) => {
    const sr = surfaceRef.current?.getBoundingClientRect(); if (!sr) return null
    const gg = exp === id ? { x: 8, y: 8, w: sr.width - 16, h: sr.height - 16 } : g[id]
    return { x: sr.left + gg.x, y: sr.top + gg.y + TITLEBAR, w: gg.w, h: Math.max(1, gg.h - TITLEBAR) }
  }
  // create/navigate the embeds once geometry is known
  useEffect(() => {
    if (!geom) return
    for (const id of EMBED_IDS) {
      const r = rectOf(id, geom, expanded)
      const hidden = expanded != null && expanded !== id
      if (hidden || !r) { void tauriInvoke('hide_embed', { label: id }); continue }
      void tauriInvoke('embed_panel', { label: id, url: embedUrl(id), x: r.x, y: r.y, w: r.w, h: r.h })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geom !== null])
  // reposition on geometry / expand changes (skip mid-gesture — the drag handler parks them)
  useEffect(() => {
    if (!geom || interacting.current) return
    for (const id of EMBED_IDS) {
      const r = rectOf(id, geom, expanded)
      const hidden = expanded != null && expanded !== id
      if (hidden || !r) { void tauriInvoke('hide_embed', { label: id }); continue }
      void tauriInvoke('reposition_embed', { label: id, x: r.x, y: r.y, w: r.w, h: r.h })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geom, expanded])
  // park every embed when leaving the Apps screen
  useEffect(() => () => { void tauriInvoke('hide_all_embeds', {}) }, [])

  if (!geom) return <div ref={surfaceRef} className="absolute inset-0" />

  const bringToFront = (id: PanelId) => setGeom(g => g && ({ ...g, [id]: { ...g[id], z: ++zTop.current } }))

  const onPointerDown = (id: PanelId, mode: 'drag' | 'resize') => (e: React.PointerEvent) => {
    if (expanded) return
    e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const gx = geom[id]
    gesture.current = { id, mode, px: e.clientX, py: e.clientY, ox: gx.x, oy: gx.y, ow: gx.w, oh: gx.h }
    interacting.current = true
    if (EMBED_IDS.includes(id)) void tauriInvoke('hide_embed', { label: id })   // park the embed; placeholder shows while dragging
    bringToFront(id)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const gst = gesture.current; if (!gst) return
    const el = surfaceRef.current!; const cr = el.getBoundingClientRect()
    const dx = e.clientX - gst.px, dy = e.clientY - gst.py
    setGeom(g => {
      if (!g) return g
      const p = { ...g[gst.id] }
      if (gst.mode === 'drag') {
        p.x = clamp(gst.ox + dx, 0, cr.width - p.w)
        p.y = clamp(gst.oy + dy, 0, cr.height - p.h)
      } else {
        p.w = clamp(gst.ow + dx, MIN_W, cr.width - p.x)
        p.h = clamp(gst.oh + dy, MIN_H, cr.height - p.y)
      }
      return { ...g, [gst.id]: p }
    })
  }
  const endGesture = () => {
    const gst = gesture.current; if (!gst) return
    gesture.current = null
    setGeom(g => {
      if (!g) return g
      const p = { ...g[gst.id], x: snap(g[gst.id].x), y: snap(g[gst.id].y), w: snap(g[gst.id].w), h: snap(g[gst.id].h) }
      return { ...g, [gst.id]: p }
    })
    interacting.current = false
  }

  const toggleExpand = (id: PanelId) => {
    interacting.current = true
    setExpanded(cur => (cur === id ? null : id))
    requestAnimationFrame(() => { interacting.current = false; force() })
  }

  const fullRect = () => { const r = surfaceRef.current!.getBoundingClientRect(); return { x: 8, y: 8, w: r.width - 16, h: r.height - 16, z: 999 } as Geom }

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* header / persona toggle */}
      <div className="absolute top-0 left-0 right-0 h-12 flex items-center justify-between px-6 z-30 pointer-events-none">
        <div className="pointer-events-auto">
          <span className="text-[15px] font-semibold tracking-tight text-white/90">Apps</span>
          <span className="font-hud text-[10px] uppercase tracking-[0.2em] text-white/35 ml-3">{persona === 'office' ? EMAIL.office + ' · ' + GH.office : EMAIL.personal + ' · ' + GH.personal}</span>
        </div>
        <div className="pointer-events-auto flex items-center gap-1 font-hud text-[11px] uppercase tracking-wider">
          {(['office', 'personal'] as Persona[]).map(p => (
            <button key={p} onClick={() => setPersona(p)}
              className={`px-3.5 py-1.5 transition-colors ${persona === p ? 'text-white' : 'text-white/40 hover:text-white/70'}`}
              style={persona === p ? { clipPath: 'polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,8px 100%,0 calc(100% - 8px))', background: `rgba(${p === 'office' ? '34,211,238' : '217,70,239'},0.14)`, boxShadow: `inset 0 0 0 1px rgba(${p === 'office' ? '34,211,238' : '217,70,239'},0.4)` } : undefined}>{p}</button>
          ))}
        </div>
      </div>

      {/* the paper */}
      <div ref={surfaceRef} className="absolute inset-0 mt-12 cyber-grid"
        onPointerMove={onPointerMove} onPointerUp={endGesture} onPointerCancel={endGesture}>
        {PANELS.map(meta => {
          const g = expanded === meta.id ? fullRect() : geom[meta.id]
          const hidden = expanded != null && expanded !== meta.id
          return (
            <div key={meta.id}
              className="absolute flex flex-col bg-[#0a1120]/90 backdrop-blur-xl transition-[opacity] duration-150"
              style={{ left: g.x, top: g.y, width: g.w, height: g.h, zIndex: g.z, opacity: hidden ? 0 : 1, pointerEvents: hidden ? 'none' : 'auto', boxShadow: `inset 0 0 0 1px rgba(${accent},0.22), 0 18px 50px -20px rgba(0,0,0,0.8)`, clipPath: 'polygon(0 0,calc(100% - 12px) 0,100% 12px,100% 100%,12px 100%,0 calc(100% - 12px))' }}>
              {/* titlebar (drag handle) */}
              <div onPointerDown={onPointerDown(meta.id, 'drag')}
                className="h-[34px] shrink-0 flex items-center justify-between px-3 cursor-move select-none"
                style={{ borderBottom: `1px solid rgba(${accent},0.15)` }}>
                <span className="font-hud text-[10px] uppercase tracking-[0.18em] text-white/55 flex items-center gap-2">
                  <span className="w-1.5 h-1.5" style={{ background: `rgb(${accent})`, boxShadow: `0 0 7px rgba(${accent},0.7)` }} />
                  {meta.name}
                </span>
                <div className="flex items-center gap-1.5">
                  {(meta.id === 'gmail' || meta.id === 'github') && (
                    <button onClick={() => void dockApp(meta.id)}
                      className="font-hud text-[9px] uppercase tracking-wider text-cyan-300/70 hover:text-cyan-100 px-1.5 py-0.5 transition-colors"
                      style={{ boxShadow: `inset 0 0 0 1px rgba(${accent},0.3)` }}
                      title="Open the real, logged-in app docked here">⧉ real</button>
                  )}
                  <button onClick={() => toggleExpand(meta.id)} className="text-white/40 hover:text-cyan-200 text-xs px-1" title={expanded === meta.id ? 'restore' : 'expand'}>{expanded === meta.id ? '▢' : '⤢'}</button>
                </div>
              </div>
              {/* body */}
              <div className="flex-1 min-h-0 relative">
                {meta.id === 'gmail' ? <GmailDockPrompt persona={persona} accent={accent} onOpen={() => void dockApp('gmail')} />
                  : meta.id === 'github' ? <GitHubPanelBody persona={persona} />
                  : <LauncherPanelBody name={meta.name} accent={accent} />}
              </div>
              {/* resize handle (bottom-right) */}
              {expanded !== meta.id && (
                <div onPointerDown={onPointerDown(meta.id, 'resize')}
                  className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize"
                  style={{ background: `linear-gradient(135deg, transparent 50%, rgba(${accent},0.5) 50%)` }} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Gmail can't sign in inside an embedded webview (Google blocks it), so this clean prompt docks the
// REAL logged-in Chrome Gmail into the panel via dock_chrome_app (Chrome CAN sign into Google).
function GmailDockPrompt({ persona, accent, onOpen }: { persona: Persona; accent: string; onOpen: () => void }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="font-hud text-[13px] uppercase tracking-[0.22em]" style={{ color: `rgba(${accent},0.6)` }}>Gmail · {persona}</span>
      <span className="text-[11.5px] text-white/45 leading-relaxed max-w-[250px]">Google won't allow sign-in inside an embedded view — so open your real, logged-in Gmail docked right here:</span>
      <button onClick={onOpen}
        className="font-hud text-[11px] uppercase tracking-wider px-4 py-2 transition-colors hover:brightness-125"
        style={{ color: `rgba(${accent},0.9)`, boxShadow: `inset 0 0 0 1px rgba(${accent},0.45)` }}>
        ⧉ Open real Gmail here →
      </button>
      <span className="font-hud text-[8.5px] text-white/25 uppercase tracking-wider">{EMAIL[persona]}</span>
    </div>
  )
}

// Placeholder shown BEHIND the embedded webview (visible only while dragging, when the embed is parked).
function LauncherPanelBody({ name, accent }: { name: string; accent: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6">
      <span className="font-hud text-[13px] uppercase tracking-[0.25em]" style={{ color: `rgba(${accent},0.5)` }}>{name}</span>
      <span className="font-hud text-[9px] text-white/25 uppercase tracking-wider">embedded · inside Piku</span>
    </div>
  )
}


function GitHubPanelBody({ persona }: { persona: Persona }) {
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
      {missing ? <div className="text-[11px] text-amber-300/60">No {persona} GitHub ({GH[persona]}) connected — Settings → GitHub.</div>
        : data === null ? <div className="text-[11px] text-white/30 font-hud">loading…</div>
        : <>
            <div className="flex items-end gap-2">
              <span className="font-hud text-[30px] leading-none text-white/90 tabular-nums">{data.total}</span>
              <span className="font-hud text-[10px] uppercase tracking-wider text-white/40 mb-1">commits · 7d · @{GH[persona]}</span>
            </div>
            <div className="mt-3 flex flex-col gap-1.5">
              {data.repos.length === 0 ? <div className="text-[11px] text-white/30">no commits in the last 7 days</div>
                : data.repos.map(r => <div key={r} className="text-[12px] text-white/70 truncate flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-cyan-400/70" />{r}</div>)}
            </div>
          </>}
    </div>
  )
}
