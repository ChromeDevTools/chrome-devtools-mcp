/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {Script} from 'node:vm';

import type {TargetUniverse} from './devtools/DevtoolsUtils.js';
import {Breakpoints, DevTools, Workspace} from './third_party/index.js';
import {logger} from './utils/logger.js';

export interface LogpointOptions {
  /**
   * The URL of a script as served to the browser, or the URL of an original
   * source file from a source map. Matched exactly or as a path suffix.
   */
  url: string;
  /** 1-based line number in the coordinates of `url`. */
  lineNumber: number;
  /** Optional 1-based column number. */
  columnNumber?: number;
  /** Logged like the arguments of `console.log()`. */
  expression: string;
}

/**
 * A location in a script as served to the browser, 1-based like the
 * locations reported by the tools.
 */
export interface GeneratedLocation {
  url: string;
  lineNumber: number;
  columnNumber: number;
}

export interface Logpoint extends LogpointOptions {
  id: number;
  /** The full URL of the script or original source the logpoint was set in. */
  sourceUrl: string;
  /**
   * Whether `sourceUrl` is an original source file from a source map rather
   * than a script as served to the browser.
   */
  sourceMapped: boolean;
  /**
   * The locations in the scripts served to the browser the logpoint is
   * currently set at. Empty while no parsed script contains the location,
   * for example right after a reload before the script was parsed again.
   */
  generatedLocations: GeneratedLocation[];
}

export interface ScriptInfo {
  url: string;
  /** Whether the script references a source map. */
  hasSourceMap: boolean;
  /** Number of original sources in the source map, if it loaded. */
  sourceCount?: number;
  /** Original source URLs matching the list filter. */
  matchedSources: string[];
}

type Breakpoint = Breakpoints.BreakpointManager.Breakpoint;
type UISourceCode = Workspace.UISourceCode.UISourceCode;
type SdkScript = ReturnType<DevTools.DebuggerModel['scripts']>[number];

interface LogpointRecord {
  logpoint: Logpoint;
  breakpoint: Breakpoint;
}

/**
 * DevTools uses branded string types for breakpoint conditions. The brand is
 * purely nominal, so a plain string can be used as a user condition.
 */
function toUserCondition(
  expression: string,
): Breakpoints.BreakpointManager.UserCondition {
  return expression as Breakpoints.BreakpointManager.UserCondition;
}

/**
 * Checks that the expression parses as `console.log()` arguments. V8 is used
 * for parsing both here and in the browser, so an expression that is rejected
 * here would also be rejected as a breakpoint condition. The script is only
 * compiled, never run.
 */
export function validateExpression(expression: string): void {
  try {
    new Script(`console.log(${expression})`);
  } catch (error) {
    throw new Error(
      `The logpoint expression does not compile: ${error instanceof Error ? error.message : String(error)}. Provide the expression like arguments to console.log(...).`,
    );
  }
}

/**
 * Source maps are loaded lazily in the DevTools universe. Loading the source
 * maps of all parsed scripts makes their original sources available in the
 * workspace, so that logpoints can be set on original source files.
 */
async function loadSourceMaps(model: DevTools.DebuggerModel): Promise<void> {
  const manager = model.sourceMapManager();
  await Promise.all(
    model.scripts().map(script => {
      if (!script.sourceMapURL) {
        return undefined;
      }
      return manager.sourceMapForClientPromise(script).catch(error => {
        logger?.('Failed to load source map for', script.sourceURL, error);
        return undefined;
      });
    }),
  );
}

/**
 * Lists the scripts currently parsed on a page based on the DevTools
 * debugger model, including the original sources from their source maps.
 * The filter is matched case-insensitively against both script URLs and
 * source-map source URLs.
 */
export async function listParsedScripts(
  model: DevTools.DebuggerModel,
  filter?: string,
): Promise<ScriptInfo[]> {
  const needle = filter?.toLowerCase();
  const byUrl = new Map<string, SdkScript>();
  for (const script of model.scripts()) {
    if (!script.sourceURL) {
      continue;
    }
    // Keep the last parsed script per URL.
    byUrl.set(script.sourceURL, script);
  }

  const result: ScriptInfo[] = [];
  for (const [url, script] of byUrl) {
    const hasSourceMap = Boolean(script.sourceMapURL);
    let sourceCount: number | undefined;
    const matchedSources: string[] = [];

    if (hasSourceMap) {
      const sourceMap = await model
        .sourceMapManager()
        .sourceMapForClientPromise(script);
      if (sourceMap) {
        const sources = sourceMap.sourceURLs();
        sourceCount = sources.length;
        if (needle) {
          for (const sourceUrl of sources) {
            if (sourceUrl.toLowerCase().includes(needle)) {
              matchedSources.push(sourceUrl);
            }
          }
        }
      }
    }

    if (
      !needle ||
      url.toLowerCase().includes(needle) ||
      matchedSources.length > 0
    ) {
      result.push({url, hasSourceMap, sourceCount, matchedSources});
    }
  }

  result.sort((a, b) => {
    return a.url.localeCompare(b.url);
  });
  return result;
}

