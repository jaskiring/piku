import { useEffect, useRef, useState, useCallback } from 'react'
import { graphService }                              from '../index'
import type { Galaxy }                               from '../types'
import { NODE_COLORS, DEFAULT_NODE_COLOR } from '../types'
import { chamfer, CornerTicks }            from '../../os/Hud'
import { GraphPanel }                      from './GraphPanel'

// Force-directed knowledge graph as a cosmic void.
// Renders a mock graph synchronously (never empty), then swaps in real data
// from IndexedDB. Pannable, zoomable, pulse on click.

// ── Types & constants ──────────────────────────────────────────────────────

interface PNode { id: string; name: string; type: string; x: number; y: number; vx: number; vy: number; deg: number }
interface PLink { from: string; to: string }
type RawNode = { id: string; name: string; type: string }

const W = 1600
const H = 1000
const PULSE_DURATION = 800
const EDGE_STAGGER   = 80
const NEIGHBOUR_DELAY = 120

// ── Mock data ──────────────────────────────────────────────────────────────

const MOCK_NODES: RawNode[] = [
  { id: 'piku', name: 'Piku', type: 'project' },
  { id: 'opencode', name: 'OpenCode', type: 'project' },
  { id: 'wm', name: 'World Model', type: 'concept' },
  { id: 'obs', name: 'Observation Loop', type: 'goal' },
  { id: 'graph', name: 'Knowledge Graph', type: 'concept' },
  { id: 'mem', name: 'Memory', type: 'memory' },
  { id: 'ollama', name: 'Ollama', type: 'technology' },
  { id: 'qwen', name: 'qwen3', type: 'technology' },
  { id: 'tauri', name: 'Tauri', type: 'technology' },
  { id: 'jas', name: 'Jaskirat', type: 'person' },
  { id: 'local', name: 'Local-first', type: 'decision' },
  { id: 'companion', name: 'Ambient Companion', type: 'goal' },
  { id: 'pulse', name: 'Pulse Edge Animation', type: 'concept' },
  { id: 'galaxy', name: 'Galaxy Clustering', type: 'concept' },
  { id: 'void', name: 'Cosmic Void Theme', type: 'concept' },
  { id: 'voice', name: 'Voice Interface', type: 'skill' },
  { id: 'extract', name: 'Graph Extraction', type: 'skill' },
  { id: 'embed', name: 'Semantic Embeddings', type: 'skill' },
  { id: 'rust', name: 'Rust Backend', type: 'technology' },
  { id: 'notion', name: 'Notion Sync', type: 'decision' },
  { id: 'multi', name: 'Multi-model Routing', type: 'goal' },
  { id: 'persona', name: 'Persona-as-Data', type: 'concept' },
  { id: 'privacy', name: 'Privacy Layer', type: 'decision' },
]
const MOCK_LINKS: PLink[] = [
  ['piku', 'wm'], ['piku', 'obs'], ['piku', 'tauri'], ['piku', 'ollama'],
  ['wm', 'graph'], ['wm', 'mem'], ['ollama', 'qwen'], ['jas', 'piku'],
  ['piku', 'local'], ['graph', 'obs'], ['piku', 'companion'], ['obs', 'companion'],
  ['opencode', 'graph'], ['opencode', 'pulse'], ['opencode', 'galaxy'], ['opencode', 'void'],
  ['opencode', 'rust'], ['opencode', 'jas'], ['pulse', 'galaxy'], ['void', 'galaxy'],
  ['voice', 'multi'], ['voice', 'persona'], ['extract', 'graph'], ['embed', 'mem'],
  ['rust', 'tauri'], ['notion', 'local'], ['multi', 'ollama'], ['persona', 'privacy'],
].map(([from, to]) => ({ from, to }))

// ── Force layout helpers ──────────────────────────────────────────────────

