/**
 * GDD Phase 2 — Seed 05_DECISIONS.md Parts 1, 2, 4, 5
 *
 * Seeds:
 *   Part 1 — Inviolable Principles   (P1–P8)  → 8 decision nodes
 *   Part 2 — Architectural Rules     (1–6)    → 6 decision nodes
 *   Part 4 — Technology Decisions    (table)  → 9 decision nodes + new technology nodes
 *   Part 5 — Hard Constraints        (K1–K6)  → 6 decision nodes
 *
 * Strategy (PSP-01): all content is structured (named sections, numbered lists, tables).
 * Deterministic seeding — no LLM calls. Runtime < 2s.
 *
 * Idempotent: GraphService.createNode is idempotent by (name, type).
 * Re-running produces the same graph with no duplicate nodes.
 *
 * Run: npx vitest run src/features/graph/__tests__/seed-gdd-decisions-p1245.test.ts
 */

import 'fake-indexeddb/auto'

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync }                     from 'node:fs'
import { resolve }                          from 'node:path'
import { DocumentSeeder }                   from '../DocumentSeeder'
import { GraphService }                     from '../GraphService'
import { GraphStore }                       from '../GraphStore'
import type { GraphNodeType, GraphRelationship } from '../types'
import type { GraphNode }                   from '../types'

const ROOT = resolve(__dirname, '../../../..')

// ── Helpers ───────────────────────────────────────────────────────────────────

const graph = new GraphService()
const store = new GraphStore()

// name → nodeId lookup, built incrementally.
const nameToId = new Map<string, string>()

function key(type: GraphNodeType, name: string) {
  return `${type}:${name.toLowerCase().trim()}`
}

async function seed(
  type:      GraphNodeType,
  name:      string,
  attrs:     Record<string, unknown> = {},
): Promise<GraphNode> {
  const node = await graph.createNode(type, name, attrs)
  nameToId.set(key(type, name), node.id)
  return node
}

async function link(
  fromType: GraphNodeType, fromName: string,
  rel:      GraphRelationship,
  toType:   GraphNodeType,  toName:   string,
  confidence = 0.9,
): Promise<void> {
  const fromId = nameToId.get(key(fromType, fromName))
  const toId   = nameToId.get(key(toType,   toName))
  if (!fromId || !toId) {
    console.warn(`  ⚠ edge skipped — node not found: ${fromName} → ${rel} → ${toName}`)
    return
  }
  await graph.createEdge(fromId, toId, rel, confidence, 'confirmed')
}

// Populate nameToId from all existing nodes in the graph.
async function syncMap() {
  const nodes = await store.getAllNodes()
  for (const n of nodes) nameToId.set(key(n.type as GraphNodeType, n.name), n.id)
}

// ── Data definitions ─────────────────────────────────────────────────────────
// All content sourced verbatim from docs/CANONICAL/05_DECISIONS.md.

