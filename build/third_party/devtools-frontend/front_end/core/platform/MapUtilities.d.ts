export declare const inverse: <K, V>(map: Map<K, V>) => Multimap<V, K>;
export declare class Multimap<K, V> {
    private map;
    set(key: K, value: V): void;
    get(key: K): Set<V>;
    has(key: K): boolean;
    hasValue(key: K, value: V): boolean;
    get size(): number;
    delete(key: K, value: V): boolean;
    deleteAll(key: K): void;
    keysArray(): K[];
    keys(): IterableIterator<K>;
    valuesArray(): V[];
    clear(): void;
}
/**
 * Gets value for key, assigning a default if value is falsy.
 */
export declare function getWithDefault<K extends {}, V>(map: WeakMap<K, V> | Map<K, V>, key: K, defaultValueFactory: (key?: K) => V): V;
