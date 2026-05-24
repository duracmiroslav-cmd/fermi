export default defineAppConfig({
  ui: {
    colors: {
      primary: 'apricot',
      neutral: 'stone',
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
      },
    },
    selectMenu: {
      slots: {
        base: 'w-full cursor-pointer',
      },
    },
    switch: {
      slots: {
        base: 'cursor-pointer',
      },
    },
  },
});
