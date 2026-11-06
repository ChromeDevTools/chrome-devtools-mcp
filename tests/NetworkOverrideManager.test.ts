/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import sinon from 'sinon';

import {NetworkOverrideManager} from '../src/NetworkOverrideManager.js';
import {createMockHTTPRequest, createMockPuppeteerPage} from './mocks.js';
import {NetworkOverridesFormatter} from '../src/formatters/NetworkOverridesFormatter.js';

describe('NetworkOverrideManager', () => {
  it('counts only matching requests and returns independent diagnostic snapshots', async () => {
    const pptrPage = createMockPuppeteerPage();
    const manager = new NetworkOverrideManager(pptrPage);
    const initial = await manager.mock({
      kind: 'file',
      urlPattern: '*app.js',
      resourceType: 'script',
      responseFilePath: '/tmp/replacement.js',
      loadResponseFile: async () => new Uint8Array(),
    });
    const handle = pptrPage.on.firstCall.args[1];
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

  it('warns when nothing matched after navigation and removes navigation listeners', async () => {
    const pptrPage = createMockPuppeteerPage();
    const manager = new NetworkOverrideManager(pptrPage);
    await manager.mock({
      kind: 'file',
      urlPattern: '*missing.js',
      responseFilePath: '/tmp/replacement.js',
      loadResponseFile: async () => new Uint8Array(),
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
    const manager = new NetworkOverrideManager(pptrPage);
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
    const manager = new NetworkOverrideManager(pptrPage);
    const unrelated = await manager.mock({
      kind: 'file',
      urlPattern: '*old.js',
      responseFilePath: '/tmp/old.js',
      loadResponseFile: async () => new Uint8Array(),
    });
    const previous = await manager.mock({
      kind: 'file',
      urlPattern: '*new.js',
      responseFilePath: '/tmp/new.js',
      loadResponseFile: async () => new Uint8Array(),
    });
    const updated = await manager.mock({
      kind: 'file',
      urlPattern: '*new.js',
      responseFilePath: '/tmp/updated.js',
      loadResponseFile: async () => new Uint8Array(),
    });
    assert.deepEqual(manager.list(), [unrelated, updated]);
    assert.equal(updated.id, previous.id);
    assert.equal(updated.kind, 'file');
    sinon.assert.calledOnceWithExactly(pptrPage.setRequestInterception, true);
    await manager.dispose();
  });

  it('validates a local file before updating an existing rule', async () => {
    const pptrPage = createMockPuppeteerPage();
    const manager = new NetworkOverrideManager(pptrPage);
    const previous = await manager.mock({
      kind: 'file',
      urlPattern: '*app.js',
      responseFilePath: '/tmp/app.js',
      loadResponseFile: async () => new Uint8Array(),
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
    const manager = new NetworkOverrideManager(pptrPage);
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
        responseFilePath: '/tmp/app.js',
        contentType: 'application/javascript; charset=utf-8',
      },
    );
    sinon.assert.calledOnceWithExactly(loadResponseFile);
    await manager.dispose();
  });

  it('rolls back the rule set when activation fails', async () => {
    const pptrPage = createMockPuppeteerPage();
    const manager = new NetworkOverrideManager(pptrPage);
    pptrPage.setRequestInterception
      .withArgs(true)
      .rejects(new Error('Target closed'));
    await assert.rejects(
      manager.mock({
        kind: 'file',
        urlPattern: '*app.js',
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
    const manager = new NetworkOverrideManager(pptrPage);
    const previous = await manager.mock({
      kind: 'file',
      urlPattern: '*app.js',
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
    const manager = new NetworkOverrideManager(pptrPage);
    const script = await manager.mock({
      urlPattern: '*app.js',
      resourceType: 'script',
      kind: 'file',
      responseFilePath: '/tmp/app.js',
      loadResponseFile: async () => new Uint8Array(),
    });
    const fetch = await manager.mock({
      urlPattern: '*app.js',
      resourceType: 'fetch',
      kind: 'file',
      responseFilePath: '/tmp/app.js',
      loadResponseFile: async () => new Uint8Array(),
    });
    const other = await manager.mock({
      urlPattern: '*other.js',
      kind: 'file',
      responseFilePath: '/tmp/app.js',
      loadResponseFile: async () => new Uint8Array(),
    });
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
    const manager = new NetworkOverrideManager(pptrPage);
    const previous = await manager.mock({
      urlPattern: '*app.js',
      kind: 'file',
      responseFilePath: '/tmp/app.js',
      loadResponseFile: async () => new Uint8Array(),
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
    await pptrPage.on.thirdCall.args[1](request);
    sinon.assert.calledOnceWithExactly(request.respond, {
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      headers: {'Cache-Control': 'no-store'},
      body: new Uint8Array(),
    });
    sinon.assert.notCalled(request.continue);
    await manager.dispose();
  });

  it('uses all URLs when route is omitted and updates only the exact filter pair', async () => {
    const pptrPage = createMockPuppeteerPage();
    const manager = new NetworkOverrideManager(pptrPage);
    const scripts = await manager.mock({
      resourceType: 'script',
      kind: 'file',
      responseFilePath: '/tmp/app.js',
      loadResponseFile: async () => new Uint8Array(),
    });
    const all = await manager.mock({
      kind: 'file',
      responseFilePath: '/tmp/app.js',
      loadResponseFile: async () => new Uint8Array(),
    });
    const updated = await manager.mock({
      resourceType: 'script',
      kind: 'file',
      responseFilePath: '/tmp/updated.js',
      loadResponseFile: async () => new Uint8Array(),
    });
    assert.equal(scripts.urlPattern, '*');
    assert.equal(updated.id, scripts.id);
    assert.deepEqual(manager.list(), [all, updated]);
    const request = createMockHTTPRequest();
    await pptrPage.on.firstCall.args[1](request);
    sinon.assert.calledOnceWithExactly(request.respond, {
      status: 200,
      contentType: 'application/javascript; charset=utf-8',
      headers: {'Cache-Control': 'no-store'},
      body: new Uint8Array(),
    });
    sinon.assert.notCalled(request.abort);
    assert.equal(
      manager.list({resourceType: 'script'})[0]?.diagnostics.hits,
      1,
    );
    assert.equal(manager.list()[0]?.diagnostics.hits, 0);
    await manager.dispose();
  });
});
