import type { SupabaseClient } from '@supabase/supabase-js';

export interface AgentConfig {
  id: string;
  ownerId: string;
  name: string;
  systemPrompt: string | null;
  defaultModel: string | null;
  avatarUrl: string | null;
}

const mapRow = (data: {
  id: string;
  owner_id: string;
  name: string;
  system_prompt: string | null;
  default_model: string | null;
  avatar_url: string | null;
}): AgentConfig => ({
  id: data.id,
  ownerId: data.owner_id,
  name: data.name,
  systemPrompt: data.system_prompt,
  defaultModel: data.default_model,
  avatarUrl: data.avatar_url,
});

// Filters trashed agents so callers can treat a non-null return as
// "safe to load persona config." Worker / API paths rely on this
// instead of repeating the check downstream.
export const findAgentById = async (
  admin: SupabaseClient,
  agentId: string,
): Promise<AgentConfig | null> => {
  const { data, error } = await admin
    .from('agents')
    .select('id, owner_id, name, system_prompt, default_model, avatar_url')
    .eq('id', agentId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return data ? mapRow(data) : null;
};
