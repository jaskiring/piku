import { useState, useCallback, useRef } from 'react'
import type { Sender, PresenceState }    from '../../../types'
import { ConversationSummaryService }    from '../../memory'
import { MemoryService }                 from '../../memory'
import { projectService }                from '../../projects/components/ProjectDashboard'
import { WorldModelQueryService }        from '../../worldmodel/WorldModelQueryService'
import { graphService }                  from '../../graph'
import { ollamaService }                 from '../../../services/OllamaService'
import { toolRouter }                    from '../../../services/ToolRouter'
import { classifyIntent }                from '../../../services/ReasoningPlanner'
import { detectMode, assembleMode, handoffToExternal } from '../../../services/modes/Modes'
import { opencodeProvider }              from '../../../services/OpencodeProvider'
import { agentHub }                      from '../../os/screens/agentSession'
import { logger }                        from '../../../lib/logger'
import { PIKU_PERSONA }                  from '../../../lib/persona'

// opencode is Piku's deep-thinking brain (free, capable models). On by default; conversation +
// reasoning route to it, falling back to local Ollama if the server can't be reached. Toggle-able
// for a fully-local/private session later (the owner will swap in a self-hosted model).
let opencodeBrain = true
export const setOpencodeBrain = (on: boolean) => { opencodeBrain = on }
export const isOpencodeBrain  = () => opencodeBrain

// Module-level singletons — one instance per app lifetime
const memoryService     = new MemoryService()
const summaryService    = new ConversationSummaryService()
const worldModelService = new WorldModelQueryService()

// Exported so app startup can warm the model with the EXACT same static prefix the live chat
// uses (2.5-PERF) — that's what lets Ollama reuse the cached KV state for these tokens.
// Keep this prefix byte-stable; the dynamic context (world model, summary) is appended after it.
export const PIKU_SYSTEM_PROMPT = `${PIKU_PERSONA}

You have a continuous memory of this person across conversations — weave in what you know, but don't mention the memory system itself unless they ask.`

// Extended prompt for tool-capable mode: tells the model what tools it has access to.
// Appended to PIKU_SYSTEM_PROMPT when routing through the ToolRouter.
const TOOLS_AWARE_SUFFIX = `
You have real tools you can call: open_app, open_link, web_search, list_files, save_memory,
recall_memory, get_datetime, github_commits_today, github_list_repos, github_recent_activity,
gmail_check (read their inbox), calendar_check (what's on their calendar).
RULE: if they ask you to open, launch, show, play, search, look up, check email/calendar, or get
headlines, you MUST call the matching tool — pick the tool and fire it, don't deliberate.
When no action is needed, just talk like yourself.`

interface Options {
  addMessage:             (sender: Sender, text: string) => void
  setPresenceState:       (state: PresenceState) => void
  setInputText:           (text: string) => void
  updateLastPikuMessage:  (text: string) => void
  updateLastPikuThinking: (text: string) => void
}

