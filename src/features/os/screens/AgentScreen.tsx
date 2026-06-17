import { useEffect, useRef, useState } from 'react'
import type { PresenceState } from '../../../types'
import type { Project } from '../../projects/types'
import { ScreenShell, BuildStatus, Hint } from './ScreenShell'
import { chamfer } from '../Hud'
import { Orb } from '../../orb'
import { toolRouter } from '../../../services/ToolRouter'
import type { TraceStep } from '../../../services/ToolRouter'
import { voiceService } from '../../../services/VoiceService'
import { projectService } from '../../projects/components/ProjectDashboard'
import { agentHub } from './agentSession'
import { PIKU_PERSONA } from '../../../lib/persona'

const AGENT_SYSTEM_PROMPT = `${PIKU_PERSONA}

You're also in agent mode right now: running on this person's Mac, with real tools you can call —
open_app (open/focus an app), open_link (open a URL/file/folder), web_search (open a web search in
the browser; pass app "Google Chrome"), list_files (a folder under their home), and save_memory /
recall_memory / get_datetime.
RULE: if they ask you to open, launch, show, play, search, look up, or get headlines, you MUST call
the matching tool — never claim you did it without actually calling it, and don't over-deliberate:
pick the tool and fire it. web_search opens the search AND returns the top results — read them and
tell the actual answer in a line or two. You can't delete files or run arbitrary commands. When no
action is needed, just talk like yourself.`

const SUGGESTIONS = ['Open Safari', "What's in my Documents?", 'Open github.com', 'What time is it?']

function fmtAgo(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return 'now'
  const m = Math.round(s / 60); if (m < 60) return `${m}m`
  const h = Math.round(m / 60); if (h < 24) return `${h}h`
  return `${Math.round(h / 24)}d`
}

