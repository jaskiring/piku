import { graphService } from '../../features/graph'
import type { GraphNode, GraphEdge } from '../../features/graph/types'
import type { Project } from '../../features/projects/types'

// ─────────────────────────────────────────────────────────────────────────────
// Modes & Templates — how Piku APPROACHES a turn, as model-independent data.
//
// A turn runs in a Mode. Each mode is a template that decides (a) the system framing,
// (b) what context to assemble, (c) whether to use the Mac tools or the reasoning brain,
// (d) whether to show the approach/project graph. The PROVIDER (opencode / Ollama / a future
// self-hosted model) only executes the assembled prompt — so swapping the model never touches
// this file. That is the whole point: structure lives here, not in the model.
//
// Triggers (owner): a leading slash (/execute /project /brainstorm /chat) OR an "X mode" phrase
// anywhere (works for voice too, since STT → text). Mode is sticky per session.
// ─────────────────────────────────────────────────────────────────────────────

export type Mode = 'auto' | 'execute' | 'project' | 'brainstorm'

export interface ModeMeta { id: Mode; label: string; glyph: string; accent: 'cyan' | 'violet' | 'amber' }
export const MODES: ModeMeta[] = [
  { id: 'auto',       label: 'Auto',       glyph: '◇', accent: 'cyan'   },
  { id: 'execute',    label: 'Execute',    glyph: '▶', accent: 'cyan'   },
  { id: 'project',    label: 'Project',    glyph: '◆', accent: 'violet' },
  { id: 'brainstorm', label: 'Brainstorm', glyph: '✦', accent: 'amber'  },
]

// ── Trigger detection ─────────────────────────────────────────────────────────

const SLASH  = /^\s*\/(execute|exec|project|proj|brainstorm|brain|chat|auto)\b[ \t]*/i
const PHRASE = /\b(execute|project|brainstorm(?:ing)?|chat|auto)\s+mode\b[ \t]*/i

function normalize(s: string): Mode {
  const t = s.toLowerCase()
  if (t.startsWith('exec'))  return 'execute'
  if (t.startsWith('proj'))  return 'project'
  if (t.startsWith('brain')) return 'brainstorm'
  return 'auto'   // chat / auto
}

/** Pull a mode trigger out of a message (slash or "X mode" phrase) and return the cleaned text. */
export function detectMode(message: string): { mode: Mode | null; cleaned: string } {
  const sl = message.match(SLASH)
  if (sl) return { mode: normalize(sl[1]), cleaned: message.replace(SLASH, '').trim() }
  const ph = message.match(PHRASE)
  if (ph) return { mode: normalize(ph[1]), cleaned: message.replace(ph[0], '').replace(/\s{2,}/g, ' ').trim() }
  return { mode: null, cleaned: message }
}

// Brainstorm: did they ask to use a specific external assistant?
export function detectExternal(message: string): { app: string; web: string; name: string } | null {
  const t = message.toLowerCase()
  if (/\bclaude\b|\banthropic\b/.test(t))            return { name: 'Claude',  app: 'Claude',        web: 'https://claude.ai' }
  if (/\bgemini\b|\bbard\b|\bgoogle ai\b/.test(t))   return { name: 'Gemini',  app: 'Google Chrome', web: 'https://gemini.google.com/app' }
  if (/\bchatgpt\b|\bgpt\b|\bopenai\b/.test(t))      return { name: 'ChatGPT', app: 'ChatGPT',       web: 'https://chatgpt.com' }
  return null
}

// ── Context assembly ────────────────────────────────────────────────────────

export interface AssembledContext {
  systemAddon: string        // mode framing + assembled context — appended to the caller's base system
  useTools:    boolean       // true → ToolRouter (Ollama, Piku's Mac tools); false → reasoning brain (opencode)
  flow?:       { understand: string[]; plan: string[] }    // the template's approach, shown as the flow graph
  graph?:      { nodes: GraphNode[]; edges: GraphEdge[] }   // project subgraph for the UI
  handoff?:    { app: string; web: string; name: string }  // brainstorm → open an external assistant
  note?:       string        // short status (e.g. "No project linked")
}

const EXECUTE_FRAMING = `[EXECUTE MODE] Bias to action. If a tool does what they asked, fire it and give them the real result — no asking permission for safe actions. If nothing's actionable, just say so.`

const PROJECT_FRAMING = `[PROJECT MODE] Think within THIS project's world — lean on its state, decisions, and knowledge graph below, and flag when something isn't covered rather than inventing it. Grounded, but not rigid: answer however actually fits.`

const BRAINSTORM_FRAMING = `[BRAINSTORM MODE] Think WITH them, not at them. Riff, explore, follow tangents, float half-formed ideas and build on theirs. Bring different angles when it helps; use web_search when a real fact would sharpen things. You do NOT have to converge on one answer or hand them a recommendation — leaving threads open and just thinking together is the point.`

