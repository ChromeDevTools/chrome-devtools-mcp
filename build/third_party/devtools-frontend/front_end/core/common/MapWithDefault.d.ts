/**
 * Polyfill of https://github.com/tc39/proposal-upsert with a subclass.
 *
 * TODO: Once the proposal is merged, just replace `MapWithDefault` with `Map` and remove it.
 **/
export declare class MapWithDefault<K, V> extends Map<K, V> {
    getOrInsert(key: K, defaultValue: V): V;
    getOrInsertComputed(key: K, callbackFunction: (key: K) => V): V;
}
