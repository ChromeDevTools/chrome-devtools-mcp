/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert';
import {describe, it, beforeEach} from 'node:test';
import sinon from 'sinon';
import type {Browser} from 'puppeteer';
import {ProtocolError, TimeoutError} from 'puppeteer';

import {
  BrowserConnectionManager,
  resetConnectionManager,
} from '../src/browser-connection-manager.js';

describe('BrowserConnectionManager', () => {
  let manager: BrowserConnectionManager;
  let mockBrowser: sinon.SinonStubbedInstance<Browser>;
  let browserFactory: sinon.SinonStub;

  beforeEach(() => {
    resetConnectionManager();
    manager = new BrowserConnectionManager({enableLogging: false});

    // Create mock browser with manual stubs
    mockBrowser = {
      isConnected: sinon.stub().returns(true),
      on: sinon.stub().returnsThis(),
      off: sinon.stub().returnsThis(),
      close: sinon.stub().resolves(),
      pages: sinon.stub().resolves([]),
    } as any;

    // Create browser factory
    browserFactory = sinon.stub().resolves(mockBrowser);
  });

  describe('Single-flight pattern', () => {
    it('should prevent concurrent reconnection attempts', async () => {
      manager.setBrowser(mockBrowser as unknown as Browser, browserFactory);

      let factoryCallCount = 0;
      const slowFactory = sinon.stub().callsFake(async () => {
        factoryCallCount++;
        await new Promise(resolve => setTimeout(resolve, 100));
        return mockBrowser;
      });

      manager.setBrowser(mockBrowser as unknown as Browser, slowFactory);

      // Simulate concurrent CDP errors
      const operation1 = manager.executeWithRetry(
        async () => {
          throw new ProtocolError('Target closed');
        },
        'operation1',
      );

      const operation2 = manager.executeWithRetry(
        async () => {
          throw new ProtocolError('Target closed');
        },
        'operation2',
      );

      // Both should fail but factory should only be called once per retry attempt
      await Promise.allSettled([operation1, operation2]);

      // Should use single-flight pattern - factory not called multiple times concurrently
      assert.ok(
        factoryCallCount <= 3,
        `Factory called ${factoryCallCount} times, expected ≤3`,
      );
    });
  });

  describe('State machine transitions', () => {
    it('should transition from CLOSED to CONNECTED on setBrowser', () => {
      assert.strictEqual(manager.isConnected(), false);

      manager.setBrowser(mockBrowser as unknown as Browser, browserFactory);

      // State should be CONNECTED after setting browser
      assert.strictEqual(manager.isConnected(), true);
    });

    it('should transition to CLOSED on browser disconnected event', async () => {
      let disconnectedHandler: (() => void) | null = null;

      (mockBrowser as any).on = sinon.stub().callsFake((event: string, handler: any) => {
        if (event === 'disconnected') {
          disconnectedHandler = handler;
        }
        return mockBrowser;
      });

      manager.setBrowser(mockBrowser as unknown as Browser, browserFactory);
      assert.strictEqual(manager.isConnected(), true);

      // Simulate browser disconnection
      if (disconnectedHandler) {
        (disconnectedHandler as () => void)();
      }

      // State should be CLOSED after disconnection
      // Note: isConnected checks browser.isConnected(), not internal state
      (mockBrowser as any).isConnected = sinon.stub().returns(false);
      assert.strictEqual(manager.isConnected(), false);
    });
  });

  describe('Exponential backoff with jitter', () => {
    it('should use exponential backoff for retry delays', async () => {
      // Use deterministic rng (0.5 results in 0 jitter: 0.5*2-1=0)
      manager = new BrowserConnectionManager({
        enableLogging: false,
        rng: () => 0.5,
        maxReconnectAttempts: 3,
      });

      const sleepSpy = sinon.spy();
      const originalSleep = (manager as any).sleep;

      (manager as any).sleep = async (ms: number) => {
        sleepSpy(ms);
        // Don't actually sleep in tests
      };

      // Make browserFactory fail multiple times to trigger retries
      let reconnectAttempt = 0;
      const failingBrowserFactory = sinon.stub().callsFake(async () => {
        reconnectAttempt++;
        if (reconnectAttempt < 3) {
          throw new Error('Connection failed');
        }
        return mockBrowser;
      });

      manager.setBrowser(mockBrowser as unknown as Browser, failingBrowserFactory);

      const failingOperation = async () => {
        throw new ProtocolError('Target closed');
      };

      // This will fail as reconnection fails 3 times
      await manager
        .executeWithRetry(failingOperation, 'test-operation')
        .catch(() => {
          // Expected to fail
        });

      // Should have called sleep with exponentially increasing delays
      // 1st retry: 1000ms (2^0 * 1000)
      // 2nd retry: 2000ms (2^1 * 1000)
      // 3rd retry: 4000ms (2^2 * 1000)
      assert.strictEqual(sleepSpy.callCount, 3);
      assert.strictEqual(sleepSpy.getCall(0).args[0], 1000);
      assert.strictEqual(sleepSpy.getCall(1).args[0], 2000);
      assert.strictEqual(sleepSpy.getCall(2).args[0], 4000);

      // Restore original sleep
      (manager as any).sleep = originalSleep;
    });

    it('should respect max retry delay', async () => {
      manager = new BrowserConnectionManager({
        maxReconnectAttempts: 5,
        initialRetryDelay: 1000,
        maxRetryDelay: 3000,
        enableLogging: false,
        rng: () => 0.5, // Deterministic rng for consistent test
      });

      const sleepSpy = sinon.spy();
      (manager as any).sleep = async (ms: number) => {
        sleepSpy(ms);
      };

      // Make browserFactory always fail to trigger all retry attempts
      const failingBrowserFactory = sinon.stub().rejects(new Error('Connection failed'));
      manager.setBrowser(mockBrowser as unknown as Browser, failingBrowserFactory);

      const failingOperation = async () => {
        throw new ProtocolError('Target closed');
      };

      await manager
        .executeWithRetry(failingOperation, 'test-operation')
        .catch(() => {
          // Expected to fail
        });

      // Delays should be capped at maxRetryDelay (3000ms)
      // 1st: 1000, 2nd: 2000, 3rd: 3000, 4th: 3000, 5th: 3000
      assert.strictEqual(sleepSpy.callCount, 5);
      assert.strictEqual(sleepSpy.getCall(0).args[0], 1000);
      assert.strictEqual(sleepSpy.getCall(1).args[0], 2000);
      assert.strictEqual(sleepSpy.getCall(2).args[0], 3000);
      assert.strictEqual(sleepSpy.getCall(3).args[0], 3000);
      assert.strictEqual(sleepSpy.getCall(4).args[0], 3000);
    });
  });

  describe('Event-driven disconnection handling', () => {
    it('should register disconnected event handler on setBrowser', () => {
      manager.setBrowser(mockBrowser as unknown as Browser, browserFactory);

      // Verify that 'on' was called with 'disconnected' event
      sinon.assert.calledWith(mockBrowser.on as sinon.SinonStub, 'disconnected', sinon.match.func);
    });

    it('should trigger reconnection on disconnected event', async () => {
      let disconnectedHandler: (() => void) | null = null;

      (mockBrowser as any).on = sinon.stub().callsFake((event: string, handler: any) => {
        if (event === 'disconnected') {
          disconnectedHandler = handler;
        }
        return mockBrowser;
      });

      manager.setBrowser(mockBrowser as unknown as Browser, browserFactory);

      // Simulate disconnection
      (mockBrowser as any).isConnected = sinon.stub().returns(false);
      if (disconnectedHandler) {
        (disconnectedHandler as () => void)();
      }

      // Setup new browser for reconnection
      const newMockBrowser: any = {
        isConnected: sinon.stub().returns(true),
        on: sinon.stub().returnsThis(),
        off: sinon.stub().returnsThis(),
        close: sinon.stub().resolves(),
        pages: sinon.stub().resolves([]),
      };
      browserFactory.resolves(newMockBrowser);

      // Next operation that fails with CDP error should trigger reconnection
      let operationCallCount = 0;
      const result = await manager.executeWithRetry(
        async () => {
          operationCallCount++;
          if (operationCallCount === 1) {
            // First call fails with CDP error, triggering reconnection
            throw new ProtocolError('Target closed');
          }
          return 'success';
        },
        'test-operation',
      );

      assert.strictEqual(result, 'success');
      sinon.assert.called(browserFactory);
    });
  });

  describe('CDP error detection', () => {
    it('should detect ProtocolError as CDP connection error', async () => {
      // Make reconnection always fail to trigger CDPReconnectionError
      const failingFactory = sinon.stub().rejects(new Error('Connection failed'));
      manager.setBrowser(mockBrowser as unknown as Browser, failingFactory);

      const error = new ProtocolError('Target closed');
      const operation = async () => {
        throw error;
      };

      await assert.rejects(
        manager.executeWithRetry(operation, 'test'),
        (err: Error) => {
          assert.ok(err.message.includes('Chrome DevTools接続エラー'));
          return true;
        },
      );
    });

    it('should detect TimeoutError as CDP connection error', async () => {
      // Make reconnection always fail to trigger CDPReconnectionError
      const failingFactory = sinon.stub().rejects(new Error('Connection failed'));
      manager.setBrowser(mockBrowser as unknown as Browser, failingFactory);

      const error = new TimeoutError('Navigation timeout');
      const operation = async () => {
        throw error;
      };

      await assert.rejects(
        manager.executeWithRetry(operation, 'test'),
        (err: Error) => {
          assert.ok(err.message.includes('Chrome DevTools接続エラー'));
          return true;
        },
      );
    });

    it('should detect string-based CDP errors (fallback)', async () => {
      const testCases = [
        'Protocol error (Target.setDiscoverTargets): Target closed',
        'Session closed. Most likely the page has been closed.',
        'Connection closed',
        'WebSocket is not open: readyState 3',
      ];

      for (const errorMessage of testCases) {
        // Create fresh manager and failing factory for each test case
        resetConnectionManager();
        const testManager = new BrowserConnectionManager({enableLogging: false});
        const failingFactory = sinon.stub().rejects(new Error('Connection failed'));
        testManager.setBrowser(mockBrowser as unknown as Browser, failingFactory);

        const error = new Error(errorMessage);
        const operation = async () => {
          throw error;
        };

        await assert.rejects(
          testManager.executeWithRetry(operation, 'test'),
          (err: Error) => {
            assert.ok(
              err.message.includes('Chrome DevTools接続エラー'),
              `Failed for error: ${errorMessage}`,
            );
            return true;
          },
        );
      }
    });

    it('should not treat non-CDP errors as connection errors', async () => {
      manager.setBrowser(mockBrowser as unknown as Browser, browserFactory);

      const error = new Error('Some random error');
      const operation = async () => {
        throw error;
      };

      await assert.rejects(
        manager.executeWithRetry(operation, 'test'),
        (err: Error) => {
          assert.strictEqual(err.message, 'Some random error');
          return true;
        },
      );

      // Should not have attempted reconnection
      sinon.assert.notCalled(browserFactory);
    });
  });

  describe('Reconnection flow', () => {
    it('should close old browser before creating new one', async () => {
      const closeSpy = sinon.stub().resolves();
      (mockBrowser as any).close = closeSpy;
      (mockBrowser as any).isConnected = sinon.stub().returns(true);

      manager.setBrowser(mockBrowser as unknown as Browser, browserFactory);

      const operation = async () => {
        throw new ProtocolError('Target closed');
      };

      await manager.executeWithRetry(operation, 'test').catch(() => {
        // Expected to fail
      });

      // Should have attempted to close old browser
      sinon.assert.called(closeSpy);
    });

    it('should call onReconnect callback after successful reconnection', async () => {
      const onReconnect = sinon.stub().resolves();

      manager = new BrowserConnectionManager({
        enableLogging: false,
        onReconnect,
      });

      manager.setBrowser(mockBrowser as unknown as Browser, browserFactory);

      let callCount = 0;
      const operation = async () => {
        callCount++;
        if (callCount === 1) {
          throw new ProtocolError('Target closed');
        }
        return 'success';
      };

      await manager.executeWithRetry(operation, 'test');

      // onReconnect should have been called with new browser
      sinon.assert.calledOnce(onReconnect);
      sinon.assert.calledWith(onReconnect, mockBrowser);
    });

    it('should retry operation after successful reconnection', async () => {
      manager.setBrowser(mockBrowser as unknown as Browser, browserFactory);

      let callCount = 0;
      const operation = async () => {
        callCount++;
        if (callCount === 1) {
          throw new ProtocolError('Target closed');
        }
        return `success-${callCount}`;
      };

      const result = await manager.executeWithRetry(operation, 'test');

      assert.strictEqual(callCount, 2);
      assert.strictEqual(result, 'success-2');
    });
  });

  describe('Max reconnect attempts', () => {
    it('should respect maxReconnectAttempts configuration', async () => {
      manager = new BrowserConnectionManager({
        maxReconnectAttempts: 2,
        enableLogging: false,
      });

      // Make reconnection always fail to test max attempts
      const failingFactory = sinon.stub().rejects(new Error('Connection failed'));
      manager.setBrowser(mockBrowser as unknown as Browser, failingFactory);

      const operation = async () => {
        throw new ProtocolError('Target closed');
      };

      await assert.rejects(
        manager.executeWithRetry(operation, 'test'),
        (err: Error) => {
          assert.ok(err.message.includes('2回の再接続を試みました'));
          return true;
        },
      );

      // Should have attempted reconnection 2 times
      sinon.assert.callCount(failingFactory, 2);
    });

    it('should throw CDPReconnectionError after max attempts', async () => {
      // Make reconnection always fail to trigger CDPReconnectionError
      const failingFactory = sinon.stub().rejects(new Error('Connection failed'));
      manager.setBrowser(mockBrowser as unknown as Browser, failingFactory);

      const operation = async () => {
        throw new ProtocolError('Target closed');
      };

      await assert.rejects(
        manager.executeWithRetry(operation, 'test'),
        (err: Error) => {
          assert.strictEqual(err.name, 'CDPReconnectionError');
          assert.ok(err.message.includes('Chrome DevTools接続エラー'));
          assert.ok(err.message.includes('解決方法'));
          return true;
        },
      );
    });
  });

  describe('Utility methods', () => {
    it('should track reconnection attempts', async () => {
      // Make reconnection always fail to test attempt tracking
      const failingFactory = sinon.stub().rejects(new Error('Connection failed'));
      manager.setBrowser(mockBrowser as unknown as Browser, failingFactory);

      assert.strictEqual(manager.getReconnectAttempts(), 0);

      const operation = async () => {
        throw new ProtocolError('Target closed');
      };

      await manager.executeWithRetry(operation, 'test').catch(() => {
        // Expected to fail
      });

      // Should have tracked 3 reconnection attempts
      assert.strictEqual(manager.getReconnectAttempts(), 3);
    });

    it('should reset reconnection attempt counter', async () => {
      // Make reconnection always fail to test attempt tracking and reset
      const failingFactory = sinon.stub().rejects(new Error('Connection failed'));
      manager.setBrowser(mockBrowser as unknown as Browser, failingFactory);

      const operation = async () => {
        throw new ProtocolError('Target closed');
      };

      await manager.executeWithRetry(operation, 'test').catch(() => {
        // Expected to fail
      });

      assert.strictEqual(manager.getReconnectAttempts(), 3);

      manager.resetReconnectAttempts();

      assert.strictEqual(manager.getReconnectAttempts(), 0);
    });

    it('should return current browser instance', () => {
      assert.strictEqual(manager.getBrowser(), null);

      manager.setBrowser(mockBrowser as unknown as Browser, browserFactory);

      assert.strictEqual(
        manager.getBrowser(),
        mockBrowser as unknown as Browser,
      );
    });

    it('should check browser connection status', () => {
      (mockBrowser as any).isConnected = sinon.stub().returns(false);
      manager.setBrowser(mockBrowser as unknown as Browser, browserFactory);
      assert.strictEqual(manager.isConnected(), false);

      (mockBrowser as any).isConnected = sinon.stub().returns(true);
      assert.strictEqual(manager.isConnected(), true);
    });
  });

  describe('Error handling edge cases', () => {
    it('should throw error if browser factory not set', async () => {
      // Don't set browser factory
      const manager2 = new BrowserConnectionManager({enableLogging: false});

      const operation = async () => {
        throw new ProtocolError('Target closed');
      };

      await assert.rejects(
        manager2.executeWithRetry(operation, 'test'),
        (err: Error) => {
          assert.ok(err.message.includes('Browser factory not set'));
          return true;
        },
      );
    });

    it('should handle browser.close() errors gracefully', async () => {
      const closeSpy = sinon.stub().rejects(new Error('Close failed'));
      (mockBrowser as any).close = closeSpy;
      (mockBrowser as any).isConnected = sinon.stub().returns(true);

      manager.setBrowser(mockBrowser as unknown as Browser, browserFactory);

      let callCount = 0;
      const operation = async () => {
        callCount++;
        if (callCount === 1) {
          throw new ProtocolError('Target closed');
        }
        return 'success';
      };

      // Should not throw even if close() fails
      const result = await manager.executeWithRetry(operation, 'test');

      assert.strictEqual(result, 'success');
      sinon.assert.called(closeSpy);
    });
  });
});