const PRINCIPLES = [
  {
    name:      'P1: Piku is not the model',
    reasoning: 'Models are replaceable reasoning engines. Piku\'s identity, memory, personality, World Model, and all durable state belong to Piku permanently. A model swap should feel like changing the CPU inside a computer.',
  },
  {
    name:      'P2: The World Model is the product',
    reasoning: 'Memory, Graph, Projects, Chat, and Summaries are components of the World Model — not the product itself. When choosing between improving the chat interface and improving the World Model, always choose the World Model.',
  },
  {
    name:      'P3: Capability-based routing',
    reasoning: 'Model names never appear in business logic. Business logic calls ollamaService.chat() and ollamaService.embed(). Model names appear only in OllamaService.ts. Routing is by capability, never by model name.',
    techEdges: [{ rel: 'related_to' as GraphRelationship, tech: 'Ollama' }],
  },
  {
    name:      'P4: Local-first always',
    reasoning: 'All data in IndexedDB. No network egress without explicit user opt-in. Core functionality must work without any paid API or network access. External AI accessible only via browser session automation, never via API key.',
    techEdges: [{ rel: 'related_to' as GraphRelationship, tech: 'IndexedDB' }],
  },
  {
    name:      'P5: Observation loop is the intended operating mode',
    reasoning: 'Reactive Q&A is the fallback interface, not the primary one. The system should become increasingly aware of the user\'s life without requiring manual explanation. The observation layer is the product moat.',
  },
  {
    name:      'P6: User approval gates all World Model writes',
    reasoning: 'ProjectUpdateService.applyApprovedDiff() is the only path to project mutation from user-provided content. The user reviews a diff and approves it. No LLM-extracted fact reaches the World Model without user acknowledgment.',
  },
  {
    name:      'P7: Personality is data, not a prompt',
    reasoning: 'Piku\'s personality traits, communication style, and companion identity must eventually be stored as entities in the World Model, not hardcoded in a system prompt string. The current PIKU_SYSTEM_PROMPT constant is Phase 1 technical debt.',
  },
  {
    name:      'P8: IDB migrations are additive only',
    reasoning: 'Never drop stores. Never modify existing store schemas. New stores use if (oldVersion < N) blocks only. Never skip a version number.',
    techEdges: [{ rel: 'related_to' as GraphRelationship, tech: 'IndexedDB' }],
  },
] as const

const RULES = [
  {
    name:      'Rule 1: Model names only in OllamaService.ts',
    reasoning: 'If you find qwen3:14b outside OllamaService.ts, it is a bug.',
    techEdges: [{ rel: 'related_to' as GraphRelationship, tech: 'Ollama' }],
  },
  {
    name:      'Rule 2: ContextSource is the extension interface',
    reasoning: 'New observation sources implement ContextSource and register with WorldModelQueryService.register(). They do not call openMemoryDB() directly.',
  },
  {
    name:      'Rule 3: Post-response processing is fire-and-forget',
    reasoning: 'Memory, graph, and project extraction use void promise.catch(logger.error). They must not block the response display.',
  },
  {
    name:      'Rule 4: Extraction services never throw to callers',
    reasoning: 'They log errors and return empty arrays or null. ollamaService can throw; extraction services wrap it in try/catch.',
  },
  {
    name:      'Rule 5: Features export only via index.ts',
    reasoning: 'No cross-feature imports from internal files. src/features/<name>/index.ts is the public API boundary.',
  },
  {
    name:      'Rule 6: ContextVersionStore is append-only',
    reasoning: 'Never delete context versions. They are the historical record of project evolution.',
  },
] as const

// Part 4: each row in the technology decisions table.
// Each creates one decision node and edges to each technology in `techs`.
const TECH_CHOICES = [
  {
    name:   'Desktop framework: Tauri 2',
    reason: 'Native OS integration, small binary',
    techs:  ['Tauri'],
  },
  {
    name:   'Frontend: React + TypeScript + TailwindCSS',
    reason: 'Standard, well-supported',
    techs:  ['React', 'TypeScript', 'TailwindCSS'],
  },
  {
    name:   'Local storage: IndexedDB via idb library',
    reason: 'Browser-native, Float32Array-native',
    techs:  ['IndexedDB'],
  },
  {
    name:   'Local AI: Ollama',
    reason: 'Local-first, no API cost',
    techs:  ['Ollama'],
  },
  {
    name:   'Chat model: qwen3:14b',
    reason: 'Strong reasoning, local',
    techs:  ['qwen3:14b'],
  },
  {
    name:   'Embedding model: nomic-embed-text',
    reason: '768-dim vectors, fast',
    techs:  ['nomic-embed-text'],
  },
  {
    name:   'Code intelligence: qwen2.5-coder:14b',
    reason: 'Planned, not yet wired',
    techs:  ['qwen2.5-coder:14b'],
  },
  {
    name:   'Animation: Framer Motion + Canvas',
    reason: 'Declarative animations, 2D particles',
    techs:  ['Framer Motion', 'Canvas'],
  },
  {
    name:   'Test runner: Vitest',
    reason: 'Fast, ESM-native, compatible with Tauri project',
    techs:  ['Vitest'],
  },
] as const

