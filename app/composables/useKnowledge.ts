import type { MaybeRefOrGetter } from 'vue';

export interface KnowledgeDoc {
  id:         string;
  title:      string;
  sourceType: string;
  charCount:  number;
  status:     string;
  createdAt:  string;
}

// Read + write for an agent's knowledge documents. Mirrors useAgents: the
// list fetch lives here so each mutation refreshes it before the UI reads
// back, and the page just consumes `documents` / `add` / `remove`.
export const useKnowledge = (agentId: MaybeRefOrGetter<string>) => {
  const { t } = useI18n();
  const notify = useNotify();
  const id = computed(() => toValue(agentId));

  const { data: documents, pending, refresh } = useApiFetch<KnowledgeDoc[]>(
    () => `/api/agents/${id.value}/knowledge`,
  );

  const isAdding = ref(false);
  const deletingId = ref<string | null>(null);

  const add = async (body: { title: string; text: string }): Promise<boolean> => {
    isAdding.value = true;
    try {
      await $fetch(`/api/agents/${id.value}/knowledge`, { method: 'POST', body });
      await refresh();
      notify.success(t('__toastKnowledgeAdded'));
      return true;
    } catch (e) {
      notify.error(t('__toastKnowledgeAddFailed'), e);
      return false;
    } finally {
      isAdding.value = false;
    }
  };

  const remove = async (docId: string): Promise<boolean> => {
    deletingId.value = docId;
    try {
      await $fetch(`/api/agents/${id.value}/knowledge/${docId}`, { method: 'DELETE' });
      await refresh();
      notify.success(t('__toastKnowledgeDeleted'));
      return true;
    } catch (e) {
      notify.error(t('__toastKnowledgeDeleteFailed'), e);
      return false;
    } finally {
      deletingId.value = null;
    }
  };

  return { documents, pending, refresh, isAdding, deletingId, add, remove };
};
