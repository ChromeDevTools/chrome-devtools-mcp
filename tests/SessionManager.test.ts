/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {afterEach, describe, it} from 'node:test';

import {executablePath} from 'puppeteer';

import {SessionManager} from '../src/SessionManager.js';

describe('SessionManager', () => {
  const contextOpts = {
    experimentalDevToolsDebugging: false,
    performanceCrux: false,
  };

  const managers: SessionManager[] = [];

  afterEach(async () => {
    for (const manager of managers) {
      await manager.disposeAll();
    }
    managers.length = 0;
  });

  function createManager(): SessionManager {
    const m = new SessionManager(contextOpts);
    managers.push(m);
    return m;
  }

  const launchOpts = {
    headless: true,
    isolated: true,
    executablePath: executablePath(),
  };

  describe('hasActiveSession', () => {
    it('returns false when no sessions exist', () => {
      const manager = createManager();
      assert.strictEqual(manager.hasActiveSession(), false);
    });

    it('returns true after launching a session', async () => {
      const manager = createManager();
      await manager.launchSession(launchOpts);
      assert.strictEqual(manager.hasActiveSession(), true);
    });
  });

  describe('getActiveContext', () => {
    it('throws when no active session', () => {
      const manager = createManager();
      assert.throws(() => manager.getActiveContext(), /No active session/);
    });

    it('returns context of active session', async () => {
      const manager = createManager();
      await manager.launchSession(launchOpts);
      const context = manager.getActiveContext();
      assert.ok(context);
      assert.ok(context.getPages);
    });
  });

  describe('launchSession', () => {
    it('creates a session with auto-generated name', async () => {
      const manager = createManager();
      const session = await manager.launchSession(launchOpts);
      assert.strictEqual(session.name, 'session-1');
      assert.strictEqual(session.connectionType, 'launched');
    });

    it('creates a session with custom name', async () => {
      const manager = createManager();
      const session = await manager.launchSession({
        ...launchOpts,
        name: 'my-session',
      });
      assert.strictEqual(session.name, 'my-session');
    });

    it('rejects duplicate names', async () => {
      const manager = createManager();
      await manager.launchSession({...launchOpts, name: 'dup'});
      await assert.rejects(
        () => manager.launchSession({...launchOpts, name: 'dup'}),
        /already exists/,
      );
    });

    it('sets the new session as active', async () => {
      const manager = createManager();
      const s1 = await manager.launchSession({...launchOpts, name: 'first'});
      assert.strictEqual(
        manager.listSessions().find(s => s.isActive)?.id,
        s1.id,
      );

      const s2 = await manager.launchSession({...launchOpts, name: 'second'});
      assert.strictEqual(
        manager.listSessions().find(s => s.isActive)?.id,
        s2.id,
      );
    });

    it('increments session IDs', async () => {
      const manager = createManager();
      const s1 = await manager.launchSession({...launchOpts, name: 'a'});
      const s2 = await manager.launchSession({...launchOpts, name: 'b'});
      assert.strictEqual(s1.id, 1);
      assert.strictEqual(s2.id, 2);
    });
  });

  describe('selectSession', () => {
    it('selects by ID', async () => {
      const manager = createManager();
      const s1 = await manager.launchSession({...launchOpts, name: 'a'});
      await manager.launchSession({...launchOpts, name: 'b'});
      manager.selectSession(s1.id);
      assert.strictEqual(
        manager.listSessions().find(s => s.isActive)?.id,
        s1.id,
      );
    });

    it('throws for unknown ID', () => {
      const manager = createManager();
      assert.throws(() => manager.selectSession(999), /not found/);
    });
  });

  describe('selectSessionByName', () => {
    it('selects by name', async () => {
      const manager = createManager();
      const s1 = await manager.launchSession({...launchOpts, name: 'alpha'});
      await manager.launchSession({...launchOpts, name: 'beta'});
      manager.selectSessionByName('alpha');
      assert.strictEqual(
        manager.listSessions().find(s => s.isActive)?.id,
        s1.id,
      );
    });

    it('throws for unknown name', () => {
      const manager = createManager();
      assert.throws(
        () => manager.selectSessionByName('nope'),
        /not found/,
      );
    });
  });

  describe('closeSession', () => {
    it('closes a session and removes it from the list', async () => {
      const manager = createManager();
      const session = await manager.launchSession(launchOpts);
      await manager.closeSession(session.id);
      assert.strictEqual(manager.listSessions().length, 0);
    });

    it('auto-selects next session when active is closed', async () => {
      const manager = createManager();
      const s1 = await manager.launchSession({...launchOpts, name: 'a'});
      const s2 = await manager.launchSession({...launchOpts, name: 'b'});
      // s2 is active after creation
      await manager.closeSession(s2.id);
      assert.strictEqual(
        manager.listSessions().find(s => s.isActive)?.id,
        s1.id,
      );
    });

    it('clears active session when last session is closed', async () => {
      const manager = createManager();
      const session = await manager.launchSession(launchOpts);
      await manager.closeSession(session.id);
      assert.strictEqual(manager.hasActiveSession(), false);
    });

    it('throws for unknown session ID', async () => {
      const manager = createManager();
      await assert.rejects(
        () => manager.closeSession(999),
        /not found/,
      );
    });

    it('does not change active if non-active session is closed', async () => {
      const manager = createManager();
      const s1 = await manager.launchSession({...launchOpts, name: 'a'});
      const s2 = await manager.launchSession({...launchOpts, name: 'b'});
      // s2 is active
      await manager.closeSession(s1.id);
      assert.strictEqual(
        manager.listSessions().find(s => s.isActive)?.id,
        s2.id,
      );
    });
  });

  describe('listSessions', () => {
    it('returns empty array with no sessions', () => {
      const manager = createManager();
      assert.deepStrictEqual(manager.listSessions(), []);
    });

    it('returns session info with correct fields', async () => {
      const manager = createManager();
      await manager.launchSession({...launchOpts, name: 'test-session'});
      const sessions = manager.listSessions();
      assert.strictEqual(sessions.length, 1);
      assert.strictEqual(sessions[0].name, 'test-session');
      assert.strictEqual(sessions[0].connectionType, 'launched');
      assert.strictEqual(sessions[0].isActive, true);
      assert.strictEqual(typeof sessions[0].pageCount, 'number');
    });
  });

  describe('disposeAll', () => {
    it('closes all sessions and clears state', async () => {
      const manager = createManager();
      await manager.launchSession({...launchOpts, name: 'a'});
      await manager.launchSession({...launchOpts, name: 'b'});
      assert.strictEqual(manager.listSessions().length, 2);

      await manager.disposeAll();
      assert.strictEqual(manager.listSessions().length, 0);
      assert.strictEqual(manager.hasActiveSession(), false);
    });
  });
});
