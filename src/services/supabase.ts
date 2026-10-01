import { createClient, SupabaseClient, Session, User as SupabaseUser } from '@supabase/supabase-js';
import { isOfflineMode, offlineFetch } from './offlineMode';

// Offline mode points the client at an unreachable host so no request reaches the real project.
const SUPABASE_URL = isOfflineMode ? 'http://offline.invalid' : import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = isOfflineMode ? 'offline' : import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  ...(isOfflineMode ? { global: { fetch: offlineFetch } } : {}),
});

export const isSupabaseConfigured = (): boolean =>
  Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const getSupabaseStorageUrl = (bucket: string, path: string): string =>
  `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;

export const getSupabaseSignedUrl = async (bucket: string, path: string, expiresIn = 3600): Promise<string | null> => {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) { console.error('[Supabase Storage] Signed URL error:', error.message); return null; }
  return data.signedUrl;
};

export type { Session, SupabaseUser };
