/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import assert from 'node:assert';
import {describe, it} from 'node:test';

import {emulateCpu, emulateNetwork} from '../../src/tools/emulation.js';
import {withBrowser} from '../utils.js';

describe('emulation', () => {
  describe('network', () => {
    it('emulates offline network conditions', async () => {
      await withBrowser(async (response, context) => {
        await emulateNetwork.handler(
          {
            params: {
              throttlingOption: 'Offline',
            },
          },
          response,
          context,
        );

        assert.strictEqual(context.getNetworkConditions(), 'Offline');
      });
    });
    it('emulates network throttling when the throttling option is valid ', async () => {
      await withBrowser(async (response, context) => {
        await emulateNetwork.handler(
          {
            params: {
              throttlingOption: 'Slow 3G',
            },
          },
          response,
          context,
        );

        assert.strictEqual(context.getNetworkConditions(), 'Slow 3G');
      });
    });

    it('disables network emulation', async () => {
      await withBrowser(async (response, context) => {
        await emulateNetwork.handler(
          {
            params: {
              throttlingOption: 'No emulation',
            },
          },
          response,
          context,
        );

        assert.strictEqual(context.getNetworkConditions(), null);
      });
    });

    it('does not set throttling when the network throttling is not one of the predefined options', async () => {
      await withBrowser(async (response, context) => {
        await emulateNetwork.handler(
          {
            params: {
              throttlingOption: 'Slow 11G',
            },
          },
          response,
          context,
        );

        assert.strictEqual(context.getNetworkConditions(), null);
      });
    });

    it('report correctly for the currently selected page', async () => {
      await withBrowser(async (response, context) => {
        await context.newPage();
        await emulateNetwork.handler(
          {
            params: {
              throttlingOption: 'Slow 3G',
            },
          },
          response,
          context,
        );

        assert.strictEqual(context.getNetworkConditions(), 'Slow 3G');

        context.setSelectedPageIdx(0);

        assert.strictEqual(context.getNetworkConditions(), null);
      });
    });
  });

  describe('cpu', () => {
    it('emulates cpu throttling when the rate is valid (1-20x)', async () => {
      await withBrowser(async (response, context) => {
        await emulateCpu.handler(
          {
            params: {
              throttlingRate: 4,
            },
          },
          response,
          context,
        );

        assert.strictEqual(context.getCpuThrottlingRate(), 4);
      });
    });

    it('disables cpu throttling', async () => {
      await withBrowser(async (response, context) => {
        context.setCpuThrottlingRate(4); // Set it to something first.
        await emulateCpu.handler(
          {
            params: {
              throttlingRate: 1,
            },
          },
          response,
          context,
        );

        assert.strictEqual(context.getCpuThrottlingRate(), 1);
      });
    });

    it('report correctly for the currently selected page', async () => {
      await withBrowser(async (response, context) => {
        await context.newPage();
        await emulateCpu.handler(
          {
            params: {
              throttlingRate: 4,
            },
          },
          response,
          context,
        );

        assert.strictEqual(context.getCpuThrottlingRate(), 4);

        context.setSelectedPageIdx(0);

        assert.strictEqual(context.getCpuThrottlingRate(), 1);
      });
    });
  });
});
