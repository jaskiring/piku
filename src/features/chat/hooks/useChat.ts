import { useState, useCallback, useRef } from 'react'
import type { Sender, PresenceState }    from '../../../types'
import { ConversationSummaryService }    from '../../memory'
import { MemoryService }                 from '../../memory'
import { projectService }                from '../../projects/components/ProjectDashboard'
import { WorldModelQueryService }        from '../../worldmodel/WorldModelQueryService'
import { graphService }                  from '../../graph'
import { ollamaService }                 from '../../../services/OllamaService'
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
    await pause(380)
    setPresenceState('thinking')

    try {
      // ── Step 1: Retrieve context in parallel ──────────────────────────────
      // worldModelContext replaces the old separate memory + project calls.
      // It aggregates Projects + Decisions + Memories + Graph in one pass,
      // using hybrid retrieval (keyword + semantic + graph traversal).
      const [worldModelContext, summaryContext] = await Promise.all([
        worldModelService.queryForContext(trimmed),
        summaryService.getContext(trimmed),
      ])

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

      // ── Step 3: Call qwen3 (streaming) ───────────────────────────────────
      addMessage('piku', '')  // streaming placeholder — empty, not persisted
      streamingPlaceholderAdded = true
      let streamAccumulated   = ''
      let thinkingAccumulated = ''
      const { response, latencyMs } = await ollamaService.chatStream(
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
          updateLastPikuThinking(thinkingAccumulated)
        },
      )
      updateLastPikuMessage(response)  // final clean version (thinking tokens fully stripped)
      logger.chat('response', { chars: response.length, latencyMs })

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
