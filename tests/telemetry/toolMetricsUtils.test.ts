/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {
  applyToExistingMetrics,
  generateToolMetrics,
  validateEnumHomogeneity,
} from '../../src/telemetry/toolMetricsUtils.js';
import {zod} from '../../src/third_party/index.js';
import {ToolCategory} from '../../src/tools/categories.js';
import type {ToolDefinition} from '../../src/tools/ToolDefinition.js';

describe('toolMetricsUtils', () => {
  describe('validateEnumHomogeneity', () => {
    it('should return the primitive type of a homogeneous enum', () => {
      const result = validateEnumHomogeneity(['a', 'b', 'c']);
      assert.strictEqual(result, 'string');

      const result2 = validateEnumHomogeneity([1, 2, 3]);
      assert.strictEqual(result2, 'number');
    });

    it('should throw for heterogeneous enum types', () => {
      assert.throws(() => {
        validateEnumHomogeneity(['a', 1, 'c']);
      }, /Heterogeneous enum types found/);
    });
  });

  describe('generateToolMetrics', () => {
    it('should map tools correctly and apply transformations', () => {
      const mockTool: ToolDefinition = {
        name: 'test_tool',
        description: 'test description',
        annotations: {
          category: ToolCategory.INPUT,
          readOnlyHint: true,
        },
        schema: {
          argStr: zod.string(),
          uid: zod.string(), // Should be blocked
        },
        handler: async () => {
          // no-op
        },
      };

      const metrics = generateToolMetrics([mockTool]);
      assert.strictEqual(metrics.length, 1);
      assert.strictEqual(metrics[0].name, 'test_tool');
      assert.strictEqual(metrics[0].args.length, 1); // uid is blocked
      assert.strictEqual(metrics[0].args[0].name, 'argStr_length');
      assert.strictEqual(metrics[0].args[0].argType, 'number');
    });

    it('should handle enums correctly', () => {
      const mockTool: ToolDefinition = {
        name: 'enum_tool',
        description: 'test description',
        annotations: {
          category: ToolCategory.INPUT,
          readOnlyHint: true,
        },
        schema: {
          argEnum: zod.enum(['foo', 'bar']),
        },
        handler: async () => {
          // no-op
        },
      };

      const metrics = generateToolMetrics([mockTool]);
      assert.strictEqual(metrics.length, 1);
      assert.strictEqual(metrics[0].args[0].name, 'argEnum');
      assert.strictEqual(metrics[0].args[0].argType, 'string');
    });
  });

  describe('applyToExistingMetrics', () => {
    it('should return the same metrics if existing and update are the same', () => {
      const existing = [{name: 'foo', args: []}];
      const update = [{name: 'foo', args: []}];
      const result = applyToExistingMetrics(existing, update);
      const expected = [{name: 'foo', args: []}];
      assert.deepStrictEqual(result, expected);
    });

    it('should append new entries to the end of the array', () => {
      const existing = [{name: 'foo', args: []}];
      const update = [
        {name: 'foo', args: []},
        {name: 'bar', args: []},
      ];
      const result = applyToExistingMetrics(existing, update);
      const expected = [
        {name: 'foo', args: []},
        {name: 'bar', args: []},
      ];
      assert.deepStrictEqual(result, expected);
    });

    it('should mark missing entries as deprecated and preserve their order', () => {
      const existing = [
        {name: 'foo', args: []},
        {name: 'bar', args: []},
      ];
      const update = [{name: 'foo', args: []}];
      const result = applyToExistingMetrics(existing, update);
      const expected = [
        {name: 'foo', args: []},
        {name: 'bar', args: [], isDeprecated: true},
      ];
      assert.deepStrictEqual(result, expected);
    });

    it('should handle adding new entries and deprecating old ones simultaneously', () => {
      const existing = [
        {name: 'foo', args: []},
        {name: 'bar', args: []},
      ];
      const update = [
        {name: 'bar', args: []},
        {name: 'baz', args: []},
      ];
      const result = applyToExistingMetrics(existing, update);
      const expected = [
        {name: 'foo', args: [], isDeprecated: true},
        {name: 'bar', args: []},
        {name: 'baz', args: []},
      ];
      assert.deepStrictEqual(result, expected);
    });

    it('should append new arguments to the back', () => {
      const existing = [
        {name: 'foo', args: [{name: 'arg_a', argType: 'string'}]},
      ];
      const update = [
        {
          name: 'foo',
          args: [
            {name: 'arg_a', argType: 'string'},
            {name: 'arg_b', argType: 'string'},
          ],
        },
      ];
      const result = applyToExistingMetrics(existing, update);
      const expected = [
        {
          name: 'foo',
          args: [
            {name: 'arg_a', argType: 'string'},
            {name: 'arg_b', argType: 'string'},
          ],
        },
      ];
      assert.deepStrictEqual(result, expected);
    });

    it('should mark removed arguments as deprecated', () => {
      const existing = [
        {
          name: 'foo',
          args: [
            {name: 'arg_a', argType: 'string'},
            {name: 'arg_b', argType: 'string'},
          ],
        },
      ];
      const update = [
        {name: 'foo', args: [{name: 'arg_a', argType: 'string'}]},
      ];
      const result = applyToExistingMetrics(existing, update);
      const expected = [
        {
          name: 'foo',
          args: [
            {name: 'arg_a', argType: 'string'},
            {name: 'arg_b', argType: 'string', isDeprecated: true},
          ],
        },
      ];
      assert.deepStrictEqual(result, expected);
    });

    it('should not change args if they are the same', () => {
      const existing = [
        {name: 'foo', args: [{name: 'arg_a', argType: 'string'}]},
      ];
      const update = [
        {name: 'foo', args: [{name: 'arg_a', argType: 'string'}]},
      ];
      const result = applyToExistingMetrics(existing, update);
      const expected = [
        {name: 'foo', args: [{name: 'arg_a', argType: 'string'}]},
      ];
      assert.deepStrictEqual(result, expected);
    });

    it('should handle adding and removing arguments simultaneously', () => {
      const existing = [
        {
          name: 'foo',
          args: [
            {name: 'arg_a', argType: 'string'},
            {name: 'arg_b', argType: 'string'},
          ],
        },
      ];
      const update = [
        {
          name: 'foo',
          args: [
            {name: 'arg_b', argType: 'string'},
            {name: 'arg_c', argType: 'string'},
          ],
        },
      ];
      const result = applyToExistingMetrics(existing, update);
      const expected = [
        {
          name: 'foo',
          args: [
            {name: 'arg_a', argType: 'string', isDeprecated: true},
            {name: 'arg_b', argType: 'string'},
            {name: 'arg_c', argType: 'string'},
          ],
        },
      ];
      assert.deepStrictEqual(result, expected);
    });

    it('should handle tool and argument changes simultaneously', () => {
      const existing = [
        {name: 'foo', args: [{name: 'arg_a', argType: 'string'}]},
        {name: 'bar', args: []},
      ];
      const update = [
        {name: 'foo', args: [{name: 'arg_b', argType: 'string'}]},
        {name: 'baz', args: []},
      ];
      const result = applyToExistingMetrics(existing, update);
      const expected = [
        {
          name: 'foo',
          args: [
            {name: 'arg_a', argType: 'string', isDeprecated: true},
            {name: 'arg_b', argType: 'string'},
          ],
        },
        {name: 'bar', args: [], isDeprecated: true},
        {name: 'baz', args: []},
      ];
      assert.deepStrictEqual(result, expected);
    });
  });
});
