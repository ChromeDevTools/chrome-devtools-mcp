/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {GeneratedLocation, Logpoint} from '../LogpointManager.js';

export interface StructuredLogpoint {
  url: string;
  lineNumber: number;
  columnNumber?: number;
  expression: string;
  sourceMapped: boolean;
  generatedLocations: GeneratedLocation[];
}

function formatLocation(
  url: string,
  lineNumber: number,
  columnNumber?: number,
): string {
  return `${url}:${lineNumber}${columnNumber === undefined ? '' : `:${columnNumber}`}`;
}

function formatLogpoint(logpoint: StructuredLogpoint): string {
  const location = formatLocation(
    logpoint.url,
    logpoint.lineNumber,
    logpoint.columnNumber,
  );
  let status: string;
  if (logpoint.generatedLocations.length === 0) {
    status = 'not bound (no parsed script contains the location)';
  } else if (logpoint.sourceMapped) {
    status = `bound via source map at ${logpoint.generatedLocations
      .map(generated => {
        return formatLocation(
          generated.url,
          generated.lineNumber,
          generated.columnNumber,
        );
      })
      .join(', ')}`;
  } else {
    status = 'bound';
  }
  return `- ${location} logging \`${logpoint.expression}\` [${status}]`;
}

function formatLogpoints(logpoints: readonly StructuredLogpoint[]): string {
  if (logpoints.length === 0) {
    return 'No logpoints are set on the page.';
  }
  const lines = [`${logpoints.length} logpoint(s) set on the page:`];
  for (const logpoint of logpoints) {
    lines.push(formatLogpoint(logpoint));
  }
  return lines.join('\n');
}

export class LogpointFormatter {
  readonly #logpoints: readonly StructuredLogpoint[];

  constructor(logpoints: readonly Logpoint[]) {
    this.#logpoints = logpoints.map(logpoint => {
      const item: StructuredLogpoint = {
        url: logpoint.url,
        lineNumber: logpoint.lineNumber,
        expression: logpoint.expression,
        sourceMapped: logpoint.sourceMapped,
        generatedLocations: logpoint.generatedLocations.map(generated => {
          return {...generated};
        }),
      };
      if (logpoint.columnNumber !== undefined) {
        item.columnNumber = logpoint.columnNumber;
      }
      return item;
    });
  }

  toJSON(): StructuredLogpoint[] {
    return [...this.#logpoints];
  }

  toString(): string {
    return formatLogpoints(this.toJSON());
  }
}
