import { useEffect, useRef, useState } from 'react'
import type { PresenceState } from '../../../types'
import type { Project } from '../../projects/types'
import { ScreenShell, Hint } from './ScreenShell'
import { chamfer } from '../Hud'
import { Orb } from '../../orb'
import { toolRouter } from '../../../services/ToolRouter'
import type { TraceStep } from '../../../services/ToolRouter'
import { voiceService } from '../../../services/VoiceService'
import { projectService } from '../../projects/components/ProjectDashboard'
import { agentHub } from './agentSession'
import { PIKU_PERSONA } from '../../../lib/persona'
import { planReasoning, classifyIntent } from '../../../services/ReasoningPlanner'
import type { ReasoningFlow } from '../../../services/ReasoningPlanner'
import { opencodeProvider } from '../../../services/OpencodeProvider'
import { isOpencodeBrain } from '../../chat/hooks/useChat'
import { detectMode, assembleMode, handoffToExternal, MODES } from '../../../services/modes/Modes'
import type { Mode } from '../../../services/modes/Modes'
import { projectBrainService, modeToCategory, toSlug } from '../../../services/ProjectBrainService'
import { MemoryService, ConversationSummaryService } from '../../memory'
import { graphService } from '../../graph'

const memoryService = new MemoryService()
const summaryService = new ConversationSummaryService()

