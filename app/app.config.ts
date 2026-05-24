export default defineAppConfig({
  ui: {
    colors: {
      primary: 'apricot',
      neutral: 'stone',
      success: 'pistachio',
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
