import { ollamaService } from './OllamaService'
import type { OllamaTool, OllamaChatMessage } from './OllamaService'
import { MemoryService } from '../features/memory'
import type { MemoryCategory } from '../features/memory/types'
import { logger } from '../lib/logger'
import { accountService, gitHubConnector } from './accounts'

// 2.5-T — Tool / Function Calling foundation.
// A small, real tool registry + the orchestration loop (call → route → feed results back →
// final answer). Borrows Mark-XL's key efficiency idea: tools whose output is already
// user-ready SKIP the second LLM round (a full forward pass = latency + RAM we don't spend).
//
// NOTE: this is the foundation — it is callable and tested by `tsc`, but NOT yet wired into
// the live streaming chat (`useChat`). Wiring it in (so qwen3 can call these mid-conversation)
// is the next step; doing it here keeps the working chat path untouched.

const memoryService = new MemoryService()

// OS actions run in Rust (the webview can't touch the machine directly) — see src-tauri/os_tools.rs.
async function invokeTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

const VALID_CATEGORIES: readonly MemoryCategory[] = [
  'personal_fact', 'relationship', 'preference', 'long_term_goal', 'ongoing_project',
  'important_date', 'user_correction', 'recurring_habit', 'achievement', 'skill',
  'career', 'health_preference', 'location',
]

interface ToolDef {
  spec:          OllamaTool
  needsLlmRound: boolean   // false → result is user-ready; skip a 2nd LLM pass (Mark-XL fast path)
  run:           (args: Record<string, unknown>) => Promise<string>
}

