/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {Script} from 'node:vm';

import type {TargetUniverse} from './devtools/DevtoolsUtils.js';
import {DevTools} from './third_party/index.js';
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

export interface Logpoint {
  /** The full URL of the script or original source the logpoint was set in. */
  url: string;
  lineNumber: number;
  columnNumber?: number;
  expression: string;
  /**
   * Whether `url` is an original source file from a source map rather than
   * a script as served to the browser.
   */
  sourceMapped: boolean;
  /**
   * The locations in the scripts served to the browser the logpoint is
   * currently set at. Empty while no parsed script contains the location,
   * for example right after a reload before the script was parsed again.
   */
  generatedLocations: GeneratedLocation[];
}

/**
 * Thrown by {@link LogpointManager.setLogpoints} when some locations could
 * not be bound. The other logpoints were applied; `logpoints` holds the
 * resulting state.
 */
export class LogpointError extends Error {
  readonly logpoints: Logpoint[];

  constructor(message: string, logpoints: Logpoint[]) {
    super(message);
    this.name = 'LogpointError';
    this.logpoints = logpoints;
  }
}

type Universe = DevTools.Foundation.Universe.Universe;
type Breakpoint = DevTools.BreakpointManager.Breakpoint;
type UserCondition = DevTools.BreakpointManager.UserCondition;
type UISourceCode = DevTools.Workspace.UISourceCode.UISourceCode;

interface LogpointRecord {
  logpoint: Logpoint;
  breakpoint: Breakpoint;
}

interface ResolvedLogpoint {
  options: LogpointOptions;
  uiSourceCode: UISourceCode;
  key: string;
}

export const LOGPOINT_FORMAT =
  '<url>:<lineNumber>[:<columnNumber>] <expression>';

/**
 * Parses a logpoint given as `<url>:<lineNumber>[:<columnNumber>] <expression>`.
 * The url may itself contain colons (for example a port), so the location is
 * the shortest prefix that ends in one or two numbers followed by whitespace.
 */
export function parseLogpoint(text: string): LogpointOptions {
  const match = /^(\S+?):(\d+)(?::(\d+))?\s+(\S.*)$/s.exec(text.trim());
  if (!match) {
    throw new Error(
      `Invalid logpoint "${text}". Expected the format ${LOGPOINT_FORMAT}, for example "src/app.ts:42 'total', cart.total".`,
    );
  }
  const [, url, lineNumber, columnNumber, expression] = match;
  const logpoint: LogpointOptions = {
    url,
    lineNumber: Number(lineNumber),
    expression,
  };
  if (columnNumber !== undefined) {
    logpoint.columnNumber = Number(columnNumber);
  }
  if (logpoint.lineNumber < 1 || logpoint.columnNumber === 0) {
    throw new Error(
      `Invalid logpoint "${text}": line and column numbers are 1-based.`,
    );
  }
  return logpoint;
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
      `The logpoint expression \`${expression}\` does not compile: ${error instanceof Error ? error.message : String(error)}. Provide the expression like arguments to console.log(...).`,
    );
  }
}

/**
 * DevTools brands breakpoint conditions nominally; any string is a valid
 * user condition.
 */
function toUserCondition(expression: string): UserCondition;
function toUserCondition(expression: string): string {
  return expression;
}

function locationKey(
  url: string,
  lineNumber: number,
  columnNumber: number | undefined,
): string {
  return `${url}:${lineNumber}${columnNumber === undefined ? '' : `:${columnNumber}`}`;
}

