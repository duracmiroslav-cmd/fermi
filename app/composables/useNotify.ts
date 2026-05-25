// Standard success / error toasts. `error` accepts either a string detail
// (for user-facing validation messages) or a thrown value (auto-extracts
// the server's statusMessage via extractErrorMessage).
export const useNotify = () => {
  const toast = useToast();
  return {
    success: (title: string) => toast.add({ title, color: 'success' }),
    warning: (title: string, description: string) =>
      toast.add({ title, description, color: 'warning' }),
    error: (title: string, detail: unknown) => {
      const description = typeof detail === 'string' ? detail : extractErrorMessage(detail);
      toast.add({ title, description, color: 'error' });
    },
  };
};
