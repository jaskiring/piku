/**
 * GDD Phase 2 Step 3 — Seed docs/CANONICAL/01_PRODUCT_VISION.md
 *
 * Extracts and seeds:
 *   Six-Phase Vision    → 6 goal nodes with dependency chain
 *   North Star          → 1 goal node
 *   Core Philosophy     → 7 decision nodes (numbered principles)
 *
 * Total additions: 14 nodes, 15 edges
 *
 * Strategy (PSP-01): all content is structured (numbered phases, numbered list).
 * Deterministic seeding — no LLM. Runtime < 2s.
 *
 * Baseline: this test re-seeds Phases 1 and 2 first to establish accurate before/after.
 *
 * Run: npx vitest run src/features/graph/__tests__/seed-vision.test.ts
 */

import 'fake-indexeddb/auto'

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync }                     from 'node:fs'
import { resolve }                          from 'node:path'
import { DocumentSeeder }                   from '../DocumentSeeder'
import { GraphService }                     from '../GraphService'
import { GraphStore }                       from '../GraphStore'
import type { GraphNodeType, GraphRelationship } from '../types'

const ROOT = resolve(__dirname, '../../../..')

// ── Shared helpers ────────────────────────────────────────────────────────────

const graph = new GraphService()
const store = new GraphStore()
const nameToId = new Map<string, string>()

function key(type: GraphNodeType, name: string) {
  return `${type}:${name.toLowerCase().trim()}`
}

async function seed(type: GraphNodeType, name: string, attrs: Record<string, unknown> = {}) {
  const node = await graph.createNode(type, name, attrs)
  nameToId.set(key(type, name), node.id)
  return node
}

async function link(
  fromType: GraphNodeType, fromName: string,
  rel:      GraphRelationship,
  toType:   GraphNodeType,   toName:   string,
  confidence = 0.9,
) {
  const fromId = nameToId.get(key(fromType, fromName))
  const toId   = nameToId.get(key(toType,   toName))
  if (!fromId || !toId) {
    console.warn(`  ⚠ edge skipped — node not found: "${fromName}" → ${rel} → "${toName}"`)
    return
  }
  await graph.createEdge(fromId, toId, rel, confidence, 'confirmed')
}

async function syncMap() {
  const nodes = await store.getAllNodes()
  for (const n of nodes) nameToId.set(key(n.type as GraphNodeType, n.name), n.id)
}

// ── Baseline data (replicated from Phase 1 and Phase 2 seeders) ───────────────
// These are seeded in beforeAll to establish an accurate cumulative baseline.

const P1245_PRINCIPLES = [
  { name: 'P1: Piku is not the model',                   reasoning: 'Models are replaceable reasoning engines. Piku\'s identity, memory, personality, World Model, and all durable state belong to Piku permanently.' },
  { name: 'P2: The World Model is the product',           reasoning: 'Memory, Graph, Projects, Chat, and Summaries are components of the World Model — not the product itself.' },
  { name: 'P3: Capability-based routing',                reasoning: 'Model names never appear in business logic. Business logic calls ollamaService.chat() and ollamaService.embed().', techEdge: { rel: 'related_to' as GraphRelationship, tech: 'Ollama' } },
  { name: 'P4: Local-first always',                      reasoning: 'All data in IndexedDB. No network egress without explicit user opt-in.', techEdge: { rel: 'related_to' as GraphRelationship, tech: 'IndexedDB' } },
  { name: 'P5: Observation loop is the intended operating mode', reasoning: 'Reactive Q&A is the fallback interface, not the primary one.' },
  { name: 'P6: User approval gates all World Model writes', reasoning: 'ProjectUpdateService.applyApprovedDiff() is the only path to project mutation from user-provided content.' },
  { name: 'P7: Personality is data, not a prompt',       reasoning: 'Personality traits must eventually be stored as entities in the World Model, not hardcoded in a system prompt string.' },
  { name: 'P8: IDB migrations are additive only',        reasoning: 'Never drop stores. Never modify existing store schemas.', techEdge: { rel: 'related_to' as GraphRelationship, tech: 'IndexedDB' } },
]

const P1245_RULES = [
  { name: 'Rule 1: Model names only in OllamaService.ts', reasoning: 'If you find qwen3:14b outside OllamaService.ts, it is a bug.', techEdge: { rel: 'related_to' as GraphRelationship, tech: 'Ollama' } },
  { name: 'Rule 2: ContextSource is the extension interface', reasoning: 'New observation sources implement ContextSource and register with WorldModelQueryService.register().' },
  { name: 'Rule 3: Post-response processing is fire-and-forget', reasoning: 'Memory, graph, and project extraction use void promise.catch(logger.error).' },
  { name: 'Rule 4: Extraction services never throw to callers', reasoning: 'They log errors and return empty arrays or null.' },
  { name: 'Rule 5: Features export only via index.ts', reasoning: 'No cross-feature imports from internal files.' },
  { name: 'Rule 6: ContextVersionStore is append-only', reasoning: 'Never delete context versions. They are the historical record of project evolution.' },
]

