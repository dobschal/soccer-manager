import js from '@eslint/js'
import globals from 'globals'
import sortClassMembers from 'eslint-plugin-sort-class-members'

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        Chart: 'readonly'
      }
    },
    plugins: {
      'sort-class-members': sortClassMembers
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'indent': ['error', 2, { SwitchCase: 1 }],
      'no-multiple-empty-lines': ['error', { max: 1 }],
      'sort-class-members/sort-class-members': ['error', {
        order: [
          { name: 'constructor', type: 'method' },
          { name: 'load', type: 'method' },
          { name: 'template', kind: 'get' },
          { name: 'events', kind: 'get' },
          { name: 'serverEvents', kind: 'get' },
          { name: 'onMounted', type: 'method' },
          { name: 'onUpdate', type: 'method' },
          { name: 'onQueryChanged', type: 'method' },
          { name: 'onDestroy', type: 'method' },
          '[everything-else]'
        ],
        accessorPairPositioning: 'getThenSet'
      }]
    }
  },
  {
    ignores: ['node_modules/**', 'client/lib/chart.js', 'client/vendor/**']
  }
]
