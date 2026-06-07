import type { SupabaseClient } from '@supabase/supabase-js';
import { type TtsModel, type TtsVoice, parseTtsModel, parseTtsVoice } from './tts.ts';

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

// Matches `agents.mode` CHECK constraint. Gates the master's privileged
// toolset (maintenance = write management, debug = read-only introspection);
// 'normal' is all an end-user ever sees. Effective only while `modeUntil` is
// in the future — see `effectiveAgentMode`.
export const AGENT_MODES = ['normal', 'maintenance', 'debug'] as const;
export type AgentMode = (typeof AGENT_MODES)[number];

const parseAgentMode = (raw: string): AgentMode => (
  (AGENT_MODES as readonly string[]).includes(raw)
    ? raw as AgentMode
    : 'normal'
);

// A mode is live only until its TTL passes; an expired window reads as
// 'normal' so a forgotten session can't leave management tools armed.
export const effectiveAgentMode = (agent: { mode: AgentMode; modeUntil: string | null }): AgentMode => {
  if (agent.mode === 'normal') return 'normal';
  if (!agent.modeUntil || new Date(agent.modeUntil).getTime() <= Date.now()) return 'normal';
  return agent.mode;
};

export interface AgentConfig {
  id:                   string;
  ownerId:              string;
  name:                 string;
  systemPrompt:         string | null;
  defaultTextModel:     string | null;
  defaultVisionModel:   string | null;
  defaultTtsModel:      TtsModel | null;
  defaultTtsVoice:      TtsVoice | null;
  ttsInstructions:      string | null;
  avatarUrl:            string | null;
  voiceReplyMode:       VoiceReplyMode;
  normalizeTraditional: boolean;
  mode:                 AgentMode;
  modeUntil:            string | null;
}

const mapRow = (data: {
  id:                    string;
  owner_id:              string;
  name:                  string;
  system_prompt:         string | null;
  default_text_model:    string | null;
  default_vision_model:  string | null;
  default_tts_model:     string | null;
  default_tts_voice:     string | null;
  tts_instructions:      string | null;
  avatar_url:            string | null;
  voice_reply_mode:      string;
  normalize_traditional: boolean;
  mode:                  string;
  mode_until:            string | null;
}): AgentConfig => ({
  id:                   data.id,
  ownerId:              data.owner_id,
  name:                 data.name,
  systemPrompt:         data.system_prompt,
  defaultTextModel:     data.default_text_model,
  defaultVisionModel:   data.default_vision_model,
  defaultTtsModel:      parseTtsModel(data.default_tts_model),
  defaultTtsVoice:      parseTtsVoice(data.default_tts_voice),
  ttsInstructions:      data.tts_instructions,
  avatarUrl:            data.avatar_url,
  voiceReplyMode:       parseVoiceReplyMode(data.voice_reply_mode),
  normalizeTraditional: data.normalize_traditional,
  mode:                 parseAgentMode(data.mode),
  modeUntil:            data.mode_until,
});

// Filters trashed agents so a non-null return is safe to load as
// persona config.
export const findAgentById = async (
  admin: SupabaseClient,
  agentId: string,
): Promise<AgentConfig | null> => {
  const { data, error } = await admin
    .from('agents')
    .select('id, owner_id, name, system_prompt, default_text_model, default_vision_model, default_tts_model, default_tts_voice, tts_instructions, avatar_url, voice_reply_mode, normalize_traditional, mode, mode_until')
    .eq('id', agentId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  return data ? mapRow(data) : null;
};
