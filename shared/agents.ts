import type { SupabaseClient } from '@supabase/supabase-js';

// Matches `agents.voice_reply_mode` CHECK constraint. Narrow type
// gates downstream switches on a closed set; widening requires both
// a migration and a TS change so they stay in lockstep.
export const VOICE_REPLY_MODES = ['off', 'auto', 'always'] as const;
export type VoiceReplyMode = (typeof VOICE_REPLY_MODES)[number];

const parseVoiceReplyMode = (raw: string): VoiceReplyMode => (
  (VOICE_REPLY_MODES as readonly string[]).includes(raw)
    ? raw as VoiceReplyMode
    : 'off'
);

export interface AgentConfig {
  id:                 string;
  ownerId:            string;
  name:               string;
  systemPrompt:       string | null;
  defaultTextModel:   string | null;
  defaultVisionModel: string | null;
  avatarUrl:          string | null;
  voiceReplyMode:     VoiceReplyMode;
}

const mapRow = (data: {
  id:                   string;
  owner_id:             string;
  name:                 string;
  system_prompt:        string | null;
  default_text_model:   string | null;
  default_vision_model: string | null;
  avatar_url:           string | null;
  voice_reply_mode:     string;
}): AgentConfig => ({
  id:                 data.id,
  ownerId:            data.owner_id,
  name:               data.name,
  systemPrompt:       data.system_prompt,
  defaultTextModel:   data.default_text_model,
  defaultVisionModel: data.default_vision_model,
  avatarUrl:          data.avatar_url,
  voiceReplyMode:     parseVoiceReplyMode(data.voice_reply_mode),
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
    .select('id, owner_id, name, system_prompt, default_text_model, default_vision_model, avatar_url, voice_reply_mode')
    .eq('id', agentId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return data ? mapRow(data) : null;
};
