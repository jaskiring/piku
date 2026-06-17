import { useEffect, useRef, useState } from 'react'
import type { NavKey } from './Sidebar'
import { projectService } from '../projects/components/ProjectDashboard'
import { graphService } from '../graph'

// The Command Center — Piku's home as a living neural system, rendered like a real instrument
// panel rather than a toy: luminous glass nodes lit from within, energy conduits running from a
// central reactor Core to each surface, a drifting nebula for depth, film grain + vignette for a
// cinematic finish. Object-based and sidebar-free: hover a node to reveal it, CLICK to enter that
// surface, click the Core to talk. One cool accent spectrum — no candy colours.

interface Props { onNavigate: (k: NavKey) => void; onTalk: () => void }

interface Node {
  key: NavKey; name: string; count: string; hue: number
  ringFrac: number; angle: number; speed: number; rScale: number
  x: number; y: number; screenR: number; depth: number
}
interface Star { x: number; y: number; z: number; s: number; tw: number }
interface AgentDot { ringFrac: number; angle: number; speed: number; trail: { x: number; y: number }[] }
interface Cloud { x: number; y: number; r: number; hue: number; dx: number; dy: number }

const TAU = Math.PI * 2
const SQUASH = 0.56            // vertical foreshortening of the orbital plane
const RINGS = [0.46, 0.37, 0.28, 0.19]

// the orbiting surfaces — these ARE the navigation (no sidebar). Hues stay in one cool band
// (teal → cyan → blue → indigo → soft violet) so every node reads as lit by the same light.
const SURFACES: { key: NavKey; name: string; hue: number }[] = [
  { key: 'agent',     name: 'Agent',     hue: 190 },
  { key: 'projects',  name: 'Projects',  hue: 222 },
  { key: 'knowledge', name: 'Knowledge', hue: 200 },
  { key: 'models',    name: 'Models',    hue: 210 },
  { key: 'calendar',  name: 'Calendar',  hue: 235 },
  { key: 'people',    name: 'People',    hue: 255 },
  { key: 'apps',      name: 'Apps',      hue: 178 },
  { key: 'datasets',  name: 'Datasets',  hue: 245 },
]

