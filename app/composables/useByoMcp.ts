import type { ByoMcpServer } from '~~/server/utils/mcp';

// Collection lifecycle for BYO custom MCP servers — the multi-row sibling of
// useConnector (which manages a single credential). The manager page reads
// `data` + `remove`; the add page reads `create`.
export const useByoMcp = () => {
  const { t } = useI18n();
  const notify = useNotify();
  const { data, refresh, pending } = useApiFetch<ByoMcpServer[]>('/api/connectors/mcp');
  const isSubmitting = ref(false);
  const deletingId = ref<string | null>(null);

  const create = async (body: { url: string; displayName: string; token?: string }) => {
    isSubmitting.value = true;
    try {
      await $fetch('/api/connectors/mcp', { method: 'POST', body });
      await refresh();
      notify.success(t('__toastMcpServerAdded', { name: body.displayName }));
      return true;
    } catch (e) {
      notify.error(t('__toastConnectorConnectFailed', { name: body.displayName }), e);
      return false;
    } finally {
      isSubmitting.value = false;
    }
  };

  const remove = async (server: ByoMcpServer) => {
    deletingId.value = server.id;
    try {
      await $fetch(`/api/connectors/mcp/${server.id}`, { method: 'DELETE' });
      await refresh();
      notify.success(t('__toastMcpServerDeleted', { name: server.displayName }));
    } catch (e) {
      notify.error(t('__toastDisconnectFailed'), e);
    } finally {
      deletingId.value = null;
    }
  };

  return { data, refresh, pending, isSubmitting, deletingId, create, remove };
};
