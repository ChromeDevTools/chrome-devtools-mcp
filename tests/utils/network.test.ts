/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import sinon from 'sinon';

import {
  fetchWithValidatedRedirects,
  validateNetworkUrl,
} from '../../src/utils/network.js';

describe('network access policy', () => {
  it('redacts userinfo and query strings in URL policy errors', () => {
    assert.throws(
      () =>
        validateNetworkUrl(
          new URL('https://user:secret@example.com/private?token=secret'),
          {
            blockedUrlPattern: ['https://example.com/*'],
          },
        ),
      {message: 'Blocked by blocklist: https://example.com/private?REDACTED'},
    );
  });
});

describe('fetchWithValidatedRedirects', () => {
  for (const policy of [
    {blockedUrlPattern: ['https://blocked.example/*']},
    {allowedUrlPattern: ['https://allowed.example/*']},
  ]) {
    it('checks every redirect against ' + JSON.stringify(policy), async () => {
      const redirect = new Response('redirect body', {
        status: 302,
        headers: {location: 'https://blocked.example/private'},
      });
      assert.ok(redirect.body);
      const cancel = sinon.spy(redirect.body, 'cancel');
      const fetch = sinon.stub(globalThis, 'fetch').resolves(redirect);
      await assert.rejects(
        fetchWithValidatedRedirects(new URL('https://allowed.example/start'), {
          policy,
        }),
        /blocklist|allowlist/,
      );
      sinon.assert.calledOnceWithExactly(
        fetch,
        new URL('https://allowed.example/start'),
        {redirect: 'manual'},
      );
      sinon.assert.calledOnceWithExactly(cancel);
    });
  }

  it('rejects a blocked initial URL before sending a request', async () => {
    const fetch = sinon.stub(globalThis, 'fetch');
    await assert.rejects(
      fetchWithValidatedRedirects(new URL('https://blocked.example/start'), {
        policy: {blockedUrlPattern: ['https://blocked.example/*']},
      }),
      /Blocked by blocklist/,
    );
    sinon.assert.notCalled(fetch);
  });

  it('preserves same-origin credentials and strips private headers on cross-origin redirects', async () => {
    const final = new Response('content');
    const fetch = sinon.stub(globalThis, 'fetch');
    fetch
      .onFirstCall()
      .resolves(
        new Response(null, {status: 301, headers: {location: '/next'}}),
      );
    fetch.onSecondCall().resolves(
      new Response(null, {
        status: 307,
        headers: {location: 'https://other.example/final'},
      }),
    );
    fetch.onThirdCall().resolves(final);
    const headers = {
      authorization: 'secret',
      cookie: 'session=secret',
      'proxy-authorization': 'secret',
      'x-api-key': 'secret',
      referer: 'https://example.com/private?token=secret',
      accept: 'text/javascript',
    };
    const response = await fetchWithValidatedRedirects(
      new URL('https://example.com/start'),
      {
        policy: {},
        method: 'HEAD',
        headers,
      },
    );
    assert.equal(response, final);
    sinon.assert.calledWithExactly(
      fetch.firstCall,
      new URL('https://example.com/start'),
      {redirect: 'manual', method: 'HEAD', headers},
    );
    sinon.assert.calledWithExactly(
      fetch.secondCall,
      new URL('https://example.com/next'),
      {redirect: 'manual', method: 'HEAD', headers},
    );
    sinon.assert.calledWithExactly(
      fetch.thirdCall,
      new URL('https://other.example/final'),
      {
        redirect: 'manual',
        method: 'HEAD',
        headers: {accept: 'text/javascript'},
      },
    );
  });

  it('rejects a redirect to an unsupported protocol before fetching it', async () => {
    const fetch = sinon.stub(globalThis, 'fetch').resolves(
      new Response(null, {
        status: 303,
        headers: {location: 'file:///tmp/secret'},
      }),
    );
    await assert.rejects(
      fetchWithValidatedRedirects(new URL('https://example.com/start'), {
        policy: {},
      }),
      /Unsupported URL protocol: file:/,
    );
    sinon.assert.calledOnceWithExactly(
      fetch,
      new URL('https://example.com/start'),
      {redirect: 'manual'},
    );
  });

  it('cancels a redirect body when Location is missing', async () => {
    const response = new Response('body', {status: 302});
    assert.ok(response.body);
    const cancel = sinon.spy(response.body, 'cancel');
    sinon.stub(globalThis, 'fetch').resolves(response);
    await assert.rejects(
      fetchWithValidatedRedirects(new URL('https://example.com/start'), {
        policy: {},
      }),
      /Redirect has no Location header/,
    );
    sinon.assert.calledOnceWithExactly(cancel);
  });

  it('bounds redirect loops and cancels the last response body', async () => {
    const responses: Response[] = [];
    const fetch = sinon.stub(globalThis, 'fetch').callsFake(async () => {
      const response = new Response('body', {
        status: 308,
        headers: {location: '/loop'},
      });
      responses.push(response);
      return response;
    });
    await assert.rejects(
      fetchWithValidatedRedirects(new URL('https://example.com/loop'), {
        policy: {},
      }),
      /Too many redirects/,
    );
    sinon.assert.callCount(fetch, 21);
    assert.ok(responses.every(response => response.bodyUsed));
  });
});
