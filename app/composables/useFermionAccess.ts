// fermion reasons on an OpenRouter key, so access mirrors shared/keys.ts
// resolveKey's pricing rule: a Pro owner runs on fermi's platform key; a Free
// owner must have connected their own OpenRouter (BYOK), and fermion then runs
// on their key at no platform cost. Free without OpenRouter can't run fermion —
// they onboard through the mechanical setup banner instead, which costs no LLM.
export const canAccessFermion = (
  tier: string | undefined,
  openrouterConnected: boolean,
): boolean => tier === 'pro' || openrouterConnected;

export const useFermionAccess = () => {
  const profile = useProfile();
  const { data: openrouter } = useApiFetch<{ connected: boolean }>('/api/oauth/openrouter');
  const canUseFermion = computed(() =>
    canAccessFermion(profile.value?.tier, !!openrouter.value?.connected),
  );
  return { canUseFermion };
};
