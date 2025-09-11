/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type {CdpPage} from 'puppeteer-core/internal/cdp/Page.js';
import {Page, Protocol} from 'puppeteer-core';
import {logger} from './logger.js';

async function waitForStableDom(
  page: Page,
  signal: AbortSignal,
): Promise<void> {
  const stableDomObserver = await page.evaluateHandle(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    function callback() {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        domObserver.resolver.resolve();
        domObserver.observer.disconnect();
      }, 100);
    }
    const domObserver = {
      resolver: Promise.withResolvers<void>(),
      observer: new MutationObserver(callback),
    };
    // It's possible that the DOM is not gonna change so we
    // need to start the timeout initially.
    callback();

    domObserver.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    return domObserver;
  });

  signal.addEventListener('abort', async () => {
    try {
      await stableDomObserver.evaluate(observer => {
        observer.observer.disconnect();
        observer.resolver.resolve();
      });
      await stableDomObserver.dispose();
    } catch {
      // Ignored cleanup errors
    }
  });

  return Promise.race([
    stableDomObserver.evaluate(async observer => {
      return await observer.resolver.promise;
    }),
    timeout(3000, signal).then(() => {
      throw new Error('Timeout');
    }),
  ]);
}

async function waitForNavigationStarted(page: CdpPage, signal: AbortSignal) {
  // Currently Puppeteer does not have API
  // For when a navigation is about to start
  const navigationStartedPromise = new Promise<boolean>(resolve => {
    const listener = (event: Protocol.Page.FrameStartedNavigatingEvent) => {
      if (
        [
          'historySameDocument',
          'historyDifferentDocument',
          'sameDocument',
        ].includes(event.navigationType)
      ) {
        resolve(false);
        return;
      }

      resolve(true);
    };

    page._client().on('Page.frameStartedNavigating', listener);
    signal.addEventListener('abort', () => {
      resolve(false);
      page._client().off('Page.frameStartedNavigating', listener);
    });
  });

  return await Promise.race([
    navigationStartedPromise,
    timeout(100).then(() => false),
  ]);
}

function timeout(time: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>(res => {
    const id = setTimeout(res, time);
    signal?.addEventListener('abort', () => {
      res();
      clearTimeout(id);
    });
  });
}

/**
 * A wrapper that executes a action and waits for
 * a potential navigation, after which it waits
 * for the DOM to be stable before returning.
 */
export async function waitForEventsAfterAction(
  page: Page,
  callback: () => Promise<void>,
) {
  const controller = new AbortController();

  const navigationStartedPromise = waitForNavigationStarted(
    page as unknown as CdpPage,
    controller.signal,
  );

  await callback();

  try {
    const navigationStated = await navigationStartedPromise;
    if (navigationStated) {
      await page.waitForNavigation({
        timeout: 3000,
        signal: controller.signal,
      });
    }

    // Wait for stable dom after navigation so we execute in
    // the correct context
    await waitForStableDom(page, controller.signal);
  } catch (error) {
    logger(error);
  } finally {
    controller.abort();
  }
}
