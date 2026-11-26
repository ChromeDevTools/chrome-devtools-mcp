/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Model APIs reject long function names: OpenAI and Anthropic allow at most 64
// characters. MCP clients may shorten names that exceed the limit, but a tool
// name longer than that can never be sent unchanged. See also b/590083070
// (internal).
const DEFAULT_MAX_LENGTH = 64;

const TOOL_DEFINERS = new Set([
  'defineTool',
  'definePageTool',
  'defineBrowserlessTool',
]);

const TOOL_NAME_CONSTANT = /_TOOL_NAME$/;

function isStringLiteral(node) {
  return node?.type === 'Literal' && typeof node.value === 'string';
}

/**
 * Returns the object literal a tool factory returns, for both
 * `() => ({...})` and `() => { return {...}; }`.
 */
function getReturnedObject(factory) {
  if (
    factory?.type !== 'ArrowFunctionExpression' &&
    factory?.type !== 'FunctionExpression'
  ) {
    return undefined;
  }
  if (factory.body.type === 'ObjectExpression') {
    return factory.body;
  }
  if (factory.body.type !== 'BlockStatement') {
    return undefined;
  }
  for (const statement of factory.body.body) {
    if (
      statement.type === 'ReturnStatement' &&
      statement.argument?.type === 'ObjectExpression'
    ) {
      return statement.argument;
    }
  }
  return undefined;
}

function getNameProperty(object) {
  return object.properties.find(
    property =>
      property.type === 'Property' &&
      !property.computed &&
      ((property.key.type === 'Identifier' && property.key.name === 'name') ||
        (isStringLiteral(property.key) && property.key.value === 'name')),
  );
}

/**
 * Resolves an identifier to the string literal it is initialized with, if it
 * is a `const` declared in the same file.
 */
function resolveConstString(sourceCode, identifier) {
  let scope = sourceCode.getScope(identifier);
  while (scope) {
    const variable = scope.set.get(identifier.name);
    if (variable) {
      for (const def of variable.defs) {
        if (
          def.type === 'Variable' &&
          def.parent.kind === 'const' &&
          isStringLiteral(def.node.init)
        ) {
          return def.node.init;
        }
      }
      return undefined;
    }
    scope = scope.upper;
  }
  return undefined;
}

export default {
  name: 'max-tool-name-length',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Limit the length of MCP tool names so that client-prefixed names stay within the 64-character limit of model APIs.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          max: {type: 'integer', minimum: 1},
        },
        additionalProperties: false,
      },
    ],
    messages: {
      tooLong:
        'Tool name "{{name}}" is {{length}} characters long; the maximum is {{max}}. MCP clients prefix tool names (for example `mcp_<plugin>_<server>_<tool>`), and model APIs reject names longer than 64 characters.',
    },
  },
  defaultOptions: [{max: DEFAULT_MAX_LENGTH}],
  create(context) {
    const max = context.options[0]?.max ?? DEFAULT_MAX_LENGTH;
    const sourceCode = context.sourceCode;
    const checked = new Set();

    function check(literal) {
      if (checked.has(literal)) {
        return;
      }
      checked.add(literal);
      if (literal.value.length > max) {
        context.report({
          node: literal,
          messageId: 'tooLong',
          data: {
            name: literal.value,
            length: literal.value.length,
            max,
          },
        });
      }
    }

    return {
      CallExpression(node) {
        if (
          node.callee.type !== 'Identifier' ||
          !TOOL_DEFINERS.has(node.callee.name)
        ) {
          return;
        }
        const object = getReturnedObject(node.arguments[0]);
        if (!object) {
          return;
        }
        const value = getNameProperty(object)?.value;
        if (isStringLiteral(value)) {
          check(value);
        } else if (value?.type === 'Identifier') {
          // Names imported from another module are checked where they are
          // declared, via the `*_TOOL_NAME` constant check below.
          const literal = resolveConstString(sourceCode, value);
          if (literal) {
            check(literal);
          }
        }
      },
      VariableDeclarator(node) {
        if (
          node.id.type === 'Identifier' &&
          TOOL_NAME_CONSTANT.test(node.id.name) &&
          isStringLiteral(node.init)
        ) {
          check(node.init);
        }
      },
    };
  },
};