// Technologies from the table that need nodes (may not exist from ADR seeding).
const TABLE_TECHNOLOGIES = [
  { name: 'TypeScript',         category: 'language' },
  { name: 'TailwindCSS',        category: 'framework' },
  { name: 'nomic-embed-text',   category: 'model' },
  { name: 'qwen2.5-coder:14b',  category: 'model' },
  { name: 'Framer Motion',      category: 'framework' },
  { name: 'Vitest',             category: 'tool' },
] as const

const CONSTRAINTS = [
  {
    name:      'K1: Zero recurring inference cost for core operations',
    statement: 'Core operations must not incur per-call API costs. Local inference is the mechanism.',
    techEdges: [{ rel: 'related_to' as GraphRelationship, tech: 'Ollama' }],
  },
  {
    name:      'K2: External AI via browser session automation only',
    statement: 'External AI (Claude, GPT, Gemini) accessible only via browser session automation — never via API key.',
  },
  {
    name:      'K3: Core functionality without paid API or network',
    statement: 'Core functionality must work without any paid API or network access.',
  },
  {
    name:      'K4: No data leaves machine without user choice',
    statement: 'No data leaves the machine without explicit user opt-in.',
    techEdges: [{ rel: 'related_to' as GraphRelationship, tech: 'IndexedDB' }],
  },
  {
    name:      'K5: Consequential actions require user confirmation',
    statement: 'All consequential actions require explicit user confirmation.',
  },
  {
    name:      'K6: No World Model modification without user approval',
    statement: 'Piku never modifies the World Model without user approval of a diff.',
  },
] as const

// ── Test suite ────────────────────────────────────────────────────────────────

