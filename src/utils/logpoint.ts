/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

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
  /**
   * The full URL of the script or original source the logpoint was set in.
   * DevTools normalizes locations, so this can be the original source file
   * of a location that was given in a generated script.
   */
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
