/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** e.g. https://abcd1234.supabase.co — optional; without it the app stays local-only. */
  readonly VITE_SUPABASE_URL?: string;
  /** The project's publishable (anon) key. Safe in the browser; never the secret key. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
