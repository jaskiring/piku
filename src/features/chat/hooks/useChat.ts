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
import { logger }                        from '../../../lib/logger'
import { PIKU_PERSONA }                  from '../../../lib/persona'

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
      const needsTools = intent.kind === 'tool' || intent.kind === 'complex'
      const think      = intent.kind === 'complex'

      addMessage('piku', '')  // streaming placeholder — empty, not persisted
      streamingPlaceholderAdded = true

      let response: string
      if (needsTools) {
        // ── Tool path: route through ToolRouter ─────────────────────────────
        // chatToolRoundStream emits DELTAS → accumulate locally (updateLast* replace in place).
        const toolSystem = systemContent + '\n\n' + TOOLS_AWARE_SUFFIX
        let acc = '', thinkAcc = ''
        const { reply } = await toolRouter.runWithTools(
          trimmed, toolSystem,
          (delta) => { thinkAcc += delta; updateLastPikuThinking(thinkAcc) },
          (delta) => { acc += delta; updateLastPikuMessage(acc) },
          [],   // no prior history in Home ask bar (each ask is standalone for now)
          think,
          (label) => updateLastPikuThinking(label),   // "Checking Gmail…" surfaces while a chore runs
        )
        response = reply || '(done)'
        logger.chat('tool response', { chars: response.length, kind: intent.kind })
      } else {
        // ── Plain chat path: fast, no tool overhead ────────────────────────
        let streamAccumulated   = ''
        let thinkingAccumulated = ''
        const result = await ollamaService.chatStream(
          [
            { role: 'system', content: systemContent },
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
        logger.chat('response', { chars: response.length, latencyMs: result.latencyMs })
      }
      updateLastPikuMessage(response)  // final clean version
      logger.chat('response', { chars: response.length })

      // ── Step 4: Display ───────────────────────────────────────────────────
      setPresenceState('idle')

      // ── Step 5: Post-response processing — fire-and-forget ────────────────
      void memoryService
        .processConversationTurn(trimmed, response)
        .catch(err => logger.error('memory extraction failed', { error: String(err) }))

      void summaryService
        .onExchange(trimmed, response)
        .catch(err => logger.error('summary tracking failed', { error: String(err) }))

      void projectService
        .processConversation(trimmed, response)
        .catch(err => logger.error('project extraction failed', { error: String(err) }))

      void graphService
        .processConversation(trimmed, response)
        .catch(err => logger.error('graph extraction failed', { error: String(err) }))

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
