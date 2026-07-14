/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {replaceHtmlElementsWithUids} from '../src/McpPage.js';
import type {JSONSchema7Definition} from '../src/third_party/index.js';

describe('replaceHtmlElementsWithUids', () => {
  it('does nothing for boolean schemas', () => {
    const schemaTrue: JSONSchema7Definition = true;
    const schemaFalse: JSONSchema7Definition = false;

    replaceHtmlElementsWithUids(schemaTrue);
    replaceHtmlElementsWithUids(schemaFalse);

    assert.strictEqual(schemaTrue, true);
    assert.strictEqual(schemaFalse, false);
  });

  it('replaces HTMLElement type with uid string', () => {
    const schema: JSONSchema7Definition = {
      type: 'object',
      properties: {
        foo: {type: 'string'},
        bar: {type: 'number'},
      },
      required: ['foo'],
    };
    Object.assign(schema, {'x-mcp-type': 'HTMLElement'});

    replaceHtmlElementsWithUids(schema);

    if (typeof schema === 'object') {
      assert.deepStrictEqual(schema.properties, {
        uid: {type: 'string'},
      });
      assert.deepStrictEqual(schema.required, ['uid']);
    } else {
      assert.fail('Schema should be an object');
    }
  });

  it('does not replace if x-mcp-type is not HTMLElement', () => {
    const schema: JSONSchema7Definition = {
      type: 'object',
      properties: {
        foo: {type: 'string'},
      },
    };
    Object.assign(schema, {'x-mcp-type': 'OtherType'});

    replaceHtmlElementsWithUids(schema);

    if (typeof schema === 'object') {
      assert.deepStrictEqual(schema.properties, {
        foo: {type: 'string'},
      });
      assert.strictEqual(schema.required, undefined);
    } else {
      assert.fail('Schema should be an object');
    }
  });

  it('recurses into nested properties', () => {
    const schema: JSONSchema7Definition = {
      type: 'object',
      properties: {
        element: {
          type: 'object',
          properties: {
            foo: {type: 'string'},
          },
        },
        other: {
          type: 'string',
        },
      },
    };
    if (typeof schema === 'object' && schema.properties) {
      Object.assign(schema.properties.element, {'x-mcp-type': 'HTMLElement'});
    }

    replaceHtmlElementsWithUids(schema);

    if (
      typeof schema === 'object' &&
      schema.properties &&
      typeof schema.properties.element === 'object'
    ) {
      const elementSchema = schema.properties.element;
      assert.deepStrictEqual(elementSchema.properties, {
        uid: {type: 'string'},
      });
      assert.deepStrictEqual(elementSchema.required, ['uid']);
    } else {
      assert.fail('Unexpected schema structure');
    }
  });

  it('recurses into array items (single schema object)', () => {
    const schema: JSONSchema7Definition = {
      type: 'array',
      items: {
        type: 'object',
      },
    };
    if (typeof schema === 'object' && typeof schema.items === 'object') {
      Object.assign(schema.items, {'x-mcp-type': 'HTMLElement'});
    }

    replaceHtmlElementsWithUids(schema);

    if (typeof schema === 'object' && typeof schema.items === 'object') {
      const itemsSchema = schema.items;
      if (!Array.isArray(itemsSchema)) {
        assert.deepStrictEqual(itemsSchema.properties, {
          uid: {type: 'string'},
        });
        assert.deepStrictEqual(itemsSchema.required, ['uid']);
      } else {
        assert.fail('items should not be an array in this test case');
      }
    } else {
      assert.fail('Unexpected schema structure');
    }
  });

  it('recurses into array items (array of schemas)', () => {
    const schema: JSONSchema7Definition = {
      type: 'array',
      items: [
        {
          type: 'object',
        },
        {
          type: 'string',
        },
      ],
    };
    if (typeof schema === 'object' && Array.isArray(schema.items)) {
      Object.assign(schema.items[0], {'x-mcp-type': 'HTMLElement'});
    }

    replaceHtmlElementsWithUids(schema);

    if (typeof schema === 'object' && Array.isArray(schema.items)) {
      const firstItem = schema.items[0];
      if (typeof firstItem === 'object') {
        assert.deepStrictEqual(firstItem.properties, {
          uid: {type: 'string'},
        });
        assert.deepStrictEqual(firstItem.required, ['uid']);
      } else {
        assert.fail('First item should be an object');
      }

      const secondItem = schema.items[1];
      if (typeof secondItem === 'object') {
        assert.strictEqual(secondItem.properties, undefined);
      } else {
        assert.fail('Second item should be an object');
      }
    } else {
      assert.fail('Unexpected schema structure');
    }
  });

  it('recurses into anyOf', () => {
    const schema: JSONSchema7Definition = {
      anyOf: [
        {
          type: 'object',
        },
        {
          type: 'string',
        },
      ],
    };
    if (typeof schema === 'object' && Array.isArray(schema.anyOf)) {
      Object.assign(schema.anyOf[0], {'x-mcp-type': 'HTMLElement'});
    }

    replaceHtmlElementsWithUids(schema);

    if (typeof schema === 'object' && Array.isArray(schema.anyOf)) {
      const firstItem = schema.anyOf[0];
      if (typeof firstItem === 'object') {
        assert.deepStrictEqual(firstItem.properties, {
          uid: {type: 'string'},
        });
      } else {
        assert.fail('First item should be an object');
      }
    } else {
      assert.fail('Unexpected schema structure');
    }
  });

  it('recurses into allOf', () => {
    const schema: JSONSchema7Definition = {
      allOf: [
        {
          type: 'object',
        },
      ],
    };
    if (typeof schema === 'object' && Array.isArray(schema.allOf)) {
      Object.assign(schema.allOf[0], {'x-mcp-type': 'HTMLElement'});
    }

    replaceHtmlElementsWithUids(schema);

    if (typeof schema === 'object' && Array.isArray(schema.allOf)) {
      const firstItem = schema.allOf[0];
      if (typeof firstItem === 'object') {
        assert.deepStrictEqual(firstItem.properties, {
          uid: {type: 'string'},
        });
      } else {
        assert.fail('First item should be an object');
      }
    } else {
      assert.fail('Unexpected schema structure');
    }
  });

  it('recurses into oneOf', () => {
    const schema: JSONSchema7Definition = {
      oneOf: [
        {
          type: 'object',
        },
      ],
    };
    if (typeof schema === 'object' && Array.isArray(schema.oneOf)) {
      Object.assign(schema.oneOf[0], {'x-mcp-type': 'HTMLElement'});
    }

    replaceHtmlElementsWithUids(schema);

    if (typeof schema === 'object' && Array.isArray(schema.oneOf)) {
      const firstItem = schema.oneOf[0];
      if (typeof firstItem === 'object') {
        assert.deepStrictEqual(firstItem.properties, {
          uid: {type: 'string'},
        });
      } else {
        assert.fail('First item should be an object');
      }
    } else {
      assert.fail('Unexpected schema structure');
    }
  });
});
