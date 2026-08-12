/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {Page, Protocol, CdpPage, Dialog} from '../third_party/index.js';
import type {PredefinedNetworkConditions} from '../third_party/index.js';
import {logger} from './logger.js';

export type DialogAction = 'accept' | 'dismiss' | string;

export class WaitForHelper {
  #abortController = new AbortController();
  #page: CdpPage;
  #stableDomTimeout: number;
  #stableDomFor: number;
  #expectNavigationIn: number;
  #navigationTimeout: number;

  #dialogHandled = false;
  /** Track all dialogs as they pause the renderer. */
  #dialogDetected = false;
  #initialUrl: string;

  constructor(
    page: Page,
    cpuTimeoutMultiplier: number,
    networkTimeoutMultiplier: number,
  ) {
    this.#stableDomTimeout = 3000 * cpuTimeoutMultiplier;
    this.#stableDomFor = 100 * cpuTimeoutMultiplier;
    this.#expectNavigationIn = 100 * cpuTimeoutMultiplier;
    this.#navigationTimeout = 3000 * networkTimeoutMultiplier;
    this.#page = page as unknown as CdpPage;
    this.#initialUrl = page.url();
  }

  /**
   * A wrapper that executes a action and waits for
   * a potential navigation, after which it waits
   * for the DOM to be stable before returning.
   */
  async waitForStableDom(): Promise<void> {
    // Bound the setup evaluation against the stable-DOM timeout. Without this
    // cap a paused renderer (e.g. an open dialog) would make evaluateHandle
    // hang until protocolTimeout (default 180s) while the tool mutex is held.
    using stableDomObserver = await Promise.race([
      this.#page.evaluateHandle(timeout => {
        let timeoutId: ReturnType<typeof setTimeout>;
        function callback() {
          clearTimeout(timeoutId);
          timeoutId = setTimeout(() => {
            domObserver.resolver.resolve();
            domObserver.observer.disconnect();
          }, timeout);
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
      }, this.#stableDomFor),
      this.timeout(this.#stableDomTimeout) as Promise<undefined>,
    ]).catch(() => undefined);

    if (!stableDomObserver) {
      return;
    }

    this.#abortController.signal.addEventListener('abort', async () => {
      try {
        await stableDomObserver.evaluate(observer => {
          observer.observer.disconnect();
          observer.resolver.resolve();
        });
      } catch {
        // Ignored cleanup errors
      }
    });

