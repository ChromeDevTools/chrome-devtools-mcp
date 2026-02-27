/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {CDPSession, Dialog, Page, Protocol, Viewport} from './third_party/index.js';
import type {
  DebuggerBreakpointInfo,
  DebuggerPausedState,
  DebuggerScriptInfo,
  DebuggerState,
  EmulationSettings,
  GeolocationOptions,
  TextSnapshot,
} from './types.js';

/**
 * Per-page state wrapper. Consolidates dialog, snapshot, emulation,
 * and metadata that were previously scattered across Maps in McpContext.
 *
 * Internal class consumed only by McpContext. Fields are public for direct
 * read/write access. The dialog field is private because it requires an
 * event listener lifecycle managed by the constructor/dispose pair.
 */
export class McpPage {
  readonly page: Page;
  readonly id: number;

  // Snapshot
  textSnapshot: TextSnapshot | null = null;
  uniqueBackendNodeIdToMcpId = new Map<string, string>();

  // Emulation
  emulationSettings: EmulationSettings = {};

  // Metadata
  isolatedContextName?: string;
  devToolsPage?: Page;

  // Debugger
  debuggerState: DebuggerState = {
    enabled: false,
    paused: null,
    breakpoints: new Map(),
    scripts: new Map(),
  };
  #cdpSession: CDPSession | null = null;

  async enableDebugger(): Promise<void> {
    if (this.debuggerState.enabled) return;
    // @ts-expect-error internal Puppeteer API
    const session = this.page._client() as CDPSession;
    this.#cdpSession = session;
    session.on('Debugger.paused', this.#onDebuggerPaused);
    session.on('Debugger.resumed', this.#onDebuggerResumed);
    session.on('Debugger.scriptParsed', this.#onScriptParsed);
    await session.send('Debugger.enable');
    this.debuggerState.enabled = true;
  }

  async disableDebugger(): Promise<void> {
    if (!this.debuggerState.enabled || !this.#cdpSession) return;
    this.#cdpSession.off('Debugger.paused', this.#onDebuggerPaused);
    this.#cdpSession.off('Debugger.resumed', this.#onDebuggerResumed);
    this.#cdpSession.off('Debugger.scriptParsed', this.#onScriptParsed);
    await this.#cdpSession.send('Debugger.disable');
    this.debuggerState = {
      enabled: false,
      paused: null,
      breakpoints: new Map(),
      scripts: new Map(),
    };
    this.#cdpSession = null;
  }

  getCdpSession(): CDPSession {
    if (!this.#cdpSession) {
      throw new Error('Debugger is not enabled. Call debugger_enable first.');
    }
    return this.#cdpSession;
  }
  #onDebuggerPaused = (params: Protocol.Debugger.PausedEvent): void => {
    const callFrames = params.callFrames.map(frame => ({
      callFrameId: frame.callFrameId,
      functionName: frame.functionName,
      url: frame.url ?? '',
      lineNumber: frame.location.lineNumber ?? 0,
      columnNumber: frame.location.columnNumber ?? 0,
      scopeChain: frame.scopeChain.map(scope => ({
        type: scope.type,
        name: scope.name,
        objectId: scope.object.objectId,
      })),
    }));
    this.debuggerState.paused = {
      callFrames,
      reason: params.reason ?? 'unknown',
      hitBreakpoints: params.hitBreakpoints,
    };
  };
  #onDebuggerResumed = (): void => {
    this.debuggerState.paused = null;
  };

  #onScriptParsed = (params: Protocol.Debugger.ScriptParsedEvent): void => {
    const scriptId = params.scriptId;
    const url = params.url ?? '';
    if (!url) return;
    this.debuggerState.scripts.set(scriptId, {
      scriptId,
      url,
      startLine: params.startLine ?? 0,
      startColumn: params.startColumn ?? 0,
      endLine: params.endLine ?? 0,
      endColumn: params.endColumn ?? 0,
      sourceMapURL: params.sourceMapURL,
    });
  };

  // Dialog
  #dialog?: Dialog;
  #dialogHandler: (dialog: Dialog) => void;

  constructor(page: Page, id: number) {
    this.page = page;
    this.id = id;
    this.#dialogHandler = (dialog: Dialog): void => {
      this.#dialog = dialog;
    };
    page.on('dialog', this.#dialogHandler);
  }

  get dialog(): Dialog | undefined {
    return this.#dialog;
  }

  clearDialog(): void {
    this.#dialog = undefined;
  }

  get networkConditions(): string | null {
    return this.emulationSettings.networkConditions ?? null;
  }

  get cpuThrottlingRate(): number {
    return this.emulationSettings.cpuThrottlingRate ?? 1;
  }

  get geolocation(): GeolocationOptions | null {
    return this.emulationSettings.geolocation ?? null;
  }

  get viewport(): Viewport | null {
    return this.emulationSettings.viewport ?? null;
  }

  get userAgent(): string | null {
    return this.emulationSettings.userAgent ?? null;
  }

  get colorScheme(): 'dark' | 'light' | null {
    return this.emulationSettings.colorScheme ?? null;
  }

  dispose(): void {
    this.page.off('dialog', this.#dialogHandler);
    void this.disableDebugger().catch(() => {});
  }
}
