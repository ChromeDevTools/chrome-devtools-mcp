type ElementType<T extends ArrayLike<unknown>> = T extends ArrayLike<infer E> ? E : never;
/**
 * Abstracts some generic operations that have different implementations depending
 * on whether we operate on strings or array of things.
 **/
interface TrieableTrait<T extends ArrayLike<ElementType<T>>> {
    empty(): T;
    append(base: T, appendage: ElementType<T>): T;
    slice(base: T, start: number, end: number): T;
}
export declare class Trie<T extends ArrayLike<ElementType<T>>> {
    #private;
    constructor(traitImpl: TrieableTrait<T>);
    static newStringTrie(): Trie<string>;
    static newArrayTrie<T extends Array<ElementType<T>>>(): Trie<Array<ElementType<T>>>;
    add(word: T): void;
    remove(word: T): boolean;
    has(word: T): boolean;
    words(prefix?: T): T[];
    private dfs;
    longestPrefix(word: T, fullWordOnly: boolean): T;
    clear(): void;
}
export {};
