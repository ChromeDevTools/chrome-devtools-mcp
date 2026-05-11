/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export class SubscriptionManager {
  #subscriptions = new Set<string>();

  subscribe(uri: string): void {
    this.#subscriptions.add(uri);
  }

  unsubscribe(uri: string): void {
    this.#subscriptions.delete(uri);
  }

  isSubscribed(uri: string): boolean {
    return this.#subscriptions.has(uri);
  }

  getSubscribedUris(): string[] {
    return Array.from(this.#subscriptions);
  }
}
