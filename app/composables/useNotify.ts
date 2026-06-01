// Standard success / error toasts. `error` accepts either a string detail
// (for user-facing validation messages) or a thrown value. Thrown values
// go through extractErrorMessage which prefers server `data.code` → i18n
// key, falls back to statusMessage, then Error.message.
export const useNotify = () => {
  const { t } = useI18n();
  const toast = useToast();
  return {
    success: (title: string) => toast.add({ title, color: 'success' }),
    warning: (title: string, description: string) =>
      toast.add({ title, description, color: 'warning' }),
    error: (title: string, detail: unknown) => {
      const description = typeof detail === 'string' ? detail : extractErrorMessage(detail, t);
      toast.add({ title, description, color: 'error' });
    },
  };
};
