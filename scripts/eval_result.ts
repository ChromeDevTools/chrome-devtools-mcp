/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';

export interface CapturedFunctionCall {
  name: string;
  args: Record<string, unknown>;
}

export class Result {
  private nextCallIndex = 0;
  public readonly calls: CapturedFunctionCall[];
  public readonly serverArgs: string[];

  constructor(calls: CapturedFunctionCall[], serverArgs: string[]) {
    this.calls = calls;
    this.serverArgs = serverArgs;
  }

  get hasPageIdRouting(): boolean {
    return this.serverArgs.includes('--experimental-page-id-routing');
  }

  get remainingCalls(): CapturedFunctionCall[] {
    return this.calls.slice(this.nextCallIndex);
  }

  /**
   * Consumes initial page navigation/setup boilerplate.
   * - Ignores/skips leading list_pages calls.
   * - Asserts that new_page or navigate_page was called.
   * - Determines the expected pageId.
   * - Returns the active pageId.
   */
  consumePageNavigation(): number | undefined {
    if (this.calls[this.nextCallIndex]?.name === 'list_pages') {
      this.nextCallIndex++;
    }

    const navCall = this.calls[this.nextCallIndex];
    assert.ok(
      navCall &&
        (navCall.name === 'new_page' || navCall.name === 'navigate_page'),
      `Expected navigation call (new_page or navigate_page), but got: ${navCall?.name || 'none'}`,
    );
    this.nextCallIndex++;

    const isNewPage = navCall.name === 'new_page';
    let pageId: number | undefined;
    if (this.hasPageIdRouting) {
      pageId = isNewPage ? 2 : 1;
    }

    return pageId;
  }

  /**
   * Asserts that the next call in sequence has the correct name and matches expected arguments.
   * Increments the internal call index.
   */
  assertNextCall(
    name: string,
    expectedArgs?: Record<string, unknown>,
  ): CapturedFunctionCall {
    const call = this.calls[this.nextCallIndex];
    assert.ok(
      call,
      `Expected call at index ${this.nextCallIndex} (name: '${name}') to exist`,
    );
    assert.strictEqual(
      call.name,
      name,
      `Expected call at index ${this.nextCallIndex} to be '${name}', but got '${call.name}'`,
    );

    if (expectedArgs) {
      for (const entry of Object.entries(expectedArgs)) {
        const key = entry[0];
        const value = entry[1];
        assert.deepStrictEqual(
          call.args[key],
          value,
          `Expected argument '${key}' on call '${name}' to be ${JSON.stringify(value)}, got ${JSON.stringify(call.args[key])}`,
        );
      }
    }

    this.nextCallIndex++;
    return call;
  }
}

export interface TestScenario {
  prompt: string;
  maxTurns: number;
  expectations: (result: Result) => void;
  htmlRoute?: {
    path: string;
    htmlContent: string;
  };
  /** Extra CLI flags passed to the MCP server (e.g. '--experimental-page-id-routing'). */
  serverArgs?: string[];
}
