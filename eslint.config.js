/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import stylisticPlugin from '@stylistic/eslint-plugin';
import {defineConfig, globalIgnores} from 'eslint/config';
import eslintPlugin from 'eslint-plugin-eslint-plugin';
import importPlugin from 'eslint-plugin-import';
import jsdocPlugin from 'eslint-plugin-jsdoc';
import mochaPlugin from 'eslint-plugin-mocha';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import localPlugin from './scripts/eslint_rules/local-plugin.js';

const RESTRICTED_IMPORT_DEVTOOLS_MCP = {
  regex: '.*devtools-frontend/(?!mcp/mcp.js$).*',
  message:
    'Import only the devtools-frontend code exported via devtools-frontend/mcp/mcp.js',
};
const RESTRICTED_IMPORT_MCP_CLIENT = {
  group: ['@modelcontextprotocol/client', '@modelcontextprotocol/client/*'],
  message:
    'Do not import @modelcontextprotocol/client in src/; it is only for tests and scripts.',
};

export default defineConfig([
  globalIgnores([
    '**/node_modules',
    '**/build/',
    'third_party/devtools-frontend/**',
    'tests/tools/fixtures/',
    'tests/fixtures/',
    'src/third_party/lighthouse-devtools-mcp-bundle.js',
  ]),
  {
    name: 'JavaScript files',
    plugins: {
      '@local': localPlugin,
      '@typescript-eslint': tseslint.plugin,
      '@stylistic': stylisticPlugin,
      '@eslint-plugin': eslintPlugin,
      mocha: mochaPlugin,
      import: importPlugin,
      jsdoc: jsdocPlugin,
    },

    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',

      globals: {
        ...globals.node,
      },
    },

    linterOptions: {
      reportUnusedDisableDirectives: 'error',
      reportUnusedInlineConfigs: 'error',
    },

    settings: {
      'import/resolver': {
        typescript: true,
      },
    },

    rules: {
      // syntax preferences
      '@stylistic/quotes': [
        'error',
        'single',
        {
          avoidEscape: true,
          allowTemplateLiterals: 'always',
        },
      ],

      '@stylistic/semi': 'error',
      '@stylistic/no-extra-semi': 'error',
      '@stylistic/comma-style': ['error', 'last'],
      '@stylistic/comma-dangle': ['error', 'always-multiline'],
      '@stylistic/wrap-iife': ['error', 'inside'],

      '@stylistic/spaced-comment': [
        'error',
        'always',
        {
          markers: ['*'],
        },
      ],

      eqeqeq: 'error',

      'accessor-pairs': [
        'error',
        {
          getWithoutSet: false,
          setWithoutGet: false,
        },
      ],

      curly: 'error',
      '@stylistic/new-parens': 'error',
      '@stylistic/function-call-spacing': 'error',
      '@stylistic/arrow-parens': ['error', 'as-needed'],
      '@stylistic/eol-last': 'error',
      'object-shorthand': ['error', 'properties'],
      'no-useless-rename': 'error',

      // anti-patterns
      'no-caller': 'error',
      'no-case-declarations': 'error',
      'no-cond-assign': 'error',

      'no-console': [
        'error',
        {
          allow: [
            'assert',
            'context',
            'error',
            'timeStamp',
            'time',
            'timeEnd',
            'warn',
          ],
        },
      ],

      'no-debugger': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',

      'no-else-return': [
        'error',
        {
          allowElseIf: false,
        },
      ],

      'no-empty': [
        'error',
        {
          allowEmptyCatch: true,
        },
      ],
      'no-lonely-if': 'error',

      'no-empty-character-class': 'error',
      'no-global-assign': 'error',
      'no-implied-eval': 'error',
      'no-labels': 'error',
      'no-multi-str': 'error',
      'no-object-constructor': 'error',
      'no-octal-escape': 'error',
      'no-self-compare': 'error',
      'no-shadow-restricted-names': 'error',
      'no-unreachable': 'error',
      'no-unsafe-negation': 'error',

      'no-unused-vars': [
        'error',
        {
          args: 'none',
          vars: 'local',
        },
      ],

      'no-var': 'error',
      'no-with': 'error',
      'prefer-const': 'error',
      radix: 'error',
      'valid-typeof': 'error',
      'no-return-assign': ['error', 'always'],
      'no-implicit-coercion': ['error', {allow: ['!!']}],

      'no-array-constructor': 'error',

      // es2015 features
      'require-yield': 'error',
      '@stylistic/template-curly-spacing': ['error', 'never'],

      // file whitespace
      '@stylistic/no-multiple-empty-lines': [
        'error',
        {
          max: 1,
        },
      ],
      '@stylistic/no-mixed-spaces-and-tabs': 'error',
      '@stylistic/no-trailing-spaces': 'error',
      '@stylistic/linebreak-style': ['error', 'unix'],

      /**
       * Disabled, aspirational rules
       */
      '@stylistic/indent': [
        'off',
        2,
        {
          SwitchCase: 1,
          CallExpression: {
            arguments: 2,
          },
          MemberExpression: 2,
        },
      ],

      // brace-style is disabled, as eslint cannot enforce 1tbs as default, but allman for functions
      '@stylistic/brace-style': [
        'off',
        'allman',
        {
          allowSingleLine: true,
        },
      ],

      // key-spacing is disabled, as some objects use value-aligned spacing, some not.
      '@stylistic/key-spacing': [
        'off',
        {
          beforeColon: false,
          afterColon: true,
          align: 'value',
        },
      ],

      '@stylistic/quote-props': ['error', 'as-needed'],

      // no-implicit-globals will prevent accidental globals
      'no-implicit-globals': 'off',
      'no-unused-private-class-members': 'error',
      'no-useless-constructor': 'error',

      // Sort imports first
      'import/first': 'error',
      // Closure does not properly typecheck default exports
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportDefaultDeclaration',
          message:
            'Default exports are not allowed. Use named exports instead.',
        },
      ],
      /**
       * Catch duplicate import paths. For example this would catch the following example:
       * import {Foo} from './foo.js'
       * import * as FooModule from './foo.js'
       **/
      'import/no-duplicates': 'error',
      // Incompatible with ESLint 10 (crashes on removed
      // `sourceCode.getTokenOrCommentAfter`).
      // 'import/order': [
      //   'error',
      //   {
      //     groups: [['builtin', 'external'], 'parent', 'sibling', 'index'],
      //     'newlines-between': 'always',
      //     named: false,
      //     alphabetize: {
      //       order: 'asc',
      //       caseInsensitive: true,
      //     },
      //   },
      // ],
      'import/enforce-node-protocol-usage': ['error', 'always'],

      /**
       * Enforce some consistency and usefulness of JSDoc comments, to make sure
       * we actually benefit from them.
       */
      'jsdoc/check-alignment': 'error',
      'jsdoc/check-tag-names': 'error',
      'jsdoc/empty-tags': 'error',
      'jsdoc/multiline-blocks': 'error',
      'jsdoc/no-bad-blocks': 'error',
      'jsdoc/no-blank-blocks': [
        'error',
        {
          enableFixer: true,
        },
      ],
      'jsdoc/require-asterisk-prefix': 'error',
      'jsdoc/require-param-name': 'error',
      'jsdoc/require-hyphen-before-param-description': ['error', 'never'],
      'jsdoc/sort-tags': 'error',
    },
  },
  {
    name: 'TypeScript files',
    files: ['**/*.ts'],

    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',

      parser: tseslint.parser,
      parserOptions: {
        allowAutomaticSingleRunInference: true,
        projectService: true,
      },
    },

    rules: {
      '@typescript-eslint/array-type': [
        'error',
        {
          default: 'array-simple',
        },
      ],
      '@typescript-eslint/no-explicit-any': [
        'error',
        {
          ignoreRestArgs: true,
        },
      ],

      '@typescript-eslint/explicit-member-accessibility': [
        'error',
        {
          accessibility: 'no-public',
        },
      ],

      // run just the TypeScript unused-vars rule, else we get duplicate errors
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          ignoreUsingDeclarations: true,
        },
      ],

      '@typescript-eslint/no-floating-promises': [
        'error',
        {
          ignoreVoid: true,
        },
      ],

      /**
       * Enforce that enum members are explicitly defined:
       * const enum Foo { A = 'a' } rather than const enum Foo { A }
       */
      '@typescript-eslint/prefer-enum-initializers': 'error',
      /**
       * Ban non-null assertion operator, e.g.:
       * this.foo!.toLowerCase()
       */
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',

      '@typescript-eslint/naming-convention': [
        'error',
        // Forbids interfaces starting with an I prefix.
        {
          selector: 'interface',
          format: ['PascalCase'],

          custom: {
            regex: '^I[A-Z]',
            match: false,
          },
        },
        {
          selector: [
            'function',
            'accessor',
            'method',
            'property',
            'parameterProperty',
          ],
          format: ['camelCase'],
        },
        {
          selector: 'variable',
          format: ['camelCase'],
        },
        {
          // We are using camelCase, PascalCase and UPPER_CASE for top-level constants, allow the for now.
          selector: 'variable',
          modifiers: ['const'],
          format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
        },
        {
          selector: 'classProperty',
          modifiers: ['static', 'readonly'],
          format: ['UPPER_CASE', 'camelCase'],
        },
        {
          selector: 'enumMember',
          format: ['UPPER_CASE'],
        },
        {
          selector: ['typeLike'],
          format: ['PascalCase'],
        },
        {
          selector: 'parameter',
          format: ['camelCase'],
          leadingUnderscore: 'allow',
        },
        {
          // Public methods are currently in transition and may still have leading underscores.
          selector: 'method',
          modifiers: ['public'],
          format: ['camelCase'],
          leadingUnderscore: 'allow',
        },
        {
          selector: 'property',
          modifiers: ['public'],
          format: ['camelCase'],
          leadingUnderscore: 'allow',
        },
        {
          // Object literals may be constructed as arguments to external libraries which follow different styles.
          selector: ['objectLiteralMethod', 'objectLiteralProperty'],
          modifiers: ['public'],
          format: null,
        },
        {
          // Ignore type properties that require quotes
          selector: 'typeProperty',
          format: null,
          modifiers: ['requiresQuotes'],
        },
      ],

      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],

      // Disable eslint base rule
      'no-throw-literal': 'off',
      '@typescript-eslint/only-throw-error': 'error',

      // Disabled this rule while investigating why it creates
      // certain TypeScript compilation errors after fixes
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',

      '@typescript-eslint/consistent-generic-constructors': 'off',

      // This is more performant
      // And should provide better stack trace when debugging
      // see https://v8.dev/blog/fast-async.
      '@typescript-eslint/return-await': ['error', 'always'],

      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          // Change after we add some placeholder for old errors
          minimumDescriptionLength: 0,
          'ts-check': false,
          'ts-expect-error': 'allow-with-description',
          'ts-ignore': true,
          'ts-nocheck': true,
        },
      ],

      // Broke in 8.58.0, waiting for a fix
      // https://github.com/typescript-eslint/typescript-eslint/issues/12204
      '@typescript-eslint/prefer-optional-chain': 'off',

      '@typescript-eslint/no-unsafe-function-type': 'error',

      '@typescript-eslint/no-empty-object-type': [
        'error',
        {
          allowInterfaces: 'with-single-extends',
        },
      ],

      'no-array-constructor': 'off',
      '@typescript-eslint/no-array-constructor': 'error',

      '@typescript-eslint/consistent-indexed-object-style': 'error',

      'no-useless-constructor': 'off',
      '@typescript-eslint/no-useless-constructor': 'error',

      // Disallow redundant (and potentially conflicting) type information
      // within JSDoc comments.
      'jsdoc/no-types': 'error',
      'jsdoc/require-returns-description': 'error',
    },
  },
  {
    name: 'Repository rules',
    rules: {
      '@local/check-license': 'error',

      'import/no-cycle': [
        'error',
        {
          maxDepth: Infinity,
        },
      ],

      'no-restricted-imports': [
        'error',
        {
          patterns: [RESTRICTED_IMPORT_DEVTOOLS_MCP],
        },
      ],
    },
  },
  {
    name: 'Source files',
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowExpressions: true,
          allowConciseArrowFunctionExpressionsStartingWithVoid: true,
          allowIIFEs: true,
        },
      ],
      '@local/no-direct-third-party-imports': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            RESTRICTED_IMPORT_DEVTOOLS_MCP,
            RESTRICTED_IMPORT_MCP_CLIENT,
          ],
        },
      ],
    },
  },
  {
    name: 'Tools definitions',
    files: ['src/tools/**/*.ts'],
    rules: {
      '@local/enforce-zod-schema': 'error',
      '@local/require-parsed-arguments': 'error',
    },
  },
  {
    name: 'Telemetry',
    files: ['src/telemetry/**/*.ts'],
    rules: {
      // Telemetry payloads mirror the snake_case Clearcut schema.
      '@typescript-eslint/naming-convention': 'off',
    },
  },
  {
    name: 'CLI and daemon',
    files: ['src/bin/**/*.ts', 'src/daemon/**/*.ts'],
    rules: {
      // These intentionally print user-facing output to stdout.
      'no-console': 'off',
    },
  },
  {
    name: 'Scripts files',
    files: ['scripts/**/*'],
    rules: {
      'no-console': 'off',
      'no-restricted-syntax': 'off',
    },
  },
  {
    name: 'TypeScript test files',
    files: ['*.test.ts', 'tests/**/*.ts', 'scripts/eslint_rules/tests/**/*'],
    rules: {
      // errors on {describe, it}.only
      'mocha/no-exclusive-tests': 'error',

      'mocha/no-async-suite': 'error',
      'mocha/no-top-level-tests': 'error',
      'mocha/no-nested-tests': 'error',

      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',

      '@typescript-eslint/only-throw-error': [
        'error',
        {
          allow: [
            {
              // Chai AssertionError does not extend Error
              from: 'package',
              package: 'chai',
              name: ['AssertionError'],
            },
          ],
        },
      ],
    },
    settings: {
      mocha: {
        // We use `node:test`, whose functions are imported rather than
        // globals, so register them as `require`-style names.
        additionalCustomNames: [
          {name: 'describe', type: 'suite', interface: 'require'},
          {name: 'suite', type: 'suite', interface: 'require'},
          {name: 'it', type: 'testCase', interface: 'require'},
          {name: 'test', type: 'testCase', interface: 'require'},
          {name: 'before', type: 'hook', interface: 'require'},
          {name: 'after', type: 'hook', interface: 'require'},
          {name: 'beforeEach', type: 'hook', interface: 'require'},
          {name: 'afterEach', type: 'hook', interface: 'require'},
        ],
      },
    },
  },
  {
    name: 'ESLint rules tests',
    files: ['scripts/eslint_rules/tests/**/*'],
    rules: {
      '@eslint-plugin/no-only-tests': 'error',
    },
  },
  {
    name: 'Tests',
    files: ['**/*.test.ts'],
    rules: {
      // With the Node.js test runner, `describe` and `it` are technically
      // promises, but we don't need to await them.
      '@typescript-eslint/no-floating-promises': 'off',
      '@local/enforce-using': 'error',
    },
  },
  {
    name: 'TypeScript type-definitions',
    files: ['**/*.d.ts'],
    rules: {
      // Not a useful rule for .d.ts files where we are
      // representing an existing module.
      'no-restricted-syntax': 'off',
    },
  },
  {
    name: 'Config files',
    files: [
      'eslint.config.js',
      'prettier.config.js',
      'puppeteer.config.js',
      'rollup.config.js',
    ],
    rules: {
      // The config operate on the default export
      // So allow it for them
      'no-restricted-syntax': 'off',
    },
  },
]);
