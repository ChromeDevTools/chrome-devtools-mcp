import type * as Platform from '../platform/platform.js';
/**
 * Interface for global revealers, which are entities responsible for
 * dealing with revealing certain types of objects. For example, the
 * Sources panel will register a revealer for `UISourceCode` objects,
 * which will ensure that its visible in an editor tab.
 */
export interface Revealer<T> {
    reveal(revealable: T, omitFocus?: boolean): Promise<void>;
}
/**
 * Registration for revealers, which deals with keeping a list of all possible
 * revealers, lazily instantiating them as necessary and invoking their `reveal`
 * methods depending on the _context types_ they were registered for.
 *
 * @see Revealer
 */
export declare class RevealerRegistry {
    private readonly registeredRevealers;
    /**
     * Yields the singleton instance, creating it on-demand when necessary.
     *
     * @returns the singleton instance.
     */
    static instance(): RevealerRegistry;
    /**
     * Clears the singleton instance (if any).
     */
    static removeInstance(): void;
    /**
     * Register a new `Revealer` as described by the `registration`.
     *
     * @param registration the description.
     */
    register(registration: RevealerRegistration<unknown>): void;
    /**
     * Reveals the `revealable`.
     *
     * @param revealable the object to reveal.
     * @param omitFocus whether to omit focusing on the presentation of `revealable` afterwards.
     */
    reveal(revealable: unknown, omitFocus: boolean): Promise<void>;
    getApplicableRegisteredRevealers(revealable: unknown): Array<RevealerRegistration<unknown>>;
}
export declare function revealDestination(revealable: unknown): string | null;
/**
 * Register a new `Revealer` as described by the `registration` on the singleton
 * {@link RevealerRegistry} instance.
 *
 * @param registration the description.
 */
export declare function registerRevealer<T>(registration: RevealerRegistration<T>): void;
/**
 * Reveals the `revealable` via the singleton {@link RevealerRegistry} instance.
 *
 * @param revealable the object to reveal.
 * @param omitFocus whether to omit focusing on the presentation of `revealable` afterwards.
 */
export declare function reveal(revealable: unknown, omitFocus?: boolean): Promise<void>;
export interface RevealerRegistration<T> {
    contextTypes: () => Array<abstract new (...any: any[]) => T>;
    loadRevealer: () => Promise<Revealer<T>>;
    destination?: RevealerDestination;
}
export declare const RevealerDestination: Record<string, RevealerDestination>;
export type RevealerDestination = () => Platform.UIString.LocalizedString;
