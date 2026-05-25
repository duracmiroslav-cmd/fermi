// Status fetch + connect/disconnect state for a Dashboard › Connections card.
// `connect()` is a no-op default; OAuth providers redirect inline, key-based
// providers override it via the returned `runConnect` helper.
export const useConnection = <T>(endpoint: string, label: string) => {
  const notify = useNotify();
  const { data, refresh, pending } = useApiFetch<T>(endpoint);
  const isConnecting = ref(false);
  const isDisconnecting = ref(false);

  const runConnect = async (body: Record<string, unknown>) => {
    isConnecting.value = true;
    try {
      await $fetch(endpoint, { method: 'POST', body });
      await refresh();
      notify.success(`${label} connected`);
      return true;
    } catch (e) {
      notify.error(`${label} connection failed`, e);
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
      notify.success(`${label} disconnected`);
    } catch (e) {
      notify.error('Disconnect failed', e);
    } finally {
      isDisconnecting.value = false;
    }
  };

  return { data, refresh, pending, isConnecting, isDisconnecting, runConnect, disconnect };
};
