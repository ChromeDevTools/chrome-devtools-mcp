/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import sinon from 'sinon';

import type {SessionManager} from '../../src/SessionManager.js';
import type {SessionInfo} from '../../src/SessionManager.js';
import {ToolCategory} from '../../src/tools/categories.js';
import {createSessionTools} from '../../src/tools/sessions.js';

function createMockSessionManager(
  overrides: Partial<SessionManager> = {},
): SessionManager {
  return {
    launchSession: sinon.stub().resolves({id: 1, name: 'launched-session'}),
    connectSession: sinon.stub().resolves({id: 2, name: 'connected-session'}),
    listSessions: sinon.stub().returns([]),
    selectSession: sinon.stub(),
    selectSessionByName: sinon.stub(),
    closeSession: sinon.stub().resolves(),
    hasActiveSession: sinon.stub().returns(false),
    getActiveContext: sinon.stub(),
    disposeAll: sinon.stub().resolves(),
    createDefaultSession: sinon.stub().resolves(),
    ...overrides,
  } as unknown as SessionManager;
}

describe('session tools', () => {
  it('creates 4 tools', () => {
    const manager = createMockSessionManager();
    const tools = createSessionTools(manager);
    assert.strictEqual(tools.length, 4);
    const names = tools.map(t => t.name);
    assert.deepStrictEqual(names, [
      'create_session',
      'list_sessions',
      'select_session',
      'close_session',
    ]);
  });

  it('all tools have SESSION category', () => {
    const manager = createMockSessionManager();
    const tools = createSessionTools(manager);
    for (const tool of tools) {
      assert.strictEqual(tool.annotations.category, ToolCategory.SESSION);
    }
  });

  describe('create_session', () => {
    it('launches a session with type=launch', async () => {
      const manager = createMockSessionManager();
      const tools = createSessionTools(manager);
      const createTool = tools.find(t => t.name === 'create_session')!;

      const result = await createTool.handler({
        type: 'launch',
        name: 'my-browser',
        headless: true,
      });

      assert.ok(result.includes('launched'));
      assert.ok(
        (manager.launchSession as sinon.SinonStub).calledOnceWith({
          name: 'my-browser',
          headless: true,
          channel: undefined,
          isolated: undefined,
        }),
      );
    });

    it('connects a session with type=connect', async () => {
      const manager = createMockSessionManager();
      const tools = createSessionTools(manager);
      const createTool = tools.find(t => t.name === 'create_session')!;

      const result = await createTool.handler({
        type: 'connect',
        browserUrl: 'http://127.0.0.1:9222',
      });

      assert.ok(result.includes('connected'));
      assert.ok(
        (manager.connectSession as sinon.SinonStub).calledOnceWith({
          name: undefined,
          browserUrl: 'http://127.0.0.1:9222',
          wsEndpoint: undefined,
          wsHeaders: undefined,
        }),
      );
    });
  });

  describe('list_sessions', () => {
    it('returns message when no sessions', async () => {
      const manager = createMockSessionManager();
      const tools = createSessionTools(manager);
      const listTool = tools.find(t => t.name === 'list_sessions')!;

      const result = await listTool.handler({});
      assert.strictEqual(result, 'No active sessions.');
    });

    it('lists sessions with details', async () => {
      const sessions: SessionInfo[] = [
        {
          id: 1,
          name: 'alpha',
          connectionType: 'launched',
          connectionInfo: 'stable',
          isActive: true,
          pageCount: 3,
        },
        {
          id: 2,
          name: 'beta',
          connectionType: 'connected',
          connectionInfo: 'http://127.0.0.1:9222',
          isActive: false,
          pageCount: 1,
        },
      ];
      const manager = createMockSessionManager({
        listSessions: sinon.stub().returns(sessions) as unknown as SessionManager['listSessions'],
      });
      const tools = createSessionTools(manager);
      const listTool = tools.find(t => t.name === 'list_sessions')!;

      const result = await listTool.handler({});
      assert.ok(result.includes('## Sessions'));
      assert.ok(result.includes('"alpha" [active]'));
      assert.ok(result.includes('"beta"'));
      assert.ok(result.includes('3 pages'));
      assert.ok(result.includes('1 page'));
      assert.ok(!result.includes('1 pages'));
    });
  });

  describe('select_session', () => {
    it('selects by sessionId', async () => {
      const sessions: SessionInfo[] = [
        {
          id: 1,
          name: 'alpha',
          connectionType: 'launched',
          connectionInfo: 'stable',
          isActive: true,
          pageCount: 1,
        },
      ];
      const manager = createMockSessionManager({
        listSessions: sinon.stub().returns(sessions) as unknown as SessionManager['listSessions'],
      });
      const tools = createSessionTools(manager);
      const selectTool = tools.find(t => t.name === 'select_session')!;

      const result = await selectTool.handler({sessionId: 1});
      assert.ok((manager.selectSession as sinon.SinonStub).calledOnceWith(1));
      assert.ok(result.includes('Switched to session 1'));
    });

    it('selects by name', async () => {
      const sessions: SessionInfo[] = [
        {
          id: 1,
          name: 'alpha',
          connectionType: 'launched',
          connectionInfo: 'stable',
          isActive: true,
          pageCount: 1,
        },
      ];
      const manager = createMockSessionManager({
        listSessions: sinon.stub().returns(sessions) as unknown as SessionManager['listSessions'],
      });
      const tools = createSessionTools(manager);
      const selectTool = tools.find(t => t.name === 'select_session')!;

      const result = await selectTool.handler({name: 'alpha'});
      assert.ok(
        (manager.selectSessionByName as sinon.SinonStub).calledOnceWith(
          'alpha',
        ),
      );
      assert.ok(result.includes('"alpha"'));
    });

    it('throws when neither sessionId nor name provided', async () => {
      const manager = createMockSessionManager();
      const tools = createSessionTools(manager);
      const selectTool = tools.find(t => t.name === 'select_session')!;

      await assert.rejects(
        () => selectTool.handler({}),
        /Either sessionId or name must be provided/,
      );
    });
  });

  describe('close_session', () => {
    it('closes a session and reports remaining', async () => {
      const remaining: SessionInfo[] = [
        {
          id: 1,
          name: 'alpha',
          connectionType: 'launched',
          connectionInfo: 'stable',
          isActive: true,
          pageCount: 1,
        },
      ];
      const manager = createMockSessionManager({
        listSessions: sinon.stub().returns(remaining) as unknown as SessionManager['listSessions'],
      });
      const tools = createSessionTools(manager);
      const closeTool = tools.find(t => t.name === 'close_session')!;

      const result = await closeTool.handler({sessionId: 2});
      assert.ok((manager.closeSession as sinon.SinonStub).calledOnceWith(2));
      assert.ok(result.includes('Closed session 2'));
      assert.ok(result.includes('Active session: 1'));
    });

    it('reports no remaining sessions', async () => {
      const manager = createMockSessionManager();
      const tools = createSessionTools(manager);
      const closeTool = tools.find(t => t.name === 'close_session')!;

      const result = await closeTool.handler({sessionId: 1});
      assert.ok(result.includes('No active sessions remaining'));
    });
  });
});
