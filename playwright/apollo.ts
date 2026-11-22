
/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {Page, Response} from '@playwright/test';

export interface ApolloGraphQLError {
  operationName?: string;
  message: string;
}

export interface ApolloRuntimeEvent {
  operationName?: string;
  url: string;
  graphqlErrors: ApolloGraphQLError[];
  httpStatus: number;
}

interface GraphQLErrorEnvelope {
  message?: string;
  path?: unknown[];
}

interface GraphQLResponseEnvelope {
  errors?: GraphQLErrorEnvelope[];
  data?: unknown;
}

export function attachApolloRuntimeMonitor(page: Page) {
  const events: ApolloRuntimeEvent[] = [];
  const graphqlPath = process.env.APOLLO_GRAPHQL_PATH;

  page.on('response', (response: Response) => {
    if (
      graphqlPath &&
      !response.url().toLowerCase().includes(graphqlPath.toLowerCase())
    ) {
      return;
    }

    const request = response.request();
    const contentType = request.headers()['content-type'] ?? '';
    if (!contentType.includes('application/json')) {
      return;
    }

    void response
      .json()
      .then((body: unknown) => {
        if (
          typeof body !== 'object' ||
          body === null ||
          !('errors' in body)
        ) {
          return;
        }

        const envelope: GraphQLResponseEnvelope = body;
        let operationName: string | undefined;
        const postData = request.postData();
        if (postData) {
          try {
            const requestEnvelope = JSON.parse(postData);
            if (
              typeof requestEnvelope === 'object' &&
              requestEnvelope !== null &&
              'operationName' in requestEnvelope &&
              typeof requestEnvelope.operationName === 'string'
            ) {
              operationName = requestEnvelope.operationName;
            }
          } catch {
            operationName = undefined;
          }
        }

        events.push({
          operationName,
          url: response.url(),
          httpStatus: response.status(),
          graphqlErrors: (envelope.errors ?? []).map(error => ({
            operationName,
            message: error.message ?? 'Unknown GraphQL error',
          })),
        });
      })
      .catch(() => undefined);
  });

  return {
    events,
    assertNoGraphQLErrors(): void {
      if (events.length === 0) {
        return;
      }
      const details = events
        .flatMap(event =>
          event.graphqlErrors.map(error =>
            `${event.operationName ?? 'unnamed operation'}: ${error.message}`,
          ),
        )
        .join('\n');
      if (details) {
        throw new Error(`Apollo GraphQL errors detected:\n${details}`);
      }
    },
  };
}
