/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const DISPOSABLE_HELPERS = new Set(['createTempDir', 'createTempFile']);
const FORBIDDEN_TEMP_CALLS = new Set(['mkdtemp', 'mkdtempSync']);

function getCalleeName(callee) {
  if (callee.type === 'Identifier') {
    return callee.name;
  }
  if (
    callee.type === 'MemberExpression' &&
    callee.property.type === 'Identifier'
  ) {
    return callee.property.name;
  }
  return null;
}

export default {
  name: 'enforce-using',
  meta: {
    type: 'problem',
    fixable: 'code',
    docs: {
      description:
        'Enforce `using` declarations for temporary file/directory helpers and disallow raw mkdtemp calls in tests.',
    },
    schema: [],
    messages: {
      requireUsing:
        'Use a `using` declaration with `{{name}}` so temporary resources are automatically disposed.',
      noMkdtemp:
        'Do not use `{{name}}` directly in tests. Use `using dir = createTempDir(...)` from tests/utils.ts instead.',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        const calleeName = getCalleeName(node.callee);
        if (!calleeName) {
          return;
        }

        if (FORBIDDEN_TEMP_CALLS.has(calleeName)) {
          context.report({
            node,
            messageId: 'noMkdtemp',
            data: {name: calleeName},
          });
          return;
        }

        if (DISPOSABLE_HELPERS.has(calleeName)) {
          const expr =
            node.parent?.type === 'AwaitExpression' ? node.parent : node;
          const declarator = expr.parent;
          const declaration = declarator?.parent;

          const isUsing =
            declarator?.type === 'VariableDeclarator' &&
            declarator.init === expr &&
            declaration?.type === 'VariableDeclaration' &&
            (declaration.kind === 'using' ||
              declaration.kind === 'await using');

          if (!isUsing) {
            context.report({
              node,
              messageId: 'requireUsing',
              data: {name: calleeName},
              fix(fixer) {
                if (
                  declarator?.type === 'VariableDeclarator' &&
                  declaration?.type === 'VariableDeclaration' &&
                  declaration.declarations.length === 1 &&
                  (declaration.kind === 'const' || declaration.kind === 'let')
                ) {
                  const sourceCode =
                    context.sourceCode || context.getSourceCode();
                  const kindToken = sourceCode.getFirstToken(declaration);
                  if (kindToken) {
                    return fixer.replaceText(kindToken, 'using');
                  }
                }
                return null;
              },
            });
          }
        }
      },
    };
  },
};