export function useChat({ addMessage, setPresenceState, setInputText, updateLastPikuMessage, updateLastPikuThinking }: Options) {
  const [isSending, setIsSending] = useState(false)
  const guardRef = useRef(false)

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || guardRef.current) return

    guardRef.current = true
    setIsSending(true)
    setInputText('')
    addMessage('user', trimmed)
    // Home chat shares the Agent's session store (agentHub). Capture prior turns for memory,
    // then record this turn — so Home and Agent are one consistent set of sessions.
    const sessionHistory = agentHub.active()?.turns ?? []
    agentHub.addTurn({ role: 'you', text: trimmed })
    logger.chat('send', { text: trimmed.slice(0, 80) })
    let streamingPlaceholderAdded = false

    setPresenceState('listening')

    try {
      // ── Step 1: Retrieve context in parallel with the presence pause ──────
      // worldModelContext replaces the old separate memory + project calls.
      // It aggregates Projects + Decisions + Memories + Graph in one pass,
      // using hybrid retrieval (keyword + semantic + graph traversal).
      // Start context retrieval immediately so it overlaps with the 120ms pause
      // (embedding + three source reads typically take 200-500ms).
      const [worldModelContext, summaryContext] = await Promise.all([
        worldModelService.queryForContext(trimmed),
        summaryService.getContext(trimmed),
      ])

      // Minimal presence pause — the rest of the "thinking" dead time is the
      // actual context retrieval and LLM first-token latency, not fake waiting.
      await pause(120)
      setPresenceState('thinking')

      logger.chat('context ready', {
        hasWorldModel: worldModelContext.length > 0,
        hasSummary:    summaryContext.length > 0,
        totalChars:    worldModelContext.length + summaryContext.length,
      })

      // ── Step 2: Build system prompt ───────────────────────────────────────
      // Order: personality → world model → conversation summary → user message
      const parts = [PIKU_SYSTEM_PROMPT]
      if (worldModelContext) parts.push(worldModelContext)
      if (summaryContext)    parts.push(summaryContext)
      const systemContent = parts.join('\n\n')

      // ── Step 3: Mode → route → call the brain/tools ──────────────────────
      // Modes (/execute · "project mode" · …) are sticky on the shared session and decide HOW Piku
      // approaches the turn. The provider just executes the assembled prompt (model-independent).
      const det  = detectMode(trimmed)
      if (det.mode) agentHub.setMode(det.mode)
      const mode = agentHub.active()?.mode ?? 'auto'
      const msg  = det.cleaned || trimmed

      addMessage('piku', '')  // streaming placeholder — empty, not persisted
      streamingPlaceholderAdded = true

      // Reusable paths. tool = local ToolRouter (Piku's Mac tools). brain = opencode (free, capable)
      // with local Ollama fallback. Both stream reasoning → thinking, answer → message.
      const toolPath = async (system: string, think: boolean): Promise<string> => {
        let acc = '', thinkAcc = ''
        const { reply } = await toolRouter.runWithTools(
          msg, system,
          (d) => { thinkAcc += d; updateLastPikuThinking(thinkAcc) },
          (d) => { acc += d; updateLastPikuMessage(acc) },
          sessionHistory, think,
          (label) => { setPresenceState('acting'); updateLastPikuThinking(label) },
        )
        return reply || '(done)'
      }
      const brainPath = async (system: string): Promise<string> => {
        if (opencodeBrain) {
          try {
            if (await opencodeProvider.ensureServer()) {
              setPresenceState('thinking')
              const reply = await opencodeProvider.chat(system, msg, sessionHistory, (t) => updateLastPikuThinking(t))
              if (reply) { updateLastPikuMessage(reply); logger.chat('opencode reply', { chars: reply.length }); return reply }
            } else logger.warn('opencode unreachable — using local Ollama')
          } catch (e) { logger.error('opencode brain failed — falling back to Ollama', { error: String(e) }) }
        }
        let streamAcc = '', thinkAcc = ''
        const priorMsgs = sessionHistory.slice(-10).map(t => ({
          role: (t.role === 'you' ? 'user' : 'assistant') as 'user' | 'assistant', content: t.text,
        }))
        const result = await ollamaService.chatStream(
          [{ role: 'system', content: system }, ...priorMsgs, { role: 'user', content: msg }],
          (c) => { streamAcc += c; updateLastPikuMessage(streamAcc) },
          (tc) => { thinkAcc += tc; updateLastPikuThinking(thinkAcc) },
        )
        return result.response
      }

      let response = ''
      if (mode === 'auto') {
        // Auto: tool chores → ToolRouter; conversation/reasoning → opencode brain.
        const intent = classifyIntent(msg)
        if (intent.kind === 'tool') response = await toolPath(systemContent + '\n\n' + TOOLS_AWARE_SUFFIX, true)
        else                        response = await brainPath(systemContent)
      } else {
        const projectId = agentHub.active()?.projectId
        const linkedProject = projectId ? await projectService.getProject(projectId).catch(() => null) : null
        const asm = await assembleMode(mode, { message: msg, linkedProject })
        if (asm.handoff) {
          await handoffToExternal(asm.handoff, msg)
          response = `Opened ${asm.handoff.name} and copied your prompt to the clipboard — paste it there to continue.`
          updateLastPikuMessage(response)
        } else if (asm.useTools) {
          response = await toolPath(systemContent + '\n\n' + TOOLS_AWARE_SUFFIX + '\n\n' + asm.systemAddon, true)
        } else {
          response = await brainPath(systemContent + '\n\n' + asm.systemAddon)
        }
      }
      updateLastPikuMessage(response)  // final clean version
      logger.chat('response', { chars: response.length, mode })
      agentHub.addTurn({ role: 'piku', text: response })   // persist the reply into the shared session

      // ── Step 4: Reply shown — weave the turn into the World Model (orb: 'updating') ────────
      // The reply is already on screen; this presence cue says "I'm filing this away".
      setPresenceState('updating')

      // ── Step 5: Post-response processing — fire-and-forget (Invariant 3). Not awaited on the
      // critical path; we only attach a settle handler to drop the orb back to idle.
      const post = [
        memoryService.processConversationTurn(trimmed, response)
          .catch(err => logger.error('memory extraction failed', { error: String(err) })),
        summaryService.onExchange(trimmed, response)
          .catch(err => logger.error('summary tracking failed', { error: String(err) })),
        projectService.processConversation(trimmed, response)
          .catch(err => logger.error('project extraction failed', { error: String(err) })),
        graphService.processConversation(trimmed, response)
          .catch(err => logger.error('graph extraction failed', { error: String(err) })),
      ]
      void Promise.allSettled(post).then(() => setPresenceState('idle'))

    } catch (err) {
      logger.error('sendMessage failed', { error: String(err) })
      const errMsg = "I can't reach Ollama right now. Make sure it's running: ollama serve"
      if (streamingPlaceholderAdded) {
        updateLastPikuMessage(errMsg)
      } else {
        addMessage('piku', errMsg)
      }
      setPresenceState('idle')
    } finally {
      guardRef.current = false
      setIsSending(false)
    }
  }, [addMessage, setPresenceState, setInputText, updateLastPikuMessage, updateLastPikuThinking])

  return { sendMessage, isSending }
}

function pause(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
