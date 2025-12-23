/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import puppeteer, {Locator} from 'puppeteer';
import logger from 'debug';
import {McpContext} from './McpContext.js';
import {McpResponse} from './McpResponse.js';
import {startTrace} from './tools/performance.js';

async function run() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: false, // Visible for manual observation if needed
    defaultViewport: null,
    handleDevToolsAsPage: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'], // Useful for some envs
  });

  try {
    const page = await browser.newPage();
    // Close other pages (like about:blank opened by default if any)
    const pages = await browser.pages();
    for (const p of pages) {
      if (p !== page) await p.close();
    }

    console.log('Setting up McpContext...');
    const context = await McpContext.from(
      browser,
      logger('test'),
      {
        experimentalDevToolsDebugging: false,
      },
      Locator,
    );

    // Ensure we have a page selected (McpContext selects one by default but good to be sure)
    console.log('Context initialized.');

    // Pre-navigate to something so we can reload it
    const targetUrl = 'https://web.dev';
    console.log(`Navigating to ${targetUrl}...`);
    await context.getSelectedPage().goto(targetUrl);

    console.log('Starting trace with autoStop: true, reload: true...');
    const response = new McpResponse();
    const request = {
      params: {
        reload: true,
        autoStop: true,
      },
    };

    // startTrace.handler is async. It waits for the trace to finish if autoStop is true.
    await startTrace.handler(request, response, context);

    console.log('Trace handler returned.');

    // Assertions
    const lines = response.responseLines;

    // Check for stop message
    const stoppedMsg = lines.find(l =>
      l.includes('The performance trace has been stopped'),
    );
    if (!stoppedMsg) {
      console.error('Response lines:', lines);
      throw new Error('FAILED: Did not find stop message');
    } else {
      console.log('Verified: Stop message found.');
    }

    // Check if context thinks it is running
    const isRunning = context.isRunningPerformanceTrace();
    if (isRunning) {
      throw new Error('FAILED: Trace is still marked as running in context');
    } else {
      console.log('Verified: Context marks trace as stopped.');
    }

    // Check if trace is recorded
    const traces = context.recordedTraces();
    if (traces.length !== 1) {
      throw new Error(
        `FAILED: Expected 1 recorded trace, got ${traces.length}`,
      );
    } else {
      console.log('Verified: 1 trace recorded.');
    }

    // Check trace content (basic check)
    const traceResult = traces[0];
    console.log('--- Response Lines ---');
    console.log(lines.join('\n'));
    console.log('----------------------');

    console.log('SUCCESS: Trace recorded and stopped automatically.');
  } catch (err) {
    console.error('Test FAILED with error:', err);
    process.exit(1);
  } finally {
    console.log('Closing browser...');
    await browser.close();
  }
}

run();
