import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/**',
      '.npm-cache/**',
      '.localnest/**',
      '.claude/**',
      '.claude-flow/**',
      'coverage/**',
      'build/**',
      '.docusaurus/**',
      'localnest-docs/build/**',
      'localnest-docs/.docusaurus/**'
    ]
  },
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node
      }
    },
    rules: {
      'no-console': 'off'
    }
  }
];
