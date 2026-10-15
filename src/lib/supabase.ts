import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

// The publishable key is meant to ship to browsers: row-level security in
// supabase/migrations decides what each signed-in user can read and write.
const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/** False until a Supabase project is configured; the app then stays local-only. */
export const isSupabaseConfigured = Boolean(url && publishableKey);

let client: SupabaseClient<Database> | null = null;

/**
 * The browser's Supabase client, or null when Supabase isn't configured or during
 * server rendering (sessions live in the browser's storage).
 */
export function getSupabase(): SupabaseClient<Database> | null {
  if (!isSupabaseConfigured || typeof window === "undefined") return null;
  client ??= createClient<Database>(url!, publishableKey!, {
    auth: {
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return client;
}