const TOOLS: Record<string, ToolDef> = {
  get_datetime: {
    needsLlmRound: false,
    spec: {
      type: 'function',
      function: {
        name: 'get_datetime',
        description: 'Get the current local date and time.',
        parameters: { type: 'object', properties: {}, required: [] },
      },
    },
    run: async () => {
      const d = new Date()
      const date = d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
      return `It is ${date}, ${time}.`
    },
  },

  save_memory: {
    needsLlmRound: false,
    spec: {
      type: 'function',
      function: {
        name: 'save_memory',
        description: "Save a durable fact about the user to long-term memory. Call this whenever the user reveals personal information worth remembering.",
        parameters: {
          type: 'object',
          properties: {
            content:  { type: 'string', description: "The fact to remember, in the third person, e.g. \"User's sister is named Mae.\"" },
            category: { type: 'string', enum: VALID_CATEGORIES as unknown as string[], description: 'Memory category' },
          },
          required: ['content'],
        },
      },
    },
    run: async (args) => {
      const content = String(args.content ?? '').trim()
      if (!content) return 'Nothing to save.'
      const category: MemoryCategory =
        typeof args.category === 'string' && (VALID_CATEGORIES as readonly string[]).includes(args.category)
          ? (args.category as MemoryCategory)
          : 'personal_fact'
      await memoryService.addManual(content, category)
      return "Got it — I'll remember that."
    },
  },

  recall_memory: {
    needsLlmRound: true,   // the model should weave recalled facts into a natural reply
    spec: {
      type: 'function',
      function: {
        name: 'recall_memory',
        description: "Search the user's long-term memory for relevant facts before answering a personal question.",
        parameters: {
          type: 'object',
          properties: { query: { type: 'string', description: 'What to recall about the user' } },
          required: ['query'],
        },
      },
    },
    run: async (args) => {
      const query = String(args.query ?? '').trim()
      const ctx = await memoryService.retrieveForPrompt(query)
      return ctx || 'No relevant memories found.'
    },
  },

  // ── OS actions (agent mode) — safe set: open + read. No delete / no arbitrary exec. ──
  open_app: {
    needsLlmRound: false,   // show the REAL Rust result — never let the model fake "opened"
    spec: {
      type: 'function',
      function: {
        name: 'open_app',
        description: "Open or focus an application on the user's Mac by name, e.g. \"Safari\", \"Notes\", \"Spotify\", \"Terminal\".",
        parameters: { type: 'object', properties: { app: { type: 'string', description: 'Application name' } }, required: ['app'] },
      },
    },
    run: async (args) => {
      const app = String(args.app ?? '').trim()
      if (!app) return 'No app name given.'
      try { return await invokeTauri<string>('open_app', { name: app }) }
      catch (e) { return `Could not open ${app}: ${String(e)}` }
    },
  },
  open_link: {
    needsLlmRound: false,
    spec: {
      type: 'function',
      function: {
        name: 'open_link',
        description: 'Open a URL, file, or folder with the default app, e.g. "https://github.com" or "~/Documents".',
        parameters: { type: 'object', properties: { target: { type: 'string', description: 'URL, file path, or folder' } }, required: ['target'] },
      },
    },
    run: async (args) => {
      const target = String(args.target ?? '').trim()
      if (!target) return 'No target given.'
      try { return await invokeTauri<string>('open_path', { target }) }
      catch (e) { return `Could not open ${target}: ${String(e)}` }
    },
  },
  list_files: {
    needsLlmRound: false,
    spec: {
      type: 'function',
      function: {
        name: 'list_files',
        description: "List files and folders in a directory under the user's home (e.g. \"Documents\", \"Desktop\"). Empty path = home.",
        parameters: { type: 'object', properties: { path: { type: 'string', description: 'Folder relative to home, or absolute path under home' } }, required: [] },
      },
    },
    run: async (args) => {
      const path = String(args.path ?? '').trim()
      try {
        const items = await invokeTauri<string[]>('list_dir', { path })
        return items.length ? items.join(', ') : '(empty)'
      } catch (e) { return `Could not list ${path || 'home'}: ${String(e)}` }
    },
  },
  web_search: {
    needsLlmRound: true,
    spec: {
      type: 'function',
      function: {
        name: 'web_search',
        description: "Search the web for a query: opens the search in the browser AND fetches the top results so you can read and summarise them (headlines, facts). Use whenever the user asks to search, look up, research, or get headlines.",
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'What to search for' },
            app:   { type: 'string', description: 'Browser app to open it in, default "Google Chrome"' },
          },
          required: ['query'],
        },
      },
    },
    run: async (args) => {
      const query = String(args.query ?? '').trim()
      if (!query) return 'No search query given.'
      const app  = String(args.app ?? '').trim() || 'Google Chrome'
      void invokeTauri('open_in_app', { app, target: `https://www.google.com/search?q=${encodeURIComponent(query)}` }).catch(() => {})
      try {
        const headlines = await invokeTauri<string[]>('web_headlines', { query })
        if (!headlines.length) {
          const text = await invokeTauri<string>('fetch_url', { url: `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}` })
          return `Results for "${query}" (opened in ${app}). Summarise for the user:\n${text.slice(0, 3000)}`
        }
        return `Top current headlines for "${query}" (also opened in ${app}). Read these to the user, most important first:\n` +
          headlines.map((h, i) => `${i + 1}. ${h}`).join('\n')
      } catch (e) {
        return `Opened a search for "${query}" in ${app}, but couldn't fetch headlines: ${String(e)}`
      }
    },
  },

  // ── GitHub tools ─────────────────────────────────────────────────────────
  github_list_repos: {
    needsLlmRound: true,
    spec: {
      type: 'function',
      function: {
        name: 'github_list_repos',
        description: "List GitHub repositories for a connected account. Call with 'personal' or 'office' to list repos from the user's GitHub account. Use this when the user asks about their code, projects, or repositories.",
        parameters: {
          type: 'object',
          properties: {
            account: { type: 'string', enum: ['personal', 'office'], description: 'Which GitHub account to query' },
          },
          required: ['account'],
        },
      },
    },
    run: async (args) => {
      const label = String(args.account ?? '').trim().toLowerCase()
      const accounts = await accountService.getByService('github')
      const match = accounts.find(a => a.label.toLowerCase() === label) ?? accounts.find(a => a.enabled)
      if (!match) return `No GitHub account found for "${label}". Go to Settings → GitHub to add one.`
      try {
        const repos = await gitHubConnector.listRepos(match)
        if (!repos.length) return 'No repositories found.'
        const lines = repos.map((r: any) =>
          `• ${r.full_name || r.name} ${r.language ? `(${r.language})` : ''}${r.description ? ` — ${r.description}` : ''}${r.stargazers_count > 0 ? ` ⭐${r.stargazers_count}` : ''}`
        )
        return `GitHub repos for ${match.label} (${match.username ?? ''}):\n${lines.slice(0, 15).join('\n')}${repos.length > 15 ? `\n…and ${repos.length - 15} more` : ''}`
      } catch (e) { return `Failed to fetch repos: ${String(e)}` }
    },
  },

  github_recent_activity: {
    needsLlmRound: true,
    spec: {
      type: 'function',
      function: {
        name: 'github_recent_activity',
        description: "Get recent GitHub activity (pushes, PRs, issues) for a connected account. Use when the user asks what they've been working on, what's new, or recent commits.",
        parameters: {
          type: 'object',
          properties: {
            account: { type: 'string', enum: ['personal', 'office'], description: 'Which GitHub account to query' },
          },
          required: ['account'],
        },
      },
    },
    run: async (args) => {
      const label = String(args.account ?? '').trim().toLowerCase()
      const accounts = await accountService.getByService('github')
      const match = accounts.find(a => a.label.toLowerCase() === label) ?? accounts.find(a => a.enabled)
      if (!match) return `No GitHub account found for "${label}". Go to Settings → GitHub to add one.`
      try {
        const events = await gitHubConnector.recentEvents(match)
        if (!events.length) return 'No recent activity.'
        const lines = events.slice(0, 10).map((e: any) => {
          const type = e.type?.replace('Event', '').replace(/_/g, ' ') ?? 'unknown'
          return `• [${type}] ${e.repo?.name ?? 'unknown'} — ${new Date(e.created_at).toLocaleDateString()}`
        })
        return `Recent GitHub activity for ${match.label}:\n${lines.join('\n')}`
      } catch (e) { return `Failed to fetch activity: ${String(e)}` }
    },
  },
}

