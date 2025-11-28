/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {emulate} from '../../src/tools/emulation.js';
import {withMcpContext} from '../utils.js';

describe('emulation', () => {
  describe('network', () => {
    it('emulates offline network conditions', async () => {
      await withMcpContext(async (response, context) => {
        await emulate.handler(
          {
            params: {
              networkConditions: 'Offline',
            },
          },
          response,
          context,
        );

        assert.strictEqual(context.getNetworkConditions(), 'Offline');
      });
    });
    it('emulates network throttling when the throttling option is valid', async () => {
      await withMcpContext(async (response, context) => {
        await emulate.handler(
          {
            params: {
              networkConditions: 'Slow 3G',
            },
          },
          response,
          context,
        );

        assert.strictEqual(context.getNetworkConditions(), 'Slow 3G');
      });
    });

    it('disables network emulation', async () => {
      await withMcpContext(async (response, context) => {
        await emulate.handler(
          {
            params: {
              networkConditions: 'No emulation',
            },
          },
          response,
          context,
        );

        assert.strictEqual(context.getNetworkConditions(), null);
      });
    });

    it('does not set throttling when the network throttling is not one of the predefined options', async () => {
      await withMcpContext(async (response, context) => {
        await emulate.handler(
          {
            params: {
              networkConditions: 'Slow 11G',
            },
          },
          response,
          context,
        );

        assert.strictEqual(context.getNetworkConditions(), null);
      });
    });

    it('report correctly for the currently selected page', async () => {
      await withMcpContext(async (response, context) => {
        await emulate.handler(
          {
            params: {
              networkConditions: 'Slow 3G',
            },
          },
          response,
          context,
        );

        assert.strictEqual(context.getNetworkConditions(), 'Slow 3G');

        const page = await context.newPage();
        context.selectPage(page);

        assert.strictEqual(context.getNetworkConditions(), null);
      });
    });
  });

  describe('cpu', () => {
    it('emulates cpu throttling when the rate is valid (1-20x)', async () => {
      await withMcpContext(async (response, context) => {
        await emulate.handler(
          {
            params: {
              cpuThrottlingRate: 4,
            },
          },
          response,
          context,
        );

        assert.strictEqual(context.getCpuThrottlingRate(), 4);
      });
    });

    it('disables cpu throttling', async () => {
      await withMcpContext(async (response, context) => {
        context.setCpuThrottlingRate(4); // Set it to something first.
        await emulate.handler(
          {
            params: {
              cpuThrottlingRate: 1,
            },
          },
          response,
          context,
        );

        assert.strictEqual(context.getCpuThrottlingRate(), 1);
      });
    });

    it('report correctly for the currently selected page', async () => {
      await withMcpContext(async (response, context) => {
        await emulate.handler(
          {
            params: {
              cpuThrottlingRate: 4,
            },
          },
          response,
          context,
        );

        assert.strictEqual(context.getCpuThrottlingRate(), 4);

        const page = await context.newPage();
        context.selectPage(page);

        assert.strictEqual(context.getCpuThrottlingRate(), 1);
      });
    });
  });
});
