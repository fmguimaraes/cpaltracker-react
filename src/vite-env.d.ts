/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the cpaltracker.web /api/v1 REST layer this build targets
   * (KAN-116). Switching local/staging vs. prod is this value, never a code
   * change (KAN-60 FR2). */
  readonly VITE_API_BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