export function CommandCenter({ onNavigate, onTalk }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [now, setNow] = useState(() => new Date())

  const nodes = useRef<Node[]>(SURFACES.map((s, i) => ({
    key: s.key, name: s.name, count: '', hue: s.hue,
    ringFrac: RINGS[i % RINGS.length],
    angle: i * 2.39996,                                   // golden-angle spread → no clumping
    speed: 0.00012 + (i % RINGS.length) * 0.000018,       // inner rings drift a touch faster
    rScale: 1.18 - (i % RINGS.length) * 0.12,             // closer rings render slightly larger
    x: 0, y: 0, screenR: 0, depth: 0,
  })))
  const stars   = useRef<Star[]>([])
  const clouds  = useRef<Cloud[]>([])
  const agents  = useRef<AgentDot[]>(Array.from({ length: 3 }, (_, i) => ({ ringFrac: RINGS[i % RINGS.length], angle: i * 2.1, speed: 0.0009 + i * 0.00035, trail: [] })))
  const mouse   = useRef({ x: 0.5, y: 0.5, px: -1, py: -1 })
  const par     = useRef({ x: 0, y: 0 })                  // smoothed parallax for fluid motion
  const hover   = useRef<NavKey | null>(null)
  const coreHover = useRef(false)
  const coreR   = useRef(36)

  useEffect(() => { const id = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(id) }, [])

  // live counts on the nodes (real where we have it)
  useEffect(() => {
    let cancelled = false
    const set = (key: NavKey, count: string) => { const n = nodes.current.find(nd => nd.key === key); if (n && !cancelled) n.count = count }
    void (async () => {
      try { const ps = await projectService.getAllProjects(); set('projects', `${ps.length} active`) } catch { /* skip */ }
      try { const ns = await graphService.getAllNodes(); set('knowledge', `${ns.length} nodes`) } catch { /* skip */ }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    let raf = 0, t = 0
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    // build a static film-grain tile once; we just jitter its offset each frame for live grain.
    const noise = document.createElement('canvas'); noise.width = 180; noise.height = 180
    const nctx = noise.getContext('2d')!
    const img = nctx.createImageData(180, 180)
    for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255 }
    nctx.putImageData(img, 0, 0)
    const grain = ctx.createPattern(noise, 'repeat')!

    const resize = () => {
      const r = canvas.getBoundingClientRect()
      canvas.width = r.width * dpr; canvas.height = r.height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      stars.current = Array.from({ length: 220 }, () => ({ x: Math.random() * r.width, y: Math.random() * r.height, z: Math.random(), s: Math.random() * 1.3 + 0.25, tw: Math.random() * TAU }))
      clouds.current = [
        { x: r.width * 0.30, y: r.height * 0.36, r: Math.max(r.width, r.height) * 0.42, hue: 205, dx: 0.018, dy: 0.010 },
        { x: r.width * 0.72, y: r.height * 0.62, r: Math.max(r.width, r.height) * 0.36, hue: 235, dx: -0.014, dy: -0.012 },
        { x: r.width * 0.55, y: r.height * 0.50, r: Math.max(r.width, r.height) * 0.30, hue: 188, dx: 0.010, dy: -0.008 },
      ]
    }
    resize()
    window.addEventListener('resize', resize)

    const onMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect()
      mouse.current.x = (e.clientX - r.left) / r.width
      mouse.current.y = (e.clientY - r.top) / r.height
      mouse.current.px = e.clientX - r.left
      mouse.current.py = e.clientY - r.top
      let h: NavKey | null = null
      let best = Infinity
      for (const n of nodes.current) { const d = Math.hypot(mouse.current.px - n.x, mouse.current.py - n.y); if (d < n.screenR + 18 && d < best) { best = d; h = n.key } }
      hover.current = h
      coreHover.current = Math.hypot(mouse.current.px - r.width / 2, mouse.current.py - r.height / 2) < coreR.current + 14
      canvas.style.cursor = (h || coreHover.current) ? 'pointer' : 'default'
    }
    const onLeave = () => { hover.current = null; coreHover.current = false }
    const onClick = () => {
      if (coreHover.current) { onTalk(); return }
      const n = nodes.current.find(nd => Math.hypot(mouse.current.px - nd.x, mouse.current.py - nd.y) < nd.screenR + 18)
      if (n) onNavigate(n.key)
    }
    canvas.addEventListener('mousemove', onMove)
    canvas.addEventListener('mouseleave', onLeave)
    canvas.addEventListener('click', onClick)

    const draw = () => {
      const r = canvas.getBoundingClientRect(), w = r.width, h = r.height, cx = w / 2, cy = h / 2
      const unit = Math.min(w, h)
      t += 1

      // smoothed parallax — eases toward the cursor so the whole scene moves continuously
      par.current.x += ((mouse.current.x - 0.5) - par.current.x) * 0.05
      par.current.y += ((mouse.current.y - 0.5) - par.current.y) * 0.05
      const pX = par.current.x, pY = par.current.y

      // ── deep-space base ──────────────────────────────────────────────
      const bg = ctx.createRadialGradient(cx, cy * 0.92, 0, cx, cy, Math.max(w, h) * 0.8)
      bg.addColorStop(0, '#0a1320'); bg.addColorStop(0.5, '#060b15'); bg.addColorStop(1, '#02040a')
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h)

      // drifting nebula for depth (additive, very soft)
      ctx.globalCompositeOperation = 'screen'
      for (const c of clouds.current) {
        c.x += c.dx; c.y += c.dy
        if (c.x < -c.r) c.x = w + c.r; if (c.x > w + c.r) c.x = -c.r
        if (c.y < -c.r) c.y = h + c.r; if (c.y > h + c.r) c.y = -c.r
        const px = c.x + pX * 24, py = c.y + pY * 24
        const g = ctx.createRadialGradient(px, py, 0, px, py, c.r)
        g.addColorStop(0, `hsla(${c.hue},70%,52%,0.09)`); g.addColorStop(0.5, `hsla(${c.hue},70%,42%,0.035)`); g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, c.r, 0, TAU); ctx.fill()
      }
      ctx.globalCompositeOperation = 'source-over'

      // ── starfield with parallax + gentle twinkle ─────────────────────
      for (const s of stars.current) {
        const a = (0.18 + s.z * 0.55) * (0.7 + Math.sin(t * 0.02 + s.tw) * 0.3)
        ctx.globalAlpha = a; ctx.fillStyle = s.z > 0.8 ? '#dbeafe' : '#9fc6ff'
        ctx.beginPath(); ctx.arc(s.x + pX * s.z * 55, s.y + pY * s.z * 55, s.s, 0, TAU); ctx.fill()
      }
      ctx.globalAlpha = 1

      // ── orbital plane rings (faint, perspective-squashed) ────────────
      for (const ring of RINGS) {
        const rad = unit * ring
        const g = ctx.createLinearGradient(cx - rad, cy, cx + rad, cy)
        g.addColorStop(0, 'rgba(120,170,240,0.015)'); g.addColorStop(0.5, 'rgba(150,195,255,0.07)'); g.addColorStop(1, 'rgba(120,170,240,0.015)')
        ctx.strokeStyle = g; ctx.lineWidth = 1
        ctx.beginPath(); ctx.ellipse(cx, cy, rad, rad * SQUASH, 0, 0, TAU); ctx.stroke()
      }

      // position nodes first (conduits + bodies both need their coords)
      for (const n of nodes.current) {
        n.angle += n.speed
        const rad = unit * n.ringFrac
        n.depth = (Math.sin(n.angle) + 1) / 2                 // 0 = far side, 1 = near side
        const pf = 14 + n.ringFrac * 30
        n.x = cx + Math.cos(n.angle) * rad + pX * pf
        n.y = cy + Math.sin(n.angle) * rad * SQUASH + pY * pf
        const breathe = 1 + Math.sin(t * 0.018 + n.angle) * 0.04
        const isH = hover.current === n.key
        n.screenR = unit * 0.021 * n.rScale * (0.82 + n.depth * 0.32) * breathe * (isH ? 1.16 : 1)
      }

      // ── energy conduits: Core → each node, with a travelling pulse ───
      ctx.globalCompositeOperation = 'screen'
      for (const n of nodes.current) {
        const isH = hover.current === n.key
        const base = (0.05 + n.depth * 0.05) * (isH ? 4 : 1)
        const g = ctx.createLinearGradient(cx, cy, n.x, n.y)
        g.addColorStop(0, `hsla(${n.hue},85%,70%,${base})`); g.addColorStop(1, `hsla(${n.hue},85%,65%,0)`)
        ctx.strokeStyle = g; ctx.lineWidth = isH ? 1.6 : 1
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(n.x, n.y); ctx.stroke()
        // travelling pulse of light flowing out toward the node
        const u = ((t * 0.006 + n.angle) % 1)
        const px = cx + (n.x - cx) * u, py = cy + (n.y - cy) * u
        const pr = (isH ? 3.4 : 2.2)
        const pg = ctx.createRadialGradient(px, py, 0, px, py, pr * 3)
        pg.addColorStop(0, `hsla(${n.hue},90%,80%,${(isH ? 0.9 : 0.5) * (1 - u)})`); pg.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(px, py, pr * 3, 0, TAU); ctx.fill()
      }
      ctx.globalCompositeOperation = 'source-over'

      // ── drifting agents (autonomous entities on the orbital plane) ───
      ctx.globalCompositeOperation = 'screen'
      for (const a of agents.current) {
        a.angle += a.speed
        const rad = unit * a.ringFrac
        const ax = cx + Math.cos(a.angle) * rad + pX * (14 + a.ringFrac * 30)
        const ay = cy + Math.sin(a.angle) * rad * SQUASH + pY * (14 + a.ringFrac * 30)
        a.trail.unshift({ x: ax, y: ay }); if (a.trail.length > 20) a.trail.pop()
        for (let i = a.trail.length - 1; i >= 0; i--) {
          const f = 1 - i / a.trail.length
          ctx.globalAlpha = f * 0.5; ctx.fillStyle = '#cfe6ff'
          ctx.beginPath(); ctx.arc(a.trail[i].x, a.trail[i].y, 1.8 * f, 0, TAU); ctx.fill()
        }
        ctx.globalAlpha = 1
      }
      ctx.globalCompositeOperation = 'source-over'

      // ── nodes: luminous glass instruments (far side first for depth) ─
      const ordered = [...nodes.current].sort((a, b) => a.depth - b.depth)
      for (const n of ordered) {
        const isH = hover.current === n.key
        const R = n.screenR

        // outer bloom (additive)
        ctx.globalCompositeOperation = 'screen'
        const bloom = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, R * (isH ? 6 : 4))
        bloom.addColorStop(0, `hsla(${n.hue},85%,66%,${isH ? 0.5 : 0.26})`)
        bloom.addColorStop(0.45, `hsla(${n.hue},85%,55%,${isH ? 0.14 : 0.07})`)
        bloom.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = bloom; ctx.beginPath(); ctx.arc(n.x, n.y, R * (isH ? 6 : 4), 0, TAU); ctx.fill()

        // expanding hover ring
        if (isH) {
          const pr = (t * 0.7) % 46
          ctx.strokeStyle = `hsla(${n.hue},85%,78%,${(1 - pr / 46) * 0.4})`; ctx.lineWidth = 1.2
          ctx.beginPath(); ctx.arc(n.x, n.y, R + pr, 0, TAU); ctx.stroke()
        }
        ctx.globalCompositeOperation = 'source-over'

        // glass body — lit from upper-left, dark glassy edge (no flat candy fill)
        const body = ctx.createRadialGradient(n.x - R * 0.32, n.y - R * 0.36, R * 0.08, n.x, n.y, R)
        body.addColorStop(0,    `hsla(${n.hue},90%,92%,1)`)
        body.addColorStop(0.32, `hsla(${n.hue},82%,68%,1)`)
        body.addColorStop(0.72, `hsla(${n.hue},72%,40%,1)`)
        body.addColorStop(1,    `hsla(${n.hue},78%,15%,1)`)
        ctx.fillStyle = body; ctx.beginPath(); ctx.arc(n.x, n.y, R, 0, TAU); ctx.fill()

        // crisp glass rim
        ctx.strokeStyle = `hsla(${n.hue},92%,82%,${isH ? 0.75 : 0.42})`; ctx.lineWidth = 1
        ctx.beginPath(); ctx.arc(n.x, n.y, R, 0, TAU); ctx.stroke()

        // soft specular (glass, not a hard white dot)
        const sp = ctx.createRadialGradient(n.x - R * 0.34, n.y - R * 0.4, 0, n.x - R * 0.34, n.y - R * 0.4, R * 0.55)
        sp.addColorStop(0, 'rgba(255,255,255,0.85)'); sp.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.fillStyle = sp; ctx.beginPath(); ctx.arc(n.x - R * 0.34, n.y - R * 0.4, R * 0.55, 0, TAU); ctx.fill()

        // label + count
        ctx.textAlign = 'center'
        ;(ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '1.5px'
        ctx.font = '600 11px ui-sans-serif, -apple-system, sans-serif'
        ctx.fillStyle = isH ? 'rgba(238,247,255,0.98)' : `rgba(206,224,255,${0.32 + n.depth * 0.18})`
        ctx.fillText(n.name.toUpperCase(), n.x, n.y + R + 17)
        if (n.count) {
          ;(ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0.5px'
          ctx.font = '500 9.5px ui-sans-serif, sans-serif'
          ctx.fillStyle = `hsla(${n.hue},85%,78%,${isH ? 0.9 : 0.4})`
          ctx.fillText(n.count.toUpperCase(), n.x, n.y + R + 30)
        }
        ;(ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px'
      }

      // ── central reactor Core ─────────────────────────────────────────
      const pulse = 1 + Math.sin(t * 0.028) * 0.06
      const R = (coreHover.current ? 40 : 36) * pulse * (unit / 760)
      coreR.current = R

      ctx.globalCompositeOperation = 'screen'
      const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 5.2)
      halo.addColorStop(0, `hsla(205,90%,72%,${coreHover.current ? 0.62 : 0.5})`)
      halo.addColorStop(0.4, 'hsla(212,85%,58%,0.16)')
      halo.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx, cy, R * 5.2, 0, TAU); ctx.fill()

      // slow expanding containment rings
      for (let k = 0; k < 3; k++) {
        const rr = R * 1.25 + k * 11 + ((t * 0.35) % 11)
        ctx.strokeStyle = `hsla(200,90%,78%,${(0.2 - k * 0.05) * (1 - ((t * 0.35) % 11) / 33)})`; ctx.lineWidth = 1
        ctx.beginPath(); ctx.arc(cx, cy, rr, 0, TAU); ctx.stroke()
      }
      // orbiting electrons (reactor life)
      for (let k = 0; k < 3; k++) {
        const a = t * 0.04 + k * (TAU / 3)
        const ex = cx + Math.cos(a) * R * 1.5, ey = cy + Math.sin(a) * R * 1.5 * 0.7
        const eg = ctx.createRadialGradient(ex, ey, 0, ex, ey, 5)
        eg.addColorStop(0, 'rgba(220,240,255,0.9)'); eg.addColorStop(1, 'rgba(120,180,255,0)')
        ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(ex, ey, 5, 0, TAU); ctx.fill()
      }
      ctx.globalCompositeOperation = 'source-over'

      // core glass body — hot white nucleus → cool glass shell
      const cb = ctx.createRadialGradient(cx - R * 0.25, cy - R * 0.28, R * 0.05, cx, cy, R)
      cb.addColorStop(0, 'rgba(248,252,255,1)')
      cb.addColorStop(0.35, 'hsla(200,90%,82%,1)')
      cb.addColorStop(0.75, 'hsla(214,80%,52%,1)')
      cb.addColorStop(1, 'hsla(222,82%,20%,1)')
      ctx.fillStyle = cb; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill()
      ctx.strokeStyle = `rgba(214,236,255,${coreHover.current ? 0.85 : 0.55})`; ctx.lineWidth = 1.2
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke()

      // ── film grain (jittered) + vignette: the cinematic finish ───────
      const ox = (t * 7) % 13 - 6, oy = (t * 11) % 17 - 8
      ctx.save()
      ctx.globalAlpha = 0.045
      ctx.globalCompositeOperation = 'overlay'
      ctx.translate(ox, oy)
      ctx.fillStyle = grain
      ctx.fillRect(-ox - 4, -oy - 4, w + 24, h + 24)
      ctx.restore()

      const vg = ctx.createRadialGradient(cx, cy, unit * 0.3, cx, cy, Math.max(w, h) * 0.75)
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)')
      ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h)

      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('mousemove', onMove)
      canvas.removeEventListener('mouseleave', onLeave)
      canvas.removeEventListener('click', onClick)
    }
  }, [onNavigate, onTalk])

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#02040a]">
      <canvas ref={canvasRef} className="block w-full h-full" />
      <div className="absolute top-8 left-1/2 -translate-x-1/2 text-center pointer-events-none select-none">
        <div className="text-[10px] tracking-[0.42em] text-cyan-100/45 uppercase font-medium">Piku</div>
        <div className="text-[10.5px] tracking-[0.18em] text-white/25 mt-1.5 uppercase">
          {now.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
          <span className="mx-1.5 text-cyan-300/30">·</span>
          {now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
        </div>
      </div>
      <div className="absolute left-1/2 bottom-24 -translate-x-1/2 text-center pointer-events-none select-none">
        <div className="text-[9.5px] tracking-[0.32em] text-cyan-100/35 uppercase">Click the core to speak · a node to enter</div>
      </div>
    </div>
  )
}
