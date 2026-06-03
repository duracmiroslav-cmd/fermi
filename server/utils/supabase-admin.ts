import { type SupabaseClient, createClient } from '@supabase/supabase-js';
import type { Database } from '~~/app/types/database.types';

let cached: SupabaseClient<Database> | null = null;

export const useSupabaseAdmin = (): SupabaseClient<Database> => {
  if (cached) return cached;

  const { supabaseUrl, supabaseSecretKey } = useRuntimeConfig();
  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY must be set');
  }

  cached = createClient(supabaseUrl, supabaseSecretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
};
