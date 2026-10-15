// Copyright 2020 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
export const removeElement = (array, element, firstOnly) => {
    let index = array.indexOf(element);
    if (index === -1) {
        return false;
    }
    if (firstOnly) {
        array.splice(index, 1);
        return true;
    }
    for (let i = index + 1, n = array.length; i < n; ++i) {
        if (array[i] !== element) {
            array[index++] = array[i];
        }
    }
    array.length = index;
    return true;
};
export function swap(array, i1, i2) {
    const temp = array[i1];
    array[i1] = array[i2];
    array[i2] = temp;
}
function partition(array, comparator, left, right, pivotIndex) {
    const pivotValue = array[pivotIndex];
    swap(array, right, pivotIndex);
    let storeIndex = left;
    for (let i = left; i < right; ++i) {
        if (comparator(array[i], pivotValue) < 0) {
            swap(array, storeIndex, i);
            ++storeIndex;
        }
    }
    swap(array, right, storeIndex);
    return storeIndex;
}
function quickSortRange(array, comparator, left, right, sortWindowLeft, sortWindowRight) {
    if (right <= left) {
        return;
    }
    const pivotIndex = Math.floor(Math.random() * (right - left)) + left;
    const pivotNewIndex = partition(array, comparator, left, right, pivotIndex);
    if (sortWindowLeft < pivotNewIndex) {
        quickSortRange(array, comparator, left, pivotNewIndex - 1, sortWindowLeft, sortWindowRight);
    }
    if (pivotNewIndex < sortWindowRight) {
        quickSortRange(array, comparator, pivotNewIndex + 1, right, sortWindowLeft, sortWindowRight);
    }
}
export function sortRange(array, comparator, leftBound, rightBound, sortWindowLeft, sortWindowRight) {
    if (leftBound === 0 && rightBound === (array.length - 1) && sortWindowLeft === 0 && sortWindowRight >= rightBound) {
        array.sort(comparator);
    }
    else {
        quickSortRange(array, comparator, leftBound, rightBound, sortWindowLeft, sortWindowRight);
    }
    return array;
}
export const binaryIndexOf = (array, value, comparator) => {
    const index = lowerBound(array, value, comparator);
    return index < array.length && comparator(value, array[index]) === 0 ? index : -1;
};
function mergeOrIntersect(array1, array2, comparator, mergeNotIntersect) {
    const result = [];
    let i = 0;
    let j = 0;
    while (i < array1.length && j < array2.length) {
        const compareValue = comparator(array1[i], array2[j]);
        if (mergeNotIntersect || !compareValue) {
            result.push(compareValue <= 0 ? array1[i] : array2[j]);
        }
        if (compareValue <= 0) {
            i++;
        }
        if (compareValue >= 0) {
            j++;
        }
    }
    if (mergeNotIntersect) {
        while (i < array1.length) {
            result.push(array1[i++]);
        }
        while (j < array2.length) {
            result.push(array2[j++]);
        }
    }
    return result;
}
export const intersectOrdered = (array1, array2, comparator) => {
    return mergeOrIntersect(array1, array2, comparator, false);
};
export const mergeOrdered = (array1, array2, comparator) => {
    return mergeOrIntersect(array1, array2, comparator, true);
};
export const DEFAULT_COMPARATOR = (a, b) => {
    return a < b ? -1 : (a > b ? 1 : 0);
};
export function lowerBound(array, needle, comparator, left, right) {
    let l = left || 0;
    let r = right !== undefined ? right : array.length;
    while (l < r) {
        const m = (l + r) >> 1;
        if (comparator(needle, array[m]) > 0) {
            l = m + 1;
        }
        else {
            r = m;
        }
    }
    return r;
}
/**
 * Inserts a value into a sorted array in O(n) time (O(log n) search using the provided comparator and O(n) insertion).
 * Returns the index at which the value was inserted.
 */
