interface BotCreate {
  platform:           'line';
  channelSecret:      string;
  channelAccessToken: string;
}

interface BotUpdate {
  agentId:    string;
  disabledAt: string | null;
}

// Write side for bots — the sibling of useAgents. Each mutation invalidates the
// list ('bots' key, see useTierLimit) and, on update, the detail page (id key)
// before the caller navigates, so neither flashes stale.
export const useBots = () => {
  const { t } = useI18n();
  const notify = useNotify();
  const isSubmitting = ref(false);
  const isDeleting = ref(false);

  const create = async (body: BotCreate) => {
    isSubmitting.value = true;
    try {
      const created = await $fetch<{ id: string }>('/api/bots', { method: 'POST', body });
      await refreshNuxtData('bots');
      notify.success(t('__toastBotConnected'));
      return created;
    } catch (e) {
      notify.error(t('__toastConnectFailed'), e);
      return null;
    } finally {
      isSubmitting.value = false;
    }
  };

  const update = async (id: string, body: BotUpdate) => {
    isSubmitting.value = true;
    try {
      await $fetch(`/api/bots/${id}`, { method: 'PATCH', body });
      await refreshNuxtData(id);
      await refreshNuxtData('bots');
      notify.success(t('__toastBotUpdated'));
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
      await $fetch(`/api/bots/${id}`, { method: 'DELETE' });
      await refreshNuxtData('bots');
      notify.success(t('__toastBotDeleted'));
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
