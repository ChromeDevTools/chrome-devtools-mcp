import type { LocalizedString } from './UIString.js';
/**
 * Represents an error that might become visible to the user. Where errors
 * might be surfaced to the user (such as by displaying the message to the
 * console), this class should be used to enforce that the message is
 * localized on the way in.
 */
export declare class UserVisibleError extends Error {
    readonly message: LocalizedString;
    constructor(message: LocalizedString);
}
export declare function isUserVisibleError(error: unknown): error is UserVisibleError;
