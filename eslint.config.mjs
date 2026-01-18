/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import js from '@eslint/js';
import stylisticPlugin from '@stylistic/eslint-plugin';
import {defineConfig, globalIgnores} from 'eslint/config';
import importPlugin from 'eslint-plugin-import';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import localPlugin from './scripts/eslint_rules/local-plugin.js';

export default defineConfig([
  globalIgnores([
    '**/node_modules',
    '**/build/',
    '**/data/',
    '**/packages/',
    'scripts/*.mjs',
  ]),
  importPlugin.flatConfigs.typescript,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',

      globals: {
        ...globals.node,
      },

      parserOptions: {
        projectService: {
          allowDefaultProject: ['.prettierrc.cjs', 'eslint.config.mjs'],
        },
      },

      parser: tseslint.parser,
    },

    plugins: {
      js,
      '@local': localPlugin,
      '@typescript-eslint': tseslint.plugin,
      '@stylistic': stylisticPlugin,
    },

    settings: {
      'import/resolver': {
        typescript: true,
      },
    },

    extends: ['js/recommended'],
  },
  tseslint.configs.recommended,
  tseslint.configs.stylistic,
  {
    name: 'TypeScript rules',
    rules: {
      '@local/check-license': 'error',

      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': [
        'error',
        {
          ignoreRestArgs: true,
        },
      ],
      // This optimizes the dependency tracking for type-only files.
      '@typescript-eslint/consistent-type-imports': 'error',
      // So type-only exports get elided.
      '@typescript-eslint/consistent-type-exports': 'error',
      // Prefer interfaces over types for shape like.
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      '@typescript-eslint/array-type': [
        'error',
        {
          default: 'array-simple',
        },
      ],
      '@typescript-eslint/no-floating-promises': 'error',

      'import/order': [
        'error',
        {
          'newlines-between': 'always',

          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
        },
      ],

      'import/no-cycle': [
        'error',
        {
          maxDepth: Infinity,
        },
      ],

      'import/enforce-node-protocol-usage': ['error', 'always'],

      '@stylistic/function-call-spacing': 'error',
      '@stylistic/semi': 'error',
    },
  },
  {
    name: 'Tests',
    files: ['**/*.test.ts'],
    rules: {
      // With the Node.js test runner, `describe` and `it` are technically
      // promises, but we don't need to await them.
      '@typescript-eslint/no-floating-promises': 'off',
    },
  },
  {
    name: 'Legacy code - relaxed rules',
    files: [
      'src/browser*.ts',
      'src/graceful.ts',
      'src/main.ts',
      'src/profile-resolver.ts',
      'src/project-detector.ts',
      'src/stable-identity.ts',
      'src/startup-check.ts',
      'src/system-profile.ts',
      'src/selectors/**/*.ts',
      'src/tools/chatgpt-web.ts',
      'src/tools/gemini-web.ts',
      'src/tools/diagnose-ui.ts',
      'src/tools/iframe-popup-tools.ts',
      'src/tools/pages.ts',
      'src/tools/script.ts',
      'tests/**/*.ts',
      'scripts/**/*.ts',
    ],
    rules: {
      // Legacy code uses `any` extensively - will be fixed incrementally
      '@typescript-eslint/no-explicit-any': 'warn',
      // Legacy code has some unused vars that will be cleaned up
      '@typescript-eslint/no-unused-vars': 'warn',
      // Legacy code has some empty functions
      '@typescript-eslint/no-empty-function': 'warn',
      // Legacy code has some case block declarations
      'no-case-declarations': 'warn',
    },
  },
]);
