/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Field assertion utilities for JSON output validation.
 * 
 * Supports two modes:
 * 1. Exact matching (default) - raw values are compared for equality
 * 2. Operator matching - use $-prefixed operators for flexible assertions
 * 
 * Only specified fields are checked. Extra fields in the response are ignored.
 */

import {expect} from 'vitest';

/**
 * Operators for flexible assertions (use when exact match isn't possible).
 * Prefix with $ to distinguish from exact values.
 */
interface AssertionOperators {
  $type?: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'null';
  $gte?: number;
  $lte?: number;
  $contains?: unknown;
  $startsWith?: string;
  $endsWith?: string;
  $matches?: string;
  $exists?: boolean;
  $minItems?: number;
  $maxItems?: number;
}

/**
 * Check if a value is an operator object (has $-prefixed keys).
 */
function isOperatorObject(value: unknown): value is AssertionOperators {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every(k => k.startsWith('$'));
}

/**
 * Get nested value from object using dot notation.
 */
export function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  
  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  
  return current;
}

/**
 * Assert a field using operators.
 */
function assertWithOperators(
  actual: unknown,
  operators: AssertionOperators,
  fieldPath: string,
): void {
  // Exists check
  if (operators.$exists === false) {
    expect(actual, `Field '${fieldPath}' should not exist`).toBeUndefined();
    return;
  }
  if (operators.$exists === true) {
    expect(actual, `Field '${fieldPath}' should exist`).not.toBeUndefined();
  }

  // Type check
  if (operators.$type !== undefined) {
    if (operators.$type === 'array') {
      expect(Array.isArray(actual), `Field '${fieldPath}' should be array`).toBe(true);
    } else if (operators.$type === 'null') {
      expect(actual, `Field '${fieldPath}' should be null`).toBeNull();
    } else {
      expect(typeof actual, `Field '${fieldPath}' should be ${operators.$type}`).toBe(operators.$type);
    }
  }

  // Numeric comparisons
  if (operators.$gte !== undefined && typeof actual === 'number') {
    expect(actual >= operators.$gte, `Field '${fieldPath}' should be >= ${operators.$gte}, got ${actual}`).toBe(true);
  }
  if (operators.$lte !== undefined && typeof actual === 'number') {
    expect(actual <= operators.$lte, `Field '${fieldPath}' should be <= ${operators.$lte}, got ${actual}`).toBe(true);
  }

  // Array length
  if (operators.$minItems !== undefined && Array.isArray(actual)) {
    expect(actual.length >= operators.$minItems, `Field '${fieldPath}' should have >= ${operators.$minItems} items`).toBe(true);
  }
  if (operators.$maxItems !== undefined && Array.isArray(actual)) {
    expect(actual.length <= operators.$maxItems, `Field '${fieldPath}' should have <= ${operators.$maxItems} items`).toBe(true);
  }

  // String operations
  if (operators.$startsWith !== undefined && typeof actual === 'string') {
    expect(actual.startsWith(operators.$startsWith), `Field '${fieldPath}' should start with '${operators.$startsWith}'`).toBe(true);
  }
  if (operators.$endsWith !== undefined && typeof actual === 'string') {
    expect(actual.endsWith(operators.$endsWith), `Field '${fieldPath}' should end with '${operators.$endsWith}'`).toBe(true);
  }
  if (operators.$matches !== undefined && typeof actual === 'string') {
    const pattern = new RegExp(operators.$matches);
    expect(pattern.test(actual), `Field '${fieldPath}' should match ${operators.$matches}`).toBe(true);
  }

  // Contains
  if (operators.$contains !== undefined) {
    if (typeof actual === 'string') {
      expect(actual.includes(String(operators.$contains)), `Field '${fieldPath}' should contain '${operators.$contains}'`).toBe(true);
    } else if (Array.isArray(actual)) {
      const found = actual.some(item => JSON.stringify(item) === JSON.stringify(operators.$contains));
      expect(found, `Field '${fieldPath}' should contain ${JSON.stringify(operators.$contains)}`).toBe(true);
    }
  }
}

/**
 * Assert a single field matches the expected value.
 * - Raw values: exact match
 * - Operator objects (with $-prefixed keys): flexible assertions
 */
export function assertFieldValue(
  actual: unknown,
  expected: unknown,
  fieldPath: string,
): void {
  if (isOperatorObject(expected)) {
    assertWithOperators(actual, expected, fieldPath);
  } else {
    // Exact match
    expect(actual, `Field '${fieldPath}' should equal ${JSON.stringify(expected)}`).toEqual(expected);
  }
}

/**
 * Assert JSON output matches expected fields.
 * Only specified fields are checked - extra fields are ignored.
 * 
 * @example
 * // Exact matching
 * assertJsonFields(result, {
 *   totalFiles: 5,
 *   files: ["a.ts", "b.ts"]
 * });
 * 
 * @example
 * // With operators for non-deterministic values
 * assertJsonFields(result, {
 *   totalFiles: 5,
 *   duration: { $gte: 0 }
 * });
 */
export function assertJsonFields(
  actual: unknown,
  expected: Record<string, unknown>,
  prefix: string = '',
): void {
  for (const [fieldPath, expectedValue] of Object.entries(expected)) {
    const fullPath = prefix ? `${prefix}.${fieldPath}` : fieldPath;
    const actualValue = getNestedValue(actual, fieldPath);
    assertFieldValue(actualValue, expectedValue, fullPath);
  }
}

/**
 * Assert text output contains expected strings.
 */
export function assertContains(
  actual: string,
  expected: string[],
): void {
  for (const substring of expected) {
    expect(actual, `Output should contain '${substring}'`).toContain(substring);
  }
}

/**
 * Assert text output does not contain specified strings.
 */
export function assertNotContains(
  actual: string,
  unexpected: string[],
): void {
  for (const substring of unexpected) {
    expect(actual, `Output should NOT contain '${substring}'`).not.toContain(substring);
  }
}

// Legacy export for backwards compatibility
export type FieldAssertion = AssertionOperators;
export const assertField = assertFieldValue;