const P1245_TECH_NODES = [
  { name: 'TypeScript',         category: 'language' },
  { name: 'TailwindCSS',        category: 'framework' },
  { name: 'nomic-embed-text',   category: 'model' },
  { name: 'qwen2.5-coder:14b',  category: 'model' },
  { name: 'Framer Motion',      category: 'framework' },
  { name: 'Vitest',             category: 'tool' },
]

const P1245_TECH_CHOICES = [
  { name: 'Desktop framework: Tauri 2',               reason: 'Native OS integration, small binary',           techs: ['Tauri'] },
  { name: 'Frontend: React + TypeScript + TailwindCSS', reason: 'Standard, well-supported',                   techs: ['React', 'TypeScript', 'TailwindCSS'] },
  { name: 'Local storage: IndexedDB via idb library', reason: 'Browser-native, Float32Array-native',           techs: ['IndexedDB'] },
  { name: 'Local AI: Ollama',                         reason: 'Local-first, no API cost',                      techs: ['Ollama'] },
  { name: 'Chat model: qwen3:14b',                    reason: 'Strong reasoning, local',                       techs: ['qwen3:14b'] },
  { name: 'Embedding model: nomic-embed-text',        reason: '768-dim vectors, fast',                         techs: ['nomic-embed-text'] },
  { name: 'Code intelligence: qwen2.5-coder:14b',     reason: 'Planned, not yet wired',                       techs: ['qwen2.5-coder:14b'] },
  { name: 'Animation: Framer Motion + Canvas',        reason: 'Declarative animations, 2D particles',          techs: ['Framer Motion', 'Canvas'] },
  { name: 'Test runner: Vitest',                      reason: 'Fast, ESM-native, compatible with Tauri project', techs: ['Vitest'] },
]

const P1245_CONSTRAINTS = [
  { name: 'K1: Zero recurring inference cost for core operations', statement: 'Core operations must not incur per-call API costs.', techEdge: { rel: 'related_to' as GraphRelationship, tech: 'Ollama' } },
  { name: 'K2: External AI via browser session automation only',   statement: 'External AI accessible only via browser session automation — never via API key.' },
  { name: 'K3: Core functionality without paid API or network',    statement: 'Core functionality must work without any paid API or network access.' },
  { name: 'K4: No data leaves machine without user choice',        statement: 'No data leaves the machine without explicit user opt-in.', techEdge: { rel: 'related_to' as GraphRelationship, tech: 'IndexedDB' } },
  { name: 'K5: Consequential actions require user confirmation',   statement: 'All consequential actions require explicit user confirmation.' },
  { name: 'K6: No World Model modification without user approval', statement: 'Piku never modifies the World Model without user approval of a diff.' },
]

// ── Vision data (sourced verbatim from 01_PRODUCT_VISION.md) ─────────────────

const PHASES = [
  {
    name:        'Phase 1: Personal AI assistant',
    description: 'Chat + memory + projects + graph. User asks → Piku answers with context. Current state.',
    status:      'current',
    techEdges:   [
      { rel: 'related_to' as GraphRelationship, tech: 'Ollama' },
      { rel: 'related_to' as GraphRelationship, tech: 'IndexedDB' },
    ],
    adrEdges:    [] as string[],
  },
  {
    name:        'Phase 2: Persistent World Model depth',
    description: 'Git Observer, Repository entities. Piku knows what is in the repos.',
    status:      'next',
    techEdges:   [],
    adrEdges:    [],
  },
  {
    name:        'Phase 3: Ambient desktop companion',
    description: 'Global hotkey, system tray, always-on-top. Piku lives beside the user, not in a tab.',
    status:      'future',
    techEdges:   [],
    adrEdges:    [
      'Invocation — ⌥ (Option) + Space Global Hotkey',
      'Overlay — Full-Screen, Always-On-Top',
    ],
  },
  {
    name:        'Phase 4: Proactive observer',
    description: 'File watcher, IDE plugin, calendar, email. World Model grows without user input.',
    status:      'future',
    techEdges:   [],
    adrEdges:    [],
  },
  {
    name:        'Phase 5: Personal operating system layer',
    description: 'Cross-app intelligence, pattern recognition. "What is happening in my world right now?"',
    status:      'future',
    techEdges:   [],
    adrEdges:    [],
  },
  {
    name:        'Phase 6: Autonomous execution + approval gate',
    description: 'Piku can act — with explicit user confirmation. Every consequential action reversible or confirmed.',
    status:      'future',
    techEdges:   [],
    adrEdges:    ['K5: Consequential actions require user confirmation', 'K6: No World Model modification without user approval'],
  },
] as const

