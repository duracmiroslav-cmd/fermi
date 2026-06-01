// Status fetch + connect/disconnect state for a Dashboard › Connectors card.
// `connect()` is a no-op default; OAuth providers redirect inline, key-based
// providers override it via the returned `runConnect` helper.
export const useConnector = <T>(endpoint: string, label: string) => {
  const { t } = useI18n();
  const notify = useNotify();
  const { data, refresh, pending } = useApiFetch<T>(endpoint);
  const isConnecting = ref(false);
  const isDisconnecting = ref(false);

  const runConnect = async (body: Record<string, unknown>) => {
    isConnecting.value = true;
    try {
      await $fetch(endpoint, { method: 'POST', body });
      await refresh();
      notify.success(t('__toastConnectorConnected', { name: label }));
      return true;
    } catch (e) {
      notify.error(t('__toastConnectorConnectFailed', { name: label }), e);
      return false;
    } finally {
      isConnecting.value = false;
    }
  };

  const disconnect = async () => {
    isDisconnecting.value = true;
    try {
      await $fetch(endpoint, { method: 'DELETE' });
      await refresh();
      notify.success(t('__toastConnectorDisconnected', { name: label }));
    } catch (e) {
      notify.error(t('__toastDisconnectFailed'), e);
    } finally {
      isDisconnecting.value = false;
    }
  };

  return { data, refresh, pending, isConnecting, isDisconnecting, runConnect, disconnect };
};
