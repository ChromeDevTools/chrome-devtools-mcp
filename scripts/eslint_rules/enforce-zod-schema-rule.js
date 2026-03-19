/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export default {
  name: 'enforce-zod-schema',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow .nullable() and .object() in tool schemas. Use optional strings to represent complex objects.',
    },
    schema: [],
    messages: {
      noNullable:
        'Do not use .nullable() in tool schemas. Use .optional() instead.',
      noObject:
        'Do not use .object() in tool schemas. Represent complex objects as a short formatted string.',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        if (
          node.callee.type !== 'MemberExpression' ||
          node.callee.property.type !== 'Identifier'
        ) {
          return;
        }

        const methodName = node.callee.property.name;

        // We don't validate that .nullable() is called on a ZodObject
        // specifically - this intentionally catches all .nullable() calls
        // in tool schema files.
        if (methodName === 'nullable') {
          context.report({
            node: node.callee.property,
            messageId: 'noNullable',
          });
        }

        if (methodName === 'object') {
          // Only flag zod.object() calls, not arbitrary .object() calls.
          const obj = node.callee.object;
          if (
            obj.type === 'Identifier' &&
            (obj.name === 'zod' || obj.name === 'z')
          ) {
            context.report({
              node: node.callee.property,
              messageId: 'noObject',
            });
          }
        }
      },
    };
  },
};
