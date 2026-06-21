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

      // ── Step 3: Route the turn, then call the LLM ────────────────────────
      // Deterministic intent (zero LLM cost): chores fire a tool immediately, complex asks reason
      // (think=true), simple chat just replies. Same routing as the Agent screen — one behavior.
      const intent = classifyIntent(trimmed)
      // tool chores → local ToolRouter (fast, Piku's own tools). Conversation + reasoning (simple
      // or complex) → the opencode brain (falls back to local Ollama). think only matters for the
      // local tool path now.
      const needsTools = intent.kind === 'tool'
      const think      = intent.kind === 'complex'

      addMessage('piku', '')  // streaming placeholder — empty, not persisted
      streamingPlaceholderAdded = true

      let response = ''
      if (needsTools) {
        // ── Tool path: route through ToolRouter ─────────────────────────────
        // chatToolRoundStream emits DELTAS → accumulate locally (updateLast* replace in place).
        const toolSystem = systemContent + '\n\n' + TOOLS_AWARE_SUFFIX
        let acc = '', thinkAcc = ''
        const { reply } = await toolRouter.runWithTools(
          trimmed, toolSystem,
          (delta) => { thinkAcc += delta; updateLastPikuThinking(thinkAcc) },
          (delta) => { acc += delta; updateLastPikuMessage(acc) },
          sessionHistory,   // prior turns in this session → Piku remembers the conversation
          think,
          (label) => { setPresenceState('acting'); updateLastPikuThinking(label) },   // orb acts; "Checking Gmail…" surfaces
        )
        response = reply || '(done)'
        logger.chat('tool response', { chars: response.length, kind: intent.kind })
      } else {
        // ── Brain path: opencode (free, capable) first; local Ollama as fallback ───────────
        let done = false
        if (opencodeBrain) {
          try {
            if (await opencodeProvider.ensureServer()) {
              setPresenceState('thinking')
              const reply = await opencodeProvider.chat(
                systemContent, trimmed, sessionHistory,
                (thinkText) => updateLastPikuThinking(thinkText),
              )
              if (reply) {
                updateLastPikuMessage(reply)
                response = reply
                done = true
                logger.chat('opencode reply', { chars: reply.length, model: 'opencode' })
              }
            } else {
              logger.warn('opencode unreachable — using local Ollama')
            }
          } catch (e) {
            logger.error('opencode brain failed — falling back to Ollama', { error: String(e) })
          }
        }
        if (!done) {
          // ── Local fallback: Ollama streaming ──
          let streamAccumulated   = ''
          let thinkingAccumulated = ''
          const priorMsgs = sessionHistory.slice(-10).map(t => ({
            role: (t.role === 'you' ? 'user' : 'assistant') as 'user' | 'assistant',
            content: t.text,
          }))
          const result = await ollamaService.chatStream(
            [
              { role: 'system', content: systemContent },
              ...priorMsgs,
              { role: 'user',   content: trimmed        },
            ],
            (chunk) => {
              streamAccumulated += chunk
              updateLastPikuMessage(streamAccumulated)
            },
            (thinkChunk) => {
              thinkingAccumulated += thinkChunk
              updateLastPikuThinking(thinkChunk)
            },
          )
          response = result.response
          logger.chat('response', { chars: result.response.length, latencyMs: result.latencyMs })
        }
      }
      updateLastPikuMessage(response)  // final clean version
      logger.chat('response', { chars: response.length })
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