const NORTH_STAR = {
  name:        'North Star: Ambient companion that knows everything happening in your world',
  description: 'A local-first AI companion that understands everything the user is working on, their projects over years, their relationships, their goals, and their digital activity — and can answer "What is happening in my world right now?" better than any individual tool can.',
}

const PHILOSOPHY = [
  {
    name:      'Philosophy 1: Memory is the relationship',
    reasoning: 'Piku\'s entire value comes from remembering, connecting, and carrying context. Any feature that weakens memory is an existential bug, not a minor regression.',
    links:     [] as Array<{ type: GraphNodeType; name: string; rel: GraphRelationship }>,
  },
  {
    name:      'Philosophy 2: Presence over interface',
    reasoning: 'Reduce chrome until what remains is presence. The highest compliment is that the user forgets there was software at all.',
    links:     [],
  },
  {
    name:      'Philosophy 3: Earn the right to interrupt',
    reasoning: 'Silence is the default. Attention is the most expensive resource the user has. Piku speaks proactively only when a thoughtful chief-of-staff would.',
    links:     [],
  },
  {
    name:      'Philosophy 4: Continuity of being',
    reasoning: 'Piku never resets to zero, never greets the user as a stranger, never loses the thread of who they are.',
    links: [
      { type: 'decision' as GraphNodeType, name: 'P1: Piku is not the model', rel: 'related_to' as GraphRelationship },
    ],
  },
  {
    name:      'Philosophy 5: Privacy as intimacy',
    reasoning: 'Data never leaves the machine without explicit user choice. This is the foundation of the trust that makes the relationship possible.',
    links: [
      { type: 'decision' as GraphNodeType, name: 'P4: Local-first always', rel: 'related_to' as GraphRelationship },
      { type: 'decision' as GraphNodeType, name: 'K4: No data leaves machine without user choice', rel: 'related_to' as GraphRelationship },
    ],
  },
  {
    name:      'Philosophy 6: Every consequential action reversible or confirmed',
    reasoning: 'Piku never makes the user afraid of what it might do.',
    links: [
      { type: 'decision' as GraphNodeType, name: 'K5: Consequential actions require user confirmation', rel: 'related_to' as GraphRelationship },
      { type: 'decision' as GraphNodeType, name: 'K6: No World Model modification without user approval', rel: 'related_to' as GraphRelationship },
    ],
  },
  {
    name:      'Philosophy 7: The user is the author; Piku is the steward',
    reasoning: 'Piku holds, organizes, and advises — but the life is the user\'s, always.',
    links:     [],
  },
] as const

// ── Test suite ────────────────────────────────────────────────────────────────

