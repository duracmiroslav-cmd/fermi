// Shared bot-avatar sync flow for both the list page and the detail
// page. Wraps the POST /api/bots/:id/refresh call, server-refresh
// trigger, and toast UX in one place so wording / error handling
// don't drift between the two surfaces.
//
// `onSynced` is the page's data-source refresh callback (useFetch's
// `refresh` or useTierLimit's `refresh`). It's called only after a
// successful API response so a failed sync doesn't trigger an
// unnecessary fetch.
export const useBotAvatar = (onSynced: () => Promise<unknown> | unknown) => {
  const toast = useToast();
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
        toast.add({ title: 'Avatar synced from LINE', color: 'success' });
      }
      else {
        toast.add({
          title: 'LINE OA has no profile picture yet',
          description: 'Upload one in LINE Official Account Manager, then sync again.',
          color: 'warning',
        });
      }
    }
    catch (e) {
      toast.add({
        title: 'Sync failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        color: 'error',
      });
    }
    finally {
      syncingId.value = null;
    }
  };

  return { syncingId, sync };
};
