/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Target, Page, Protocol } from '../third_party/index.js';
export type DialogAction = 'accept' | 'dismiss' | string;
export declare class WaitForHelper {
    #private;
    constructor(page: Page, cpuTimeoutMultiplier: number, networkTimeoutMultiplier: number);
    /**
     * A wrapper that executes a action and waits for
     * a potential navigation, after which it waits
     * for the DOM to be stable before returning.
     */
    waitForStableDom(): Promise<void>;
    timeout(time: number): Promise<void>;
    waitForEventsAfterAction(action: (signal: AbortSignal) => Promise<unknown>, options?: {
        timeout?: number;
        waitForStableDom?: boolean;
        expectNavigationIn?: number;
        handleDialog?: DialogAction | Partial<Record<Protocol.Page.DialogType, DialogAction>>;
    }): Promise<WaitForEventsResult>;
}
export interface WaitForEventsResult {
    /**
     * The URL the page navigated to during the action, if a navigation
     * occurred.
     */
    navigatedToUrl?: string;
    /**
     * Whether a dialog was automatically handled during the action.
     */
    dialogHandled?: boolean;
    openedPages?: Set<Target>;
}
export declare function getNetworkMultiplierFromString(condition: string | null): number;