function toPNodes(raw: RawNode[]): PNode[] {
  return raw.map(n => ({
    ...n,
    x: W / 2 + (Math.random() - 0.5) * W * 0.6,
    y: H / 2 + (Math.random() - 0.5) * H * 0.6,
    vx: 0, vy: 0, deg: 0,
  }))
}

function computeLayout(nodes: PNode[], links: PLink[]): void {
  const byId = new Map(nodes.map(n => [n.id, n]))
  for (const l of links) { const a = byId.get(l.from), b = byId.get(l.to); if (a) a.deg++; if (b) b.deg++ }
  const REPULSE = 9000, SPRING = 0.012, LINK_LEN = 110, GRAVITY = 0.025, DAMP = 0.85
  for (let it = 0; it < 300; it++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j]
        const dx = a.x - b.x, dy = a.y - b.y
        const d2 = dx * dx + dy * dy || 0.01
        const d = Math.sqrt(d2)
        const f = REPULSE / d2
        a.vx += (dx / d) * f; a.vy += (dy / d) * f
        b.vx -= (dx / d) * f; b.vy -= (dy / d) * f
      }
    }
    for (const l of links) {
      const a = byId.get(l.from), b = byId.get(l.to)
      if (!a || !b) continue
      const dx = b.x - a.x, dy = b.y - a.y
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01
      const f = (d - LINK_LEN) * SPRING
      a.vx += (dx / d) * f; a.vy += (dy / d) * f
      b.vx -= (dx / d) * f; b.vy -= (dy / d) * f
    }
    for (const n of nodes) {
      n.vx += (W / 2 - n.x) * GRAVITY; n.vy += (H / 2 - n.y) * GRAVITY
      n.vx *= DAMP; n.vy *= DAMP
      n.x += n.vx; n.y += n.vy
    }
  }
}

function buildGraph(rawNodes: RawNode[], links: PLink[]): { nodes: PNode[]; links: PLink[] } {
  const nodes = toPNodes(rawNodes)
  computeLayout(nodes, links)
  return { nodes, links }
}

// ── Star field ─────────────────────────────────────────────────────────────

function buildStars(): { x: number; y: number; r: number; op: number }[] {
  const stars: { x: number; y: number; r: number; op: number }[] = []
  for (let i = 0; i < 180; i++) {
    stars.push({
      x: Math.random() * W,
      y: Math.random() * H,
      r: 0.2 + Math.random() * 1.2,
      op: 0.08 + Math.random() * 0.18,
    })
  }
  return stars
}

// ── Component ─────────────────────────────────────────────────────────────

