/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {HTTPRequest} from 'puppeteer-core';

/**
 * Gets a short, one-line description of a network request.
 *
 * @param request - The HTTP request.
 * @returns A short description of the request.
 * @public
 */
export function getShortDescriptionForRequest(request: HTTPRequest): string {
  return `${request.url()} ${request.method()} ${getStatusFromRequest(request)}`;
}

/**
 * Gets the status of a network request as a string.
 *
 * @param request - The HTTP request.
 * @returns The status of the request.
 * @public
 */
export function getStatusFromRequest(request: HTTPRequest): string {
  const httpResponse = request.response();
  const failure = request.failure();
  let status: string;
  if (httpResponse) {
    const responseStatus = httpResponse.status();
    status =
      responseStatus >= 200 && responseStatus <= 299
        ? `[success - ${responseStatus}]`
        : `[failed - ${responseStatus}]`;
  } else if (failure) {
    status = `[failed - ${failure.errorText}]`;
  } else {
    status = '[pending]';
  }
  return status;
}

/**
 * Formats a record of headers into an array of strings.
 *
 * @param headers - The headers to format.
 * @returns An array of formatted header strings.
 * @public
 */
export function getFormattedHeaderValue(
  headers: Record<string, string>,
): string[] {
  const response: string[] = [];
  for (const [name, value] of Object.entries(headers)) {
    response.push(`- ${name}:${value}`);
  }
  return response;
}