/**
 * Manages logpoints for a single page on top of the DevTools
 * `BreakpointManager` of the page's DevTools universe.
 *
 * A logpoint is a DevTools breakpoint with `isLogpoint` set: its condition
 * logs the expression and never pauses. The breakpoint manager resolves the
 * location through source maps, substitutes minified variable names in the
 * expression and keeps the breakpoint bound across reloads and rebuilt
 * bundles. This class only maps the tool API (URLs and 1-based positions)
 * onto workspace source codes and keeps the ids handed out to the tools.
 */
export class LogpointManager {
  readonly #devTools: TargetUniverse;
  readonly #records = new Map<number, LogpointRecord>();
  #nextId = 1;
  #scriptListener?: () => void;

  constructor(devTools: TargetUniverse) {
    this.#devTools = devTools;
  }

  get #debuggerModel(): DevTools.DebuggerModel {
    const model = this.#devTools.target.model(DevTools.DebuggerModel);
    if (!model) {
      throw new Error('The DevTools debugger model is not available.');
    }
    return model;
  }

  get #workspace(): Workspace.Workspace.WorkspaceImpl {
    return this.#devTools.universe.context.get(
      Workspace.Workspace.WorkspaceImpl,
    );
  }

  async setLogpoint(options: LogpointOptions): Promise<Logpoint> {
    validateExpression(options.expression);

    const uiSourceCode = await this.#findUISourceCode(options.url);
    if (!uiSourceCode) {
      throw new Error(
        `No parsed script or original source file matches "${options.url}". The url must match the URL of a script as served to the browser or an original source file from a source map (exactly or as a path suffix). Use list_scripts to see the parsed scripts and their original sources.`,
      );
    }

    const breakpoint = await this.#devTools.breakpointManager.setBreakpoint(
      uiSourceCode,
      // The tool API is 1-based like the DevTools UI; the model is 0-based.
      options.lineNumber - 1,
      options.columnNumber === undefined ? undefined : options.columnNumber - 1,
      toUserCondition(options.expression),
      /* enabled */ true,
      /* isLogpoint */ true,
      Breakpoints.BreakpointManager.BreakpointOrigin.USER_ACTION,
    );
    if (!breakpoint) {
      throw new Error(
        `Failed to set a logpoint in ${uiSourceCode.url()}: the location is not valid.`,
      );
    }
    // Wait for the breakpoint to be set in the backend so that the result
    // reports whether the location resolved.
    await breakpoint.updateBreakpoint();

    const existing = [...this.#records.values()].find(record => {
      return record.breakpoint === breakpoint;
    });
    if (existing) {
      // DevTools keeps one breakpoint per location, so the expression of the
      // existing logpoint was replaced.
      Object.assign(existing.logpoint, options);
      return this.#snapshot(existing);
    }

    if (!breakpoint.bound()) {
      await breakpoint.remove(/* keepInStorage */ false);
      throw new Error(
        `Line ${options.lineNumber} of ${uiSourceCode.url()} contains no executable code${uiSourceCode.contentType().isFromSourceMap() ? ' or is not mapped to the generated script (for example a comment, type annotation or empty line)' : ''}. Pick a line containing executable code.`,
      );
    }

    const record: LogpointRecord = {
      logpoint: {
        ...options,
        id: this.#nextId++,
        sourceUrl: uiSourceCode.url(),
        sourceMapped: uiSourceCode.contentType().isFromSourceMap(),
        generatedLocations: [],
      },
      breakpoint,
    };
    this.#records.set(record.logpoint.id, record);
    this.#ensureSourceMapsLoadOnParse();
    return this.#snapshot(record);
  }

  async removeLogpoint(id?: number): Promise<Logpoint[]> {
    if (id === undefined) {
      const removed: Logpoint[] = [];
      for (const existingId of [...this.#records.keys()]) {
        removed.push(...(await this.removeLogpoint(existingId)));
      }
      return removed;
    }
    const record = this.#records.get(id);
    if (!record) {
      throw new Error(`No logpoint found with id ${id}.`);
    }
    const snapshot = this.#snapshot(record);
    this.#records.delete(id);
    await record.breakpoint.remove(/* keepInStorage */ false);
    if (this.#records.size === 0) {
      this.#stopLoadingSourceMapsOnParse();
    }
    return [snapshot];
  }

  getLogpoints(): Logpoint[] {
    return [...this.#records.values()].map(record => this.#snapshot(record));
  }

  dispose(): void {
    this.#stopLoadingSourceMapsOnParse();
    for (const record of this.#records.values()) {
      void record.breakpoint
        .remove(/* keepInStorage */ false)
        .catch((error: unknown) => {
          logger?.('Failed to remove logpoint', error);
        });
    }
    this.#records.clear();
  }

  /**
   * Reads the current state of the breakpoint into the logpoint, so that
   * listing reflects re-binding done by the breakpoint manager after reloads.
   */
  #snapshot(record: LogpointRecord): Logpoint {
    const modelBreakpoint = record.breakpoint.modelBreakpoint(
      this.#debuggerModel,
    );
    const generatedLocations: GeneratedLocation[] = [];
    if (record.breakpoint.bound()) {
      for (const position of modelBreakpoint?.currentState ?? []) {
        generatedLocations.push({
          url: position.url,
          lineNumber: position.lineNumber + 1,
          columnNumber: (position.columnNumber ?? 0) + 1,
        });
      }
    }
    record.logpoint.generatedLocations = generatedLocations;
    return {...record.logpoint, generatedLocations: [...generatedLocations]};
  }

  async #findUISourceCode(url: string): Promise<UISourceCode | null> {
    let match = this.#matchUISourceCode(url);
    if (!match) {
      // Original sources only appear in the workspace once their source map
      // has loaded.
      await loadSourceMaps(this.#debuggerModel);
      match = this.#matchUISourceCode(url);
    }
    return match;
  }

  /**
   * Finds the workspace source code for a script or original source URL.
   * An exact URL match wins; otherwise the URL is matched as a path suffix so
   * that users can pass "src/app.ts" without knowing the bundler's URL
   * scheme. An ambiguous suffix match is reported as an error.
   */
  #matchUISourceCode(url: string): UISourceCode | null {
    const candidates = new Map<string, UISourceCode>();
    for (const uiSourceCode of this.#workspace.uiSourceCodes()) {
      const projectType = uiSourceCode.project().type();
      if (
        projectType !== Workspace.Workspace.projectTypes.Network &&
        projectType !== Workspace.Workspace.projectTypes.ContentScripts
      ) {
        continue;
      }
      const candidateUrl = uiSourceCode.url();
      if (candidateUrl === url) {
        return uiSourceCode;
      }
      if (candidateUrl.endsWith('/' + url) && !candidates.has(candidateUrl)) {
        candidates.set(candidateUrl, uiSourceCode);
      }
    }
    if (candidates.size > 1) {
      throw new Error(
        `"${url}" matches multiple sources: ${[...candidates.keys()].join(', ')}. Specify a longer path.`,
      );
    }
    return candidates.values().next().value ?? null;
  }

  /**
   * Source maps load lazily, so after a reload the original sources of a
   * rebuilt bundle would not re-appear in the workspace and a logpoint on an
   * original source file could not be re-bound to the new generated
   * location. While logpoints exist, the source maps of newly parsed scripts
   * are loaded eagerly instead, like DevTools does with a Sources panel open.
   */
  #ensureSourceMapsLoadOnParse(): void {
    if (this.#scriptListener) {
      return;
    }
    const model = this.#debuggerModel;
    const onParsed = (
      event: Parameters<
        Parameters<DevTools.DebuggerModel['addEventListener']>[1]
      >[0],
    ): void => {
      const script = event.data;
      // Only ParsedScriptSource events are subscribed to; their data is the
      // parsed script.
      if (script instanceof DevTools.DebuggerModel || !script.sourceMapURL) {
        return;
      }
      // The debugger model registers the source map with the source map
      // manager right after dispatching this event, so defer the load.
      void Promise.resolve()
        .then(() => model.sourceMapManager().sourceMapForClientPromise(script))
        .catch((error: unknown) => {
          logger?.('Failed to load source map for', script.sourceURL, error);
        });
    };
    // The event enum is not exported through the DevTools mcp entrypoint.
    const parsedScriptSource = 'ParsedScriptSource' as Parameters<
      DevTools.DebuggerModel['addEventListener']
    >[0];
    model.addEventListener(parsedScriptSource, onParsed);
    this.#scriptListener = () => {
      model.removeEventListener(parsedScriptSource, onParsed);
    };
  }

  #stopLoadingSourceMapsOnParse(): void {
    this.#scriptListener?.();
    this.#scriptListener = undefined;
  }
}
