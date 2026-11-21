/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

function isUseFakeTimersCall(node) {
  const {callee} = node;
  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'useFakeTimers'
  );
}

function getPropertyName(prop) {
  if (prop.type !== 'Property' || prop.computed) {
    return null;
  }
  if (prop.key.type === 'Identifier') {
    return prop.key.name;
  }
  if (prop.key.type === 'Literal' && typeof prop.key.value === 'string') {
    return prop.key.value;
  }
  return null;
}

function getStaticStringValue(node) {
  if (!node) {
    return null;
  }
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  if (
    node.type === 'TemplateLiteral' &&
    node.expressions.length === 0 &&
    node.quasis.length === 1
  ) {
    return node.quasis[0].value.cooked;
  }
  return null;
}

export default {
  name: 'require-explicit-fake-timers',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require an explicit non-empty `toFake` list without `nextTick` in `useFakeTimers()` calls.',
    },
    schema: [],
    messages: {
      missingToFake:
        "Pass an explicit non-empty `toFake` array literal to `useFakeTimers()` (for example `{toFake: ['setTimeout', 'clearTimeout']}`). Omitting `toFake` fakes `process.nextTick`, which deadlocks the `node:test` IPC reporter stream.",
      disallowedNextTick:
        'Do not include `nextTick` in `useFakeTimers({toFake: [...]})`. Faking `process.nextTick` deadlocks the `node:test` IPC reporter stream.',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        if (!isUseFakeTimersCall(node)) {
          return;
        }
        const configArg = node.arguments[0];
        if (!configArg || configArg.type !== 'ObjectExpression') {
          context.report({node, messageId: 'missingToFake'});
          return;
        }
        const toFakeProp = configArg.properties.find(
          prop => getPropertyName(prop) === 'toFake',
        );
        if (
          !toFakeProp ||
          toFakeProp.value.type !== 'ArrayExpression' ||
          toFakeProp.value.elements.length === 0
        ) {
          context.report({
            node: toFakeProp ?? configArg,
            messageId: 'missingToFake',
          });
          return;
        }
        for (const element of toFakeProp.value.elements) {
          const timerName = getStaticStringValue(element);
          if (timerName === null) {
            context.report({
              node: element ?? toFakeProp.value,
              messageId: 'missingToFake',
            });
            return;
          }
          if (timerName === 'nextTick') {
            context.report({
              node: element,
              messageId: 'disallowedNextTick',
            });
          }
        }
      },
    };
  },
};