export function GraphCanvas({ focusGalaxyId, onFocusHandled }: { focusGalaxyId?: string | null; onFocusHandled?: () => void }) {
  const [graph, setGraph] = useState(() => buildGraph(MOCK_NODES, MOCK_LINKS))
  const [view, setView] = useState({ tx: 0, ty: 0, k: 0.62 })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [galaxies, setGalaxies] = useState<Galaxy[]>([])
  const stars = useRef(buildStars()).current

  const containerRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number } | null>(null)
  const moved = useRef(false)
  const byId = new Map(graph.nodes.map(n => [n.id, n]))

  // Pulse animation refs
  const pulseStart = useRef(0)
  const pulseEdges = useRef<Set<number>>(new Set())
  const pulseNbrs  = useRef<Set<string>>(new Set())
  const pulseRaf   = useRef(0)
  const [, tick]   = useState(0)

  useEffect(() => () => cancelAnimationFrame(pulseRaf.current), [])

  // Load real data from IndexedDB
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const allNodes = await graphService.getAllNodes()
        if (cancelled || allNodes.length === 0) return
        const raw: RawNode[] = allNodes.map(n => ({ id: n.id, name: n.name, type: n.type }))
        const confirmed = await graphService.getConfirmedEdges()
        const links: PLink[] = confirmed.map(e => ({ from: e.fromId, to: e.toId }))
        setGraph(buildGraph(raw, links))
        const g = await graphService.getGalaxies()
        if (!cancelled) setGalaxies(g)
      } catch { /* keep mock */ }
    })()
    return () => { cancelled = true }
  }, [])

  // Fit view
  const fitView = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const vw = el.clientWidth, vh = el.clientHeight
    if (vw === 0 || vh === 0) { requestAnimationFrame(() => fitView()); return }
    if (graph.nodes.length === 0) return
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const n of graph.nodes) {
      minX = Math.min(minX, n.x); minY = Math.min(minY, n.y)
      maxX = Math.max(maxX, n.x); maxY = Math.max(maxY, n.y)
    }
    const pad = 130
    const bw = (maxX - minX) + pad * 2, bh = (maxY - minY) + pad * 2
    const k = Math.max(0.3, Math.min(1.5, Math.min(vw / bw, vh / bh)))
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
    setView({ tx: vw / 2 - cx * k, ty: vh / 2 - cy * k - vh * 0.04, k })
  }, [graph])

  useEffect(() => { fitView() }, [fitView])

  // Handle external focus request
  useEffect(() => {
    if (!focusGalaxyId || galaxies.length === 0) return
    const match = galaxies.find(g => g.name.toLowerCase() === focusGalaxyId)
    if (match) setSelectedId(match.nodes[0]?.id ?? null)
    onFocusHandled?.()
  }, [focusGalaxyId, galaxies, onFocusHandled])

  // ── Pulse handler ───────────────────────────────────────────────────────
  const handleSelect = useCallback((id: string) => {
    cancelAnimationFrame(pulseRaf.current)
    setSelectedId(id)

    const edgeIds = new Set<number>()
    const nbrIds  = new Set<string>()
    for (let i = 0; i < graph.links.length; i++) {
      const l = graph.links[i]
      if (l.from === id) { edgeIds.add(i); nbrIds.add(l.to) }
      if (l.to   === id) { edgeIds.add(i); nbrIds.add(l.from) }
    }
    pulseEdges.current = edgeIds
    pulseNbrs.current  = nbrIds
    pulseStart.current = Date.now()

    const animate = () => {
      if (Date.now() - pulseStart.current > PULSE_DURATION + EDGE_STAGGER * edgeIds.size) {
        tick(n => n + 1); return
      }
      tick(n => n + 1)
      pulseRaf.current = requestAnimationFrame(animate)
    }
    pulseRaf.current = requestAnimationFrame(animate)
  }, [graph])

  // ── Pan / zoom handlers ─────────────────────────────────────────────────
  const onWheel = useCallback((e: React.WheelEvent) => {
    setView(v => ({ ...v, k: Math.min(2.5, Math.max(0.2, v.k * (e.deltaY < 0 ? 1.1 : 0.9))) }))
  }, [])
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY }; moved.current = false
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }, [])
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current) return
    const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y
    if (Math.abs(dx) + Math.abs(dy) > 2) moved.current = true
    drag.current = { x: e.clientX, y: e.clientY }
    setView(v => ({ ...v, tx: v.tx + dx, ty: v.ty + dy }))
  }, [])
  const onPointerUp = useCallback(() => { drag.current = null }, [])

  // ── Derived data ─────────────────────────────────────────────────────────
  const selected = selectedId ? byId.get(selectedId) : undefined
  const neighbors = selected
    ? Array.from(new Set(
        graph.links
          .filter(l => l.from === selected.id || l.to === selected.id)
          .map(l => (l.from === selected.id ? l.to : l.from))
      )).map(id => byId.get(id)).filter((n): n is PNode => !!n)
    : []

  const q = query.trim().toLowerCase()
  const nodeTypeCounts: Record<string, number> = {}
  for (const n of graph.nodes) { nodeTypeCounts[n.type] = (nodeTypeCounts[n.type] ?? 0) + 1 }

  const pulseElapsed = Date.now() - pulseStart.current
  const pulseActive = pulseStart.current > 0 && pulseElapsed < PULSE_DURATION + EDGE_STAGGER * Math.max(pulseEdges.current.size, 1)

  const starsRendered = useRef(false)
  if (!starsRendered.current) { starsRendered.current = true }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden">
      <svg
        className="absolute inset-0 w-full h-full"
        style={{ cursor: 'grab' }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <g transform={`translate(${view.tx}, ${view.ty}) scale(${view.k})`}>
          {/* Star field — void background */}
          {stars.map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="white" opacity={s.op} />
          ))}

          {/* Edges */}
          {graph.links.map((l, i) => {
            const a = byId.get(l.from), b = byId.get(l.to)
            if (!a || !b) return null
            const isSelectedEdge = selected && (l.from === selected.id || l.to === selected.id)
            const isPulsing = pulseEdges.current.has(i)
            let pulseOp = 0
            if (isPulsing && pulseActive) {
              const edgeOrder = [...pulseEdges.current].indexOf(i)
              const localElapsed = pulseElapsed - edgeOrder * EDGE_STAGGER
              const phase = Math.max(0, Math.min(1, localElapsed / 600))
              pulseOp = phase < 0.5 ? phase * 2 : (1 - phase) * 2
            }
            return (
              <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke="#3B82F6"
                strokeOpacity={isPulsing ? 0.18 + pulseOp * 0.72 : (isSelectedEdge ? 0.5 : 0.18)}
                strokeWidth={isPulsing ? 1.6 + pulseOp * 1.4 : (isSelectedEdge ? 1.8 : 1.2)} />
            )
          })}

          {/* Nodes */}
          {graph.nodes.map(n => {
            const c = NODE_COLORS[n.type] ?? DEFAULT_NODE_COLOR
            const r = 5 + Math.min(10, n.deg * 1.6)
            const isSelected = selected?.id === n.id
            const isNeighbor = neighbors.some(nb => nb.id === n.id)
            const selDim = selected && !isSelected && !isNeighbor
            const qDim = q.length > 0 && !n.name.toLowerCase().includes(q)
            const dim = selDim || qDim

            const isPulseNbr = pulseNbrs.current.has(n.id)
            let nbrPulse = 0
            if (isPulseNbr && pulseActive) {
              const nbrOrder = [...pulseNbrs.current].indexOf(n.id)
              const localElapsed = pulseElapsed - nbrOrder * NEIGHBOUR_DELAY
              const phase = Math.max(0, Math.min(1, localElapsed / 500))
              nbrPulse = phase < 0.4 ? phase / 0.4 : Math.max(0, (1 - phase) / 0.6)
            }

            let glowPulse = 1
            if (isSelected && pulseActive) {
              glowPulse = 0.6 + 0.4 * Math.sin((pulseElapsed / 800) * Math.PI)
            }

            return (
              <g key={n.id} onClick={() => handleSelect(n.id)} style={{ cursor: 'pointer' }}>
                <circle cx={n.x} cy={n.y} r={r + 13} fill={c} opacity={dim ? 0.03 : (isSelected ? 0.15 * glowPulse : 0.10)} />
                <circle cx={n.x} cy={n.y} r={r + 4} fill={c} opacity={dim ? 0.08 : (isSelected ? 0.45 * glowPulse : 0.30)} />
                <circle cx={n.x} cy={n.y} r={r} fill={c} opacity={dim ? 0.3 : (isSelected ? 1 : 0.85 + nbrPulse * 0.15)} />
                <circle cx={n.x - r * 0.32} cy={n.y - r * 0.32} r={r * 0.42} fill="#ffffff" opacity={dim ? 0 : (0.55 + nbrPulse * 0.3)} />
                {isSelected && (
                  <>
                    <circle cx={n.x} cy={n.y} r={r + 6} fill="none" stroke={c} strokeOpacity={0.3 * glowPulse} strokeWidth={3} />
                    <circle cx={n.x} cy={n.y} r={r + 4} fill="none" stroke={c} strokeOpacity={0.8 * glowPulse} strokeWidth={1.5} />
                  </>
                )}
                <text x={n.x} y={n.y + r + 13} textAnchor="middle"
                  fontSize={12} fill="#ffffff" fillOpacity={dim ? 0.18 : (isSelected ? 0.85 : 0.6)}
                  style={{ pointerEvents: 'none' }}>
                  {n.name}
                </text>
              </g>
            )
          })}
        </g>
      </svg>

      {/* ── HUD overlays ─────────────────────────────────────────────── */}

      {/* Search bar */}
      <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30">
        <div className="relative flex items-center gap-2 px-4 py-2 bg-[#0a1120]/80 backdrop-blur-xl"
          style={{ ...chamfer(8), boxShadow: 'inset 0 0 0 1px rgba(34,211,238,0.25), 0 8px 30px -10px rgba(0,0,0,0.7)' }}>
          <CornerTicks accent="cyan" />
          <span className="font-hud text-white/30 text-xs">⌕</span>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="filter the graph…"
            className="font-hud bg-transparent text-xs text-white/85 placeholder:text-white/30 outline-none w-44" />
          {query && <button onClick={() => setQuery('')} className="font-hud text-white/30 hover:text-white/65 text-xs">✕</button>}
        </div>
      </div>

      {/* Node detail card */}
      {selected && (
        <div className="absolute top-28 right-6 w-72 z-30">
          <div className="relative p-4 bg-[#0a1120]/90 backdrop-blur-xl"
            style={{ ...chamfer(12), boxShadow: `inset 0 0 0 1px ${NODE_COLORS[selected.type] ?? DEFAULT_NODE_COLOR}44, 0 18px 40px rgba(0,0,0,0.6)` }}>
            <CornerTicks accent="cyan" />
            <div className="flex items-center justify-between mb-2">
              <span className="font-hud text-[10px] uppercase tracking-[0.2em]"
                style={{ color: NODE_COLORS[selected.type] ?? DEFAULT_NODE_COLOR }}>
                {selected.type}
              </span>
              <button onClick={() => setSelectedId(null)}
                className="font-hud text-white/30 hover:text-white/70 text-xs leading-none">✕</button>
            </div>
            <div className="font-hud text-white/90 text-sm mb-3">{selected.name}</div>
            <div className="font-hud text-[9px] uppercase tracking-[0.15em] text-white/30 mb-1.5">
              Connected to ({neighbors.length})
            </div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {neighbors.length ? neighbors.map(nb => (
                <button key={nb.id} onClick={() => handleSelect(nb.id)}
                  className="font-hud text-[10px] text-white/55 hover:text-white/85 bg-white/5 hover:bg-white/10 border border-white/10 px-2 py-0.5 transition-colors">
                  {nb.name}
                </button>
              )) : <span className="font-hud text-[10px] text-white/25">nothing yet</span>}
            </div>
            <div className="flex gap-2">
              <button className="font-hud text-[10px] text-blue-300/60 hover:text-blue-300 border border-blue-400/20 px-2.5 py-1 transition-colors">ask about this</button>
              <button className="font-hud text-[10px] text-white/30 hover:text-white/55 border border-white/10 px-2.5 py-1 transition-colors">open in Vault</button>
            </div>
          </div>
        </div>
      )}

      {/* Fit view button */}
      <button onClick={fitView}
        className="absolute bottom-7 left-6 z-40 font-hud text-[9px] uppercase tracking-[0.15em] text-white/30 hover:text-white/60 bg-[#0a1120]/70 backdrop-blur-xl px-3 py-2 transition-colors"
        style={{ ...chamfer(6), boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.07)' }}>
        ⊡ fit
      </button>

      {/* Stats panel */}
      <GraphPanel
        viewMode="micro"
        activeGalaxy={null}
        galaxies={galaxies}
        nodeCount={graph.nodes.length}
        edgeCount={graph.links.length}
        nodeTypeCounts={nodeTypeCounts} />
    </div>
  )
}