function trim(s: string, n: number): string { return s.length > n ? s.slice(0, n).trimEnd() + '…' : s }

function formatProject(p: Project): string {
  const lines: string[] = [`Name: ${p.name}`, `State: ${p.currentState}`, `Vision: ${trim(p.vision, 240)}`]
  if (p.inProgressWork?.length) lines.push(`In progress: ${p.inProgressWork.slice(0, 5).join('; ')}`)
  if (p.nextSteps?.length)      lines.push(`Next steps: ${p.nextSteps.slice(0, 5).join('; ')}`)
  if (p.blockers?.length)       lines.push(`Blockers: ${p.blockers.slice(0, 4).join('; ')}`)
  if (p.decisions?.length)      lines.push(`Decisions:\n` + p.decisions.slice(0, 6).map(d => `  • ${d.title} — ${trim(d.reasoning, 120)}`).join('\n'))
  if (p.research?.length)       lines.push(`Research:\n` + p.research.slice(0, 4).map(r => `  • ${r.summary ? trim(r.summary, 100) : r.source}`).join('\n'))
  return lines.join('\n')
}

function formatSubgraph(sub: { nodes: GraphNode[]; edges: GraphEdge[] }): string {
  if (!sub.nodes.length) return ''
  const byId = new Map(sub.nodes.map(n => [n.id, n.name]))
  const nodesByType: Record<string, string[]> = {}
  for (const n of sub.nodes) (nodesByType[n.type] ??= []).push(n.name)
  const nodeLines = Object.entries(nodesByType).map(([t, ns]) => `  ${t}: ${ns.slice(0, 12).join(', ')}`)
  const edgeLines = sub.edges.slice(0, 24).map(e => `  ${byId.get(e.fromId) ?? '?'} —${e.relationship}→ ${byId.get(e.toId) ?? '?'}`)
  return `Knowledge graph (${sub.nodes.length} nodes, ${sub.edges.length} edges):\nNodes:\n${nodeLines.join('\n')}\nRelationships:\n${edgeLines.join('\n')}`
}

/**
 * Assemble the mode-specific addon + flags. `auto` is handled by the caller's existing
 * classifyIntent path (returns a passthrough). Non-auto modes override.
 */
export async function assembleMode(
  mode: Mode,
  args: { message: string; linkedProject?: Project | null },
): Promise<AssembledContext> {
  switch (mode) {
    case 'execute':
      return {
        systemAddon: EXECUTE_FRAMING, useTools: true,
        flow: { understand: ['Read the request', 'Choose the right tool'], plan: ['Fire the tool', 'Report the real result'] },
      }

    case 'project': {
      const p = args.linkedProject
      if (!p) {
        return {
          systemAddon: PROJECT_FRAMING + '\n\n(No project is linked to this session — link one with "+ Link project" so I can ground the reasoning. Answering from general knowledge for now.)',
          useTools: false, note: 'No project linked',
          flow: { understand: ['Link a project to ground this'], plan: ['Reason from general knowledge', 'Answer'] },
        }
      }
      const sub = await graphService.getProjectSubgraph(p.id).catch(() => null)
      const ctx = formatProject(p) + (sub && sub.nodes.length ? `\n\n${formatSubgraph(sub)}` : '')
      const understand = sub && sub.nodes.length
        ? sub.nodes.slice(0, 6).map(n => `${n.type}: ${n.name}`)
        : [`Project: ${p.name}`, `State: ${p.currentState}`]
      return {
        systemAddon: `${PROJECT_FRAMING}\n\nPROJECT — "${p.name}":\n${ctx}`,
        useTools: false, graph: sub ?? undefined,
        flow: { understand, plan: ['Ground in decisions & graph', 'Reason it through', 'Answer'] },
      }
    }

    case 'brainstorm': {
      const ext = detectExternal(args.message)
      if (ext) return { systemAddon: BRAINSTORM_FRAMING, useTools: false, handoff: ext }
      return {
        systemAddon: BRAINSTORM_FRAMING, useTools: false,
        flow: { understand: ['Frame the question'], plan: ['Explore angles', 'Riff & build together', 'Leave threads open'] },
      }
    }

    default: // auto — caller keeps its classifyIntent behavior
      return { systemAddon: '', useTools: false }
  }
}

/** Open an external assistant and copy the prompt to the clipboard so the owner can paste it. */
export async function handoffToExternal(h: { app: string; web: string }, prompt: string): Promise<void> {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('copy_to_clipboard', { text: prompt }).catch(() => {})
    if (h.app && h.app !== 'Google Chrome') {
      try { await invoke('open_app', { name: h.app }); return } catch { /* fall through to web */ }
    }
    await invoke('open_in_app', { app: 'Google Chrome', target: h.web }).catch(() => {})
  } catch { /* not in the desktop app */ }
}