    return Promise.race([
      stableDomObserver.evaluate(async observer => {
        return await observer.resolver.promise;
      }),
      this.timeout(this.#stableDomTimeout).then(() => {
        throw new Error('Timeout');
      }),
    ]);
  }

  timeout(time: number): Promise<void> {
    return new Promise<void>(res => {
      const id = setTimeout(res, time);
      this.#abortController.signal.addEventListener('abort', () => {
        res();
        clearTimeout(id);
      });
    });
  }

  async waitForEventsAfterAction(
    action: () => Promise<unknown>,
    options?: {
      timeout?: number;
      waitForStableDom?: boolean;
      expectNavigationIn?: number;
      handleDialog?:
        DialogAction | Partial<Record<Protocol.Page.DialogType, DialogAction>>;
    },
  ): Promise<WaitForEventsResult> {
    if (this.#abortController.signal.aborted) {
      throw new Error("Can't re-use a WaitForHelper");
    }
    const dialogHandler = (
      dialog: Pick<Dialog, 'accept' | 'dismiss' | 'type'>,
    ) => {
      this.#dialogDetected = true;

      if (!options?.handleDialog) {
        return;
      }

      let actionToTake: DialogAction | undefined;

      if (typeof options.handleDialog === 'object') {
        actionToTake = options.handleDialog[dialog.type()];
      } else {
        actionToTake = options.handleDialog;
      }

      if (actionToTake) {
        this.#dialogHandled = true;
        if (actionToTake === 'dismiss') {
          void dialog.dismiss();
        } else if (actionToTake === 'accept') {
          void dialog.accept();
        } else {
          void dialog.accept(actionToTake);
        }
      }
    };
    this.#page.on('dialog', dialogHandler);
    this.#abortController.signal.addEventListener('abort', () => {
      this.#page.off('dialog', dialogHandler);
    });

    // A scoped AbortController used to clean up navigation probe listeners.
    // When aborted (either after navigation detection finishes or if this.#abortController
    // aborts), it removes the CDP Page.frameStartedNavigating listener and automatically
    // detaches the abort listener from this.#abortController.signal.
    const navigationAbortController = new AbortController();
    const navigationStartedResolvers = Promise.withResolvers<boolean>();

    const navigationListener = (
      event: Protocol.Page.FrameStartedNavigatingEvent,
    ) => {
      if (event.frameId !== this.#page.mainFrame()._id) {
        return;
      }
      if (
        event.navigationType === 'sameDocument' ||
        event.navigationType === 'historySameDocument'
      ) {
        return;
      }

      navigationStartedResolvers.resolve(true);
    };

    this.#page._client().on('Page.frameStartedNavigating', navigationListener);
    navigationAbortController.signal.addEventListener('abort', () => {
      this.#page
        ._client()
        .off('Page.frameStartedNavigating', navigationListener);
    });
    this.#abortController.signal.addEventListener(
      'abort',
      () => {
        navigationStartedResolvers.resolve(false);
        navigationAbortController.abort();
      },
      {signal: navigationAbortController.signal},
    );

    // Puppeteer's waitForNavigation must be started before the action runs so that
    // it captures the pre-action loader ID. If started after the action triggers navigation,
    // it risks recording the new loader ID and hanging until timeout.
    // If no navigation occurs, this.#abortController will cancel it in the finally block.
    const navigationFinished = this.#page
      .waitForNavigation({
        timeout: options?.timeout ?? this.#navigationTimeout,
        signal: this.#abortController.signal,
        ignoreSameDocumentNavigation: true,
      })
      .then(result => {
        navigationStartedResolvers.resolve(true);
        return result;
      })
      .catch(error => {
        if (
          this.#abortController.signal.aborted ||
          (error instanceof Error && error.name === 'AbortError')
        ) {
          return;
        }
        logger?.(error);
      });

    try {
      await action();
    } catch (error) {
      // Clear up pending promises
      this.#abortController.abort();
      throw error;
    }

    const expectNavigationIn =
      options?.expectNavigationIn ?? this.#expectNavigationIn;
    const navigationStarted = await Promise.race([
      navigationStartedResolvers.promise,
      this.timeout(expectNavigationIn).then(() => {
        navigationStartedResolvers.resolve(false);
        return false;
      }),
    ]);
    navigationAbortController.abort();

    try {
      // Only await navigation if one was actually initiated; otherwise, the
      // pending waitForNavigation promise will be cancelled when this.#abortController aborts.
      if (navigationStarted) {
        await navigationFinished;
      }

      if (this.#dialogDetected) {
        return this.#getResult();
      }

      // Wait for stable dom after navigation so we execute in
      // the correct context
      if (options?.waitForStableDom !== false) {
        await this.waitForStableDom();
      }
    } catch (error) {
      logger?.(error);
    } finally {
      this.#abortController.abort();
    }

    return this.#getResult();
  }

  #getResult(): WaitForEventsResult {
    const urlAfterAction = this.#page.url();
    return {
      ...(urlAfterAction !== this.#initialUrl
        ? {navigatedToUrl: urlAfterAction}
        : {}),
      dialogHandled: this.#dialogHandled,
    };
  }
}

export interface WaitForEventsResult {
  /**
   * The URL the page navigated to during the action, if a navigation
   * occurred.
   */
  navigatedToUrl?: string;
  /**
   * Whether a dialog was automatically handled during the action.
   */
  dialogHandled?: boolean;
}

export function getNetworkMultiplierFromString(
  condition: string | null,
): number {
  const puppeteerCondition =
    condition as keyof typeof PredefinedNetworkConditions;

  switch (puppeteerCondition) {
    case 'Fast 4G':
      return 1;
    case 'Slow 4G':
      return 2.5;
    case 'Fast 3G':
      return 5;
    case 'Slow 3G':
      return 10;
  }
  return 1;
}
