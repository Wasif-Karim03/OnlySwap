import { createClient } from '@supabase/supabase-js';

// Public values only (the anon/publishable key); set in the Pages build env.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
if (!url || !key) throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set');
if (key.startsWith('sb_secret_'))
  throw new Error('VITE_SUPABASE_ANON_KEY is a secret key; use the publishable key');

export const supabase = createClient(url, key, {
  auth: { persistSession: true, storageKey: 'onlyswap-admin', autoRefreshToken: true },
});

export async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}
