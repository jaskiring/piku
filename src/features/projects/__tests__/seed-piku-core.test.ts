/**
 * Piku Core World Model Seeding — Real Execution
 *
 * Runs document absorption sequentially against live Ollama.
 * Uses fake-indexeddb to polyfill IDB in the Node test environment.
 *
 * Pre-condition: Ollama must be running (ollama serve).
 * Run: npx vitest run src/features/projects/__tests__/seed-piku-core.test.ts
 *
 * Tests run sequentially (describe.sequential) to avoid concurrent GPU
 * calls which cause timeout failures under contention.
 */

// ── IDB polyfill — must be first ──────────────────────────────────────────
import 'fake-indexeddb/auto'

import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync }                     from 'node:fs'
import { resolve }                          from 'node:path'
import { ProjectService }                   from '../ProjectService'
import { ProjectUpdateService }             from '../ProjectUpdateService'
import { ContextVersionStore }              from '../ContextVersionStore'
import { GraphStore }                       from '../../graph/GraphStore'

// ── Path helpers ─────────────────────────────────────────────────────────────

const ROOT = resolve(__dirname, '../../../..')   // __tests__ → projects → features → src → piku

function doc(relPath: string): string {
  return readFileSync(resolve(ROOT, relPath), 'utf-8')
}

// 03_ARCHITECTURE.md is 13,044 chars — too large for a single extraction within 300s.
// Split into two chunks that each run under the token budget.
function docChunked(relPath: string): string[] {
  const content = doc(relPath)
  const mid     = Math.floor(content.length / 2)
  // Split at the nearest newline after the midpoint
  const splitAt = content.indexOf('\n', mid)
  return [content.slice(0, splitAt), content.slice(splitAt)]
}

// ── Absorption plan ───────────────────────────────────────────────────────────

interface AbsorptionPlan {
  label:   string
  path:    string
  content: string
}

function buildPlan(): AbsorptionPlan[] {
  const architecture = docChunked('docs/CANONICAL/03_ARCHITECTURE.md')
  return [
    { label: '01_PRODUCT_VISION',       path: 'docs/CANONICAL/01_PRODUCT_VISION.md', content: doc('docs/CANONICAL/01_PRODUCT_VISION.md') },
    { label: '02_CURRENT_STATE',        path: 'docs/CANONICAL/02_CURRENT_STATE.md',  content: doc('docs/CANONICAL/02_CURRENT_STATE.md')  },
    { label: '03_ARCHITECTURE (part 1)', path: 'docs/CANONICAL/03_ARCHITECTURE.md',  content: architecture[0] },
    { label: '03_ARCHITECTURE (part 2)', path: 'docs/CANONICAL/03_ARCHITECTURE.md',  content: architecture[1] },
    { label: '05_DECISIONS',            path: 'docs/CANONICAL/05_DECISIONS.md',      content: doc('docs/CANONICAL/05_DECISIONS.md')      },
    { label: '04_ROADMAP',              path: 'docs/CANONICAL/04_ROADMAP.md',         content: doc('docs/CANONICAL/04_ROADMAP.md')         },
  ]
}

// ── Services ─────────────────────────────────────────────────────────────────

const projectSvc = new ProjectService()
const updateSvc  = new ProjectUpdateService()
const versionSvc = new ContextVersionStore()
const graphStore = new GraphStore()

// ── Shared mutable state across sequential tests ──────────────────────────────

let projectId = ''

interface AbsorptionRecord {
  label:       string
  charCount:   number
  hasChanges:  boolean
  skipped:     boolean
  skipReason?: string
  decisions:   Array<{ title: string; reasoning: string }>
  completed:   string[]
  inProgress:  string[]
  nextSteps:   string[]
  blockers:    string[]
  stateChange: { from: string; to: string } | null
  versionNum:  number
  durationMs:  number
}

const records: AbsorptionRecord[] = []

// ── Per-test timeout: 420s — covers 300s Ollama timeout + processing overhead ─

const TEST_TIMEOUT = 420_000

// ── Suite (sequential — one Ollama call at a time) ────────────────────────────

