import type { VoiceReplyMode } from '~~/shared/agents';
import type { TtsModel, TtsVoice } from '~~/shared/tts';

interface AgentCreate {
  name:             string;
  systemPrompt:     string | null;
  defaultTextModel: string | null;
}

interface AgentUpdate {
  name:                 string;
  systemPrompt:         string | null;
  defaultTextModel:     string | null;
  defaultVisionModel:   string | null;
  defaultTtsModel:      TtsModel | null;
  defaultTtsVoice:      TtsVoice | null;
  ttsInstructions:      string | null;
  voiceReplyMode:       VoiceReplyMode;
  normalizeTraditional: boolean;
}

// Write side for agents: each mutation invalidates the caches it dirties before
// the caller navigates, so the list ('agents' key) and the detail page (id key)
// never flash stale. Co-locating refresh with the $fetch is the whole point —
// it's the line that's easy to forget when a mutation lives inline in a page
// (which is how the create/delete staleness bugs crept in). Reads stay in the
// list page's useFetch (SSR) and useApiFetch (detail); folding the non-lazy
// list fetch in here would make every new/edit page pay for it.
export const useAgents = () => {
  const { t } = useI18n();
  const notify = useNotify();
  const isSubmitting = ref(false);
  const isDeleting = ref(false);

  const create = async (body: AgentCreate) => {
    isSubmitting.value = true;
    try {
      const created = await $fetch<{ id: string }>('/api/agents', { method: 'POST', body });
      await refreshNuxtData('agents');
      notify.success(t('__toastAgentCreated'));
      return created;
    } catch (e) {
      notify.error(t('__toastCreateFailed'), e);
      return null;
    } finally {
      isSubmitting.value = false;
    }
  };

  const update = async (id: string, body: AgentUpdate) => {
    isSubmitting.value = true;
    try {
      await $fetch(`/api/agents/${id}`, { method: 'PATCH', body });
      await refreshNuxtData(id);
      await refreshNuxtData('agents');
      notify.success(t('__toastAgentUpdated'));
      return true;
    } catch (e) {
      notify.error(t('__toastUpdateFailed'), e);
      return false;
    } finally {
      isSubmitting.value = false;
    }
  };

  const remove = async (id: string) => {
    isDeleting.value = true;
    try {
      await $fetch(`/api/agents/${id}`, { method: 'DELETE' });
      await refreshNuxtData('agents');
      notify.success(t('__toastAgentDeleted'));
      return true;
    } catch (e) {
      notify.error(t('__toastDeleteFailed'), e);
      return false;
    } finally {
      isDeleting.value = false;
    }
  };

  return { isSubmitting, isDeleting, create, update, remove };
};
