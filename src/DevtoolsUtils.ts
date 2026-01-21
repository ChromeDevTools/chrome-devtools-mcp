/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {PuppeteerDevToolsConnection} from './DevToolsConnectionAdapter.js';
import {Mutex} from './Mutex.js';
import {DevTools} from './third_party/index.js';
import type {
  Browser,
  ConsoleMessage,
  Page,
  Protocol,
  Target as PuppeteerTarget,
} from './third_party/index.js';

export function extractUrlLikeFromDevToolsTitle(
  title: string,
): string | undefined {
  const match = title.match(new RegExp(`DevTools - (.*)`));
  return match?.[1] ?? undefined;
}

export function urlsEqual(url1: string, url2: string): boolean {
  const normalizedUrl1 = normalizeUrl(url1);
  const normalizedUrl2 = normalizeUrl(url2);
  return normalizedUrl1 === normalizedUrl2;
}

/**
 * For the sake of the MCP server, when we determine if two URLs are equal we
 * remove some parts:
 *
 * 1. We do not care about the protocol.
 * 2. We do not care about trailing slashes.
 * 3. We do not care about "www".
 * 4. We ignore the hash parts.
 *
 * For example, if the user types "record a trace on foo.com", we would want to
 * match a tab in the connected Chrome instance that is showing "www.foo.com/"
 */
function normalizeUrl(url: string): string {
  let result = url.trim();

  // Remove protocols
  if (result.startsWith('https://')) {
    result = result.slice(8);
  } else if (result.startsWith('http://')) {
    result = result.slice(7);
  }

  // Remove 'www.'. This ensures that we find the right URL regardless of if the user adds `www` or not.
  if (result.startsWith('www.')) {
    result = result.slice(4);
  }

  // We use target URLs to locate DevTools but those often do
  // no include hash.
  const hashIdx = result.lastIndexOf('#');
  if (hashIdx !== -1) {
    result = result.slice(0, hashIdx);
  }

  // Remove trailing slash
  if (result.endsWith('/')) {
    result = result.slice(0, -1);
  }

  return result;
}

/**
 * A mock implementation of an issues manager that only implements the methods
 * that are actually used by the IssuesAggregator
 */
export class FakeIssuesManager extends DevTools.Common.ObjectWrapper
  .ObjectWrapper<DevTools.IssuesManagerEventTypes> {
  issues(): DevTools.Issue[] {
    return [];
  }
}

// DevTools CDP errors can get noisy.
DevTools.ProtocolClient.InspectorBackend.test.suppressRequestErrors = true;

DevTools.I18n.DevToolsLocale.DevToolsLocale.instance({
  create: true,
  data: {
    navigatorLanguage: 'en-US',
    settingLanguage: 'en-US',
    lookupClosestDevToolsLocale: l => l,
  },
});
DevTools.I18n.i18n.registerLocaleDataForTest('en-US', {});

DevTools.Formatter.FormatterWorkerPool.FormatterWorkerPool.instance({
  forceNew: true,
  entrypointURL: import.meta
    .resolve('./third_party/devtools-formatter-worker.js'),
});

export interface TargetUniverse {
  /** The DevTools target corresponding to the puppeteer Page */
  target: DevTools.Target;
  universe: DevTools.Foundation.Universe.Universe;
}
export type TargetUniverseFactoryFn = (page: Page) => Promise<TargetUniverse>;

export class UniverseManager {
  readonly #browser: Browser;
  readonly #createUniverseFor: TargetUniverseFactoryFn;
  readonly #universes = new WeakMap<Page, TargetUniverse>();

  /** Guard access to #universes so we don't create unnecessary universes */
  readonly #mutex = new Mutex();

  constructor(
    browser: Browser,
    factory: TargetUniverseFactoryFn = DEFAULT_FACTORY,
  ) {
    this.#browser = browser;
    this.#createUniverseFor = factory;
  }

  async init(pages: Page[]) {
    try {
      await this.#mutex.acquire();
      const promises = [];
      for (const page of pages) {
        promises.push(
          this.#createUniverseFor(page).then(targetUniverse =>
            this.#universes.set(page, targetUniverse),
          ),
        );
      }

      this.#browser.on('targetcreated', this.#onTargetCreated);
      this.#browser.on('targetdestroyed', this.#onTargetDestroyed);

      await Promise.all(promises);
    } finally {
      this.#mutex.release();
    }
  }

  get(page: Page): TargetUniverse | null {
    return this.#universes.get(page) ?? null;
  }

  dispose() {
    this.#browser.off('targetcreated', this.#onTargetCreated);
    this.#browser.off('targetdestroyed', this.#onTargetDestroyed);
  }

  #onTargetCreated = async (target: PuppeteerTarget) => {
    const page = await target.page();
    try {
      await this.#mutex.acquire();
      if (!page || this.#universes.has(page)) {
        return;
      }

      this.#universes.set(page, await this.#createUniverseFor(page));
    } finally {
      this.#mutex.release();
    }
  };

  #onTargetDestroyed = async (target: PuppeteerTarget) => {
    const page = await target.page();
    try {
      await this.#mutex.acquire();
      if (!page || !this.#universes.has(page)) {
        return;
      }
      this.#universes.delete(page);
    } finally {
      this.#mutex.release();
    }
  };
}

