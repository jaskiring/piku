# Architecture

Piku follows a layered architecture:

1. OS Layer — Shell, Sidebar, Dock, CyberBackground, HUD primitives
2. Chat Layer — OllamaService, conversation management, streaming
3. Graph Layer — Knowledge graph, IndexedDB store, extraction pipeline
4. World Model — Memory, observations, graph source for queries
5. Apps Layer — Active-app observer, planned integrations

Data flow:
- User input → Chat → OLlama → Response + Extraction → Graph
- Observations → World Model → Graph
- Graph → Query context for responses
