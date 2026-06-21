import { useEffect, useReducer, useRef, useState } from 'react'
import type { MailSummary } from '../../../services/accounts'
import { accountService, gmailConnector, gitHubConnector } from '../../../services/accounts'
import { embedPanel, hideEmbed, hideAllEmbeds } from '../../../services/embed'

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
const EMBED = {
  whatsapp: { label: 'wa', url: 'https://web.whatsapp.com' },
  linkedin: { label: 'li', url: 'https://www.linkedin.com/feed/' },
}
const GRID = 24
const MIN_W = 300
const MIN_H = 220
const LS_LAYOUT = 'piku.canvas.layout.v1'
const LS_PERSONA = 'piku.canvas.persona'

const PANELS: { id: PanelId; name: string; kind: 'dom' | 'embed' }[] = [
  { id: 'gmail',    name: 'Gmail',    kind: 'dom' },
  { id: 'github',   name: 'GitHub',   kind: 'dom' },
  { id: 'whatsapp', name: 'WhatsApp', kind: 'embed' },
  { id: 'linkedin', name: 'LinkedIn', kind: 'embed' },
]

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const snap = (v: number) => Math.round(v / GRID) * GRID
const overlaps = (a: Geom, b: Geom, gut = 12) =>
  a.x < b.x + b.w + gut && a.x + a.w + gut > b.x && a.y < b.y + b.h + gut && a.y + a.h + gut > b.y

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
  const bodyRefs: Record<'whatsapp' | 'linkedin', React.RefObject<HTMLDivElement>> = {
    whatsapp: useRef<HTMLDivElement>(null),
    linkedin: useRef<HTMLDivElement>(null),
  }
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

  // position the embedded webviews to follow their frames (skip while a gesture is in flight)
  const placeEmbeds = () => {
    for (const key of ['whatsapp', 'linkedin'] as const) {
      const { label, url } = EMBED[key]
      if (expanded && expanded !== key) { void hideEmbed(label); continue }
      const el = bodyRefs[key].current
      if (!el) { void hideEmbed(label); continue }
      const r = el.getBoundingClientRect()
      if (r.width < 2 || r.height < 2) { void hideEmbed(label); continue }
      void embedPanel(label, url, { x: r.x, y: r.y, width: r.width, height: r.height })
    }
  }
  useEffect(() => {
    if (!geom || interacting.current) return
    const id = requestAnimationFrame(placeEmbeds)
    return () => cancelAnimationFrame(id)
  }, [geom, expanded])  // eslint-disable-line react-hooks/exhaustive-deps

  // hide embeds when leaving the screen; reposition on window resize
  useEffect(() => {
    const onResize = () => {
      const el = surfaceRef.current; if (!el || !geom) return
      const r = el.getBoundingClientRect()
      setGeom(g => {
        if (!g) return g
        const n = { ...g }
        for (const id of Object.keys(n) as PanelId[]) {
          n[id] = { ...n[id], w: clamp(n[id].w, MIN_W, r.width), h: clamp(n[id].h, MIN_H, r.height) }
          n[id].x = clamp(n[id].x, 0, Math.max(0, r.width - n[id].w))
          n[id].y = clamp(n[id].y, 0, Math.max(0, r.height - n[id].h))
        }
        return n
      })
    }
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize); void hideAllEmbeds() }
  }, [geom])

  if (!geom) return <div ref={surfaceRef} className="absolute inset-0" />

  const bringToFront = (id: PanelId) => setGeom(g => g && ({ ...g, [id]: { ...g[id], z: ++zTop.current } }))

  const onPointerDown = (id: PanelId, mode: 'drag' | 'resize') => (e: React.PointerEvent) => {
    if (expanded) return
    e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const gx = geom[id]
    gesture.current = { id, mode, px: e.clientX, py: e.clientY, ox: gx.x, oy: gx.y, ow: gx.w, oh: gx.h }
    interacting.current = true
    void hideAllEmbeds()             // nothing occludes a moving DOM panel
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
      let n = { ...g, [gst.id]: p }
      n = nudge(n, gst.id, surfaceRef.current!.getBoundingClientRect())
      return n
    })
    interacting.current = false
    force()  // ensure the place-embeds effect re-runs after commit
  }

  // keep embeds from ever sitting under a DOM panel: push the moved panel out of any overlap
  function nudge(g: Record<PanelId, Geom>, moved: PanelId, cr: DOMRect): Record<PanelId, Geom> {
    const isEmbed = (id: PanelId) => id === 'whatsapp' || id === 'linkedin'
    const others = (Object.keys(g) as PanelId[]).filter(id => id !== moved)
    const p = { ...g[moved] }
    for (const oid of others) {
      if (!isEmbed(moved) && !isEmbed(oid)) continue  // dom-vs-dom may overlap freely
      const o = g[oid]
      if (overlaps(p, o)) {
        // push right or down to nearest free edge, clamped to canvas
        const right = o.x + o.w + 16
        if (right + p.w <= cr.width) p.x = right
        else { const below = o.y + o.h + 16; if (below + p.h <= cr.height) p.y = below; else p.x = Math.max(0, o.x - p.w - 16) }
      }
    }
    return { ...g, [moved]: p }
  }

  const toggleExpand = (id: PanelId) => {
    interacting.current = true; void hideAllEmbeds()
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
          const isEmbed = meta.kind === 'embed'
          return (
            <div key={meta.id}
              className="absolute flex flex-col bg-[#0a1120]/90 backdrop-blur-xl transition-[opacity] duration-150"
              style={{ left: g.x, top: g.y, width: g.w, height: g.h, zIndex: g.z, opacity: hidden ? 0 : 1, pointerEvents: hidden ? 'none' : 'auto', boxShadow: `inset 0 0 0 1px rgba(${accent},0.22), 0 18px 50px -20px rgba(0,0,0,0.8)`, clipPath: 'polygon(0 0,calc(100% - 12px) 0,100% 12px,100% 100%,12px 100%,0 calc(100% - 12px))' }}>
              {/* titlebar (drag handle) */}
              <div onPointerDown={onPointerDown(meta.id, 'drag')}
                className="h-[34px] shrink-0 flex items-center justify-between px-3 cursor-move select-none"
                style={{ borderBottom: `1px solid rgba(${accent},0.15)` }}>
                <span className="font-hud text-[10px] uppercase tracking-[0.18em] text-white/55 flex items-center gap-2">
                  <span className="w-1.5 h-1.5" style={{ background: `rgb(${isEmbed ? '255,255,255' : accent})`, opacity: isEmbed ? 0.4 : 1, boxShadow: isEmbed ? 'none' : `0 0 7px rgba(${accent},0.7)` }} />
                  {meta.name}
                </span>
                <button onClick={() => toggleExpand(meta.id)} className="text-white/40 hover:text-cyan-200 text-xs px-1" title={expanded === meta.id ? 'restore' : 'expand'}>{expanded === meta.id ? '▢' : '⤢'}</button>
              </div>
              {/* body */}
              <div className="flex-1 min-h-0 relative">
                {isEmbed
                  ? <div ref={bodyRefs[meta.id as 'whatsapp' | 'linkedin']} className="absolute inset-0">
                      <div className="absolute inset-0 flex items-center justify-center text-white/20 font-hud text-[10px] uppercase tracking-[0.3em] pointer-events-none">{meta.name}</div>
                    </div>
                  : meta.id === 'gmail' ? <GmailPanelBody persona={persona} /> : <GitHubPanelBody persona={persona} />}
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

function mailTime(raw: string): string {
  const d = new Date(raw); if (isNaN(d.getTime())) return ''
  const now = new Date()
  return d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function GmailPanelBody({ persona }: { persona: Persona }) {
  const [mail, setMail] = useState<MailSummary[] | null>(null)
  const [missing, setMissing] = useState(false)
  useEffect(() => {
    let c = false; setMail(null); setMissing(false)
    void (async () => {
      const accts = await accountService.getByService('email')
      const a = accts.find(x => (x.email ?? '').toLowerCase() === EMAIL[persona])
      if (!a || !a.token) { if (!c) setMissing(true); return }
      try { const m = await gmailConnector.search(a, 'in:inbox newer_than:14d', 30); if (!c) setMail(m) } catch { if (!c) setMail([]) }
    })()
    return () => { c = true }
  }, [persona])
  return (
    <div className="absolute inset-0 overflow-y-auto px-3 py-2">
      {missing ? <div className="text-[11px] text-amber-300/60 p-2">No {persona} Gmail connected — add {EMAIL[persona]} in Settings → Gmail.</div>
        : mail === null ? <div className="text-[11px] text-white/30 p-2 font-hud">loading inbox…</div>
        : mail.length === 0 ? <div className="text-[11px] text-white/30 p-2">inbox empty (14d)</div>
        : mail.map(m => {
          const name = (m.from.replace(/<.*>/, '').replace(/"/g, '').trim() || m.from).slice(0, 40)
          return (
            <div key={m.id} className="flex items-start gap-2.5 py-2 border-b border-white/[0.04]">
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] shrink-0 ${m.unread ? 'bg-cyan-500/25 text-cyan-100' : 'bg-white/10 text-white/50'}`}>{(name[0] || '?').toUpperCase()}</span>
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
        })}
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
