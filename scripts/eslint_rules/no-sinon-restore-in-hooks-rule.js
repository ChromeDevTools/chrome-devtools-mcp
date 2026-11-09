/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const HOOK_NAMES = new Set(['before', 'beforeEach', 'after', 'afterEach']);

function isSinonRestoreCall(node) {
  const {callee} = node;
  return (
    callee.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    callee.object.name === 'sinon' &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'restore' &&
    node.arguments.length === 0
  );
}

function getEnclosingHook(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (
      current.type === 'CallExpression' &&
      current.callee.type === 'Identifier' &&
      HOOK_NAMES.has(current.callee.name)
    ) {
      return current;
    }
  }
  return null;
}

// Returns the node to delete: the whole hook when `sinon.restore()` is its
// only statement, the statement alone otherwise, or null when no safe fix
// exists.
function getRemovalTarget(node, hook) {
  const callback = hook.arguments[0];
  const hookStatement = hook.parent;
  if (
    hook.arguments.length !== 1 ||
    hookStatement?.type !== 'ExpressionStatement' ||
    (callback.type !== 'ArrowFunctionExpression' &&
      callback.type !== 'FunctionExpression')
  ) {
    return null;
  }
  if (callback.body === node) {
    return hookStatement;
  }
  const statement = node.parent;
  if (statement?.type !== 'ExpressionStatement') {
    return null;
  }
  if (
    callback.body.type === 'BlockStatement' &&
    callback.body.body.length === 1 &&
    callback.body.body[0] === statement
  ) {
    return hookStatement;
  }
  return statement;
}

export default {
  name: 'no-sinon-restore-in-hooks',
  meta: {
    type: 'suggestion',
    fixable: 'code',
    docs: {
      description:
        'Disallow `sinon.restore()` in test hooks. tests/setup.ts restores all Sinon fakes after every test.',
    },
    schema: [],
    messages: {
      redundantRestore:
        'Remove `sinon.restore()` from `{{hook}}`. tests/setup.ts already runs it after every test.',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        if (!isSinonRestoreCall(node)) {
          return;
        }
        const hook = getEnclosingHook(node);
        if (!hook) {
          return;
        }
        context.report({
          node,
          messageId: 'redundantRestore',
          data: {hook: hook.callee.name},
          fix(fixer) {
            const target = getRemovalTarget(node, hook);
            return target ? fixer.remove(target) : null;
          },
        });
      },
    };
  },
};
