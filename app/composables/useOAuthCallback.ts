// Surface OAuth landing state (`?<provider>=connected|error&reason=...`) as a
// toast, then strip the params so a refresh doesn't replay it.
export const useOAuthCallback = (provider: string, label: string) => {
  const route = useRoute();
  const router = useRouter();
  const notify = useNotify();

  onMounted(() => {
    const result = route.query[provider];
    if (result === 'connected') {
      notify.success(`${label} connected`);
    } else if (result === 'error') {
      const reason = typeof route.query.reason === 'string' ? route.query.reason : 'unknown';
      notify.error(`Failed to connect ${label}`, reason);
    }
    if (result) {
      router.replace({ query: {} });
    }
  });
};
