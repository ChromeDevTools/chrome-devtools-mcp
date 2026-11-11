/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import sinon from 'sinon';

import {NetworkOverrideManager} from '../src/NetworkOverrideManager.js';
import {CdpFrame} from '../src/third_party/index.js';
import {
  createMockHTTPRequest,
  createMockPuppeteerPage,
  createMockServerConfig,
} from './mocks.js';
import {NetworkOverridesFormatter} from '../src/formatters/NetworkOverridesFormatter.js';
import {settle} from './utils.js';

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
      kind: 'upstream',
      urlPattern: '*://*:*/*app.js',
      upstreamUrl: 'https://example.com/replacement.js',
    });
    await assert.rejects(
      manager.mock({
        kind: 'upstream',
        urlPattern: '*://*:*/*app.js',
        upstreamUrl: 'https://blocked.example/replacement.js',
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
      kind: 'upstream',
      urlPattern: '*://*:*/*app.js',
      upstreamUrl: 'https://allowed.example/replacement.js',
    });
    const fetch = sinon.stub(globalThis, 'fetch').resolves(
      new Response('upstream', {
        status: 302,
        headers: {location: 'https://blocked.example/secret'},
      }),
    );
    const request = createMockHTTPRequest();
    pptrPage.emit('request', request);
    await settle();
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
      kind: 'upstream',
      urlPattern: '*://*:*/*app.js',
      upstreamUrl: 'https://example.com/replacement.js',
    });
    config.commit(
      createMockServerConfig({
        blockedUrlPattern: ['https://example.com/replacement.js'],
      }),
    );
    const request = createMockHTTPRequest();
    const fetch = sinon.stub(globalThis, 'fetch');
    pptrPage.emit('request', request);
    await settle();
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
      kind: 'upstream',
      urlPattern: '*://*:*/*app.js',
      upstreamUrl: 'https://cdn.example/start',
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
    pptrPage.emit('request', request);
    await settle();
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

  it('redacts userinfo and query strings in upstream replacement errors', async () => {
    const pptrPage = createMockPuppeteerPage();
    const manager = new NetworkOverrideManager(
      pptrPage,
      createMockServerConfig(),
    );
    const upstream = 'https://user:secret@example.com/app.js?token=secret';
    await manager.mock({
      kind: 'upstream',
      urlPattern: 'https://example.com/app.js',
      upstreamUrl: upstream,
    });
    const fetch = sinon
      .stub(globalThis, 'fetch')
      .rejects(new Error('Failed to fetch ' + upstream));
    const request = createMockHTTPRequest();
    pptrPage.emit('request', request);
    await settle();
    sinon.assert.calledOnceWithExactly(fetch, new URL(upstream), {
      redirect: 'manual',
      method: 'GET',
      headers: {},
    });
    assert.equal(
      manager.list()[0]?.diagnostics.lastError,
      'Failed to load https://example.com/app.js?REDACTED: ' +
        'Failed to fetch https://example.com/app.js?REDACTED',
    );
    sinon.assert.calledOnceWithExactly(request.abort, 'failed');
    sinon.assert.notCalled(request.respond);
    await manager.dispose();
  });

  it('counts only matching requests and returns independent diagnostic snapshots', async () => {
    const pptrPage = createMockPuppeteerPage();
    const manager = new NetworkOverrideManager(
      pptrPage,
      createMockServerConfig(),
    );
    const initial = await manager.mock({
      kind: 'file',
      urlPattern: '*://*:*/*app.js',
      resourceType: 'script',
      responseFilePath: '/tmp/replacement.js',
      loadResponseFile: async () => new Uint8Array(),
    });
    const request = createMockHTTPRequest();
    pptrPage.emit('request', request);
    const unmatched = createMockHTTPRequest({resourceType: 'fetch'});
    pptrPage.emit('request', unmatched);
    await settle();
    assert.deepEqual(manager.list()[0]?.diagnostics, {
      hits: 1,
      errors: 0,
      navigations: 0,
    });
    assert.equal(initial.diagnostics.hits, 0);
    sinon.assert.calledOnceWithExactly(request.respond, {
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      headers: {'Cache-Control': 'no-store'},
      body: new Uint8Array(),
    });
    sinon.assert.calledOnceWithExactly(unmatched.continue);
    sinon.assert.notCalled(request.continue);
    await manager.dispose();
  });

  it('warns after a main-frame document request but not a hash change or subframe navigation', async () => {
    const pptrPage = createMockPuppeteerPage();
    const manager = new NetworkOverrideManager(
      pptrPage,
      createMockServerConfig(),
    );
    await manager.mock({
      kind: 'file',
      urlPattern: '*://*:*/*missing.js',
      responseFilePath: '/tmp/replacement.js',
      loadResponseFile: async () => new Uint8Array(),
    });
    assert.match(
      new NetworkOverridesFormatter(manager.list()).toString(),
      /Navigate or reload/,
    );
    pptrPage.emit('framenavigated', pptrPage.mainFrame());
    const mainFrame = pptrPage.mainFrame();
    const childFrame = createMockPuppeteerPage().mainFrame();
    assert.ok(mainFrame instanceof CdpFrame);
    assert.ok(childFrame instanceof CdpFrame);
    const subframe = createMockHTTPRequest({resourceType: 'document'});
    subframe.frame.returns(childFrame);
    pptrPage.emit('request', subframe);
    const script = createMockHTTPRequest();
    script.frame.returns(mainFrame);
    pptrPage.emit('request', script);
    await settle();
    assert.equal(manager.list()[0]?.diagnostics.navigations, 0);
    assert.doesNotMatch(
      new NetworkOverridesFormatter(manager.list()).toString(),
      /Warning: no requests matched after navigation/,
    );
    const document = createMockHTTPRequest({resourceType: 'document'});
    document.frame.returns(mainFrame);
    pptrPage.emit('request', document);
    await settle();
    assert.equal(manager.list()[0]?.diagnostics.navigations, 1);
    assert.match(
      new NetworkOverridesFormatter(manager.list()).toString(),
      /Warning: no requests matched after navigation/,
    );
    assert.equal(manager.list()[0]?.diagnostics.hits, 0);
    sinon.assert.calledOnceWithExactly(document.continue);
    sinon.assert.notCalled(document.respond);
    await manager.dispose();
    assert.equal(pptrPage.listenerCount('request'), 0);
  });

  for (const route of [
    'https://example.com/app.js',
    '*://*:*/app.js',
    'https://example.com/app.js?v=*',
  ]) {
    it('matches query strings using URLPattern: ' + route, async () => {
      const pptrPage = createMockPuppeteerPage();
      const manager = new NetworkOverrideManager(
        pptrPage,
        createMockServerConfig(),
      );
      await manager.mock({
        kind: 'file',
        urlPattern: route,
        responseFilePath: '/tmp/app.js',
        loadResponseFile: async () => new Uint8Array(),
      });
      const request = createMockHTTPRequest({
        url: 'https://example.com/app.js?v=1',
      });
      pptrPage.emit('request', request);
      await settle();
      sinon.assert.calledOnceWithExactly(request.respond, {
        status: 200,
        contentType: 'application/javascript; charset=utf-8',
        headers: {'Cache-Control': 'no-store'},
        body: new Uint8Array(),
      });
      sinon.assert.notCalled(request.continue);
      const unmatched = createMockHTTPRequest({
        url: 'https://example.com/app.jsxv=1',
      });
      pptrPage.emit('request', unmatched);
      await settle();
      sinon.assert.calledOnceWithExactly(unmatched.continue);
      sinon.assert.notCalled(unmatched.respond);
      await manager.dispose();
    });
  }

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
      urlPattern: '*://*:*/*app.js',
      responseFilePath: '/tmp/app.js',
      loadResponseFile,
    });
    const request = createMockHTTPRequest();
    pptrPage.emit('request', request);
    await settle();
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
      kind: 'file',
      urlPattern: '*://*:*/*old.js',
      responseFilePath: '/tmp/old.js',
      loadResponseFile: async () => new Uint8Array(),
    });
    const previous = await manager.mock({
      kind: 'file',
      urlPattern: '*://*:*/*new.js',
      responseFilePath: '/tmp/new.js',
      loadResponseFile: async () => new Uint8Array(),
    });
    const updated = await manager.mock({
      kind: 'file',
      urlPattern: '*://*:*/*new.js',
      responseFilePath: '/tmp/updated.js',
      loadResponseFile: async () => new Uint8Array(),
    });
    assert.deepEqual(manager.list(), [unrelated, updated]);
    assert.equal(updated.id, previous.id);
    assert.equal(updated.kind, 'file');
    sinon.assert.calledOnceWithExactly(pptrPage.setRequestInterception, true);
    await manager.dispose();
  });

  it('updates abort while preserving the rule id and response source', async () => {
    const pptrPage = createMockPuppeteerPage();
    const manager = new NetworkOverrideManager(
      pptrPage,
      createMockServerConfig(),
    );
    const previous = await manager.mock({
      kind: 'file',
      urlPattern: '*://*:*/*app.js',
      responseFilePath: '/tmp/app.js',
      loadResponseFile: async () => new Uint8Array(),
    });
    const updated = await manager.mock({
      urlPattern: '*://*:*/*app.js',
      abort: true,
    });
    assert.deepEqual(updated, {...previous, abort: true});
    assert.deepEqual(manager.list(), [updated]);
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
      kind: 'file',
      urlPattern: '*://*:*/*app.js',
      responseFilePath: '/tmp/app.js',
      loadResponseFile: async () => new Uint8Array(),
    });
    const loadResponseFile = sinon.stub().rejects(new Error('File unreadable'));
    await assert.rejects(
      manager.mock({
        kind: 'file',
        urlPattern: '*://*:*/*app.js',
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
        urlPattern: '*://*:*/*app.js',
        responseFilePath: '/tmp/app.js',
        loadResponseFile,
      }),
      {
        id: 1,
        diagnostics: {hits: 0, errors: 0, navigations: 0},
        kind: 'file',
        urlPattern: '*://*:*/*app.js',
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
        kind: 'file',
        urlPattern: '*://*:*/*app.js',
        responseFilePath: '/tmp/app.js',
        loadResponseFile: async () => new Uint8Array(),
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
      kind: 'file',
      urlPattern: '*://*:*/*app.js',
      responseFilePath: '/tmp/app.js',
      loadResponseFile: async () => new Uint8Array(),
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
      urlPattern: '*://*:*/*app.js',
      resourceType: 'script',
      kind: 'file',
      responseFilePath: '/tmp/app.js',
      loadResponseFile: async () => new Uint8Array(),
    });
    const fetch = await manager.mock({
      urlPattern: '*://*:*/*app.js',
      resourceType: 'fetch',
      kind: 'file',
      responseFilePath: '/tmp/app.js',
      loadResponseFile: async () => new Uint8Array(),
    });
    const other = await manager.mock({
      urlPattern: '*://*:*/*other.js',
      kind: 'file',
      responseFilePath: '/tmp/app.js',
      loadResponseFile: async () => new Uint8Array(),
    });
    assert.deepEqual(manager.list({urlPattern: '*://*:*/*app.js'}), [
      script,
      fetch,
    ]);
    assert.deepEqual(manager.list({resourceType: 'script'}), [script]);
    assert.equal(
      await manager.remove({
        urlPattern: '*://*:*/*app.js',
        resourceType: 'script',
      }),
      1,
    );
    assert.deepEqual(manager.list(), [fetch, other]);
    assert.equal(await manager.remove({urlPattern: '*://*:*/*app*'}), 0);
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
    const previous = await manager.mock({
      urlPattern: '*://*:*/*app.js',
      abort: true,
    });
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
    pptrPage.emit('request', request);
    await settle();
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
    assert.equal(scripts.urlPattern, '*://*:*/*');
    assert.equal(updated.id, scripts.id);
    assert.deepEqual(manager.list(), [all, updated]);
    const request = createMockHTTPRequest({
      url: 'http://localhost:8080/app.js?v=1',
    });
    pptrPage.emit('request', request);
    await settle();
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
      urlPattern: '*://*:*/*app.js',
      responseFilePath: '/tmp/app.js',
      loadResponseFile,
    });
    await manager.mock({urlPattern: '*://*:*/*app.js', abort: true});
    const blocked = createMockHTTPRequest();
    pptrPage.emit('request', blocked);
    await settle();
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
    await manager.mock({urlPattern: '*://*:*/*app.js', abort: false});
    const restored = createMockHTTPRequest();
    pptrPage.emit('request', restored);
    await settle();
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
    const loadResponseFile = sinon
      .stub()
      .resolves(new TextEncoder().encode('replacement'));
    await manager.mock({
      kind: 'file',
      urlPattern: '*://*:*/*app.js',
      responseFilePath: '/tmp/app.js',
      loadResponseFile,
      allowOrigin: 'https://consumer.example',
    });
    await manager.mock({
      kind: 'file',
      urlPattern: '*://*:*/*app.js',
      responseFilePath: '/tmp/app.js',
      loadResponseFile,
    });
    const request = createMockHTTPRequest();
    pptrPage.emit('request', request);
    await settle();
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

  it('rejects allowOrigin without a body or upstream before activating interception', async () => {
    const pptrPage = createMockPuppeteerPage();
    const manager = new NetworkOverrideManager(
      pptrPage,
      createMockServerConfig(),
    );
    for (const abort of [undefined, true, false]) {
      await assert.rejects(
        manager.mock({allowOrigin: '*', abort}),
        /allowOrigin requires a body or upstream/,
      );
    }
    assert.deepEqual(manager.list(), []);
    sinon.assert.notCalled(pptrPage.setCacheEnabled);
    await manager.dispose();
  });

  it('rejects allowOrigin updates to a rule without a source and preserves its state', async () => {
    const pptrPage = createMockPuppeteerPage();
    const manager = new NetworkOverrideManager(
      pptrPage,
      createMockServerConfig(),
    );
    const previous = await manager.mock({abort: true});
    await assert.rejects(
      manager.mock({allowOrigin: '*', abort: false}),
      /allowOrigin requires a body or upstream/,
    );
    assert.deepEqual(manager.list(), [previous]);
    await manager.dispose();
  });

  it('does not retry a rejected abort or record a replacement error', async () => {
    const pptrPage = createMockPuppeteerPage();
    const manager = new NetworkOverrideManager(
      pptrPage,
      createMockServerConfig(),
    );
    await manager.mock({abort: true});
    const request = createMockHTTPRequest();
    request.abort.rejects(new Error('Request is already handled'));
    pptrPage.emit('request', request);
    await settle();
    sinon.assert.calledOnceWithExactly(request.abort, 'failed');
    sinon.assert.notCalled(request.respond);
    sinon.assert.notCalled(request.continue);
    assert.deepEqual(manager.list()[0]?.diagnostics, {
      hits: 1,
      errors: 0,
      navigations: 0,
    });
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
      kind: 'upstream',
      urlPattern: '*://*:*/*app.js',
      upstreamUrl: 'https://example.com/start',
    });
    const fetch = sinon.stub(globalThis, 'fetch').resolves(
      new Response(null, {
        status: 302,
        headers: {location: 'https://blocked.example/private'},
      }),
    );
    const request = createMockHTTPRequest();
    pptrPage.emit('request', request);
    await settle();
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

  for (const {upstream, headers} of [
    {
      upstream: 'https://example.com/replacement.js',
      headers: {accept: 'text/javascript', authorization: 'secret'},
    },
    {
      upstream: 'https://cdn.example/replacement.js',
      headers: {accept: 'text/javascript'},
    },
  ]) {
    it('does not forward Accept-Encoding to ' + upstream, async () => {
      const pptrPage = createMockPuppeteerPage();
      const manager = new NetworkOverrideManager(
        pptrPage,
        createMockServerConfig(),
      );
      await manager.mock({
        kind: 'upstream',
        urlPattern: '*://*:*/*app.js',
        upstreamUrl: upstream,
      });
      const fetch = sinon
        .stub(globalThis, 'fetch')
        .resolves(new Response('js'));
      const request = createMockHTTPRequest();
      request.headers.returns(
        Object.freeze({
          Accept: 'text/javascript',
          'Accept-Encoding': 'gzip, deflate, br, zstd',
          Authorization: 'secret',
        }),
      );
      pptrPage.emit('request', request);
      await settle();
      sinon.assert.calledOnceWithExactly(fetch, new URL(upstream), {
        redirect: 'manual',
        method: 'GET',
        headers,
      });
      sinon.assert.notCalled(request.abort);
      await manager.dispose();
    });
  }

  it('preserves multiple Set-Cookie headers in upstream responses', async () => {
    const pptrPage = createMockPuppeteerPage();
    const manager = new NetworkOverrideManager(
      pptrPage,
      createMockServerConfig(),
    );
    await manager.mock({
      kind: 'upstream',
      urlPattern: '*://*:*/*app.js',
      upstreamUrl: 'https://example.com/replacement.js',
    });
    const cookies = [
      'session=abc; Path=/; HttpOnly',
      'theme=dark; Expires=Wed, 21 Oct 2037 07:28:00 GMT; Path=/',
    ];
    const headers = new Headers({'content-type': 'text/javascript'});
    for (const cookie of cookies) {
      headers.append('set-cookie', cookie);
    }
    sinon.stub(globalThis, 'fetch').resolves(new Response('js', {headers}));
    const request = createMockHTTPRequest();
    pptrPage.emit('request', request);
    await settle();
    sinon.assert.calledOnceWithExactly(request.respond, {
      status: 200,
      headers: {
        'content-type': 'text/javascript',
        'set-cookie': cookies,
      },
      body: new TextEncoder().encode('js'),
    });
    sinon.assert.notCalled(request.abort);
    await manager.dispose();
  });

  it('updates allow-origin on an existing upstream source and fulfills decoded bodies without stale compression headers', async () => {
    const pptrPage = createMockPuppeteerPage();
    const manager = new NetworkOverrideManager(
      pptrPage,
      createMockServerConfig(),
    );
    await manager.mock({
      kind: 'upstream',
      urlPattern: '*://*:*/*app.js',
      upstreamUrl: 'https://example.com/replacement.js',
    });
    await manager.mock({urlPattern: '*://*:*/*app.js', allowOrigin: '*'});
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
    pptrPage.emit('request', request);
    await settle();
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

  it('rejects unsupported upstream methods before fetching', async () => {
    const pptrPage = createMockPuppeteerPage();
    const manager = new NetworkOverrideManager(
      pptrPage,
      createMockServerConfig(),
    );
    await manager.mock({
      kind: 'upstream',
      urlPattern: '*://*:*/*app.js',
      upstreamUrl: 'https://example.com/replacement.js',
    });
    const fetch = sinon.stub(globalThis, 'fetch');
    const request = createMockHTTPRequest();
    request.method.returns('POST');
    pptrPage.emit('request', request);
    await settle();
    sinon.assert.notCalled(fetch);
    sinon.assert.calledOnceWithExactly(request.abort, 'failed');
    assert.match(
      manager.list()[0]?.diagnostics.lastError ?? '',
      /only support GET and HEAD/,
    );
    await manager.dispose();
  });
});
