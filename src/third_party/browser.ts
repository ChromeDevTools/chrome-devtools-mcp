/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Runs the polyfills in index.js before Puppeteer and DevTools code.
import './index.js';

// eslint-disable-next-line no-restricted-imports
import * as DevToolsRoot from '../../third_party/devtools-frontend/front_end/core/root/root.js';

export {
  Accessibility,
  ConsoleMessage,
  Dialog,
  ElementHandle,
  EventEmitter,
  Frame,
  Locator,
  KnownDevices,
  CDPSession,
  CDPSessionEvent,
  Connection,
  ScreenRecorder,
  Target,
  TargetType,
  TimeoutError,
  Tracing,
  WebWorker,
  WebMCP,
  WebMCPTool,
} from 'puppeteer-core';
export {default as puppeteer} from 'puppeteer-core';
export type * from 'puppeteer-core';
export {CdpBrowser} from 'puppeteer-core/internal/cdp/Browser.js';
export {CdpFrame} from 'puppeteer-core/internal/cdp/Frame.js';
export {CdpHTTPRequest} from 'puppeteer-core/internal/cdp/HTTPRequest.js';
export {CdpJSHandle} from 'puppeteer-core/internal/cdp/JSHandle.js';
export {CdpPage} from 'puppeteer-core/internal/cdp/Page.js';
export {CdpScreenRecording} from 'puppeteer-core/internal/cdp/ScreenRecording.js';
export {CdpExtension} from 'puppeteer-core/internal/cdp/Extension.js';
export {CdpMouse} from 'puppeteer-core/internal/cdp/Input.js';
export type {CdpWebWorker} from 'puppeteer-core/internal/cdp/WebWorker.js';
export type {Realm} from 'puppeteer-core/internal/api/Realm.js';
export {FrameEvent} from 'puppeteer-core/internal/api/Frame.js';
export {Mutex} from 'puppeteer-core/internal/util/Mutex.js';
export {Deferred} from 'puppeteer-core/internal/util/Deferred.js';
export {PUPPETEER_REVISIONS} from 'puppeteer-core/internal/revisions.js';
export {createRemoteException} from 'puppeteer-core/internal/cdp/utils.js';
export {
  computeExecutablePath,
  resolveDefaultUserDataDir,
  detectBrowserPlatform,
  Browser as BrowserEnum,
  type ChromeReleaseChannel as BrowsersChromeReleaseChannel,
} from '@puppeteer/browsers';

DevToolsRoot.Runtime.experiments.register({
  name: DevToolsRoot.ExperimentNames.ExperimentName.INSTRUMENTATION_BREAKPOINTS,
  title: 'Instrumentation breakpoints',
  aboutFlag: 'devtools-instrumentation-breakpoints',
  isEnabled: false,
  requiresChromeRestart: false,
});

export * as DevTools from '../../third_party/devtools-frontend/mcp/mcp.js';
