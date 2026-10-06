/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {afterEach, describe, it} from 'node:test';

import sinon from 'sinon';

import {BrowserManager} from '../src/BrowserManager.js';
import {ConfigParser} from '../src/config/ConfigParser.js';
import {McpServer} from '../src/index.js';
import {McpContext} from '../src/McpContext.js';
import {ClearcutLogger} from '../src/telemetry/ClearcutLogger.js';

import {createMockMcpContext, createMockPuppeteerBrowser} from './mocks.js';
import {createTempFile} from './utils.js';

describe('McpServer', () => {
  afterEach(() => {
    sinon.restore();
    ClearcutLogger.resetForTesting();
  });

  async function createTestServer(extraArgs: string[] = []) {
    const browserManager = sinon.createStubInstance(BrowserManager);
    const browser = createMockPuppeteerBrowser();
    browserManager.ensureBrowser.resolves(browser);

    const context = createMockMcpContext();
    context.browser = browser;
    context.getPages.returns([]);
    sinon.stub(McpContext, 'from').resolves(context);

    const serverArgs = new ConfigParser(
      '1.0.0',
      ['node', 'script.js', ...extraArgs],
      {
        CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: 'true',
      },
    ).parse();
    const server = await McpServer.from(serverArgs, {browserManager});
    return {server, browserManager, context};
  }

  describe('callTool', () => {
    it('returns an error for unknown tool names', async () => {
      const {server, browserManager} = await createTestServer();

      const result = await server.callTool('unknown_tool');

      assert.strictEqual(result.isError, true);
      assert.deepStrictEqual(result.content, [
        {
          type: 'text',
          text: 'Tool unknown_tool not found',
        },
      ]);
      sinon.assert.notCalled(browserManager.ensureBrowser);
    });

    it('returns a validation error when arguments fail Zod schema validation', async () => {
      const {server, browserManager} = await createTestServer();

      const result = await server.callTool('navigate_page', {url: 123});

      assert.strictEqual(result.isError, true);
      assert.strictEqual(result.content.length, 1);
      const firstBlock = result.content[0];
      assert.strictEqual(firstBlock.type, 'text');
      assert.match(
        firstBlock.text,
        /^Input validation error: Invalid arguments for tool navigate_page:/,
      );
      sinon.assert.notCalled(browserManager.ensureBrowser);
    });

    it('executes the tool handler when arguments are valid', async () => {
      const {server, browserManager, context} = await createTestServer();

      const result = await server.callTool('list_pages', {});

      assert.strictEqual(result.isError, undefined);
      sinon.assert.calledOnce(browserManager.ensureBrowser);
      sinon.assert.calledOnce(context.createPagesSnapshot);
    });
  });

  describe('slim mode', () => {
    it('does not register slim tools without --slim', async () => {
      const {server} = await createTestServer();

      const result = await server.callTool('navigate', {url: 'about:blank'});

      assert.deepStrictEqual(result.content, [
        {type: 'text', text: 'Tool navigate not found'},
      ]);
    });

    it('registers only slim tools with --slim', async () => {
      const {server} = await createTestServer(['--slim']);

      const result = await server.callTool('list_pages');

      assert.deepStrictEqual(result.content, [
        {type: 'text', text: 'Tool list_pages not found'},
      ]);
    });
  });

  describe('oninitialized', () => {
    const tempDirectoryWarning =
      '[chrome-devtools-mcp] The connecting client did not negotiate the MCP roots ' +
      'capability. File-writing tools will be restricted to the OS temp directory. ' +
      'To restore the previous unrestricted behavior, start the server with ' +
      '--allow-unrestricted-paths.';

    async function warnOnInitialized(
      extraArgs: string[] = [],
      clientHasRoots = false,
    ) {
      const {server} = await createTestServer(extraArgs);
      const protocol = server.server.server;
      sinon
        .stub(protocol, 'getClientCapabilities')
        .returns(clientHasRoots ? {roots: {}} : {});
      sinon.stub(protocol, 'getClientVersion').returns(undefined);
      if (clientHasRoots) {
        sinon.stub(protocol, 'request').resolves({roots: []});
      }
      const warnStub = sinon.stub(console, 'warn');
      const oninitialized = protocol.oninitialized;
      assert.ok(oninitialized);
      oninitialized();
      await Promise.resolve();
      return warnStub;
    }

    it('warns when default flags meet a client without roots', async () => {
      const warnStub = await warnOnInitialized();

      sinon.assert.calledOnceWithExactly(warnStub, tempDirectoryWarning);
    });

    it('warns when filesystem roots are explicitly empty', async () => {
      using configFile = createTempFile(
        JSON.stringify({filesystemRoot: []}),
        'cd4a.test.config.empty-filesystem-root.json',
      );

      const warnStub = await warnOnInitialized(['--config', configFile.path]);

      sinon.assert.calledOnceWithExactly(warnStub, tempDirectoryWarning);
    });

    it('does not warn for an explicit workspace', async () => {
      const warnStub = await warnOnInitialized([
        '--workspace=/tmp/explicit-workspace',
      ]);

      sinon.assert.notCalled(warnStub);
    });

    it('does not warn when unrestricted paths are allowed', async () => {
      const warnStub = await warnOnInitialized(['--allow-unrestricted-paths']);

      sinon.assert.notCalled(warnStub);
    });

    it('does not warn when started via the CLI', async () => {
      const warnStub = await warnOnInitialized(['--viaCli']);

      sinon.assert.notCalled(warnStub);
    });

    it('does not warn when the client negotiates roots', async () => {
      const warnStub = await warnOnInitialized([], true);

      sinon.assert.notCalled(warnStub);
    });
  });
});
