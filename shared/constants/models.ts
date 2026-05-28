// Models the worker falls back to when an agent leaves its text model
// unset. DEFAULT_TEXT_MODEL also seeds the new-agent form's picker so
// the UI matches what a run would actually use.
export const DEFAULT_TEXT_MODEL = 'anthropic/claude-opus-4.7';

// Vision-capable fallback used for any run whose history contains an
// image, regardless of agent.defaultTextModel. Per-agent vision
// override is a follow-up; for now hardcoded so users can't pick a
// text-only model and silently break image conversations.
export const DEFAULT_VISION_MODEL = 'anthropic/claude-sonnet-4.5';

// The model a run will actually use for text: the agent's own pick, or
// DEFAULT_TEXT_MODEL when unset (matching the worker's fallback). The
// Default agent ships with no text model, so this is what reveals the
// effective model in the UI instead of an empty "—". isDefault lets the
// UI flag the inherited fallback distinctly from an explicit choice.
export const resolveTextModel = (model: string | null): { id: string; isDefault: boolean } =>
  model
    ? { id: model, isDefault: false }
    : { id: DEFAULT_TEXT_MODEL, isDefault: true };
