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
