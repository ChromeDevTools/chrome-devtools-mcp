/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it, afterEach} from 'node:test';

import {SessionManager} from '../src/SessionManager.js';
import type {SessionInfo} from '../src/SessionManager.js';

const contextOptions = {
  experimentalDevToolsDebugging: false,
  performanceCrux: false,
};

describe('SessionManager', () => {
  const managers: SessionManager[] = [];

  function createManager(): SessionManager {
    const m = new SessionManager(contextOptions);
    managers.push(m);
    return m;
  }

  afterEach(async () => {
    for (const m of managers) {
      try {
        await m.closeAllSessions();
      } catch {
        // ignore
      }
    }
    managers.length = 0;
  });

  describe('createSession', () => {
    it('creates a session and returns session info', async () => {
      const manager = createManager();
      const session = await manager.createSession({headless: true});

      assert.ok(session.sessionId, 'sessionId should exist');
      assert.strictEqual(
        session.sessionId.length,
        8,
        'sessionId should be 8 chars',
      );
      assert.ok(session.browser, 'browser should exist');
      assert.ok(session.browser.connected, 'browser should be connected');
      assert.ok(session.context, 'context should exist');
      assert.ok(session.mutex, 'mutex should exist');
      assert.ok(session.createdAt instanceof Date, 'createdAt should be Date');
      assert.strictEqual(manager.sessionCount, 1);
    });

    it('assigns label when provided', async () => {
      const manager = createManager();
      const session = await manager.createSession({
        headless: true,
        label: 'test-label',
      });

      assert.strictEqual(session.label, 'test-label');
    });

    it('generates unique session IDs', async () => {
      const manager = createManager();
      const session1 = await manager.createSession({headless: true});
      const session2 = await manager.createSession({headless: true});

      assert.notStrictEqual(
        session1.sessionId,
        session2.sessionId,
        'session IDs must be unique',
      );
      assert.strictEqual(manager.sessionCount, 2);
    });

    it('rejects creation when shutting down', async () => {
      const manager = createManager();
      await manager.closeAllSessions();

      await assert.rejects(
        () => manager.createSession({headless: true}),
        {message: /shutting down/i},
      );
    });
  });

  describe('getSession', () => {
    it('returns session by ID', async () => {
      const manager = createManager();
      const session = await manager.createSession({headless: true});
      const retrieved = manager.getSession(session.sessionId);

      assert.strictEqual(retrieved.sessionId, session.sessionId);
      assert.strictEqual(retrieved.browser, session.browser);
      assert.strictEqual(retrieved.context, session.context);
    });

    it('throws for unknown session ID', () => {
      const manager = createManager();

      assert.throws(
        () => manager.getSession('deadbeef'),
        {message: /not found/i},
      );
    });

    it('throws and purges for disconnected browser', async () => {
      const manager = createManager();
      const session = await manager.createSession({headless: true});

      await session.browser.close();
      await new Promise(resolve => setTimeout(resolve, 100));

      assert.throws(
        () => manager.getSession(session.sessionId),
        {message: /not found|disconnected/i},
      );
      assert.strictEqual(manager.sessionCount, 0);
    });
  });

  describe('listSessions', () => {
    it('returns empty list when no sessions', () => {
      const manager = createManager();
      const list = manager.listSessions();
      assert.deepStrictEqual(list, []);
    });

    it('returns all active sessions', async () => {
      const manager = createManager();
      await manager.createSession({headless: true, label: 'one'});
      await manager.createSession({headless: true, label: 'two'});

      const list = manager.listSessions();
      assert.strictEqual(list.length, 2);

      const labels = list.map(s => s.label).sort();
      assert.deepStrictEqual(labels, ['one', 'two']);
      for (const s of list) {
        assert.ok(s.sessionId);
        assert.ok(s.createdAt);
        assert.strictEqual(s.connected, true);
      }
    });
  });

  describe('closeSession', () => {
    it('closes and removes session', async () => {
      const manager = createManager();
      const session = await manager.createSession({headless: true});

      assert.strictEqual(manager.sessionCount, 1);
      await manager.closeSession(session.sessionId);
      assert.strictEqual(manager.sessionCount, 0);
    });

    it('throws for unknown session ID', async () => {
      const manager = createManager();

      await assert.rejects(
        () => manager.closeSession('deadbeef'),
        {message: /not found/i},
      );
    });

    it('handles already-disconnected browser gracefully', async () => {
      const manager = createManager();
      const session = await manager.createSession({headless: true});
      const id = session.sessionId;

      await session.browser.close();
      await new Promise(resolve => setTimeout(resolve, 100));

      try {
        await manager.closeSession(id);
      } catch {
        // auto-purge may have already removed it — that's the expected behavior
      }
      assert.strictEqual(manager.sessionCount, 0);
    });
  });

  describe('closeAllSessions', () => {
    it('closes all sessions', async () => {
      const manager = createManager();
      await manager.createSession({headless: true});
      await manager.createSession({headless: true});
      await manager.createSession({headless: true});

      assert.strictEqual(manager.sessionCount, 3);
      await manager.closeAllSessions();
      assert.strictEqual(manager.sessionCount, 0);
    });
  });

  describe('parallel sessions', () => {
    it('two sessions can navigate to different URLs independently', async () => {
      const manager = createManager();
      const session1 = await manager.createSession({headless: true});
      const session2 = await manager.createSession({headless: true});

      const page1 = session1.context.getSelectedPage();
      const page2 = session2.context.getSelectedPage();

      await Promise.all([
        page1.goto('data:text/html,<h1>Session One</h1>'),
        page2.goto('data:text/html,<h1>Session Two</h1>'),
      ]);

      const title1 = await page1.evaluate(
        () => document.querySelector('h1')?.textContent,
      );
      const title2 = await page2.evaluate(
        () => document.querySelector('h1')?.textContent,
      );

      assert.strictEqual(title1, 'Session One');
      assert.strictEqual(title2, 'Session Two');
    });

    it('closing one session does not affect another', async () => {
      const manager = createManager();
      const session1 = await manager.createSession({headless: true});
      const session2 = await manager.createSession({headless: true});

      await manager.closeSession(session1.sessionId);

      assert.strictEqual(manager.sessionCount, 1);
      assert.ok(session2.browser.connected, 'session2 browser should still be connected');

      const page2 = session2.context.getSelectedPage();
      await page2.goto('data:text/html,<p>Still alive</p>');
      const text = await page2.evaluate(
        () => document.querySelector('p')?.textContent,
      );
      assert.strictEqual(text, 'Still alive');
    });

    it('per-session mutex serializes within session but allows cross-session parallelism', async () => {
      const manager = createManager();
      const session1 = await manager.createSession({headless: true});
      const session2 = await manager.createSession({headless: true});

      const order: string[] = [];

      const guard1 = await session1.mutex.acquire();

      const session1SecondAcquire = session1.mutex.acquire().then(g => {
        order.push('s1-second');
        g.dispose();
      });

      const guard2 = await session2.mutex.acquire();
      order.push('s2-first');
      guard2.dispose();

      guard1.dispose();
      await session1SecondAcquire;

      assert.strictEqual(order[0], 's2-first', 'session2 should acquire before session1 second acquire');
      assert.strictEqual(order[1], 's1-second');
    });
  });

  describe('auto-purge on disconnect', () => {
    it('removes session when browser disconnects unexpectedly', async () => {
      const manager = createManager();
      const session = await manager.createSession({headless: true});

      assert.strictEqual(manager.sessionCount, 1);

      const browserProcess = session.browser.process();
      if (browserProcess) {
        browserProcess.kill('SIGKILL');
        await new Promise<void>(resolve => {
          session.browser.on('disconnected', () => resolve());
        });
      } else {
        await session.browser.close();
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      assert.strictEqual(
        manager.sessionCount,
        0,
        'session should be auto-purged after disconnect',
      );
    });
  });
});
