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
    breadcrumb: {
      slots: {
        link: 'hover:text-highlighted!',
      },
    },
    button: {
      slots: {
        base: 'cursor-pointer',
      },
    },
    card: {
      slots: {
        root: 'bg-elevated/50!',
      },
    },
    formField: {
      slots: {
        error: 'mt-1 text-xs',
        help: 'mt-1 text-xs',
      },
    },
    input: {
      slots: {
        root: 'w-full',
        base: 'font-mono read-only:cursor-default',
        leadingIcon: 'size-4!',
        trailingIcon: 'size-4!',
      },
    },
    textarea: {
      slots: {
        root: 'w-full',
        base: 'font-mono read-only:cursor-default',
      },
    },
    select: {
      slots: {
        base: 'w-full cursor-pointer font-mono data-[state=open]:ring-2 data-[state=open]:ring-inset data-[state=open]:ring-primary focus-visible:ring! focus-visible:ring-default!',
        item: 'cursor-pointer items-center data-highlighted:before:bg-elevated! data-[state=checked]:text-primary! data-[state=checked]:before:bg-primary/10!',
        group: 'space-y-1',
        viewport: 'divide-y-0',
        leadingIcon: 'size-4!',
        trailingIcon: 'size-4!',
      },
    },
    selectMenu: {
      slots: {
        base: 'w-full cursor-pointer font-mono data-[state=open]:ring-2 data-[state=open]:ring-inset data-[state=open]:ring-primary focus-visible:ring! focus-visible:ring-default!',
        item: 'cursor-pointer items-center data-highlighted:before:bg-elevated! data-[state=checked]:text-primary! data-[state=checked]:before:bg-primary/10!',
        group: 'space-y-1',
        viewport: 'divide-y-0',
        leadingIcon: 'size-4!',
        trailingIcon: 'size-4!',
      },
    },
    switch: {
      slots: {
        base: 'cursor-pointer',
      },
    },
  },
});
