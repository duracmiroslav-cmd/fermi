// @ts-check
import stylistic from '@stylistic/eslint-plugin';
import importPlugin from 'eslint-plugin-import-x';
import pluginVue from 'eslint-plugin-vue';
import tseslint from 'typescript-eslint';

export default [
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  stylistic.configs.customize({
    braceStyle: '1tbs',
    jsx:        true,
    semi:       true,
  }),
  {
    ignores: ['.nuxt/**', '.output/**', '.claude/**', '**/*.d.ts', 'supabase/**', 'app/types/database.types.ts'],
  },
  {
    files:           ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
  {
    plugins: {
      import: importPlugin,
    },
    rules: {
      '@stylistic/key-spacing': ['error', {
        align: 'value',
      }],
      '@stylistic/no-multi-spaces': ['error', {
        exceptions: { Property: true, TSPropertySignature: true, TSTypeAnnotation: true },
      }],
      '@stylistic/object-curly-newline': ['error', {
        consistent: true,
      }],
      '@typescript-eslint/no-unused-vars': ['error', {
        ignoreRestSiblings: true,
      }],
      'arrow-body-style': ['error', 'as-needed'],
      'curly':            ['error', 'multi-line'],
      'dot-notation':     'error',
      'func-style':       ['error', 'expression', {
        allowArrowFunctions: true,
      }],
      'import/order': [
        'error',
        {
          'alphabetize': {
            order: 'asc',
          },
          'groups':           ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'named':            true,
          'newlines-between': 'never',
          'pathGroups':       [{
            pattern: '~/**', group: 'internal',
          }],
        },
      ],
      'no-console': ['warn', {
        allow: ['warn', 'error', 'debug'],
      }],
      'no-dupe-keys':         'error',
      'no-lonely-if':         'error',
      'no-negated-condition': 'error',
      'no-useless-rename':    'error',
      'object-shorthand':     'error',
      'prefer-const':         ['error', {
        destructuring: 'any', ignoreReadBeforeAssign: false,
      }],
      'require-await': 'error',
      'sort-imports':  ['error', {
        ignoreDeclarationSort: true,
      }],
      'switch-colon-spacing':      'error',
      'vue/array-bracket-newline': ['error', 'consistent'],
      'vue/array-bracket-spacing': 'error',
      'vue/array-element-newline': ['error', 'consistent'],
      'vue/arrow-spacing':         'error',
      'vue/block-spacing':         'error',
      'vue/brace-style':           ['error', '1tbs', {
        allowSingleLine: true,
      }],
      'vue/camelcase':                 'error',
      'vue/comma-dangle':              ['error', 'always-multiline'],
      'vue/comma-spacing':             'error',
      'vue/dot-location':              ['error', 'property'],
      'vue/dot-notation':              'error',
      'vue/first-attribute-linebreak': ['error', {
        singleline: 'beside', multiline: 'below',
      }],
      'vue/func-call-spacing':       'error',
      'vue/html-indent':             ['error', 2],
      'vue/key-spacing':             'error',
      'vue/keyword-spacing':         'error',
      'vue/max-attributes-per-line': ['error', {
        singleline: {
          max: 1,
        }, multiline: {
          max: 1,
        },
      }],
      'vue/multi-word-component-names': 'off',
      'vue/no-constant-condition':      'error',
      'vue/no-empty-pattern':           'error',
      'vue/no-irregular-whitespace':    'error',
      'vue/no-multiple-template-root':  'off',
      'vue/no-negated-condition':       'error',
      'vue/no-negated-v-if-condition':  'error',
      'vue/no-sparse-arrays':           'error',
      'vue/no-template-shadow':         'off',
      'vue/no-useless-concat':          'error',
      'vue/object-curly-newline':       ['error', {
        consistent: true,
      }],
      'vue/object-curly-spacing':    ['error', 'always'],
      'vue/object-property-newline': ['error', {
        allowAllPropertiesOnSameLine: true,
      }],
      'vue/object-shorthand':       'error',
      'vue/prefer-template':        'error',
      'vue/quote-props':            ['error', 'consistent-as-needed'],
      'vue/space-in-parens':        'error',
      'vue/space-infix-ops':        'error',
      'vue/space-unary-ops':        'error',
      'vue/template-curly-spacing': 'error',
      'vue/valid-v-slot':           ['error', {
        allowModifiers: true,
      }],
    },
  },
];
