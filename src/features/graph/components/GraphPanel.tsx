import { useState, useEffect, useRef } from 'react'
import type { Galaxy }                  from '../types'
import { NODE_COLORS, DEFAULT_NODE_COLOR } from '../types'
import { graphActivityLog }             from '../GraphActivityLog'
import type { GraphActivityEvent }      from '../GraphActivityLog'
import { chamfer, CornerTicks }         from '../../os/Hud'

// ── Types ──────────────────────────────────────────────────────────────────

type StampedEvent = GraphActivityEvent & { id: number; ts: number }

interface GraphPanelProps {
  viewMode: 'macro' | 'micro'
  activeGalaxy: string | null
  galaxies: Galaxy[]
  nodeCount: number
  edgeCount: number
  nodeTypeCounts: Record<string, number>
}

// ── Component ──────────────────────────────────────────────────────────────

export function GraphPanel({ viewMode, activeGalaxy, galaxies, nodeCount, edgeCount, nodeTypeCounts }: GraphPanelProps) {
  const [show, setShow] = useState(false)
  const [tab, setTab] = useState<'stats' | 'activity'>('stats')
  const [activityEvents, setActivityEvents] = useState<StampedEvent[]>(() =>
    graphActivityLog.getHistory() as StampedEvent[]
  )
  const [unreadCount, setUnreadCount] = useState(0)
  const feedRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const unsub = graphActivityLog.subscribe(() => {
      setActivityEvents(graphActivityLog.getHistory() as StampedEvent[])
      setUnreadCount(prev => prev + 1)
    })
    return unsub
  }, [])

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight
    }
  }, [activityEvents])

  const clearActivity = () => {
    graphActivityLog.clear()
    setActivityEvents([])
    setUnreadCount(0)
  }

  const toggle = () => {
    setShow(v => {
      if (!v) setUnreadCount(0)
      return !v
    })
  }

  const activeGalaxyData = activeGalaxy ? galaxies.find(g => g.id === activeGalaxy) : null

  return (
    <>
      {/* Toggle button — replaces old legend button */}
      <div className="absolute bottom-7 right-6 z-40">
        <button
          onClick={toggle}
          className="relative flex items-center gap-2 px-3 py-2 bg-[#0a1120]/80 backdrop-blur-xl transition-colors hover:bg-[#0a1120]/95"
          style={{ ...chamfer(8), boxShadow: 'inset 0 0 0 1px rgba(34,211,238,0.18), 0 8px 30px -10px rgba(0,0,0,0.7)' }}>
          <CornerTicks accent="cyan" />
          <span className="font-hud text-[9px] uppercase tracking-[0.15em] text-white/40">
            {viewMode === 'macro' ? '✦ cosmos' : activeGalaxyData?.name ?? '✦ graph'}
          </span>
          <span className="font-hud text-[9px] text-white/20">{nodeCount}</span>
          {!show && unreadCount > 0 && (
            <span className="font-hud text-[8px] bg-cyan-500/30 text-cyan-300/80 px-1.5 py-0.5">{unreadCount}</span>
          )}
          <span className="font-hud text-[9px] text-white/20">{show ? '▲' : '▼'}</span>
        </button>
      </div>

      {/* Slide-in panel */}
      {show && (
        <div
          className="
            absolute bottom-7 right-6 z-40 w-80
            bg-[#0a1120]/90 backdrop-blur-xl
            transition-all duration-200
          "
          style={{ ...chamfer(8), boxShadow: 'inset 0 0 0 1px rgba(34,211,238,0.18), 0 18px 40px rgba(0,0,0,0.6)' }}>
          <CornerTicks accent="cyan" />

          {/* Tab bar */}
          <div className="flex border-b border-white/6 px-3 pt-2.5 pb-0 gap-4">
            <button
              onClick={() => setTab('stats')}
              className={`font-hud text-[9px] uppercase tracking-[0.15em] pb-2 border-b-2 transition-colors ${tab === 'stats' ? 'text-cyan-300/70 border-cyan-400/40' : 'text-white/30 border-transparent hover:text-white/50'}`}>
              Graph
            </button>
            <button
              onClick={() => setTab('activity')}
              className={`font-hud text-[9px] uppercase tracking-[0.15em] pb-2 border-b-2 transition-colors ${tab === 'activity' ? 'text-cyan-300/70 border-cyan-400/40' : 'text-white/30 border-transparent hover:text-white/50'}`}>
              Activity{unreadCount > 0 && <span className="ml-1 text-[8px] bg-cyan-500/30 text-cyan-300/80 px-1.5 py-0.5">{unreadCount}</span>}
            </button>
          </div>

          {/* Tab content */}
          <div className="p-3 max-h-[60vh] overflow-y-auto">
            {tab === 'stats' && (
              <div className="flex flex-col gap-3">

                {/* Galaxy info */}
                <div className="flex items-center gap-2">
                  <span className="font-hud text-[10px] uppercase tracking-[0.15em] text-white/25">
                    {viewMode === 'macro' ? 'Void' : (activeGalaxyData?.name ?? 'Graph')}
                  </span>
                  <span className="font-hud text-[9px] text-white/15">
                    {viewMode === 'macro'
                      ? `${galaxies.length} galaxy${galaxies.length !== 1 ? 'ies' : ''}`
                      : activeGalaxyData?.kind?.toUpperCase() ?? ''}
                  </span>
                </div>

                {/* Counts row */}
                <div className="flex gap-3 text-xs">
                  <div className="flex-1 rounded-lg bg-white/[0.03] border border-white/6 px-3 py-2">
                    <div className="font-hud text-[18px] text-white/70">{nodeCount}</div>
                    <div className="font-hud text-[8px] uppercase tracking-[0.15em] text-white/25">nodes</div>
                  </div>
                  <div className="flex-1 rounded-lg bg-white/[0.03] border border-white/6 px-3 py-2">
                    <div className="font-hud text-[18px] text-white/50">{edgeCount}</div>
                    <div className="font-hud text-[8px] uppercase tracking-[0.15em] text-white/25">edges</div>
                  </div>
                </div>

                {/* Node type distribution */}
                <div className="flex flex-col gap-1.5">
                  <div className="font-hud text-[8px] uppercase tracking-[0.15em] text-white/20 mb-0.5">Types</div>
                  {Object.entries(nodeTypeCounts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([type, count]) => (
                      <div key={type} className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: NODE_COLORS[type] ?? DEFAULT_NODE_COLOR }} />
                        <span className="font-hud text-[9px] uppercase tracking-[0.12em] text-white/40 flex-1">{type}</span>
                        <span className="font-hud text-[9px] text-white/25">{count}</span>
                      </div>
                    ))}
                </div>

                {/* Galaxy list (macro) or detail (micro) */}
                {viewMode === 'macro' && (
                  <div className="flex flex-col gap-1.5 pt-1 border-t border-white/6">
                    <div className="font-hud text-[8px] uppercase tracking-[0.15em] text-white/20 mb-0.5">Galaxies</div>
                    {galaxies.map(g => (
                      <div key={g.id} className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: galaxyColor(g) }} />
                        <span className="font-hud text-[9px] uppercase tracking-[0.12em] text-white/35 flex-1">{g.name}</span>
                        <span className="font-hud text-[8px] text-white/20">{g.nodes.length} nodes</span>
                      </div>
                    ))}
                  </div>
                )}

                {viewMode === 'micro' && activeGalaxyData && (
                  <div className="flex flex-col gap-1.5 pt-1 border-t border-white/6">
                    <div className="font-hud text-[8px] uppercase tracking-[0.15em] text-white/20 mb-0.5">Galaxy</div>
                    <div className="font-hud text-[10px] text-white/50">{activeGalaxyData.name}</div>
                    <div className="font-hud text-[8px] text-white/25">
                      {activeGalaxyData.nodes.length} nodes · {activeGalaxyData.edges.length} edges · {activeGalaxyData.kind}
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === 'activity' && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-hud text-[8px] uppercase tracking-[0.15em] text-white/20">Graph Activity</span>
                  {activityEvents.length > 0 && (
                    <button onClick={clearActivity} className="font-hud text-[8px] text-white/20 hover:text-white/45 transition-colors">clear</button>
                  )}
                </div>
                <div ref={feedRef} className="flex flex-col gap-1 max-h-48 overflow-y-auto rounded-lg bg-black/30 border border-white/6 p-2">
                  {activityEvents.length === 0 ? (
                    <p className="font-hud text-[10px] text-white/20 text-center py-2">Activity appears here during extraction.</p>
                  ) : (
                    activityEvents.map(event => (
                      <ActivityRow key={event.id} event={event} />
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

// ── Activity row ───────────────────────────────────────────────────────────

function ActivityRow({ event }: { event: StampedEvent }) {
  switch (event.type) {
    case 'extraction_start':
      return (
        <div className="flex items-center gap-2 py-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/50 shrink-0 animate-pulse" />
          <span className="font-hud text-[10px] text-cyan-300/50">Extraction started</span>
        </div>
      )
    case 'extraction_empty':
      return (
        <div className="flex items-center gap-2 py-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-white/20 shrink-0" />
          <span className="font-hud text-[10px] text-white/25">No relationships found</span>
        </div>
      )
    case 'extraction_complete':
      return (
        <div className="flex items-center gap-2 py-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/60 shrink-0" />
          <span className="font-hud text-[10px] text-cyan-300/60">
            Complete — {event.itemCount} item{event.itemCount !== 1 ? 's' : ''} processed
          </span>
        </div>
      )
    case 'node_created': {
      const dotCls = event.node.type === 'project' ? 'bg-blue-400/60'
        : event.node.type === 'goal' ? 'bg-purple-400/60'
        : event.node.type === 'skill' ? 'bg-green-400/60'
        : event.node.type === 'person' ? 'bg-yellow-400/60'
        : event.node.type === 'memory' ? 'bg-pink-400/60'
        : event.node.type === 'decision' ? 'bg-orange-400/60'
        : event.node.type === 'repository' ? 'bg-blue-500/60'
        : event.node.type === 'technology' ? 'bg-sky-400/60'
        : event.node.type === 'concept' ? 'bg-cyan-400/60'
        : 'bg-white/30'
      const txtCls = event.node.type === 'project' ? 'text-blue-400/70'
        : event.node.type === 'goal' ? 'text-purple-400/70'
        : event.node.type === 'skill' ? 'text-green-400/70'
        : event.node.type === 'person' ? 'text-yellow-400/70'
        : event.node.type === 'memory' ? 'text-pink-400/70'
        : event.node.type === 'decision' ? 'text-orange-400/70'
        : event.node.type === 'repository' ? 'text-blue-500/70'
        : event.node.type === 'technology' ? 'text-sky-400/70'
        : event.node.type === 'concept' ? 'text-cyan-400/70'
        : 'text-white/40'
      return (
        <div className="flex items-center gap-2 py-0.5">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotCls} ${event.isNew ? '' : 'opacity-40'}`} />
          <span className="font-hud text-[10px] text-white/50">
            {event.isNew ? '＋' : '→'}
            <span className={`${txtCls} text-[9px] ml-1`}>[{event.node.type}]</span>
            <span className={event.isNew ? 'text-white/70 ml-1' : 'text-white/35 ml-1'}>{event.node.name}</span>
            {!event.isNew && <span className="text-white/20 text-[9px] ml-1">(existing)</span>}
          </span>
        </div>
      )
    }
    case 'edge_created':
      return (
        <div className="flex flex-col gap-0.5 py-0.5 pl-2 border-l border-white/8">
          <div className="flex items-center gap-1.5 font-hud text-[10px]">
            <span className="text-white/45">{event.fromName}</span>
            <span className="text-white/20 text-[8px] italic">{event.edge.relationship}</span>
            <span className="text-white/45">{event.toName}</span>
          </div>
          <span className="font-hud text-[8px] text-white/20 pl-0.5">
            {Math.round(event.edge.strength * 100)}% confidence
            {event.edge.status === 'pending' && <span className="ml-1 text-cyan-400/40">(pending)</span>}
          </span>
        </div>
      )
  }
}

function galaxyColor(g: Galaxy): string {
  if (g.kind === 'core') return '#22D3EE'
  if (g.kind === 'project') return '#60A5FA'
  return '#A78BFA'
}