export function AgentScreen() {
  const [, force] = useState(0)
  useEffect(() => {
    const unsub = agentHub.subscribe(() => force(n => n + 1))
    force(n => n + 1)   // catch up on any state the hub resolved before we subscribed (async IDB init)
    return unsub
  }, [])
  const ctx      = agentHub.active()
  const contexts = agentHub.contexts
  const turns    = ctx?.turns ?? []
  const trace    = agentHub.trace

  const [input, setInput]               = useState('')
  const [running, setRunning]           = useState(false)
  const [phase, setPhase]               = useState<PresenceState>('idle')
  const [liveThinking, setLiveThinking] = useState('')
  const [voiceOut, setVoiceOut]         = useState(true)
  const [projects, setProjects]         = useState<Project[]>([])
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft]     = useState('')
  const [projMenu, setProjMenu]         = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const convEnd  = useRef<HTMLDivElement>(null)
  const traceEnd = useRef<HTMLDivElement>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const isTauri  = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

  const loadProjects = () => { void projectService.getAllProjects().then(setProjects).catch(() => {}) }
  useEffect(loadProjects, [])
  useEffect(() => { convEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [turns.length, ctx?.id])
  useEffect(() => { traceEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [trace, liveThinking, running])
  useEffect(() => { if (!running) inputRef.current?.focus() }, [running, ctx?.id])

  const linkedProject = ctx?.projectId ? projects.find(p => p.id === ctx.projectId) : undefined

  const run = async (text: string) => {
    const t = text.trim()
    if (!t || running) return
    clearTimeout(debounce.current)
    voiceService.prime()
    setInput('')
    const history = agentHub.active()?.turns ?? []   // prior turns — Piku remembers this context
    agentHub.addTurn({ role: 'you', text: t })
    agentHub.setTrace([])
    setLiveThinking('')
    setRunning(true); setPhase('thinking')
    try {
      const { reply, trace: tr } = await toolRouter.runWithTools(t, AGENT_SYSTEM_PROMPT, d => setLiveThinking(p => p + d), history)
      agentHub.setTrace(tr)
      agentHub.addTurn({ role: 'piku', text: reply || '(done)' })
      if (voiceOut) voiceService.speak(reply)
    } catch (e) {
      agentHub.addTurn({ role: 'piku', text: `Something went wrong: ${String(e)}` })
    } finally { setRunning(false); setPhase('idle'); setLiveThinking('') }
  }

  const onInputChange = (v: string) => {
    setInput(v)
    clearTimeout(debounce.current)
    if (v.trim() && !running) debounce.current = setTimeout(() => run(v), 2200)
  }

  const commitTitle = () => { if (ctx) agentHub.rename(ctx.id, titleDraft); setEditingTitle(false) }

  const createProjectFromContext = async () => {
    if (!ctx) return
    const name = (ctx.title && ctx.title !== 'New context') ? ctx.title : 'New project'
    const firstYou = ctx.turns.find(t => t.role === 'you')?.text
    try {
      const project = await projectService.createProject(name, firstYou || name, 'Planning')
      agentHub.linkProject(project.id)
      loadProjects()
    } catch { /* ignore */ }
    setProjMenu(false)
  }

  return (
    <ScreenShell
      title="Agent"
      subtitle="Your control hub. Each context is a separate chat — link it to a project, feed the World Model."
    >
      <div className="grid grid-cols-12 gap-4" style={{ height: '74vh' }}>

        {/* ── CONTEXTS RAIL ── */}
        <Frame className="col-span-12 lg:col-span-3" label="Contexts" code={String(contexts.length).padStart(2, '0')}
          action={
            <button onClick={() => agentHub.createContext()}
              className="font-hud text-[9.5px] uppercase tracking-[0.15em] text-cyan-200 hover:text-cyan-100 transition-colors flex items-center gap-1">
              <span className="text-cyan-300 text-glow-cyan">＋</span> New
            </button>
          }>
          <div className="h-full overflow-y-auto px-2 py-2 flex flex-col gap-1">
            {contexts.map(c => {
              const active = c.id === ctx?.id
              const proj = c.projectId ? projects.find(p => p.id === c.projectId) : undefined
              return (
                <div key={c.id} className="group/ctx relative">
                  <button onClick={() => agentHub.switchTo(c.id)}
                    className={`relative w-full text-left px-3 py-2.5 transition-colors ${active ? 'text-white' : 'text-white/55 hover:text-white/90'}`}
                    style={active ? { ...chamfer(8), background: 'rgba(34,211,238,0.08)' } : undefined}>
                    {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.8)]" />}
                    <div className="text-[13px] leading-tight truncate pr-5">{c.title}</div>
                    <div className="font-hud text-[9px] uppercase tracking-wider text-white/35 mt-1 flex items-center gap-1.5">
                      <span>{c.turns.length} turns</span>
                      <span className="text-white/20">·</span>
                      <span>{fmtAgo(c.updatedAt)}</span>
                      {proj && <span className="text-fuchsia-300/70 truncate">· ◆ {proj.name}</span>}
                    </div>
                  </button>
                  {contexts.length > 1 && (
                    <button onClick={() => agentHub.remove(c.id)} title="Delete context"
                      className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center text-white/25 hover:text-fuchsia-300 opacity-0 group-hover/ctx:opacity-100 transition-opacity">×</button>
                  )}
                </div>
              )
            })}
          </div>
        </Frame>

        {/* ── CONVERSATION ── */}
        <Frame className="col-span-12 lg:col-span-5" label="Context" code={ctx ? ctx.title.slice(0, 18) : '—'}
          action={
            <div className="relative">
              {linkedProject ? (
                <span className="font-hud text-[9.5px] uppercase tracking-[0.12em] text-fuchsia-200/90 flex items-center gap-1.5">
                  ◆ {linkedProject.name}
                  <button onClick={() => agentHub.linkProject(undefined)} className="text-fuchsia-300/50 hover:text-fuchsia-200" title="Unlink">×</button>
                </span>
              ) : (
                <button onClick={() => { setProjMenu(o => !o); loadProjects() }}
                  className="font-hud text-[9.5px] uppercase tracking-[0.15em] text-white/45 hover:text-fuchsia-200 transition-colors">+ Link project</button>
              )}
              {projMenu && !linkedProject && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setProjMenu(false)} />
                  <div className="absolute right-0 top-6 z-50 w-56 py-1.5 bg-[#0a1120]/95 backdrop-blur-xl"
                    style={{ ...chamfer(8), boxShadow: 'inset 0 0 0 1px rgba(217,70,239,0.3), 0 18px 40px rgba(0,0,0,0.6)' }}>
                    <button onClick={createProjectFromContext}
                      className="w-full text-left px-3 py-2 text-[12px] text-fuchsia-200 hover:bg-fuchsia-500/10 flex items-center gap-2">
                      <span className="text-glow-violet">✦</span> Create project from context
                    </button>
                    {projects.length > 0 && <div className="h-px bg-white/8 my-1" />}
                    <div className="max-h-44 overflow-y-auto">
                      {projects.map(p => (
                        <button key={p.id} onClick={() => { agentHub.linkProject(p.id); setProjMenu(false) }}
                          className="w-full text-left px-3 py-1.5 text-[12px] text-white/70 hover:bg-cyan-500/10 truncate">▤ {p.name}</button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          }>
          <div className="flex flex-col h-full min-h-0">
            {/* presence + editable title */}
            <div className="flex flex-col items-center pt-5 pb-3 px-6 shrink-0">
              <Orb presence={phase} size={104} />
              {editingTitle ? (
                <input autoFocus value={titleDraft} onChange={e => setTitleDraft(e.target.value)}
                  onBlur={commitTitle} onKeyDown={e => { if (e.key === 'Enter') commitTitle(); if (e.key === 'Escape') setEditingTitle(false) }}
                  className="mt-3 bg-transparent text-center text-[14px] text-white/90 border-b border-cyan-400/40 outline-none" />
              ) : (
                <button onClick={() => { setTitleDraft(ctx?.title ?? ''); setEditingTitle(true) }}
                  className="mt-3 text-[14px] text-white/85 hover:text-white max-w-full truncate transition-colors" title="Rename context">
                  {ctx?.title || 'New context'}
                </button>
              )}
              <div className="font-hud text-[10px] uppercase tracking-[0.15em] text-cyan-300/55 mt-1">{running ? 'thinking…' : 'here with you'}</div>
            </div>

            {/* transcript */}
            <div className="flex-1 overflow-y-auto px-5 min-h-0">
              {turns.length === 0 ? (
                <div className="text-center mt-1">
                  <p className="text-white/45 text-[13px]">Talk to me, or ask me to do something on your Mac.</p>
                  <div className="flex flex-wrap gap-2 justify-center mt-4">
                    {SUGGESTIONS.map(s => (
                      <button key={s} onClick={() => void run(s)}
                        className="font-hud text-[10px] uppercase tracking-wider text-cyan-200/80 bg-cyan-500/8 hover:bg-cyan-500/16 px-3 py-1.5 transition-colors"
                        style={{ clipPath: 'polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))' }}>{s}</button>
                    ))}
                  </div>
                  {!isTauri && <div className="mt-4"><Hint>Actions run in the desktop app.</Hint></div>}
                </div>
              ) : (
                <div className="flex flex-col gap-3 pb-2">
                  {turns.map((t, i) => (
                    <div key={i} className={`flex ${t.role === 'you' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] text-[14px] leading-relaxed ${t.role === 'you'
                        ? 'bg-cyan-500/12 px-3.5 py-2 text-cyan-50/95'
                        : 'text-white/85'}`}
                        style={t.role === 'you' ? { clipPath: 'polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))', boxShadow: 'inset 0 0 0 1px rgba(34,211,238,0.18)' } : undefined}>{t.text}</div>
                    </div>
                  ))}
                  <div ref={convEnd} />
                </div>
              )}
            </div>

            {/* input */}
            <div className="border-t border-white/[0.06] p-3 shrink-0">
              <div className="flex items-center gap-2 px-3.5 py-2 bg-white/[0.04]"
                style={{ ...chamfer(8), boxShadow: 'inset 0 0 0 1px rgba(34,211,238,0.15)' }}>
                <span className="font-hud text-cyan-300 text-glow-cyan">›</span>
                <input ref={inputRef} value={input} onChange={e => onInputChange(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && input.trim() && !running) { e.preventDefault(); void run(input) } }}
                  disabled={running} placeholder={running ? 'Piku is working…' : 'Talk with Wispr Flow, or type…'}
                  style={{ caretColor: '#22d3ee' }}
                  className="flex-1 bg-transparent text-[14px] text-white/90 placeholder:text-white/35 outline-none disabled:opacity-60" />
                <button onClick={() => setVoiceOut(v => { if (v) voiceService.cancel(); return !v })}
                  title={voiceOut ? 'Voice replies on' : 'Voice replies off'}
                  className={`font-hud flex items-center gap-1.5 h-7 px-2 text-[9px] uppercase tracking-wider transition-colors ${voiceOut ? 'text-cyan-200' : 'text-white/40 hover:text-white/80'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${voiceOut ? 'bg-cyan-300' : 'bg-white/30'}`} />voice
                </button>
                <button onClick={() => void run(input)} disabled={!input.trim() || running}
                  className="w-7 h-7 bg-cyan-500/20 text-cyan-200 flex items-center justify-center hover:bg-cyan-500/30 disabled:opacity-40 transition-colors"
                  style={{ clipPath: 'polygon(0 0, calc(100% - 5px) 0, 100% 5px, 100% 100%, 5px 100%, 0 calc(100% - 5px))' }}>→</button>
              </div>
            </div>
          </div>
        </Frame>

        {/* ── THINKING & ACTIONS ── */}
        <Frame className="col-span-12 lg:col-span-4" label="Thinking & Actions" accent="violet"
          action={<span className={`w-1.5 h-1.5 rounded-full ${running ? 'bg-fuchsia-400 animate-pulse' : 'bg-white/25'}`} />}>
          <div className="h-full overflow-y-auto px-5 py-4">
            {running ? (
              <div className="flex flex-col gap-3">
                <div className="border-l-2 border-fuchsia-400/30 pl-3 text-[12.5px] leading-relaxed text-fuchsia-100/55 italic whitespace-pre-wrap">{liveThinking || 'reasoning…'}</div>
                <div ref={traceEnd} />
              </div>
            ) : trace.length === 0 ? (
              <Hint>Piku's reasoning and the actions it takes appear here, live, as it works.</Hint>
            ) : (
              <div className="flex flex-col gap-3">
                {trace.map((s, i) => <TraceLine key={i} step={s} />)}
                <div ref={traceEnd} />
              </div>
            )}
          </div>
        </Frame>
      </div>

      <BuildStatus items={[
        { label: 'Multi-context hub (new chats = new contexts)', state: 'built' },
        { label: 'Contexts persisted to IndexedDB v7', state: 'built' },
        { label: 'Link / create projects from a context', state: 'built' },
        { label: 'Per-context World-Model graph view', state: 'planned' },
      ]} />
    </ScreenShell>
  )
}

// Chamfered neon HUD frame with a mono header + scrollable body — the cyberpunk pane shell.
function Frame({ label, code, action, accent = 'cyan', className = '', children }: {
  label: string; code?: string; action?: React.ReactNode; accent?: 'cyan' | 'violet'; className?: string; children: React.ReactNode
}) {
  const edge = accent === 'violet' ? 'rgba(217,70,239,0.42)' : 'rgba(34,211,238,0.4)'
  const dot  = accent === 'violet' ? 'rgba(217,70,239,0.95)' : 'rgba(34,211,238,0.95)'
  return (
    <div className={`relative min-h-0 ${className}`}>
      <div className="absolute inset-0" style={{ ...chamfer(13), background: `linear-gradient(160deg, ${edge}, rgba(120,160,210,0.08) 55%, rgba(255,255,255,0.03))` }} />
      <div className="absolute inset-[1.1px]" style={{ ...chamfer(12), background: 'linear-gradient(to bottom, rgba(10,17,32,0.92), rgba(7,11,20,0.88))' }} />
      <div className="relative flex flex-col h-full min-h-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] shrink-0">
          <span className="font-hud text-[10px] uppercase tracking-[0.2em] text-white/45 flex items-center gap-2 min-w-0">
            <span className="w-1.5 h-1.5 shrink-0" style={{ background: dot, boxShadow: `0 0 7px ${edge}` }} />
            <span className="truncate">{label}{code && <span className="text-white/25 ml-1">// {code}</span>}</span>
          </span>
          {action}
        </div>
        <div className="flex-1 min-h-0">{children}</div>
      </div>
    </div>
  )
}

function TraceLine({ step }: { step: TraceStep }) {
  if (step.kind === 'thinking')
    return <div className="border-l-2 border-fuchsia-400/25 pl-3 text-[12.5px] leading-relaxed text-fuchsia-100/45 italic whitespace-pre-wrap">{step.text}</div>
  if (step.kind === 'tool')
    return <div className="font-hud text-[11px] text-cyan-300/85 bg-cyan-500/8 px-2 py-1 inline-block" style={{ boxShadow: 'inset 0 0 0 1px rgba(34,211,238,0.15)' }}>⚙ {step.text}</div>
  if (step.kind === 'result')
    return <div className="text-[12.5px] text-cyan-100/70 pl-3 whitespace-pre-wrap">→ {step.text}</div>
  return <div className="text-[13.5px] text-white/85 leading-relaxed whitespace-pre-wrap pt-1 border-t border-white/5">{step.text}</div>
}
