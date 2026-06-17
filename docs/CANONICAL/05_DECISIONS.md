# Decisions

## ADR-001: Local-first architecture
Status: Accepted  
Context: Piku must work without internet access  
Decision: All inference runs locally via Ollama  
Consequences: No API costs, full privacy, limited to local model capability

## ADR-002: IndexedDB for storage
Status: Accepted  
Context: Cross-platform persistence needed for a Tauri desktop app  
Decision: Use IndexedDB with versioned schema  
Consequences: Portable, no native dependencies, good-enough performance

## ADR-003: Knowledge graph for memory
Status: Accepted  
Context: Structured relationships between entities support context-aware responses  
Decision: TypeScript-native graph with 9 node types, 10 relationship types  
Consequences: Flexible querying, extraction pipeline needed for auto-population

## ADR-004: Hub-and-spoke graph visualization
Status: Accepted  
Context: Users need to explore their knowledge graph visually  
Decision: Force-directed layout with cosmic void theme  
Consequences: Intuitive for browsing, requires clustering for large graphs

## ADR-005: nomic-embed-text for embeddings
Status: Accepted  
Context: Semantic search over memory requires embeddings  
Decision: Use nomic-embed-text via Ollama  
Consequences: 768-dim vectors, local inference, 137M parameter model
