/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import sinon from 'sinon';

import {NetworkOverrideManager} from '../src/NetworkOverrideManager.js';
import {
  createMockHTTPRequest,
  createMockPuppeteerPage,
  createMockServerConfig,
} from './mocks.js';
import {NetworkOverridesFormatter} from '../src/formatters/NetworkOverridesFormatter.js';

describe('NetworkOverrideManager', () => {
  it('retains existing rules when a replacement URL is blocked', async () => {
    const pptrPage = createMockPuppeteerPage();
    const manager = new NetworkOverrideManager(
      pptrPage,
      createMockServerConfig({
        blockedUrlPattern: ['https://blocked.example/*'],
      }),
    );
    const previous = await manager.mock({
      kind: 'redirect',
      urlPattern: '*app.js',
      redirectUrl: 'https://example.com/replacement.js',
    });
    await assert.rejects(
      manager.mock({
        kind: 'redirect',
        urlPattern: '*app.js',
        redirectUrl: 'https://blocked.example/replacement.js',
      }),
      /Blocked by blocklist/,
    );
    assert.deepEqual(manager.list(), [previous]);
    sinon.assert.calledOnceWithExactly(pptrPage.setRequestInterception, true);
    await manager.dispose();
  });
  it('blocks cross-origin redirects to a host on blocked-url-pattern before contacting it', async () => {
    const pptrPage = createMockPuppeteerPage();
    const manager = new NetworkOverrideManager(
      pptrPage,
      createMockServerConfig({
        blockedUrlPattern: ['https://blocked.example/*'],
      }),
    );
    await manager.mock({
      kind: 'redirect',
      urlPattern: '*app.js',
      redirectUrl: 'https://allowed.example/replacement.js',
    });
    const fetch = sinon.stub(globalThis, 'fetch').resolves(
      new Response('redirect', {
        status: 302,
        headers: {location: 'https://blocked.example/secret'},
      }),
    );
    const request = createMockHTTPRequest();
    await pptrPage.on.firstCall.args[1](request);
    sinon.assert.calledOnceWithExactly(
      fetch,
      new URL('https://allowed.example/replacement.js'),
      {redirect: 'manual', method: 'GET', headers: {}},
    );
    sinon.assert.calledOnceWithExactly(request.abort, 'failed');
    sinon.assert.notCalled(request.respond);
    assert.match(
      manager.list()[0]?.diagnostics.lastError ?? '',
      /Blocked by blocklist: https:\/\/blocked.example\/secret/,
    );
    await manager.dispose();
  });

  it('uses updated access policies for already configured overrides', async () => {
    const config = createMockServerConfig();
    const pptrPage = createMockPuppeteerPage();
    const manager = new NetworkOverrideManager(pptrPage, config);
    await manager.mock({
      kind: 'redirect',
      urlPattern: '*app.js',
      redirectUrl: 'https://example.com/replacement.js',
    });
    config.commit(
      createMockServerConfig({
        blockedUrlPattern: ['https://example.com/replacement.js'],
      }),
    );
    const request = createMockHTTPRequest();
    const fetch = sinon.stub(globalThis, 'fetch');
    await pptrPage.on.firstCall.args[1](request);
    sinon.assert.calledOnceWithExactly(request.abort, 'failed');
    sinon.assert.notCalled(request.continue);
    sinon.assert.notCalled(fetch);
    await manager.dispose();
  });

  it('fulfills an allowed redirect chain with the final response', async () => {
    const pptrPage = createMockPuppeteerPage();
    const manager = new NetworkOverrideManager(
      pptrPage,
      createMockServerConfig(),
    );
    await manager.mock({
      kind: 'redirect',
      urlPattern: '*app.js',
      redirectUrl: 'https://cdn.example/start',
    });
    const fetch = sinon.stub(globalThis, 'fetch');
    fetch
      .onFirstCall()
      .resolves(
        new Response(null, {status: 302, headers: {location: '/final'}}),
      );
    fetch.onSecondCall().resolves(
      new Response('replacement', {
        status: 200,
        headers: {'content-type': 'text/javascript'},
      }),
    );
    const request = createMockHTTPRequest();
    await pptrPage.on.firstCall.args[1](request);
    sinon.assert.calledWithExactly(
      fetch.secondCall,
      new URL('https://cdn.example/final'),
      {redirect: 'manual', method: 'GET', headers: {}},
    );
    sinon.assert.calledOnceWithExactly(request.respond, {
      status: 200,
      headers: {'content-type': 'text/javascript'},
      body: new TextEncoder().encode('replacement'),
    });
    sinon.assert.notCalled(request.abort);
    await manager.dispose();
  });

  it('counts only matching requests and returns independent diagnostic snapshots', async () => {
    const pptrPage = createMockPuppeteerPage();
    const manager = new NetworkOverrideManager(
      pptrPage,
      createMockServerConfig(),
    );
    const initial = await manager.mock({
      kind: 'redirect',
      urlPattern: '*app.js',
      resourceType: 'script',
      redirectUrl: 'https://example.com/replacement.js',
    });
    const handle = pptrPage.on.firstCall.args[1];
    const fetch = sinon
      .stub(globalThis, 'fetch')
      .resolves(new Response('script'));
    const request = createMockHTTPRequest();
    await handle(request);
    const unmatched = createMockHTTPRequest({resourceType: 'fetch'});
    await handle(unmatched);
    assert.deepEqual(manager.list()[0]?.diagnostics, {
      hits: 1,
      errors: 0,
      navigations: 0,
    });
    assert.equal(initial.diagnostics.hits, 0);
    sinon.assert.calledOnceWithExactly(
      fetch,
      new URL('https://example.com/replacement.js'),
      {redirect: 'manual', method: 'GET', headers: {}},
    );
    sinon.assert.calledOnceWithExactly(unmatched.continue);
    sinon.assert.notCalled(request.continue);
    await manager.dispose();
  });

  it('warns when nothing matched after navigation and removes navigation listeners', async () => {
    const pptrPage = createMockPuppeteerPage();
    const manager = new NetworkOverrideManager(
      pptrPage,
      createMockServerConfig(),
    );
    await manager.mock({
      kind: 'redirect',
      urlPattern: '*missing.js',
      redirectUrl: 'https://example.com/replacement.js',
    });
    assert.match(
      new NetworkOverridesFormatter(manager.list()).toString(),
      /Navigate or reload/,
    );
    pptrPage.emit('framenavigated', pptrPage.mainFrame());
    assert.match(
      new NetworkOverridesFormatter(manager.list()).toString(),
      /Warning: no requests matched after navigation/,
    );
    const unmatched = createMockHTTPRequest();
    await pptrPage.on.firstCall.args[1](unmatched);
    assert.equal(manager.list()[0]?.diagnostics.hits, 0);
    sinon.assert.calledOnceWithExactly(unmatched.continue);
    await manager.dispose();
    assert.equal(pptrPage.listenerCount('framenavigated'), 0);
  });

  it('reports the local file and error when a previously readable file fails', async () => {
    const pptrPage = createMockPuppeteerPage();
    const manager = new NetworkOverrideManager(
      pptrPage,
      createMockServerConfig(),
    );
    const loadResponseFile = sinon
      .stub()
      .onFirstCall()
      .resolves(new Uint8Array())
      .onSecondCall()
      .rejects({message: 'ENOENT: file was removed'});
    await manager.mock({
      kind: 'file',
      urlPattern: '*app.js',
      responseFilePath: '/tmp/app.js',
      loadResponseFile,
    });
    const request = createMockHTTPRequest();
    await pptrPage.on.firstCall.args[1](request);
    assert.deepEqual(manager.list()[0]?.diagnostics, {
      hits: 1,
      errors: 1,
      navigations: 0,
      lastError: 'Failed to load /tmp/app.js: ENOENT: file was removed',
    });
    assert.match(
      new NetworkOverridesFormatter(manager.list()).toString(),
      /Last error: Failed to load \/tmp\/app.js: ENOENT/,
    );
    sinon.assert.calledOnceWithExactly(request.abort, 'failed');
    sinon.assert.notCalled(request.respond);
    await manager.dispose();
  });
  it('updates one rule without replacing unrelated rules or restarting interception', async () => {
    const pptrPage = createMockPuppeteerPage();
    const manager = new NetworkOverrideManager(
      pptrPage,
      createMockServerConfig(),
    );
    const unrelated = await manager.mock({
      kind: 'redirect',
      urlPattern: '*old.js',
      redirectUrl: 'https://example.com/old.js',
    });
    const previous = await manager.mock({
      kind: 'redirect',
      urlPattern: '*new.js',
      redirectUrl: 'https://example.com/new.js',
    });
    const updated = await manager.mock({urlPattern: '*new.js', abort: true});
    assert.deepEqual(manager.list(), [unrelated, updated]);
    assert.equal(updated.id, previous.id);
    assert.equal(updated.kind, 'redirect');
    assert.equal(updated.abort, true);
    sinon.assert.calledOnceWithExactly(pptrPage.setRequestInterception, true);
    await manager.dispose();
  });

  it('validates a local file before updating an existing rule', async () => {
    const pptrPage = createMockPuppeteerPage();
    const manager = new NetworkOverrideManager(
      pptrPage,
      createMockServerConfig(),
    );
    const previous = await manager.mock({
      kind: 'redirect',
      urlPattern: '*app.js',
      redirectUrl: 'https://example.com/app.js',
    });
    const loadResponseFile = sinon.stub().rejects(new Error('File unreadable'));
    await assert.rejects(
      manager.mock({
        kind: 'file',
        urlPattern: '*app.js',
        responseFilePath: '/tmp/app.js',
        loadResponseFile,
      }),
      /File unreadable/,
    );
    assert.deepEqual(manager.list(), [previous]);
    sinon.assert.calledOnceWithExactly(loadResponseFile);
    sinon.assert.calledOnceWithExactly(pptrPage.setRequestInterception, true);
    await manager.dispose();
  });

  it('infers local file content types after validating the file', async () => {
    const pptrPage = createMockPuppeteerPage();
    const manager = new NetworkOverrideManager(
      pptrPage,
      createMockServerConfig(),
    );
    const loadResponseFile = sinon.stub().resolves(new Uint8Array());
    assert.deepEqual(
      await manager.mock({
        kind: 'file',
        urlPattern: '*app.js',
        responseFilePath: '/tmp/app.js',
        loadResponseFile,
      }),
      {
        id: 1,
        diagnostics: {hits: 0, errors: 0, navigations: 0},
        kind: 'file',
        urlPattern: '*app.js',
        resourceType: undefined,
        abort: false,
        allowOrigin: undefined,
        responseFilePath: '/tmp/app.js',
        contentType: 'application/javascript; charset=utf-8',
      },
    );
    sinon.assert.calledOnceWithExactly(loadResponseFile);
    await manager.dispose();
  });

  it('rolls back the rule set when activation fails', async () => {
    const pptrPage = createMockPuppeteerPage();
    const manager = new NetworkOverrideManager(
      pptrPage,
      createMockServerConfig(),
    );
    pptrPage.setRequestInterception
      .withArgs(true)
      .rejects(new Error('Target closed'));
    await assert.rejects(
      manager.mock({
        kind: 'redirect',
        urlPattern: '*app.js',
        redirectUrl: 'https://example.com/app.js',
      }),
      /Target closed/,
    );
    assert.deepEqual(manager.list(), []);
    sinon.assert.calledWithExactly(
      pptrPage.setRequestInterception.secondCall,
      false,
    );
    sinon.assert.calledWithExactly(pptrPage.setCacheEnabled.secondCall, true);
    await manager.dispose();
  });

  it('retains the rules when clearing interception fails', async () => {
    const pptrPage = createMockPuppeteerPage();
    const manager = new NetworkOverrideManager(
      pptrPage,
      createMockServerConfig(),
    );
    const previous = await manager.mock({
      kind: 'redirect',
      urlPattern: '*app.js',
      redirectUrl: 'https://example.com/app.js',
    });
    pptrPage.setRequestInterception
      .withArgs(false)
      .rejects(new Error('Cannot disable'));
    await assert.rejects(manager.remove({}), /Cannot disable/);
    assert.deepEqual(manager.list(), [previous]);
    sinon.assert.calledOnceWithExactly(pptrPage.setCacheEnabled, false);
    pptrPage.setRequestInterception.withArgs(false).resolves();
    await manager.dispose();
  });

  it('filters and removes exact routes and resource types while preserving other mocks', async () => {
    const pptrPage = createMockPuppeteerPage();
    const manager = new NetworkOverrideManager(
      pptrPage,
      createMockServerConfig(),
    );
    const script = await manager.mock({
      urlPattern: '*app.js',
      resourceType: 'script',
      abort: true,
    });
    const fetch = await manager.mock({
      urlPattern: '*app.js',
      resourceType: 'fetch',
      abort: true,
    });
    const other = await manager.mock({urlPattern: '*other.js', abort: true});
    assert.deepEqual(manager.list({urlPattern: '*app.js'}), [script, fetch]);
    assert.deepEqual(manager.list({resourceType: 'script'}), [script]);
    assert.equal(
      await manager.remove({urlPattern: '*app.js', resourceType: 'script'}),
      1,
    );
    assert.deepEqual(manager.list(), [fetch, other]);
    assert.equal(await manager.remove({urlPattern: '*app*'}), 0);
    sinon.assert.calledOnceWithExactly(pptrPage.setRequestInterception, true);
    assert.equal(await manager.remove({}), 2);
    assert.deepEqual(manager.list(), []);
    sinon.assert.calledWithExactly(
      pptrPage.setRequestInterception.secondCall,
      false,
    );
    sinon.assert.calledWithExactly(pptrPage.setCacheEnabled.secondCall, true);
    await manager.dispose();
  });

  it('restores interception and retains mocks when restoring the cache fails during removal', async () => {
    const pptrPage = createMockPuppeteerPage();
    const manager = new NetworkOverrideManager(
      pptrPage,
      createMockServerConfig(),
    );
    const previous = await manager.mock({urlPattern: '*app.js', abort: true});
    pptrPage.setCacheEnabled
      .withArgs(true)
      .onFirstCall()
      .rejects(new Error('Cannot restore cache'));
    await assert.rejects(manager.remove({}), /Cannot restore cache/);
    assert.deepEqual(manager.list(), [previous]);
    sinon.assert.calledWithExactly(
      pptrPage.setRequestInterception.secondCall,
      false,
    );
    sinon.assert.calledWithExactly(
      pptrPage.setRequestInterception.thirdCall,
      true,
    );
    assert.equal(pptrPage.listenerCount('request'), 1);
    const request = createMockHTTPRequest();
    await pptrPage.on.thirdCall.args[1](request);
    sinon.assert.calledOnceWithExactly(request.abort, 'failed');
    sinon.assert.notCalled(request.continue);
    await manager.dispose();
  });

  it('uses all URLs when route is omitted and updates only the exact filter pair', async () => {
    const pptrPage = createMockPuppeteerPage();
    const manager = new NetworkOverrideManager(
      pptrPage,
      createMockServerConfig(),
    );
    const scripts = await manager.mock({resourceType: 'script', abort: true});
    const all = await manager.mock({abort: true});
    const updated = await manager.mock({resourceType: 'script', abort: false});
    assert.equal(scripts.urlPattern, '*');
    assert.equal(updated.id, scripts.id);
    assert.deepEqual(manager.list(), [all, updated]);
    const request = createMockHTTPRequest();
    await pptrPage.on.firstCall.args[1](request);
    sinon.assert.calledOnceWithExactly(request.continue);
    sinon.assert.notCalled(request.abort);
    assert.equal(
      manager.list({resourceType: 'script'})[0]?.diagnostics.hits,
      1,
    );
    assert.equal(manager.list()[0]?.diagnostics.hits, 0);
    await manager.dispose();
  });

  it('aborts matching requests without recording a replacement error and restores the source with abort false', async () => {
    const pptrPage = createMockPuppeteerPage();
    const manager = new NetworkOverrideManager(
      pptrPage,
      createMockServerConfig(),
    );
    const loadResponseFile = sinon
      .stub()
      .resolves(new TextEncoder().encode('replacement'));
    await manager.mock({
      kind: 'file',
      urlPattern: '*app.js',
      responseFilePath: '/tmp/app.js',
      loadResponseFile,
    });
    await manager.mock({urlPattern: '*app.js', abort: true});
    const blocked = createMockHTTPRequest();
    await pptrPage.on.firstCall.args[1](blocked);
    sinon.assert.calledOnceWithExactly(blocked.abort, 'failed');
    sinon.assert.notCalled(blocked.respond);
    sinon.assert.calledOnceWithExactly(loadResponseFile);
    assert.deepEqual(manager.list()[0]?.diagnostics, {
      hits: 1,
      errors: 0,
      navigations: 0,
    });
    assert.match(
      new NetworkOverridesFormatter(manager.list()).toString(),
      /Requests are aborted/,
    );
    await manager.mock({urlPattern: '*app.js', abort: false});
    const restored = createMockHTTPRequest();
    await pptrPage.on.firstCall.args[1](restored);
    sinon.assert.calledOnceWithExactly(restored.respond, {
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      headers: {'Cache-Control': 'no-store'},
      body: new TextEncoder().encode('replacement'),
    });
    sinon.assert.notCalled(restored.abort);
    await manager.dispose();
  });

  it('sets allow-origin for a local body and retains it when the body is updated', async () => {
    const pptrPage = createMockPuppeteerPage();
    const manager = new NetworkOverrideManager(
      pptrPage,
      createMockServerConfig(),
    );
    await manager.mock({
      urlPattern: '*app.js',
      allowOrigin: 'https://consumer.example',
    });
    const loadResponseFile = sinon
      .stub()
      .resolves(new TextEncoder().encode('replacement'));
    await manager.mock({
      kind: 'file',
      urlPattern: '*app.js',
      responseFilePath: '/tmp/app.js',
      loadResponseFile,
    });
    const request = createMockHTTPRequest();
    await pptrPage.on.firstCall.args[1](request);
    sinon.assert.calledOnceWithExactly(request.respond, {
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      headers: {
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': 'https://consumer.example',
      },
      body: new TextEncoder().encode('replacement'),
    });
    assert.match(
      new NetworkOverridesFormatter(manager.list()).toString(),
      /Access-Control-Allow-Origin: https:\/\/consumer.example/,
    );
    await manager.dispose();
  });

  it('fetches the original response for an allow-origin-only mock and preserves same-origin credentials', async () => {
    const pptrPage = createMockPuppeteerPage();
    const manager = new NetworkOverrideManager(
      pptrPage,
      createMockServerConfig(),
    );
    await manager.mock({urlPattern: '*app.js', allowOrigin: '*'});
    const fetch = sinon.stub(globalThis, 'fetch').resolves(
      new Response('original', {
        headers: {'access-control-allow-origin': 'https://old.example'},
      }),
    );
    const request = createMockHTTPRequest({
      headers: {authorization: 'secret', cookie: 'session=secret'},
    });
    await pptrPage.on.firstCall.args[1](request);
    sinon.assert.calledOnceWithExactly(
      fetch,
      new URL('https://example.com/app.js'),
      {
        redirect: 'manual',
        method: 'GET',
        headers: {authorization: 'secret', cookie: 'session=secret'},
      },
    );
    sinon.assert.calledOnceWithExactly(request.respond, {
      status: 200,
      headers: {
        'content-type': 'text/plain;charset=UTF-8',
        'access-control-allow-origin': '*',
      },
      body: new TextEncoder().encode('original'),
    });
    sinon.assert.notCalled(request.continue);
    await manager.dispose();
  });

  it('checks same-origin upstream redirects against blocked-url-pattern before contacting the target', async () => {
    const pptrPage = createMockPuppeteerPage();
    const manager = new NetworkOverrideManager(
      pptrPage,
      createMockServerConfig({
        blockedUrlPattern: ['https://blocked.example/*'],
      }),
    );
    await manager.mock({
      kind: 'redirect',
      urlPattern: '*app.js',
      redirectUrl: 'https://example.com/start',
    });
    const fetch = sinon.stub(globalThis, 'fetch').resolves(
      new Response(null, {
        status: 302,
        headers: {location: 'https://blocked.example/private'},
      }),
    );
    const request = createMockHTTPRequest();
    await pptrPage.on.firstCall.args[1](request);
    sinon.assert.calledOnceWithExactly(
      fetch,
      new URL('https://example.com/start'),
      {redirect: 'manual', method: 'GET', headers: {}},
    );
    sinon.assert.calledOnceWithExactly(request.abort, 'failed');
    sinon.assert.notCalled(request.continue);
    sinon.assert.notCalled(request.respond);
    await manager.dispose();
  });

  it('fulfills decoded upstream bodies without stale compression headers and applies allow-origin', async () => {
    const pptrPage = createMockPuppeteerPage();
    const manager = new NetworkOverrideManager(
      pptrPage,
      createMockServerConfig(),
    );
    await manager.mock({
      kind: 'redirect',
      urlPattern: '*app.js',
      redirectUrl: 'https://example.com/replacement.js',
      allowOrigin: '*',
    });
    sinon.stub(globalThis, 'fetch').resolves(
      new Response('decoded', {
        headers: {
          'content-encoding': 'gzip',
          'content-length': '123',
          'content-type': 'text/javascript',
        },
      }),
    );
    const request = createMockHTTPRequest();
    await pptrPage.on.firstCall.args[1](request);
    sinon.assert.calledOnceWithExactly(request.respond, {
      status: 200,
      headers: {
        'content-type': 'text/javascript',
        'access-control-allow-origin': '*',
      },
      body: new TextEncoder().encode('decoded'),
    });
    sinon.assert.notCalled(request.continue);
    await manager.dispose();
  });

  for (const source of ['upstream', 'allow-origin']) {
    it(
      'rejects unsupported methods for ' + source + ' before fetching',
      async () => {
        const pptrPage = createMockPuppeteerPage();
        const manager = new NetworkOverrideManager(
          pptrPage,
          createMockServerConfig(),
        );
        await manager.mock(
          source === 'upstream'
            ? {
                kind: 'redirect',
                urlPattern: '*app.js',
                redirectUrl: 'https://example.com/replacement.js',
              }
            : {urlPattern: '*app.js', allowOrigin: '*'},
        );
        const fetch = sinon.stub(globalThis, 'fetch');
        const request = createMockHTTPRequest({method: 'POST'});
        await pptrPage.on.firstCall.args[1](request);
        sinon.assert.notCalled(fetch);
        sinon.assert.calledOnceWithExactly(request.abort, 'failed');
        assert.match(
          manager.list()[0]?.diagnostics.lastError ?? '',
          /only support GET and HEAD/,
        );
        await manager.dispose();
      },
    );
  }
});
