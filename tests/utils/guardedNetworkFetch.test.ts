/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import {afterEach, describe, it} from 'node:test';

import sinon from 'sinon';

import {CdpCDPSession} from '../../src/third_party/index.js';
import type {Context} from '../../src/tools/ToolDefinition.js';
import {installGuardedNetworkFetch} from '../../src/utils/guardedNetworkFetch.js';

function makeContext(options: {
  hasGuardrail: boolean;
  validate?: (url: URL) => void;
}): Context {
  return {
    hasNetworkBlockOrAllowlist: () => options.hasGuardrail,
    validateUrlForGuardedFetch:
      options.validate ??
      (() => {
        // no-op: no per-hop validation needed for this test.
      }),
  } as unknown as Context;
}

describe('guardedNetworkFetch', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('installs a no-op restore and leaves the prototype untouched when no guardrail is configured', () => {
    const before = CdpCDPSession.prototype.send;
    const restore = installGuardedNetworkFetch(
      makeContext({hasGuardrail: false}),
    );
    assert.strictEqual(CdpCDPSession.prototype.send, before);
    restore();
    assert.strictEqual(CdpCDPSession.prototype.send, before);
  });

  it('replaces and restores CdpCDPSession.prototype.send when a guardrail is configured', () => {
    const before = CdpCDPSession.prototype.send;
    const restore = installGuardedNetworkFetch(
      makeContext({hasGuardrail: true}),
    );
    assert.notStrictEqual(CdpCDPSession.prototype.send, before);
    restore();
    assert.strictEqual(CdpCDPSession.prototype.send, before);
  });

  it('fetches an allowed resource and returns a readable stream handle', async () => {
    sinon.stub(globalThis, 'fetch').resolves({
      status: 200,
      headers: new Headers(),
      text: async () => 'robots content',
    } as Response);

    const restore = installGuardedNetworkFetch(
      makeContext({hasGuardrail: true}),
    );
    try {
      const loadResult = (await CdpCDPSession.prototype.send.call(
        {},
        'Network.loadNetworkResource',
        {url: 'https://example.com/robots.txt', options: {disableCache: true, includeCredentials: true}} as never,
      )) as {resource: {success: boolean; httpStatusCode: number; stream: string}};
      assert.strictEqual(loadResult.resource.success, true);
      assert.strictEqual(loadResult.resource.httpStatusCode, 200);

      const ioResult = (await CdpCDPSession.prototype.send.call(
        {},
        'IO.read',
        {handle: loadResult.resource.stream},
      )) as {data: string; eof: boolean};
      assert.strictEqual(ioResult.data, 'robots content');
      assert.strictEqual(ioResult.eof, true);
    } finally {
      restore();
    }
  });

  it('validates every redirect hop and rejects a disallowed destination without following it', async () => {
    const fetchStub = sinon.stub(globalThis, 'fetch');
    fetchStub.onCall(0).resolves({
      status: 302,
      headers: new Headers({location: 'https://excluded.example/robots.txt'}),
      text: async () => '',
    } as Response);

    const seenUrls: string[] = [];
    const restore = installGuardedNetworkFetch(
      makeContext({
        hasGuardrail: true,
        validate: url => {
          seenUrls.push(url.href);
          if (url.hostname === 'excluded.example') {
            throw new Error(`Not allowed: ${url}`);
          }
        },
      }),
    );
    try {
      const loadResult = (await CdpCDPSession.prototype.send.call(
        {},
        'Network.loadNetworkResource',
        {url: 'https://allowed.example/robots.txt', options: {disableCache: true, includeCredentials: true}} as never,
      )) as {resource: {success: boolean}};

      assert.strictEqual(loadResult.resource.success, false);
      assert.deepStrictEqual(seenUrls, [
        'https://allowed.example/robots.txt',
        'https://excluded.example/robots.txt',
      ]);
      // Only the redirecting (allowed) origin was actually fetched -- the
      // disallowed destination must never receive a real request.
      assert.strictEqual(fetchStub.callCount, 1);
    } finally {
      restore();
    }
  });

  it('passes every non-intercepted call through to the pre-install implementation', async () => {
    // Stub the prototype first so installGuardedNetworkFetch captures this
    // stub as "original" -- proves the shim forwards, rather than swallows,
    // anything it doesn't specifically own (R5): an unrelated CDP method,
    // and an IO.read for a handle the shim never minted.
    const preInstallSend = sinon
      .stub(CdpCDPSession.prototype, 'send')
      .resolves({unrelated: true} as never);

    const restore = installGuardedNetworkFetch(
      makeContext({hasGuardrail: true}),
    );
    try {
      const pageResult = await CdpCDPSession.prototype.send.call(
        {},
        'Page.getFrameTree',
        {},
      );
      assert.deepStrictEqual(pageResult, {unrelated: true});

      const ioResult = await CdpCDPSession.prototype.send.call({}, 'IO.read', {
        handle: 'not-a-guarded-handle',
      });
      assert.deepStrictEqual(ioResult, {unrelated: true});

      sinon.assert.calledTwice(preInstallSend);
    } finally {
      restore();
    }
  });
});
