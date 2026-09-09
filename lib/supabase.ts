import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null | undefined;

export type SupabaseBrowserConfig = { url?: string; key?: string };

export function isSupabaseConfigured(config?: SupabaseBrowserConfig) {
  return Boolean(config?.url && config.key);
}

export function getSupabaseBrowserClient(config?: SupabaseBrowserConfig) {
  if (browserClient !== undefined) return browserClient;

  const url = config?.url;
  const key = config?.key;

  browserClient = url && key
    ? createClient(url, key, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
    })
    : null;

  return browserClient;
}