export function insertWithComparator(array, value, comparator) {
    const index = lowerBound(array, value, comparator);
    array.splice(index, 0, value);
    return index;
}
export function upperBound(array, needle, comparator, left, right) {
    let l = left || 0;
    let r = right !== undefined ? right : array.length;
    while (l < r) {
        const m = (l + r) >> 1;
        if (comparator(needle, array[m]) >= 0) {
            l = m + 1;
        }
        else {
            r = m;
        }
    }
    return r;
}
/**
 * Obtains the first or last item in the array that satisfies the predicate function.
 * So, for example, if the array were arr = [2, 4, 6, 8, 10], and you are looking for
 * the last item arr[i] such that arr[i] < 5  you would be returned 1, because
 * array[1] is 4, the last item in the array that satisfies the
 * predicate function.
 *
 * If instead you were looking for the first item in the same array that satisfies
 * arr[i] > 5 you would be returned 2 because array[2] = 6.
 *
 * Please note: this presupposes that the array is already ordered.
 * This function uses a variation of Binary Search.
 */
function nearestIndex(arr, predicate, searchStart) {
    const searchFromEnd = searchStart === "END" /* NearestSearchStart.END */;
    if (arr.length === 0) {
        return null;
    }
    let left = 0;
    let right = arr.length - 1;
    let pivot = 0;
    let matchesPredicate = false;
    let moveToTheRight = false;
    let middle = 0;
    do {
        middle = left + (right - left) / 2;
        pivot = searchFromEnd ? Math.ceil(middle) : Math.floor(middle);
        matchesPredicate = predicate(arr[pivot]);
        moveToTheRight = matchesPredicate === searchFromEnd;
        if (moveToTheRight) {
            left = Math.min(right, pivot + (left === pivot ? 1 : 0));
        }
        else {
            right = Math.max(left, pivot + (right === pivot ? -1 : 0));
        }
    } while (right !== left);
    // Special-case: the indexed item doesn't pass the predicate. This
    // occurs when none of the items in the array are a match for the
    // predicate.
    if (!predicate(arr[left])) {
        return null;
    }
    return left;
}
/**
 * Obtains the first item in the array that satisfies the predicate function.
 * So, for example, if the array was arr = [2, 4, 6, 8, 10], and you are looking for
 * the first item arr[i] such that arr[i] > 5 you would be returned 2, because
 * array[2] is 6, the first item in the array that satisfies the
 * predicate function.
 *
 * Please note: this presupposes that the array is already ordered.
 */
export function nearestIndexFromBeginning(arr, predicate) {
    return nearestIndex(arr, predicate, "BEGINNING" /* NearestSearchStart.BEGINNING */);
}
/**
 * Obtains the last item in the array that satisfies the predicate function.
 * So, for example, if the array was arr = [2, 4, 6, 8, 10], and you are looking for
 * the last item arr[i] such that arr[i] < 5 you would be returned 1, because
 * arr[1] is 4, the last item in the array that satisfies the
 * predicate function.
 *
 * Please note: this presupposes that the array is already ordered.
 */
export function nearestIndexFromEnd(arr, predicate) {
    return nearestIndex(arr, predicate, "END" /* NearestSearchStart.END */);
}
/** Type guard for ensuring that `arr` does not contain null or undefined **/
export function arrayDoesNotContainNullOrUndefined(arr) {
    return !arr.includes(null) && !arr.includes(undefined);
}
export function assertArrayIsSorted(arr, compareFn) {
    const comparator = compareFn || DEFAULT_COMPARATOR;
    for (let i = 0; i < arr.length - 1; i++) {
        const current = arr[i];
        const next = arr[i + 1];
        if (comparator(current, next) > 0) {
            throw new Error(`Array is not sorted at index ${i}: ${JSON.stringify(current)} > ${JSON.stringify(next)}`);
        }
    }
}
//# sourceMappingURL=ArrayUtilities.js.map