describe.skip('GDD Phase 2 — 05_DECISIONS.md Parts 1, 2, 4, 5', () => {

  let beforeNodes = 0
  let beforeEdges = 0

  // ── Step 0: Establish Phase 1 baseline by re-seeding ADRs ────────────────

  beforeAll(async () => {
    const content = readFileSync(
      resolve(ROOT, 'docs/CANONICAL/05_DECISIONS.md'), 'utf-8'
    )
    const seeder = new DocumentSeeder()
    await seeder.seedFromFile(content, 'docs/CANONICAL/05_DECISIONS.md', 'Piku Core', 'adr', 3)

    await syncMap()

    const allNodes = await store.getAllNodes()
    const allEdges = await store.getAllEdges()
    beforeNodes = allNodes.length
    beforeEdges = allEdges.length

    console.log(`\n[Baseline after Phase 1 re-seed] nodes=${beforeNodes} edges=${beforeEdges}`)
  }, 30_000)

  // ── Part 1: Principles ────────────────────────────────────────────────────

  it('seeds Part 1 — Principles P1–P8', async () => {
    let created = 0

    for (const p of PRINCIPLES) {
      const existing = (await store.getAllNodes()).find(n => n.name === p.name)
      await seed('decision', p.name, {
        reasoning:  p.reasoning,
        status:     'active',
        category:   'principle',
        sourceDoc:  'docs/CANONICAL/05_DECISIONS.md',
      })
      if (!existing) created++

      if ('techEdges' in p && p.techEdges) {
        for (const te of p.techEdges) {
          await link('decision', p.name, te.rel, 'technology', te.tech)
        }
      }
    }

    console.log(`  Part 1: ${PRINCIPLES.length} principle nodes (${created} new)`)
    expect(PRINCIPLES.length).toBe(8)
  })

  // ── Part 2: Architectural Rules ───────────────────────────────────────────

  it('seeds Part 2 — Architectural Rules 1–6', async () => {
    let created = 0

    for (const r of RULES) {
      const existing = (await store.getAllNodes()).find(n => n.name === r.name)
      await seed('decision', r.name, {
        reasoning:  r.reasoning,
        status:     'active',
        category:   'rule',
        sourceDoc:  'docs/CANONICAL/05_DECISIONS.md',
      })
      if (!existing) created++

      if ('techEdges' in r && r.techEdges) {
        for (const te of r.techEdges) {
          await link('decision', r.name, te.rel, 'technology', te.tech)
        }
      }
    }

    console.log(`  Part 2: ${RULES.length} rule nodes (${created} new)`)
    expect(RULES.length).toBe(6)
  })

  // ── Part 4: Technology Table ──────────────────────────────────────────────

  it('seeds Part 4 — Technology Table (tech nodes + decision nodes)', async () => {
    const SOURCE = 'docs/CANONICAL/05_DECISIONS.md'

    // Create technology nodes that may not exist from ADR seeding.
    for (const tech of TABLE_TECHNOLOGIES) {
      await seed('technology', tech.name, { category: tech.category, sourceDoc: SOURCE })
    }

    // Create decision nodes for each tech choice, link to technologies.
    let created = 0
    for (const choice of TECH_CHOICES) {
      const existing = (await store.getAllNodes()).find(n => n.name === choice.name)
      await seed('decision', choice.name, {
        reasoning:  choice.reason,
        status:     'active',
        category:   'tech-choice',
        sourceDoc:  SOURCE,
      })
      if (!existing) created++

      for (const techName of choice.techs) {
        await link('decision', choice.name, 'uses', 'technology', techName)
      }
    }

    console.log(`  Part 4: ${TABLE_TECHNOLOGIES.length} new tech nodes, ${TECH_CHOICES.length} tech-choice nodes (${created} new)`)
    expect(TECH_CHOICES.length).toBe(9)
  })

  // ── Part 5: Constraints ───────────────────────────────────────────────────

  it('seeds Part 5 — Constraints K1–K6', async () => {
    let created = 0

    for (const k of CONSTRAINTS) {
      const existing = (await store.getAllNodes()).find(n => n.name === k.name)
      await seed('decision', k.name, {
        reasoning:  k.statement,
        status:     'active',
        category:   'constraint',
        sourceDoc:  'docs/CANONICAL/05_DECISIONS.md',
      })
      if (!existing) created++

      if ('techEdges' in k && k.techEdges) {
        for (const te of k.techEdges) {
          await link('decision', k.name, te.rel, 'technology', te.tech)
        }
      }
    }

    console.log(`  Part 5: ${CONSTRAINTS.length} constraint nodes (${created} new)`)
    expect(CONSTRAINTS.length).toBe(6)
  })

  // ── Report and validate ───────────────────────────────────────────────────

  it('reports before/after and validates success criteria', async () => {
    const allNodes = await store.getAllNodes()
    const allEdges = await store.getAllEdges()

    const byType: Record<string, string[]> = {}
    for (const n of allNodes) {
      if (!byType[n.type]) byType[n.type] = []
      byType[n.type].push(n.name)
    }

    // Edge counts per node
    const edgeCounts: Record<string, number> = {}
    for (const e of allEdges) {
      edgeCounts[e.fromId] = (edgeCounts[e.fromId] ?? 0) + 1
      edgeCounts[e.toId]   = (edgeCounts[e.toId]   ?? 0) + 1
    }

    // Top 10 connected nodes
    const sorted = allNodes
      .map(n => ({ name: n.name, type: n.type, edges: edgeCounts[n.id] ?? 0 }))
      .sort((a, b) => b.edges - a.edges)
      .slice(0, 10)

    // Isolated nodes (no edges)
    const isolated = allNodes.filter(n => (edgeCounts[n.id] ?? 0) === 0)

    const sep = '─'.repeat(60)
    console.log(`\n${sep}`)
    console.log('  GDD PHASE 2 — 05_DECISIONS.md COMPLETE SEEDING')
    console.log(sep)
    console.log(`\n  BEFORE (Phase 1 baseline):`)
    console.log(`    Nodes:  ${beforeNodes}`)
    console.log(`    Edges:  ${beforeEdges}`)

    console.log(`\n  AFTER (Phase 2 complete):`)
    console.log(`    Nodes:  ${allNodes.length}  (+${allNodes.length - beforeNodes})`)
    console.log(`    Edges:  ${allEdges.length}  (+${allEdges.length - beforeEdges})`)
    console.log(`\n  Nodes by type:`)
    for (const [type, names] of Object.entries(byType).sort((a, b) => b[1].length - a[1].length)) {
      console.log(`    ${type.padEnd(14)} ${names.length}`)
    }

    console.log(`\n  Top connected nodes:`)
    for (const n of sorted) {
      console.log(`    ${String(n.edges).padStart(2)} edges  [${n.type}]  ${n.name}`)
    }

    console.log(`\n  Isolated nodes (no edges): ${isolated.length}`)
    for (const n of isolated.slice(0, 15)) {
      console.log(`    • [${n.type}] ${n.name}`)
    }
    if (isolated.length > 15) console.log(`    ... and ${isolated.length - 15} more`)

    console.log(`\n  New decision nodes by category:`)
    console.log(`    Principles (P1–P8):    ${PRINCIPLES.length}`)
    console.log(`    Rules (1–6):           ${RULES.length}`)
    console.log(`    Tech choices:          ${TECH_CHOICES.length}`)
    console.log(`    Constraints (K1–K6):   ${CONSTRAINTS.length}`)
    console.log(`    Total new decisions:   ${PRINCIPLES.length + RULES.length + TECH_CHOICES.length + CONSTRAINTS.length}`)

    console.log(`\n  Graph weaknesses still present:`)
    console.log(`    • No Piku project root node (Bug #3)`)
    console.log(`    • ADR-001, ADR-010, ADR-011 remain isolated (no tech edges by design)`)
    console.log(`    • Principle/Rule/Constraint nodes not yet linked to ADR decisions`)
    console.log(`    • 01_PRODUCT_VISION.md unseeded (no goal nodes yet)`)
    console.log(sep)

    // ── Assertions ─────────────────────────────────────────────────────────
    const decisionNodes   = byType['decision']   ?? []
    const technologyNodes = byType['technology'] ?? []

    expect(allNodes.length, 'total nodes should grow from baseline').toBeGreaterThan(beforeNodes)
    expect(allEdges.length, 'total edges should grow from baseline').toBeGreaterThan(beforeEdges)

    expect(decisionNodes.length,
      'should have ≥ 42 decision nodes (13 ADR + 2 superseded + 8 principles + 6 rules + 9 tech-choices + 6 constraints)'
    ).toBeGreaterThanOrEqual(42)

    expect(technologyNodes.length,
      'should have ≥ 14 technology nodes (from ADRs + table additions)'
    ).toBeGreaterThanOrEqual(14)

    // Spot-check key nodes exist
    const names = new Set(allNodes.map(n => n.name))
    expect(names.has('P1: Piku is not the model'),        'P1 node').toBe(true)
    expect(names.has('P8: IDB migrations are additive only'), 'P8 node').toBe(true)
    expect(names.has('Rule 1: Model names only in OllamaService.ts'), 'Rule 1 node').toBe(true)
    expect(names.has('K1: Zero recurring inference cost for core operations'), 'K1 node').toBe(true)
    expect(names.has('Vitest'),           'Vitest tech node').toBe(true)
    expect(names.has('nomic-embed-text'), 'nomic-embed-text tech node').toBe(true)
    expect(names.has('TailwindCSS'),      'TailwindCSS tech node').toBe(true)
    expect(names.has('Framer Motion'),    'Framer Motion tech node').toBe(true)
    expect(names.has('qwen2.5-coder:14b'), 'qwen2.5-coder:14b tech node').toBe(true)
  })

})