const DEFAULT_FACTORY: TargetUniverseFactoryFn = async (page: Page) => {
  const settingStorage = new DevTools.Common.Settings.SettingsStorage({});
  const universe = new DevTools.Foundation.Universe.Universe({
    settingsCreationOptions: {
      syncedStorage: settingStorage,
      globalStorage: settingStorage,
      localStorage: settingStorage,
      settingRegistrations:
        DevTools.Common.SettingRegistration.getRegisteredSettings(),
    },
    overrideAutoStartModels: new Set([DevTools.DebuggerModel]),
  });

  const session = await page.createCDPSession();
  const connection = new PuppeteerDevToolsConnection(session);

  const targetManager = universe.context.get(DevTools.TargetManager);
  targetManager.observeModels(DevTools.DebuggerModel, SKIP_ALL_PAUSES);

  const target = targetManager.createTarget(
    'main',
    '',
    'frame' as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    /* parentTarget */ null,
    session.id(),
    undefined,
    connection,
  );
  return {target, universe};
};

// We don't want to pause any DevTools universe session ever on the MCP side.
//
// Note that calling `setSkipAllPauses` only affects the session on which it was
// sent. This means DevTools can still pause, step and do whatever. We just won't
// see the `Debugger.paused`/`Debugger.resumed` events on the MCP side.
const SKIP_ALL_PAUSES = {
  modelAdded(model: DevTools.DebuggerModel): void {
    void model.agent.invoke_setSkipAllPauses({skip: true});
  },

  modelRemoved(): void {
    // Do nothing.
  },
};

export async function createStackTraceForConsoleMessage(
  devTools: TargetUniverse,
  consoleMessage: ConsoleMessage,
): Promise<DevTools.StackTrace.StackTrace.StackTrace | undefined> {
  const message = consoleMessage as ConsoleMessage & {
    _rawStackTrace(): Protocol.Runtime.StackTrace | undefined;
    _targetId(): string | undefined;
  };
  const rawStackTrace = message._rawStackTrace();
  if (!rawStackTrace) {
    return undefined;
  }

  const targetManager = devTools.universe.context.get(DevTools.TargetManager);
  const messageTargetId = message._targetId();
  const target = messageTargetId
    ? targetManager.targetById(messageTargetId) || devTools.target
    : devTools.target;
  const model = target.model(DevTools.DebuggerModel) as DevTools.DebuggerModel;

  // DevTools doesn't wait for source maps to attach before building a stack trace, rather it'll send
  // an update event once a source map was attached and the stack trace retranslated. This doesn't
  // work in the MCP case, so we'll collect all script IDs upfront and wait for any pending source map
  // loads before creating the stack trace. We might also have to wait for Debugger.ScriptParsed events if
  // the stack trace is created particularly early.
  const scriptIds = new Set<Protocol.Runtime.ScriptId>();
  for (const frame of rawStackTrace.callFrames) {
    scriptIds.add(frame.scriptId);
  }
  for (
    let asyncStack = rawStackTrace.parent;
    asyncStack;
    asyncStack = asyncStack.parent
  ) {
    for (const frame of asyncStack.callFrames) {
      scriptIds.add(frame.scriptId);
    }
  }

  const signal = AbortSignal.timeout(1_000);
  await Promise.all(
    [...scriptIds].map(id =>
      waitForScript(model, id, signal)
        .then(script =>
          model.sourceMapManager().sourceMapForClientPromise(script),
        )
        .catch(),
    ),
  );

  const binding = devTools.universe.context.get(
    DevTools.DebuggerWorkspaceBinding,
  );
  // DevTools uses branded types for ScriptId and others. Casting the puppeteer protocol type to the DevTools protocol type is safe.
  return binding.createStackTraceFromProtocolRuntime(
    rawStackTrace as Parameters<
      DevTools.DebuggerWorkspaceBinding['createStackTraceFromProtocolRuntime']
    >[0],
    target,
  );
}

// Waits indefinitely for the script so pair it with Promise.race.
async function waitForScript(
  model: DevTools.DebuggerModel,
  scriptId: Protocol.Runtime.ScriptId,
  signal: AbortSignal,
) {
  while (true) {
    if (signal.aborted) {
      throw signal.reason;
    }

    const script = model.scriptForId(scriptId);
    if (script) {
      return script;
    }

    await new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), {
        once: true,
      });
      void model
        .once(
          'ParsedScriptSource' as Parameters<DevTools.DebuggerModel['once']>[0],
        )
        .then(resolve);
    });
  }
}
