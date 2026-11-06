/**
 * An object which provides functionality similar to Uint32Array. It may be
 * implemented as:
 * 1. A Uint32Array,
 * 2. An array of Uint32Arrays, to support more data than Uint32Array, or
 * 3. A plain array, in which case the length may change by setting values.
 */
export interface BigUint32Array {
    get length(): number;
    getValue(index: number): number;
    setValue(index: number, value: number): void;
    asUint32ArrayOrFail(): Uint32Array;
    asArrayOrFail(): number[];
}
/**
 * @returns A BigUint32Array implementation which is based on Array.
 * This means that its length automatically expands to include the highest index
 * used, and asArrayOrFail will succeed.
 */
export declare function createExpandableBigUint32Array(): BigUint32Array;
/**
 * @returns A BigUint32Array implementation which is based on Uint32Array.
 * If the length is small enough to fit in a single Uint32Array, then
 * asUint32ArrayOrFail will succeed. Otherwise, it will throw an exception.
 */
export declare function createFixedBigUint32Array(length: number, maxLengthForTesting?: number): BigUint32Array;
export interface BitVector {
    getBit(index: number): boolean;
    setBit(index: number): void;
    clearBit(index: number): void;
    previous(index: number): number;
    get buffer(): ArrayBuffer;
}
export declare function createBitVector(lengthOrBuffer: number | ArrayBuffer): BitVector;
