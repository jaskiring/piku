/**
 * GDD Phase 1 — Validation Test
 *
 * Seeds docs/CANONICAL/05_DECISIONS.md into the knowledge graph using
 * DocumentChunker + EntityExtractor + DocumentSeeder.
 *
 * Success criteria:
 *   - >= 13 Decision nodes created
 *   - >= 5 Technology nodes created
 *   - >= 20 edges created
 *   - Runtime < 5 minutes (300s)
 *
 * Pre-condition: Ollama must be running (ollama serve).
 * Run: npx vitest run src/features/graph/__tests__/seed-gdd-decisions.test.ts
 */

import 'fake-indexeddb/auto'

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync }                     from 'node:fs'
import { resolve }                          from 'node:path'
import { DocumentSeeder }                   from '../DocumentSeeder'
import { GraphStore }                       from '../GraphStore'

const ROOT = resolve(__dirname, '../../../..')
const DECISIONS_PATH = 'docs/CANONICAL/05_DECISIONS.md'
const TEST_TIMEOUT   = 360_000   // 6 min — well above 5 min success criterion

describe.sequential('GDD Phase 1 — 05_DECISIONS.md seeding', () => {

  beforeAll(async () => {
    try {
      const r = await fetch('http://localhost:11434/api/tags', {
        signal: AbortSignal.timeout(3000),
      })
      if (!r.ok) throw new Error(`status ${r.status}`)
    } catch (err) {
      throw new Error(`Ollama not running. Start with: ollama serve\n${String(err)}`)
    }
  })

  // SKIPPED: requires real docs/CANONICAL/05_DECISIONS.md content
  // (not available in this workspace — restore from piku-vault to re-enable)
  it.skip('seeds 05_DECISIONS.md and meets all success criteria', async () => {
    const content  = readFileSync(resolve(ROOT, DECISIONS_PATH), 'utf-8')
    const seeder   = new DocumentSeeder()
    const store    = new GraphStore()

    const result = await seeder.seedFromFile(
      content,
      DECISIONS_PATH,
      'Piku Core',
      'adr',
      3,    // max 3 concurrent extraction calls
    )

    // ── Report ────────────────────────────────────────────────────────────────
    const nodes = await store.getAllNodes()
    const edges = await store.getAllEdges()

    const byType: Record<string, number> = {}
    for (const n of nodes) byType[n.type] = (byType[n.type] ?? 0) + 1

    const sep = '─'.repeat(60)
    console.log(`\n${sep}`)
    console.log('  GDD SEEDING RESULT — 05_DECISIONS.md')
    console.log(sep)
    console.log(`  Duration:      ${result.durationMs}ms (${(result.durationMs / 1000).toFixed(1)}s)`)
    console.log(`  Chunks:        ${result.chunks}`)
    console.log(`  Nodes created: ${result.nodesCreated}`)
    console.log(`  Nodes skipped: ${result.nodesSkipped}`)
    console.log(`  Edges created: ${result.edgesCreated}`)
    console.log(`  Edges skipped: ${result.edgesSkipped}`)
    console.log(`\n  Nodes by type:`)
    for (const [type, count] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${type.padEnd(14)} ${count}`)
    }
    console.log(`\n  Total nodes in graph: ${nodes.length}`)
    console.log(`  Total edges in graph: ${edges.length}`)

    if (nodes.length > 0) {
      const decisions = nodes.filter(n => n.type === 'decision')
      console.log(`\n  Decision nodes:`)
      for (const d of decisions.slice(0, 20)) {
        console.log(`    • ${d.name}`)
      }
    }

    console.log(sep)

    // ── Assertions — success criteria ─────────────────────────────────────────
    const decisionCount    = nodes.filter(n => n.type === 'decision').length
    const technologyCount  = nodes.filter(n => n.type === 'technology').length
    const confirmedEdges   = edges.filter(e => e.status === 'confirmed').length + edges.filter(e => e.status === 'pending').length

    expect(result.chunks, 'should have 13 ADR chunks (one per ADR)').toBeGreaterThanOrEqual(13)

    expect(decisionCount, `decision nodes (${decisionCount}) should be >= 13`).toBeGreaterThanOrEqual(13)

    expect(technologyCount, `technology nodes (${technologyCount}) should be >= 5`).toBeGreaterThanOrEqual(5)

    expect(confirmedEdges, `edges (${confirmedEdges}) should be >= 20`).toBeGreaterThanOrEqual(20)

    expect(result.durationMs, 'should complete in < 5 minutes').toBeLessThan(300_000)

  }, TEST_TIMEOUT)
})