describe.skip('Piku Core World Model Seeding', () => {

  beforeAll(async () => {
    try {
      const r = await fetch('http://localhost:11434/api/tags', {
        signal: AbortSignal.timeout(3000),
      })
      if (!r.ok) throw new Error(`Ollama returned ${r.status}`)
    } catch (err) {
      throw new Error(`Ollama is not running. Start it: ollama serve\n${String(err)}`)
    }
  })

  // ── Create project ────────────────────────────────────────────────────────

  it('creates Piku Core project', async () => {
    const all      = await projectSvc.getAllProjects()
    const existing = all.find(p => p.name === 'Piku Core')

    if (existing) {
      projectId = existing.id
      console.log(`ℹ️  Reusing existing Piku Core (id: ${projectId})`)
    } else {
      const p = await projectSvc.createProject(
        'Piku Core',
        'The ambient AI companion engine — World Model, Memory, Graph, Projects, Summaries, and the Observation Layer.',
        'Active Development',
      )
      projectId = p.id
      console.log(`✅ Created Piku Core (id: ${projectId})`)
    }

    expect(projectId).toBeTruthy()
  }, TEST_TIMEOUT)

  // ── Absorb documents (sequential — generated from plan) ───────────────────

  const plan = buildPlan()

  for (const absorption of plan) {
    it(`absorb: ${absorption.label}`, async () => {
      expect(projectId).toBeTruthy()

      const start = Date.now()
      console.log(`\n📄 ${absorption.label} (${absorption.content.length.toLocaleString()} chars)`)

      const diff       = await updateSvc.previewContextUpdate(projectId, absorption.content)
      const durationMs = Date.now() - start

      if (!diff || !diff.hasChanges) {
        records.push({
          label: absorption.label, charCount: absorption.content.length,
          hasChanges: false, skipped: true,
          skipReason: diff === null ? 'LLM call failed or timed out' : 'LLM found no project-relevant changes',
          decisions: [], completed: [], inProgress: [], nextSteps: [],
          blockers: [], stateChange: null, versionNum: 0, durationMs,
        })
        console.log(`  ⚠️  Skipped — ${records[records.length - 1].skipReason}`)
        return
      }

      const vBefore = await versionSvc.countForProject(projectId)
      await updateSvc.applyApprovedDiff(projectId, diff)
      const vAfter  = await versionSvc.countForProject(projectId)

      const record: AbsorptionRecord = {
        label:      absorption.label,
        charCount:  absorption.content.length,
        hasChanges: true,
        skipped:    false,
        decisions:  diff.newDecisions,
        completed:  diff.newCompletedWork,
        inProgress: diff.newInProgressWork,
        nextSteps:  diff.newNextSteps,
        blockers:   diff.newBlockers,
        stateChange: diff.stateChange,
        versionNum:  vAfter,
        durationMs,
      }
      records.push(record)

      console.log(`  ✅ Applied in ${durationMs}ms — version ${vAfter}`)
      if (record.decisions.length)  console.log(`     Decisions (${record.decisions.length}): ${record.decisions.map(d => d.title).join(' | ')}`)
      if (record.completed.length)  console.log(`     Completed (${record.completed.length}): ${record.completed.join(' | ')}`)
      if (record.inProgress.length) console.log(`     In Progress (${record.inProgress.length}): ${record.inProgress.join(' | ')}`)
      if (record.nextSteps.length)  console.log(`     Next Steps (${record.nextSteps.length}): ${record.nextSteps.join(' | ')}`)
      if (record.blockers.length)   console.log(`     Blockers (${record.blockers.length}): ${record.blockers.join(' | ')}`)
      if (record.stateChange)       console.log(`     State: ${record.stateChange.from} → ${record.stateChange.to}`)

      expect(vAfter).toBeGreaterThan(vBefore)
    }, TEST_TIMEOUT)
  }

  // ── Final state capture ───────────────────────────────────────────────────

  it('captures final state', async () => {
    const project  = await projectSvc.getProject(projectId)
    const versions = await versionSvc.getForProject(projectId)
    const nodes    = await graphStore.getAllNodes()
    const edges    = await graphStore.getAllEdges()

    expect(project).toBeTruthy()
    if (!project) return

    const sep = '═'.repeat(68)
    console.log(`\n${sep}`)
    console.log('  PIKU CORE — SEEDING RESULT')
    console.log(`  Executed: ${new Date().toISOString()}`)
    console.log(sep)
    console.log(`\nDecisions:   ${project.decisions.length}`)
    console.log(`Completed:   ${project.completedWork.length}`)
    console.log(`In Progress: ${project.inProgressWork.length}`)
    console.log(`Next Steps:  ${project.nextSteps.length}`)
    console.log(`Blockers:    ${project.blockers.length}`)
    console.log(`Graph nodes: ${nodes.length}`)
    console.log(`Graph edges: ${edges.length}`)
    console.log(`Context versions: ${versions.length}`)

    console.log('\n── Context Version Timeline ─────────────────────────')
    for (const v of versions) {
      console.log(`  v${v.version}  ${v.trigger.padEnd(15)}  ${v.summary.slice(0, 90)}`)
    }

    console.log('\n── Per-Document Results ─────────────────────────────')
    for (const r of records) {
      const status = r.skipped ? '⚠ SKIP' : '✓ OK  '
      console.log(`  ${status}  ${r.label.padEnd(32)} ${r.durationMs}ms`)
      if (!r.skipped && r.decisions.length) {
        r.decisions.forEach(d => console.log(`         + Decision: ${d.title}`))
      }
    }

    console.log('\n── All Decisions ────────────────────────────────────')
    project.decisions.forEach((d, i) => {
      console.log(`  ${String(i + 1).padStart(2)}. ${d.title}`)
      if (d.reasoning) console.log(`      ↳ ${d.reasoning.slice(0, 100)}`)
    })

    console.log('\n── All Completed Work ───────────────────────────────')
    project.completedWork.forEach((w, i) => console.log(`  ${i + 1}. ${w}`))

    console.log('\n── All Blockers ─────────────────────────────────────')
    project.blockers.forEach((b, i) => console.log(`  ${i + 1}. ${b}`))

    console.log('\n── All Next Steps ───────────────────────────────────')
    project.nextSteps.forEach((s, i) => console.log(`  ${i + 1}. ${s}`))

    console.log(`\n${sep}\n`)

    // Store for the report writer
    ;(globalThis as Record<string, unknown>).__SEEDING_PROJECT__  = project
    ;(globalThis as Record<string, unknown>).__SEEDING_RECORDS__  = records
    ;(globalThis as Record<string, unknown>).__SEEDING_VERSIONS__ = versions
    ;(globalThis as Record<string, unknown>).__SEEDING_NODES__    = nodes
    ;(globalThis as Record<string, unknown>).__SEEDING_EDGES__    = edges
  }, TEST_TIMEOUT)
})
