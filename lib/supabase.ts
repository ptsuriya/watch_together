import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null | undefined;
let sessionRequest: Promise<Session | null> | null = null;

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
      // Heartbeats from a Web Worker keep firing while a phone or background tab throttles page timers.
      realtime: { worker: typeof Worker !== "undefined" },
    })
    : null;

  return browserClient;
}

/**
 * Returns the stored session, or signs in anonymously when there is none. Concurrent callers share one request,
 * so a double-mounted effect never mints two anonymous users.
 */
export function ensureSession(client: SupabaseClient) {
  sessionRequest ??= (async () => {
    const { data, error } = await client.auth.getSession();
    // An error means the stored session could not be refreshed (usually offline). Signing in again here would
    // replace the user, and a host would lose the room.
    if (error) return null;
    if (data.session) return data.session;

    const { data: signIn, error: signInError } = await client.auth.signInAnonymously();
    return signInError ? null : signIn.session;
  })().finally(() => {
    sessionRequest = null;
  });
  return sessionRequest;
}
