// Shared bot-avatar sync flow for both the list page and the detail
// page. Wraps the POST /api/bots/:id/refresh call, server-refresh
// trigger, and toast UX in one place so wording / error handling
// don't drift between the two surfaces.
//
// `onSynced` is the page's data-source refresh callback (useFetch's
// `refresh`). It's called only after a successful API response so a
// failed sync doesn't trigger an unnecessary fetch.
export const useBotAvatar = (onSynced: () => Promise<unknown> | unknown) => {
  const notify = useNotify();
  const syncingId = ref<string | null>(null);

  const sync = async (botId: string): Promise<void> => {
    if (syncingId.value) return;
    syncingId.value = botId;
    try {
      const res = await $fetch<{ avatarUrl: string | null }>(
        `/api/bots/${botId}/refresh`,
        { method: 'POST' },
      );
      await onSynced();
      if (res.avatarUrl) {
        notify.success('Avatar synced from LINE');
      } else {
        notify.warning(
          'LINE Official Account has no profile picture yet',
          'Upload one in LINE Official Account Manager, then sync again.',
        );
      }
    } catch (e) {
      notify.error('Sync failed', e);
    } finally {
      syncingId.value = null;
    }
  };

  return { syncingId, sync };
};
