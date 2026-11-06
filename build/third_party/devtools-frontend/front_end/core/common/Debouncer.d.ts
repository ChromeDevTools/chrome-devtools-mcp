/**
 * Debounce utility function, ensures that the function passed in is only called once the function stops being called and the delay has expired.
 */
export declare const debounce: (func: (...args: any[]) => void, delay: number) => ((...args: any[]) => void) & {
    cancel: () => void;
};
export declare function enableTestOverride(): void;
export declare function disableTestOverride(): void;