function baseName(url: string): string {
  return url.slice(url.lastIndexOf('/') + 1).toLowerCase();
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
 * Manages logpoints for a single page on top of the `BreakpointManager` of
 * the page's DevTools universe.
 *
 * A logpoint is a DevTools breakpoint with `isLogpoint` set: its condition
 * logs the expression and never pauses. The breakpoint manager resolves the
 * location through source maps, substitutes minified variable names in the
 * expression and keeps the breakpoint bound across reloads and rebuilt
 * bundles. This class only maps the tool API (URLs and 1-based positions)
 * onto workspace source codes.
 */
export class LogpointManager {
  readonly #universe: Universe;
  readonly #target: DevTools.Target;
  /** Keyed by the resolved source URL and position. */
  readonly #records = new Map<string, LogpointRecord>();

  constructor(devTools: TargetUniverse) {
    this.#universe = devTools.universe;
    this.#target = devTools.target;
  }

  get #debuggerModel(): DevTools.DebuggerModel {
    const model = this.#target.model(DevTools.DebuggerModel);
    if (!model) {
      throw new Error('The DevTools debugger model is not available.');
    }
    return model;
  }

  /**
   * Makes the given logpoints the complete set of logpoints on the page:
   * logpoints not in the list are removed, new ones are added and the
   * expression of an existing logpoint at the same location is replaced.
   * Expressions and locations are validated before anything is changed.
   * Throws a {@link LogpointError} when a location has no executable code;
   * the other logpoints are applied regardless.
   */
  async setLogpoints(desired: LogpointOptions[]): Promise<Logpoint[]> {
    for (const options of desired) {
      validateExpression(options.expression);
    }
    const resolved = new Map<string, ResolvedLogpoint>();
    for (const options of desired) {
      const uiSourceCode = await this.#findUISourceCode(options.url);
      const key = locationKey(
        uiSourceCode.url(),
        options.lineNumber,
        options.columnNumber,
      );
      // The last entry for a location wins, like setting it twice would.
      resolved.set(key, {options, uiSourceCode, key});
    }

    for (const [key, record] of [...this.#records]) {
      if (!resolved.has(key)) {
        this.#records.delete(key);
        await record.breakpoint.remove(/* keepInStorage */ false);
      }
    }

    const unbound: string[] = [];
    for (const {options, uiSourceCode, key} of resolved.values()) {
      const breakpoint = await this.#universe.breakpointManager.setBreakpoint(
        uiSourceCode,
        // The tool API is 1-based like the DevTools UI; the model is 0-based.
        options.lineNumber - 1,
        options.columnNumber === undefined
          ? undefined
          : options.columnNumber - 1,
        toUserCondition(options.expression),
        /* enabled */ true,
        /* isLogpoint */ true,
        DevTools.BreakpointManager.BreakpointOrigin.USER_ACTION,
      );
      if (!breakpoint) {
        unbound.push(key);
        continue;
      }
      // Wait for the breakpoint to be set in the backend so that the result
      // reports whether the location resolved.
      await breakpoint.updateBreakpoint();

      const existing = this.#records.get(key);
      if (existing) {
        // DevTools keeps one breakpoint per location, so the expression of
        // the existing logpoint was replaced.
        existing.logpoint.expression = options.expression;
        continue;
      }
      if (!breakpoint.bound()) {
        await breakpoint.remove(/* keepInStorage */ false);
        unbound.push(key);
        continue;
      }
      this.#records.set(key, {
        logpoint: {
          url: uiSourceCode.url(),
          lineNumber: options.lineNumber,
          columnNumber: options.columnNumber,
          expression: options.expression,
          sourceMapped: uiSourceCode.contentType().isFromSourceMap(),
          generatedLocations: [],
        },
        breakpoint,
      });
    }

    this.#setLazySourceMapLoading(this.#records.size === 0);

    const logpoints = this.#currentLogpoints();
    if (unbound.length) {
      throw new LogpointError(
        `No executable code at ${unbound.join(', ')} (for example a comment, type annotation or empty line, or a line not mapped to the generated script). Pick lines containing executable code. The other logpoints were applied.`,
        logpoints,
      );
    }
    return logpoints;
  }

  /**
   * Releases the records. The breakpoints are not removed from the backend:
   * the universe is being disposed and its session detaches, which removes
   * them along with the page.
   */
  dispose(): void {
    this.#records.clear();
  }

  #currentLogpoints(): Logpoint[] {
    return [...this.#records.values()].map(record => this.#snapshot(record));
  }

  /**
   * Reads the current state of the breakpoint into a copy of the logpoint,
   * so that the result reflects re-binding done by the breakpoint manager
   * after reloads.
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
    return {...record.logpoint, generatedLocations};
  }

  /**
   * Source maps load lazily by default, so after a reload the original
   * sources of a rebuilt bundle would not re-appear in the workspace and a
   * logpoint on an original source file could not be re-bound to the new
   * generated location. While logpoints exist, source maps are loaded
   * eagerly instead, like DevTools does with the Sources panel open.
   */
  #setLazySourceMapLoading(lazy: boolean): void {
    this.#universe.settings
      .resolve(DevTools.SourceMapManager.lazyLoadingSettingDescriptor)
      .set(lazy);
  }

  /**
   * Finds the workspace source code for a script or original source URL,
   * loading source maps if needed. Throws a descriptive error, including
   * sources with the same file name, when nothing matches.
   */
  async #findUISourceCode(url: string): Promise<UISourceCode> {
    let match = this.#matchUISourceCode(url);
    if (!match) {
      // Original sources only appear in the workspace once their source map
      // has loaded.
      await loadSourceMaps(this.#debuggerModel);
      match = this.#matchUISourceCode(url);
    }
    if (match) {
      return match;
    }
    const name = baseName(url);
    const similar = [...this.#pageSourceCodes()]
      .map(uiSourceCode => uiSourceCode.url())
      .filter(candidate => baseName(candidate) === name)
      .slice(0, 5);
    throw new Error(
      `No parsed script or original source file matches "${url}". The url must match the URL of a script as served to the browser or an original source file from a source map, exactly or as a path suffix.${similar.length ? ` Sources with the same file name: ${similar.join(', ')}.` : ''}`,
    );
  }

  /** The scripts and source-map sources of the page in the workspace. */
  *#pageSourceCodes(): Iterable<UISourceCode> {
    for (const uiSourceCode of this.#universe.workspace.uiSourceCodes()) {
      const projectType = uiSourceCode.project().type();
      if (
        projectType === DevTools.Workspace.Workspace.projectTypes.Network ||
        projectType === DevTools.Workspace.Workspace.projectTypes.ContentScripts
      ) {
        yield uiSourceCode;
      }
    }
  }

  /**
   * Finds the workspace source code for a script or original source URL.
   * An exact URL match wins; otherwise the URL is matched as a path suffix so
   * that users can pass "src/app.ts" without knowing the bundler's URL
   * scheme. An ambiguous suffix match is reported as an error.
   */
  #matchUISourceCode(url: string): UISourceCode | null {
    const candidates = new Map<string, UISourceCode>();
    for (const uiSourceCode of this.#pageSourceCodes()) {
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
}