describe.skip('GDD Phase 2 Step 3 — 01_PRODUCT_VISION.md seeding', () => {

  let beforeNodes = 0
  let beforeEdges = 0

  // ── Establish cumulative baseline (Phase 1 + Phase 2 re-seed) ────────────

  beforeAll(async () => {
    const SOURCE = 'docs/CANONICAL/05_DECISIONS.md'

    // Phase 1: re-seed ADRs with fixed extraction
    const content = readFileSync(resolve(ROOT, 'docs/CANONICAL/05_DECISIONS.md'), 'utf-8')
    const seeder = new DocumentSeeder()
    await seeder.seedFromFile(content, SOURCE, 'Piku Core', 'adr', 3)
    await syncMap()

    // Phase 2: re-seed P1245 content inline
    for (const p of P1245_PRINCIPLES) {
      await seed('decision', p.name, { reasoning: p.reasoning, status: 'active', category: 'principle', sourceDoc: SOURCE })
      if ('techEdge' in p && p.techEdge) await link('decision', p.name, p.techEdge.rel, 'technology', p.techEdge.tech)
    }
    for (const r of P1245_RULES) {
      await seed('decision', r.name, { reasoning: r.reasoning, status: 'active', category: 'rule', sourceDoc: SOURCE })
      if ('techEdge' in r && r.techEdge) await link('decision', r.name, r.techEdge.rel, 'technology', r.techEdge.tech)
    }
    for (const t of P1245_TECH_NODES) {
      await seed('technology', t.name, { category: t.category, sourceDoc: SOURCE })
    }
    for (const c of P1245_TECH_CHOICES) {
      await seed('decision', c.name, { reasoning: c.reason, status: 'active', category: 'tech-choice', sourceDoc: SOURCE })
      for (const techName of c.techs) await link('decision', c.name, 'uses', 'technology', techName)
    }
    for (const k of P1245_CONSTRAINTS) {
      await seed('decision', k.name, { reasoning: k.statement, status: 'active', category: 'constraint', sourceDoc: SOURCE })
      if ('techEdge' in k && k.techEdge) await link('decision', k.name, k.techEdge.rel, 'technology', k.techEdge.tech)
    }

    await syncMap()

    const allNodes = await store.getAllNodes()
    const allEdges = await store.getAllEdges()
    beforeNodes = allNodes.length
    beforeEdges = allEdges.length

    console.log(`\n[Baseline — Phase 1 + Phase 2] nodes=${beforeNodes} edges=${beforeEdges}`)
  }, 30_000)

  // ── Seed six phases ───────────────────────────────────────────────────────

  it('seeds Phase 1–6 as goal nodes with tech and ADR edges', async () => {
    const SOURCE = 'docs/CANONICAL/01_PRODUCT_VISION.md'

    for (const phase of PHASES) {
      await seed('goal', phase.name, {
        description: phase.description,
        status:      phase.status,
        sourceDoc:   SOURCE,
      })
      for (const te of phase.techEdges) {
        await link('goal', phase.name, te.rel, 'technology', te.tech)
      }
      for (const adrName of phase.adrEdges) {
        // ADR decision nodes and constraint nodes are already in the graph
        const resolveType = (n: string): GraphNodeType =>
          n.startsWith('K') ? 'decision' : 'decision'
        await link('goal', phase.name, 'related_to', resolveType(adrName), adrName)
      }
    }

    // Phase dependency chain: each phase supports the next
    const phaseNames = PHASES.map(p => p.name)
    for (let i = 0; i < phaseNames.length - 1; i++) {
      await link('goal', phaseNames[i + 1], 'depends_on', 'goal', phaseNames[i])
    }

    console.log(`  Phases: 6 goal nodes, dependency chain created`)
    expect((await store.getAllNodes()).filter(n => n.type === 'goal').length).toBeGreaterThanOrEqual(6)
  })

  // ── Seed North Star ───────────────────────────────────────────────────────

  it('seeds North Star as a goal node linked to Phase 5', async () => {
    const SOURCE = 'docs/CANONICAL/01_PRODUCT_VISION.md'

    await seed('goal', NORTH_STAR.name, {
      description: NORTH_STAR.description,
      status:      'mission',
      sourceDoc:   SOURCE,
    })
    await link('goal', NORTH_STAR.name, 'related_to', 'goal', 'Phase 5: Personal operating system layer')

    console.log(`  North Star: 1 goal node, linked to Phase 5`)
    expect((await store.getAllNodes()).some(n => n.name === NORTH_STAR.name)).toBe(true)
  })

  // ── Seed Core Experience Philosophy ──────────────────────────────────────

  it('seeds Philosophy 1–7 as decision nodes with cross-links', async () => {
    const SOURCE = 'docs/CANONICAL/01_PRODUCT_VISION.md'
    let linked = 0

    for (const p of PHILOSOPHY) {
      await seed('decision', p.name, {
        reasoning:  p.reasoning,
        status:     'active',
        category:   'philosophy',
        sourceDoc:  SOURCE,
      })
      for (const link_ of p.links) {
        await link('decision', p.name, link_.rel, link_.type, link_.name)
        linked++
      }
    }

    console.log(`  Philosophy: 7 decision nodes, ${linked} cross-links to existing principles/constraints`)
    expect((await store.getAllNodes()).filter(n => n.name.startsWith('Philosophy')).length).toBe(7)
  })

  // ── Report and validate ───────────────────────────────────────────────────

  it('reports before/after and validates success criteria', async () => {
    const allNodes = await store.getAllNodes()
    const allEdges = await store.getAllEdges()

    const byType: Record<string, number> = {}
    for (const n of allNodes) byType[n.type] = (byType[n.type] ?? 0) + 1

    const edgeCounts: Record<string, number> = {}
    for (const e of allEdges) {
      edgeCounts[e.fromId] = (edgeCounts[e.fromId] ?? 0) + 1
      edgeCounts[e.toId]   = (edgeCounts[e.toId]   ?? 0) + 1
    }

    const sorted = allNodes
      .map(n => ({ name: n.name, type: n.type, edges: edgeCounts[n.id] ?? 0 }))
      .sort((a, b) => b.edges - a.edges)
      .slice(0, 12)

    const isolated = allNodes.filter(n => (edgeCounts[n.id] ?? 0) === 0)

    const sep = '─'.repeat(62)
    console.log(`\n${sep}`)
    console.log('  GDD PHASE 2 STEP 3 — 01_PRODUCT_VISION.md SEEDING')
    console.log(sep)
    console.log(`\n  BEFORE (Phase 1 + Phase 2 baseline):`)
    console.log(`    Nodes:  ${beforeNodes}`)
    console.log(`    Edges:  ${beforeEdges}`)
    console.log(`\n  AFTER (+ 01_PRODUCT_VISION.md):`)
    console.log(`    Nodes:  ${allNodes.length}  (+${allNodes.length - beforeNodes})`)
    console.log(`    Edges:  ${allEdges.length}  (+${allEdges.length - beforeEdges})`)
    console.log(`\n  Nodes by type:`)
    for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${type.padEnd(14)} ${count}`)
    }

    console.log(`\n  New nodes added this step:`)
    console.log(`    Goal nodes (phases + North Star): 7`)
    console.log(`    Philosophy decision nodes:        7`)
    console.log(`    Total:                            14`)

    console.log(`\n  New edges added this step:`)
    console.log(`    Phase dependency chain (5):  Ph2→Ph1, Ph3→Ph2, Ph4→Ph3, Ph5→Ph4, Ph6→Ph5`)
    console.log(`    Phase → technology (2):      Ph1→Ollama, Ph1→IndexedDB`)
    console.log(`    Phase → ADR decision (4):    Ph3→ADR-004, Ph3→ADR-010, Ph6→K5, Ph6→K6`)
    console.log(`    Philosophy cross-links (4):  Philo4→P1, Philo5→P4, Philo5→K4, Philo6→K5, Philo6→K6`)
    console.log(`    North Star → Phase 5 (1):    NS→Ph5`)

    console.log(`\n  Top connected nodes (by edge count):`)
    for (const n of sorted) {
      const marker = n.edges >= 4 ? '★' : ' '
      console.log(`  ${marker} ${String(n.edges).padStart(2)} edges  [${n.type.padEnd(10)}]  ${n.name.slice(0, 55)}`)
    }

    console.log(`\n  Isolated nodes: ${isolated.length}`)
    for (const n of isolated.slice(0, 10)) {
      console.log(`    • [${n.type}] ${n.name.slice(0, 60)}`)
    }
    if (isolated.length > 10) console.log(`    ... and ${isolated.length - 10} more`)

    console.log(`\n  Remaining graph weaknesses:`)
    console.log(`    • No Piku project root node (Bug #3 — Step 4)`)
    console.log(`    • No person node for Jaskirat`)
    console.log(`    • Phase 2 goal has no edge to Git Observer (not yet in graph)`)
    console.log(`    • Philosophy 1–3, 7 are isolated (no explicit tech/ADR connections)`)
    console.log(`    • 02_CURRENT_STATE.md, 03_ARCHITECTURE.md, 04_ROADMAP.md unseeded`)
    console.log(sep)

    // ── Assertions ────────────────────────────────────────────────────────
    expect(allNodes.length, 'node count grows from baseline').toBeGreaterThan(beforeNodes)
    expect(allEdges.length, 'edge count grows from baseline').toBeGreaterThan(beforeEdges)

    const goalNodes = allNodes.filter(n => n.type === 'goal')
    expect(goalNodes.length, '7 goal nodes (6 phases + North Star)').toBe(7)

    const philosophyNodes = allNodes.filter(n => n.name.startsWith('Philosophy'))
    expect(philosophyNodes.length, '7 philosophy nodes').toBe(7)

    // Phase dependency chain is present
    expect(allEdges.length - beforeEdges, 'at least 10 new edges').toBeGreaterThanOrEqual(10)

    // Key spot-checks
    const names = new Set(allNodes.map(n => n.name))
    expect(names.has('Phase 1: Personal AI assistant'), 'Phase 1 goal').toBe(true)
    expect(names.has('Phase 6: Autonomous execution + approval gate'), 'Phase 6 goal').toBe(true)
    expect(names.has(NORTH_STAR.name), 'North Star goal').toBe(true)
    expect(names.has('Philosophy 4: Continuity of being'), 'Philosophy 4').toBe(true)
    expect(names.has('Philosophy 5: Privacy as intimacy'), 'Philosophy 5').toBe(true)
  })

})
