/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {
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
});
