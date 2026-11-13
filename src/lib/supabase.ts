import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null | undefined;
let inflightPromise: Promise<SupabaseClient | null> | null = null;

function isValidHttpUrl(value: string): boolean {
  return value.startsWith('https://') || value.startsWith('http://');
}

export async function getBrowserSupabaseClient(): Promise<SupabaseClient | null> {
  if (cachedClient !== undefined) {
    return cachedClient;
  }

  if (inflightPromise) {
    return inflightPromise;
  }

  inflightPromise = (async () => {
    const buildUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
    const buildKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

    if (buildUrl && buildKey && isValidHttpUrl(buildUrl)) {
      cachedClient = createClient(buildUrl, buildKey, {
        realtime: {
          params: {
            eventsPerSecond: 10,
          },
        },
      });
      return cachedClient;
    }

    try {
      const response = await fetch('/api/config');
      if (response.ok) {
        const data = (await response.json()) as {
          supabaseUrl?: string;
          supabaseAnonKey?: string;
        };
        const serverUrl = (data.supabaseUrl || '').trim();
        const serverKey = (data.supabaseAnonKey || '').trim();

        if (serverUrl && serverKey && isValidHttpUrl(serverUrl)) {
          cachedClient = createClient(serverUrl, serverKey, {
            realtime: {
              params: {
                eventsPerSecond: 10,
              },
            },
          });
          return cachedClient;
        }
      }
    } catch {
      // Ignore config fetch failure and allow fallback handling
    }

    cachedClient = null;
    return null;
  })();

  try {
    return await inflightPromise;
  } finally {
    inflightPromise = null;
  }
}
