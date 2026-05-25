export default defineAppConfig({
  ui: {
    colors: {
      primary: 'apricot',
      neutral: 'zinc',
      success: 'matcha',
      warning: 'saffron',
      error: 'cherry',
    },
    toast: {
      slots: {
        progress: 'hidden',
        root: 'border-l-2',
      },
      variants: {
        color: {
          primary: { root: 'border-l-primary' },
          secondary: { root: 'border-l-secondary' },
          success: { root: 'border-l-success' },
          info: { root: 'border-l-info' },
          warning: { root: 'border-l-warning' },
          error: { root: 'border-l-error' },
          neutral: { root: 'border-l-default' },
        },
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
