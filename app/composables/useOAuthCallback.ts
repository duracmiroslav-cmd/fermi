// Surface OAuth landing state (`?<provider>=connected|error&reason=...`) as a
// toast, then strip the params so a refresh doesn't replay it.
export const useOAuthCallback = (provider: string, label: string) => {
  const { t } = useI18n();
  const route = useRoute();
  const router = useRouter();
  const notify = useNotify();

  onMounted(() => {
    const result = route.query[provider];
    if (result === 'connected') {
      notify.success(t('__toastConnectorConnected', { name: label }));
    } else if (result === 'error') {
      const reason = typeof route.query.reason === 'string' ? route.query.reason : 'unknown';
      notify.error(t('__toastConnectorConnectFailed', { name: label }), reason);
    }
    if (result) {
      router.replace({ query: {} });
    }
  });
};
