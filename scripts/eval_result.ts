/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';

export interface CapturedFunctionCall {
  name: string;
  args: Record<string, unknown>;
  isError?: boolean;
}

export function hasMetaFeatureSystemFlag(serverArgs: string[]): boolean {
  return serverArgs.some(
    arg =>
      arg === '--meta-feature-system' ||
      arg === '--meta-feature-system=true' ||
      arg === '--metaFeatureSystem' ||
      arg === '--metaFeatureSystem=true',
  );
}

export class Result {
  private nextCallIndex = 0;
  readonly calls: CapturedFunctionCall[];
  readonly rawCalls: CapturedFunctionCall[];
  readonly serverArgs: string[];
  /** The model's final response text. */
  readonly text: string;

  constructor(calls: CapturedFunctionCall[], serverArgs: string[], text = '') {
    this.rawCalls = calls;
    this.calls = calls.flatMap(call => {
      if (call.isError) {
        return [];
      }
      if (call.name !== 'manage_capabilities') {
        return [call];
      }
      if (call.args.action === 'call' && typeof call.args.tool === 'string') {
        return [
          {
            name: call.args.tool,
            args:
              (call.args.toolArgs as Record<string, unknown> | undefined) ?? {},
          },
        ];
      }
      return [];
    });
    this.serverArgs = serverArgs;
    this.text = text;
  }

  get hasMetaFeatureSystem(): boolean {
    return hasMetaFeatureSystemFlag(this.serverArgs);
  }

  get capabilityCalls(): CapturedFunctionCall[] {
    return this.rawCalls.filter(c => c.name === 'manage_capabilities');
  }

  assertCapabilityEnabled(packId: string): void {
    if (!this.hasMetaFeatureSystem) {
      return;
    }
    const enabled = this.capabilityCalls.some(c => {
      if (c.args.action !== 'enable') {
        return false;
      }
      if (c.args.capability === packId) {
        return true;
      }
      if (
        Array.isArray(c.args.capabilities) &&
        c.args.capabilities.includes(packId)
      ) {
        return true;
      }
      return false;
    });
    assert.ok(
      enabled,
      `Expected capability pack '${packId}' to be enabled via manage_capabilities, got capability calls: ${JSON.stringify(this.capabilityCalls)}`,
    );
  }

  get hasPageIdRouting(): boolean {
    return !this.serverArgs.includes('--no-page-id-routing');
  }

  get remainingCalls(): CapturedFunctionCall[] {
    return this.calls.slice(this.nextCallIndex);
  }

  /**
   * Consumes initial page navigation/setup boilerplate.
   * - Ignores/skips leading or trailing list_pages calls.
   * - Asserts that new_page or navigate_page was called.
   * - Determines the expected pageId.
   * - Returns the active pageId.
   */
  consumePageNavigation(): number | undefined {
    while (this.calls[this.nextCallIndex]?.name === 'list_pages') {
      this.nextCallIndex++;
    }

    const navCall = this.calls[this.nextCallIndex];
    assert.ok(
      navCall &&
        (navCall.name === 'new_page' || navCall.name === 'navigate_page'),
      `Expected navigation call (new_page or navigate_page), but got: ${navCall?.name || 'none'}`,
    );
    this.nextCallIndex++;

    while (this.calls[this.nextCallIndex]?.name === 'list_pages') {
      this.nextCallIndex++;
    }

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

  /**
   * Asserts that the model's response contains every given substring,
   * ignoring case.
   */
  assertTextIncludes(...substrings: string[]): void {
    const textInLowerCase = this.text.toLowerCase();
    for (const substring of substrings) {
      assert.ok(
        textInLowerCase.includes(substring.toLowerCase()),
        `Expected response to mention '${substring}'. Response: ${this.text}`,
      );
    }
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
  /** Extra CLI flags passed to the MCP server (e.g. '--no-page-id-routing'). */
  serverArgs?: string[];
}