const AGENT_SYSTEM_PROMPT = `${PIKU_PERSONA}

You're also in agent mode right now: running on this person's Mac, with real tools you can call —
open_app (open/focus an app), open_link (open a URL/file/folder), web_search (open a web search in
the browser; pass app "Google Chrome"), list_files (a folder under their home), save_memory /
recall_memory / get_datetime, GitHub — github_commits_today (what they shipped today/this week,
across both accounts), github_list_repos, github_recent_activity, Gmail — gmail_check (read their
inbox; supports a Gmail query), and Calendar — calendar_check (what's on their calendar today / this
week). For "what did I commit/ship today" use github_commits_today. For "what's on my calendar" or
"do I have meetings" use calendar_check. For "any important email" use gmail_check.
RULE: if they ask you to open, launch, show, play, search, look up, or get headlines, you MUST call
the matching tool — never claim you did it without actually calling it, and don't over-deliberate:
pick the tool and fire it. web_search opens the search AND returns the top results — read them and
give the actual answer in full, complete and unabbreviated (not "a line or two" — however much
detail the question needs). You can't delete files or run arbitrary commands. When no
action is needed, just talk like yourself.
REPLY DISCIPLINE: Reply as Piku — first person, direct. Never open with planning or narration about
the user. Forbidden openers: "The user wants…", "The user needs…", "Let me…", "I'll ", "I will ",
"I should", "I don't need", "Okay, so", "First, I". Start with the answer itself, not a preamble.`

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
  const [liveAnswer, setLiveAnswer]     = useState('')   // the reply, streaming in token-by-token
  const [liveStatus, setLiveStatus]     = useState('')   // live "Checking Gmail…" while a chore runs
  const [flow, setFlow]                 = useState<ReasoningFlow | null>(null)   // understand→plan for complex asks
  const [voiceOut, setVoiceOut]         = useState(true)
  const [projects, setProjects]         = useState<Project[]>([])
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft]     = useState('')
  const [projMenu, setProjMenu]         = useState(false)
  const [editingProj, setEditingProj]   = useState(false)
  const [projDraft, setProjDraft]       = useState('')
  const [renamingId, setRenamingId]     = useState<string | null>(null)   // rail project rename
  const [renameDraft, setRenameDraft]   = useState('')

  const inputRef = useRef<HTMLInputElement>(null)
  const convEnd  = useRef<HTMLDivElement>(null)
  const traceEnd = useRef<HTMLDivElement>(null)
  const isTauri  = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

  const loadProjects = () => { void projectService.getAllProjects().then(setProjects).catch(() => {}) }
  useEffect(loadProjects, [])
  useEffect(() => { convEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [turns.length, ctx?.id, liveAnswer])
  useEffect(() => { traceEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [trace, liveThinking, running])
  useEffect(() => { if (!running) inputRef.current?.focus() }, [running, ctx?.id])

  const linkedProject = ctx?.projectId ? projects.find(p => p.id === ctx.projectId) : undefined
  const mode: Mode = ctx?.mode ?? 'auto'

  // The reasoning brain: opencode (free, capable) → reasoning streams to the THINKING & ACTIONS
  // panel and the answer to the main pane (this fixes the old leak where qwen3 dumped its chain-of-
  // thought into the chat). Falls back to local Ollama if opencode is unreachable.
  const runBrain = async (system: string, msg: string, history: { role: 'you' | 'piku'; text: string }[]) => {
    try {
      if (isOpencodeBrain() && await opencodeProvider.ensureServer()) {
        setPhase('thinking')
        let captured = ''
        const reply = await opencodeProvider.chatStream(
          system, msg, history,
          t => { captured += t; setLiveThinking(p => p + t) },                 // reasoning streams live → panel
          c => { setPhase('speaking'); setLiveAnswer(p => p + c) },           // answer streams live → chat
        )
        if (reply) {
          // Persist the reasoning so it stays visible in the ACT panel after the turn finishes.
          agentHub.setTrace(captured.trim() ? [{ kind: 'thinking', text: captured.trim() }] : [])
          agentHub.addTurn({ role: 'piku', text: reply })
          void memoryService.processConversationTurn(msg, reply).catch(() => {})
          void summaryService.onExchange(msg, reply).catch(() => {})
          void projectService.processConversation(msg, reply).catch(() => {})
          void graphService.processConversation(msg, reply).catch(() => {})
          if (voiceOut) voiceService.speak(reply)
          return
        }
      }
    } catch { /* fall through to local */ }
    setLiveAnswer(''); setLiveThinking('');
    const onTool = (label: string) => { setLiveStatus(label); setPhase('acting') };
    const { reply, trace } = await toolRouter.runWithTools(
      msg, system,
      d => setLiveThinking(p => p + d),
      d => { setPhase('speaking'); setLiveAnswer(p => p + d) },
      history, true, onTool,
    )
    agentHub.setTrace(trace)
    agentHub.addTurn({ role: 'piku', text: reply || '(done)' })
    void memoryService.processConversationTurn(msg, reply || '(done)').catch(() => {})
    void summaryService.onExchange(msg, reply || '(done)').catch(() => {})
    void projectService.processConversation(msg, reply || '(done)').catch(() => {})
    void graphService.processConversation(msg, reply || '(done)').catch(() => {})
    if (voiceOut) voiceService.speak(reply)
  }

  const run = async (text: string) => {
    const raw = text.trim()
    if (!raw || running) return
    voiceService.prime()
    setInput('')
    // Mode triggers (/execute · "project mode" · …) — sticky per session.
    const det = detectMode(raw)
    if (det.mode) agentHub.setMode(det.mode)
    const activeMode: Mode = agentHub.active()?.mode ?? 'auto'
    const msg = det.cleaned || raw

    const history = agentHub.active()?.turns ?? []
    agentHub.addTurn({ role: 'you', text: raw })
    agentHub.setTrace([])
    setLiveThinking(''); setLiveAnswer(''); setLiveStatus(''); setFlow(null)
    setRunning(true); setPhase('thinking')
    try {
      const onTool = (label: string) => { setLiveStatus(label); setPhase('acting') }
      const runTools = async (system: string, think: boolean) => {
        const { reply, trace } = await toolRouter.runWithTools(
          msg, system,
          d => setLiveThinking(p => p + d),
          d => { setPhase('speaking'); setLiveStatus(''); setLiveAnswer(p => p + d) },
          history, think, onTool,
        )
        agentHub.setTrace(trace)
        agentHub.addTurn({ role: 'piku', text: reply || '(done)' })
        void memoryService.processConversationTurn(msg, reply || '(done)').catch(() => {})
        void summaryService.onExchange(msg, reply || '(done)').catch(() => {})
        void projectService.processConversation(msg, reply || '(done)').catch(() => {})
        void graphService.processConversation(msg, reply || '(done)').catch(() => {})
        if (voiceOut) voiceService.speak(reply)
      }

      if (activeMode === 'auto') {
        // Auto: classifyIntent decides — tool chores → ToolRouter; chat/complex → opencode brain.
        const intent = classifyIntent(msg)
        if (intent.kind === 'complex') {
          setFlow({ simple: false, understand: ['Understanding the problem…'], plan: ['Working out the steps…'] })
          void planReasoning(msg).then(f => { if (!f.simple) setFlow(f) }).catch(() => {})
        }
        // think=true → qwen3 puts its reasoning in the separate `thinking` field (→ Thinking panel),
        // not inline in the answer. (Fixes the chain-of-thought leaking into the chat.)
        if (intent.kind === 'tool') await runTools(AGENT_SYSTEM_PROMPT, true)
        else                        await runBrain(AGENT_SYSTEM_PROMPT, msg, history)
      } else {
        // Derive brain slug from linked project name → session title → 'untitled'
        const brainCategory = modeToCategory(activeMode)
        const brainSlug = toSlug(
          linkedProject?.name ?? ctx?.title ?? 'untitled'
        )
        // Load brain context and prepend to system prompt for project mode.
        // Race against a 4 s timeout so a slow/hung vault read can never block the turn.
        let brainAddon = ''
        if (activeMode === 'project' && brainCategory && brainSlug) {
          brainAddon = await Promise.race([
            projectBrainService.load(brainCategory, brainSlug).catch(() => ''),
            new Promise<string>(res => setTimeout(() => res(''), 4_000)),
          ])
        }

        const asm = await assembleMode(activeMode, { message: msg, linkedProject })
        if (asm.note) setLiveStatus(asm.note)
        // Always paint the mode's approach flow so the template is visible while Piku works.
        if (asm.flow) setFlow({ simple: false, understand: asm.flow.understand, plan: asm.flow.plan })

        const systemWithBrain = brainAddon
          ? AGENT_SYSTEM_PROMPT + '\n\n' + brainAddon + '\n\n' + asm.systemAddon
          : AGENT_SYSTEM_PROMPT + '\n\n' + asm.systemAddon

        if (asm.handoff) {
          await handoffToExternal(asm.handoff, msg)
          agentHub.addTurn({ role: 'piku', text: `Opened ${asm.handoff.name} and copied your prompt to the clipboard — paste it there to continue the brainstorm.` })
        } else if (asm.useTools) {
          await runTools(systemWithBrain, true)
        } else {
          await runBrain(systemWithBrain, msg, history)
        }

        // Fire-and-forget: persist turn + graph + gdd to the vault (non-blocking, best-effort)
        if (brainCategory && brainSlug) {
          const pikuTurns = agentHub.active()?.turns.filter(t => t.role === 'piku') ?? []
          const pikulReply = pikuTurns[pikuTurns.length - 1]?.text ?? ''
          const sessionTitle = linkedProject?.name ?? ctx?.title ?? 'Untitled'
          void (async () => {
            try {
              await graphService.getProjectSubgraph(linkedProject?.id ?? '').then(sub => {
                if (sub) void projectBrainService.saveGraph(brainCategory, brainSlug, sub).catch(() => {})
              }).catch(() => {
                // No project subgraph — save full graph instead
                void Promise.all([
                  graphService.getAllNodes(),
                  graphService.getConfirmedEdges(),
                ]).then(([nodes, edges]) =>
                  projectBrainService.saveGraph(brainCategory, brainSlug, { nodes, edges })
                ).catch(() => {})
              })
            } catch { /* best-effort */ }
            void projectBrainService.saveTurn(brainCategory, brainSlug, msg, pikulReply).catch(() => {})
            void projectBrainService.updateGdd(brainCategory, brainSlug, sessionTitle, msg.slice(0, 120)).catch(() => {})
          })()
        }
      }
    } catch (e) {
      agentHub.addTurn({ role: 'piku', text: `Something went wrong: ${String(e)}` })
    } finally { setRunning(false); setPhase('idle'); setLiveThinking(''); setLiveAnswer(''); setLiveStatus('') }
  }

  // Type freely — send only on Enter / the send button / a final voice transcript. (No auto-submit:
  // the old 2.2s idle-timer fired messages by itself mid-typing.)
  // Phase-aware label shown under the orb — tells the user exactly what Piku is doing.
  const orbLabel = (() => {
    switch (phase) {
      case 'listening': return 'listening…'
      case 'thinking':  return 'thinking…'
      case 'speaking':  return liveStatus ? liveStatus : 'speaking…'
      case 'acting':    return liveStatus || 'acting…'
      case 'updating':  return 'updating…'
      default:          return 'here with you'
    }
  })()

  const onInputChange = (v: string) => setInput(v)

  const commitTitle = () => { if (ctx) agentHub.rename(ctx.id, titleDraft); setEditingTitle(false) }

  const commitProjName = async () => {
    const name = projDraft.trim()
    if (linkedProject && name && name !== linkedProject.name) {
      await projectService.updateProject(linkedProject.id, { name }).catch(() => {})
      loadProjects()
    }
    setEditingProj(false)
  }

  // Rename a project from the bottom Projects bar (or the linked-project chip).
  const commitRename = async () => {
    const id = renamingId, name = renameDraft.trim()
    if (id && name) { await projectService.updateProject(id, { name }).catch(() => {}); loadProjects() }
    setRenamingId(null)
  }

  // Create a fresh project from the Projects bar, then open inline rename.
  const createBlankProject = async () => {
    const base = `New project · ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
    try {
      const p = await projectService.createProject(base, base, 'Planning')
      loadProjects(); setRenameDraft(p.name); setRenamingId(p.id)
    } catch { /* ignore */ }
  }

  const createProjectFromContext = async () => {
    if (!ctx) return
    // Never leave a project nameless: prefer the session title, then its first message, then a
    // dated default — and open inline rename immediately so the user can set a real name.
    const firstYou = ctx.turns.find(t => t.role === 'you')?.text?.trim()
    const derived =
      (ctx.title && ctx.title !== 'New context') ? ctx.title
      : firstYou ? (firstYou.length > 46 ? `${firstYou.slice(0, 46).trimEnd()}…` : firstYou)
      : `New project · ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
    try {
      const project = await projectService.createProject(derived, firstYou || derived, 'Planning')
      agentHub.linkProject(project.id)
      loadProjects()
      setProjMenu(false)
      setProjDraft(project.name); setEditingProj(true)
    } catch { setProjMenu(false) }
  }

  return (
    <ScreenShell
      title="Agent"
      subtitle="Your control hub. Each session is a separate chat — link it to a project, feed the World Model."
    >
      <div className="grid grid-cols-12 gap-4" style={{ height: '74vh' }}>

        {/* ── SESSIONS RAIL ── */}
        <Frame className="col-span-12 lg:col-span-3" label="Sessions" code={String(contexts.length).padStart(2, '0')}>
          <div className="h-full overflow-y-auto px-2 py-2 flex flex-col gap-1">

            {/* presence orb — the protagonist, on the left */}
            <div className="flex flex-col items-center pt-3 pb-4 shrink-0">
              <Orb presence={phase} size={104} />
              <div className="font-hud text-[9.5px] uppercase tracking-[0.18em] text-cyan-300/55 mt-2">{orbLabel}</div>
            </div>

            {/* prominent new-session */}
            <button onClick={() => agentHub.createContext()}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 mb-1 font-hud text-[10.5px] uppercase tracking-[0.18em] text-cyan-100 bg-cyan-500/12 hover:bg-cyan-500/20 transition-colors"
              style={{ ...chamfer(8), boxShadow: 'inset 0 0 0 1px rgba(34,211,238,0.3)' }}>
              <span className="text-cyan-300 text-glow-cyan text-[13px]">＋</span> New session
            </button>

            {/* Sessions list */}
            <div className="font-hud text-[8.5px] uppercase tracking-[0.22em] text-cyan-200/45 px-2 pb-1.5 pt-3">Recent</div>
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
        <Frame className="col-span-12 lg:col-span-6" label="Context" code={ctx ? ctx.title.slice(0, 18) : '—'}
          action={
            <div className="relative">
              {linkedProject ? (
                <span className="font-hud text-[9.5px] uppercase tracking-[0.12em] text-fuchsia-200/90 flex items-center gap-1.5">
                  <span>◆</span>
                  {editingProj ? (
                    <input autoFocus value={projDraft} onChange={e => setProjDraft(e.target.value)}
                      onBlur={commitProjName}
                      onKeyDown={e => { if (e.key === 'Enter') commitProjName(); if (e.key === 'Escape') setEditingProj(false) }}
                      className="bg-transparent text-fuchsia-100 border-b border-fuchsia-400/40 outline-none uppercase tracking-[0.12em] w-32" />
                  ) : (
                    <button onClick={() => { setProjDraft(linkedProject.name); setEditingProj(true) }}
                      className="hover:text-fuchsia-100 transition-colors max-w-[140px] truncate" title="Rename project">{linkedProject.name}</button>
                  )}
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
            {/* editable session title (orb lives on the left rail now) */}
            <div className="flex items-center justify-center pt-3.5 pb-3 px-6 shrink-0 border-b border-white/[0.05]">
              {editingTitle ? (
                <input autoFocus value={titleDraft} onChange={e => setTitleDraft(e.target.value)}
                  onBlur={commitTitle} onKeyDown={e => { if (e.key === 'Enter') commitTitle(); if (e.key === 'Escape') setEditingTitle(false) }}
                  className="bg-transparent text-center text-[14px] text-white/90 border-b border-cyan-400/40 outline-none" />
              ) : (
                <button onClick={() => { setTitleDraft(ctx?.title ?? ''); setEditingTitle(true) }}
                  className="text-[14px] text-white/85 hover:text-white max-w-full truncate transition-colors" title="Rename session">
                  {ctx?.title || 'New context'}
                </button>
              )}
            </div>

            {/* transcript — transform+isolation force a stable GPU compositing layer in WKWebView,
                preventing the fuchsia/magenta rectangle artifact that appears during streaming repaints. */}
            <div className="flex-1 overflow-y-auto px-5 min-h-0"
              style={{ transform: 'translateZ(0)', willChange: 'transform', isolation: 'isolate' }}>
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
                  {/* live reply — streams in token-by-token so there's no dead loading gap.
                      translateZ(0) + willChange give this rapidly-repainting node its own GPU layer so
                      WKWebView doesn't composite it with the fuchsia Frame gradient behind it. */}
                  {running && (liveAnswer
                    ? <div className="flex justify-start"><div className="max-w-[85%] text-[14px] leading-relaxed text-white/85 whitespace-pre-wrap" style={{ transform: 'translateZ(0)', willChange: 'transform' }}>{liveAnswer}<span className="animate-blink text-cyan-300 ml-0.5">▋</span></div></div>
                    : <div className="flex justify-start"><div className="flex items-center gap-2 text-cyan-300/70 px-1">
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/70 animate-pulse" />
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/50 animate-pulse [animation-delay:150ms]" />
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/40 animate-pulse [animation-delay:300ms]" />
                        </span>
                        <span className="text-[12.5px] text-cyan-100/65">{liveStatus || 'thinking…'}</span>
                      </div></div>
                  )}
                  <div ref={convEnd} />
                </div>
              )}
            </div>

            {/* mode pills — how Piku approaches this session (sticky; also set by /execute, "project mode", …) */}
            <div className="flex items-center gap-1.5 px-3 pt-2 shrink-0">
              {MODES.map(md => {
                const on = md.id === mode
                const edge = md.accent === 'violet' ? 'rgba(217,70,239,0.4)' : md.accent === 'amber' ? 'rgba(245,158,11,0.4)' : 'rgba(34,211,238,0.4)'
                const txt  = on ? (md.accent === 'violet' ? 'text-fuchsia-200' : md.accent === 'amber' ? 'text-amber-200' : 'text-cyan-200') : 'text-white/35 hover:text-white/70'
                return (
                  <button key={md.id} onClick={() => agentHub.setMode(md.id)} title={`${md.label} mode`}
                    className={`font-hud text-[9px] uppercase tracking-[0.14em] px-2 py-1 transition-colors ${txt}`}
                    style={on ? { ...chamfer(5), boxShadow: `inset 0 0 0 1px ${edge}` } : undefined}>
                    <span className="mr-1">{md.glyph}</span>{md.label}
                  </button>
                )
              })}
            </div>

            {/* input */}
            <div className="border-t border-white/[0.06] p-3 shrink-0">
              <div className="flex items-center gap-2 px-3.5 py-2 bg-white/[0.04]"
                style={{ ...chamfer(8), boxShadow: 'inset 0 0 0 1px rgba(34,211,238,0.15)' }}>
                <span className="font-hud text-cyan-300 text-glow-cyan">›</span>
                <input ref={inputRef} value={input} onChange={e => onInputChange(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && input.trim() && !running) { e.preventDefault(); void run(input) } }}
                  onFocus={() => { if (!running) setPhase('listening') }}
                  onBlur={() => { if (!running) setPhase('idle') }}
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

        {/* ── REASONING FLOW: understand → plan → act (act = live thinking + trace) ── */}
        <Frame className="col-span-12 lg:col-span-3" label={flow ? 'Reasoning Flow' : 'Thinking & Actions'} accent="violet"
          action={<span className={`w-1.5 h-1.5 rounded-full ${running ? 'bg-fuchsia-400 animate-pulse' : 'bg-white/25'}`} />}>
          <div className="h-full overflow-y-auto px-5 py-4 flex flex-col gap-4">
            {flow && (
              <>
                <FlowStage label="Understand" n="01"><UnderstandMap aspects={flow.understand ?? []} /></FlowStage>
                <FlowStage label="Plan" n="02"><PlanSteps steps={flow.plan ?? []} /></FlowStage>
                <div className="font-hud text-[9.5px] uppercase tracking-[0.2em] text-fuchsia-200/70 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-fuchsia-400" style={{ boxShadow: '0 0 6px rgba(217,70,239,0.6)' }} />Act <span className="text-white/25">// 03</span>
                </div>
              </>
            )}
            {running ? (
              <div className="flex flex-col gap-3">
                <div className="border-l-2 border-fuchsia-400/30 pl-3 text-[12.5px] leading-relaxed text-fuchsia-100/55 italic whitespace-pre-wrap">{liveThinking || 'reasoning…'}</div>
                <div ref={traceEnd} />
              </div>
            ) : trace.length === 0 ? (
              !flow ? <Hint>Piku's reasoning and the actions it takes appear here, live, as it works.</Hint> : null
            ) : (
              <div className="flex flex-col gap-3">
                {trace.filter(s => s.kind !== 'answer').map((s, i) => <TraceLine key={i} step={s} />)}
                <div ref={traceEnd} />
              </div>
            )}
          </div>
        </Frame>
      </div>

      {/* ── PROJECTS BAR (bottom) — group sessions + ground PROJECT mode ── */}
      <div className="mt-4">
        <Frame label="Projects" code={String(projects.length).padStart(2, '0')} accent="violet"
          action={
            <button onClick={createBlankProject}
              className="font-hud text-[9.5px] uppercase tracking-[0.15em] text-fuchsia-200 hover:text-fuchsia-100 transition-colors flex items-center gap-1">
              <span className="text-fuchsia-300 text-glow-violet">＋</span> New project
            </button>
          }>
          <div className="flex items-center gap-2 overflow-x-auto px-1 py-1">
            {projects.length === 0 ? (
              <span className="font-hud text-[10px] uppercase tracking-wider text-white/30 px-2 py-2">No projects yet — create one to group sessions and ground PROJECT mode.</span>
            ) : projects.map(p => {
              const n = contexts.filter(c => c.projectId === p.id).length
              return (
                <div key={p.id} className="group/pb shrink-0 flex items-center gap-2 px-3 py-2"
                  style={{ ...chamfer(7), background: 'rgba(217,70,239,0.06)', boxShadow: 'inset 0 0 0 1px rgba(217,70,239,0.2)' }}>
                  <span className="text-fuchsia-300/80 text-[11px] shrink-0">◆</span>
                  {renamingId === p.id ? (
                    <input autoFocus value={renameDraft} onChange={e => setRenameDraft(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null) }}
                      className="bg-transparent text-[12.5px] text-white/90 border-b border-fuchsia-400/40 outline-none w-36" />
                  ) : (
                    <button onClick={() => { agentHub.createContext(); agentHub.linkProject(p.id) }}
                      title={`New session in ${p.name}`}
                      className="text-[12.5px] text-white/80 hover:text-white truncate max-w-[180px]">{p.name}</button>
                  )}
                  <span className="font-hud text-[8.5px] text-white/35 shrink-0">{n}</span>
                  <button onClick={() => { setRenameDraft(p.name); setRenamingId(p.id) }} title="Rename project"
                    className="font-hud text-[11px] text-fuchsia-300/55 hover:text-fuchsia-100 transition-colors shrink-0">✎</button>
                </div>
              )
            })}
          </div>
        </Frame>
      </div>
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

function FlowStage({ label, n, children }: { label: string; n: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-hud text-[9.5px] uppercase tracking-[0.2em] text-fuchsia-200/70 mb-2.5 flex items-center gap-2">
        <span className="w-1.5 h-1.5 bg-fuchsia-400" style={{ boxShadow: '0 0 6px rgba(217,70,239,0.6)' }} />{label} <span className="text-white/25">// {n}</span>
      </div>
      {children}
    </div>
  )
}

// The problem broken into aspects — a left-hub mind-map (hub → aspect nodes), the cyberpunk graph look.
function UnderstandMap({ aspects }: { aspects: string[] }) {
  const items = aspects.length ? aspects : ['(no breakdown)']
  const rowH = 24, h = Math.max(60, items.length * rowH + 16), cy = h / 2
  return (
    <svg viewBox={`0 0 360 ${h}`} className="w-full" style={{ height: h }}>
      <defs>
        <radialGradient id="uhub" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#a5f3fc" /><stop offset="100%" stopColor="#22D3EE" /></radialGradient>
      </defs>
      {items.map((a, i) => {
        const y = 12 + i * rowH + 6
        return (
          <g key={i}>
            <path d={`M 18 ${cy} C 64 ${cy}, 70 ${y}, 92 ${y}`} stroke="rgba(34,211,238,0.28)" fill="none" strokeWidth={1} />
            <circle cx={92} cy={y} r={2.8} fill="#7DD3FC" />
            <text x={102} y={y + 3.6} fill="rgba(214,232,255,0.82)" fontSize="11" fontFamily="ui-monospace, monospace">{a.length > 44 ? `${a.slice(0, 44)}…` : a}</text>
          </g>
        )
      })}
      <circle cx={18} cy={cy} r={6.5} fill="#22D3EE" opacity={0.22} />
      <circle cx={18} cy={cy} r={3.6} fill="url(#uhub)" />
    </svg>
  )
}

// Ordered steps to resolve it — a numbered vertical flowchart with connectors.
function PlanSteps({ steps }: { steps: string[] }) {
  const items = steps.length ? steps : ['(no plan)']
  return (
    <div className="flex flex-col">
      {items.map((s, i) => (
        <div key={i} className="flex items-stretch gap-2.5">
          <div className="flex flex-col items-center">
            <span className="font-hud text-[8.5px] w-5 h-5 flex items-center justify-center text-cyan-200 shrink-0"
              style={{ clipPath: 'polygon(0 0, calc(100% - 4px) 0, 100% 4px, 100% 100%, 4px 100%, 0 calc(100% - 4px))', boxShadow: 'inset 0 0 0 1px rgba(34,211,238,0.35)' }}>
              {String(i + 1).padStart(2, '0')}
            </span>
            {i < items.length - 1 && <span className="w-px flex-1 min-h-2.5 bg-cyan-400/25 my-1" />}
          </div>
          <span className="text-[12px] text-white/80 leading-snug pt-0.5 pb-2">{s}</span>
        </div>
      ))}
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
