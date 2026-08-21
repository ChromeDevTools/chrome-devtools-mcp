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

  it('forwards cookies as a Cookie header when includeCredentials is set', async () => {
    const preInstallSend = sinon
      .stub(CdpCDPSession.prototype, 'send')
      .callsFake(async (method: string) => {
        assert.strictEqual(method, 'Network.getCookies');
        return {
          cookies: [
            {name: 'session', value: 'abc123'},
            {name: 'theme', value: 'dark'},
          ],
        } as never;
      });
    const fetchStub = sinon.stub(globalThis, 'fetch').resolves({
      status: 200,
      headers: new Headers(),
      text: async () => 'robots content',
    } as Response);

    const restore = installGuardedNetworkFetch(
      makeContext({hasGuardrail: true}),
    );
    try {
      await CdpCDPSession.prototype.send.call(
        {},
        'Network.loadNetworkResource',
        {
          url: 'https://example.com/robots.txt',
          options: {disableCache: true, includeCredentials: true},
        } as never,
      );

      sinon.assert.calledOnce(fetchStub);
      const fetchOptions = fetchStub.firstCall.args[1] as {
        headers: Record<string, string>;
      };
      assert.strictEqual(fetchOptions.headers['Cookie'], 'session=abc123; theme=dark');
      sinon.assert.calledWith(preInstallSend, 'Network.getCookies', {
        urls: ['https://example.com/robots.txt'],
      });
    } finally {
      restore();
    }
  });

  it('does not forward a Cookie header when includeCredentials is not set', async () => {
    const preInstallSend = sinon.stub(CdpCDPSession.prototype, 'send');
    const fetchStub = sinon.stub(globalThis, 'fetch').resolves({
      status: 200,
      headers: new Headers(),
      text: async () => 'robots content',
    } as Response);

    const restore = installGuardedNetworkFetch(
      makeContext({hasGuardrail: true}),
    );
    try {
      await CdpCDPSession.prototype.send.call(
        {},
        'Network.loadNetworkResource',
        {url: 'https://example.com/robots.txt', options: {}} as never,
      );

      sinon.assert.calledOnce(fetchStub);
      const fetchOptions = fetchStub.firstCall.args[1] as {
        headers: Record<string, string>;
      };
      assert.strictEqual(fetchOptions.headers['Cookie'], undefined);
      sinon.assert.notCalled(preInstallSend);
    } finally {
      restore();
    }
  });

  it('stacks overlapping installs safely: only the last restore unpatches the prototype, and every active guardrail is enforced', async () => {
    const before = CdpCDPSession.prototype.send;
    sinon.stub(globalThis, 'fetch').resolves({
      status: 200,
      headers: new Headers(),
      text: async () => 'content',
    } as Response);

    const seenByA: string[] = [];
    const seenByB: string[] = [];
    const restoreA = installGuardedNetworkFetch(
      makeContext({
        hasGuardrail: true,
        validate: url => {
          seenByA.push(url.href);
        },
      }),
    );
    const patchedSend = CdpCDPSession.prototype.send;
    const restoreB = installGuardedNetworkFetch(
      makeContext({
        hasGuardrail: true,
        validate: url => {
          seenByB.push(url.href);
          if (url.hostname === 'blocked-by-b.example') {
            throw new Error('blocked by B');
          }
        },
      }),
    );

    try {
      // A second overlapping install must not re-patch the prototype.
      assert.strictEqual(CdpCDPSession.prototype.send, patchedSend);

      // A URL only B's guardrail rejects is still rejected while both are
      // active -- every active context is consulted, not just the first.
      const rejected = (await CdpCDPSession.prototype.send.call(
        {},
        'Network.loadNetworkResource',
        {url: 'https://blocked-by-b.example/robots.txt', options: {}} as never,
      )) as {resource: {success: boolean}};
      assert.strictEqual(rejected.resource.success, false);
      assert.deepStrictEqual(seenByA, ['https://blocked-by-b.example/robots.txt']);
      assert.deepStrictEqual(seenByB, ['https://blocked-by-b.example/robots.txt']);

      // Restoring the earlier (A) install first must not disturb the still-
      // active later (B) install.
      restoreA();
      assert.strictEqual(CdpCDPSession.prototype.send, patchedSend);

      const stillGuarded = (await CdpCDPSession.prototype.send.call(
        {},
        'Network.loadNetworkResource',
        {url: 'https://blocked-by-b.example/robots.txt', options: {}} as never,
      )) as {resource: {success: boolean}};
      assert.strictEqual(stillGuarded.resource.success, false);

      restoreB();
      assert.strictEqual(CdpCDPSession.prototype.send, before);
    } finally {
      restoreA();
      restoreB();
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
