export { GraphService }                         from './GraphService'
export { graphActivityLog }                     from './GraphActivityLog'
export type { GraphActivityEvent }              from './GraphActivityLog'
export type {
  GraphNode,
  GraphEdge,
  GraphNodeType,
  GraphRelationship,
  ProjectRisk,
  NextBestAction,
  Galaxy,
} from './types'

import { GraphService } from './GraphService'
import { logger }        from '../../lib/logger'

// Module-level singleton — shared between useChat and GraphPanel
export const graphService = new GraphService()

// Backfill embeddings for any nodes that predate semantic support.
// Fire-and-forget — never blocks app startup.
void graphService
  .backfillEmbeddings()
  .catch(err => logger.warn('graph: startup backfill failed', { error: String(err) }))
