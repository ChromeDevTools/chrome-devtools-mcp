// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @returns A BigUint32Array implementation which is based on Array.
 * This means that its length automatically expands to include the highest index
 * used, and asArrayOrFail will succeed.
 */
export function createExpandableBigUint32Array() {
    return new ExpandableBigUint32ArrayImpl();
}
/**
 * @returns A BigUint32Array implementation which is based on Uint32Array.
 * If the length is small enough to fit in a single Uint32Array, then
 * asUint32ArrayOrFail will succeed. Otherwise, it will throw an exception.
 */
export function createFixedBigUint32Array(length, maxLengthForTesting) {
    try {
        if (maxLengthForTesting !== undefined && length > maxLengthForTesting) {
            // Simulate allocation failure.
            throw new RangeError();
        }
        return new BasicBigUint32ArrayImpl(length);
    }
    catch {
        // We couldn't allocate a big enough ArrayBuffer.
        return new SplitBigUint32ArrayImpl(length, maxLengthForTesting);
    }
}
class BasicBigUint32ArrayImpl extends Uint32Array {
    getValue(index) {
        return this[index];
    }
    setValue(index, value) {
        this[index] = value;
    }
    asUint32ArrayOrFail() {
        return this;
    }
    asArrayOrFail() {
        throw new Error('Not an array');
    }
}
class SplitBigUint32ArrayImpl {
    #data;
    #partLength;
    length;
    constructor(length, maxLengthForTesting) {
        this.#data = [];
        this.length = length;
        let partCount = 1;
        while (true) {
            partCount *= 2;
            this.#partLength = Math.ceil(length / partCount);
            try {
                if (maxLengthForTesting !== undefined && this.#partLength > maxLengthForTesting) {
                    // Simulate allocation failure.
                    throw new RangeError();
                }
                for (let i = 0; i < partCount; ++i) {
                    this.#data[i] = new Uint32Array(this.#partLength);
                }
                return;
            }
            catch (e) {
                if (this.#partLength < 1e6) {
                    // The length per part is already small, so continuing to subdivide it
                    // will probably not help.
                    throw e;
                }
            }
        }
    }
    getValue(index) {
        if (index >= 0 && index < this.length) {
            const partLength = this.#partLength;
            return this.#data[Math.floor(index / partLength)][index % partLength];
        }
        // On out-of-bounds accesses, match the behavior of Uint32Array: return an
        // undefined value that's incorrectly typed as number.
        return this.#data[0][-1];
    }
    setValue(index, value) {
        if (index >= 0 && index < this.length) {
            const partLength = this.#partLength;
            this.#data[Math.floor(index / partLength)][index % partLength] = value;
        }
        // Attempting to set a value out of bounds does nothing, like Uint32Array.
    }
    asUint32ArrayOrFail() {
        throw new Error('Not a Uint32Array');
    }
    asArrayOrFail() {
        throw new Error('Not an array');
    }
}
class ExpandableBigUint32ArrayImpl extends Array {
    getValue(index) {
        return this[index];
    }
    setValue(index, value) {
        this[index] = value;
    }
    asUint32ArrayOrFail() {
        throw new Error('Not a Uint32Array');
    }
    asArrayOrFail() {
        return this;
    }
}
export function createBitVector(lengthOrBuffer) {
    return new BitVectorImpl(lengthOrBuffer);
}
class BitVectorImpl extends Uint8Array {
    constructor(lengthOrBuffer) {
        if (typeof lengthOrBuffer === 'number') {
            super(Math.ceil(lengthOrBuffer / 8));
        }
        else {
            super(lengthOrBuffer);
        }
    }
    getBit(index) {
        const value = this[index >> 3] & (1 << (index & 7));
        return value !== 0;
    }
    setBit(index) {
        this[index >> 3] |= (1 << (index & 7));
    }
    clearBit(index) {
        this[index >> 3] &= ~(1 << (index & 7));
    }
    previous(index) {
        // First, check for more bits in the current byte.
        while (index !== ((index >> 3) << 3)) {
            --index;
            if (this.getBit(index)) {
                return index;
            }
        }
        // Next, iterate by bytes to skip over ranges of zeros.
        let byteIndex = (index >> 3) - 1;
        while (byteIndex >= 0 && this[byteIndex] === 0) {
            --byteIndex;
        }
        if (byteIndex < 0) {
            return -1;
        }
        // Finally, iterate the nonzero byte to find the highest bit.
        for (index = (byteIndex << 3) + 7; index >= (byteIndex << 3); --index) {
            if (this.getBit(index)) {
                return index;
            }
        }
        throw new Error('Unreachable');
    }
}
//# sourceMappingURL=TypedArrayUtilities.js.map