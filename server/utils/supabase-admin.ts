import { type SupabaseClient, createClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

export const useSupabaseAdmin = (): SupabaseClient => {
  if (cached) return cached;

  const { supabaseUrl, supabaseServiceRoleKey } = useRuntimeConfig();
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  }

  cached = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
};
