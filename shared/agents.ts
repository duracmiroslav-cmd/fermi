import type { SupabaseClient } from '@supabase/supabase-js';

export interface AgentConfig {
  id: string;
  ownerId: string;
  name: string;
  systemPrompt: string | null;
  defaultTextModel: string | null;
  avatarUrl: string | null;
  voiceReplyEnabled: boolean;
}

const mapRow = (data: {
  id: string;
  owner_id: string;
  name: string;
  system_prompt: string | null;
  default_text_model: string | null;
  avatar_url: string | null;
  voice_reply_enabled: boolean;
}): AgentConfig => ({
  id: data.id,
  ownerId: data.owner_id,
  name: data.name,
  systemPrompt: data.system_prompt,
  defaultTextModel: data.default_text_model,
  avatarUrl: data.avatar_url,
  voiceReplyEnabled: data.voice_reply_enabled,
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
    .select('id, owner_id, name, system_prompt, default_text_model, avatar_url, voice_reply_enabled')
    .eq('id', agentId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return data ? mapRow(data) : null;
};
