/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Assertion helpers for data-driven MCP tool tests.
 */

import {expect} from 'vitest';
import type {
  FieldAssertion,
  ToolAssertions,
  ParsedToolResult,
} from './types.js';

/**
 * Get a nested value from an object using dot notation.
 * @example getNestedValue({a: {b: 1}}, 'a.b') => 1
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
 * Assert a single field against its assertion.
 */
export function assertField(
  value: unknown,
  assertion: FieldAssertion,
  path: string,
): void {
  // Check existence
  if (assertion.exists === true) {
    expect(value, `Field '${path}' should exist`).not.toBeUndefined();
  } else if (assertion.exists === false) {
    expect(value, `Field '${path}' should not exist`).toBeUndefined();
    return; // If field shouldn't exist, skip other assertions
  }

  // Check exact value
  if (assertion.equals !== undefined) {
    expect(value, `Field '${path}' should equal expected value`).toEqual(assertion.equals);
  }

  // Check type
  if (assertion.type !== undefined) {
    if (assertion.type === 'array') {
      expect(Array.isArray(value), `Field '${path}' should be an array`).toBe(true);
    } else if (assertion.type === 'null') {
      expect(value, `Field '${path}' should be null`).toBeNull();
    } else {
      expect(typeof value, `Field '${path}' should be type '${assertion.type}'`).toBe(assertion.type);
    }
  }

  // Check numeric bounds
  if (assertion.gte !== undefined) {
    expect(
      typeof value === 'number' && value >= assertion.gte,
      `Field '${path}' should be >= ${assertion.gte}, got ${value}`,
    ).toBe(true);
  }

  if (assertion.lte !== undefined) {
    expect(
      typeof value === 'number' && value <= assertion.lte,
      `Field '${path}' should be <= ${assertion.lte}, got ${value}`,
    ).toBe(true);
  }

  // Check length
  if (assertion.minLength !== undefined) {
    const len = getLength(value);
    expect(
      len !== undefined && len >= assertion.minLength,
      `Field '${path}' should have length >= ${assertion.minLength}, got ${len}`,
    ).toBe(true);
  }

  if (assertion.maxLength !== undefined) {
    const len = getLength(value);
    expect(
      len !== undefined && len <= assertion.maxLength,
      `Field '${path}' should have length <= ${assertion.maxLength}, got ${len}`,
    ).toBe(true);
  }

  // Check regex pattern
  if (assertion.matches !== undefined) {
    const pattern =
      typeof assertion.matches === 'string'
        ? new RegExp(assertion.matches)
        : assertion.matches;

    expect(
      typeof value === 'string' && pattern.test(value),
      `Field '${path}' should match pattern ${pattern}, got '${value}'`,
    ).toBe(true);
  }

  // Check array contains
  if (assertion.contains !== undefined) {
    expect(
      Array.isArray(value) && value.includes(assertion.contains),
      `Field '${path}' should contain ${JSON.stringify(assertion.contains)}`,
    ).toBe(true);
  }

  // Check minimum items
  if (assertion.minItems !== undefined) {
    expect(
      Array.isArray(value) && value.length >= assertion.minItems,
      `Field '${path}' should have >= ${assertion.minItems} items, got ${Array.isArray(value) ? value.length : 'not an array'}`,
    ).toBe(true);
  }
}

/**
 * Get the length of a string or array.
 */
function getLength(value: unknown): number | undefined {
  if (typeof value === 'string' || Array.isArray(value)) {
    return value.length;
  }
  return undefined;
}

/**
 * Assert a tool result against the full set of assertions.
 */
export function assertToolResult(
  result: ParsedToolResult,
  assertions: ToolAssertions,
): void {
  // Check error status
  if (assertions.isError === true) {
    expect(result.isError, 'Expected tool result to be an error').toBe(true);
  } else if (assertions.isError === false) {
    expect(result.isError, 'Expected tool result to NOT be an error').toBe(false);
  }

  // Check error message content
  if (assertions.errorContains && result.isError) {
    expect(
      result.errorMessage,
      `Error message should contain '${assertions.errorContains}'`,
    ).toContain(assertions.errorContains);
  }

  // Check field assertions
  if (assertions.fields) {
    // Determine the object to check fields on
    const target = result.json ?? result.text;

    for (const [path, fieldAssertion] of Object.entries(assertions.fields)) {
      const value = getNestedValue(target, path);
      assertField(value, fieldAssertion, path);
    }
  }

  // Check text contains
  if (assertions.contains) {
    for (const substring of assertions.contains) {
      expect(
        result.text,
        `Result text should contain '${substring}'`,
      ).toContain(substring);
    }
  }

  // Check text does not contain
  if (assertions.notContains) {
    for (const substring of assertions.notContains) {
      expect(
        result.text,
        `Result text should NOT contain '${substring}'`,
      ).not.toContain(substring);
    }
  }
}

/**
 * Create a simple field assertion for common patterns.
 */
export const field = {
  /** Field must exist */
  exists: (): FieldAssertion => ({exists: true}),

  /** Field must not exist */
  notExists: (): FieldAssertion => ({exists: false}),

  /** Field must equal exact value */
  equals: (value: unknown): FieldAssertion => ({exists: true, equals: value}),

  /** Field must be a string */
  isString: (): FieldAssertion => ({exists: true, type: 'string'}),

  /** Field must be a number */
  isNumber: (): FieldAssertion => ({exists: true, type: 'number'}),

  /** Field must be a boolean */
  isBoolean: (): FieldAssertion => ({exists: true, type: 'boolean'}),

  /** Field must be an array */
  isArray: (minItems?: number): FieldAssertion => ({
    exists: true,
    type: 'array',
    ...(minItems !== undefined ? {minItems} : {}),
  }),

  /** Field must be >= value */
  gte: (value: number): FieldAssertion => ({exists: true, type: 'number', gte: value}),

  /** Field must be <= value */
  lte: (value: number): FieldAssertion => ({exists: true, type: 'number', lte: value}),

  /** Field must match regex */
  matches: (pattern: string | RegExp): FieldAssertion => ({exists: true, matches: pattern}),

  /** String must have minimum length */
  minLength: (len: number): FieldAssertion => ({exists: true, minLength: len}),
};