export interface TraceStep { kind: 'thinking' | 'tool' | 'result' | 'answer'; text: string }
export interface AgentRun { reply: string; usedTools: string[]; trace: TraceStep[] }

class ToolRouter {
  readonly tools: OllamaTool[] = Object.values(TOOLS).map(t => t.spec)

  // One full agentic turn over the tool set. Returns the final reply, which tools fired, and a
  // trace (thinking + tool calls + REAL results) for the agent's thinking panel. Action tools
  // are ready-text, so what's shown is the actual outcome — never a model-invented "done".
  async runWithTools(
    userMessage: string,
    systemPrefix: string,
    onThinking?: (delta: string) => void,
    history: { role: 'you' | 'piku'; text: string }[] = [],
  ): Promise<AgentRun> {
    const trace: TraceStep[] = []
    const messages: OllamaChatMessage[] = [
      { role: 'system', content: systemPrefix },
      // prior turns so Piku actually remembers the conversation (last 10 turns)
      ...history.slice(-10).map(t => ({ role: (t.role === 'you' ? 'user' : 'assistant') as 'user' | 'assistant', content: t.text })),
      { role: 'user', content: userMessage },
    ]

    const first = await ollamaService.chatToolRoundStream(messages, this.tools, onThinking)
    if (first.thinking) trace.push({ kind: 'thinking', text: first.thinking })

    if (!first.toolCalls.length) {
      trace.push({ kind: 'answer', text: first.content })
      return { reply: first.content, usedTools: [], trace }
    }

    messages.push({ role: 'assistant', content: first.content, tool_calls: first.toolCalls })

    const usedTools: string[] = []
    const readyOutputs: string[] = []
    let anyNeedsRound = false

    for (const call of first.toolCalls) {
      const name = call.function?.name ?? 'unknown'
      const args = call.function?.arguments ?? {}
      const def  = TOOLS[name]
      usedTools.push(name)
      trace.push({ kind: 'tool', text: `${name}(${JSON.stringify(args)})` })
      let result: string
      if (!def) {
        result = `Unknown tool: ${name}`
      } else {
        try {
          result = await def.run(args)
        } catch (err) {
          result = `Tool ${name} failed: ${String(err)}`
          logger.error('tool failed', { name, error: String(err) })
        }
        if (def.needsLlmRound) anyNeedsRound = true
        else readyOutputs.push(result)
      }
      trace.push({ kind: 'result', text: result })
      messages.push({ role: 'tool', content: result, tool_name: name })
    }

    // Fast path: action tools are ready-text → return their REAL results, skip the 2nd LLM pass.
    if (!anyNeedsRound) {
      const reply = readyOutputs.join('  ')
      trace.push({ kind: 'answer', text: reply })
      return { reply, usedTools, trace }
    }

    // A tool needs interpretation (e.g. recall_memory) → let the model compose the reply.
    const second = await ollamaService.chatToolRoundStream(messages, this.tools, onThinking)
    if (second.thinking) trace.push({ kind: 'thinking', text: second.thinking })
    const reply = second.content || readyOutputs.join('  ')
    trace.push({ kind: 'answer', text: reply })
    return { reply, usedTools, trace }
  }
}

export const toolRouter = new ToolRouter()
