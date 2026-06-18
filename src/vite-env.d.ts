/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Local-only secrets (set in .env.local, gitignored — never committed).
  readonly VITE_GH_PERSONAL_TOKEN?: string
  readonly VITE_GH_OFFICE_TOKEN?: string
  readonly VITE_GOOGLE_CLIENT_ID?: string
  readonly VITE_GOOGLE_CLIENT_SECRET?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
