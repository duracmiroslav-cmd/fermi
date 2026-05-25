export default defineAppConfig({
  toaster: {
    duration: 8000,
  },
  ui: {
    colors: {
      primary: 'apricot',
      neutral: 'stone',
      success: 'pistachio',
    },
    toast: {
      slots: {
        progress: 'hidden',
      },
    },
    button: {
      slots: {
        base: 'cursor-pointer',
      },
    },
    input: {
      slots: {
        root: 'w-full',
      },
    },
    textarea: {
      slots: {
        root: 'w-full',
      },
    },
    select: {
      slots: {
        base: 'w-full cursor-pointer',
        item: 'cursor-pointer',
      },
    },
    selectMenu: {
      slots: {
        base: 'w-full cursor-pointer',
        item: 'cursor-pointer',
      },
    },
    switch: {
      slots: {
        base: 'cursor-pointer',
      },
    },
  },
});
