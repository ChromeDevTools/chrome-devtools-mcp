import * as Fs from 'node:fs';
import * as Url from 'node:url';
import * as WorkerThreads from 'node:worker_threads';

// Copyright 2020 The Chromium Authors
function swap(array, i1, i2) {
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
function sortRange(array, comparator, leftBound, rightBound, sortWindowLeft, sortWindowRight) {
    if (leftBound === 0 && rightBound === (array.length - 1) && sortWindowLeft === 0 && sortWindowRight >= rightBound) {
        array.sort(comparator);
    }
    else {
        quickSortRange(array, comparator, leftBound, rightBound, sortWindowLeft, sortWindowRight);
    }
    return array;
}
const DEFAULT_COMPARATOR = (a, b) => {
    return a < b ? -1 : (a > b ? 1 : 0);
};
function lowerBound(array, needle, comparator, left, right) {
    let l = 0;
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
function arrayDoesNotContainNullOrUndefined(arr) {
    return !arr.includes(null) && !arr.includes(undefined);
}

// Copyright 2021 The Chromium Authors
const EmptyUrlString = '';

// Copyright 2025 The Chromium Authors
class WebWorkerScope {
    postMessage(message, transfer) {
        self.postMessage(message, transfer);
    }
    set onmessage(listener) {
        self.addEventListener('message', listener);
    }
}
class WebWorker {
    #workerPromise;
    #disposed;
    #rejectWorkerPromise;
    constructor(workerLocation) {
        this.#workerPromise = new Promise((fulfill, reject) => {
            this.#rejectWorkerPromise = reject;
            const worker = new Worker(new URL(workerLocation), { type: 'module' });
            worker.onerror = event => {
                console.error(`Failed to load worker for ${workerLocation}:`, event);
            };
            worker.onmessage = (event) => {
                console.assert(event.data === 'workerReady');
                worker.onmessage = null;
                fulfill(worker);
            };
        });
    }
    postMessage(message, transfer) {
        void this.#workerPromise.then(worker => {
            if (!this.#disposed) {
                worker.postMessage(message, transfer ?? []);
            }
        });
    }
    dispose() {
        this.#disposed = true;
        void this.#workerPromise.then(worker => worker.terminate());
    }
    terminate(immediately = false) {
        if (immediately) {
            this.#rejectWorkerPromise?.(new Error('Worker terminated'));
        }
        this.dispose();
    }
    set onmessage(listener) {
        void this.#workerPromise.then(worker => {
            worker.onmessage = listener;
        });
    }
    set onerror(listener) {
        void this.#workerPromise.then(worker => {
            worker.onerror = listener;
        });
    }
}
let lastScreenshotBlobUrl = null;
function revokeLastScreenshotUrl() {
    if (lastScreenshotBlobUrl) {
        URL.revokeObjectURL(lastScreenshotBlobUrl);
        lastScreenshotBlobUrl = null;
    }
}
async function saveScreenshot(options) {
    const pageImage = new Image();
    await new Promise((resolve, reject) => {
        pageImage.onload = () => resolve();
        pageImage.onerror = () => reject(new Error('Failed to load image for screenshot'));
        pageImage.src = 'data:image/png;base64,' + options.base64Png;
    });
    let canvas;
    if (options.clip) {
        const scale = pageImage.naturalWidth / options.clip.screenRectWidth;
        const screenRectWidth = options.clip.screenRectWidth * scale;
        const screenRectHeight = options.clip.screenRectHeight * scale;
        const contentLeft = options.clip.visiblePageRectLeft * scale;
        const contentTop = options.clip.visiblePageRectTop * scale;
        canvas = new OffscreenCanvas(Math.round(screenRectWidth),
        Math.min(1 << 14, Math.round(screenRectHeight)));
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
            throw new Error('Could not get 2d context from canvas.');
        }
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(pageImage, Math.round(contentLeft), Math.round(contentTop));
    }
    else {
        canvas = new OffscreenCanvas(pageImage.naturalWidth, Math.min(1 << 14, Math.floor(pageImage.naturalHeight)));
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
            throw new Error('Could not get 2d context for base64 screenshot.');
        }
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(pageImage, 0, 0);
    }
    revokeLastScreenshotUrl();
    const link = document.createElement('a');
    link.download = options.fileName + '.png';
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const blobUrl = URL.createObjectURL(blob);
    lastScreenshotBlobUrl = blobUrl;
    link.href = blobUrl;
    link.click();
}
let cssEvaluationElement = null;
const HOST_RUNTIME$2 = {
    createWorker(url) {
        return new WebWorker(url);
    },
    workerScope: new WebWorkerScope(),
    getOnLine() {
        return navigator.onLine;
    },
    getUserAgent() {
        return navigator.userAgent;
    },
    getLocalStorage() {
        return 'localStorage' in globalThis ? globalThis.localStorage : undefined;
    },
    getCacheStorage() {
        return 'caches' in globalThis ? globalThis.caches : undefined;
    },
    getDevicePixelRatio() {
        return window.devicePixelRatio;
    },
    saveScreenshot,
    revokeLastScreenshotUrl,
    async loadTextFile(url) {
        const response = await fetch(url);
        return await response.text();
    },
    evaluateCSS(dataValue, customExpr) {
        if (!cssEvaluationElement || !cssEvaluationElement.isConnected) {
            cssEvaluationElement = document.getElementById('css-evaluation-element');
            if (!cssEvaluationElement) {
                cssEvaluationElement = document.createElement('div');
                cssEvaluationElement.id = 'css-evaluation-element';
                cssEvaluationElement.setAttribute('style', 'hidden: true; --evaluation: attr(data-custom-expr type(*))');
                document.body.appendChild(cssEvaluationElement);
            }
        }
        if (dataValue !== null) {
            cssEvaluationElement.setAttribute('data-value', dataValue);
        }
        else {
            cssEvaluationElement.removeAttribute('data-value');
        }
        cssEvaluationElement.setAttribute('data-custom-expr', customExpr);
        return cssEvaluationElement.computedStyleMap().get('--evaluation')?.toString() ?? null;
    },
    removeCSSEvaluationElement() {
        const element = cssEvaluationElement ?? document.getElementById('css-evaluation-element');
        if (element) {
            element.remove();
        }
        cssEvaluationElement = null;
    },
};

var HostRuntime$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    HOST_RUNTIME: HOST_RUNTIME$2
});

// Copyright 2025 The Chromium Authors

var browser = /*#__PURE__*/Object.freeze({
    __proto__: null,
    HostRuntime: HostRuntime$1
});

// Copyright 2025 The Chromium Authors
class NodeWorkerScope {
    postMessage(message, transfer) {
        WorkerThreads.parentPort?.postMessage(message, transfer);
    }
    set onmessage(listener) {
        WorkerThreads.parentPort?.addEventListener('message', msg => {
            listener(msg);
        });
    }
}
class NodeWorker {
    #worker;
    #workerPromise;
    #disposed = false;
    #rejectWorkerPromise;
    constructor(url) {
        const worker = new WorkerThreads.Worker(new URL(url));
        this.#worker = worker;
        this.#workerPromise = new Promise((resolve, reject) => {
            this.#rejectWorkerPromise = reject;
            worker.once('message', (message) => {
                if (message === 'workerReady') {
                    resolve(worker);
                }
            });
            worker.on('error', reject);
        });
        this.#workerPromise.catch(() => { });
    }
    postMessage(message, transfer) {
        void this.#workerPromise.then(worker => {
            if (!this.#disposed) {
                worker.postMessage(message, transfer);
            }
        });
    }
    dispose() {
        this.#disposed = true;
        void this.#worker.terminate();
    }
    terminate(immediately) {
        if (immediately) {
            this.#rejectWorkerPromise?.(new Error('Worker terminated'));
        }
        this.dispose();
    }
    set onmessage(listener) {
        void this.#workerPromise.then(worker => {
            worker.on('message', (data) => {
                if (!this.#disposed) {
                    listener({ data, ports: [] });
                }
            });
        });
    }
    set onerror(listener) {
        void this.#workerPromise.then(worker => {
            worker.on('error', (error) => {
                if (!this.#disposed) {
                    listener({ type: 'error', ...error });
                }
            });
        });
    }
}
class NodeCacheEntry {
    #entries = new Map();
    async put(url, response) {
        this.#entries.set(url, response.clone());
    }
    async match(url) {
        return this.#entries.get(url)?.clone();
    }
}
class NodeCacheStorage {
    #caches = new Map();
    async open(name) {
        let cache = this.#caches.get(name);
        if (!cache) {
            cache = new NodeCacheEntry();
            this.#caches.set(name, cache);
        }
        return cache;
    }
    async delete(name) {
        return this.#caches.delete(name);
    }
}
const nodeCacheStorage = new NodeCacheStorage();
const HOST_RUNTIME$1 = {
    createWorker(url) {
        return new NodeWorker(url);
    },
    workerScope: new NodeWorkerScope(),
    getOnLine() {
        return true;
    },
    getUserAgent() {
        return 'Node.js';
    },
    getLocalStorage() {
        return undefined;
    },
    getCacheStorage() {
        return nodeCacheStorage;
    },
    getDevicePixelRatio() {
        return 1;
    },
    async saveScreenshot(_options) { },
    revokeLastScreenshotUrl() { },
    async loadTextFile(url) {
        return await Fs.promises.readFile(Url.fileURLToPath(url), 'utf-8');
    },
    evaluateCSS(_dataValue, _customExpr) {
        return null;
    },
    removeCSSEvaluationElement() { },
};

var HostRuntime = /*#__PURE__*/Object.freeze({
    __proto__: null,
    HOST_RUNTIME: HOST_RUNTIME$1
});

// Copyright 2025 The Chromium Authors

var node = /*#__PURE__*/Object.freeze({
    __proto__: null,
    HostRuntime: HostRuntime
});

// Copyright 2025 The Chromium Authors
const IS_NODE = typeof process !== 'undefined' && process.versions?.node !== null;
const IS_BROWSER =
typeof window !== 'undefined' || (typeof self !== 'undefined' && typeof self.postMessage === 'function');
const HOST_RUNTIME = await (async () => {
    if (IS_BROWSER) {
        return (await Promise.resolve().then(function () { return browser; })).HostRuntime.HOST_RUNTIME;
    }
    if (IS_NODE) {
        return (await Promise.resolve().then(function () { return node; })).HostRuntime.HOST_RUNTIME;
    }
    throw new Error('Unknown runtime!');
})();

// Copyright 2020 The Chromium Authors
class Multimap {
    map = new Map();
    set(key, value) {
        let set = this.map.get(key);
        if (!set) {
            set = new Set();
            this.map.set(key, set);
        }
        set.add(value);
    }
    get(key) {
        return this.map.get(key) || new Set();
    }
    has(key) {
        return this.map.has(key);
    }
    hasValue(key, value) {
        const set = this.map.get(key);
        if (!set) {
            return false;
        }
        return set.has(value);
    }
    get size() {
        return this.map.size;
    }
    delete(key, value) {
        const values = this.get(key);
        if (!values) {
            return false;
        }
        const result = values.delete(value);
        if (!values.size) {
            this.map.delete(key);
        }
        return result;
    }
    deleteAll(key) {
        this.map.delete(key);
    }
    keysArray() {
        return [...this.map.keys()];
    }
    keys() {
        return this.map.keys();
    }
    valuesArray() {
        const result = [];
        for (const set of this.map.values()) {
            result.push(...set.values());
        }
        return result;
    }
    clear() {
        this.map.clear();
    }
}

// Copyright 2020 The Chromium Authors
const sprintf = (fmt, ...args) => {
    let argIndex = 0;
    const RE = /%(?:(\d+)\$)?(?:\.(\d*))?([%dfs])/g;
    return fmt.replaceAll(RE, (_, index, precision, specifier) => {
        if (specifier === '%') {
            return '%';
        }
        if (index !== undefined) {
            argIndex = parseInt(index, 10) - 1;
            if (argIndex < 0) {
                throw new RangeError(`Invalid parameter index ${argIndex + 1}`);
            }
        }
        if (argIndex >= args.length) {
            throw new RangeError(`Expected at least ${argIndex + 1} format parameters, but only ${args.length} where given.`);
        }
        if (specifier === 's') {
            const argValue = String(args[argIndex++]);
            if (precision !== undefined) {
                return argValue.substring(0, Number(precision));
            }
            return argValue;
        }
        let argValue = Number(args[argIndex++]);
        if (isNaN(argValue)) {
            argValue = 0;
        }
        if (specifier === 'd') {
            return String(Math.floor(argValue)).padStart(Number(precision), '0');
        }
        if (precision !== undefined) {
            return argValue.toFixed(Number(precision));
        }
        return String(argValue);
    });
};
const SPECIAL_REGEX_CHARACTERS = '^[]{}()\\.^$*+?|-,';
const regexSpecialCharacters = function () {
    return SPECIAL_REGEX_CHARACTERS;
};
const trimEndWithMaxLength = (str, maxLength) => {
    if (str.length <= maxLength) {
        return str;
    }
    const ellipsis = '…';
    const ellipsisLength = 1;
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    const iterator = segmenter.segment(str)[Symbol.iterator]();
    let lastSegmentIndex = 0;
    for (let i = 0; i <= maxLength - ellipsisLength; i++) {
        const result = iterator.next();
        if (result.done) {
            return str;
        }
        lastSegmentIndex = result.value.index;
    }
    for (let i = 0; i < ellipsisLength; i++) {
        if (iterator.next().done) {
            return str;
        }
    }
    return str.slice(0, lastSegmentIndex) + ellipsis;
};
const createPlainTextSearchRegex = function (query, flags) {
    let regex = '';
    for (let i = 0; i < query.length; ++i) {
        const c = query.charAt(i);
        if (regexSpecialCharacters().indexOf(c) !== -1) {
            regex += '\\';
        }
        regex += c;
    }
    return new RegExp(regex, flags);
};
const stringifyWithPrecision = function stringifyWithPrecision(s, precision = 2) {
    if (precision === 0) {
        return s.toFixed(0);
    }
    const string = s.toFixed(precision).replace(/\.?0*$/, '');
    return string === '-0' ? '0' : string;
};

// Copyright 2024 The Chromium Authors
function createExpandableBigUint32Array() {
    return new ExpandableBigUint32ArrayImpl();
}
function createFixedBigUint32Array(length, maxLengthForTesting) {
    try {
        if (maxLengthForTesting !== undefined && length > maxLengthForTesting) ;
        return new BasicBigUint32ArrayImpl(length);
    }
    catch {
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
                    throw new RangeError();
                }
                for (let i = 0; i < partCount; ++i) {
                    this.#data[i] = new Uint32Array(this.#partLength);
                }
                return;
            }
            catch (e) {
                if (this.#partLength < 1e6) {
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
        return this.#data[0][-1];
    }
    setValue(index, value) {
        if (index >= 0 && index < this.length) {
            const partLength = this.#partLength;
            this.#data[Math.floor(index / partLength)][index % partLength] = value;
        }
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
function createBitVector(lengthOrBuffer) {
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
        while (index !== ((index >> 3) << 3)) {
            --index;
            if (this.getBit(index)) {
                return index;
            }
        }
        let byteIndex = (index >> 3) - 1;
        while (byteIndex >= 0 && this[byteIndex] === 0) {
            --byteIndex;
        }
        if (byteIndex < 0) {
            return -1;
        }
        for (index = (byteIndex << 3) + 7; index >= (byteIndex << 3); --index) {
            if (this.getBit(index)) {
                return index;
            }
        }
        throw new Error('Unreachable');
    }
}

// Copyright 2019 The Chromium Authors

var ChildrenProvider = /*#__PURE__*/Object.freeze({
    __proto__: null
});

// Copyright 2014 The Chromium Authors
const HeapSnapshotProgressEvent = {
    Update: 'ProgressUpdate',
    BrokenSnapshot: 'BrokenSnapshot',
};
const baseSystemDistance = 100000000;
const baseUnreachableDistance = baseSystemDistance * 2;
class AllocationNodeCallers {
    nodesWithSingleCaller;
    branchingCallers;
    constructor(nodesWithSingleCaller, branchingCallers) {
        this.nodesWithSingleCaller = nodesWithSingleCaller;
        this.branchingCallers = branchingCallers;
    }
}
class SerializedAllocationNode {
    id;
    name;
    scriptName;
    scriptId;
    line;
    column;
    count;
    size;
    liveCount;
    liveSize;
    hasChildren;
    constructor(nodeId, functionName, scriptName, scriptId, line, column, count, size, liveCount, liveSize, hasChildren) {
        this.id = nodeId;
        this.name = functionName;
        this.scriptName = scriptName;
        this.scriptId = scriptId;
        this.line = line;
        this.column = column;
        this.count = count;
        this.size = size;
        this.liveCount = liveCount;
        this.liveSize = liveSize;
        this.hasChildren = hasChildren;
    }
}
class AllocationStackFrame {
    functionName;
    scriptName;
    scriptId;
    line;
    column;
    constructor(functionName, scriptName, scriptId, line, column) {
        this.functionName = functionName;
        this.scriptName = scriptName;
        this.scriptId = scriptId;
        this.line = line;
        this.column = column;
    }
}
class Node {
    id;
    name;
    distance;
    nodeIndex;
    retainedSize;
    selfSize;
    type;
    canBeQueried = false;
    detachedDOMTreeNode = false;
    isAddedNotRemoved = null;
    ignored = false;
    constructor(id, name, distance, nodeIndex, retainedSize, selfSize, type) {
        this.id = id;
        this.name = name;
        this.distance = distance;
        this.nodeIndex = nodeIndex;
        this.retainedSize = retainedSize;
        this.selfSize = selfSize;
        this.type = type;
    }
}
class Edge {
    name;
    node;
    type;
    edgeIndex;
    isAddedNotRemoved = null;
    constructor(name, node, type, edgeIndex) {
        this.name = name;
        this.node = node;
        this.type = type;
        this.edgeIndex = edgeIndex;
    }
}
class AggregateForDiff {
    name;
    indexes;
    ids;
    selfSizes;
    constructor() {
        this.name = '';
        this.indexes = [];
        this.ids = [];
        this.selfSizes = [];
    }
}
class Diff {
    name;
    addedCount = 0;
    removedCount = 0;
    addedSize = 0;
    removedSize = 0;
    countDelta;
    sizeDelta;
    addedIndexes = [];
    addedIds = [];
    addedSelfSizes = [];
    deletedIndexes = [];
    deletedIds = [];
    deletedSelfSizes = [];
    constructor(name) {
        this.name = name;
    }
}
class ComparatorConfig {
    fieldName1;
    ascending1;
    fieldName2;
    ascending2;
    constructor(fieldName1, ascending1, fieldName2, ascending2) {
        this.fieldName1 = fieldName1;
        this.ascending1 = ascending1;
        this.fieldName2 = fieldName2;
        this.ascending2 = ascending2;
    }
}
class ItemsRange {
    startPosition;
    endPosition;
    totalLength;
    items;
    constructor(startPosition, endPosition, totalLength, items) {
        this.startPosition = startPosition;
        this.endPosition = endPosition;
        this.totalLength = totalLength;
        this.items = items;
    }
}
class StaticData {
    nodeCount;
    rootNodeIndex;
    totalSize;
    maxJSObjectId;
    constructor(nodeCount, rootNodeIndex, totalSize, maxJSObjectId) {
        this.nodeCount = nodeCount;
        this.rootNodeIndex = rootNodeIndex;
        this.totalSize = totalSize;
        this.maxJSObjectId = maxJSObjectId;
    }
}
class NodeFilter {
    minNodeId;
    maxNodeId;
    allocationNodeId;
    filterName;
    constructor(minNodeId, maxNodeId) {
        this.minNodeId = minNodeId;
        this.maxNodeId = maxNodeId;
    }
    equals(o) {
        return this.minNodeId === o.minNodeId && this.maxNodeId === o.maxNodeId &&
            this.allocationNodeId === o.allocationNodeId && this.filterName === o.filterName;
    }
}
class SearchConfig {
    query;
    caseSensitive;
    wholeWord;
    isRegex;
    shouldJump;
    jumpBackward;
    constructor(query, caseSensitive, wholeWord, isRegex, shouldJump, jumpBackward) {
        this.query = query;
        this.caseSensitive = caseSensitive;
        this.wholeWord = wholeWord;
        this.isRegex = isRegex;
        this.shouldJump = shouldJump;
        this.jumpBackward = jumpBackward;
    }
    toSearchRegex(_global) {
        throw new Error('Unsupported operation on search config');
    }
}
class Samples {
    timestamps;
    lastAssignedIds;
    sizes;
    constructor(timestamps, lastAssignedIds, sizes) {
        this.timestamps = timestamps;
        this.lastAssignedIds = lastAssignedIds;
        this.sizes = sizes;
    }
}
class Location {
    scriptId;
    lineNumber;
    columnNumber;
    constructor(scriptId, lineNumber, columnNumber) {
        this.scriptId = scriptId;
        this.lineNumber = lineNumber;
        this.columnNumber = columnNumber;
    }
}

var HeapSnapshotModel$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    AggregateForDiff: AggregateForDiff,
    AllocationNodeCallers: AllocationNodeCallers,
    AllocationStackFrame: AllocationStackFrame,
    ComparatorConfig: ComparatorConfig,
    Diff: Diff,
    Edge: Edge,
    HeapSnapshotProgressEvent: HeapSnapshotProgressEvent,
    ItemsRange: ItemsRange,
    Location: Location,
    Node: Node,
    NodeFilter: NodeFilter,
    Samples: Samples,
    SearchConfig: SearchConfig,
    SerializedAllocationNode: SerializedAllocationNode,
    StaticData: StaticData,
    baseSystemDistance: baseSystemDistance,
    baseUnreachableDistance: baseUnreachableDistance
});

// Copyright 2020 The Chromium Authors
const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_CODES = new Uint8Array(123);
for (let index = 0; index < BASE64_CHARS.length; ++index) {
    BASE64_CODES[BASE64_CHARS.charCodeAt(index)] = index;
}

// Copyright 2022 The Chromium Authors
const D50_X = 0.9642;
const D50_Y = 1.0;
const D50_Z = 0.8251;
class Vector3 {
    values = [0, 0, 0];
    constructor(values) {
        if (values) {
            this.values = values;
        }
    }
}
class Matrix3x3 {
    values = [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
    ];
    constructor(values) {
        if (values) {
            this.values = values;
        }
    }
    multiply(other) {
        const dst = new Vector3();
        for (let row = 0; row < 3; ++row) {
            dst.values[row] = this.values[row][0] * other.values[0] + this.values[row][1] * other.values[1] +
                this.values[row][2] * other.values[2];
        }
        return dst;
    }
}
class TransferFunction {
    g;
    a;
    b;
    c;
    d;
    e;
    f;
    constructor(g, a, b = 0, c = 0, d = 0, e = 0, f = 0) {
        this.g = g;
        this.a = a;
        this.b = b;
        this.c = c;
        this.d = d;
        this.e = e;
        this.f = f;
    }
    eval(val) {
        const sign = val < 0 ? -1 : 1.0;
        const abs = val * sign;
        if (abs < this.d) {
            return sign * (this.c * abs + this.f);
        }
        return sign * (Math.pow(this.a * abs + this.b, this.g) + this.e);
    }
}
const NAMED_TRANSFER_FN = {
    sRGB: new TransferFunction(2.4, (1 / 1.055), (0.055 / 1.055), (1 / 12.92), 0.04045, 0.0, 0.0),
    sRGB_INVERSE: new TransferFunction(0.416667, 1.13728, -0, 12.92, 0.0031308, -0.0549698, -0),
    proPhotoRGB: new TransferFunction(1.8, 1),
    proPhotoRGB_INVERSE: new TransferFunction(0.555556, 1, -0, 0, 0, 0, 0),
    k2Dot2: new TransferFunction(2.2, 1.0),
    k2Dot2_INVERSE: new TransferFunction(0.454545, 1),
    rec2020: new TransferFunction(2.22222, 0.909672, 0.0903276, 0.222222, 0.0812429, 0, 0),
    rec2020_INVERSE: new TransferFunction(0.45, 1.23439, -0, 4.5, 0.018054, -0.0993195, -0),
};
const NAMED_GAMUTS = {
    sRGB: new Matrix3x3([
        [0.436065674, 0.385147095, 0.143066406],
        [0.222488403, 0.716873169, 0.060607910],
        [0.013916016, 0.097076416, 0.714096069],
    ]),
    sRGB_INVERSE: new Matrix3x3([
        [3.134112151374599, -1.6173924597114966, -0.4906334036481285],
        [-0.9787872938826594, 1.9162795854799963, 0.0334547139520088],
        [0.07198304248352326, -0.2289858493321844, 1.4053851325241447],
    ]),
    displayP3: new Matrix3x3([
        [0.515102, 0.291965, 0.157153],
        [0.241182, 0.692236, 0.0665819],
        [-104941e-8, 0.0418818, 0.784378],
    ]),
    displayP3_INVERSE: new Matrix3x3([
        [2.404045155982687, -0.9898986932663839, -0.3976317191366333],
        [-0.8422283799266768, 1.7988505115115485, 0.016048170293157416],
        [0.04818705979712955, -0.09737385156228891, 1.2735066448052303],
    ]),
    adobeRGB: new Matrix3x3([
        [0.60974, 0.20528, 0.14919],
        [0.31111, 0.62567, 0.06322],
        [0.01947, 0.06087, 0.74457],
    ]),
    adobeRGB_INVERSE: new Matrix3x3([
        [1.9625385510109137, -0.6106892546501431, -0.3413827467482388],
        [-0.9787580455521, 1.9161624707082339, 0.03341676594241408],
        [0.028696263137883395, -0.1406807819331586, 1.349252109991369],
    ]),
    rec2020: new Matrix3x3([
        [0.673459, 0.165661, 0.125100],
        [0.279033, 0.675338, 0.0456288],
        [-193139e-8, 0.0299794, 0.797162],
    ]),
    rec2020_INVERSE: new Matrix3x3([
        [1.647275201661012, -0.3936024771460771, -0.23598028884792507],
        [-0.6826176165196962, 1.647617775014935, 0.01281626807852422],
        [0.029662725298529837, -0.06291668721366285, 1.2533964313435522],
    ])};
function degToRad(deg) {
    return deg * (Math.PI / 180);
}
function radToDeg(rad) {
    return rad * (180 / Math.PI);
}
function applyTransferFns(fn, r, g, b) {
    return [fn.eval(r), fn.eval(g), fn.eval(b)];
}
const OKLAB_TO_LMS_MATRIX = new Matrix3x3([
    [0.99999999845051981432, 0.39633779217376785678, 0.21580375806075880339],
    [1.0000000088817607767, -0.10556134232365635, -0.06385417477170591],
    [1.0000000546724109177, -0.08948418209496575, -1.2914855378640917],
]);
const LMS_TO_OKLAB_MATRIX = new Matrix3x3([
    [0.2104542553, 0.7936177849999999, -0.0040720468],
    [1.9779984951000003, -2.4285922049999997, 0.4505937099000001],
    [0.025904037099999982, 0.7827717662, -0.8086757660000001],
]);
const XYZ_TO_LMS_MATRIX = new Matrix3x3([
    [0.8190224432164319, 0.3619062562801221, -0.12887378261216414],
    [0.0329836671980271, 0.9292868468965546, 0.03614466816999844],
    [0.048177199566046255, 0.26423952494422764, 0.6335478258136937],
]);
const LMS_TO_XYZ_MATRIX = new Matrix3x3([
    [1.226879873374156, -0.5578149965554814, 0.2813910501772159],
    [-0.040575762624313734, 1.1122868293970596, -0.07171106666151703],
    [-0.07637294974672144, -0.4214933239627915, 1.586924024427242],
]);
const PRO_PHOTO_TO_XYZD50_MATRIX = new Matrix3x3([
    [0.7976700747153241, 0.13519395152800417, 0.03135596341127167],
    [0.28803902352472205, 0.7118744007923554, 0.00008661179538844252],
    [2.739876695467402e-7, -14405226518969991e-22, 0.825211112593861],
]);
const XYZD50_TO_PRO_PHOTO_MATRIX = new Matrix3x3([
    [1.3459533710138858, -0.25561367037652133, -0.051116041522131374],
    [-0.544600415668951, 1.5081687311475767, 0.020535163968720935],
    [-13975622054109725e-22, 0.000002717590904589903, 1.2118111696814942],
]);
const XYZD65_TO_XYZD50_MATRIX = new Matrix3x3([
    [1.0478573189120088, 0.022907374491829943, -0.050162247377152525],
    [0.029570500050499514, 0.9904755577034089, -0.017061518194840468],
    [-0.00924047197558879, 0.015052921526981566, 0.7519708530777581],
]);
const XYZD50_TO_XYZD65_MATRIX = new Matrix3x3([
    [0.9555366447632887, -0.02306009252137888, 0.06321844147263304],
    [-0.028315378228764922, 1.009951351591575, 0.021026001591792402],
    [0.012308773293784308, -0.02050053471777469, 1.3301947294775631],
]);
class ColorConverter {
    static labToXyzd50(l, a, b) {
        let y = (l + 16.0) / 116.0;
        let x = y + a / 500.0;
        let z = y - b / 200.0;
        function labInverseTransferFunction(t) {
            const delta = (24.0 / 116.0);
            if (t <= delta) {
                return (108.0 / 841.0) * (t - (16.0 / 116.0));
            }
            return t * t * t;
        }
        x = labInverseTransferFunction(x) * D50_X;
        y = labInverseTransferFunction(y) * D50_Y;
        z = labInverseTransferFunction(z) * D50_Z;
        return [x, y, z];
    }
    static xyzd50ToLab(x, y, z) {
        function labTransferFunction(t) {
            const deltaLimit = (24.0 / 116.0) * (24.0 / 116.0) * (24.0 / 116.0);
            if (t <= deltaLimit) {
                return (841.0 / 108.0) * t + (16.0 / 116.0);
            }
            return Math.pow(t, 1.0 / 3.0);
        }
        x = labTransferFunction(x / D50_X);
        y = labTransferFunction(y / D50_Y);
        z = labTransferFunction(z / D50_Z);
        const l = 116.0 * y - 16.0;
        const a = 500.0 * (x - y);
        const b = 200.0 * (y - z);
        return [l, a, b];
    }
    static oklabToXyzd65(l, a, b) {
        const labInput = new Vector3([l, a, b]);
        const lmsIntermediate = OKLAB_TO_LMS_MATRIX.multiply(labInput);
        lmsIntermediate.values[0] = lmsIntermediate.values[0] * lmsIntermediate.values[0] * lmsIntermediate.values[0];
        lmsIntermediate.values[1] = lmsIntermediate.values[1] * lmsIntermediate.values[1] * lmsIntermediate.values[1];
        lmsIntermediate.values[2] = lmsIntermediate.values[2] * lmsIntermediate.values[2] * lmsIntermediate.values[2];
        const xyzOutput = LMS_TO_XYZ_MATRIX.multiply(lmsIntermediate);
        return xyzOutput.values;
    }
    static xyzd65ToOklab(x, y, z) {
        const xyzInput = new Vector3([x, y, z]);
        const lmsIntermediate = XYZ_TO_LMS_MATRIX.multiply(xyzInput);
        lmsIntermediate.values[0] = Math.cbrt(lmsIntermediate.values[0]);
        lmsIntermediate.values[1] = Math.cbrt(lmsIntermediate.values[1]);
        lmsIntermediate.values[2] = Math.cbrt(lmsIntermediate.values[2]);
        const labOutput = LMS_TO_OKLAB_MATRIX.multiply(lmsIntermediate);
        return [labOutput.values[0], labOutput.values[1], labOutput.values[2]];
    }
    static lchToLab(l, c, h) {
        if (h === undefined) {
            return [l, 0, 0];
        }
        return [l, c * Math.cos(degToRad(h)), c * Math.sin(degToRad(h))];
    }
    static labToLch(l, a, b) {
        return [l, Math.sqrt(a * a + b * b), radToDeg(Math.atan2(b, a))];
    }
    static displayP3ToXyzd50(r, g, b) {
        const [mappedR, mappedG, mappedB] = applyTransferFns(NAMED_TRANSFER_FN.sRGB, r, g, b);
        const rgbInput = new Vector3([mappedR, mappedG, mappedB]);
        const xyzOutput = NAMED_GAMUTS.displayP3.multiply(rgbInput);
        return xyzOutput.values;
    }
    static xyzd50ToDisplayP3(x, y, z) {
        const xyzInput = new Vector3([x, y, z]);
        const rgbOutput = NAMED_GAMUTS.displayP3_INVERSE.multiply(xyzInput);
        return applyTransferFns(NAMED_TRANSFER_FN.sRGB_INVERSE, rgbOutput.values[0], rgbOutput.values[1], rgbOutput.values[2]);
    }
    static displayP3LinearToXyzd50(r, g, b) {
        const rgbInput = new Vector3([r, g, b]);
        const xyzOutput = NAMED_GAMUTS.displayP3.multiply(rgbInput);
        return xyzOutput.values;
    }
    static xyzd50ToDisplayP3Linear(x, y, z) {
        const xyzInput = new Vector3([x, y, z]);
        const rgbResult = NAMED_GAMUTS.displayP3_INVERSE.multiply(xyzInput);
        return rgbResult.values;
    }
    static proPhotoToXyzd50(r, g, b) {
        const [mappedR, mappedG, mappedB] = applyTransferFns(NAMED_TRANSFER_FN.proPhotoRGB, r, g, b);
        const rgbInput = new Vector3([mappedR, mappedG, mappedB]);
        const xyzOutput = PRO_PHOTO_TO_XYZD50_MATRIX.multiply(rgbInput);
        return xyzOutput.values;
    }
    static xyzd50ToProPhoto(x, y, z) {
        const xyzInput = new Vector3([x, y, z]);
        const rgbOutput = XYZD50_TO_PRO_PHOTO_MATRIX.multiply(xyzInput);
        return applyTransferFns(NAMED_TRANSFER_FN.proPhotoRGB_INVERSE, rgbOutput.values[0], rgbOutput.values[1], rgbOutput.values[2]);
    }
    static adobeRGBToXyzd50(r, g, b) {
        const [mappedR, mappedG, mappedB] = applyTransferFns(NAMED_TRANSFER_FN.k2Dot2, r, g, b);
        const rgbInput = new Vector3([mappedR, mappedG, mappedB]);
        const xyzOutput = NAMED_GAMUTS.adobeRGB.multiply(rgbInput);
        return xyzOutput.values;
    }
    static xyzd50ToAdobeRGB(x, y, z) {
        const xyzInput = new Vector3([x, y, z]);
        const rgbOutput = NAMED_GAMUTS.adobeRGB_INVERSE.multiply(xyzInput);
        return applyTransferFns(NAMED_TRANSFER_FN.k2Dot2_INVERSE, rgbOutput.values[0], rgbOutput.values[1], rgbOutput.values[2]);
    }
    static rec2020ToXyzd50(r, g, b) {
        const [mappedR, mappedG, mappedB] = applyTransferFns(NAMED_TRANSFER_FN.rec2020, r, g, b);
        const rgbInput = new Vector3([mappedR, mappedG, mappedB]);
        const xyzOutput = NAMED_GAMUTS.rec2020.multiply(rgbInput);
        return xyzOutput.values;
    }
    static xyzd50ToRec2020(x, y, z) {
        const xyzInput = new Vector3([x, y, z]);
        const rgbOutput = NAMED_GAMUTS.rec2020_INVERSE.multiply(xyzInput);
        return applyTransferFns(NAMED_TRANSFER_FN.rec2020_INVERSE, rgbOutput.values[0], rgbOutput.values[1], rgbOutput.values[2]);
    }
    static xyzd50ToD65(x, y, z) {
        const xyzInput = new Vector3([x, y, z]);
        const xyzOutput = XYZD50_TO_XYZD65_MATRIX.multiply(xyzInput);
        return xyzOutput.values;
    }
    static xyzd65ToD50(x, y, z) {
        const xyzInput = new Vector3([x, y, z]);
        const xyzOutput = XYZD65_TO_XYZD50_MATRIX.multiply(xyzInput);
        return xyzOutput.values;
    }
    static xyzd50TosRGBLinear(x, y, z) {
        const xyzInput = new Vector3([x, y, z]);
        const rgbResult = NAMED_GAMUTS.sRGB_INVERSE.multiply(xyzInput);
        return rgbResult.values;
    }
    static srgbLinearToXyzd50(r, g, b) {
        const rgbInput = new Vector3([r, g, b]);
        const xyzOutput = NAMED_GAMUTS.sRGB.multiply(rgbInput);
        return xyzOutput.values;
    }
    static srgbToXyzd50(r, g, b) {
        const [mappedR, mappedG, mappedB] = applyTransferFns(NAMED_TRANSFER_FN.sRGB, r, g, b);
        const rgbInput = new Vector3([mappedR, mappedG, mappedB]);
        const xyzOutput = NAMED_GAMUTS.sRGB.multiply(rgbInput);
        return xyzOutput.values;
    }
    static xyzd50ToSrgb(x, y, z) {
        const xyzInput = new Vector3([x, y, z]);
        const rgbOutput = NAMED_GAMUTS.sRGB_INVERSE.multiply(xyzInput);
        return applyTransferFns(NAMED_TRANSFER_FN.sRGB_INVERSE, rgbOutput.values[0], rgbOutput.values[1], rgbOutput.values[2]);
    }
    static oklchToXyzd50(lInput, c, h) {
        const [l, a, b] = ColorConverter.lchToLab(lInput, c, h);
        const [x65, y65, z65] = ColorConverter.oklabToXyzd65(l, a, b);
        return ColorConverter.xyzd65ToD50(x65, y65, z65);
    }
    static xyzd50ToOklch(x, y, z) {
        const [x65, y65, z65] = ColorConverter.xyzd50ToD65(x, y, z);
        const [l, a, b] = ColorConverter.xyzd65ToOklab(x65, y65, z65);
        return ColorConverter.labToLch(l, a, b);
    }
}

// Copyright 2020 The Chromium Authors
function blendColors(fgRGBA, bgRGBA) {
    const alpha = fgRGBA[3];
    return [
        ((1 - alpha) * bgRGBA[0]) + (alpha * fgRGBA[0]),
        ((1 - alpha) * bgRGBA[1]) + (alpha * fgRGBA[1]),
        ((1 - alpha) * bgRGBA[2]) + (alpha * fgRGBA[2]),
        alpha + (bgRGBA[3] * (1 - alpha)),
    ];
}
function rgbToHue([r, g, b]) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const diff = max - min;
    let h;
    if (min === max) {
        h = 0;
    }
    else if (r === max) {
        h = ((1 / 6 * (g - b) / diff) + 1) % 1;
    }
    else if (g === max) {
        h = (1 / 6 * (b - r) / diff) + 1 / 3;
    }
    else {
        h = (1 / 6 * (r - g) / diff) + 2 / 3;
    }
    return h;
}
function rgbToHsl(rgb) {
    const [h, s, l] = rgbaToHsla([...rgb, undefined]);
    return [h, s, l];
}
function rgbaToHsla([r, g, b, a]) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const diff = max - min;
    const sum = max + min;
    const h = rgbToHue([r, g, b]);
    const l = 0.5 * sum;
    let s;
    if (l === 0) {
        s = 0;
    }
    else if (l === 1) {
        s = 0;
    }
    else if (l <= 0.5) {
        s = diff / sum;
    }
    else {
        s = diff / (2 - sum);
    }
    return [h, s, l, a];
}
function rgbToHwb(rgb) {
    const [h, w, b] = rgbaToHwba([...rgb, undefined]);
    return [h, w, b];
}
function rgbaToHwba([r, g, b, a]) {
    const h = rgbToHue([r, g, b]);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return [h, min, 1 - max, a];
}

// Copyright 2021 The Chromium Authors
/*
 * Copyright (C) 2009 Apple Inc.  All rights reserved.
 * Copyright (C) 2009 Joseph Pecoraro
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * 1.  Redistributions of source code must retain the above copyright
 *     notice, this list of conditions and the following disclaimer.
 * 2.  Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 * 3.  Neither the name of Apple Computer, Inc. ("Apple") nor the names of
 *     its contributors may be used to endorse or promote products derived
 *     from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE AND ITS CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL APPLE OR ITS CONTRIBUTORS BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
function normalizeHue(hue) {
    return ((hue % 360) + 360) % 360;
}
function parseAngle(angleText) {
    const angle = angleText.replace(/(deg|g?rad|turn)$/, '');
    if (isNaN(angle) || angleText.match(/\s+(deg|g?rad|turn)/)) {
        return null;
    }
    const number = parseFloat(angle);
    if (angleText.includes('turn')) {
        return number * 360;
    }
    if (angleText.includes('grad')) {
        return number * 9 / 10;
    }
    if (angleText.includes('rad')) {
        return number * 180 / Math.PI;
    }
    return number;
}
function getColorSpace(colorSpaceText) {
    switch (colorSpaceText) {
        case "srgb" :
            return "srgb" ;
        case "srgb-linear" :
            return "srgb-linear" ;
        case "display-p3" :
            return "display-p3" ;
        case "display-p3-linear" :
            return "display-p3-linear" ;
        case "a98-rgb" :
            return "a98-rgb" ;
        case "prophoto-rgb" :
            return "prophoto-rgb" ;
        case "rec2020" :
            return "rec2020" ;
        case "xyz" :
            return "xyz" ;
        case "xyz-d50" :
            return "xyz-d50" ;
        case "xyz-d65" :
            return "xyz-d65" ;
    }
    return null;
}
function mapPercentToRange(percent, range) {
    const sign = Math.sign(percent);
    const absPercent = Math.abs(percent);
    const [outMin, outMax] = range;
    return sign * (absPercent * (outMax - outMin) / 100 + outMin);
}
function clamp(value, { min, max }) {
    if (value === null) {
        return value;
    }
    {
        value = Math.max(value, min);
    }
    if (max !== undefined) {
        value = Math.min(value, max);
    }
    return value;
}
function parsePercentage(value, range) {
    if (!value.endsWith('%')) {
        return null;
    }
    const percentage = parseFloat(value.substr(0, value.length - 1));
    return isNaN(percentage) ? null : mapPercentToRange(percentage, range);
}
function parseNumber(value) {
    const number = parseFloat(value);
    return isNaN(number) ? null : number;
}
function parseAlpha(value) {
    if (value === undefined) {
        return null;
    }
    return clamp(parsePercentage(value, [0, 1]) ?? parseNumber(value), { min: 0, max: 1 });
}
function parsePercentOrNumber(value, range = [0, 1]) {
    if (isNaN(value.replace('%', ''))) {
        return null;
    }
    const parsed = parseFloat(value);
    if (value.indexOf('%') !== -1) {
        if (value.indexOf('%') !== value.length - 1) {
            return null;
        }
        return mapPercentToRange(parsed, range);
    }
    return parsed;
}
function parseRgbNumeric(value) {
    const parsed = parsePercentOrNumber(value);
    if (parsed === null) {
        return null;
    }
    if (value.indexOf('%') !== -1) {
        return parsed;
    }
    return parsed / 255;
}
function parseHueNumeric(value) {
    const angle = value.replace(/(deg|g?rad|turn)$/, '');
    if (isNaN(angle) || value.match(/\s+(deg|g?rad|turn)/)) {
        return null;
    }
    const number = parseFloat(angle);
    if (value.indexOf('turn') !== -1) {
        return number % 1;
    }
    if (value.indexOf('grad') !== -1) {
        return (number / 400) % 1;
    }
    if (value.indexOf('rad') !== -1) {
        return (number / (2 * Math.PI)) % 1;
    }
    return (number / 360) % 1;
}
function parseSatLightNumeric(value) {
    if (value.indexOf('%') !== value.length - 1 || isNaN(value.replace('%', ''))) {
        return null;
    }
    const parsed = parseFloat(value);
    return parsed / 100;
}
function parseAlphaNumeric(value) {
    return parsePercentOrNumber(value);
}
function hsva2hsla(hsva) {
    const h = hsva[0];
    let s = hsva[1];
    const v = hsva[2];
    const t = (2 - s) * v;
    if (v === 0 || s === 0) {
        s = 0;
    }
    else {
        s *= v / (t < 1 ? t : 2 - t);
    }
    return [h, s, t / 2, hsva[3]];
}
function hsl2rgb(hsl) {
    const h = hsl[0];
    let s = hsl[1];
    const l = hsl[2];
    function hue2rgb(p, q, h) {
        if (h < 0) {
            h += 1;
        }
        else if (h > 1) {
            h -= 1;
        }
        if ((h * 6) < 1) {
            return p + (q - p) * h * 6;
        }
        if ((h * 2) < 1) {
            return q;
        }
        if ((h * 3) < 2) {
            return p + (q - p) * ((2 / 3) - h) * 6;
        }
        return p;
    }
    if (s < 0) {
        s = 0;
    }
    let q;
    if (l <= 0.5) {
        q = l * (1 + s);
    }
    else {
        q = l + s - (l * s);
    }
    const p = 2 * l - q;
    const tr = h + (1 / 3);
    const tg = h;
    const tb = h - (1 / 3);
    return [hue2rgb(p, q, tr), hue2rgb(p, q, tg), hue2rgb(p, q, tb), hsl[3]];
}
function hwb2rgb(hwb) {
    const h = hwb[0];
    const w = hwb[1];
    const b = hwb[2];
    const whiteRatio = w / (w + b);
    let result = [whiteRatio, whiteRatio, whiteRatio, hwb[3]];
    if (w + b < 1) {
        result = hsl2rgb([h, 1, 0.5, hwb[3]]);
        for (let i = 0; i < 3; ++i) {
            result[i] += w - (w + b) * result[i];
        }
    }
    return result;
}
function hsva2rgba(hsva) {
    return hsl2rgb(hsva2hsla(hsva));
}
const EPSILON = 0.01;
const WIDE_RANGE_EPSILON = 1;
const STRICT_EPSILON = 1e-4;
function equals(a, b, accuracy = EPSILON) {
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) {
            return false;
        }
        for (const i in a) {
            if (!equals(a[i], b[i])) {
                return false;
            }
        }
        return true;
    }
    if (Array.isArray(a) || Array.isArray(b)) {
        return false;
    }
    if (a === null || b === null) {
        return a === b;
    }
    return Math.abs(a - b) < accuracy;
}
function lessOrEquals(a, b, accuracy = EPSILON) {
    return a - b <= accuracy;
}
class Lab {
    l;
    a;
    b;
    alpha;
    #authoredText;
    #rawParams;
    channels = ["l" , "a" , "b" , "alpha" ];
    static #conversions = {
        ["hex" ]: (self) => new Legacy(self.#getRGBArray( false), "hex" ),
        ["hexa" ]: (self) => new Legacy(self.#getRGBArray( true), "hexa" ),
        ["rgb" ]: (self) => new Legacy(self.#getRGBArray( false), "rgb" ),
        ["rgba" ]: (self) => new Legacy(self.#getRGBArray( true), "rgba" ),
        ["hsl" ]: (self) => new HSL(...rgbToHsl(self.#getRGBArray( false)), self.alpha),
        ["hsla" ]: (self) => new HSL(...rgbToHsl(self.#getRGBArray( false)), self.alpha),
        ["hwb" ]: (self) => new HWB(...rgbToHwb(self.#getRGBArray( false)), self.alpha),
        ["hwba" ]: (self) => new HWB(...rgbToHwb(self.#getRGBArray( false)), self.alpha),
        ["lch" ]: (self) => new LCH(...ColorConverter.labToLch(self.l, self.a, self.b), self.alpha),
        ["oklch" ]: (self) => new Oklch(...ColorConverter.xyzd50ToOklch(...self.#toXyzd50()), self.alpha),
        ["lab" ]: (self) => self,
        ["oklab" ]: (self) => new Oklab(...ColorConverter.xyzd65ToOklab(...ColorConverter.xyzd50ToD65(...self.#toXyzd50())), self.alpha),
        ["srgb" ]: (self) => new ColorFunction("srgb" , ...ColorConverter.xyzd50ToSrgb(...self.#toXyzd50()), self.alpha),
        ["srgb-linear" ]: (self) => new ColorFunction("srgb-linear" , ...ColorConverter.xyzd50TosRGBLinear(...self.#toXyzd50()), self.alpha),
        ["display-p3" ]: (self) => new ColorFunction("display-p3" , ...ColorConverter.xyzd50ToDisplayP3(...self.#toXyzd50()), self.alpha),
        ["display-p3-linear" ]: (self) => new ColorFunction("display-p3-linear" , ...ColorConverter.xyzd50ToDisplayP3Linear(...self.#toXyzd50()), self.alpha),
        ["a98-rgb" ]: (self) => new ColorFunction("a98-rgb" , ...ColorConverter.xyzd50ToAdobeRGB(...self.#toXyzd50()), self.alpha),
        ["prophoto-rgb" ]: (self) => new ColorFunction("prophoto-rgb" , ...ColorConverter.xyzd50ToProPhoto(...self.#toXyzd50()), self.alpha),
        ["rec2020" ]: (self) => new ColorFunction("rec2020" , ...ColorConverter.xyzd50ToRec2020(...self.#toXyzd50()), self.alpha),
        ["xyz" ]: (self) => new ColorFunction("xyz" , ...ColorConverter.xyzd50ToD65(...self.#toXyzd50()), self.alpha),
        ["xyz-d50" ]: (self) => new ColorFunction("xyz-d50" , ...self.#toXyzd50(), self.alpha),
        ["xyz-d65" ]: (self) => new ColorFunction("xyz-d65" , ...ColorConverter.xyzd50ToD65(...self.#toXyzd50()), self.alpha),
    };
    #toXyzd50() {
        return ColorConverter.labToXyzd50(this.l, this.a, this.b);
    }
    #getRGBArray(withAlpha = true) {
        const params = ColorConverter.xyzd50ToSrgb(...this.#toXyzd50());
        if (withAlpha) {
            return [...params, this.alpha ?? undefined];
        }
        return params;
    }
    constructor(l, a, b, alpha, authoredText) {
        this.#rawParams = [l, a, b];
        this.l = clamp(l, { min: 0, max: 100 });
        if (equals(this.l, 0, WIDE_RANGE_EPSILON) || equals(this.l, 100, WIDE_RANGE_EPSILON)) {
            a = b = 0;
        }
        this.a = a;
        this.b = b;
        this.alpha = clamp(alpha, { min: 0, max: 1 });
        this.#authoredText = authoredText;
    }
    is(format) {
        return format === this.format();
    }
    as(format) {
        return Lab.#conversions[format](this);
    }
    asLegacyColor() {
        return this.as("rgba" );
    }
    equal(color) {
        const lab = color.as("lab" );
        return equals(lab.l, this.l, WIDE_RANGE_EPSILON) && equals(lab.a, this.a) && equals(lab.b, this.b) &&
            equals(lab.alpha, this.alpha);
    }
    format() {
        return "lab" ;
    }
    setAlpha(alpha) {
        return new Lab(this.l, this.a, this.b, alpha, undefined);
    }
    asString(format) {
        if (format) {
            return this.as(format).asString();
        }
        return this.#stringify(this.l, this.a, this.b);
    }
    #stringify(l, a, b) {
        const alpha = this.alpha === null || equals(this.alpha, 1) ?
            '' :
            ` / ${stringifyWithPrecision(this.alpha)}`;
        return `lab(${stringifyWithPrecision(l, 0)} ${stringifyWithPrecision(a)} ${stringifyWithPrecision(b)}${alpha})`;
    }
    getAuthoredText() {
        return this.#authoredText ?? null;
    }
    getRawParameters() {
        return [...this.#rawParams];
    }
    getAsRawString(format) {
        if (format) {
            return this.as(format).getAsRawString();
        }
        return this.#stringify(...this.#rawParams);
    }
    isGamutClipped() {
        return false;
    }
    static fromSpec(spec, text) {
        const L = parsePercentage(spec[0], [0, 100]) ?? parseNumber(spec[0]);
        if (L === null) {
            return null;
        }
        const a = parsePercentage(spec[1], [0, 125]) ?? parseNumber(spec[1]);
        if (a === null) {
            return null;
        }
        const b = parsePercentage(spec[2], [0, 125]) ?? parseNumber(spec[2]);
        if (b === null) {
            return null;
        }
        const alpha = parseAlpha(spec[3]);
        return new Lab(L, a, b, alpha, text);
    }
}
class LCH {
    #rawParams;
    l;
    c;
    h;
    alpha;
    #authoredText;
    channels = ["l" , "c" , "h" , "alpha" ];
    static #conversions = {
        ["hex" ]: (self) => new Legacy(self.#getRGBArray( false), "hex" ),
        ["hexa" ]: (self) => new Legacy(self.#getRGBArray( true), "hexa" ),
        ["rgb" ]: (self) => new Legacy(self.#getRGBArray( false), "rgb" ),
        ["rgba" ]: (self) => new Legacy(self.#getRGBArray( true), "rgba" ),
        ["hsl" ]: (self) => new HSL(...rgbToHsl(self.#getRGBArray( false)), self.alpha),
        ["hsla" ]: (self) => new HSL(...rgbToHsl(self.#getRGBArray( false)), self.alpha),
        ["hwb" ]: (self) => new HWB(...rgbToHwb(self.#getRGBArray( false)), self.alpha),
        ["hwba" ]: (self) => new HWB(...rgbToHwb(self.#getRGBArray( false)), self.alpha),
        ["lch" ]: (self) => self,
        ["oklch" ]: (self) => new Oklch(...ColorConverter.xyzd50ToOklch(...self.#toXyzd50()), self.alpha),
        ["lab" ]: (self) => new Lab(...ColorConverter.lchToLab(self.l, self.c, self.h), self.alpha),
        ["oklab" ]: (self) => new Oklab(...ColorConverter.xyzd65ToOklab(...ColorConverter.xyzd50ToD65(...self.#toXyzd50())), self.alpha),
        ["srgb" ]: (self) => new ColorFunction("srgb" , ...ColorConverter.xyzd50ToSrgb(...self.#toXyzd50()), self.alpha),
        ["srgb-linear" ]: (self) => new ColorFunction("srgb-linear" , ...ColorConverter.xyzd50TosRGBLinear(...self.#toXyzd50()), self.alpha),
        ["display-p3" ]: (self) => new ColorFunction("display-p3" , ...ColorConverter.xyzd50ToDisplayP3(...self.#toXyzd50()), self.alpha),
        ["display-p3-linear" ]: (self) => new ColorFunction("display-p3-linear" , ...ColorConverter.xyzd50ToDisplayP3Linear(...self.#toXyzd50()), self.alpha),
        ["a98-rgb" ]: (self) => new ColorFunction("a98-rgb" , ...ColorConverter.xyzd50ToAdobeRGB(...self.#toXyzd50()), self.alpha),
        ["prophoto-rgb" ]: (self) => new ColorFunction("prophoto-rgb" , ...ColorConverter.xyzd50ToProPhoto(...self.#toXyzd50()), self.alpha),
        ["rec2020" ]: (self) => new ColorFunction("rec2020" , ...ColorConverter.xyzd50ToRec2020(...self.#toXyzd50()), self.alpha),
        ["xyz" ]: (self) => new ColorFunction("xyz" , ...ColorConverter.xyzd50ToD65(...self.#toXyzd50()), self.alpha),
        ["xyz-d50" ]: (self) => new ColorFunction("xyz-d50" , ...self.#toXyzd50(), self.alpha),
        ["xyz-d65" ]: (self) => new ColorFunction("xyz-d65" , ...ColorConverter.xyzd50ToD65(...self.#toXyzd50()), self.alpha),
    };
    #toXyzd50() {
        return ColorConverter.labToXyzd50(...ColorConverter.lchToLab(this.l, this.c, this.h));
    }
    #getRGBArray(withAlpha = true) {
        const params = ColorConverter.xyzd50ToSrgb(...this.#toXyzd50());
        if (withAlpha) {
            return [...params, this.alpha ?? undefined];
        }
        return params;
    }
    constructor(l, c, h, alpha, authoredText) {
        this.#rawParams = [l, c, h];
        this.l = clamp(l, { min: 0, max: 100 });
        c = equals(this.l, 0, WIDE_RANGE_EPSILON) || equals(this.l, 100, WIDE_RANGE_EPSILON) ? 0 : c;
        this.c = clamp(c, { min: 0 });
        h = equals(c, 0) ? 0 : h;
        this.h = normalizeHue(h);
        this.alpha = clamp(alpha, { min: 0, max: 1 });
        this.#authoredText = authoredText;
    }
    asLegacyColor() {
        return this.as("rgba" );
    }
    is(format) {
        return format === this.format();
    }
    as(format) {
        return LCH.#conversions[format](this);
    }
    equal(color) {
        const lch = color.as("lch" );
        return equals(lch.l, this.l, WIDE_RANGE_EPSILON) && equals(lch.c, this.c) && equals(lch.h, this.h) &&
            equals(lch.alpha, this.alpha);
    }
    format() {
        return "lch" ;
    }
    setAlpha(alpha) {
        return new LCH(this.l, this.c, this.h, alpha);
    }
    asString(format) {
        if (format) {
            return this.as(format).asString();
        }
        return this.#stringify(this.l, this.c, this.h);
    }
    #stringify(l, c, h) {
        const alpha = this.alpha === null || equals(this.alpha, 1) ?
            '' :
            ` / ${stringifyWithPrecision(this.alpha)}`;
        return `lch(${stringifyWithPrecision(l, 0)} ${stringifyWithPrecision(c)} ${stringifyWithPrecision(h)}${alpha})`;
    }
    getAuthoredText() {
        return this.#authoredText ?? null;
    }
    getRawParameters() {
        return [...this.#rawParams];
    }
    getAsRawString(format) {
        if (format) {
            return this.as(format).getAsRawString();
        }
        return this.#stringify(...this.#rawParams);
    }
    isGamutClipped() {
        return false;
    }
    isHuePowerless() {
        return equals(this.c, 0, STRICT_EPSILON);
    }
    static fromSpec(spec, text) {
        const L = parsePercentage(spec[0], [0, 100]) ?? parseNumber(spec[0]);
        if (L === null) {
            return null;
        }
        const c = parsePercentage(spec[1], [0, 150]) ?? parseNumber(spec[1]);
        if (c === null) {
            return null;
        }
        const h = parseAngle(spec[2]);
        if (h === null) {
            return null;
        }
        const alpha = parseAlpha(spec[3]);
        return new LCH(L, c, h, alpha, text);
    }
}
class Oklab {
    #rawParams;
    l;
    a;
    b;
    alpha;
    #authoredText;
    channels = ["l" , "a" , "b" , "alpha" ];
    static #conversions = {
        ["hex" ]: (self) => new Legacy(self.#getRGBArray( false), "hex" ),
        ["hexa" ]: (self) => new Legacy(self.#getRGBArray( true), "hexa" ),
        ["rgb" ]: (self) => new Legacy(self.#getRGBArray( false), "rgb" ),
        ["rgba" ]: (self) => new Legacy(self.#getRGBArray( true), "rgba" ),
        ["hsl" ]: (self) => new HSL(...rgbToHsl(self.#getRGBArray( false)), self.alpha),
        ["hsla" ]: (self) => new HSL(...rgbToHsl(self.#getRGBArray( false)), self.alpha),
        ["hwb" ]: (self) => new HWB(...rgbToHwb(self.#getRGBArray( false)), self.alpha),
        ["hwba" ]: (self) => new HWB(...rgbToHwb(self.#getRGBArray( false)), self.alpha),
        ["lch" ]: (self) => new LCH(...ColorConverter.labToLch(...ColorConverter.xyzd50ToLab(...self.#toXyzd50())), self.alpha),
        ["oklch" ]: (self) => new Oklch(...ColorConverter.xyzd50ToOklch(...self.#toXyzd50()), self.alpha),
        ["lab" ]: (self) => new Lab(...ColorConverter.xyzd50ToLab(...self.#toXyzd50()), self.alpha),
        ["oklab" ]: (self) => self,
        ["srgb" ]: (self) => new ColorFunction("srgb" , ...ColorConverter.xyzd50ToSrgb(...self.#toXyzd50()), self.alpha),
        ["srgb-linear" ]: (self) => new ColorFunction("srgb-linear" , ...ColorConverter.xyzd50TosRGBLinear(...self.#toXyzd50()), self.alpha),
        ["display-p3" ]: (self) => new ColorFunction("display-p3" , ...ColorConverter.xyzd50ToDisplayP3(...self.#toXyzd50()), self.alpha),
        ["display-p3-linear" ]: (self) => new ColorFunction("display-p3-linear" , ...ColorConverter.xyzd50ToDisplayP3Linear(...self.#toXyzd50()), self.alpha),
        ["a98-rgb" ]: (self) => new ColorFunction("a98-rgb" , ...ColorConverter.xyzd50ToAdobeRGB(...self.#toXyzd50()), self.alpha),
        ["prophoto-rgb" ]: (self) => new ColorFunction("prophoto-rgb" , ...ColorConverter.xyzd50ToProPhoto(...self.#toXyzd50()), self.alpha),
        ["rec2020" ]: (self) => new ColorFunction("rec2020" , ...ColorConverter.xyzd50ToRec2020(...self.#toXyzd50()), self.alpha),
        ["xyz" ]: (self) => new ColorFunction("xyz" , ...ColorConverter.xyzd50ToD65(...self.#toXyzd50()), self.alpha),
        ["xyz-d50" ]: (self) => new ColorFunction("xyz-d50" , ...self.#toXyzd50(), self.alpha),
        ["xyz-d65" ]: (self) => new ColorFunction("xyz-d65" , ...ColorConverter.xyzd50ToD65(...self.#toXyzd50()), self.alpha),
    };
    #toXyzd50() {
        return ColorConverter.xyzd65ToD50(...ColorConverter.oklabToXyzd65(this.l, this.a, this.b));
    }
    #getRGBArray(withAlpha = true) {
        const params = ColorConverter.xyzd50ToSrgb(...this.#toXyzd50());
        if (withAlpha) {
            return [...params, this.alpha ?? undefined];
        }
        return params;
    }
    constructor(l, a, b, alpha, authoredText) {
        this.#rawParams = [l, a, b];
        this.l = clamp(l, { min: 0, max: 1 });
        if (equals(this.l, 0) || equals(this.l, 1)) {
            a = b = 0;
        }
        this.a = a;
        this.b = b;
        this.alpha = clamp(alpha, { min: 0, max: 1 });
        this.#authoredText = authoredText;
    }
    asLegacyColor() {
        return this.as("rgba" );
    }
    is(format) {
        return format === this.format();
    }
    as(format) {
        return Oklab.#conversions[format](this);
    }
    equal(color) {
        const oklab = color.as("oklab" );
        return equals(oklab.l, this.l) && equals(oklab.a, this.a) && equals(oklab.b, this.b) &&
            equals(oklab.alpha, this.alpha);
    }
    format() {
        return "oklab" ;
    }
    setAlpha(alpha) {
        return new Oklab(this.l, this.a, this.b, alpha);
    }
    asString(format) {
        if (format) {
            return this.as(format).asString();
        }
        return this.#stringify(this.l, this.a, this.b);
    }
    #stringify(l, a, b) {
        const alpha = this.alpha === null || equals(this.alpha, 1) ?
            '' :
            ` / ${stringifyWithPrecision(this.alpha)}`;
        return `oklab(${stringifyWithPrecision(l)} ${stringifyWithPrecision(a)} ${stringifyWithPrecision(b)}${alpha})`;
    }
    getAuthoredText() {
        return this.#authoredText ?? null;
    }
    getRawParameters() {
        return [...this.#rawParams];
    }
    getAsRawString(format) {
        if (format) {
            return this.as(format).getAsRawString();
        }
        return this.#stringify(...this.#rawParams);
    }
    isGamutClipped() {
        return false;
    }
    static fromSpec(spec, text) {
        const L = parsePercentage(spec[0], [0, 1]) ?? parseNumber(spec[0]);
        if (L === null) {
            return null;
        }
        const a = parsePercentage(spec[1], [0, 0.4]) ?? parseNumber(spec[1]);
        if (a === null) {
            return null;
        }
        const b = parsePercentage(spec[2], [0, 0.4]) ?? parseNumber(spec[2]);
        if (b === null) {
            return null;
        }
        const alpha = parseAlpha(spec[3]);
        return new Oklab(L, a, b, alpha, text);
    }
}
class Oklch {
    #rawParams;
    l;
    c;
    h;
    alpha;
    #authoredText;
    channels = ["l" , "c" , "h" , "alpha" ];
    static #conversions = {
        ["hex" ]: (self) => new Legacy(self.#getRGBArray( false), "hex" ),
        ["hexa" ]: (self) => new Legacy(self.#getRGBArray( true), "hexa" ),
        ["rgb" ]: (self) => new Legacy(self.#getRGBArray( false), "rgb" ),
        ["rgba" ]: (self) => new Legacy(self.#getRGBArray( true), "rgba" ),
        ["hsl" ]: (self) => new HSL(...rgbToHsl(self.#getRGBArray( false)), self.alpha),
        ["hsla" ]: (self) => new HSL(...rgbToHsl(self.#getRGBArray( false)), self.alpha),
        ["hwb" ]: (self) => new HWB(...rgbToHwb(self.#getRGBArray( false)), self.alpha),
        ["hwba" ]: (self) => new HWB(...rgbToHwb(self.#getRGBArray( false)), self.alpha),
        ["lch" ]: (self) => new LCH(...ColorConverter.labToLch(...ColorConverter.xyzd50ToLab(...self.#toXyzd50())), self.alpha),
        ["oklch" ]: (self) => self,
        ["lab" ]: (self) => new Lab(...ColorConverter.xyzd50ToLab(...self.#toXyzd50()), self.alpha),
        ["oklab" ]: (self) => new Oklab(...ColorConverter.xyzd65ToOklab(...ColorConverter.xyzd50ToD65(...self.#toXyzd50())), self.alpha),
        ["srgb" ]: (self) => new ColorFunction("srgb" , ...ColorConverter.xyzd50ToSrgb(...self.#toXyzd50()), self.alpha),
        ["srgb-linear" ]: (self) => new ColorFunction("srgb-linear" , ...ColorConverter.xyzd50TosRGBLinear(...self.#toXyzd50()), self.alpha),
        ["display-p3" ]: (self) => new ColorFunction("display-p3" , ...ColorConverter.xyzd50ToDisplayP3(...self.#toXyzd50()), self.alpha),
        ["display-p3-linear" ]: (self) => new ColorFunction("display-p3-linear" , ...ColorConverter.xyzd50ToDisplayP3Linear(...self.#toXyzd50()), self.alpha),
        ["a98-rgb" ]: (self) => new ColorFunction("a98-rgb" , ...ColorConverter.xyzd50ToAdobeRGB(...self.#toXyzd50()), self.alpha),
        ["prophoto-rgb" ]: (self) => new ColorFunction("prophoto-rgb" , ...ColorConverter.xyzd50ToProPhoto(...self.#toXyzd50()), self.alpha),
        ["rec2020" ]: (self) => new ColorFunction("rec2020" , ...ColorConverter.xyzd50ToRec2020(...self.#toXyzd50()), self.alpha),
        ["xyz" ]: (self) => new ColorFunction("xyz" , ...ColorConverter.xyzd50ToD65(...self.#toXyzd50()), self.alpha),
        ["xyz-d50" ]: (self) => new ColorFunction("xyz-d50" , ...self.#toXyzd50(), self.alpha),
        ["xyz-d65" ]: (self) => new ColorFunction("xyz-d65" , ...ColorConverter.xyzd50ToD65(...self.#toXyzd50()), self.alpha),
    };
    #toXyzd50() {
        return ColorConverter.oklchToXyzd50(this.l, this.c, this.h);
    }
    #getRGBArray(withAlpha = true) {
        const params = ColorConverter.xyzd50ToSrgb(...this.#toXyzd50());
        if (withAlpha) {
            return [...params, this.alpha ?? undefined];
        }
        return params;
    }
    constructor(l, c, h, alpha, authoredText) {
        this.#rawParams = [l, c, h];
        this.l = clamp(l, { min: 0, max: 1 });
        c = equals(this.l, 0) || equals(this.l, 1) ? 0 : c;
        this.c = clamp(c, { min: 0 });
        h = equals(c, 0) ? 0 : h;
        this.h = normalizeHue(h);
        this.alpha = clamp(alpha, { min: 0, max: 1 });
        this.#authoredText = authoredText;
    }
    asLegacyColor() {
        return this.as("rgba" );
    }
    is(format) {
        return format === this.format();
    }
    as(format) {
        return Oklch.#conversions[format](this);
    }
    equal(color) {
        const oklch = color.as("oklch" );
        return equals(oklch.l, this.l) && equals(oklch.c, this.c) && equals(oklch.h, this.h) &&
            equals(oklch.alpha, this.alpha);
    }
    format() {
        return "oklch" ;
    }
    setAlpha(alpha) {
        return new Oklch(this.l, this.c, this.h, alpha);
    }
    asString(format) {
        if (format) {
            return this.as(format).asString();
        }
        return this.#stringify(this.l, this.c, this.h);
    }
    #stringify(l, c, h) {
        const alpha = this.alpha === null || equals(this.alpha, 1) ?
            '' :
            ` / ${stringifyWithPrecision(this.alpha)}`;
        return `oklch(${stringifyWithPrecision(l)} ${stringifyWithPrecision(c)} ${stringifyWithPrecision(h)}${alpha})`;
    }
    getAuthoredText() {
        return this.#authoredText ?? null;
    }
    getRawParameters() {
        return [...this.#rawParams];
    }
    getAsRawString(format) {
        if (format) {
            return this.as(format).getAsRawString();
        }
        return this.#stringify(...this.#rawParams);
    }
    isGamutClipped() {
        return false;
    }
    static fromSpec(spec, text) {
        const L = parsePercentage(spec[0], [0, 1]) ?? parseNumber(spec[0]);
        if (L === null) {
            return null;
        }
        const c = parsePercentage(spec[1], [0, 0.4]) ?? parseNumber(spec[1]);
        if (c === null) {
            return null;
        }
        const h = parseAngle(spec[2]);
        if (h === null) {
            return null;
        }
        const alpha = parseAlpha(spec[3]);
        return new Oklch(L, c, h, alpha, text);
    }
}
class ColorFunction {
    #rawParams;
    p0;
    p1;
    p2;
    alpha;
    colorSpace;
    #authoredText;
    get channels() {
        return this.isXYZ() ? ["x" , "y" , "z" , "alpha" ] :
            ["r" , "g" , "b" , "alpha" ];
    }
    static #conversions = {
        ["hex" ]: (self) => new Legacy(self.#getRGBArray( false), "hex" ),
        ["hexa" ]: (self) => new Legacy(self.#getRGBArray( true), "hexa" ),
        ["rgb" ]: (self) => new Legacy(self.#getRGBArray( false), "rgb" ),
        ["rgba" ]: (self) => new Legacy(self.#getRGBArray( true), "rgba" ),
        ["hsl" ]: (self) => new HSL(...rgbToHsl(self.#getRGBArray( false)), self.alpha),
        ["hsla" ]: (self) => new HSL(...rgbToHsl(self.#getRGBArray( false)), self.alpha),
        ["hwb" ]: (self) => new HWB(...rgbToHwb(self.#getRGBArray( false)), self.alpha),
        ["hwba" ]: (self) => new HWB(...rgbToHwb(self.#getRGBArray( false)), self.alpha),
        ["lch" ]: (self) => new LCH(...ColorConverter.labToLch(...ColorConverter.xyzd50ToLab(...self.#toXyzd50())), self.alpha),
        ["oklch" ]: (self) => new Oklch(...ColorConverter.xyzd50ToOklch(...self.#toXyzd50()), self.alpha),
        ["lab" ]: (self) => new Lab(...ColorConverter.xyzd50ToLab(...self.#toXyzd50()), self.alpha),
        ["oklab" ]: (self) => new Oklab(...ColorConverter.xyzd65ToOklab(...ColorConverter.xyzd50ToD65(...self.#toXyzd50())), self.alpha),
        ["srgb" ]: (self) => new ColorFunction("srgb" , ...ColorConverter.xyzd50ToSrgb(...self.#toXyzd50()), self.alpha),
        ["srgb-linear" ]: (self) => new ColorFunction("srgb-linear" , ...ColorConverter.xyzd50TosRGBLinear(...self.#toXyzd50()), self.alpha),
        ["display-p3" ]: (self) => new ColorFunction("display-p3" , ...ColorConverter.xyzd50ToDisplayP3(...self.#toXyzd50()), self.alpha),
        ["display-p3-linear" ]: (self) => new ColorFunction("display-p3-linear" , ...ColorConverter.xyzd50ToDisplayP3Linear(...self.#toXyzd50()), self.alpha),
        ["a98-rgb" ]: (self) => new ColorFunction("a98-rgb" , ...ColorConverter.xyzd50ToAdobeRGB(...self.#toXyzd50()), self.alpha),
        ["prophoto-rgb" ]: (self) => new ColorFunction("prophoto-rgb" , ...ColorConverter.xyzd50ToProPhoto(...self.#toXyzd50()), self.alpha),
        ["rec2020" ]: (self) => new ColorFunction("rec2020" , ...ColorConverter.xyzd50ToRec2020(...self.#toXyzd50()), self.alpha),
        ["xyz" ]: (self) => new ColorFunction("xyz" , ...ColorConverter.xyzd50ToD65(...self.#toXyzd50()), self.alpha),
        ["xyz-d50" ]: (self) => new ColorFunction("xyz-d50" , ...self.#toXyzd50(), self.alpha),
        ["xyz-d65" ]: (self) => new ColorFunction("xyz-d65" , ...ColorConverter.xyzd50ToD65(...self.#toXyzd50()), self.alpha),
    };
    #toXyzd50() {
        const [p0, p1, p2] = this.#rawParams;
        switch (this.colorSpace) {
            case "srgb" :
                return ColorConverter.srgbToXyzd50(p0, p1, p2);
            case "srgb-linear" :
                return ColorConverter.srgbLinearToXyzd50(p0, p1, p2);
            case "display-p3" :
                return ColorConverter.displayP3ToXyzd50(p0, p1, p2);
            case "display-p3-linear" :
                return ColorConverter.displayP3LinearToXyzd50(p0, p1, p2);
            case "a98-rgb" :
                return ColorConverter.adobeRGBToXyzd50(p0, p1, p2);
            case "prophoto-rgb" :
                return ColorConverter.proPhotoToXyzd50(p0, p1, p2);
            case "rec2020" :
                return ColorConverter.rec2020ToXyzd50(p0, p1, p2);
            case "xyz-d50" :
                return [p0, p1, p2];
            case "xyz" :
            case "xyz-d65" :
                return ColorConverter.xyzd65ToD50(p0, p1, p2);
        }
        throw new Error('Invalid color space');
    }
    #getRGBArray(withAlpha = true) {
        const [p0, p1, p2] = this.#rawParams;
        const params = this.colorSpace === "srgb"  ? [p0, p1, p2] : [...ColorConverter.xyzd50ToSrgb(...this.#toXyzd50())];
        if (withAlpha) {
            return [...params, this.alpha ?? undefined];
        }
        return params;
    }
    constructor(colorSpace, p0, p1, p2, alpha, authoredText) {
        this.#rawParams = [p0, p1, p2];
        this.colorSpace = colorSpace;
        this.#authoredText = authoredText;
        if (this.colorSpace !== "xyz-d50"  && this.colorSpace !== "xyz-d65"  && this.colorSpace !== "xyz" ) {
            p0 = clamp(p0, { min: 0, max: 1 });
            p1 = clamp(p1, { min: 0, max: 1 });
            p2 = clamp(p2, { min: 0, max: 1 });
        }
        this.p0 = p0;
        this.p1 = p1;
        this.p2 = p2;
        this.alpha = clamp(alpha, { min: 0, max: 1 });
    }
    asLegacyColor() {
        return this.as("rgba" );
    }
    is(format) {
        return format === this.format();
    }
    as(format) {
        if (this.colorSpace === format) {
            return this;
        }
        return ColorFunction.#conversions[format](this);
    }
    equal(color) {
        const space = color.as(this.colorSpace);
        return equals(this.p0, space.p0) && equals(this.p1, space.p1) && equals(this.p2, space.p2) &&
            equals(this.alpha, space.alpha);
    }
    format() {
        return this.colorSpace;
    }
    setAlpha(alpha) {
        return new ColorFunction(this.colorSpace, this.p0, this.p1, this.p2, alpha);
    }
    asString(format) {
        if (format) {
            return this.as(format).asString();
        }
        return this.#stringify(this.p0, this.p1, this.p2);
    }
    #stringify(p0, p1, p2) {
        const alpha = this.alpha === null || equals(this.alpha, 1) ?
            '' :
            ` / ${stringifyWithPrecision(this.alpha)}`;
        return `color(${this.colorSpace} ${stringifyWithPrecision(p0)} ${stringifyWithPrecision(p1)} ${stringifyWithPrecision(p2)}${alpha})`;
    }
    getAuthoredText() {
        return this.#authoredText ?? null;
    }
    getRawParameters() {
        return [...this.#rawParams];
    }
    getAsRawString(format) {
        if (format) {
            return this.as(format).getAsRawString();
        }
        return this.#stringify(...this.#rawParams);
    }
    isGamutClipped() {
        if (this.colorSpace !== "xyz-d50"  && this.colorSpace !== "xyz-d65"  && this.colorSpace !== "xyz" ) {
            return !equals(this.#rawParams, [this.p0, this.p1, this.p2]);
        }
        return false;
    }
    isXYZ() {
        switch (this.colorSpace) {
            case "xyz" :
            case "xyz-d50" :
            case "xyz-d65" :
                return true;
        }
        return false;
    }
    static fromSpec(authoredText, parametersWithAlphaText) {
        const [parametersText, alphaText] = parametersWithAlphaText.split('/', 2);
        const parameters = parametersText.trim().split(/\s+/);
        const [colorSpaceText, ...remainingParams] = parameters;
        const colorSpace = getColorSpace(colorSpaceText);
        if (!colorSpace) {
            return null;
        }
        if (remainingParams.length === 0 && alphaText === undefined) {
            return new ColorFunction(colorSpace, 0, 0, 0, null, authoredText);
        }
        if (remainingParams.length === 0 && alphaText !== undefined && alphaText.trim().split(/\s+/).length > 1) {
            return null;
        }
        if (remainingParams.length > 3) {
            return null;
        }
        const nonesReplacedParams = remainingParams.map(param => param === 'none' ? '0' : param);
        const values = nonesReplacedParams.map(param => parsePercentOrNumber(param, [0, 1]));
        const containsNull = values.includes(null);
        if (containsNull) {
            return null;
        }
        const alphaValue = alphaText ? parsePercentOrNumber(alphaText, [0, 1]) ?? 1 : 1;
        const rgbOrXyza = [
            values[0] ?? 0,
            values[1] ?? 0,
            values[2] ?? 0,
            alphaValue,
        ];
        return new ColorFunction(colorSpace, ...rgbOrXyza, authoredText);
    }
}
class HSL {
    h;
    s;
    l;
    alpha;
    #rawParams;
    #authoredText;
    channels = ["h" , "s" , "l" , "alpha" ];
    static #conversions = {
        ["hex" ]: (self) => new Legacy(self.#getRGBArray( false), "hex" ),
        ["hexa" ]: (self) => new Legacy(self.#getRGBArray( true), "hexa" ),
        ["rgb" ]: (self) => new Legacy(self.#getRGBArray( false), "rgb" ),
        ["rgba" ]: (self) => new Legacy(self.#getRGBArray( true), "rgba" ),
        ["hsl" ]: (self) => self,
        ["hsla" ]: (self) => self,
        ["hwb" ]: (self) => new HWB(...rgbToHwb(self.#getRGBArray( false)), self.alpha),
        ["hwba" ]: (self) => new HWB(...rgbToHwb(self.#getRGBArray( false)), self.alpha),
        ["lch" ]: (self) => new LCH(...ColorConverter.labToLch(...ColorConverter.xyzd50ToLab(...self.#toXyzd50())), self.alpha),
        ["oklch" ]: (self) => new Oklch(...ColorConverter.xyzd50ToOklch(...self.#toXyzd50()), self.alpha),
        ["lab" ]: (self) => new Lab(...ColorConverter.xyzd50ToLab(...self.#toXyzd50()), self.alpha),
        ["oklab" ]: (self) => new Oklab(...ColorConverter.xyzd65ToOklab(...ColorConverter.xyzd50ToD65(...self.#toXyzd50())), self.alpha),
        ["srgb" ]: (self) => new ColorFunction("srgb" , ...ColorConverter.xyzd50ToSrgb(...self.#toXyzd50()), self.alpha),
        ["srgb-linear" ]: (self) => new ColorFunction("srgb-linear" , ...ColorConverter.xyzd50TosRGBLinear(...self.#toXyzd50()), self.alpha),
        ["display-p3" ]: (self) => new ColorFunction("display-p3" , ...ColorConverter.xyzd50ToDisplayP3(...self.#toXyzd50()), self.alpha),
        ["display-p3-linear" ]: (self) => new ColorFunction("display-p3-linear" , ...ColorConverter.xyzd50ToDisplayP3Linear(...self.#toXyzd50()), self.alpha),
        ["a98-rgb" ]: (self) => new ColorFunction("a98-rgb" , ...ColorConverter.xyzd50ToAdobeRGB(...self.#toXyzd50()), self.alpha),
        ["prophoto-rgb" ]: (self) => new ColorFunction("prophoto-rgb" , ...ColorConverter.xyzd50ToProPhoto(...self.#toXyzd50()), self.alpha),
        ["rec2020" ]: (self) => new ColorFunction("rec2020" , ...ColorConverter.xyzd50ToRec2020(...self.#toXyzd50()), self.alpha),
        ["xyz" ]: (self) => new ColorFunction("xyz" , ...ColorConverter.xyzd50ToD65(...self.#toXyzd50()), self.alpha),
        ["xyz-d50" ]: (self) => new ColorFunction("xyz-d50" , ...self.#toXyzd50(), self.alpha),
        ["xyz-d65" ]: (self) => new ColorFunction("xyz-d65" , ...ColorConverter.xyzd50ToD65(...self.#toXyzd50()), self.alpha),
    };
    #getRGBArray(withAlpha = true) {
        const rgb = hsl2rgb([this.h, this.s, this.l, 0]);
        if (withAlpha) {
            return [rgb[0], rgb[1], rgb[2], this.alpha ?? undefined];
        }
        return [rgb[0], rgb[1], rgb[2]];
    }
    #toXyzd50() {
        const rgb = this.#getRGBArray(false);
        return ColorConverter.srgbToXyzd50(rgb[0], rgb[1], rgb[2]);
    }
    constructor(h, s, l, alpha, authoredText) {
        this.#rawParams = [h, s, l];
        this.l = clamp(l, { min: 0, max: 1 });
        s = equals(this.l, 0) || equals(this.l, 1) ? 0 : s;
        this.s = clamp(s, { min: 0, max: 1 });
        h = equals(this.s, 0, STRICT_EPSILON) ? 0 : h;
        this.h = normalizeHue(h * 360) / 360;
        this.alpha = clamp(alpha ?? null, { min: 0, max: 1 });
        this.#authoredText = authoredText;
    }
    equal(color) {
        const hsl = color.as("hsl" );
        return equals(this.h, hsl.h) && equals(this.s, hsl.s) && equals(this.l, hsl.l) && equals(this.alpha, hsl.alpha);
    }
    asString(format) {
        if (format) {
            return this.as(format).asString();
        }
        return this.#stringify(this.h, this.s, this.l);
    }
    #stringify(h, s, l) {
        const start = sprintf('hsl(%sdeg %s% %s%', stringifyWithPrecision(h * 360), stringifyWithPrecision(s * 100), stringifyWithPrecision(l * 100));
        if (this.alpha !== null && this.alpha !== 1) {
            return start +
                sprintf(' / %s%)', stringifyWithPrecision(this.alpha * 100));
        }
        return start + ')';
    }
    setAlpha(alpha) {
        return new HSL(this.h, this.s, this.l, alpha);
    }
    format() {
        return this.alpha === null || this.alpha === 1 ? "hsl"  : "hsla" ;
    }
    is(format) {
        return format === this.format();
    }
    as(format) {
        if (format === this.format()) {
            return this;
        }
        return HSL.#conversions[format](this);
    }
    asLegacyColor() {
        return this.as("rgba" );
    }
    getAuthoredText() {
        return this.#authoredText ?? null;
    }
    getRawParameters() {
        return [...this.#rawParams];
    }
    getAsRawString(format) {
        if (format) {
            return this.as(format).getAsRawString();
        }
        return this.#stringify(...this.#rawParams);
    }
    isGamutClipped() {
        return !lessOrEquals(this.#rawParams[1], 1) || !lessOrEquals(0, this.#rawParams[1]);
    }
    static fromSpec(spec, text) {
        const h = parseHueNumeric(spec[0]);
        if (h === null) {
            return null;
        }
        const s = parseSatLightNumeric(spec[1]);
        if (s === null) {
            return null;
        }
        const l = parseSatLightNumeric(spec[2]);
        if (l === null) {
            return null;
        }
        const alpha = parseAlpha(spec[3]);
        return new HSL(h, s, l, alpha, text);
    }
    hsva() {
        const s = this.s * (this.l < 0.5 ? this.l : 1 - this.l);
        return [this.h, s !== 0 ? 2 * s / (this.l + s) : 0, (this.l + s), this.alpha ?? 1];
    }
    canonicalHSLA() {
        return [Math.round(this.h * 360), Math.round(this.s * 100), Math.round(this.l * 100), this.alpha ?? 1];
    }
}
class HWB {
    h;
    w;
    b;
    alpha;
    #rawParams;
    #authoredText;
    channels = ["h" , "w" , "b" , "alpha" ];
    static #conversions = {
        ["hex" ]: (self) => new Legacy(self.#getRGBArray( false), "hex" ),
        ["hexa" ]: (self) => new Legacy(self.#getRGBArray( true), "hexa" ),
        ["rgb" ]: (self) => new Legacy(self.#getRGBArray( false), "rgb" ),
        ["rgba" ]: (self) => new Legacy(self.#getRGBArray( true), "rgba" ),
        ["hsl" ]: (self) => new HSL(...rgbToHsl(self.#getRGBArray( false)), self.alpha),
        ["hsla" ]: (self) => new HSL(...rgbToHsl(self.#getRGBArray( false)), self.alpha),
        ["hwb" ]: (self) => self,
        ["hwba" ]: (self) => self,
        ["lch" ]: (self) => new LCH(...ColorConverter.labToLch(...ColorConverter.xyzd50ToLab(...self.#toXyzd50())), self.alpha),
        ["oklch" ]: (self) => new Oklch(...ColorConverter.xyzd50ToOklch(...self.#toXyzd50()), self.alpha),
        ["lab" ]: (self) => new Lab(...ColorConverter.xyzd50ToLab(...self.#toXyzd50()), self.alpha),
        ["oklab" ]: (self) => new Oklab(...ColorConverter.xyzd65ToOklab(...ColorConverter.xyzd50ToD65(...self.#toXyzd50())), self.alpha),
        ["srgb" ]: (self) => new ColorFunction("srgb" , ...ColorConverter.xyzd50ToSrgb(...self.#toXyzd50()), self.alpha),
        ["srgb-linear" ]: (self) => new ColorFunction("srgb-linear" , ...ColorConverter.xyzd50TosRGBLinear(...self.#toXyzd50()), self.alpha),
        ["display-p3" ]: (self) => new ColorFunction("display-p3" , ...ColorConverter.xyzd50ToDisplayP3(...self.#toXyzd50()), self.alpha),
        ["display-p3-linear" ]: (self) => new ColorFunction("display-p3-linear" , ...ColorConverter.xyzd50ToDisplayP3Linear(...self.#toXyzd50()), self.alpha),
        ["a98-rgb" ]: (self) => new ColorFunction("a98-rgb" , ...ColorConverter.xyzd50ToAdobeRGB(...self.#toXyzd50()), self.alpha),
        ["prophoto-rgb" ]: (self) => new ColorFunction("prophoto-rgb" , ...ColorConverter.xyzd50ToProPhoto(...self.#toXyzd50()), self.alpha),
        ["rec2020" ]: (self) => new ColorFunction("rec2020" , ...ColorConverter.xyzd50ToRec2020(...self.#toXyzd50()), self.alpha),
        ["xyz" ]: (self) => new ColorFunction("xyz" , ...ColorConverter.xyzd50ToD65(...self.#toXyzd50()), self.alpha),
        ["xyz-d50" ]: (self) => new ColorFunction("xyz-d50" , ...self.#toXyzd50(), self.alpha),
        ["xyz-d65" ]: (self) => new ColorFunction("xyz-d65" , ...ColorConverter.xyzd50ToD65(...self.#toXyzd50()), self.alpha),
    };
    #getRGBArray(withAlpha = true) {
        const rgb = hwb2rgb([this.h, this.w, this.b, 0]);
        if (withAlpha) {
            return [rgb[0], rgb[1], rgb[2], this.alpha ?? undefined];
        }
        return [rgb[0], rgb[1], rgb[2]];
    }
    #toXyzd50() {
        const rgb = this.#getRGBArray(false);
        return ColorConverter.srgbToXyzd50(rgb[0], rgb[1], rgb[2]);
    }
    constructor(h, w, b, alpha, authoredText) {
        this.#rawParams = [h, w, b];
        this.w = clamp(w, { min: 0, max: 1 });
        this.b = clamp(b, { min: 0, max: 1 });
        h = lessOrEquals(1, this.w + this.b) ? 0 : h;
        this.h = normalizeHue(h * 360) / 360;
        this.alpha = clamp(alpha, { min: 0, max: 1 });
        if (lessOrEquals(1, this.w + this.b)) {
            const ratio = this.w / this.b;
            this.b = 1 / (1 + ratio);
            this.w = 1 - this.b;
        }
        this.#authoredText = authoredText;
    }
    equal(color) {
        const hwb = color.as("hwb" );
        return equals(this.h, hwb.h) && equals(this.w, hwb.w) && equals(this.b, hwb.b) && equals(this.alpha, hwb.alpha);
    }
    asString(format) {
        if (format) {
            return this.as(format).asString();
        }
        return this.#stringify(this.h, this.w, this.b);
    }
    #stringify(h, w, b) {
        const start = sprintf('hwb(%sdeg %s% %s%', stringifyWithPrecision(h * 360), stringifyWithPrecision(w * 100), stringifyWithPrecision(b * 100));
        if (this.alpha !== null && this.alpha !== 1) {
            return start +
                sprintf(' / %s%)', stringifyWithPrecision(this.alpha * 100));
        }
        return start + ')';
    }
    setAlpha(alpha) {
        return new HWB(this.h, this.w, this.b, alpha, this.#authoredText);
    }
    format() {
        return this.alpha !== null && !equals(this.alpha, 1) ? "hwba"  : "hwb" ;
    }
    is(format) {
        return format === this.format();
    }
    as(format) {
        if (format === this.format()) {
            return this;
        }
        return HWB.#conversions[format](this);
    }
    asLegacyColor() {
        return this.as("rgba" );
    }
    getAuthoredText() {
        return this.#authoredText ?? null;
    }
    canonicalHWBA() {
        return [
            Math.round(this.h * 360),
            Math.round(this.w * 100),
            Math.round(this.b * 100),
            this.alpha ?? 1,
        ];
    }
    getRawParameters() {
        return [...this.#rawParams];
    }
    getAsRawString(format) {
        if (format) {
            return this.as(format).getAsRawString();
        }
        return this.#stringify(...this.#rawParams);
    }
    isGamutClipped() {
        return !lessOrEquals(this.#rawParams[1], 1) || !lessOrEquals(0, this.#rawParams[1]) ||
            !lessOrEquals(this.#rawParams[2], 1) || !lessOrEquals(0, this.#rawParams[2]);
    }
    static fromSpec(spec, text) {
        const h = parseHueNumeric(spec[0]);
        if (h === null) {
            return null;
        }
        const w = parseSatLightNumeric(spec[1]);
        if (w === null) {
            return null;
        }
        const b = parseSatLightNumeric(spec[2]);
        if (b === null) {
            return null;
        }
        const alpha = parseAlpha(spec[3]);
        return new HWB(h, w, b, alpha, text);
    }
}
function toRgbValue(value) {
    return Math.round(value * 255);
}
class ShortFormatColorBase {
    color;
    channels = ["r" , "g" , "b" , "alpha" ];
    constructor(color) {
        this.color = color;
    }
    get alpha() {
        return this.color.alpha;
    }
    rgba() {
        return this.color.rgba();
    }
    equal(color) {
        return this.color.equal(color);
    }
    setAlpha(alpha) {
        return this.color.setAlpha(alpha);
    }
    format() {
        return (this.alpha ?? 1) !== 1 ? "hexa"  : "hex" ;
    }
    as(format) {
        return this.color.as(format);
    }
    is(format) {
        return this.color.is(format);
    }
    asLegacyColor() {
        return this.color.asLegacyColor();
    }
    getAuthoredText() {
        return this.color.getAuthoredText();
    }
    getRawParameters() {
        return this.color.getRawParameters();
    }
    isGamutClipped() {
        return this.color.isGamutClipped();
    }
    asString(format) {
        if (format) {
            return this.as(format).asString();
        }
        const [r, g, b] = this.color.rgba();
        return this.stringify(r, g, b);
    }
    getAsRawString(format) {
        if (format) {
            return this.as(format).getAsRawString();
        }
        const [r, g, b] = this.getRawParameters();
        return this.stringify(r, g, b);
    }
}
class ShortHex extends ShortFormatColorBase {
    setAlpha(alpha) {
        return new ShortHex(this.color.setAlpha(alpha));
    }
    asString(format) {
        return format && format !== this.format() ? super.as(format).asString() : super.asString();
    }
    stringify(r, g, b) {
        function toShortHexValue(value) {
            return (Math.round(value * 255) / 17).toString(16);
        }
        if (this.color.hasAlpha()) {
            return sprintf('#%s%s%s%s', toShortHexValue(r), toShortHexValue(g), toShortHexValue(b), toShortHexValue(this.alpha ?? 1))
                .toLowerCase();
        }
        return sprintf('#%s%s%s', toShortHexValue(r), toShortHexValue(g), toShortHexValue(b))
            .toLowerCase();
    }
}
class Nickname extends ShortFormatColorBase {
    nickname;
    constructor(nickname, color) {
        super(color);
        this.nickname = nickname;
    }
    static fromName(name, text) {
        const nickname = name.toLowerCase();
        const rgba = Nicknames.get(nickname);
        if (rgba !== undefined) {
            return new Nickname(nickname, Legacy.fromRGBA(rgba, text));
        }
        return null;
    }
    stringify() {
        return this.nickname;
    }
    getAsRawString(format) {
        return this.color.getAsRawString(format);
    }
}
class Legacy {
    #rawParams;
    #rgba;
    #authoredText;
    #format;
    channels = ["r" , "g" , "b" , "alpha" ];
    static #conversions = {
        ["hex" ]: (self) => new Legacy(self.#rgba, "hex" ),
        ["hexa" ]: (self) => new Legacy(self.#rgba, "hexa" ),
        ["rgb" ]: (self) => new Legacy(self.#rgba, "rgb" ),
        ["rgba" ]: (self) => new Legacy(self.#rgba, "rgba" ),
        ["hsl" ]: (self) => new HSL(...rgbToHsl([self.#rgba[0], self.#rgba[1], self.#rgba[2]]), self.alpha),
        ["hsla" ]: (self) => new HSL(...rgbToHsl([self.#rgba[0], self.#rgba[1], self.#rgba[2]]), self.alpha),
        ["hwb" ]: (self) => new HWB(...rgbToHwb([self.#rgba[0], self.#rgba[1], self.#rgba[2]]), self.alpha),
        ["hwba" ]: (self) => new HWB(...rgbToHwb([self.#rgba[0], self.#rgba[1], self.#rgba[2]]), self.alpha),
        ["lch" ]: (self) => new LCH(...ColorConverter.labToLch(...ColorConverter.xyzd50ToLab(...self.#toXyzd50())), self.alpha),
        ["oklch" ]: (self) => new Oklch(...ColorConverter.xyzd50ToOklch(...self.#toXyzd50()), self.alpha),
        ["lab" ]: (self) => new Lab(...ColorConverter.xyzd50ToLab(...self.#toXyzd50()), self.alpha),
        ["oklab" ]: (self) => new Oklab(...ColorConverter.xyzd65ToOklab(...ColorConverter.xyzd50ToD65(...self.#toXyzd50())), self.alpha),
        ["srgb" ]: (self) => new ColorFunction("srgb" , ...ColorConverter.xyzd50ToSrgb(...self.#toXyzd50()), self.alpha),
        ["srgb-linear" ]: (self) => new ColorFunction("srgb-linear" , ...ColorConverter.xyzd50TosRGBLinear(...self.#toXyzd50()), self.alpha),
        ["display-p3" ]: (self) => new ColorFunction("display-p3" , ...ColorConverter.xyzd50ToDisplayP3(...self.#toXyzd50()), self.alpha),
        ["display-p3-linear" ]: (self) => new ColorFunction("display-p3-linear" , ...ColorConverter.xyzd50ToDisplayP3Linear(...self.#toXyzd50()), self.alpha),
        ["a98-rgb" ]: (self) => new ColorFunction("a98-rgb" , ...ColorConverter.xyzd50ToAdobeRGB(...self.#toXyzd50()), self.alpha),
        ["prophoto-rgb" ]: (self) => new ColorFunction("prophoto-rgb" , ...ColorConverter.xyzd50ToProPhoto(...self.#toXyzd50()), self.alpha),
        ["rec2020" ]: (self) => new ColorFunction("rec2020" , ...ColorConverter.xyzd50ToRec2020(...self.#toXyzd50()), self.alpha),
        ["xyz" ]: (self) => new ColorFunction("xyz" , ...ColorConverter.xyzd50ToD65(...self.#toXyzd50()), self.alpha),
        ["xyz-d50" ]: (self) => new ColorFunction("xyz-d50" , ...self.#toXyzd50(), self.alpha),
        ["xyz-d65" ]: (self) => new ColorFunction("xyz-d65" , ...ColorConverter.xyzd50ToD65(...self.#toXyzd50()), self.alpha),
    };
    #toXyzd50() {
        const [r, g, b] = this.#rgba;
        return ColorConverter.srgbToXyzd50(r, g, b);
    }
    get alpha() {
        switch (this.format()) {
            case "hexa" :
            case "rgba" :
                return this.#rgba[3];
            default:
                return null;
        }
    }
    asLegacyColor() {
        return this;
    }
    nickname() {
        const nickname = RGBAToNickname.get(String(this.canonicalRGBA()));
        return nickname ? new Nickname(nickname, this) : null;
    }
    shortHex() {
        for (let i = 0; i < 4; ++i) {
            const c = Math.round(this.#rgba[i] * 255);
            if (c % 0x11) {
                return null;
            }
        }
        return new ShortHex(this);
    }
    constructor(rgba, format, authoredText) {
        this.#authoredText = authoredText || null;
        this.#format = format;
        this.#rawParams = [rgba[0], rgba[1], rgba[2]];
        this.#rgba = [
            clamp(rgba[0], { min: 0, max: 1 }),
            clamp(rgba[1], { min: 0, max: 1 }),
            clamp(rgba[2], { min: 0, max: 1 }),
            clamp(rgba[3] ?? 1, { min: 0, max: 1 }),
        ];
    }
    static fromHex(hex, text) {
        hex = hex.toLowerCase();
        const hasAlpha = hex.length === 4 || hex.length === 8;
        const format = hasAlpha ? "hexa"  : "hex" ;
        const isShort = hex.length <= 4;
        if (isShort) {
            hex = hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2) +
                hex.charAt(3) + hex.charAt(3);
        }
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        let a = 1;
        if (hex.length === 8) {
            a = parseInt(hex.substring(6, 8), 16) / 255;
        }
        const color = new Legacy([r / 255, g / 255, b / 255, a], format, text);
        return isShort ? new ShortHex(color) : color;
    }
    static fromRGBAFunction(r, g, b, alpha, text) {
        const rgba = [
            parseRgbNumeric(r),
            parseRgbNumeric(g),
            parseRgbNumeric(b),
            alpha ? parseAlphaNumeric(alpha) : 1,
        ];
        if (!arrayDoesNotContainNullOrUndefined(rgba)) {
            return null;
        }
        return new Legacy(rgba, alpha ? "rgba"  : "rgb" , text);
    }
    static fromRGBA(rgba, authoredText) {
        return new Legacy([rgba[0] / 255, rgba[1] / 255, rgba[2] / 255, rgba[3]], "rgba" , authoredText);
    }
    static fromHSVA(hsva) {
        const rgba = hsva2rgba(hsva);
        return new Legacy(rgba, "rgba" );
    }
    is(format) {
        return format === this.format();
    }
    as(format) {
        if (format === this.format()) {
            return this;
        }
        return Legacy.#conversions[format](this);
    }
    format() {
        return this.#format;
    }
    hasAlpha() {
        return this.#rgba[3] !== 1;
    }
    detectHEXFormat() {
        const hasAlpha = this.hasAlpha();
        return hasAlpha ? "hexa"  : "hex" ;
    }
    asString(format) {
        if (format) {
            return this.as(format).asString();
        }
        return this.#stringify(format, this.#rgba[0], this.#rgba[1], this.#rgba[2]);
    }
    #stringify(format, r, g, b) {
        if (!format) {
            format = this.#format;
        }
        function toHexValue(value) {
            const hex = Math.round(value * 255).toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        }
        switch (format) {
            case "rgb" :
            case "rgba" : {
                const start = sprintf('rgb(%d %d %d', toRgbValue(r), toRgbValue(g), toRgbValue(b));
                if (this.hasAlpha()) {
                    return start + sprintf(' / %d%)', Math.round(this.#rgba[3] * 100));
                }
                return start + ')';
            }
            case "hex" :
            case "hexa" : {
                if (this.hasAlpha()) {
                    return sprintf('#%s%s%s%s', toHexValue(r), toHexValue(g), toHexValue(b), toHexValue(this.#rgba[3]))
                        .toLowerCase();
                }
                return sprintf('#%s%s%s', toHexValue(r), toHexValue(g), toHexValue(b)).toLowerCase();
            }
        }
    }
    getAuthoredText() {
        return this.#authoredText ?? null;
    }
    getRawParameters() {
        return [...this.#rawParams];
    }
    getAsRawString(format) {
        if (format) {
            return this.as(format).getAsRawString();
        }
        return this.#stringify(format, ...this.#rawParams);
    }
    isGamutClipped() {
        return !equals(this.#rawParams.map(toRgbValue), [this.#rgba[0], this.#rgba[1], this.#rgba[2]].map(toRgbValue), WIDE_RANGE_EPSILON);
    }
    rgba() {
        return [...this.#rgba];
    }
    canonicalRGBA() {
        const rgba = new Array(4);
        for (let i = 0; i < 3; ++i) {
            rgba[i] = Math.round(this.#rgba[i] * 255);
        }
        rgba[3] = this.#rgba[3];
        return rgba;
    }
    toProtocolRGBA() {
        const rgba = this.canonicalRGBA();
        const result = { r: rgba[0], g: rgba[1], b: rgba[2] };
        if (rgba[3] !== 1) {
            result.a = rgba[3];
        }
        return result;
    }
    invert() {
        const rgba = [0, 0, 0, 0];
        rgba[0] = 1 - this.#rgba[0];
        rgba[1] = 1 - this.#rgba[1];
        rgba[2] = 1 - this.#rgba[2];
        rgba[3] = this.#rgba[3];
        return new Legacy(rgba, "rgba" );
    }
    grayscale() {
        const [r, g, b] = this.#rgba;
        const gray = r * 0.299 + g * 0.587 + b * 0.114;
        return new Legacy([gray, gray, gray, 0.5], "rgba" );
    }
    setAlpha(alpha) {
        const rgba = [...this.#rgba];
        rgba[3] = alpha;
        return new Legacy(rgba, "rgba" );
    }
    blendWith(fgColor) {
        const rgba = blendColors(fgColor.#rgba, this.#rgba);
        return new Legacy(rgba, "rgba" );
    }
    blendWithAlpha(alpha) {
        const rgba = [...this.#rgba];
        rgba[3] *= alpha;
        return new Legacy(rgba, "rgba" );
    }
    setFormat(format) {
        this.#format = format;
    }
    equal(other) {
        const legacy = other.as(this.#format);
        return equals(toRgbValue(this.#rgba[0]), toRgbValue(legacy.#rgba[0]), WIDE_RANGE_EPSILON) &&
            equals(toRgbValue(this.#rgba[1]), toRgbValue(legacy.#rgba[1]), WIDE_RANGE_EPSILON) &&
            equals(toRgbValue(this.#rgba[2]), toRgbValue(legacy.#rgba[2]), WIDE_RANGE_EPSILON) &&
            equals(this.#rgba[3], legacy.#rgba[3]);
    }
}
const COLOR_TO_RGBA_ENTRIES = [
    ['aliceblue', [240, 248, 255]],
    ['antiquewhite', [250, 235, 215]],
    ['aqua', [0, 255, 255]],
    ['aquamarine', [127, 255, 212]],
    ['azure', [240, 255, 255]],
    ['beige', [245, 245, 220]],
    ['bisque', [255, 228, 196]],
    ['black', [0, 0, 0]],
    ['blanchedalmond', [255, 235, 205]],
    ['blue', [0, 0, 255]],
    ['blueviolet', [138, 43, 226]],
    ['brown', [165, 42, 42]],
    ['burlywood', [222, 184, 135]],
    ['cadetblue', [95, 158, 160]],
    ['chartreuse', [127, 255, 0]],
    ['chocolate', [210, 105, 30]],
    ['coral', [255, 127, 80]],
    ['cornflowerblue', [100, 149, 237]],
    ['cornsilk', [255, 248, 220]],
    ['crimson', [237, 20, 61]],
    ['cyan', [0, 255, 255]],
    ['darkblue', [0, 0, 139]],
    ['darkcyan', [0, 139, 139]],
    ['darkgoldenrod', [184, 134, 11]],
    ['darkgray', [169, 169, 169]],
    ['darkgrey', [169, 169, 169]],
    ['darkgreen', [0, 100, 0]],
    ['darkkhaki', [189, 183, 107]],
    ['darkmagenta', [139, 0, 139]],
    ['darkolivegreen', [85, 107, 47]],
    ['darkorange', [255, 140, 0]],
    ['darkorchid', [153, 50, 204]],
    ['darkred', [139, 0, 0]],
    ['darksalmon', [233, 150, 122]],
    ['darkseagreen', [143, 188, 143]],
    ['darkslateblue', [72, 61, 139]],
    ['darkslategray', [47, 79, 79]],
    ['darkslategrey', [47, 79, 79]],
    ['darkturquoise', [0, 206, 209]],
    ['darkviolet', [148, 0, 211]],
    ['deeppink', [255, 20, 147]],
    ['deepskyblue', [0, 191, 255]],
    ['dimgray', [105, 105, 105]],
    ['dimgrey', [105, 105, 105]],
    ['dodgerblue', [30, 144, 255]],
    ['firebrick', [178, 34, 34]],
    ['floralwhite', [255, 250, 240]],
    ['forestgreen', [34, 139, 34]],
    ['fuchsia', [255, 0, 255]],
    ['gainsboro', [220, 220, 220]],
    ['ghostwhite', [248, 248, 255]],
    ['gold', [255, 215, 0]],
    ['goldenrod', [218, 165, 32]],
    ['gray', [128, 128, 128]],
    ['grey', [128, 128, 128]],
    ['green', [0, 128, 0]],
    ['greenyellow', [173, 255, 47]],
    ['honeydew', [240, 255, 240]],
    ['hotpink', [255, 105, 180]],
    ['indianred', [205, 92, 92]],
    ['indigo', [75, 0, 130]],
    ['ivory', [255, 255, 240]],
    ['khaki', [240, 230, 140]],
    ['lavender', [230, 230, 250]],
    ['lavenderblush', [255, 240, 245]],
    ['lawngreen', [124, 252, 0]],
    ['lemonchiffon', [255, 250, 205]],
    ['lightblue', [173, 216, 230]],
    ['lightcoral', [240, 128, 128]],
    ['lightcyan', [224, 255, 255]],
    ['lightgoldenrodyellow', [250, 250, 210]],
    ['lightgreen', [144, 238, 144]],
    ['lightgray', [211, 211, 211]],
    ['lightgrey', [211, 211, 211]],
    ['lightpink', [255, 182, 193]],
    ['lightsalmon', [255, 160, 122]],
    ['lightseagreen', [32, 178, 170]],
    ['lightskyblue', [135, 206, 250]],
    ['lightslategray', [119, 136, 153]],
    ['lightslategrey', [119, 136, 153]],
    ['lightsteelblue', [176, 196, 222]],
    ['lightyellow', [255, 255, 224]],
    ['lime', [0, 255, 0]],
    ['limegreen', [50, 205, 50]],
    ['linen', [250, 240, 230]],
    ['magenta', [255, 0, 255]],
    ['maroon', [128, 0, 0]],
    ['mediumaquamarine', [102, 205, 170]],
    ['mediumblue', [0, 0, 205]],
    ['mediumorchid', [186, 85, 211]],
    ['mediumpurple', [147, 112, 219]],
    ['mediumseagreen', [60, 179, 113]],
    ['mediumslateblue', [123, 104, 238]],
    ['mediumspringgreen', [0, 250, 154]],
    ['mediumturquoise', [72, 209, 204]],
    ['mediumvioletred', [199, 21, 133]],
    ['midnightblue', [25, 25, 112]],
    ['mintcream', [245, 255, 250]],
    ['mistyrose', [255, 228, 225]],
    ['moccasin', [255, 228, 181]],
    ['navajowhite', [255, 222, 173]],
    ['navy', [0, 0, 128]],
    ['oldlace', [253, 245, 230]],
    ['olive', [128, 128, 0]],
    ['olivedrab', [107, 142, 35]],
    ['orange', [255, 165, 0]],
    ['orangered', [255, 69, 0]],
    ['orchid', [218, 112, 214]],
    ['palegoldenrod', [238, 232, 170]],
    ['palegreen', [152, 251, 152]],
    ['paleturquoise', [175, 238, 238]],
    ['palevioletred', [219, 112, 147]],
    ['papayawhip', [255, 239, 213]],
    ['peachpuff', [255, 218, 185]],
    ['peru', [205, 133, 63]],
    ['pink', [255, 192, 203]],
    ['plum', [221, 160, 221]],
    ['powderblue', [176, 224, 230]],
    ['purple', [128, 0, 128]],
    ['rebeccapurple', [102, 51, 153]],
    ['red', [255, 0, 0]],
    ['rosybrown', [188, 143, 143]],
    ['royalblue', [65, 105, 225]],
    ['saddlebrown', [139, 69, 19]],
    ['salmon', [250, 128, 114]],
    ['sandybrown', [244, 164, 96]],
    ['seagreen', [46, 139, 87]],
    ['seashell', [255, 245, 238]],
    ['sienna', [160, 82, 45]],
    ['silver', [192, 192, 192]],
    ['skyblue', [135, 206, 235]],
    ['slateblue', [106, 90, 205]],
    ['slategray', [112, 128, 144]],
    ['slategrey', [112, 128, 144]],
    ['snow', [255, 250, 250]],
    ['springgreen', [0, 255, 127]],
    ['steelblue', [70, 130, 180]],
    ['tan', [210, 180, 140]],
    ['teal', [0, 128, 128]],
    ['thistle', [216, 191, 216]],
    ['tomato', [255, 99, 71]],
    ['turquoise', [64, 224, 208]],
    ['violet', [238, 130, 238]],
    ['wheat', [245, 222, 179]],
    ['white', [255, 255, 255]],
    ['whitesmoke', [245, 245, 245]],
    ['yellow', [255, 255, 0]],
    ['yellowgreen', [154, 205, 50]],
    ['transparent', [0, 0, 0, 0]],
];
console.assert(COLOR_TO_RGBA_ENTRIES.every(([nickname]) => nickname.toLowerCase() === nickname), 'All color nicknames must be lowercase.');
const Nicknames = new Map(COLOR_TO_RGBA_ENTRIES);
const RGBAToNickname = new Map(
COLOR_TO_RGBA_ENTRIES.map(([nickname, [r, g, b, a = 1]]) => {
    return [String([r, g, b, a]), nickname];
}));
const LAYOUT_LINES_HIGHLIGHT_COLOR = [127, 32, 210];
({
    Content: Legacy.fromRGBA([111, 168, 220, .66]),
    ContentLight: Legacy.fromRGBA([111, 168, 220, .5]),
    ContentOutline: Legacy.fromRGBA([9, 83, 148]),
    Padding: Legacy.fromRGBA([147, 196, 125, .55]),
    PaddingLight: Legacy.fromRGBA([147, 196, 125, .4]),
    Border: Legacy.fromRGBA([255, 229, 153, .66]),
    BorderLight: Legacy.fromRGBA([255, 229, 153, .5]),
    Margin: Legacy.fromRGBA([246, 178, 107, .66]),
    MarginLight: Legacy.fromRGBA([246, 178, 107, .5]),
    EventTarget: Legacy.fromRGBA([255, 196, 196, .66]),
    Shape: Legacy.fromRGBA([96, 82, 177, 0.8]),
    ShapeMargin: Legacy.fromRGBA([96, 82, 127, .6]),
    CssGrid: Legacy.fromRGBA([0x4b, 0, 0x82, 1]),
    LayoutLine: Legacy.fromRGBA([...LAYOUT_LINES_HIGHLIGHT_COLOR, 1]),
    GridBorder: Legacy.fromRGBA([...LAYOUT_LINES_HIGHLIGHT_COLOR, 1]),
    GapBackground: Legacy.fromRGBA([...LAYOUT_LINES_HIGHLIGHT_COLOR, .3]),
    GapHatch: Legacy.fromRGBA([...LAYOUT_LINES_HIGHLIGHT_COLOR, .8]),
    GridAreaBorder: Legacy.fromRGBA([26, 115, 232, 1]),
    AnchorIMCB: Legacy.fromRGBA([127, 32, 210, 1]),
    AnchorIMCBBackground: Legacy.fromRGBA([127, 32, 210, 0.15]),
    AnchorInsetsBackground: Legacy.fromRGBA([246, 178, 107, 0.25]),
    AnchorInsetsHatch: Legacy.fromRGBA([246, 178, 107, 0.8]),
    AnchorTarget: Legacy.fromRGBA([26, 115, 232, 1]),
    AnchorTargetBackground: Legacy.fromRGBA([26, 115, 232, 0.15]),
});
({
    ParentOutline: Legacy.fromRGBA([224, 90, 183, 1]),
    ChildOutline: Legacy.fromRGBA([0, 120, 212, 1]),
});
({
    Resizer: Legacy.fromRGBA([222, 225, 230, 1]),
    ResizerHandle: Legacy.fromRGBA([166, 166, 166, 1]),
    Mask: Legacy.fromRGBA([248, 249, 249, 1]),
});

// Copyright 2026 The Chromium Authors
var ExperimentName;
(function (ExperimentName) {
    ExperimentName["ALL"] = "*";
    ExperimentName["PROTOCOL_MONITOR"] = "protocol-monitor";
    ExperimentName["INSTRUMENTATION_BREAKPOINTS"] = "instrumentation-breakpoints";
    ExperimentName["DURABLE_MESSAGES"] = "durable-messages";
    ExperimentName["JPEG_XL"] = "jpeg-xl";
    ExperimentName["PLUS_BUTTON"] = "plus-button";
    ExperimentName["SOURCE_MAP_SCOPES_IN_SOURCES_PANEL"] = "source-map-scopes-in-sources-panel";
})(ExperimentName || (ExperimentName = {}));

// Copyright 2021 The Chromium Authors
class ObjectWrapper {
    listeners;
    addEventListener(eventType, listener, thisObject) {
        if (!this.listeners) {
            this.listeners = new Map();
        }
        let listenersForEventType = this.listeners.get(eventType);
        if (!listenersForEventType) {
            listenersForEventType = new Set();
            this.listeners.set(eventType, listenersForEventType);
        }
        listenersForEventType.add({ thisObject, listener });
        return { eventTarget: this, eventType, thisObject, listener };
    }
    once(eventType) {
        return new Promise(resolve => {
            const descriptor = this.addEventListener(eventType, event => {
                this.removeEventListener(eventType, descriptor.listener);
                resolve(event.data);
            });
        });
    }
    removeEventListener(eventType, listener, thisObject) {
        const listeners = this.listeners?.get(eventType);
        if (!listeners) {
            return;
        }
        for (const listenerTuple of listeners) {
            if (listenerTuple.listener === listener && listenerTuple.thisObject === thisObject) {
                listenerTuple.disposed = true;
                listeners.delete(listenerTuple);
            }
        }
        if (!listeners.size) {
            this.listeners?.delete(eventType);
        }
    }
    hasEventListeners(eventType) {
        return Boolean(this.listeners?.has(eventType));
    }
    dispatchEventToListeners(eventType, ...[eventData]) {
        const listeners = this.listeners?.get(eventType);
        if (!listeners) {
            return;
        }
        const event = { data: eventData, source: this };
        for (const listener of [...listeners]) {
            if (!listener.disposed) {
                try {
                    listener.listener.call(listener.thisObject, event);
                }
                catch (err) {
                    console.error(`Event listener for ${String(eventType)} throw an error:`, err);
                }
            }
        }
    }
}

// Copyright 2021 The Chromium Authors
let devToolsLocaleInstance = null;
class DevToolsLocale {
    locale;
    lookupClosestDevToolsLocale;
    constructor(data) {
        this.lookupClosestDevToolsLocale = data.lookupClosestDevToolsLocale;
        if (data.settingLanguage === 'browserLanguage') {
            this.locale = data.navigatorLanguage || 'en-US';
        }
        else {
            this.locale = data.settingLanguage;
        }
        this.locale = this.lookupClosestDevToolsLocale(this.locale);
    }
    static instance(opts = { create: false }) {
        if (!devToolsLocaleInstance && !opts.create) {
            throw new Error('No LanguageSelector instance exists yet.');
        }
        if (opts.create) {
            devToolsLocaleInstance = new DevToolsLocale(opts.data);
        }
        return devToolsLocaleInstance;
    }
    static removeInstance() {
        devToolsLocaleInstance = null;
    }
    forceFallbackLocale() {
        this.locale = 'en-US';
    }
    languageIsSupportedByDevTools(localeString) {
        return localeLanguagesMatch(localeString, this.lookupClosestDevToolsLocale(localeString));
    }
}
function localeLanguagesMatch(localeString1, localeString2) {
    const locale1 = new Intl.Locale(localeString1);
    const locale2 = new Intl.Locale(localeString2);
    return locale1.language === locale2.language;
}

var __assign = function () {
    __assign = Object.assign || function __assign2(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s)
                if (Object.prototype.hasOwnProperty.call(s, p))
                    t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var ErrorKind;
(function (ErrorKind2) {
    ErrorKind2[ErrorKind2["EXPECT_ARGUMENT_CLOSING_BRACE"] = 1] = "EXPECT_ARGUMENT_CLOSING_BRACE";
    ErrorKind2[ErrorKind2["EMPTY_ARGUMENT"] = 2] = "EMPTY_ARGUMENT";
    ErrorKind2[ErrorKind2["MALFORMED_ARGUMENT"] = 3] = "MALFORMED_ARGUMENT";
    ErrorKind2[ErrorKind2["EXPECT_ARGUMENT_TYPE"] = 4] = "EXPECT_ARGUMENT_TYPE";
    ErrorKind2[ErrorKind2["INVALID_ARGUMENT_TYPE"] = 5] = "INVALID_ARGUMENT_TYPE";
    ErrorKind2[ErrorKind2["EXPECT_ARGUMENT_STYLE"] = 6] = "EXPECT_ARGUMENT_STYLE";
    ErrorKind2[ErrorKind2["INVALID_NUMBER_SKELETON"] = 7] = "INVALID_NUMBER_SKELETON";
    ErrorKind2[ErrorKind2["INVALID_DATE_TIME_SKELETON"] = 8] = "INVALID_DATE_TIME_SKELETON";
    ErrorKind2[ErrorKind2["EXPECT_NUMBER_SKELETON"] = 9] = "EXPECT_NUMBER_SKELETON";
    ErrorKind2[ErrorKind2["EXPECT_DATE_TIME_SKELETON"] = 10] = "EXPECT_DATE_TIME_SKELETON";
    ErrorKind2[ErrorKind2["UNCLOSED_QUOTE_IN_ARGUMENT_STYLE"] = 11] = "UNCLOSED_QUOTE_IN_ARGUMENT_STYLE";
    ErrorKind2[ErrorKind2["EXPECT_SELECT_ARGUMENT_OPTIONS"] = 12] = "EXPECT_SELECT_ARGUMENT_OPTIONS";
    ErrorKind2[ErrorKind2["EXPECT_PLURAL_ARGUMENT_OFFSET_VALUE"] = 13] = "EXPECT_PLURAL_ARGUMENT_OFFSET_VALUE";
    ErrorKind2[ErrorKind2["INVALID_PLURAL_ARGUMENT_OFFSET_VALUE"] = 14] = "INVALID_PLURAL_ARGUMENT_OFFSET_VALUE";
    ErrorKind2[ErrorKind2["EXPECT_SELECT_ARGUMENT_SELECTOR"] = 15] = "EXPECT_SELECT_ARGUMENT_SELECTOR";
    ErrorKind2[ErrorKind2["EXPECT_PLURAL_ARGUMENT_SELECTOR"] = 16] = "EXPECT_PLURAL_ARGUMENT_SELECTOR";
    ErrorKind2[ErrorKind2["EXPECT_SELECT_ARGUMENT_SELECTOR_FRAGMENT"] = 17] = "EXPECT_SELECT_ARGUMENT_SELECTOR_FRAGMENT";
    ErrorKind2[ErrorKind2["EXPECT_PLURAL_ARGUMENT_SELECTOR_FRAGMENT"] = 18] = "EXPECT_PLURAL_ARGUMENT_SELECTOR_FRAGMENT";
    ErrorKind2[ErrorKind2["INVALID_PLURAL_ARGUMENT_SELECTOR"] = 19] = "INVALID_PLURAL_ARGUMENT_SELECTOR";
    ErrorKind2[ErrorKind2["DUPLICATE_PLURAL_ARGUMENT_SELECTOR"] = 20] = "DUPLICATE_PLURAL_ARGUMENT_SELECTOR";
    ErrorKind2[ErrorKind2["DUPLICATE_SELECT_ARGUMENT_SELECTOR"] = 21] = "DUPLICATE_SELECT_ARGUMENT_SELECTOR";
    ErrorKind2[ErrorKind2["MISSING_OTHER_CLAUSE"] = 22] = "MISSING_OTHER_CLAUSE";
    ErrorKind2[ErrorKind2["INVALID_TAG"] = 23] = "INVALID_TAG";
    ErrorKind2[ErrorKind2["INVALID_TAG_NAME"] = 25] = "INVALID_TAG_NAME";
    ErrorKind2[ErrorKind2["UNMATCHED_CLOSING_TAG"] = 26] = "UNMATCHED_CLOSING_TAG";
    ErrorKind2[ErrorKind2["UNCLOSED_TAG"] = 27] = "UNCLOSED_TAG";
})(ErrorKind || (ErrorKind = {}));
var TYPE;
(function (TYPE2) {
    TYPE2[TYPE2["literal"] = 0] = "literal";
    TYPE2[TYPE2["argument"] = 1] = "argument";
    TYPE2[TYPE2["number"] = 2] = "number";
    TYPE2[TYPE2["date"] = 3] = "date";
    TYPE2[TYPE2["time"] = 4] = "time";
    TYPE2[TYPE2["select"] = 5] = "select";
    TYPE2[TYPE2["plural"] = 6] = "plural";
    TYPE2[TYPE2["pound"] = 7] = "pound";
    TYPE2[TYPE2["tag"] = 8] = "tag";
})(TYPE || (TYPE = {}));
var SKELETON_TYPE;
(function (SKELETON_TYPE2) {
    SKELETON_TYPE2[SKELETON_TYPE2["number"] = 0] = "number";
    SKELETON_TYPE2[SKELETON_TYPE2["dateTime"] = 1] = "dateTime";
})(SKELETON_TYPE || (SKELETON_TYPE = {}));
function isLiteralElement(el) {
    return el.type === TYPE.literal;
}
function isArgumentElement(el) {
    return el.type === TYPE.argument;
}
function isNumberElement(el) {
    return el.type === TYPE.number;
}
function isDateElement(el) {
    return el.type === TYPE.date;
}
function isTimeElement(el) {
    return el.type === TYPE.time;
}
function isSelectElement(el) {
    return el.type === TYPE.select;
}
function isPluralElement(el) {
    return el.type === TYPE.plural;
}
function isPoundElement(el) {
    return el.type === TYPE.pound;
}
function isTagElement(el) {
    return el.type === TYPE.tag;
}
function isNumberSkeleton(el) {
    return !!(el && typeof el === "object" && el.type === SKELETON_TYPE.number);
}
function isDateTimeSkeleton(el) {
    return !!(el && typeof el === "object" && el.type === SKELETON_TYPE.dateTime);
}
var SPACE_SEPARATOR_REGEX = /[ \xA0\u1680\u2000-\u200A\u202F\u205F\u3000]/;
var DATE_TIME_REGEX = /(?:[Eec]{1,6}|G{1,5}|[Qq]{1,5}|(?:[yYur]+|U{1,5})|[ML]{1,5}|d{1,2}|D{1,3}|F{1}|[abB]{1,5}|[hkHK]{1,2}|w{1,2}|W{1}|m{1,2}|s{1,2}|[zZOvVxX]{1,4})(?=([^']*'[^']*')*[^']*$)/g;
function parseDateTimeSkeleton(skeleton) {
    var result = {};
    skeleton.replace(DATE_TIME_REGEX, function (match) {
        var len = match.length;
        switch (match[0]) {
            case "G":
                result.era = len === 4 ? "long" : len === 5 ? "narrow" : "short";
                break;
            case "y":
                result.year = len === 2 ? "2-digit" : "numeric";
                break;
            case "Y":
            case "u":
            case "U":
            case "r":
                throw new RangeError("`Y/u/U/r` (year) patterns are not supported, use `y` instead");
            case "q":
            case "Q":
                throw new RangeError("`q/Q` (quarter) patterns are not supported");
            case "M":
            case "L":
                result.month = ["numeric", "2-digit", "short", "long", "narrow"][len - 1];
                break;
            case "w":
            case "W":
                throw new RangeError("`w/W` (week) patterns are not supported");
            case "d":
                result.day = ["numeric", "2-digit"][len - 1];
                break;
            case "D":
            case "F":
            case "g":
                throw new RangeError("`D/F/g` (day) patterns are not supported, use `d` instead");
            case "E":
                result.weekday = len === 4 ? "short" : len === 5 ? "narrow" : "short";
                break;
            case "e":
                if (len < 4) {
                    throw new RangeError("`e..eee` (weekday) patterns are not supported");
                }
                result.weekday = ["short", "long", "narrow", "short"][len - 4];
                break;
            case "c":
                if (len < 4) {
                    throw new RangeError("`c..ccc` (weekday) patterns are not supported");
                }
                result.weekday = ["short", "long", "narrow", "short"][len - 4];
                break;
            case "a":
                result.hour12 = true;
                break;
            case "b":
            case "B":
                throw new RangeError("`b/B` (period) patterns are not supported, use `a` instead");
            case "h":
                result.hourCycle = "h12";
                result.hour = ["numeric", "2-digit"][len - 1];
                break;
            case "H":
                result.hourCycle = "h23";
                result.hour = ["numeric", "2-digit"][len - 1];
                break;
            case "K":
                result.hourCycle = "h11";
                result.hour = ["numeric", "2-digit"][len - 1];
                break;
            case "k":
                result.hourCycle = "h24";
                result.hour = ["numeric", "2-digit"][len - 1];
                break;
            case "j":
            case "J":
            case "C":
                throw new RangeError("`j/J/C` (hour) patterns are not supported, use `h/H/K/k` instead");
            case "m":
                result.minute = ["numeric", "2-digit"][len - 1];
                break;
            case "s":
                result.second = ["numeric", "2-digit"][len - 1];
                break;
            case "S":
            case "A":
                throw new RangeError("`S/A` (second) patterns are not supported, use `s` instead");
            case "z":
                result.timeZoneName = len < 4 ? "short" : "long";
                break;
            case "Z":
            case "O":
            case "v":
            case "V":
            case "X":
            case "x":
                throw new RangeError("`Z/O/v/V/X/x` (timeZone) patterns are not supported, use `z` instead");
        }
        return "";
    });
    return result;
}
var WHITE_SPACE_REGEX = /[\t-\r \x85\u200E\u200F\u2028\u2029]/i;
function parseNumberSkeletonFromString(skeleton) {
    if (skeleton.length === 0) {
        throw new Error("Number skeleton cannot be empty");
    }
    var stringTokens = skeleton.split(WHITE_SPACE_REGEX).filter(function (x) {
        return x.length > 0;
    });
    var tokens = [];
    for (var _i = 0, stringTokens_1 = stringTokens; _i < stringTokens_1.length; _i++) {
        var stringToken = stringTokens_1[_i];
        var stemAndOptions = stringToken.split("/");
        if (stemAndOptions.length === 0) {
            throw new Error("Invalid number skeleton");
        }
        var stem = stemAndOptions[0], options = stemAndOptions.slice(1);
        for (var _a2 = 0, options_1 = options; _a2 < options_1.length; _a2++) {
            var option = options_1[_a2];
            if (option.length === 0) {
                throw new Error("Invalid number skeleton");
            }
        }
        tokens.push({ stem, options });
    }
    return tokens;
}
function icuUnitToEcma(unit) {
    return unit.replace(/^(.*?)-/, "");
}
var FRACTION_PRECISION_REGEX = /^\.(?:(0+)(\*)?|(#+)|(0+)(#+))$/g;
var SIGNIFICANT_PRECISION_REGEX = /^(@+)?(\+|#+)?$/g;
var INTEGER_WIDTH_REGEX = /(\*)(0+)|(#+)(0+)|(0+)/g;
var CONCISE_INTEGER_WIDTH_REGEX = /^(0+)$/;
function parseSignificantPrecision(str) {
    var result = {};
    str.replace(SIGNIFICANT_PRECISION_REGEX, function (_, g1, g2) {
        if (typeof g2 !== "string") {
            result.minimumSignificantDigits = g1.length;
            result.maximumSignificantDigits = g1.length;
        }
        else if (g2 === "+") {
            result.minimumSignificantDigits = g1.length;
        }
        else if (g1[0] === "#") {
            result.maximumSignificantDigits = g1.length;
        }
        else {
            result.minimumSignificantDigits = g1.length;
            result.maximumSignificantDigits = g1.length + (typeof g2 === "string" ? g2.length : 0);
        }
        return "";
    });
    return result;
}
function parseSign(str) {
    switch (str) {
        case "sign-auto":
            return {
                signDisplay: "auto"
            };
        case "sign-accounting":
        case "()":
            return {
                currencySign: "accounting"
            };
        case "sign-always":
        case "+!":
            return {
                signDisplay: "always"
            };
        case "sign-accounting-always":
        case "()!":
            return {
                signDisplay: "always",
                currencySign: "accounting"
            };
        case "sign-except-zero":
        case "+?":
            return {
                signDisplay: "exceptZero"
            };
        case "sign-accounting-except-zero":
        case "()?":
            return {
                signDisplay: "exceptZero",
                currencySign: "accounting"
            };
        case "sign-never":
        case "+_":
            return {
                signDisplay: "never"
            };
    }
}
function parseConciseScientificAndEngineeringStem(stem) {
    var result;
    if (stem[0] === "E" && stem[1] === "E") {
        result = {
            notation: "engineering"
        };
        stem = stem.slice(2);
    }
    else if (stem[0] === "E") {
        result = {
            notation: "scientific"
        };
        stem = stem.slice(1);
    }
    if (result) {
        var signDisplay = stem.slice(0, 2);
        if (signDisplay === "+!") {
            result.signDisplay = "always";
            stem = stem.slice(2);
        }
        else if (signDisplay === "+?") {
            result.signDisplay = "exceptZero";
            stem = stem.slice(2);
        }
        if (!CONCISE_INTEGER_WIDTH_REGEX.test(stem)) {
            throw new Error("Malformed concise eng/scientific notation");
        }
        result.minimumIntegerDigits = stem.length;
    }
    return result;
}
function parseNotationOptions(opt) {
    var result = {};
    var signOpts = parseSign(opt);
    if (signOpts) {
        return signOpts;
    }
    return result;
}
function parseNumberSkeleton(tokens) {
    var result = {};
    for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
        var token = tokens_1[_i];
        switch (token.stem) {
            case "percent":
            case "%":
                result.style = "percent";
                continue;
            case "%x100":
                result.style = "percent";
                result.scale = 100;
                continue;
            case "currency":
                result.style = "currency";
                result.currency = token.options[0];
                continue;
            case "group-off":
            case ",_":
                result.useGrouping = false;
                continue;
            case "precision-integer":
            case ".":
                result.maximumFractionDigits = 0;
                continue;
            case "measure-unit":
            case "unit":
                result.style = "unit";
                result.unit = icuUnitToEcma(token.options[0]);
                continue;
            case "compact-short":
            case "K":
                result.notation = "compact";
                result.compactDisplay = "short";
                continue;
            case "compact-long":
            case "KK":
                result.notation = "compact";
                result.compactDisplay = "long";
                continue;
            case "scientific":
                result = __assign(__assign(__assign({}, result), { notation: "scientific" }), token.options.reduce(function (all, opt) {
                    return __assign(__assign({}, all), parseNotationOptions(opt));
                }, {}));
                continue;
            case "engineering":
                result = __assign(__assign(__assign({}, result), { notation: "engineering" }), token.options.reduce(function (all, opt) {
                    return __assign(__assign({}, all), parseNotationOptions(opt));
                }, {}));
                continue;
            case "notation-simple":
                result.notation = "standard";
                continue;
            case "unit-width-narrow":
                result.currencyDisplay = "narrowSymbol";
                result.unitDisplay = "narrow";
                continue;
            case "unit-width-short":
                result.currencyDisplay = "code";
                result.unitDisplay = "short";
                continue;
            case "unit-width-full-name":
                result.currencyDisplay = "name";
                result.unitDisplay = "long";
                continue;
            case "unit-width-iso-code":
                result.currencyDisplay = "symbol";
                continue;
            case "scale":
                result.scale = parseFloat(token.options[0]);
                continue;
            case "integer-width":
                if (token.options.length > 1) {
                    throw new RangeError("integer-width stems only accept a single optional option");
                }
                token.options[0].replace(INTEGER_WIDTH_REGEX, function (_, g1, g2, g3, g4, g5) {
                    if (g1) {
                        result.minimumIntegerDigits = g2.length;
                    }
                    else if (g3 && g4) {
                        throw new Error("We currently do not support maximum integer digits");
                    }
                    else if (g5) {
                        throw new Error("We currently do not support exact integer digits");
                    }
                    return "";
                });
                continue;
        }
        if (CONCISE_INTEGER_WIDTH_REGEX.test(token.stem)) {
            result.minimumIntegerDigits = token.stem.length;
            continue;
        }
        if (FRACTION_PRECISION_REGEX.test(token.stem)) {
            if (token.options.length > 1) {
                throw new RangeError("Fraction-precision stems only accept a single optional option");
            }
            token.stem.replace(FRACTION_PRECISION_REGEX, function (_, g1, g2, g3, g4, g5) {
                if (g2 === "*") {
                    result.minimumFractionDigits = g1.length;
                }
                else if (g3 && g3[0] === "#") {
                    result.maximumFractionDigits = g3.length;
                }
                else if (g4 && g5) {
                    result.minimumFractionDigits = g4.length;
                    result.maximumFractionDigits = g4.length + g5.length;
                }
                else {
                    result.minimumFractionDigits = g1.length;
                    result.maximumFractionDigits = g1.length;
                }
                return "";
            });
            if (token.options.length) {
                result = __assign(__assign({}, result), parseSignificantPrecision(token.options[0]));
            }
            continue;
        }
        if (SIGNIFICANT_PRECISION_REGEX.test(token.stem)) {
            result = __assign(__assign({}, result), parseSignificantPrecision(token.stem));
            continue;
        }
        var signOpts = parseSign(token.stem);
        if (signOpts) {
            result = __assign(__assign({}, result), signOpts);
        }
        var conciseScientificAndEngineeringOpts = parseConciseScientificAndEngineeringStem(token.stem);
        if (conciseScientificAndEngineeringOpts) {
            result = __assign(__assign({}, result), conciseScientificAndEngineeringOpts);
        }
    }
    return result;
}
var _a$1;
var SPACE_SEPARATOR_START_REGEX = new RegExp("^" + SPACE_SEPARATOR_REGEX.source + "*");
var SPACE_SEPARATOR_END_REGEX = new RegExp(SPACE_SEPARATOR_REGEX.source + "*$");
function createLocation(start, end) {
    return { start, end };
}
var hasNativeStartsWith = !!String.prototype.startsWith;
var hasNativeFromCodePoint = !!String.fromCodePoint;
var hasNativeFromEntries = !!Object.fromEntries;
var hasNativeCodePointAt = !!String.prototype.codePointAt;
var hasTrimStart = !!String.prototype.trimStart;
var hasTrimEnd = !!String.prototype.trimEnd;
var hasNativeIsSafeInteger = !!Number.isSafeInteger;
var isSafeInteger = hasNativeIsSafeInteger ? Number.isSafeInteger : function (n) {
    return typeof n === "number" && isFinite(n) && Math.floor(n) === n && Math.abs(n) <= 9007199254740991;
};
var REGEX_SUPPORTS_U_AND_Y = true;
try {
    re = RE("([^\\p{White_Space}\\p{Pattern_Syntax}]*)", "yu");
    REGEX_SUPPORTS_U_AND_Y = ((_a$1 = re.exec("a")) === null || _a$1 === void 0 ? void 0 : _a$1[0]) === "a";
}
catch (_) {
    REGEX_SUPPORTS_U_AND_Y = false;
}
var re;
var startsWith = hasNativeStartsWith ? function startsWith2(s, search, position) {
    return s.startsWith(search, position);
} : function startsWith3(s, search, position) {
    return s.slice(position, position + search.length) === search;
};
var fromCodePoint = hasNativeFromCodePoint ? String.fromCodePoint : function fromCodePoint2() {
    var codePoints = [];
    for (var _i = 0; _i < arguments.length; _i++) {
        codePoints[_i] = arguments[_i];
    }
    var elements = "";
    var length = codePoints.length;
    var i = 0;
    var code;
    while (length > i) {
        code = codePoints[i++];
        if (code > 1114111)
            throw RangeError(code + " is not a valid code point");
        elements += code < 65536 ? String.fromCharCode(code) : String.fromCharCode(((code -= 65536) >> 10) + 55296, code % 1024 + 56320);
    }
    return elements;
};
var fromEntries = hasNativeFromEntries ? Object.fromEntries : function fromEntries2(entries) {
    var obj = {};
    for (var _i = 0, entries_1 = entries; _i < entries_1.length; _i++) {
        var _a2 = entries_1[_i], k = _a2[0], v = _a2[1];
        obj[k] = v;
    }
    return obj;
};
var codePointAt = hasNativeCodePointAt ? function codePointAt2(s, index) {
    return s.codePointAt(index);
} : function codePointAt3(s, index) {
    var size = s.length;
    if (index < 0 || index >= size) {
        return void 0;
    }
    var first = s.charCodeAt(index);
    var second;
    return first < 55296 || first > 56319 || index + 1 === size || (second = s.charCodeAt(index + 1)) < 56320 || second > 57343 ? first : (first - 55296 << 10) + (second - 56320) + 65536;
};
var trimStart = hasTrimStart ? function trimStart2(s) {
    return s.trimStart();
} : function trimStart3(s) {
    return s.replace(SPACE_SEPARATOR_START_REGEX, "");
};
var trimEnd = hasTrimEnd ? function trimEnd2(s) {
    return s.trimEnd();
} : function trimEnd3(s) {
    return s.replace(SPACE_SEPARATOR_END_REGEX, "");
};
function RE(s, flag) {
    return new RegExp(s, flag);
}
var matchIdentifierAtIndex;
if (REGEX_SUPPORTS_U_AND_Y) {
    IDENTIFIER_PREFIX_RE_1 = RE("([^\\p{White_Space}\\p{Pattern_Syntax}]*)", "yu");
    matchIdentifierAtIndex = function matchIdentifierAtIndex2(s, index) {
        var _a2;
        IDENTIFIER_PREFIX_RE_1.lastIndex = index;
        var match = IDENTIFIER_PREFIX_RE_1.exec(s);
        return (_a2 = match[1]) !== null && _a2 !== void 0 ? _a2 : "";
    };
}
else {
    matchIdentifierAtIndex = function matchIdentifierAtIndex2(s, index) {
        var match = [];
        while (true) {
            var c = codePointAt(s, index);
            if (c === void 0 || _isWhiteSpace(c) || _isPatternSyntax(c)) {
                break;
            }
            match.push(c);
            index += c >= 65536 ? 2 : 1;
        }
        return fromCodePoint.apply(void 0, match);
    };
}
var IDENTIFIER_PREFIX_RE_1;
var Parser = function () {
    function Parser2(message, options) {
        if (options === void 0) {
            options = {};
        }
        this.message = message;
        this.position = { offset: 0, line: 1, column: 1 };
        this.ignoreTag = !!options.ignoreTag;
        this.requiresOtherClause = !!options.requiresOtherClause;
        this.shouldParseSkeletons = !!options.shouldParseSkeletons;
    }
    Parser2.prototype.parse = function () {
        if (this.offset() !== 0) {
            throw Error("parser can only be used once");
        }
        return this.parseMessage(0, "", false);
    };
    Parser2.prototype.parseMessage = function (nestingLevel, parentArgType, expectingCloseTag) {
        var elements = [];
        while (!this.isEOF()) {
            var char = this.char();
            if (char === 123) {
                var result = this.parseArgument(nestingLevel, expectingCloseTag);
                if (result.err) {
                    return result;
                }
                elements.push(result.val);
            }
            else if (char === 125 && nestingLevel > 0) {
                break;
            }
            else if (char === 35 && (parentArgType === "plural" || parentArgType === "selectordinal")) {
                var position = this.clonePosition();
                this.bump();
                elements.push({
                    type: TYPE.pound,
                    location: createLocation(position, this.clonePosition())
                });
            }
            else if (char === 60 && !this.ignoreTag && this.peek() === 47) {
                if (expectingCloseTag) {
                    break;
                }
                else {
                    return this.error(ErrorKind.UNMATCHED_CLOSING_TAG, createLocation(this.clonePosition(), this.clonePosition()));
                }
            }
            else if (char === 60 && !this.ignoreTag && _isAlpha(this.peek() || 0)) {
                var result = this.parseTag(nestingLevel, parentArgType);
                if (result.err) {
                    return result;
                }
                elements.push(result.val);
            }
            else {
                var result = this.parseLiteral(nestingLevel, parentArgType);
                if (result.err) {
                    return result;
                }
                elements.push(result.val);
            }
        }
        return { val: elements, err: null };
    };
    Parser2.prototype.parseTag = function (nestingLevel, parentArgType) {
        var startPosition = this.clonePosition();
        this.bump();
        var tagName = this.parseTagName();
        this.bumpSpace();
        if (this.bumpIf("/>")) {
            return {
                val: {
                    type: TYPE.literal,
                    value: "<" + tagName + "/>",
                    location: createLocation(startPosition, this.clonePosition())
                },
                err: null
            };
        }
        else if (this.bumpIf(">")) {
            var childrenResult = this.parseMessage(nestingLevel + 1, parentArgType, true);
            if (childrenResult.err) {
                return childrenResult;
            }
            var children = childrenResult.val;
            var endTagStartPosition = this.clonePosition();
            if (this.bumpIf("</")) {
                if (this.isEOF() || !_isAlpha(this.char())) {
                    return this.error(ErrorKind.INVALID_TAG, createLocation(endTagStartPosition, this.clonePosition()));
                }
                var closingTagNameStartPosition = this.clonePosition();
                var closingTagName = this.parseTagName();
                if (tagName !== closingTagName) {
                    return this.error(ErrorKind.UNMATCHED_CLOSING_TAG, createLocation(closingTagNameStartPosition, this.clonePosition()));
                }
                this.bumpSpace();
                if (!this.bumpIf(">")) {
                    return this.error(ErrorKind.INVALID_TAG, createLocation(endTagStartPosition, this.clonePosition()));
                }
                return {
                    val: {
                        type: TYPE.tag,
                        value: tagName,
                        children,
                        location: createLocation(startPosition, this.clonePosition())
                    },
                    err: null
                };
            }
            else {
                return this.error(ErrorKind.UNCLOSED_TAG, createLocation(startPosition, this.clonePosition()));
            }
        }
        else {
            return this.error(ErrorKind.INVALID_TAG, createLocation(startPosition, this.clonePosition()));
        }
    };
    Parser2.prototype.parseTagName = function () {
        var startOffset = this.offset();
        this.bump();
        while (!this.isEOF() && _isPotentialElementNameChar(this.char())) {
            this.bump();
        }
        return this.message.slice(startOffset, this.offset());
    };
    Parser2.prototype.parseLiteral = function (nestingLevel, parentArgType) {
        var start = this.clonePosition();
        var value = "";
        while (true) {
            var parseQuoteResult = this.tryParseQuote(parentArgType);
            if (parseQuoteResult) {
                value += parseQuoteResult;
                continue;
            }
            var parseUnquotedResult = this.tryParseUnquoted(nestingLevel, parentArgType);
            if (parseUnquotedResult) {
                value += parseUnquotedResult;
                continue;
            }
            var parseLeftAngleResult = this.tryParseLeftAngleBracket();
            if (parseLeftAngleResult) {
                value += parseLeftAngleResult;
                continue;
            }
            break;
        }
        var location = createLocation(start, this.clonePosition());
        return {
            val: { type: TYPE.literal, value, location },
            err: null
        };
    };
    Parser2.prototype.tryParseLeftAngleBracket = function () {
        if (!this.isEOF() && this.char() === 60 && (this.ignoreTag || !_isAlphaOrSlash(this.peek() || 0))) {
            this.bump();
            return "<";
        }
        return null;
    };
    Parser2.prototype.tryParseQuote = function (parentArgType) {
        if (this.isEOF() || this.char() !== 39) {
            return null;
        }
        switch (this.peek()) {
            case 39:
                this.bump();
                this.bump();
                return "'";
            case 123:
            case 60:
            case 62:
            case 125:
                break;
            case 35:
                if (parentArgType === "plural" || parentArgType === "selectordinal") {
                    break;
                }
                return null;
            default:
                return null;
        }
        this.bump();
        var codePoints = [this.char()];
        this.bump();
        while (!this.isEOF()) {
            var ch = this.char();
            if (ch === 39) {
                if (this.peek() === 39) {
                    codePoints.push(39);
                    this.bump();
                }
                else {
                    this.bump();
                    break;
                }
            }
            else {
                codePoints.push(ch);
            }
            this.bump();
        }
        return fromCodePoint.apply(void 0, codePoints);
    };
    Parser2.prototype.tryParseUnquoted = function (nestingLevel, parentArgType) {
        if (this.isEOF()) {
            return null;
        }
        var ch = this.char();
        if (ch === 60 || ch === 123 || ch === 35 && (parentArgType === "plural" || parentArgType === "selectordinal") || ch === 125 && nestingLevel > 0) {
            return null;
        }
        else {
            this.bump();
            return fromCodePoint(ch);
        }
    };
    Parser2.prototype.parseArgument = function (nestingLevel, expectingCloseTag) {
        var openingBracePosition = this.clonePosition();
        this.bump();
        this.bumpSpace();
        if (this.isEOF()) {
            return this.error(ErrorKind.EXPECT_ARGUMENT_CLOSING_BRACE, createLocation(openingBracePosition, this.clonePosition()));
        }
        if (this.char() === 125) {
            this.bump();
            return this.error(ErrorKind.EMPTY_ARGUMENT, createLocation(openingBracePosition, this.clonePosition()));
        }
        var value = this.parseIdentifierIfPossible().value;
        if (!value) {
            return this.error(ErrorKind.MALFORMED_ARGUMENT, createLocation(openingBracePosition, this.clonePosition()));
        }
        this.bumpSpace();
        if (this.isEOF()) {
            return this.error(ErrorKind.EXPECT_ARGUMENT_CLOSING_BRACE, createLocation(openingBracePosition, this.clonePosition()));
        }
        switch (this.char()) {
            case 125: {
                this.bump();
                return {
                    val: {
                        type: TYPE.argument,
                        value,
                        location: createLocation(openingBracePosition, this.clonePosition())
                    },
                    err: null
                };
            }
            case 44: {
                this.bump();
                this.bumpSpace();
                if (this.isEOF()) {
                    return this.error(ErrorKind.EXPECT_ARGUMENT_CLOSING_BRACE, createLocation(openingBracePosition, this.clonePosition()));
                }
                return this.parseArgumentOptions(nestingLevel, expectingCloseTag, value, openingBracePosition);
            }
            default:
                return this.error(ErrorKind.MALFORMED_ARGUMENT, createLocation(openingBracePosition, this.clonePosition()));
        }
    };
    Parser2.prototype.parseIdentifierIfPossible = function () {
        var startingPosition = this.clonePosition();
        var startOffset = this.offset();
        var value = matchIdentifierAtIndex(this.message, startOffset);
        var endOffset = startOffset + value.length;
        this.bumpTo(endOffset);
        var endPosition = this.clonePosition();
        var location = createLocation(startingPosition, endPosition);
        return { value, location };
    };
    Parser2.prototype.parseArgumentOptions = function (nestingLevel, expectingCloseTag, value, openingBracePosition) {
        var _a2;
        var typeStartPosition = this.clonePosition();
        var argType = this.parseIdentifierIfPossible().value;
        var typeEndPosition = this.clonePosition();
        switch (argType) {
            case "":
                return this.error(ErrorKind.EXPECT_ARGUMENT_TYPE, createLocation(typeStartPosition, typeEndPosition));
            case "number":
            case "date":
            case "time": {
                this.bumpSpace();
                var styleAndLocation = null;
                if (this.bumpIf(",")) {
                    this.bumpSpace();
                    var styleStartPosition = this.clonePosition();
                    var result = this.parseSimpleArgStyleIfPossible();
                    if (result.err) {
                        return result;
                    }
                    var style = trimEnd(result.val);
                    if (style.length === 0) {
                        return this.error(ErrorKind.EXPECT_ARGUMENT_STYLE, createLocation(this.clonePosition(), this.clonePosition()));
                    }
                    var styleLocation = createLocation(styleStartPosition, this.clonePosition());
                    styleAndLocation = { style, styleLocation };
                }
                var argCloseResult = this.tryParseArgumentClose(openingBracePosition);
                if (argCloseResult.err) {
                    return argCloseResult;
                }
                var location_1 = createLocation(openingBracePosition, this.clonePosition());
                if (styleAndLocation && startsWith(styleAndLocation === null || styleAndLocation === void 0 ? void 0 : styleAndLocation.style, "::", 0)) {
                    var skeleton = trimStart(styleAndLocation.style.slice(2));
                    if (argType === "number") {
                        var result = this.parseNumberSkeletonFromString(skeleton, styleAndLocation.styleLocation);
                        if (result.err) {
                            return result;
                        }
                        return {
                            val: { type: TYPE.number, value, location: location_1, style: result.val },
                            err: null
                        };
                    }
                    else {
                        if (skeleton.length === 0) {
                            return this.error(ErrorKind.EXPECT_DATE_TIME_SKELETON, location_1);
                        }
                        var style = {
                            type: SKELETON_TYPE.dateTime,
                            pattern: skeleton,
                            location: styleAndLocation.styleLocation,
                            parsedOptions: this.shouldParseSkeletons ? parseDateTimeSkeleton(skeleton) : {}
                        };
                        var type = argType === "date" ? TYPE.date : TYPE.time;
                        return {
                            val: { type, value, location: location_1, style },
                            err: null
                        };
                    }
                }
                return {
                    val: {
                        type: argType === "number" ? TYPE.number : argType === "date" ? TYPE.date : TYPE.time,
                        value,
                        location: location_1,
                        style: (_a2 = styleAndLocation === null || styleAndLocation === void 0 ? void 0 : styleAndLocation.style) !== null && _a2 !== void 0 ? _a2 : null
                    },
                    err: null
                };
            }
            case "plural":
            case "selectordinal":
            case "select": {
                var typeEndPosition_1 = this.clonePosition();
                this.bumpSpace();
                if (!this.bumpIf(",")) {
                    return this.error(ErrorKind.EXPECT_SELECT_ARGUMENT_OPTIONS, createLocation(typeEndPosition_1, __assign({}, typeEndPosition_1)));
                }
                this.bumpSpace();
                var identifierAndLocation = this.parseIdentifierIfPossible();
                var pluralOffset = 0;
                if (argType !== "select" && identifierAndLocation.value === "offset") {
                    if (!this.bumpIf(":")) {
                        return this.error(ErrorKind.EXPECT_PLURAL_ARGUMENT_OFFSET_VALUE, createLocation(this.clonePosition(), this.clonePosition()));
                    }
                    this.bumpSpace();
                    var result = this.tryParseDecimalInteger(ErrorKind.EXPECT_PLURAL_ARGUMENT_OFFSET_VALUE, ErrorKind.INVALID_PLURAL_ARGUMENT_OFFSET_VALUE);
                    if (result.err) {
                        return result;
                    }
                    this.bumpSpace();
                    identifierAndLocation = this.parseIdentifierIfPossible();
                    pluralOffset = result.val;
                }
                var optionsResult = this.tryParsePluralOrSelectOptions(nestingLevel, argType, expectingCloseTag, identifierAndLocation);
                if (optionsResult.err) {
                    return optionsResult;
                }
                var argCloseResult = this.tryParseArgumentClose(openingBracePosition);
                if (argCloseResult.err) {
                    return argCloseResult;
                }
                var location_2 = createLocation(openingBracePosition, this.clonePosition());
                if (argType === "select") {
                    return {
                        val: {
                            type: TYPE.select,
                            value,
                            options: fromEntries(optionsResult.val),
                            location: location_2
                        },
                        err: null
                    };
                }
                else {
                    return {
                        val: {
                            type: TYPE.plural,
                            value,
                            options: fromEntries(optionsResult.val),
                            offset: pluralOffset,
                            pluralType: argType === "plural" ? "cardinal" : "ordinal",
                            location: location_2
                        },
                        err: null
                    };
                }
            }
            default:
                return this.error(ErrorKind.INVALID_ARGUMENT_TYPE, createLocation(typeStartPosition, typeEndPosition));
        }
    };
    Parser2.prototype.tryParseArgumentClose = function (openingBracePosition) {
        if (this.isEOF() || this.char() !== 125) {
            return this.error(ErrorKind.EXPECT_ARGUMENT_CLOSING_BRACE, createLocation(openingBracePosition, this.clonePosition()));
        }
        this.bump();
        return { val: true, err: null };
    };
    Parser2.prototype.parseSimpleArgStyleIfPossible = function () {
        var nestedBraces = 0;
        var startPosition = this.clonePosition();
        while (!this.isEOF()) {
            var ch = this.char();
            switch (ch) {
                case 39: {
                    this.bump();
                    var apostrophePosition = this.clonePosition();
                    if (!this.bumpUntil("'")) {
                        return this.error(ErrorKind.UNCLOSED_QUOTE_IN_ARGUMENT_STYLE, createLocation(apostrophePosition, this.clonePosition()));
                    }
                    this.bump();
                    break;
                }
                case 123: {
                    nestedBraces += 1;
                    this.bump();
                    break;
                }
                case 125: {
                    if (nestedBraces > 0) {
                        nestedBraces -= 1;
                    }
                    else {
                        return {
                            val: this.message.slice(startPosition.offset, this.offset()),
                            err: null
                        };
                    }
                    break;
                }
                default:
                    this.bump();
                    break;
            }
        }
        return {
            val: this.message.slice(startPosition.offset, this.offset()),
            err: null
        };
    };
    Parser2.prototype.parseNumberSkeletonFromString = function (skeleton, location) {
        var tokens = [];
        try {
            tokens = parseNumberSkeletonFromString(skeleton);
        }
        catch (e) {
            return this.error(ErrorKind.INVALID_NUMBER_SKELETON, location);
        }
        return {
            val: {
                type: SKELETON_TYPE.number,
                tokens,
                location,
                parsedOptions: this.shouldParseSkeletons ? parseNumberSkeleton(tokens) : {}
            },
            err: null
        };
    };
    Parser2.prototype.tryParsePluralOrSelectOptions = function (nestingLevel, parentArgType, expectCloseTag, parsedFirstIdentifier) {
        var _a2;
        var hasOtherClause = false;
        var options = [];
        var parsedSelectors = new Set();
        var selector = parsedFirstIdentifier.value, selectorLocation = parsedFirstIdentifier.location;
        while (true) {
            if (selector.length === 0) {
                var startPosition = this.clonePosition();
                if (parentArgType !== "select" && this.bumpIf("=")) {
                    var result = this.tryParseDecimalInteger(ErrorKind.EXPECT_PLURAL_ARGUMENT_SELECTOR, ErrorKind.INVALID_PLURAL_ARGUMENT_SELECTOR);
                    if (result.err) {
                        return result;
                    }
                    selectorLocation = createLocation(startPosition, this.clonePosition());
                    selector = this.message.slice(startPosition.offset, this.offset());
                }
                else {
                    break;
                }
            }
            if (parsedSelectors.has(selector)) {
                return this.error(parentArgType === "select" ? ErrorKind.DUPLICATE_SELECT_ARGUMENT_SELECTOR : ErrorKind.DUPLICATE_PLURAL_ARGUMENT_SELECTOR, selectorLocation);
            }
            if (selector === "other") {
                hasOtherClause = true;
            }
            this.bumpSpace();
            var openingBracePosition = this.clonePosition();
            if (!this.bumpIf("{")) {
                return this.error(parentArgType === "select" ? ErrorKind.EXPECT_SELECT_ARGUMENT_SELECTOR_FRAGMENT : ErrorKind.EXPECT_PLURAL_ARGUMENT_SELECTOR_FRAGMENT, createLocation(this.clonePosition(), this.clonePosition()));
            }
            var fragmentResult = this.parseMessage(nestingLevel + 1, parentArgType, expectCloseTag);
            if (fragmentResult.err) {
                return fragmentResult;
            }
            var argCloseResult = this.tryParseArgumentClose(openingBracePosition);
            if (argCloseResult.err) {
                return argCloseResult;
            }
            options.push([
                selector,
                {
                    value: fragmentResult.val,
                    location: createLocation(openingBracePosition, this.clonePosition())
                }
            ]);
            parsedSelectors.add(selector);
            this.bumpSpace();
            _a2 = this.parseIdentifierIfPossible(), selector = _a2.value, selectorLocation = _a2.location;
        }
        if (options.length === 0) {
            return this.error(parentArgType === "select" ? ErrorKind.EXPECT_SELECT_ARGUMENT_SELECTOR : ErrorKind.EXPECT_PLURAL_ARGUMENT_SELECTOR, createLocation(this.clonePosition(), this.clonePosition()));
        }
        if (this.requiresOtherClause && !hasOtherClause) {
            return this.error(ErrorKind.MISSING_OTHER_CLAUSE, createLocation(this.clonePosition(), this.clonePosition()));
        }
        return { val: options, err: null };
    };
    Parser2.prototype.tryParseDecimalInteger = function (expectNumberError, invalidNumberError) {
        var sign = 1;
        var startingPosition = this.clonePosition();
        if (this.bumpIf("+")) ;
        else if (this.bumpIf("-")) {
            sign = -1;
        }
        var hasDigits = false;
        var decimal = 0;
        while (!this.isEOF()) {
            var ch = this.char();
            if (ch >= 48 && ch <= 57) {
                hasDigits = true;
                decimal = decimal * 10 + (ch - 48);
                this.bump();
            }
            else {
                break;
            }
        }
        var location = createLocation(startingPosition, this.clonePosition());
        if (!hasDigits) {
            return this.error(expectNumberError, location);
        }
        decimal *= sign;
        if (!isSafeInteger(decimal)) {
            return this.error(invalidNumberError, location);
        }
        return { val: decimal, err: null };
    };
    Parser2.prototype.offset = function () {
        return this.position.offset;
    };
    Parser2.prototype.isEOF = function () {
        return this.offset() === this.message.length;
    };
    Parser2.prototype.clonePosition = function () {
        return {
            offset: this.position.offset,
            line: this.position.line,
            column: this.position.column
        };
    };
    Parser2.prototype.char = function () {
        var offset = this.position.offset;
        if (offset >= this.message.length) {
            throw Error("out of bound");
        }
        var code = codePointAt(this.message, offset);
        if (code === void 0) {
            throw Error("Offset " + offset + " is at invalid UTF-16 code unit boundary");
        }
        return code;
    };
    Parser2.prototype.error = function (kind, location) {
        return {
            val: null,
            err: {
                kind,
                message: this.message,
                location
            }
        };
    };
    Parser2.prototype.bump = function () {
        if (this.isEOF()) {
            return;
        }
        var code = this.char();
        if (code === 10) {
            this.position.line += 1;
            this.position.column = 1;
            this.position.offset += 1;
        }
        else {
            this.position.column += 1;
            this.position.offset += code < 65536 ? 1 : 2;
        }
    };
    Parser2.prototype.bumpIf = function (prefix) {
        if (startsWith(this.message, prefix, this.offset())) {
            for (var i = 0; i < prefix.length; i++) {
                this.bump();
            }
            return true;
        }
        return false;
    };
    Parser2.prototype.bumpUntil = function (pattern) {
        var currentOffset = this.offset();
        var index = this.message.indexOf(pattern, currentOffset);
        if (index >= 0) {
            this.bumpTo(index);
            return true;
        }
        else {
            this.bumpTo(this.message.length);
            return false;
        }
    };
    Parser2.prototype.bumpTo = function (targetOffset) {
        if (this.offset() > targetOffset) {
            throw Error("targetOffset " + targetOffset + " must be greater than or equal to the current offset " + this.offset());
        }
        targetOffset = Math.min(targetOffset, this.message.length);
        while (true) {
            var offset = this.offset();
            if (offset === targetOffset) {
                break;
            }
            if (offset > targetOffset) {
                throw Error("targetOffset " + targetOffset + " is at invalid UTF-16 code unit boundary");
            }
            this.bump();
            if (this.isEOF()) {
                break;
            }
        }
    };
    Parser2.prototype.bumpSpace = function () {
        while (!this.isEOF() && _isWhiteSpace(this.char())) {
            this.bump();
        }
    };
    Parser2.prototype.peek = function () {
        if (this.isEOF()) {
            return null;
        }
        var code = this.char();
        var offset = this.offset();
        var nextCode = this.message.charCodeAt(offset + (code >= 65536 ? 2 : 1));
        return nextCode !== null && nextCode !== void 0 ? nextCode : null;
    };
    return Parser2;
}();
function _isAlpha(codepoint) {
    return codepoint >= 97 && codepoint <= 122 || codepoint >= 65 && codepoint <= 90;
}
function _isAlphaOrSlash(codepoint) {
    return _isAlpha(codepoint) || codepoint === 47;
}
function _isPotentialElementNameChar(c) {
    return c === 45 || c === 46 || c >= 48 && c <= 57 || c === 95 || c >= 97 && c <= 122 || c >= 65 && c <= 90 || c == 183 || c >= 192 && c <= 214 || c >= 216 && c <= 246 || c >= 248 && c <= 893 || c >= 895 && c <= 8191 || c >= 8204 && c <= 8205 || c >= 8255 && c <= 8256 || c >= 8304 && c <= 8591 || c >= 11264 && c <= 12271 || c >= 12289 && c <= 55295 || c >= 63744 && c <= 64975 || c >= 65008 && c <= 65533 || c >= 65536 && c <= 983039;
}
function _isWhiteSpace(c) {
    return c >= 9 && c <= 13 || c === 32 || c === 133 || c >= 8206 && c <= 8207 || c === 8232 || c === 8233;
}
function _isPatternSyntax(c) {
    return c >= 33 && c <= 35 || c === 36 || c >= 37 && c <= 39 || c === 40 || c === 41 || c === 42 || c === 43 || c === 44 || c === 45 || c >= 46 && c <= 47 || c >= 58 && c <= 59 || c >= 60 && c <= 62 || c >= 63 && c <= 64 || c === 91 || c === 92 || c === 93 || c === 94 || c === 96 || c === 123 || c === 124 || c === 125 || c === 126 || c === 161 || c >= 162 && c <= 165 || c === 166 || c === 167 || c === 169 || c === 171 || c === 172 || c === 174 || c === 176 || c === 177 || c === 182 || c === 187 || c === 191 || c === 215 || c === 247 || c >= 8208 && c <= 8213 || c >= 8214 && c <= 8215 || c === 8216 || c === 8217 || c === 8218 || c >= 8219 && c <= 8220 || c === 8221 || c === 8222 || c === 8223 || c >= 8224 && c <= 8231 || c >= 8240 && c <= 8248 || c === 8249 || c === 8250 || c >= 8251 && c <= 8254 || c >= 8257 && c <= 8259 || c === 8260 || c === 8261 || c === 8262 || c >= 8263 && c <= 8273 || c === 8274 || c === 8275 || c >= 8277 && c <= 8286 || c >= 8592 && c <= 8596 || c >= 8597 && c <= 8601 || c >= 8602 && c <= 8603 || c >= 8604 && c <= 8607 || c === 8608 || c >= 8609 && c <= 8610 || c === 8611 || c >= 8612 && c <= 8613 || c === 8614 || c >= 8615 && c <= 8621 || c === 8622 || c >= 8623 && c <= 8653 || c >= 8654 && c <= 8655 || c >= 8656 && c <= 8657 || c === 8658 || c === 8659 || c === 8660 || c >= 8661 && c <= 8691 || c >= 8692 && c <= 8959 || c >= 8960 && c <= 8967 || c === 8968 || c === 8969 || c === 8970 || c === 8971 || c >= 8972 && c <= 8991 || c >= 8992 && c <= 8993 || c >= 8994 && c <= 9e3 || c === 9001 || c === 9002 || c >= 9003 && c <= 9083 || c === 9084 || c >= 9085 && c <= 9114 || c >= 9115 && c <= 9139 || c >= 9140 && c <= 9179 || c >= 9180 && c <= 9185 || c >= 9186 && c <= 9254 || c >= 9255 && c <= 9279 || c >= 9280 && c <= 9290 || c >= 9291 && c <= 9311 || c >= 9472 && c <= 9654 || c === 9655 || c >= 9656 && c <= 9664 || c === 9665 || c >= 9666 && c <= 9719 || c >= 9720 && c <= 9727 || c >= 9728 && c <= 9838 || c === 9839 || c >= 9840 && c <= 10087 || c === 10088 || c === 10089 || c === 10090 || c === 10091 || c === 10092 || c === 10093 || c === 10094 || c === 10095 || c === 10096 || c === 10097 || c === 10098 || c === 10099 || c === 10100 || c === 10101 || c >= 10132 && c <= 10175 || c >= 10176 && c <= 10180 || c === 10181 || c === 10182 || c >= 10183 && c <= 10213 || c === 10214 || c === 10215 || c === 10216 || c === 10217 || c === 10218 || c === 10219 || c === 10220 || c === 10221 || c === 10222 || c === 10223 || c >= 10224 && c <= 10239 || c >= 10240 && c <= 10495 || c >= 10496 && c <= 10626 || c === 10627 || c === 10628 || c === 10629 || c === 10630 || c === 10631 || c === 10632 || c === 10633 || c === 10634 || c === 10635 || c === 10636 || c === 10637 || c === 10638 || c === 10639 || c === 10640 || c === 10641 || c === 10642 || c === 10643 || c === 10644 || c === 10645 || c === 10646 || c === 10647 || c === 10648 || c >= 10649 && c <= 10711 || c === 10712 || c === 10713 || c === 10714 || c === 10715 || c >= 10716 && c <= 10747 || c === 10748 || c === 10749 || c >= 10750 && c <= 11007 || c >= 11008 && c <= 11055 || c >= 11056 && c <= 11076 || c >= 11077 && c <= 11078 || c >= 11079 && c <= 11084 || c >= 11085 && c <= 11123 || c >= 11124 && c <= 11125 || c >= 11126 && c <= 11157 || c === 11158 || c >= 11159 && c <= 11263 || c >= 11776 && c <= 11777 || c === 11778 || c === 11779 || c === 11780 || c === 11781 || c >= 11782 && c <= 11784 || c === 11785 || c === 11786 || c === 11787 || c === 11788 || c === 11789 || c >= 11790 && c <= 11798 || c === 11799 || c >= 11800 && c <= 11801 || c === 11802 || c === 11803 || c === 11804 || c === 11805 || c >= 11806 && c <= 11807 || c === 11808 || c === 11809 || c === 11810 || c === 11811 || c === 11812 || c === 11813 || c === 11814 || c === 11815 || c === 11816 || c === 11817 || c >= 11818 && c <= 11822 || c === 11823 || c >= 11824 && c <= 11833 || c >= 11834 && c <= 11835 || c >= 11836 && c <= 11839 || c === 11840 || c === 11841 || c === 11842 || c >= 11843 && c <= 11855 || c >= 11856 && c <= 11857 || c === 11858 || c >= 11859 && c <= 11903 || c >= 12289 && c <= 12291 || c === 12296 || c === 12297 || c === 12298 || c === 12299 || c === 12300 || c === 12301 || c === 12302 || c === 12303 || c === 12304 || c === 12305 || c >= 12306 && c <= 12307 || c === 12308 || c === 12309 || c === 12310 || c === 12311 || c === 12312 || c === 12313 || c === 12314 || c === 12315 || c === 12316 || c === 12317 || c >= 12318 && c <= 12319 || c === 12320 || c === 12336 || c === 64830 || c === 64831 || c >= 65093 && c <= 65094;
}
function pruneLocation(els) {
    els.forEach(function (el) {
        delete el.location;
        if (isSelectElement(el) || isPluralElement(el)) {
            for (var k in el.options) {
                delete el.options[k].location;
                pruneLocation(el.options[k].value);
            }
        }
        else if (isNumberElement(el) && isNumberSkeleton(el.style)) {
            delete el.style.location;
        }
        else if ((isDateElement(el) || isTimeElement(el)) && isDateTimeSkeleton(el.style)) {
            delete el.style.location;
        }
        else if (isTagElement(el)) {
            pruneLocation(el.children);
        }
    });
}
function parse(message, opts) {
    if (opts === void 0) {
        opts = {};
    }
    opts = __assign({ shouldParseSkeletons: true, requiresOtherClause: true }, opts);
    var result = new Parser(message, opts).parse();
    if (result.err) {
        var error = SyntaxError(ErrorKind[result.err.kind]);
        error.location = result.err.location;
        error.originalMessage = result.err.message;
        throw error;
    }
    if (!(opts === null || opts === void 0 ? void 0 : opts.captureLocation)) {
        pruneLocation(result.val);
    }
    return result.val;
}
function memoize(fn, options) {
    var cache = options && options.cache ? options.cache : cacheDefault;
    var serializer = options && options.serializer ? options.serializer : serializerDefault;
    var strategy = options && options.strategy ? options.strategy : strategyDefault;
    return strategy(fn, {
        cache,
        serializer
    });
}
function isPrimitive(value) {
    return value == null || typeof value === "number" || typeof value === "boolean";
}
function monadic(fn, cache, serializer, arg) {
    var cacheKey = isPrimitive(arg) ? arg : serializer(arg);
    var computedValue = cache.get(cacheKey);
    if (typeof computedValue === "undefined") {
        computedValue = fn.call(this, arg);
        cache.set(cacheKey, computedValue);
    }
    return computedValue;
}
function variadic(fn, cache, serializer) {
    var args = Array.prototype.slice.call(arguments, 3);
    var cacheKey = serializer(args);
    var computedValue = cache.get(cacheKey);
    if (typeof computedValue === "undefined") {
        computedValue = fn.apply(this, args);
        cache.set(cacheKey, computedValue);
    }
    return computedValue;
}
function assemble(fn, context, strategy, cache, serialize) {
    return strategy.bind(context, fn, cache, serialize);
}
function strategyDefault(fn, options) {
    var strategy = fn.length === 1 ? monadic : variadic;
    return assemble(fn, this, strategy, options.cache.create(), options.serializer);
}
function strategyVariadic(fn, options) {
    return assemble(fn, this, variadic, options.cache.create(), options.serializer);
}
var serializerDefault = function () {
    return JSON.stringify(arguments);
};
function ObjectWithoutPrototypeCache() {
    this.cache = Object.create(null);
}
ObjectWithoutPrototypeCache.prototype.has = function (key) {
    return key in this.cache;
};
ObjectWithoutPrototypeCache.prototype.get = function (key) {
    return this.cache[key];
};
ObjectWithoutPrototypeCache.prototype.set = function (key, value) {
    this.cache[key] = value;
};
var cacheDefault = {
    create: function create() {
        return new ObjectWithoutPrototypeCache();
    }
};
var strategies = {
    variadic: strategyVariadic};
var ErrorCode;
(function (ErrorCode2) {
    ErrorCode2["MISSING_VALUE"] = "MISSING_VALUE";
    ErrorCode2["INVALID_VALUE"] = "INVALID_VALUE";
    ErrorCode2["MISSING_INTL_API"] = "MISSING_INTL_API";
})(ErrorCode || (ErrorCode = {}));
var FormatError = class extends Error {
    constructor(msg, code, originalMessage) {
        super(msg);
        this.code = code;
        this.originalMessage = originalMessage;
    }
    toString() {
        return `[formatjs Error: ${this.code}] ${this.message}`;
    }
};
var InvalidValueError = class extends FormatError {
    constructor(variableId, value, options, originalMessage) {
        super(`Invalid values for "${variableId}": "${value}". Options are "${Object.keys(options).join('", "')}"`, ErrorCode.INVALID_VALUE, originalMessage);
    }
};
var InvalidValueTypeError = class extends FormatError {
    constructor(value, type, originalMessage) {
        super(`Value for "${value}" must be of type ${type}`, ErrorCode.INVALID_VALUE, originalMessage);
    }
};
var MissingValueError = class extends FormatError {
    constructor(variableId, originalMessage) {
        super(`The intl string context variable "${variableId}" was not provided to the string "${originalMessage}"`, ErrorCode.MISSING_VALUE, originalMessage);
    }
};
var PART_TYPE;
(function (PART_TYPE2) {
    PART_TYPE2[PART_TYPE2["literal"] = 0] = "literal";
    PART_TYPE2[PART_TYPE2["object"] = 1] = "object";
})(PART_TYPE || (PART_TYPE = {}));
function mergeLiteral(parts) {
    if (parts.length < 2) {
        return parts;
    }
    return parts.reduce((all, part) => {
        const lastPart = all[all.length - 1];
        if (!lastPart || lastPart.type !== PART_TYPE.literal || part.type !== PART_TYPE.literal) {
            all.push(part);
        }
        else {
            lastPart.value += part.value;
        }
        return all;
    }, []);
}
function isFormatXMLElementFn(el) {
    return typeof el === "function";
}
function formatToParts(els, locales, formatters, formats, values, currentPluralValue, originalMessage) {
    if (els.length === 1 && isLiteralElement(els[0])) {
        return [
            {
                type: PART_TYPE.literal,
                value: els[0].value
            }
        ];
    }
    const result = [];
    for (const el of els) {
        if (isLiteralElement(el)) {
            result.push({
                type: PART_TYPE.literal,
                value: el.value
            });
            continue;
        }
        if (isPoundElement(el)) {
            if (typeof currentPluralValue === "number") {
                result.push({
                    type: PART_TYPE.literal,
                    value: formatters.getNumberFormat(locales).format(currentPluralValue)
                });
            }
            continue;
        }
        const { value: varName } = el;
        if (!(values && varName in values)) {
            throw new MissingValueError(varName, originalMessage);
        }
        let value = values[varName];
        if (isArgumentElement(el)) {
            if (!value || typeof value === "string" || typeof value === "number") {
                value = typeof value === "string" || typeof value === "number" ? String(value) : "";
            }
            result.push({
                type: typeof value === "string" ? PART_TYPE.literal : PART_TYPE.object,
                value
            });
            continue;
        }
        if (isDateElement(el)) {
            const style = typeof el.style === "string" ? formats.date[el.style] : isDateTimeSkeleton(el.style) ? el.style.parsedOptions : void 0;
            result.push({
                type: PART_TYPE.literal,
                value: formatters.getDateTimeFormat(locales, style).format(value)
            });
            continue;
        }
        if (isTimeElement(el)) {
            const style = typeof el.style === "string" ? formats.time[el.style] : isDateTimeSkeleton(el.style) ? el.style.parsedOptions : void 0;
            result.push({
                type: PART_TYPE.literal,
                value: formatters.getDateTimeFormat(locales, style).format(value)
            });
            continue;
        }
        if (isNumberElement(el)) {
            const style = typeof el.style === "string" ? formats.number[el.style] : isNumberSkeleton(el.style) ? el.style.parsedOptions : void 0;
            if (style && style.scale) {
                value = value * (style.scale || 1);
            }
            result.push({
                type: PART_TYPE.literal,
                value: formatters.getNumberFormat(locales, style).format(value)
            });
            continue;
        }
        if (isTagElement(el)) {
            const { children, value: value2 } = el;
            const formatFn = values[value2];
            if (!isFormatXMLElementFn(formatFn)) {
                throw new InvalidValueTypeError(value2, "function", originalMessage);
            }
            const parts = formatToParts(children, locales, formatters, formats, values, currentPluralValue);
            let chunks = formatFn(parts.map((p) => p.value));
            if (!Array.isArray(chunks)) {
                chunks = [chunks];
            }
            result.push(...chunks.map((c) => {
                return {
                    type: typeof c === "string" ? PART_TYPE.literal : PART_TYPE.object,
                    value: c
                };
            }));
        }
        if (isSelectElement(el)) {
            const opt = el.options[value] || el.options.other;
            if (!opt) {
                throw new InvalidValueError(el.value, value, Object.keys(el.options), originalMessage);
            }
            result.push(...formatToParts(opt.value, locales, formatters, formats, values));
            continue;
        }
        if (isPluralElement(el)) {
            let opt = el.options[`=${value}`];
            if (!opt) {
                if (!Intl.PluralRules) {
                    throw new FormatError(`Intl.PluralRules is not available in this environment.
Try polyfilling it using "@formatjs/intl-pluralrules"
`, ErrorCode.MISSING_INTL_API, originalMessage);
                }
                const rule = formatters.getPluralRules(locales, { type: el.pluralType }).select(value - (el.offset || 0));
                opt = el.options[rule] || el.options.other;
            }
            if (!opt) {
                throw new InvalidValueError(el.value, value, Object.keys(el.options), originalMessage);
            }
            result.push(...formatToParts(opt.value, locales, formatters, formats, values, value - (el.offset || 0)));
            continue;
        }
    }
    return mergeLiteral(result);
}
function mergeConfig(c1, c2) {
    if (!c2) {
        return c1;
    }
    return {
        ...c1 || {},
        ...c2 || {},
        ...Object.keys(c1).reduce((all, k) => {
            all[k] = {
                ...c1[k],
                ...c2[k] || {}
            };
            return all;
        }, {})
    };
}
function mergeConfigs(defaultConfig, configs) {
    if (!configs) {
        return defaultConfig;
    }
    return Object.keys(defaultConfig).reduce((all, k) => {
        all[k] = mergeConfig(defaultConfig[k], configs[k]);
        return all;
    }, { ...defaultConfig });
}
function createFastMemoizeCache(store) {
    return {
        create() {
            return {
                has(key) {
                    return key in store;
                },
                get(key) {
                    return store[key];
                },
                set(key, value) {
                    store[key] = value;
                }
            };
        }
    };
}
function createDefaultFormatters(cache = {
    number: {},
    dateTime: {},
    pluralRules: {}
}) {
    return {
        getNumberFormat: memoize((...args) => new Intl.NumberFormat(...args), {
            cache: createFastMemoizeCache(cache.number),
            strategy: strategies.variadic
        }),
        getDateTimeFormat: memoize((...args) => new Intl.DateTimeFormat(...args), {
            cache: createFastMemoizeCache(cache.dateTime),
            strategy: strategies.variadic
        }),
        getPluralRules: memoize((...args) => new Intl.PluralRules(...args), {
            cache: createFastMemoizeCache(cache.pluralRules),
            strategy: strategies.variadic
        })
    };
}
var IntlMessageFormat = class {
    constructor(message, locales = IntlMessageFormat.defaultLocale, overrideFormats, opts) {
        this.formatterCache = {
            number: {},
            dateTime: {},
            pluralRules: {}
        };
        this.format = (values) => {
            const parts = this.formatToParts(values);
            if (parts.length === 1) {
                return parts[0].value;
            }
            const result = parts.reduce((all, part) => {
                if (!all.length || part.type !== PART_TYPE.literal || typeof all[all.length - 1] !== "string") {
                    all.push(part.value);
                }
                else {
                    all[all.length - 1] += part.value;
                }
                return all;
            }, []);
            if (result.length <= 1) {
                return result[0] || "";
            }
            return result;
        };
        this.formatToParts = (values) => formatToParts(this.ast, this.locales, this.formatters, this.formats, values, void 0, this.message);
        this.resolvedOptions = () => ({
            locale: Intl.NumberFormat.supportedLocalesOf(this.locales)[0]
        });
        this.getAst = () => this.ast;
        if (typeof message === "string") {
            this.message = message;
            if (!IntlMessageFormat.__parse) {
                throw new TypeError("IntlMessageFormat.__parse must be set to process `message` of type `string`");
            }
            this.ast = IntlMessageFormat.__parse(message, {
                ignoreTag: opts?.ignoreTag
            });
        }
        else {
            this.ast = message;
        }
        if (!Array.isArray(this.ast)) {
            throw new TypeError("A message must be provided as a String or AST.");
        }
        this.formats = mergeConfigs(IntlMessageFormat.formats, overrideFormats);
        this.locales = locales;
        this.formatters = opts && opts.formatters || createDefaultFormatters(this.formatterCache);
    }
    static get defaultLocale() {
        if (!IntlMessageFormat.memoizedDefaultLocale) {
            IntlMessageFormat.memoizedDefaultLocale = new Intl.NumberFormat().resolvedOptions().locale;
        }
        return IntlMessageFormat.memoizedDefaultLocale;
    }
};
IntlMessageFormat.memoizedDefaultLocale = null;
IntlMessageFormat.__parse = parse;
IntlMessageFormat.formats = {
    number: {
        integer: {
            maximumFractionDigits: 0
        },
        currency: {
            style: "currency"
        },
        percent: {
            style: "percent"
        }
    },
    date: {
        short: {
            month: "numeric",
            day: "numeric",
            year: "2-digit"
        },
        medium: {
            month: "short",
            day: "numeric",
            year: "numeric"
        },
        long: {
            month: "long",
            day: "numeric",
            year: "numeric"
        },
        full: {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric"
        }
    },
    time: {
        short: {
            hour: "numeric",
            minute: "numeric"
        },
        medium: {
            hour: "numeric",
            minute: "numeric",
            second: "numeric"
        },
        long: {
            hour: "numeric",
            minute: "numeric",
            second: "numeric",
            timeZoneName: "short"
        },
        full: {
            hour: "numeric",
            minute: "numeric",
            second: "numeric",
            timeZoneName: "short"
        }
    }
};
var lib_esnext_default = IntlMessageFormat;
/*! *****************************************************************************
Copyright (c) Microsoft Corporation.
Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.
THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */

// Copyright 2018 The Lighthouse Authors. All Rights Reserved.
const EMPTY_VALUES_OBJECT = {};
class RegisteredFileStrings {
    filename;
    stringStructure;
    localizedMessages;
    localizedStringSet;
    constructor(filename, stringStructure, localizedMessages) {
        this.filename = filename;
        this.stringStructure = stringStructure;
        this.localizedMessages = localizedMessages;
    }
    getLocalizedStringSetFor(locale) {
        if (this.localizedStringSet) {
            return this.localizedStringSet;
        }
        const localeData = this.localizedMessages.get(locale);
        if (!localeData) {
            throw new Error(`No locale data registered for '${locale}'`);
        }
        this.localizedStringSet = new LocalizedStringSet(this.filename, this.stringStructure, locale, localeData);
        return this.localizedStringSet;
    }
}
class LocalizedStringSet {
    filename;
    stringStructure;
    localizedMessages;
    cachedSimpleStrings = new Map();
    cachedMessageFormatters = new Map();
    localeForFormatter;
    constructor(filename, stringStructure, locale, localizedMessages) {
        this.filename = filename;
        this.stringStructure = stringStructure;
        this.localizedMessages = localizedMessages;
        this.localeForFormatter = (locale === 'en-XA' || locale === 'en-XL') ? 'de-DE' : locale;
    }
    getLocalizedString(message, values = EMPTY_VALUES_OBJECT) {
        if (values === EMPTY_VALUES_OBJECT || Object.keys(values).length === 0) {
            return this.getSimpleLocalizedString(message);
        }
        return this.getFormattedLocalizedString(message, values);
    }
    getMessageFormatterFor(message) {
        const keyname = Object.keys(this.stringStructure).find(key => this.stringStructure[key] === message);
        if (!keyname) {
            throw new Error(`Unable to locate '${message}' in UIStrings object`);
        }
        const i18nId = `${this.filename} | ${keyname}`;
        const localeMessage = this.localizedMessages[i18nId];
        const messageToTranslate = localeMessage ? localeMessage.message : message;
        return new lib_esnext_default(messageToTranslate, this.localeForFormatter, undefined, { ignoreTag: true });
    }
    getSimpleLocalizedString(message) {
        const cachedSimpleString = this.cachedSimpleStrings.get(message);
        if (cachedSimpleString) {
            return cachedSimpleString;
        }
        const formatter = this.getMessageFormatterFor(message);
        try {
            const translatedString = formatter.format();
            this.cachedSimpleStrings.set(message, translatedString);
            return translatedString;
        }
        catch {
            const formatter = new lib_esnext_default(message, this.localeForFormatter, undefined, { ignoreTag: true });
            const translatedString = formatter.format();
            this.cachedSimpleStrings.set(message, translatedString);
            return translatedString;
        }
    }
    getFormattedLocalizedString(message, values) {
        let formatter = this.cachedMessageFormatters.get(message);
        if (!formatter) {
            formatter = this.getMessageFormatterFor(message);
            this.cachedMessageFormatters.set(message, formatter);
        }
        try {
            return formatter.format(values);
        }
        catch {
            const formatter = new lib_esnext_default(message, this.localeForFormatter, undefined, { ignoreTag: true });
            return formatter.format(values);
        }
    }
}

// Copyright 2018 The Lighthouse Authors. All Rights Reserved.
class I18n {
    supportedLocales;
    localeData = new Map();
    defaultLocale;
    constructor(supportedLocales, defaultLocale) {
        this.defaultLocale = defaultLocale;
        this.supportedLocales = new Set(supportedLocales);
    }
    registerLocaleData(locale, messages) {
        this.localeData.set(locale, messages);
    }
    hasLocaleDataForTest(locale) {
        return this.localeData.has(locale);
    }
    resetLocaleDataForTest() {
        this.localeData.clear();
    }
    registerFileStrings(filename, stringStructure) {
        return new RegisteredFileStrings(filename, stringStructure, this.localeData);
    }
    lookupClosestSupportedLocale(locale) {
        const canonicalLocale = Intl.getCanonicalLocales(locale)[0];
        const localeParts = canonicalLocale.split('-');
        while (localeParts.length) {
            const candidate = localeParts.join('-');
            if (this.supportedLocales.has(candidate)) {
                return candidate;
            }
            localeParts.pop();
        }
        return this.defaultLocale;
    }
}

const LOCALES = [
  'en-US',
];
const DEFAULT_LOCALE = 'en-US';

// Copyright 2020 The Chromium Authors
const i18nInstance = new I18n(LOCALES, DEFAULT_LOCALE);
function getLazilyComputedLocalizedString(registeredStrings, id, values = {}) {
    return () => getLocalizedString(registeredStrings, id, values);
}
function getLocalizedString(registeredStrings, id, values = {}) {
    return registeredStrings.getLocalizedStringSetFor(DevToolsLocale.instance().locale).getLocalizedString(id, values);
}
function registerUIStrings(path, stringStructure) {
    return i18nInstance.registerFileStrings(path, stringStructure);
}
function serializeUIString(string, values = {}) {
    const serializedMessage = { string, values };
    return JSON.stringify(serializedMessage);
}
function lockedLazyString(str) {
    return () => str;
}

// Copyright 2014 The Chromium Authors
const UIStrings$2 = {
    elementsPanel: 'Elements panel',
    stylesSidebar: 'Styles sidebar',
    changesDrawer: 'Changes drawer',
    issuesView: 'Issues view',
    networkPanel: 'Network panel',
    requestConditionsDrawer: 'Request conditions drawer',
    applicationPanel: 'Application panel',
    sourcesPanel: 'Sources panel',
    timelinePanel: 'Performance panel',
    memoryInspectorPanel: 'Memory inspector panel',
    developerResourcesPanel: 'Developer resources panel',
    animationsPanel: 'Animations panel',
    lighthousePanel: 'Lighthouse panel',
};
const str_$2 = registerUIStrings('core/common/Revealer.ts', UIStrings$2);
const i18nLazyString$1 = getLazilyComputedLocalizedString.bind(undefined, str_$2);
({
    DEVELOPER_RESOURCES_PANEL: i18nLazyString$1(UIStrings$2.developerResourcesPanel),
    ELEMENTS_PANEL: i18nLazyString$1(UIStrings$2.elementsPanel),
    STYLES_SIDEBAR: i18nLazyString$1(UIStrings$2.stylesSidebar),
    CHANGES_DRAWER: i18nLazyString$1(UIStrings$2.changesDrawer),
    ISSUES_VIEW: i18nLazyString$1(UIStrings$2.issuesView),
    NETWORK_PANEL: i18nLazyString$1(UIStrings$2.networkPanel),
    REQUEST_CONDITIONS_DRAWER: i18nLazyString$1(UIStrings$2.requestConditionsDrawer),
    TIMELINE_PANEL: i18nLazyString$1(UIStrings$2.timelinePanel),
    APPLICATION_PANEL: i18nLazyString$1(UIStrings$2.applicationPanel),
    SOURCES_PANEL: i18nLazyString$1(UIStrings$2.sourcesPanel),
    MEMORY_INSPECTOR_PANEL: i18nLazyString$1(UIStrings$2.memoryInspectorPanel),
    ANIMATIONS_PANEL: i18nLazyString$1(UIStrings$2.animationsPanel),
    LIGHTHOUSE_PANEL: i18nLazyString$1(UIStrings$2.lighthousePanel),
});

// Copyright 2014 The Chromium Authors
var FrontendMessageSource;
(function (FrontendMessageSource) {
    FrontendMessageSource["CSS"] = "css";
    FrontendMessageSource["ConsoleAPI"] = "console-api";
    FrontendMessageSource["ISSUE_PANEL"] = "issue-panel";
    FrontendMessageSource["SELF_XSS"] = "self-xss";
})(FrontendMessageSource || (FrontendMessageSource = {}));

// Copyright 2012 The Chromium Authors
function normalizePath(path) {
    if (path.indexOf('..') === -1 && path.indexOf('.') === -1) {
        return path;
    }
    const segments = (path[0] === '/' ? path.substring(1) : path).split('/');
    const normalizedSegments = [];
    for (const segment of segments) {
        if (segment === '.') {
            continue;
        }
        else if (segment === '..') {
            normalizedSegments.pop();
        }
        else {
            normalizedSegments.push(segment);
        }
    }
    let normalizedPath = normalizedSegments.join('/');
    if (path[0] === '/' && normalizedPath) {
        normalizedPath = '/' + normalizedPath;
    }
    if (normalizedPath[normalizedPath.length - 1] !== '/' &&
        ((path[path.length - 1] === '/') || (segments[segments.length - 1] === '.') ||
            (segments[segments.length - 1] === '..'))) {
        normalizedPath = normalizedPath + '/';
    }
    return normalizedPath;
}
class ParsedURL {
    isValid = false;
    url;
    scheme = '';
    user = '';
    host = '';
    port = '';
    path = '';
    queryParams = '';
    fragment = '';
    folderPathComponents = '';
    lastPathComponent = '';
    blobInnerScheme;
    #displayName;
    #dataURLDisplayName;
    constructor(url) {
        this.url = url;
        const isBlobUrl = this.url.startsWith('blob:');
        const urlToMatch = isBlobUrl ? url.substring(5) : url;
        const match = urlToMatch.match(ParsedURL.urlRegex());
        if (match) {
            this.isValid = true;
            if (isBlobUrl) {
                this.blobInnerScheme = match[2].toLowerCase();
                this.scheme = 'blob';
            }
            else {
                this.scheme = match[2].toLowerCase();
            }
            this.user = match[3] ?? '';
            this.host = match[4] ?? '';
            this.port = match[5] ?? '';
            this.path = match[6] ?? '/';
            this.queryParams = match[7] ?? '';
            this.fragment = match[8] ?? '';
        }
        else {
            if (this.url.startsWith('data:')) {
                this.scheme = 'data';
                return;
            }
            if (this.url.startsWith('blob:')) {
                this.scheme = 'blob';
                return;
            }
            if (this.url === 'about:blank') {
                this.scheme = 'about';
                return;
            }
            this.path = this.url;
        }
        const lastSlashExceptTrailingIndex = this.path.lastIndexOf('/', this.path.length - 2);
        if (lastSlashExceptTrailingIndex !== -1) {
            this.lastPathComponent = this.path.substring(lastSlashExceptTrailingIndex + 1);
        }
        else {
            this.lastPathComponent = this.path;
        }
        const lastSlashIndex = this.path.lastIndexOf('/');
        if (lastSlashIndex !== -1) {
            this.folderPathComponents = this.path.substring(0, lastSlashIndex);
        }
    }
    static fromString(string) {
        const parsedURL = new ParsedURL(string.toString());
        if (parsedURL.isValid) {
            return parsedURL;
        }
        return null;
    }
    static preEncodeSpecialCharactersInPath(path) {
        for (const specialChar of ['%', ';', '#', '?', ' ']) {
            (path) = path.replaceAll(specialChar, encodeURIComponent(specialChar));
        }
        return path;
    }
    static rawPathToEncodedPathString(path) {
        const partiallyEncoded = ParsedURL.preEncodeSpecialCharactersInPath(path);
        if (path.startsWith('/')) {
            return new URL(partiallyEncoded, 'file:///').pathname;
        }
        return new URL('/' + partiallyEncoded, 'file:///').pathname.substr(1);
    }
    static encodedFromParentPathAndName(parentPath, name) {
        return ParsedURL.concatenate(parentPath, '/', ParsedURL.preEncodeSpecialCharactersInPath(name));
    }
    static urlFromParentUrlAndName(parentUrl, name) {
        return ParsedURL.concatenate(parentUrl, '/', ParsedURL.preEncodeSpecialCharactersInPath(name));
    }
    static encodedPathToRawPathString(encPath) {
        return decodeURIComponent(encPath);
    }
    static rawPathToUrlString(fileSystemPath) {
        let preEncodedPath = ParsedURL.preEncodeSpecialCharactersInPath(fileSystemPath.replace(/\\/g, '/'));
        preEncodedPath = preEncodedPath.replace(/\\/g, '/');
        if (!preEncodedPath.startsWith('file://')) {
            if (preEncodedPath.startsWith('/')) {
                preEncodedPath = 'file://' + preEncodedPath;
            }
            else {
                preEncodedPath = 'file:///' + preEncodedPath;
            }
        }
        let url = new URL(preEncodedPath).toString();
        while (url.endsWith('/') && url.length > 'file:///'.length) {
            url = url.substring(0, url.length - 1);
        }
        return url;
    }
    static relativePathToUrlString(relativePath, baseURL) {
        const preEncodedPath = ParsedURL.preEncodeSpecialCharactersInPath(relativePath.replace(/\\/g, '/'));
        return new URL(preEncodedPath, baseURL).toString();
    }
    static urlToRawPathString(fileURL, isWindows) {
        console.assert(fileURL.startsWith('file://'), 'This must be a file URL.');
        const decodedFileURL = decodeURIComponent(fileURL);
        if (isWindows) {
            return decodedFileURL.substr('file:///'.length).replace(/\//g, '\\');
        }
        return decodedFileURL.substr('file://'.length);
    }
    static sliceUrlToEncodedPathString(url, start) {
        return url.substring(start);
    }
    static substr(devToolsPath, from, length) {
        return devToolsPath.substr(from, length);
    }
    static substring(devToolsPath, start, end) {
        return devToolsPath.substring(start, end);
    }
    static prepend(prefix, devToolsPath) {
        return prefix + devToolsPath;
    }
    static concatenate(devToolsPath, ...appendage) {
        return devToolsPath.concat(...appendage);
    }
    static trim(devToolsPath) {
        return devToolsPath.trim();
    }
    static slice(devToolsPath, start, end) {
        return devToolsPath.slice(start, end);
    }
    static join(devToolsPaths, separator) {
        return devToolsPaths.join(separator);
    }
    static split(devToolsPath, separator, limit) {
        return devToolsPath.split(separator, limit);
    }
    static toLowerCase(devToolsPath) {
        return devToolsPath.toLowerCase();
    }
    static isValidUrlString(str) {
        return new ParsedURL(str).isValid;
    }
    static urlWithoutHash(url) {
        const hashIndex = url.indexOf('#');
        if (hashIndex !== -1) {
            return url.substr(0, hashIndex);
        }
        return url;
    }
    static urlRegex() {
        if (ParsedURL.urlRegexInstance) {
            return ParsedURL.urlRegexInstance;
        }
        const schemeRegex = /([A-Za-z][A-Za-z0-9+.-]*):\/\//;
        const userRegex = /(?:([A-Za-z0-9\-._~%!$&'()*+,;=:]*)@)?/;
        const hostRegex = /((?:\[[0-9a-fA-F:.]*:[0-9a-fA-F:.]*\])|(?:[^\s\/:]*))/;
        const portRegex = /(?::([\d]+))?/;
        const pathRegex = /(\/[^#?]*)?/;
        const queryRegex = /(?:\?([^#]*))?/;
        const fragmentRegex = /(?:#(.*))?/;
        ParsedURL.urlRegexInstance = new RegExp('^(' + schemeRegex.source + userRegex.source + hostRegex.source + portRegex.source + ')' + pathRegex.source +
            queryRegex.source + fragmentRegex.source + '$');
        return ParsedURL.urlRegexInstance;
    }
    static extractPath(url) {
        const parsedURL = this.fromString(url);
        return (parsedURL ? parsedURL.path : '');
    }
    static extractOrigin(url) {
        const parsedURL = this.fromString(url);
        return parsedURL ? parsedURL.securityOrigin() : EmptyUrlString;
    }
    static extractExtension(url) {
        url = ParsedURL.urlWithoutHash(url);
        const indexOfQuestionMark = url.indexOf('?');
        if (indexOfQuestionMark !== -1) {
            url = url.substr(0, indexOfQuestionMark);
        }
        const lastIndexOfSlash = url.lastIndexOf('/');
        if (lastIndexOfSlash !== -1) {
            url = url.substr(lastIndexOfSlash + 1);
        }
        const lastIndexOfDot = url.lastIndexOf('.');
        if (lastIndexOfDot !== -1) {
            url = url.substr(lastIndexOfDot + 1);
            const lastIndexOfPercent = url.indexOf('%');
            if (lastIndexOfPercent !== -1) {
                return url.substr(0, lastIndexOfPercent);
            }
            return url;
        }
        return '';
    }
    static extractName(url) {
        if (url.endsWith('/')) {
            url = url.slice(0, -1);
        }
        let index = url.lastIndexOf('/');
        const pathAndQuery = index !== -1 ? url.substr(index + 1) : url;
        index = pathAndQuery.indexOf('?');
        return index < 0 ? pathAndQuery : pathAndQuery.substr(0, index);
    }
    static completeURL(baseURL, href) {
        if (href.startsWith('data:') || href.startsWith('blob:') || href.startsWith('javascript:') ||
            href.startsWith('mailto:')) {
            return href;
        }
        const trimmedHref = href.trim();
        const parsedHref = this.fromString(trimmedHref);
        if (parsedHref?.scheme) {
            const securityOrigin = parsedHref.securityOrigin();
            const pathText = normalizePath(parsedHref.path);
            const queryText = parsedHref.queryParams && `?${parsedHref.queryParams}`;
            const fragmentText = parsedHref.fragment && `#${parsedHref.fragment}`;
            return securityOrigin + pathText + queryText + fragmentText;
        }
        const parsedURL = this.fromString(baseURL);
        if (!parsedURL) {
            return null;
        }
        if (parsedURL.isDataURL()) {
            return href;
        }
        if (href.length > 1 && href.charAt(0) === '/' && href.charAt(1) === '/') {
            return parsedURL.scheme + ':' + href;
        }
        const securityOrigin = parsedURL.securityOrigin();
        const pathText = parsedURL.path;
        const queryText = parsedURL.queryParams ? '?' + parsedURL.queryParams : '';
        if (!href.length) {
            return securityOrigin + pathText + queryText;
        }
        if (href.charAt(0) === '#') {
            return securityOrigin + pathText + queryText + href;
        }
        if (href.charAt(0) === '?') {
            return securityOrigin + pathText + href;
        }
        const hrefMatches = href.match(/^[^#?]*/);
        if (!hrefMatches || !href.length) {
            throw new Error('Invalid href');
        }
        let hrefPath = hrefMatches[0];
        const hrefSuffix = href.substring(hrefPath.length);
        if (hrefPath.charAt(0) !== '/') {
            hrefPath = parsedURL.folderPathComponents + '/' + hrefPath;
        }
        return securityOrigin + normalizePath(hrefPath) + hrefSuffix;
    }
    static splitLineAndColumn(string) {
        const beforePathMatch = string.match(ParsedURL.urlRegex());
        let beforePath = '';
        let pathAndAfter = string;
        if (beforePathMatch) {
            beforePath = beforePathMatch[1];
            pathAndAfter = string.substring(beforePathMatch[1].length);
        }
        const lineColumnRegEx = /(?::(\d+))?(?::(\d+))?$/;
        const lineColumnMatch = lineColumnRegEx.exec(pathAndAfter);
        let lineNumber;
        let columnNumber;
        console.assert(Boolean(lineColumnMatch));
        if (!lineColumnMatch) {
            return { url: string, lineNumber: 0, columnNumber: 0 };
        }
        if (typeof (lineColumnMatch[1]) === 'string') {
            lineNumber = parseInt(lineColumnMatch[1], 10);
            lineNumber = isNaN(lineNumber) ? undefined : lineNumber - 1;
        }
        if (typeof (lineColumnMatch[2]) === 'string') {
            columnNumber = parseInt(lineColumnMatch[2], 10);
            columnNumber = isNaN(columnNumber) ? undefined : columnNumber - 1;
        }
        let url = beforePath + pathAndAfter.substring(0, pathAndAfter.length - lineColumnMatch[0].length);
        if (lineColumnMatch[1] === undefined && lineColumnMatch[2] === undefined) {
            const wasmCodeOffsetRegex = /wasm-function\[\d+\]:0x([a-z0-9]+)$/g;
            const wasmCodeOffsetMatch = wasmCodeOffsetRegex.exec(pathAndAfter);
            if (wasmCodeOffsetMatch && typeof (wasmCodeOffsetMatch[1]) === 'string') {
                url = ParsedURL.removeWasmFunctionInfoFromURL(url);
                columnNumber = parseInt(wasmCodeOffsetMatch[1], 16);
                columnNumber = isNaN(columnNumber) ? undefined : columnNumber;
            }
        }
        return { url, lineNumber, columnNumber };
    }
    static removeWasmFunctionInfoFromURL(url) {
        const wasmFunctionRegEx = /:wasm-function\[\d+\]/;
        const wasmFunctionIndex = url.search(wasmFunctionRegEx);
        if (wasmFunctionIndex === -1) {
            return url;
        }
        return ParsedURL.substring(url, 0, wasmFunctionIndex);
    }
    static beginsWithWindowsDriveLetter(url) {
        return /^[A-Za-z]:/.test(url);
    }
    static beginsWithScheme(url) {
        return /^[A-Za-z][A-Za-z0-9+.-]*:/.test(url);
    }
    static isRelativeURL(url) {
        return !this.beginsWithScheme(url) || this.beginsWithWindowsDriveLetter(url);
    }
    get displayName() {
        if (this.#displayName) {
            return this.#displayName;
        }
        if (this.isDataURL()) {
            return this.dataURLDisplayName();
        }
        if (this.isBlobURL()) {
            return this.url;
        }
        if (this.isAboutBlank()) {
            return this.url;
        }
        this.#displayName = this.lastPathComponent;
        if (!this.#displayName) {
            this.#displayName = (this.host || '') + '/';
        }
        if (this.#displayName === '/') {
            this.#displayName = this.url;
        }
        return this.#displayName;
    }
    dataURLDisplayName() {
        if (this.#dataURLDisplayName) {
            return this.#dataURLDisplayName;
        }
        if (!this.isDataURL()) {
            return '';
        }
        this.#dataURLDisplayName = trimEndWithMaxLength(this.url, 20);
        return this.#dataURLDisplayName;
    }
    isAboutBlank() {
        return this.url === 'about:blank';
    }
    isDataURL() {
        return this.scheme === 'data';
    }
    extractDataUrlMimeType() {
        const regexp = /^data:((?<type>\w+)\/(?<subtype>\w+))?(;base64)?,/;
        const match = this.url.match(regexp);
        return {
            type: match?.groups?.type,
            subtype: match?.groups?.subtype,
        };
    }
    isBlobURL() {
        return this.url.startsWith('blob:');
    }
    lastPathComponentWithFragment() {
        return this.lastPathComponent + (this.fragment ? '#' + this.fragment : '');
    }
    domain() {
        if (this.isDataURL()) {
            return 'data:';
        }
        return this.host + (this.port ? ':' + this.port : '');
    }
    securityOrigin() {
        if (this.isDataURL()) {
            return 'data:';
        }
        const scheme = this.isBlobURL() ? this.blobInnerScheme : this.scheme;
        const domain = this.domain();
        if (!scheme && !domain) {
            return '';
        }
        return scheme + '://' + domain;
    }
    urlWithoutScheme() {
        if (this.scheme && this.url.startsWith(this.scheme + '://')) {
            return this.url.substring(this.scheme.length + 3);
        }
        return this.url;
    }
    static urlRegexInstance = null;
}

// Copyright 2021 The Chromium Authors
/*
 * Copyright (C) 2012 Google Inc.  All rights reserved.
 * Copyright (C) 2007, 2008 Apple Inc.  All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * 1.  Redistributions of source code must retain the above copyright
 *     notice, this list of conditions and the following disclaimer.
 * 2.  Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 * 3.  Neither the name of Apple Computer, Inc. ("Apple") nor the names of
 *     its contributors may be used to endorse or promote products derived
 *     from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE AND ITS CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL APPLE OR ITS CONTRIBUTORS BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
const UIStrings$1 = {
    fetchAndXHR: '`Fetch` and `XHR`',
    javascript: 'JavaScript',
    js: 'JS',
    css: 'CSS',
    img: 'Img',
    media: 'Media',
    font: 'Font',
    doc: 'Doc',
    socketShort: 'Socket',
    webassembly: 'WebAssembly',
    wasm: 'Wasm',
    manifest: 'Manifest',
    other: 'Other',
    document: 'Document',
    stylesheet: 'Stylesheet',
    image: 'Image',
    script: 'Script',
    texttrack: 'TextTrack',
    fetch: 'Fetch',
    eventsource: 'EventSource',
    websocket: 'WebSocket',
    webtransport: 'WebTransport',
    directsocket: 'DirectSocket',
    signedexchange: 'SignedExchange',
    ping: 'Ping',
    cspviolationreport: 'CSPViolationReport',
    preflight: 'Preflight',
    fedcm: 'FedCM',
};
const str_$1 = registerUIStrings('core/common/ResourceType.ts', UIStrings$1);
const i18nLazyString = getLazilyComputedLocalizedString.bind(undefined, str_$1);
class ResourceType {
    #name;
    #title;
    #category;
    #isTextType;
    constructor(name, title, category, isTextType) {
        this.#name = name;
        this.#title = title;
        this.#category = category;
        this.#isTextType = isTextType;
    }
    static fromMimeType(mimeType) {
        if (!mimeType) {
            return resourceTypes.Other;
        }
        if (mimeType.startsWith('text/html')) {
            return resourceTypes.Document;
        }
        if (mimeType.startsWith('text/css')) {
            return resourceTypes.Stylesheet;
        }
        if (mimeType.startsWith('image/')) {
            return resourceTypes.Image;
        }
        if (mimeType.startsWith('text/')) {
            return resourceTypes.Script;
        }
        if (mimeType.includes('font')) {
            return resourceTypes.Font;
        }
        if (mimeType.includes('script')) {
            return resourceTypes.Script;
        }
        if (mimeType.includes('octet')) {
            return resourceTypes.Other;
        }
        if (mimeType.includes('application')) {
            return resourceTypes.Script;
        }
        return resourceTypes.Other;
    }
    static fromMimeTypeOverride(mimeType) {
        if (mimeType === 'application/manifest+json') {
            return resourceTypes.Manifest;
        }
        if (mimeType === 'application/wasm') {
            return resourceTypes.Wasm;
        }
        return null;
    }
    static fromURL(url) {
        return resourceTypeByExtension.get(ParsedURL.extractExtension(url)) || null;
    }
    static fromName(name) {
        for (const resourceType of Object.values(resourceTypes)) {
            if (resourceType.name() === name) {
                return resourceType;
            }
        }
        return null;
    }
    static mimeFromURL(url) {
        if (url.startsWith('snippet://') || url.startsWith('debugger://')) {
            return 'text/javascript';
        }
        const name = ParsedURL.extractName(url);
        if (mimeTypeByName.has(name)) {
            return mimeTypeByName.get(name);
        }
        let ext = ParsedURL.extractExtension(url).toLowerCase();
        if (ext === 'html' && name.endsWith('.component.html')) {
            ext = 'component.html';
        }
        return mimeTypeByExtension.get(ext);
    }
    static mimeFromExtension(ext) {
        return mimeTypeByExtension.get(ext);
    }
    static simplifyContentType(contentType) {
        const regex = new RegExp('^application(.*json$|\/json\+.*)');
        return regex.test(contentType) ? 'application/json' : contentType;
    }
    static isJavaScriptMimeType(mimeType) {
        return mimeType === 'application/javascript' || mimeType === 'text/javascript';
    }
    static mediaTypeForMetrics(mimeType, isFromSourceMap, isMinified, isSnippet, isDebugger) {
        if (mimeType !== 'text/javascript') {
            return mimeType;
        }
        if (isFromSourceMap) {
            return 'text/javascript+sourcemapped';
        }
        if (isMinified) {
            return 'text/javascript+minified';
        }
        if (isSnippet) {
            return 'text/javascript+snippet';
        }
        if (isDebugger) {
            return 'text/javascript+eval';
        }
        return 'text/javascript+plain';
    }
    name() {
        return this.#name;
    }
    title() {
        return this.#title();
    }
    category() {
        return this.#category;
    }
    isTextType() {
        return this.#isTextType;
    }
    isScript() {
        return this.#name === 'script' || this.#name === 'sm-script';
    }
    hasScripts() {
        return this.isScript() || this.isDocument();
    }
    isStyleSheet() {
        return this.#name === 'stylesheet' || this.#name === 'sm-stylesheet';
    }
    hasStyleSheets() {
        return this.isStyleSheet() || this.isDocument();
    }
    isDocument() {
        return this.#name === 'document';
    }
    isDocumentOrScriptOrStyleSheet() {
        return this.isDocument() || this.isScript() || this.isStyleSheet();
    }
    isFont() {
        return this.#name === 'font';
    }
    isImage() {
        return this.#name === 'image';
    }
    isFromSourceMap() {
        return this.#name.startsWith('sm-');
    }
    toString() {
        return this.#name;
    }
    canonicalMimeType() {
        if (this.isDocument()) {
            return 'text/html';
        }
        if (this.isScript()) {
            return 'text/javascript';
        }
        if (this.isStyleSheet()) {
            return 'text/css';
        }
        return '';
    }
}
class ResourceCategory {
    name;
    title;
    shortTitle;
    constructor(name, title, shortTitle) {
        this.name = name;
        this.title = title;
        this.shortTitle = shortTitle;
    }
}
const resourceCategories = {
    XHR: new ResourceCategory('Fetch and XHR', i18nLazyString(UIStrings$1.fetchAndXHR), lockedLazyString('Fetch/XHR')),
    Document: new ResourceCategory(UIStrings$1.document, i18nLazyString(UIStrings$1.document), i18nLazyString(UIStrings$1.doc)),
    Stylesheet: new ResourceCategory(UIStrings$1.css, i18nLazyString(UIStrings$1.css), i18nLazyString(UIStrings$1.css)),
    Script: new ResourceCategory(UIStrings$1.javascript, i18nLazyString(UIStrings$1.javascript), i18nLazyString(UIStrings$1.js)),
    Font: new ResourceCategory(UIStrings$1.font, i18nLazyString(UIStrings$1.font), i18nLazyString(UIStrings$1.font)),
    Image: new ResourceCategory(UIStrings$1.image, i18nLazyString(UIStrings$1.image), i18nLazyString(UIStrings$1.img)),
    Media: new ResourceCategory(UIStrings$1.media, i18nLazyString(UIStrings$1.media), i18nLazyString(UIStrings$1.media)),
    Manifest: new ResourceCategory(UIStrings$1.manifest, i18nLazyString(UIStrings$1.manifest), i18nLazyString(UIStrings$1.manifest)),
    Socket: new ResourceCategory('Socket', lockedLazyString('WebSocket | WebTransport | DirectSocket'), i18nLazyString(UIStrings$1.socketShort)),
    Wasm: new ResourceCategory(UIStrings$1.webassembly, i18nLazyString(UIStrings$1.webassembly), i18nLazyString(UIStrings$1.wasm)),
    Other: new ResourceCategory(UIStrings$1.other, i18nLazyString(UIStrings$1.other), i18nLazyString(UIStrings$1.other)),
};
const resourceTypes = {
    Document: new ResourceType('document', i18nLazyString(UIStrings$1.document), resourceCategories.Document, true),
    Stylesheet: new ResourceType('stylesheet', i18nLazyString(UIStrings$1.stylesheet), resourceCategories.Stylesheet, true),
    Image: new ResourceType('image', i18nLazyString(UIStrings$1.image), resourceCategories.Image, false),
    Media: new ResourceType('media', i18nLazyString(UIStrings$1.media), resourceCategories.Media, false),
    Font: new ResourceType('font', i18nLazyString(UIStrings$1.font), resourceCategories.Font, false),
    Script: new ResourceType('script', i18nLazyString(UIStrings$1.script), resourceCategories.Script, true),
    TextTrack: new ResourceType('texttrack', i18nLazyString(UIStrings$1.texttrack), resourceCategories.Other, true),
    XHR: new ResourceType('xhr', lockedLazyString('XHR'), resourceCategories.XHR, true),
    Fetch: new ResourceType('fetch', i18nLazyString(UIStrings$1.fetch), resourceCategories.XHR, true),
    Prefetch: new ResourceType('prefetch', lockedLazyString('Prefetch'), resourceCategories.Document, true),
    EventSource: new ResourceType('eventsource', i18nLazyString(UIStrings$1.eventsource), resourceCategories.XHR, true),
    WebSocket: new ResourceType('websocket', i18nLazyString(UIStrings$1.websocket), resourceCategories.Socket, false),
    WebTransport: new ResourceType('webtransport', i18nLazyString(UIStrings$1.webtransport), resourceCategories.Socket, false),
    DirectSocket: new ResourceType('directsocket', i18nLazyString(UIStrings$1.directsocket), resourceCategories.Socket, false),
    Wasm: new ResourceType('wasm', i18nLazyString(UIStrings$1.wasm), resourceCategories.Wasm, false),
    Manifest: new ResourceType('manifest', i18nLazyString(UIStrings$1.manifest), resourceCategories.Manifest, true),
    SignedExchange: new ResourceType('signed-exchange', i18nLazyString(UIStrings$1.signedexchange), resourceCategories.Other, false),
    Ping: new ResourceType('ping', i18nLazyString(UIStrings$1.ping), resourceCategories.Other, false),
    CSPViolationReport: new ResourceType('csp-violation-report', i18nLazyString(UIStrings$1.cspviolationreport), resourceCategories.Other, false),
    Other: new ResourceType('other', i18nLazyString(UIStrings$1.other), resourceCategories.Other, false),
    Preflight: new ResourceType('preflight', i18nLazyString(UIStrings$1.preflight), resourceCategories.Other, true),
    SourceMapScript: new ResourceType('sm-script', i18nLazyString(UIStrings$1.script), resourceCategories.Script, true),
    SourceMapStyleSheet: new ResourceType('sm-stylesheet', i18nLazyString(UIStrings$1.stylesheet), resourceCategories.Stylesheet, true),
    FedCM: new ResourceType('fedcm', i18nLazyString(UIStrings$1.fedcm), resourceCategories.Other, false),
};
const mimeTypeByName = new Map([
    ['Cakefile', 'text/x-coffeescript'],
]);
const resourceTypeByExtension = new Map([
    ['js', resourceTypes.Script],
    ['mjs', resourceTypes.Script],
    ['css', resourceTypes.Stylesheet],
    ['xsl', resourceTypes.Stylesheet],
    ['avif', resourceTypes.Image],
    ['bmp', resourceTypes.Image],
    ['gif', resourceTypes.Image],
    ['ico', resourceTypes.Image],
    ['jpeg', resourceTypes.Image],
    ['jpg', resourceTypes.Image],
    ['jxl', resourceTypes.Image],
    ['png', resourceTypes.Image],
    ['svg', resourceTypes.Image],
    ['tif', resourceTypes.Image],
    ['tiff', resourceTypes.Image],
    ['vue', resourceTypes.Document],
    ['webmanifest', resourceTypes.Manifest],
    ['webp', resourceTypes.Media],
    ['otf', resourceTypes.Font],
    ['ttc', resourceTypes.Font],
    ['ttf', resourceTypes.Font],
    ['woff', resourceTypes.Font],
    ['woff2', resourceTypes.Font],
    ['wasm', resourceTypes.Wasm],
]);
const mimeTypeByExtension = new Map([
    ['js', 'text/javascript'],
    ['mjs', 'text/javascript'],
    ['css', 'text/css'],
    ['html', 'text/html'],
    ['htm', 'text/html'],
    ['xml', 'application/xml'],
    ['xsl', 'application/xml'],
    ['wasm', 'application/wasm'],
    ['webmanifest', 'application/manifest+json'],
    ['asp', 'application/x-aspx'],
    ['aspx', 'application/x-aspx'],
    ['jsp', 'application/x-jsp'],
    ['c', 'text/x-c++src'],
    ['cc', 'text/x-c++src'],
    ['cpp', 'text/x-c++src'],
    ['h', 'text/x-c++src'],
    ['m', 'text/x-c++src'],
    ['mm', 'text/x-c++src'],
    ['coffee', 'text/x-coffeescript'],
    ['dart', 'application/vnd.dart'],
    ['ts', 'text/typescript'],
    ['tsx', 'text/typescript-jsx'],
    ['json', 'application/json'],
    ['gyp', 'application/json'],
    ['gypi', 'application/json'],
    ['map', 'application/json'],
    ['cs', 'text/x-csharp'],
    ['go', 'text/x-go'],
    ['java', 'text/x-java'],
    ['kt', 'text/x-kotlin'],
    ['scala', 'text/x-scala'],
    ['less', 'text/x-less'],
    ['php', 'application/x-httpd-php'],
    ['phtml', 'application/x-httpd-php'],
    ['py', 'text/x-python'],
    ['sh', 'text/x-sh'],
    ['gss', 'text/x-gss'],
    ['sass', 'text/x-sass'],
    ['scss', 'text/x-scss'],
    ['vtt', 'text/vtt'],
    ['ls', 'text/x-livescript'],
    ['md', 'text/markdown'],
    ['cljs', 'text/x-clojure'],
    ['cljc', 'text/x-clojure'],
    ['cljx', 'text/x-clojure'],
    ['styl', 'text/x-styl'],
    ['jsx', 'text/jsx'],
    ['avif', 'image/avif'],
    ['bmp', 'image/bmp'],
    ['gif', 'image/gif'],
    ['ico', 'image/ico'],
    ['jpeg', 'image/jpeg'],
    ['jpg', 'image/jpeg'],
    ['jxl', 'image/jxl'],
    ['png', 'image/png'],
    ['svg', 'image/svg+xml'],
    ['tif', 'image/tif'],
    ['tiff', 'image/tiff'],
    ['webp', 'image/webp'],
    ['otf', 'font/otf'],
    ['ttc', 'font/collection'],
    ['ttf', 'font/ttf'],
    ['woff', 'font/woff'],
    ['woff2', 'font/woff2'],
    ['component.html', 'text/x.angular'],
    ['svelte', 'text/x.svelte'],
    ['vue', 'text/x.vue'],
]);

// Copyright 2020 The Chromium Authors
const UIStrings = {
    elements: 'Elements',
    ai: 'AI',
    appearance: 'Appearance',
    sources: 'Sources',
    network: 'Network',
    performance: 'Performance',
    console: 'Console',
    persistence: 'Persistence',
    debugger: 'Debugger',
    global: 'Global',
    rendering: 'Rendering',
    grid: 'Grid',
    mobile: 'Mobile',
    memory: 'Memory',
    extension: 'Extension',
    adorner: 'Adorner',
    account: 'Account',
};
const str_ = registerUIStrings('core/common/SettingRegistration.ts', UIStrings);
getLocalizedString.bind(undefined, str_);

// Copyright 2011 The Chromium Authors
class HeapSnapshotWorkerProxy extends ObjectWrapper {
    eventHandler;
    #console;
    nextObjectId = 1;
    nextCallId = 1;
    callbacks = new Map();
    previousCallbacks = new Set();
    worker;
    interval;
    workerUrl;
    constructor(eventHandler, console, workerUrl) {
        super();
        this.eventHandler = eventHandler;
        this.#console = console;
        this.workerUrl = workerUrl;
        this.worker = HOST_RUNTIME.createWorker(workerUrl ?? import.meta.resolve('../../entrypoints/heap_snapshot_worker/heap_snapshot_worker-entrypoint.js'));
        this.worker.onmessage = this.messageReceived.bind(this);
    }
    get console() {
        return this.#console;
    }
    createLoader(profileUid, snapshotReceivedCallback) {
        const objectId = this.nextObjectId++;
        const proxy = new HeapSnapshotLoaderProxy(this, objectId, profileUid, snapshotReceivedCallback);
        this.postMessage({
            callId: this.nextCallId++,
            disposition: 'createLoader',
            objectId,
        });
        return proxy;
    }
    dispose() {
        this.worker.terminate();
        clearInterval(this.interval);
    }
    disposeObject(objectId) {
        this.postMessage({ callId: this.nextCallId++, disposition: 'dispose', objectId });
    }
    evaluateForTest(script, callback) {
        const callId = this.nextCallId++;
        this.callbacks.set(callId, (error, result) => {
            callback(error, result);
        });
        this.postMessage({ callId, disposition: 'evaluateForTest', source: script });
    }
    callFactoryMethod(callback, objectId, methodName, proxyConstructor, transfer, ...methodArguments) {
        const callId = this.nextCallId++;
        const newObjectId = this.nextObjectId++;
        if (callback) {
            this.callbacks.set(callId, (error, remoteResult) => {
                if (error) {
                    callback(error);
                    return;
                }
                callback(undefined, remoteResult ? new proxyConstructor(this, newObjectId) : undefined);
            });
            this.postMessage({
                callId,
                disposition: 'factory',
                objectId,
                methodName,
                methodArguments,
                newObjectId,
            }, transfer);
            return null;
        }
        this.postMessage({
            callId,
            disposition: 'factory',
            objectId,
            methodName,
            methodArguments,
            newObjectId,
        }, transfer);
        return new proxyConstructor(this, newObjectId);
    }
    callMethod(callback, objectId, methodName, ...methodArguments) {
        const callId = this.nextCallId++;
        if (callback) {
            this.callbacks.set(callId, (error, result) => {
                callback(error, result);
            });
        }
        this.postMessage({
            callId,
            disposition: 'method',
            objectId,
            methodName,
            methodArguments,
        });
    }
    startCheckingForLongRunningCalls() {
        if (this.interval) {
            return;
        }
        this.checkLongRunningCalls();
        this.interval = globalThis.setInterval(this.checkLongRunningCalls.bind(this), 300);
    }
    checkLongRunningCalls() {
        for (const callId of this.previousCallbacks) {
            if (!this.callbacks.has(callId)) {
                this.previousCallbacks.delete(callId);
            }
        }
        const hasLongRunningCalls = Boolean(this.previousCallbacks.size);
        this.dispatchEventToListeners("Wait" , hasLongRunningCalls);
        for (const callId of this.callbacks.keys()) {
            this.previousCallbacks.add(callId);
        }
    }
    setupForSecondaryInit(port) {
        const callId = this.nextCallId++;
        const done = new Promise((resolve, reject) => {
            this.callbacks.set(callId, error => {
                if (error) {
                    reject(new Error(error));
                }
                else {
                    resolve();
                }
            });
        });
        this.postMessage({
            callId,
            disposition: 'setupForSecondaryInit',
            objectId: this.nextObjectId++,
        }, [port]);
        return done;
    }
    messageReceived(event) {
        const data = event.data;
        if (data.eventName) {
            if (this.eventHandler) {
                this.eventHandler(data.eventName, data.data);
            }
            return;
        }
        if (data.error) {
            this.#console.error(`An error occurred when a call to method '${data.errorMethodName}' was requested`);
            this.#console.error(data['errorCallStack']);
        }
        const callback = this.callbacks.get(data.callId);
        if (!callback) {
            return;
        }
        this.callbacks.delete(data.callId);
        if (data.error) {
            callback(data.error);
            return;
        }
        callback(undefined, data.result);
    }
    postMessage(message, transfer) {
        this.worker.postMessage(message, transfer);
    }
}
class HeapSnapshotProxyObject {
    worker;
    objectId;
    constructor(worker, objectId) {
        this.worker = worker;
        this.objectId = objectId;
    }
    dispose() {
        this.worker.disposeObject(this.objectId);
    }
    callFactoryMethod(methodName, proxyConstructor, ...args) {
        return this.worker.callFactoryMethod(null, String(this.objectId), methodName, proxyConstructor, [], ...args);
    }
    callFactoryMethodPromise(methodName, proxyConstructor, transfer, ...args) {
        return new Promise((resolve, reject) => this.worker.callFactoryMethod((error, result) => {
            if (error) {
                reject(new Error(error));
            }
            else if (result) {
                resolve(result);
            }
            else {
                reject(new Error(`Failed to create ${proxyConstructor.name}`));
            }
        }, String(this.objectId), methodName, proxyConstructor, transfer, ...args));
    }
    callMethodPromise(methodName, ...args) {
        return new Promise((resolve, reject) => this.worker.callMethod((error, result) => {
            if (error) {
                reject(new Error(error));
            }
            else {
                resolve(result);
            }
        }, String(this.objectId), methodName, ...args));
    }
}
class HeapSnapshotLoaderProxy extends HeapSnapshotProxyObject {
    profileUid;
    snapshotReceivedCallback;
    constructor(worker, objectId, profileUid, snapshotReceivedCallback) {
        super(worker, objectId);
        this.profileUid = profileUid;
        this.snapshotReceivedCallback = snapshotReceivedCallback;
    }
    async write(chunk) {
        await this.callMethodPromise('write', chunk);
    }
    async close() {
        await this.callMethodPromise('close');
        const secondWorker = new HeapSnapshotWorkerProxy(() => { }, this.worker.console, this.worker.workerUrl);
        const channel = new MessageChannel();
        await secondWorker.setupForSecondaryInit(channel.port2);
        try {
            const snapshotProxy = await this.callFactoryMethodPromise('buildSnapshot', HeapSnapshotProxy, [channel.port1]);
            snapshotProxy.setProfileUid(this.profileUid);
            await snapshotProxy.updateStaticData();
            this.snapshotReceivedCallback(snapshotProxy);
        }
        finally {
            secondWorker.dispose();
            this.dispose();
        }
    }
}
class HeapSnapshotProxy extends HeapSnapshotProxyObject {
    staticData;
    profileUid;
    constructor(worker, objectId) {
        super(worker, objectId);
        this.staticData = null;
    }
    search(searchConfig, filter) {
        return this.callMethodPromise('search', searchConfig, filter);
    }
    interfaceDefinitions() {
        return this.callMethodPromise('interfaceDefinitions');
    }
    getNativeContextSizes() {
        return this.callMethodPromise('getNativeContextSizes');
    }
    getRetainedByContextSummary() {
        return this.callMethodPromise('getRetainedByContextSummary');
    }
    aggregatesWithFilter(filter) {
        return this.callMethodPromise('aggregatesWithFilter', filter);
    }
    getDuplicateStrings() {
        return this.callMethodPromise('getDuplicateStrings');
    }
    aggregatesForDiff(interfaceDefinitions) {
        return this.callMethodPromise('aggregatesForDiff', interfaceDefinitions);
    }
    calculateSnapshotDiff(baseSnapshotId, baseSnapshotAggregates) {
        return this.callMethodPromise('calculateSnapshotDiff', baseSnapshotId, baseSnapshotAggregates);
    }
    nodeClassKey(snapshotObjectId) {
        return this.callMethodPromise('nodeClassKey', snapshotObjectId);
    }
    nodeIndexForId(nodeId) {
        return this.callMethodPromise('nodeIndexForId', nodeId);
    }
    getObjectInfo(nodeIndex) {
        return this.callMethodPromise('getObjectInfo', nodeIndex);
    }
    analyzeContexts() {
        return this.callMethodPromise('analyzeContexts');
    }
    createEdgesProvider(nodeIndex, options) {
        return this.callFactoryMethod('createEdgesProvider', HeapSnapshotProviderProxy, nodeIndex, options);
    }
    createRetainingEdgesProvider(nodeIndex) {
        return this.callFactoryMethod('createRetainingEdgesProvider', HeapSnapshotProviderProxy, nodeIndex);
    }
    createAddedNodesProvider(baseSnapshotId, classKey) {
        return this.callFactoryMethod('createAddedNodesProvider', HeapSnapshotProviderProxy, baseSnapshotId, classKey);
    }
    createDeletedNodesProvider(nodeIndexes) {
        return this.callFactoryMethod('createDeletedNodesProvider', HeapSnapshotProviderProxy, nodeIndexes);
    }
    createNodesProvider(filter) {
        return this.callFactoryMethod('createNodesProvider', HeapSnapshotProviderProxy, filter);
    }
    createNodesProviderForClass(classKey, nodeFilter) {
        return this.callFactoryMethod('createNodesProviderForClass', HeapSnapshotProviderProxy, classKey, nodeFilter);
    }
    queryObjects(queryOptions) {
        return this.callFactoryMethod('queryObjects', HeapSnapshotProviderProxy, queryOptions);
    }
    allocationTracesTops() {
        return this.callMethodPromise('allocationTracesTops');
    }
    allocationNodeCallers(nodeId) {
        return this.callMethodPromise('allocationNodeCallers', nodeId);
    }
    allocationStack(nodeIndex) {
        return this.callMethodPromise('allocationStack', nodeIndex);
    }
    dispose() {
        throw new Error('Should never be called');
    }
    get nodeCount() {
        if (!this.staticData) {
            return 0;
        }
        return this.staticData.nodeCount;
    }
    get rootNodeIndex() {
        if (!this.staticData) {
            return 0;
        }
        return this.staticData.rootNodeIndex;
    }
    async updateStaticData() {
        this.staticData = await this.callMethodPromise('updateStaticData');
    }
    getStatistics() {
        return this.callMethodPromise('getStatistics');
    }
    getLocation(nodeIndex) {
        return this.callMethodPromise('getLocation', nodeIndex);
    }
    getSamples() {
        return this.callMethodPromise('getSamples');
    }
    ignoreNodeInRetainersView(nodeIndex) {
        return this.callMethodPromise('ignoreNodeInRetainersView', nodeIndex);
    }
    getRetainingPaths(nodeIndex, maxDepth, maxNodes, maxSiblings) {
        return this.callMethodPromise('getRetainingPaths', nodeIndex, maxDepth, maxNodes, maxSiblings);
    }
    getDominatorsOf(nodeIndex) {
        return this.callMethodPromise('getDominatorsOf', nodeIndex);
    }
    unignoreNodeInRetainersView(nodeIndex) {
        return this.callMethodPromise('unignoreNodeInRetainersView', nodeIndex);
    }
    unignoreAllNodesInRetainersView() {
        return this.callMethodPromise('unignoreAllNodesInRetainersView');
    }
    areNodesIgnoredInRetainersView() {
        return this.callMethodPromise('areNodesIgnoredInRetainersView');
    }
    get totalSize() {
        if (!this.staticData) {
            return 0;
        }
        return this.staticData.totalSize;
    }
    get uid() {
        return this.profileUid;
    }
    setProfileUid(profileUid) {
        this.profileUid = profileUid;
    }
    maxJSObjectId() {
        if (!this.staticData) {
            return 0;
        }
        return this.staticData.maxJSObjectId;
    }
}
class HeapSnapshotProviderProxy extends HeapSnapshotProxyObject {
    nodePosition(snapshotObjectId) {
        return this.callMethodPromise('nodePosition', snapshotObjectId);
    }
    isEmpty() {
        return this.callMethodPromise('isEmpty');
    }
    serializeItemsRange(startPosition, endPosition) {
        return this.callMethodPromise('serializeItemsRange', startPosition, endPosition);
    }
    async sortAndRewind(comparator) {
        await this.callMethodPromise('sortAndRewind', comparator);
    }
}

var HeapSnapshotProxy$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    HeapSnapshotLoaderProxy: HeapSnapshotLoaderProxy,
    HeapSnapshotProviderProxy: HeapSnapshotProviderProxy,
    HeapSnapshotProxy: HeapSnapshotProxy,
    HeapSnapshotProxyObject: HeapSnapshotProxyObject,
    HeapSnapshotWorkerProxy: HeapSnapshotWorkerProxy
});

// Copyright 2019 The Chromium Authors

var HeapSnapshotModel = /*#__PURE__*/Object.freeze({
    __proto__: null,
    ChildrenProvider: ChildrenProvider,
    HeapSnapshotModel: HeapSnapshotModel$1,
    HeapSnapshotProxy: HeapSnapshotProxy$1
});

// Copyright 2013 The Chromium Authors
class AllocationProfile {
    #strings;
    #nextNodeId = 1;
    #functionInfos = [];
    #idToNode = {};
    #idToTopDownNode = {};
    #collapsedTopNodeIdToFunctionInfo = {};
    #traceTops = null;
    constructor(profile, liveObjectStats) {
        this.#strings = profile.strings;
        this.#buildFunctionAllocationInfos(profile);
        this.#buildAllocationTree(profile, liveObjectStats);
    }
    #buildFunctionAllocationInfos(profile) {
        const strings = this.#strings;
        const functionInfoFields = profile.snapshot.meta.trace_function_info_fields;
        const functionNameOffset = functionInfoFields.indexOf('name');
        const scriptNameOffset = functionInfoFields.indexOf('script_name');
        const scriptIdOffset = functionInfoFields.indexOf('script_id');
        const lineOffset = functionInfoFields.indexOf('line');
        const columnOffset = functionInfoFields.indexOf('column');
        const functionInfoFieldCount = functionInfoFields.length;
        const rawInfos = profile.trace_function_infos;
        const infoLength = rawInfos.length;
        const functionInfos = this.#functionInfos = new Array(infoLength / functionInfoFieldCount);
        let index = 0;
        for (let i = 0; i < infoLength; i += functionInfoFieldCount) {
            functionInfos[index++] = new FunctionAllocationInfo(strings[rawInfos[i + functionNameOffset]], strings[rawInfos[i + scriptNameOffset]], rawInfos[i + scriptIdOffset], rawInfos[i + lineOffset], rawInfos[i + columnOffset]);
        }
    }
    #buildAllocationTree(profile, liveObjectStats) {
        const traceTreeRaw = profile.trace_tree;
        const functionInfos = this.#functionInfos;
        const idToTopDownNode = this.#idToTopDownNode;
        const traceNodeFields = profile.snapshot.meta.trace_node_fields;
        const nodeIdOffset = traceNodeFields.indexOf('id');
        const functionInfoIndexOffset = traceNodeFields.indexOf('function_info_index');
        const allocationCountOffset = traceNodeFields.indexOf('count');
        const allocationSizeOffset = traceNodeFields.indexOf('size');
        const childrenOffset = traceNodeFields.indexOf('children');
        const nodeFieldCount = traceNodeFields.length;
        function traverseNode(
        rawNodeArray, nodeOffset, parent) {
            const functionInfo = functionInfos[rawNodeArray[nodeOffset + functionInfoIndexOffset]];
            const id = rawNodeArray[nodeOffset + nodeIdOffset];
            const stats = liveObjectStats[id];
            const liveCount = stats ? stats.count : 0;
            const liveSize = stats ? stats.size : 0;
            const result = new TopDownAllocationNode(id, functionInfo, rawNodeArray[nodeOffset + allocationCountOffset], rawNodeArray[nodeOffset + allocationSizeOffset], liveCount, liveSize, parent);
            idToTopDownNode[id] = result;
            functionInfo.addTraceTopNode(result);
            const rawChildren = rawNodeArray[nodeOffset + childrenOffset];
            for (let i = 0; i < rawChildren.length; i += nodeFieldCount) {
                result.children.push(traverseNode(rawChildren, i, result));
            }
            return result;
        }
        return traverseNode(traceTreeRaw, 0, null);
    }
    serializeTraceTops() {
        if (this.#traceTops) {
            return this.#traceTops;
        }
        const result = this.#traceTops = [];
        const functionInfos = this.#functionInfos;
        for (let i = 0; i < functionInfos.length; i++) {
            const info = functionInfos[i];
            if (info.totalCount === 0) {
                continue;
            }
            const nodeId = this.#nextNodeId++;
            const isRoot = i === 0;
            result.push(this.#serializeNode(nodeId, info, info.totalCount, info.totalSize, info.totalLiveCount, info.totalLiveSize, !isRoot));
            this.#collapsedTopNodeIdToFunctionInfo[nodeId] = info;
        }
        result.sort(function (a, b) {
            return b.size - a.size;
        });
        return result;
    }
    serializeCallers(nodeId) {
        let node = this.#ensureBottomUpNode(nodeId);
        const nodesWithSingleCaller = [];
        while (node.callers().length === 1) {
            node = node.callers()[0];
            nodesWithSingleCaller.push(this.#serializeCaller(node));
        }
        const branchingCallers = [];
        const callers = node.callers();
        for (let i = 0; i < callers.length; i++) {
            branchingCallers.push(this.#serializeCaller(callers[i]));
        }
        return new AllocationNodeCallers(nodesWithSingleCaller, branchingCallers);
    }
    serializeAllocationStack(traceNodeId) {
        let node = this.#idToTopDownNode[traceNodeId];
        const result = [];
        while (node) {
            const functionInfo = node.functionInfo;
            result.push(new AllocationStackFrame(functionInfo.functionName, functionInfo.scriptName, functionInfo.scriptId, functionInfo.line, functionInfo.column));
            node = node.parent;
        }
        return result;
    }
    traceIds(allocationNodeId) {
        return this.#ensureBottomUpNode(allocationNodeId).traceTopIds;
    }
    #ensureBottomUpNode(nodeId) {
        let node = this.#idToNode[nodeId];
        if (!node) {
            const functionInfo = this.#collapsedTopNodeIdToFunctionInfo[nodeId];
            node = functionInfo.bottomUpRoot();
            delete this.#collapsedTopNodeIdToFunctionInfo[nodeId];
            this.#idToNode[nodeId] = node;
        }
        return node;
    }
    #serializeCaller(node) {
        const callerId = this.#nextNodeId++;
        this.#idToNode[callerId] = node;
        return this.#serializeNode(callerId, node.functionInfo, node.allocationCount, node.allocationSize, node.liveCount, node.liveSize, node.hasCallers());
    }
    #serializeNode(nodeId, functionInfo, count, size, liveCount, liveSize, hasChildren) {
        return new SerializedAllocationNode(nodeId, functionInfo.functionName, functionInfo.scriptName, functionInfo.scriptId, functionInfo.line, functionInfo.column, count, size, liveCount, liveSize, hasChildren);
    }
}
class TopDownAllocationNode {
    id;
    functionInfo;
    allocationCount;
    allocationSize;
    liveCount;
    liveSize;
    parent;
    children = [];
    constructor(id, functionInfo, count, size, liveCount, liveSize, parent) {
        this.id = id;
        this.functionInfo = functionInfo;
        this.allocationCount = count;
        this.allocationSize = size;
        this.liveCount = liveCount;
        this.liveSize = liveSize;
        this.parent = parent;
    }
}
class BottomUpAllocationNode {
    functionInfo;
    allocationCount = 0;
    allocationSize = 0;
    liveCount = 0;
    liveSize = 0;
    traceTopIds = [];
    #callers = [];
    constructor(functionInfo) {
        this.functionInfo = functionInfo;
    }
    addCaller(traceNode) {
        const functionInfo = traceNode.functionInfo;
        let result;
        for (let i = 0; i < this.#callers.length; i++) {
            const caller = this.#callers[i];
            if (caller.functionInfo === functionInfo) {
                result = caller;
                break;
            }
        }
        if (!result) {
            result = new BottomUpAllocationNode(functionInfo);
            this.#callers.push(result);
        }
        return result;
    }
    callers() {
        return this.#callers;
    }
    hasCallers() {
        return this.#callers.length > 0;
    }
}
class FunctionAllocationInfo {
    functionName;
    scriptName;
    scriptId;
    line;
    column;
    totalCount = 0;
    totalSize = 0;
    totalLiveCount = 0;
    totalLiveSize = 0;
    #traceTops = [];
    #bottomUpTree;
    constructor(functionName, scriptName, scriptId, line, column) {
        this.functionName = functionName;
        this.scriptName = scriptName;
        this.scriptId = scriptId;
        this.line = line;
        this.column = column;
    }
    addTraceTopNode(node) {
        if (node.allocationCount === 0) {
            return;
        }
        this.#traceTops.push(node);
        this.totalCount += node.allocationCount;
        this.totalSize += node.allocationSize;
        this.totalLiveCount += node.liveCount;
        this.totalLiveSize += node.liveSize;
    }
    bottomUpRoot() {
        if (!this.#traceTops.length) {
            return null;
        }
        if (!this.#bottomUpTree) {
            this.#buildAllocationTraceTree();
        }
        return this.#bottomUpTree ?? null;
    }
    #buildAllocationTraceTree() {
        this.#bottomUpTree = new BottomUpAllocationNode(this);
        for (let i = 0; i < this.#traceTops.length; i++) {
            let node = this.#traceTops[i];
            let bottomUpNode = this.#bottomUpTree;
            const count = node.allocationCount;
            const size = node.allocationSize;
            const liveCount = node.liveCount;
            const liveSize = node.liveSize;
            const traceId = node.id;
            while (true) {
                bottomUpNode.allocationCount += count;
                bottomUpNode.allocationSize += size;
                bottomUpNode.liveCount += liveCount;
                bottomUpNode.liveSize += liveSize;
                bottomUpNode.traceTopIds.push(traceId);
                node = node.parent;
                if (node === null) {
                    break;
                }
                bottomUpNode = bottomUpNode.addCaller(node);
            }
        }
    }
}

var AllocationProfile$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    AllocationProfile: AllocationProfile,
    BottomUpAllocationNode: BottomUpAllocationNode,
    FunctionAllocationInfo: FunctionAllocationInfo,
    TopDownAllocationNode: TopDownAllocationNode
});

// Copyright 2026 The Chromium Authors
function analyzeContexts(snapshot) {
    const scopesByScript = parseEmbeddedScopes(snapshot);
    const scan = scanHeap(snapshot);
    const liveFunctionsByScript = buildLiveFunctions(snapshot, scan.liveClosures, scan.finishedModuleFunctionNodeIndexes);
    const { scopes, scriptsWithoutScopes } = correlateContextsWithScopes(snapshot, scan, scopesByScript);
    const scopeAnalyses = classifyFields(snapshot, scopes, liveFunctionsByScript);
    return sortAndBuildResult(scopeAnalyses, scriptsWithoutScopes);
}
function parseEmbeddedScopes(snapshot) {
    const scopesByScript = new Map();
    const profile = snapshot.profile;
    const rawScopes = profile.scopes ?? [];
    const rawVars = profile.scope_context_vars ?? [];
    const rawUses = profile.scope_uses ?? [];
    const meta = profile.snapshot.meta;
    const scopeFields = meta.scope_fields ?? [];
    const varFields = meta.scope_context_var_fields ?? [];
    const useFields = meta.scope_use_fields ?? [];
    const scopeStride = scopeFields.length;
    const varStride = varFields.length;
    const useStride = useFields.length;
    if (scopeStride === 0) {
        return scopesByScript;
    }
    const scriptNodeIndexOffset = scopeFields.indexOf('script_node_index');
    const scopeIdOffset = scopeFields.indexOf('scope_id');
    const depthOffset = scopeFields.indexOf('depth');
    const varsCountOffset = scopeFields.indexOf('scope_context_vars_count');
    const usesCountOffset = scopeFields.indexOf('scope_uses_count');
    const varNameOffset = varFields.indexOf('name');
    const useDeclaringScopeIdOffset = useFields.indexOf('declaring_scope_id');
    const useSlotIndexOffset = useFields.indexOf('slot_index');
    const strings = snapshot.strings;
    let varOffset = 0;
    let currentScriptNodeIndex;
    const scopeStack = [];
    for (let i = 0; i < rawScopes.length; i += scopeStride) {
        const scriptNodeIndex = rawScopes[i + scriptNodeIndexOffset];
        const scopeId = rawScopes[i + scopeIdOffset];
        const depth = rawScopes[i + depthOffset];
        const varsCount = rawScopes[i + varsCountOffset];
        const variables = [];
        for (let j = 0; j < varsCount; ++j) {
            const nameIndex = rawVars[varOffset + j * varStride + varNameOffset];
            variables.push({
                name: strings[nameIndex],
                slotIndex: j,
                uses: [],
            });
        }
        varOffset += varsCount * varStride;
        const scope = {
            scriptNodeIndex,
            scopeId,
            children: [],
            variables,
        };
        if (currentScriptNodeIndex !== scriptNodeIndex) {
            currentScriptNodeIndex = scriptNodeIndex;
            scopeStack.length = 0;
        }
        if (depth > 0) {
            const parent = scopeStack[depth - 1];
            scope.parent = parent;
            parent.children.push(scope);
        }
        scopeStack[depth] = scope;
        scopeStack.length = depth + 1;
        let scriptScopes = scopesByScript.get(scriptNodeIndex);
        if (!scriptScopes) {
            scriptScopes = new Map();
            scopesByScript.set(scriptNodeIndex, scriptScopes);
        }
        scriptScopes.set(scopeId, scope);
    }
    let useOffset = 0;
    for (let i = 0; i < rawScopes.length; i += scopeStride) {
        const scriptNodeIndex = rawScopes[i + scriptNodeIndexOffset];
        const scopeId = rawScopes[i + scopeIdOffset];
        const usesCount = rawScopes[i + usesCountOffset];
        const scope = scopesByScript.get(scriptNodeIndex)?.get(scopeId);
        if (scope) {
            for (let j = 0; j < usesCount; ++j) {
                const declaringScopeId = rawUses[useOffset + j * useStride + useDeclaringScopeIdOffset];
                const slotIndex = rawUses[useOffset + j * useStride + useSlotIndexOffset];
                const declaringScope = scopesByScript.get(scriptNodeIndex)?.get(declaringScopeId);
                const variable = declaringScope?.variables[slotIndex];
                if (variable && !variable.uses.includes(scope)) {
                    variable.uses.push(scope);
                }
            }
        }
        useOffset += usesCount * useStride;
    }
    return scopesByScript;
}
function scanHeap(snapshot) {
    const scripts = new Map();
    const contextNodes = [];
    const liveClosures = [];
    const finishedModuleFunctionNodeIndexes = new Set();
    const generatorMapNodeIndexes = new Map();
    const scopeInfoScriptNodeIndexes = new Map();
    const node = snapshot.createNode();
    const nodes = snapshot.nodes;
    const nodeFieldCount = snapshot.nodeFieldCount;
    const nodeClosureType = snapshot.nodeClosureType;
    for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += nodeFieldCount) {
        node.nodeIndex = nodeIndex;
        const rawName = node.rawName();
        if (rawName.startsWith('system / Script')) {
            processScript(scripts, node);
            processScriptScopeInfos(scopeInfoScriptNodeIndexes, node);
        }
        else if (snapshot.isContextObject(node)) {
            processContext(contextNodes, node);
        }
        else if (node.rawType() === nodeClosureType) {
            processClosure(liveClosures, node);
        }
        else if (isGeneratorObject(generatorMapNodeIndexes, node)) {
            processGeneratorObject(liveClosures, finishedModuleFunctionNodeIndexes, node);
        }
    }
    return { scripts, contextNodes, liveClosures, finishedModuleFunctionNodeIndexes, scopeInfoScriptNodeIndexes };
}
function processScript(scripts, node) {
    const rawName = node.rawName();
    const scriptNodeIndex = node.nodeIndex;
    const scriptNamePrefix = 'system / Script / ';
    let name = rawName.startsWith(scriptNamePrefix) ? rawName.substring(scriptNamePrefix.length) : '';
    if (!name) {
        name = node.findInternalEdgeTarget('source_url')?.name() ?? '';
    }
    scripts.set(scriptNodeIndex, {
        name,
        nodeId: node.id(),
    });
}
function processScriptScopeInfos(scopeInfoScriptNodeIndexes, scriptNode) {
    const infos = scriptNode.findInternalEdgeTarget('infos');
    if (!infos) {
        return;
    }
    const scriptNodeIndex = scriptNode.nodeIndex;
    const scopeInfoNode = scriptNode.snapshot.createNode();
    const evalFromScopeInfo = scriptNode.findInternalEdgeTarget('eval_from_scope_info');
    const stopAtNodeIndex = evalFromScopeInfo?.rawName() === 'system / ScopeInfo' ?
        evalFromScopeInfo.nodeIndex :
        undefined;
    for (let iter = infos.edges(); iter.hasNext(); iter.next()) {
        const info = iter.edge.node();
        const infoName = info.rawName();
        if (infoName === 'system / ScopeInfo') {
            attributeScopeInfoChain(scopeInfoScriptNodeIndexes, info.nodeIndex, stopAtNodeIndex, scriptNodeIndex, scopeInfoNode);
            continue;
        }
        if (!infoName.startsWith('system / SharedFunctionInfo')) {
            continue;
        }
        const sharedFunctionInfo = info;
        const scopeInfo = sharedFunctionInfo.findInternalEdgeTarget('name_or_scope_info');
        if (scopeInfo?.rawName() === 'system / ScopeInfo') {
            attributeScopeInfoChain(scopeInfoScriptNodeIndexes, scopeInfo.nodeIndex, stopAtNodeIndex, scriptNodeIndex, scopeInfoNode);
            continue;
        }
        const scopeId = sharedFunctionInfo.findInternalEdgeTarget('scope_id')?.nodeValueAsInt();
        if (scopeId === undefined || isScriptRootScopeId(scopeId)) {
            continue;
        }
        const outerScopeInfo = sharedFunctionInfo.findInternalEdgeTarget('raw_outer_scope_info_or_feedback_metadata');
        if (outerScopeInfo?.rawName() === 'system / ScopeInfo') {
            attributeScopeInfoChain(scopeInfoScriptNodeIndexes, outerScopeInfo.nodeIndex, stopAtNodeIndex, scriptNodeIndex, scopeInfoNode);
        }
    }
}
function attributeScopeInfoChain(scopeInfoScriptNodeIndexes, scopeInfoNodeIndex, stopAtNodeIndex, scriptNodeIndex, scopeInfoNode) {
    let currentNodeIndex = scopeInfoNodeIndex;
    for (;;) {
        if (currentNodeIndex === stopAtNodeIndex) {
            return;
        }
        if (scopeInfoScriptNodeIndexes.has(currentNodeIndex)) {
            return;
        }
        scopeInfoScriptNodeIndexes.set(currentNodeIndex, scriptNodeIndex);
        scopeInfoNode.nodeIndex = currentNodeIndex;
        if (isScriptRootScopeInfo(scopeInfoNode)) {
            return;
        }
        const outerScopeInfo = scopeInfoNode.findInternalEdgeTarget('outer_scope_info');
        if (!outerScopeInfo) {
            return;
        }
        currentNodeIndex = outerScopeInfo.nodeIndex;
    }
}
function isScriptRootScopeInfo(node) {
    const scopeId = node.findInternalEdgeTarget('scope_id')?.nodeValueAsInt();
    return scopeId !== undefined && isScriptRootScopeId(scopeId);
}
function isScriptRootScopeId(scopeId) {
    return scopeId === -2;
}
function processContext(contextNodes, node) {
    const scopeInfoNodeIndex = node.findInternalEdgeTarget('scope_info')?.nodeIndex;
    if (scopeInfoNodeIndex === undefined) {
        return;
    }
    contextNodes.push({
        contextNodeIndex: node.nodeIndex,
        contextNodeId: node.id(),
        scopeInfoNodeIndex,
    });
}
function processClosure(liveClosures, node) {
    const sharedFunctionInfo = node.findInternalEdgeTarget('shared');
    const closureContext = node.findInternalEdgeTarget('context');
    if (!sharedFunctionInfo || !closureContext) {
        return;
    }
    addLiveClosure(liveClosures, node, sharedFunctionInfo, closureContext);
}
function addLiveClosure(liveClosures, ownerNode, sharedFunctionInfo, contextNode) {
    const script = sharedFunctionInfo.findInternalEdgeTarget('script');
    if (!script) {
        return;
    }
    const scopeId = sharedFunctionInfo.findInternalEdgeTarget('scope_id')?.nodeValueAsInt();
    if (scopeId !== undefined) {
        liveClosures.push({
            ownerNodeIndex: ownerNode.nodeIndex,
            contextNodeIndex: contextNode.nodeIndex,
            scriptNodeIndex: script.nodeIndex,
            scopeId,
        });
    }
}
const GENERATOR_CLOSED = -1;
function processGeneratorObject(liveClosures, finishedModuleFunctionNodeIndexes, node) {
    const continuation = node.findInternalEdgeTarget('continuation')?.nodeValueAsInt();
    const generatorFunction = node.findInternalEdgeTarget('function');
    if (continuation === undefined || generatorFunction?.rawType() !== node.snapshot.nodeClosureType) {
        return;
    }
    const sharedFunctionInfo = generatorFunction.findInternalEdgeTarget('shared');
    if (!sharedFunctionInfo) {
        return;
    }
    if (continuation === GENERATOR_CLOSED) {
        const scopeId = sharedFunctionInfo.findInternalEdgeTarget('scope_id')?.nodeValueAsInt();
        if (scopeId !== undefined && isScriptRootScopeId(scopeId)) {
            finishedModuleFunctionNodeIndexes.add(generatorFunction.nodeIndex);
        }
        return;
    }
    const generatorContext = node.findInternalEdgeTarget('context');
    if (generatorContext) {
        addLiveClosure(liveClosures, node, sharedFunctionInfo, generatorContext);
    }
}
const GENERATOR_INSTANCE_TYPE_NAMES = new Set([
    'JS_GENERATOR_OBJECT_TYPE',
    'JS_ASYNC_FUNCTION_OBJECT_TYPE',
    'JS_ASYNC_GENERATOR_OBJECT_TYPE',
]);
function isGeneratorObject(generatorMapNodeIndexes, node) {
    if (node.rawType() !== node.snapshot.nodeObjectType) {
        return false;
    }
    const map = node.findInternalEdgeTarget('map');
    if (!map) {
        return false;
    }
    const mapNodeIndex = map.nodeIndex;
    let isGenerator = generatorMapNodeIndexes.get(mapNodeIndex);
    if (isGenerator === undefined) {
        const instanceTypeName = map.findInternalEdgeTarget('instance_type_name')?.rawName();
        isGenerator = instanceTypeName !== undefined && GENERATOR_INSTANCE_TYPE_NAMES.has(instanceTypeName);
        generatorMapNodeIndexes.set(mapNodeIndex, isGenerator);
    }
    return isGenerator;
}
function buildLiveFunctions(snapshot, liveClosures, finishedModuleFunctionNodeIndexes) {
    const liveFunctionsByScript = new Map();
    const node = snapshot.createNode();
    for (const closure of liveClosures) {
        if (finishedModuleFunctionNodeIndexes.has(closure.ownerNodeIndex)) {
            continue;
        }
        let scriptFunctions = liveFunctionsByScript.get(closure.scriptNodeIndex);
        if (!scriptFunctions) {
            scriptFunctions = new Map();
            liveFunctionsByScript.set(closure.scriptNodeIndex, scriptFunctions);
        }
        let liveFunction = scriptFunctions.get(closure.scopeId);
        if (!liveFunction) {
            liveFunction = {
                contextNodeIndexes: new Set(),
            };
            scriptFunctions.set(closure.scopeId, liveFunction);
        }
        let contextNodeIndex = closure.contextNodeIndex;
        while (contextNodeIndex !== undefined && !liveFunction.contextNodeIndexes.has(contextNodeIndex)) {
            node.nodeIndex = contextNodeIndex;
            if (!snapshot.isContextObject(node)) {
                break;
            }
            liveFunction.contextNodeIndexes.add(contextNodeIndex);
            contextNodeIndex = node.findInternalEdgeTarget('previous')?.nodeIndex;
        }
    }
    return liveFunctionsByScript;
}
function correlateContextsWithScopes(snapshot, scan, scopesByScript) {
    const scriptsWithoutScopesByScript = new Map();
    const scopes = new Map();
    const node = snapshot.createNode();
    for (const context of scan.contextNodes) {
        const scopeInfoNodeIndex = context.scopeInfoNodeIndex;
        const existingScope = scopes.get(scopeInfoNodeIndex);
        if (existingScope) {
            const fieldValueNodeIndexes = [];
            node.nodeIndex = context.contextNodeIndex;
            for (const edges = node.edges(); edges.hasNext(); edges.next()) {
                const edge = edges.item();
                if (edge.type() === 'context') {
                    fieldValueNodeIndexes.push(edge.nodeIndex());
                }
            }
            existingScope.contexts.push({
                contextNodeIndex: context.contextNodeIndex,
                contextNodeId: context.contextNodeId,
                fieldValueNodeIndexes,
            });
            continue;
        }
        node.nodeIndex = scopeInfoNodeIndex;
        const scopeId = node.findInternalEdgeTarget('scope_id')?.nodeValueAsInt();
        if (scopeId === undefined) {
            continue;
        }
        const scopeInfoNodeId = node.id();
        const scopeStart = node.findInternalEdgeTarget('start_position')?.nodeValueAsInt() ?? 0;
        const scopeEnd = node.findInternalEdgeTarget('end_position')?.nodeValueAsInt() ?? 0;
        const scopeName = node.findInternalEdgeTarget('function_name')?.name();
        const scriptNodeIndex = resolveScopeInfoScriptNodeIndex(snapshot, scan.scopeInfoScriptNodeIndexes, scopeInfoNodeIndex);
        const script = scriptNodeIndex !== undefined ? scan.scripts.get(scriptNodeIndex) : undefined;
        if (scriptNodeIndex === undefined || !script) {
            continue;
        }
        const existingScriptWithoutScopes = scriptsWithoutScopesByScript.get(scriptNodeIndex);
        if (existingScriptWithoutScopes) {
            existingScriptWithoutScopes.contextCount++;
            continue;
        }
        const embeddedScopes = scopesByScript.get(scriptNodeIndex);
        if (!embeddedScopes) {
            scriptsWithoutScopesByScript.set(scriptNodeIndex, {
                scriptNodeIndex,
                scriptNodeId: script.nodeId,
                scriptName: script.name,
                contextCount: 1,
            });
            continue;
        }
        const embeddedScope = embeddedScopes.get(scopeId);
        if (!embeddedScope) {
            continue;
        }
        const fieldNames = [];
        const fieldValueNodeIndexes = [];
        node.nodeIndex = context.contextNodeIndex;
        for (const edges = node.edges(); edges.hasNext(); edges.next()) {
            const edge = edges.item();
            if (edge.type() === 'context') {
                fieldNames.push(edge.name());
                fieldValueNodeIndexes.push(edge.nodeIndex());
            }
        }
        scopes.set(scopeInfoNodeIndex, {
            scopeInfoNodeIndex,
            scopeInfoNodeId,
            scriptNodeIndex,
            scriptNodeId: script.nodeId,
            scriptName: script.name,
            scopeName,
            scopeStart,
            scopeEnd,
            scope: embeddedScope,
            fieldNames,
            contexts: [{
                    contextNodeIndex: context.contextNodeIndex,
                    contextNodeId: context.contextNodeId,
                    fieldValueNodeIndexes,
                }],
        });
    }
    return {
        scopes,
        scriptsWithoutScopes: [...scriptsWithoutScopesByScript.values()],
    };
}
function resolveScopeInfoScriptNodeIndex(snapshot, scopeInfoScriptNodeIndexes, scopeInfoNodeIndex) {
    if (scopeInfoScriptNodeIndexes.has(scopeInfoNodeIndex)) {
        return scopeInfoScriptNodeIndexes.get(scopeInfoNodeIndex);
    }
    const visited = [];
    const seen = new Set();
    const node = snapshot.createNode();
    let currentNodeIndex = scopeInfoNodeIndex;
    let scriptNodeIndex;
    while (!seen.has(currentNodeIndex)) {
        if (scopeInfoScriptNodeIndexes.has(currentNodeIndex)) {
            scriptNodeIndex = scopeInfoScriptNodeIndexes.get(currentNodeIndex);
            break;
        }
        seen.add(currentNodeIndex);
        visited.push(currentNodeIndex);
        node.nodeIndex = currentNodeIndex;
        if (isScriptRootScopeInfo(node)) {
            break;
        }
        const outerScopeInfo = node.findInternalEdgeTarget('outer_scope_info');
        if (!outerScopeInfo) {
            break;
        }
        currentNodeIndex = outerScopeInfo.nodeIndex;
    }
    for (const visitedNodeIndex of visited) {
        scopeInfoScriptNodeIndexes.set(visitedNodeIndex, scriptNodeIndex);
    }
    return scriptNodeIndex;
}
function classifyFields(snapshot, scopes, liveFunctionsByScript) {
    const scopeAnalyses = [];
    const node = snapshot.createNode();
    for (const scope of scopes.values()) {
        const scopeContexts = [];
        for (const context of scope.contexts) {
            let contextDeadFieldsRetainedSizeSum = 0;
            const deadFields = [];
            for (let fieldIndex = 0; fieldIndex < context.fieldValueNodeIndexes.length; ++fieldIndex) {
                const fieldName = scope.fieldNames[fieldIndex];
                const variable = scope.scope.variables.find(v => v.name === fieldName);
                if (!variable) {
                    continue;
                }
                if (isVariableUsedInContext(liveFunctionsByScript, scope.scriptNodeIndex, context.contextNodeIndex, variable)) {
                    continue;
                }
                const fieldValueNodeIndex = context.fieldValueNodeIndexes[fieldIndex];
                node.nodeIndex = fieldValueNodeIndex;
                const retainedSize = node.retainedSize();
                deadFields.push({
                    name: fieldName,
                    valueNodeIndex: fieldValueNodeIndex,
                    valueNodeId: node.id(),
                    valueName: node.name(),
                    valueType: node.type(),
                    selfSize: node.selfSize(),
                    retainedSize,
                });
                contextDeadFieldsRetainedSizeSum += retainedSize;
            }
            if (deadFields.length === 0) {
                continue;
            }
            node.nodeIndex = context.contextNodeIndex;
            scopeContexts.push({
                contextNodeIndex: context.contextNodeIndex,
                contextNodeId: node.id(),
                retainedSize: node.retainedSize(),
                deadFieldsRetainedSizeSum: contextDeadFieldsRetainedSizeSum,
                deadFields,
            });
        }
        if (scopeContexts.length === 0) {
            continue;
        }
        scopeAnalyses.push({
            scopeInfoNodeIndex: scope.scopeInfoNodeIndex,
            scopeInfoNodeId: scope.scopeInfoNodeId,
            scriptNodeIndex: scope.scriptNodeIndex,
            scriptNodeId: scope.scriptNodeId,
            scriptName: scope.scriptName,
            scopeName: scope.scopeName,
            scopeStart: scope.scopeStart,
            scopeEnd: scope.scopeEnd,
            contextFieldCount: scope.fieldNames.length,
            contexts: scopeContexts,
        });
    }
    return scopeAnalyses;
}
function isVariableUsedInContext(liveFunctionsByScript, scriptNodeIndex, contextNodeIndex, variable) {
    const liveFunctionsByScopeId = liveFunctionsByScript.get(scriptNodeIndex);
    if (!liveFunctionsByScopeId) {
        return false;
    }
    for (const usingScope of variable.uses) {
        for (let curr = usingScope; curr; curr = curr.parent) {
            const liveFunction = liveFunctionsByScopeId.get(curr.scopeId);
            if (liveFunction?.contextNodeIndexes.has(contextNodeIndex)) {
                return true;
            }
        }
    }
    return false;
}
function sortAndBuildResult(scopeAnalyses, scriptsWithoutScopes) {
    const compareContexts = (left, right) => {
        return right.deadFieldsRetainedSizeSum - left.deadFieldsRetainedSizeSum || right.retainedSize - left.retainedSize ||
            left.contextNodeIndex - right.contextNodeIndex;
    };
    for (const scope of scopeAnalyses) {
        for (const context of scope.contexts) {
            context.deadFields.sort((left, right) => right.retainedSize - left.retainedSize);
        }
        scope.contexts.sort(compareContexts);
    }
    scopeAnalyses.sort((left, right) => compareContexts(left.contexts[0], right.contexts[0]));
    scriptsWithoutScopes.sort((left, right) => left.scriptNodeIndex - right.scriptNodeIndex);
    return { scopes: scopeAnalyses, scriptsWithoutScopes };
}

// Copyright 2011 The Chromium Authors
var _a;
class HeapSnapshotEdge {
    snapshot;
    edges;
    edgeIndex;
    constructor(snapshot, edgeIndex) {
        this.snapshot = snapshot;
        this.edges = snapshot.containmentEdges;
        this.edgeIndex = edgeIndex || 0;
    }
    clone() {
        return new HeapSnapshotEdge(this.snapshot, this.edgeIndex);
    }
    hasStringName() {
        throw new Error('Not implemented');
    }
    name() {
        throw new Error('Not implemented');
    }
    node() {
        return this.snapshot.createNode(this.nodeIndex());
    }
    nodeIndex() {
        if (typeof this.snapshot.edgeToNodeOffset === 'undefined') {
            throw new Error('edgeToNodeOffset is undefined');
        }
        return this.edges.getValue(this.edgeIndex + this.snapshot.edgeToNodeOffset);
    }
    toString() {
        return 'HeapSnapshotEdge: ' + this.name();
    }
    type() {
        return this.snapshot.edgeTypes[this.rawType()];
    }
    itemIndex() {
        return this.edgeIndex;
    }
    serialize() {
        return new Edge(this.name(), this.node().serialize(), this.type(), this.edgeIndex);
    }
    rawType() {
        if (typeof this.snapshot.edgeTypeOffset === 'undefined') {
            throw new Error('edgeTypeOffset is undefined');
        }
        return this.edges.getValue(this.edgeIndex + this.snapshot.edgeTypeOffset);
    }
    isInternal() {
        throw new Error('Not implemented');
    }
    isInvisible() {
        throw new Error('Not implemented');
    }
    isWeak() {
        throw new Error('Not implemented');
    }
    getValueForSorting(_fieldName) {
        throw new Error('Not implemented');
    }
    nameIndex() {
        throw new Error('Not implemented');
    }
}
class HeapSnapshotNodeIndexProvider {
    #node;
    constructor(snapshot) {
        this.#node = snapshot.createNode();
    }
    itemForIndex(index) {
        this.#node.nodeIndex = index;
        return this.#node;
    }
}
class HeapSnapshotEdgeIndexProvider {
    #edge;
    constructor(snapshot) {
        this.#edge = snapshot.createEdge(0);
    }
    itemForIndex(index) {
        this.#edge.edgeIndex = index;
        return this.#edge;
    }
}
class HeapSnapshotRetainerEdgeIndexProvider {
    #retainerEdge;
    constructor(snapshot) {
        this.#retainerEdge = snapshot.createRetainingEdge(0);
    }
    itemForIndex(index) {
        this.#retainerEdge.setRetainerIndex(index);
        return this.#retainerEdge;
    }
}
class HeapSnapshotEdgeIterator {
    #sourceNode;
    edge;
    constructor(node) {
        this.#sourceNode = node;
        this.edge = node.snapshot.createEdge(node.edgeIndexesStart());
    }
    hasNext() {
        return this.edge.edgeIndex < this.#sourceNode.edgeIndexesEnd();
    }
    item() {
        return this.edge;
    }
    next() {
        if (typeof this.edge.snapshot.edgeFieldsCount === 'undefined') {
            throw new Error('edgeFieldsCount is undefined');
        }
        this.edge.edgeIndex += this.edge.snapshot.edgeFieldsCount;
    }
}
class HeapSnapshotRetainerEdge {
    snapshot;
    #retainerIndex;
    #globalEdgeIndex;
    #retainingNodeIndex;
    #edgeInstance;
    #nodeInstance;
    constructor(snapshot, retainerIndex) {
        this.snapshot = snapshot;
        this.setRetainerIndex(retainerIndex);
    }
    clone() {
        return new HeapSnapshotRetainerEdge(this.snapshot, this.retainerIndex());
    }
    hasStringName() {
        return this.edge().hasStringName();
    }
    name() {
        return this.edge().name();
    }
    nameIndex() {
        return this.edge().nameIndex();
    }
    node() {
        return this.#node();
    }
    nodeIndex() {
        if (typeof this.#retainingNodeIndex === 'undefined') {
            throw new Error('retainingNodeIndex is undefined');
        }
        return this.#retainingNodeIndex;
    }
    retainerIndex() {
        return this.#retainerIndex;
    }
    setRetainerIndex(retainerIndex) {
        if (retainerIndex === this.#retainerIndex) {
            return;
        }
        if (!this.snapshot.retainingEdges || !this.snapshot.retainingNodes) {
            throw new Error('Snapshot does not contain retaining edges or retaining nodes');
        }
        this.#retainerIndex = retainerIndex;
        this.#globalEdgeIndex = this.snapshot.retainingEdges[retainerIndex];
        this.#retainingNodeIndex = this.snapshot.retainingNodes[retainerIndex];
        this.#edgeInstance = null;
        this.#nodeInstance = null;
    }
    set edgeIndex(edgeIndex) {
        this.setRetainerIndex(edgeIndex);
    }
    #node() {
        if (!this.#nodeInstance) {
            this.#nodeInstance = this.snapshot.createNode(this.#retainingNodeIndex);
        }
        return this.#nodeInstance;
    }
    edge() {
        if (!this.#edgeInstance) {
            this.#edgeInstance = this.snapshot.createEdge(this.#globalEdgeIndex);
        }
        return this.#edgeInstance;
    }
    toString() {
        return this.edge().toString();
    }
    itemIndex() {
        return this.#retainerIndex;
    }
    serialize() {
        const node = this.node();
        const serializedNode = node.serialize();
        serializedNode.distance = this.#distance();
        serializedNode.ignored = this.snapshot.isNodeIgnoredInRetainersView(node.nodeIndex);
        return new Edge(this.name(), serializedNode, this.type(), this.#globalEdgeIndex);
    }
    type() {
        return this.edge().type();
    }
    isInternal() {
        return this.edge().isInternal();
    }
    getValueForSorting(fieldName) {
        if (fieldName === '!edgeDistance') {
            return this.#distance();
        }
        throw new Error('Invalid field name');
    }
    #distance() {
        if (this.snapshot.isEdgeIgnoredInRetainersView(this.#globalEdgeIndex)) {
            return baseUnreachableDistance;
        }
        return this.node().distanceForRetainersView();
    }
}
class HeapSnapshotRetainerEdgeIterator {
    #retainersEnd;
    retainer;
    constructor(retainedNode) {
        const snapshot = retainedNode.snapshot;
        const retainedNodeOrdinal = retainedNode.ordinal();
        if (!snapshot.firstRetainerIndex) {
            throw new Error('Snapshot does not contain firstRetainerIndex');
        }
        const retainerIndex = snapshot.firstRetainerIndex[retainedNodeOrdinal];
        this.#retainersEnd = snapshot.firstRetainerIndex[retainedNodeOrdinal + 1];
        this.retainer = snapshot.createRetainingEdge(retainerIndex);
    }
    hasNext() {
        return this.retainer.retainerIndex() < this.#retainersEnd;
    }
    item() {
        return this.retainer;
    }
    next() {
        this.retainer.setRetainerIndex(this.retainer.retainerIndex() + 1);
    }
}
class HeapSnapshotNode {
    snapshot;
    nodeIndex;
    constructor(snapshot, nodeIndex) {
        this.snapshot = snapshot;
        this.nodeIndex = nodeIndex || 0;
    }
    distance() {
        return this.snapshot.nodeDistances[this.nodeIndex / this.snapshot.nodeFieldCount];
    }
    distanceForRetainersView() {
        return this.snapshot.getDistanceForRetainersView(this.nodeIndex);
    }
    className() {
        return this.snapshot.strings[this.classIndex()];
    }
    classIndex() {
        return this.#detachednessAndClassIndex() >>> SHIFT_FOR_CLASS_INDEX;
    }
    classKeyInternal() {
        if (this.rawType() !== this.snapshot.nodeObjectType) {
            return this.classIndex();
        }
        const location = this.snapshot.getLocation(this.nodeIndex);
        return location ? `${location.scriptId},${location.lineNumber},${location.columnNumber},${this.className()}` :
            this.classIndex();
    }
    setClassIndex(index) {
        let value = this.#detachednessAndClassIndex();
        value &= BITMASK_FOR_DOM_LINK_STATE;
        value |= (index << SHIFT_FOR_CLASS_INDEX);
        this.#setDetachednessAndClassIndex(value);
        if (this.classIndex() !== index) {
            throw new Error('String index overflow');
        }
    }
    dominatorIndex() {
        const nodeFieldCount = this.snapshot.nodeFieldCount;
        return this.snapshot.dominatorsTree[this.nodeIndex / this.snapshot.nodeFieldCount] * nodeFieldCount;
    }
    edges() {
        return new HeapSnapshotEdgeIterator(this);
    }
    edgesCount() {
        return (this.edgeIndexesEnd() - this.edgeIndexesStart()) / this.snapshot.edgeFieldsCount;
    }
    id() {
        throw new Error('Not implemented');
    }
    rawName() {
        return this.snapshot.strings[this.rawNameIndex()];
    }
    isRoot() {
        return this.nodeIndex === this.snapshot.rootNodeIndex;
    }
    isUserRoot() {
        throw new Error('Not implemented');
    }
    isHidden() {
        throw new Error('Not implemented');
    }
    isArray() {
        throw new Error('Not implemented');
    }
    isSynthetic() {
        throw new Error('Not implemented');
    }
    isDocumentDOMTreesRoot() {
        throw new Error('Not implemented');
    }
    name() {
        return this.rawName();
    }
    retainedSize() {
        return this.snapshot.retainedSizes[this.ordinal()];
    }
    retainers() {
        return new HeapSnapshotRetainerEdgeIterator(this);
    }
    retainersCount() {
        const snapshot = this.snapshot;
        const ordinal = this.ordinal();
        return snapshot.firstRetainerIndex[ordinal + 1] - snapshot.firstRetainerIndex[ordinal];
    }
    selfSize() {
        const snapshot = this.snapshot;
        return snapshot.nodes.getValue(this.nodeIndex + snapshot.nodeSelfSizeOffset);
    }
    type() {
        return this.snapshot.nodeTypes[this.rawType()];
    }
    traceNodeId() {
        const snapshot = this.snapshot;
        return snapshot.nodes.getValue(this.nodeIndex + snapshot.nodeTraceNodeIdOffset);
    }
    itemIndex() {
        return this.nodeIndex;
    }
    serialize() {
        return new Node(this.id(), this.name(), this.distance(), this.nodeIndex, this.retainedSize(), this.selfSize(), this.type());
    }
    rawNameIndex() {
        const snapshot = this.snapshot;
        return snapshot.nodes.getValue(this.nodeIndex + snapshot.nodeNameOffset);
    }
    edgeIndexesStart() {
        return this.snapshot.firstEdgeIndexes[this.ordinal()];
    }
    edgeIndexesEnd() {
        return this.snapshot.firstEdgeIndexes[this.ordinal() + 1];
    }
    ordinal() {
        return this.nodeIndex / this.snapshot.nodeFieldCount;
    }
    nextNodeIndex() {
        return this.nodeIndex + this.snapshot.nodeFieldCount;
    }
    rawType() {
        const snapshot = this.snapshot;
        return snapshot.nodes.getValue(this.nodeIndex + snapshot.nodeTypeOffset);
    }
    isFlatConsString() {
        if (this.rawType() !== this.snapshot.nodeConsStringType) {
            return false;
        }
        for (let iter = this.edges(); iter.hasNext(); iter.next()) {
            const edge = iter.edge;
            if (!edge.isInternal()) {
                continue;
            }
            const edgeName = edge.name();
            if ((edgeName === 'first' || edgeName === 'second') && edge.node().name() === '') {
                return true;
            }
        }
        return false;
    }
    #detachednessAndClassIndex() {
        return this.snapshot.detachednessAndClassIndexArray[this.nodeIndex / this.snapshot.nodeFieldCount];
    }
    #setDetachednessAndClassIndex(value) {
        this.snapshot.detachednessAndClassIndexArray[this.nodeIndex / this.snapshot.nodeFieldCount] = value;
    }
    detachedness() {
        return this.#detachednessAndClassIndex() & BITMASK_FOR_DOM_LINK_STATE;
    }
    setDetachedness(detachedness) {
        let value = this.#detachednessAndClassIndex();
        value &= ~BITMASK_FOR_DOM_LINK_STATE;
        value |= detachedness;
        this.#setDetachednessAndClassIndex(value);
    }
    findInternalEdgeTarget(name) {
        for (let iter = this.edges(); iter.hasNext(); iter.next()) {
            const edge = iter.edge;
            if (!edge.isInternal()) {
                continue;
            }
            if (edge.name() === name) {
                return edge.node();
            }
        }
        return undefined;
    }
    nodeValueAsBool() {
        if (this.rawType() !== this.snapshot.nodeNumberType) {
            return undefined;
        }
        if (this.rawName() !== 'bool') {
            return undefined;
        }
        const valNode = this.findInternalEdgeTarget('value');
        if (!valNode) {
            return undefined;
        }
        const rawName = valNode.rawName();
        if (rawName === 'true') {
            return true;
        }
        if (rawName === 'false') {
            return false;
        }
        return undefined;
    }
    nodeValueAsInt() {
        if (this.rawType() !== this.snapshot.nodeNumberType) {
            return undefined;
        }
        if (this.rawName() !== 'int') {
            return undefined;
        }
        const valNode = this.findInternalEdgeTarget('value');
        if (!valNode) {
            return undefined;
        }
        const value = parseInt(valNode.rawName(), 10);
        return isNaN(value) ? undefined : value;
    }
    nodeStringLength() {
        const lengthNode = this.findInternalEdgeTarget('length');
        return lengthNode ? lengthNode.nodeValueAsInt() : undefined;
    }
    nodeStringHash() {
        const hashNode = this.findInternalEdgeTarget('hash');
        return hashNode ? hashNode.nodeValueAsInt() : undefined;
    }
    nodeIsTruncatedString() {
        const truncNode = this.findInternalEdgeTarget('truncated');
        if (!truncNode) {
            return false;
        }
        return truncNode.nodeValueAsBool() === true;
    }
}
class HeapSnapshotNodeIterator {
    node;
    #nodesLength;
    constructor(node) {
        this.node = node;
        this.#nodesLength = node.snapshot.nodes.length;
    }
    hasNext() {
        return this.node.nodeIndex < this.#nodesLength;
    }
    item() {
        return this.node;
    }
    next() {
        this.node.nodeIndex = this.node.nextNodeIndex();
    }
}
class HeapSnapshotIndexRangeIterator {
    #itemProvider;
    #indexes;
    #position;
    constructor(itemProvider, indexes) {
        this.#itemProvider = itemProvider;
        this.#indexes = indexes;
        this.#position = 0;
    }
    hasNext() {
        return this.#position < this.#indexes.length;
    }
    item() {
        const index = this.#indexes[this.#position];
        return this.#itemProvider.itemForIndex(index);
    }
    next() {
        ++this.#position;
    }
}
class HeapSnapshotFilteredIterator {
    #iterator;
    #filter;
    constructor(iterator, filter) {
        this.#iterator = iterator;
        this.#filter = filter;
        this.skipFilteredItems();
    }
    hasNext() {
        return this.#iterator.hasNext();
    }
    item() {
        return this.#iterator.item();
    }
    next() {
        this.#iterator.next();
        this.skipFilteredItems();
    }
    skipFilteredItems() {
        while (this.#iterator.hasNext() && this.#filter && !this.#filter(this.#iterator.item())) {
            this.#iterator.next();
        }
    }
}
class HeapSnapshotProgress {
    #dispatcher;
    constructor(dispatcher) {
        this.#dispatcher = dispatcher;
    }
    updateStatus(status) {
        this.sendUpdateEvent(serializeUIString(status));
    }
    updateProgress(title, value, total) {
        const percentValue = ((total ? (value / total) : 0) * 100).toFixed(0);
        this.sendUpdateEvent(serializeUIString(title, { PH1: percentValue }));
    }
    reportProblem(error) {
        if (this.#dispatcher) {
            this.#dispatcher.sendEvent(HeapSnapshotProgressEvent.BrokenSnapshot, error);
        }
    }
    sendUpdateEvent(serializedText) {
        if (this.#dispatcher) {
            this.#dispatcher.sendEvent(HeapSnapshotProgressEvent.Update, serializedText);
        }
    }
}
function appendToProblemReport(report, messageOrNodeIndex) {
    if (report.length > 100) {
        return;
    }
    report.push(messageOrNodeIndex);
}
function formatProblemReport(snapshot, report) {
    const node = snapshot.rootNode();
    return report
        .map(messageOrNodeIndex => {
        if (typeof messageOrNodeIndex === 'string') {
            return messageOrNodeIndex;
        }
        node.nodeIndex = messageOrNodeIndex;
        return `${node.name()} @${node.id()}`;
    })
        .join('\n  ');
}
function reportProblemToPrimaryWorker(problemReport, port) {
    port.postMessage({ problemReport });
}
class SecondaryInitManager {
    argsStep1;
    argsStep2;
    argsStep3;
    constructor(port) {
        const { promise: argsStep1, resolve: resolveArgsStep1 } = Promise.withResolvers();
        this.argsStep1 = argsStep1;
        const { promise: argsStep2, resolve: resolveArgsStep2 } = Promise.withResolvers();
        this.argsStep2 = argsStep2;
        const { promise: argsStep3, resolve: resolveArgsStep3 } = Promise.withResolvers();
        this.argsStep3 = argsStep3;
        const listener = (e) => {
            const data = e.data;
            switch (data.step) {
                case 1:
                    resolveArgsStep1(data.args);
                    break;
                case 2:
                    resolveArgsStep2(data.args);
                    break;
                case 3:
                    resolveArgsStep3(data.args);
                    port.removeEventListener('message', listener);
                    break;
            }
        };
        port.addEventListener('message', listener);
        port.start();
        void this.initialize(port);
    }
    async getNodeSelfSizes() {
        return (await this.argsStep3).nodeSelfSizes;
    }
    async initialize(port) {
        try {
            const argsStep1 = await this.argsStep1;
            const retainers = HeapSnapshot.buildRetainers(argsStep1);
            const argsStep2 = await this.argsStep2;
            const args = {
                ...argsStep2,
                ...argsStep1,
                ...retainers,
                essentialEdges: createBitVector(argsStep2.essentialEdgesBuffer),
                port,
                nodeSelfSizesPromise: this.getNodeSelfSizes(),
            };
            const dominatorsAndRetainedSizes = await HeapSnapshot.calculateDominatorsAndRetainedSizes(args);
            const dominatedNodesOutputs = HeapSnapshot.buildDominatedNodes({ ...args, ...dominatorsAndRetainedSizes });
            const resultsFromSecondWorker = {
                ...retainers,
                ...dominatorsAndRetainedSizes,
                ...dominatedNodesOutputs,
            };
            port.postMessage({ resultsFromSecondWorker }, [
                resultsFromSecondWorker.dominatorsTree.buffer,
                resultsFromSecondWorker.retainedSizes.buffer,
                resultsFromSecondWorker.firstRetainerIndex.buffer,
                resultsFromSecondWorker.retainingNodes.buffer,
                resultsFromSecondWorker.retainingEdges.buffer,
                resultsFromSecondWorker.firstDominatedNodeIndex.buffer,
                resultsFromSecondWorker.dominatedNodes.buffer,
            ]);
        }
        catch (e) {
            port.postMessage({ error: e + '\n' + e?.stack });
        }
    }
}
const BITMASK_FOR_DOM_LINK_STATE = 3;
const SHIFT_FOR_CLASS_INDEX = 2;
const MIN_INTERFACE_PROPERTY_COUNT = 1;
const MAX_INTERFACE_NAME_LENGTH = 120;
const MIN_OBJECT_COUNT_PER_INTERFACE = 2;
const MIN_OBJECT_PROPORTION_PER_INTERFACE = 1000;
const NO_NATIVE_CONTEXT = -1;
const SHARED_NATIVE_CONTEXT = -2;
class HeapSnapshot {
    nodes;
    containmentEdges;
    #metaNode;
    #rawSamples;
    #samples = null;
    strings;
    #locations;
    #progress;
    #noDistance = -5;
    rootNodeIndexInternal = 0;
    #snapshotDiffs = {};
    #aggregatesForDiff;
    #aggregates = {};
    #aggregatesSortedFlags = {};
    profile;
    nodeTypeOffset;
    nodeNameOffset;
    nodeIdOffset;
    nodeSelfSizeOffset;
    #nodeEdgeCountOffset;
    nodeTraceNodeIdOffset;
    nodeFieldCount;
    nodeTypes;
    nodeArrayType;
    nodeHiddenType;
    nodeObjectType;
    nodeNativeType;
    nodeStringType;
    nodeConsStringType;
    nodeSlicedStringType;
    nodeCodeType;
    nodeSyntheticType;
    nodeClosureType;
    nodeRegExpType;
    nodeNumberType;
    edgeFieldsCount;
    edgeTypeOffset;
    edgeNameOffset;
    edgeToNodeOffset;
    edgeTypes;
    edgeElementType;
    edgeHiddenType;
    edgeInternalType;
    edgeShortcutType;
    edgeWeakType;
    edgeInvisibleType;
    edgePropertyType;
    #locationIndexOffset;
    #locationScriptIdOffset;
    #locationLineOffset;
    #locationColumnOffset;
    #locationFieldCount;
    nodeCount;
    #edgeCount;
    retainedSizes;
    firstEdgeIndexes;
    retainingNodes;
    retainingEdges;
    firstRetainerIndex;
    nodeDistances;
    firstDominatedNodeIndex;
    dominatedNodes;
    dominatorsTree;
    #allocationProfile;
    nodeDetachednessAndClassIndexOffset;
    #locationMap;
    #ignoredNodesInRetainersView = new Set();
    #ignoredEdgesInRetainersView = new Set();
    #nodeDistancesForRetainersView;
    #edgeNamesThatAreNotWeakMaps;
    detachednessAndClassIndexArray;
    nodeNativeContextAttribution;
    #nativeContextSizes;
    #nativeContextOrdinals;
    #interfaceNames = new Map();
    #interfaceDefinitions;
    constructor(profile, progress) {
        this.nodes = profile.nodes;
        this.containmentEdges = profile.edges;
        this.#metaNode = profile.snapshot.meta;
        this.#rawSamples = profile.samples;
        this.strings = profile.strings;
        this.#locations = profile.locations;
        this.#progress = progress;
        if (profile.snapshot.root_index) {
            this.rootNodeIndexInternal = profile.snapshot.root_index;
        }
        this.profile = profile;
        this.#edgeNamesThatAreNotWeakMaps = createBitVector(this.strings.length);
    }
    async initialize(secondWorker) {
        const meta = this.#metaNode;
        this.nodeTypeOffset = meta.node_fields.indexOf('type');
        this.nodeNameOffset = meta.node_fields.indexOf('name');
        this.nodeIdOffset = meta.node_fields.indexOf('id');
        this.nodeSelfSizeOffset = meta.node_fields.indexOf('self_size');
        this.#nodeEdgeCountOffset = meta.node_fields.indexOf('edge_count');
        this.nodeTraceNodeIdOffset = meta.node_fields.indexOf('trace_node_id');
        this.nodeDetachednessAndClassIndexOffset = meta.node_fields.indexOf('detachedness');
        this.nodeFieldCount = meta.node_fields.length;
        this.nodeTypes = meta.node_types[this.nodeTypeOffset];
        this.nodeArrayType = this.nodeTypes.indexOf('array');
        this.nodeHiddenType = this.nodeTypes.indexOf('hidden');
        this.nodeObjectType = this.nodeTypes.indexOf('object');
        this.nodeNativeType = this.nodeTypes.indexOf('native');
        this.nodeStringType = this.nodeTypes.indexOf('string');
        this.nodeConsStringType = this.nodeTypes.indexOf('concatenated string');
        this.nodeSlicedStringType = this.nodeTypes.indexOf('sliced string');
        this.nodeCodeType = this.nodeTypes.indexOf('code');
        this.nodeSyntheticType = this.nodeTypes.indexOf('synthetic');
        this.nodeClosureType = this.nodeTypes.indexOf('closure');
        this.nodeRegExpType = this.nodeTypes.indexOf('regexp');
        this.nodeNumberType = this.nodeTypes.indexOf('number');
        this.edgeFieldsCount = meta.edge_fields.length;
        this.edgeTypeOffset = meta.edge_fields.indexOf('type');
        this.edgeNameOffset = meta.edge_fields.indexOf('name_or_index');
        this.edgeToNodeOffset = meta.edge_fields.indexOf('to_node');
        this.edgeTypes = meta.edge_types[this.edgeTypeOffset];
        this.edgeTypes.push('invisible');
        this.edgeElementType = this.edgeTypes.indexOf('element');
        this.edgeHiddenType = this.edgeTypes.indexOf('hidden');
        this.edgeInternalType = this.edgeTypes.indexOf('internal');
        this.edgeShortcutType = this.edgeTypes.indexOf('shortcut');
        this.edgeWeakType = this.edgeTypes.indexOf('weak');
        this.edgeInvisibleType = this.edgeTypes.indexOf('invisible');
        this.edgePropertyType = this.edgeTypes.indexOf('property');
        const locationFields = meta.location_fields || [];
        this.#locationIndexOffset = locationFields.indexOf('object_index');
        this.#locationScriptIdOffset = locationFields.indexOf('script_id');
        this.#locationLineOffset = locationFields.indexOf('line');
        this.#locationColumnOffset = locationFields.indexOf('column');
        this.#locationFieldCount = locationFields.length;
        this.nodeCount = this.nodes.length / this.nodeFieldCount;
        this.#edgeCount = this.containmentEdges.length / this.edgeFieldsCount;
        this.#progress.updateStatus('Building edge indexes…');
        this.firstEdgeIndexes = new Uint32Array(this.nodeCount + 1);
        this.buildEdgeIndexes();
        this.#progress.updateStatus('Building retainers…');
        const resultsFromSecondWorker = this.startInitStep1InSecondThread(secondWorker);
        this.#progress.updateStatus('Propagating DOM state…');
        this.initDetachednessAndClassIndex();
        this.propagateDOMState();
        this.#progress.updateStatus('Calculating node flags…');
        this.calculateFlags();
        this.#progress.updateStatus('Building dominated nodes…');
        this.startInitStep2InSecondThread(secondWorker);
        this.#progress.updateStatus('Calculating shallow sizes…');
        this.calculateShallowSizes();
        this.#progress.updateStatus('Calculating retained sizes…');
        this.startInitStep3InSecondThread(secondWorker);
        this.#progress.updateStatus('Calculating distances…');
        this.nodeDistances = new Int32Array(this.nodeCount);
        this.calculateDistances( false);
        this.#progress.updateStatus('Calculating object names…');
        this.calculateObjectNames();
        this.applyInterfaceDefinitions(this.inferInterfaceDefinitions());
        this.#progress.updateStatus('Calculating samples…');
        this.buildSamples();
        this.#progress.updateStatus('Building locations…');
        this.buildLocationMap();
        this.#progress.updateStatus('Calculating native context attribution…');
        this.calculateNativeContextAttribution();
        this.#progress.updateStatus('Calculating retained sizes…');
        await this.installResultsFromSecondThread(resultsFromSecondWorker);
        this.calculateNativeContextSizes();
        this.#progress.updateStatus('Calculating statistics…');
        this.calculateStatistics();
        if (this.profile.snapshot.trace_function_count) {
            this.#progress.updateStatus('Building allocation statistics…');
            const nodes = this.nodes;
            const nodesLength = nodes.length;
            const nodeFieldCount = this.nodeFieldCount;
            const node = this.rootNode();
            const liveObjects = {};
            for (let nodeIndex = 0; nodeIndex < nodesLength; nodeIndex += nodeFieldCount) {
                node.nodeIndex = nodeIndex;
                const traceNodeId = node.traceNodeId();
                let stats = liveObjects[traceNodeId];
                if (!stats) {
                    liveObjects[traceNodeId] = stats = { count: 0, size: 0, ids: [] };
                }
                stats.count++;
                stats.size += node.selfSize();
                stats.ids.push(node.id());
            }
            this.#allocationProfile = new AllocationProfile(this.profile, liveObjects);
        }
        this.#progress.updateStatus('Finished processing');
    }
    nodeIndexForId(nodeId) {
        const nodesLength = this.nodes.length;
        const { nodes, nodeFieldCount, nodeIdOffset } = this;
        for (let nodeIndex = 0; nodeIndex < nodesLength; nodeIndex += nodeFieldCount) {
            if (nodes.getValue(nodeIndex + nodeIdOffset) === nodeId) {
                return nodeIndex;
            }
        }
        return undefined;
    }
    getObjectInfo(nodeIndex) {
        const nodesLength = this.nodes.length;
        const nodeFieldCount = this.nodeFieldCount;
        if (!Number.isInteger(nodeIndex) || nodeIndex < 0 || nodeIndex >= nodesLength || nodeIndex % nodeFieldCount !== 0) {
            throw new Error('Invalid nodeIndex ' + nodeIndex);
        }
        const node = this.createNode(nodeIndex);
        return {
            id: node.id(),
            name: node.name(),
            type: node.type(),
            nodeIndex,
            detachedness: node.detachedness(),
            selfSize: node.selfSize(),
            retainedSize: node.retainedSize(),
            distance: node.distance(),
            edgeCount: node.edgesCount(),
            retainerCount: node.retainersCount(),
        };
    }
    analyzeContexts() {
        return analyzeContexts(this);
    }
    startInitStep1InSecondThread(secondWorker) {
        const resultsFromSecondWorker = new Promise((resolve, reject) => {
            const listener = (e) => {
                const data = e.data;
                if (data?.problemReport) {
                    const problemReport = data.problemReport;
                    console.warn(formatProblemReport(this, problemReport));
                }
                else if (data?.resultsFromSecondWorker) {
                    secondWorker.removeEventListener('message', listener);
                    resolve(data.resultsFromSecondWorker);
                }
                else if (data?.error) {
                    secondWorker.removeEventListener('message', listener);
                    reject(data.error);
                }
            };
            secondWorker.addEventListener('message', listener);
            secondWorker.start();
        });
        const edgeCount = this.#edgeCount;
        const { containmentEdges, edgeToNodeOffset, edgeFieldsCount, nodeFieldCount } = this;
        const edgeToNodeOrdinals = new Uint32Array(edgeCount);
        for (let edgeOrdinal = 0; edgeOrdinal < edgeCount; ++edgeOrdinal) {
            const toNodeIndex = containmentEdges.getValue(edgeOrdinal * edgeFieldsCount + edgeToNodeOffset);
            if (toNodeIndex % nodeFieldCount) {
                throw new Error('Invalid toNodeIndex ' + toNodeIndex);
            }
            edgeToNodeOrdinals[edgeOrdinal] = toNodeIndex / nodeFieldCount;
        }
        const args = {
            edgeToNodeOrdinals,
            firstEdgeIndexes: this.firstEdgeIndexes,
            nodeCount: this.nodeCount,
            edgeFieldsCount: this.edgeFieldsCount,
            nodeFieldCount: this.nodeFieldCount,
        };
        secondWorker.postMessage({ step: 1, args }, [edgeToNodeOrdinals.buffer]);
        return resultsFromSecondWorker;
    }
    startInitStep2InSecondThread(secondWorker) {
        const rootNodeOrdinal = this.rootNodeIndexInternal / this.nodeFieldCount;
        const essentialEdges = this.initEssentialEdges();
        const args = { rootNodeOrdinal, essentialEdgesBuffer: essentialEdges.buffer };
        secondWorker.postMessage({ step: 2, args }, [essentialEdges.buffer]);
    }
    startInitStep3InSecondThread(secondWorker) {
        const { nodes, nodeFieldCount, nodeSelfSizeOffset, nodeCount } = this;
        const nodeSelfSizes = new Uint32Array(nodeCount);
        for (let nodeOrdinal = 0; nodeOrdinal < nodeCount; ++nodeOrdinal) {
            nodeSelfSizes[nodeOrdinal] = nodes.getValue(nodeOrdinal * nodeFieldCount + nodeSelfSizeOffset);
        }
        const args = { nodeSelfSizes };
        secondWorker.postMessage({ step: 3, args }, [nodeSelfSizes.buffer]);
    }
    async installResultsFromSecondThread(resultsFromSecondWorker) {
        const results = await resultsFromSecondWorker;
        this.dominatedNodes = results.dominatedNodes;
        this.dominatorsTree = results.dominatorsTree;
        this.firstDominatedNodeIndex = results.firstDominatedNodeIndex;
        this.firstRetainerIndex = results.firstRetainerIndex;
        this.retainedSizes = results.retainedSizes;
        this.retainingEdges = results.retainingEdges;
        this.retainingNodes = results.retainingNodes;
    }
    buildEdgeIndexes() {
        const nodes = this.nodes;
        const nodeCount = this.nodeCount;
        const firstEdgeIndexes = this.firstEdgeIndexes;
        const nodeFieldCount = this.nodeFieldCount;
        const edgeFieldsCount = this.edgeFieldsCount;
        const nodeEdgeCountOffset = this.#nodeEdgeCountOffset;
        firstEdgeIndexes[nodeCount] = this.containmentEdges.length;
        for (let nodeOrdinal = 0, edgeIndex = 0; nodeOrdinal < nodeCount; ++nodeOrdinal) {
            firstEdgeIndexes[nodeOrdinal] = edgeIndex;
            edgeIndex += nodes.getValue(nodeOrdinal * nodeFieldCount + nodeEdgeCountOffset) * edgeFieldsCount;
        }
    }
    static buildRetainers(inputs) {
        const { edgeToNodeOrdinals, firstEdgeIndexes, nodeCount, edgeFieldsCount, nodeFieldCount } = inputs;
        const edgeCount = edgeToNodeOrdinals.length;
        const retainingNodes = new Uint32Array(edgeCount);
        const retainingEdges = new Uint32Array(edgeCount);
        const firstRetainerIndex = new Uint32Array(nodeCount + 1);
        for (let edgeOrdinal = 0; edgeOrdinal < edgeCount; ++edgeOrdinal) {
            const toNodeOrdinal = edgeToNodeOrdinals[edgeOrdinal];
            ++firstRetainerIndex[toNodeOrdinal];
        }
        for (let i = 0, firstUnusedRetainerSlot = 0; i < nodeCount; i++) {
            const retainersCount = firstRetainerIndex[i];
            firstRetainerIndex[i] = firstUnusedRetainerSlot;
            retainingNodes[firstUnusedRetainerSlot] = retainersCount;
            firstUnusedRetainerSlot += retainersCount;
        }
        firstRetainerIndex[nodeCount] = retainingNodes.length;
        let nextNodeFirstEdgeIndex = firstEdgeIndexes[0];
        for (let srcNodeOrdinal = 0; srcNodeOrdinal < nodeCount; ++srcNodeOrdinal) {
            const firstEdgeIndex = nextNodeFirstEdgeIndex;
            nextNodeFirstEdgeIndex = firstEdgeIndexes[srcNodeOrdinal + 1];
            const srcNodeIndex = srcNodeOrdinal * nodeFieldCount;
            for (let edgeIndex = firstEdgeIndex; edgeIndex < nextNodeFirstEdgeIndex; edgeIndex += edgeFieldsCount) {
                const toNodeOrdinal = edgeToNodeOrdinals[edgeIndex / edgeFieldsCount];
                const firstRetainerSlotIndex = firstRetainerIndex[toNodeOrdinal];
                const nextUnusedRetainerSlotIndex = firstRetainerSlotIndex + (--retainingNodes[firstRetainerSlotIndex]);
                retainingNodes[nextUnusedRetainerSlotIndex] = srcNodeIndex;
                retainingEdges[nextUnusedRetainerSlotIndex] = edgeIndex;
            }
        }
        return {
            retainingNodes,
            retainingEdges,
            firstRetainerIndex,
        };
    }
    allNodes() {
        return new HeapSnapshotNodeIterator(this.rootNode());
    }
    rootNode() {
        return this.createNode(this.rootNodeIndexInternal);
    }
    get rootNodeIndex() {
        return this.rootNodeIndexInternal;
    }
    get totalSize() {
        return this.rootNode().retainedSize() + (this.profile.snapshot.extra_native_bytes ?? 0);
    }
    createFilter(nodeFilter) {
        const { minNodeId, maxNodeId, allocationNodeId, filterName } = nodeFilter;
        let filter;
        if (typeof allocationNodeId === 'number') {
            filter = this.createAllocationStackFilter(allocationNodeId);
            if (!filter) {
                throw new Error('Unable to create filter');
            }
            filter.key = 'AllocationNodeId: ' + allocationNodeId;
        }
        else if (typeof minNodeId === 'number' && typeof maxNodeId === 'number') {
            filter = this.createNodeIdFilter(minNodeId, maxNodeId);
            filter.key = 'NodeIdRange: ' + minNodeId + '..' + maxNodeId;
        }
        else if (filterName !== undefined) {
            filter = this.createNamedFilter(filterName);
            filter.key = 'NamedFilter: ' + filterName;
        }
        return filter;
    }
    search(searchConfig, nodeFilter) {
        const query = searchConfig.query;
        function filterString(matchedStringIndexes, string, index) {
            if (string.indexOf(query) !== -1) {
                matchedStringIndexes.add(index);
            }
            return matchedStringIndexes;
        }
        const regexp = searchConfig.isRegex ? new RegExp(query) : createPlainTextSearchRegex(query, 'i');
        function filterRegexp(matchedStringIndexes, string, index) {
            if (regexp.test(string)) {
                matchedStringIndexes.add(index);
            }
            return matchedStringIndexes;
        }
        const useRegExp = searchConfig.isRegex || !searchConfig.caseSensitive;
        const stringFilter = useRegExp ? filterRegexp : filterString;
        const stringIndexes = this.strings.reduce(stringFilter, new Set());
        const filter = this.createFilter(nodeFilter);
        const nodeIds = [];
        const nodesLength = this.nodes.length;
        const nodes = this.nodes;
        const nodeNameOffset = this.nodeNameOffset;
        const nodeIdOffset = this.nodeIdOffset;
        const nodeFieldCount = this.nodeFieldCount;
        const node = this.rootNode();
        for (let nodeIndex = 0; nodeIndex < nodesLength; nodeIndex += nodeFieldCount) {
            node.nodeIndex = nodeIndex;
            if (filter && !filter(node)) {
                continue;
            }
            if (node.selfSize() === 0) {
                continue;
            }
            const name = node.name();
            if (name === node.rawName()) {
                if (stringIndexes.has(nodes.getValue(nodeIndex + nodeNameOffset))) {
                    nodeIds.push(nodes.getValue(nodeIndex + nodeIdOffset));
                }
            }
            else if (useRegExp ? regexp.test(name) : (name.indexOf(query) !== -1)) {
                nodeIds.push(nodes.getValue(nodeIndex + nodeIdOffset));
            }
        }
        return nodeIds;
    }
    aggregatesWithFilter(nodeFilter) {
        const filter = this.createFilter(nodeFilter);
        const key = filter ? filter.key : 'allObjects';
        return this.getAggregatesByClassKey(false, key, filter);
    }
    getDuplicateStrings() {
        const filter = this.createNamedFilter('duplicatedStrings');
        const untruncatedGroups = new Map();
        const truncatedGroups = new Map();
        const node = this.createNode(0);
        for (let i = 0; i < this.nodeCount; ++i) {
            node.nodeIndex = i * this.nodeFieldCount;
            if (filter(node)) {
                const name = node.name();
                const truncated = node.nodeIsTruncatedString();
                if (truncated) {
                    const length = node.nodeStringLength();
                    const hash = node.nodeStringHash();
                    let groups = truncatedGroups.get(name);
                    if (!groups) {
                        groups = [];
                        truncatedGroups.set(name, groups);
                    }
                    let group = groups.find(g => g.length === length && g.hash === hash);
                    if (!group) {
                        group = {
                            value: name,
                            count: 0,
                            totalSelfSize: 0,
                            totalRetainedSize: 0,
                            nodes: [],
                            truncated: true,
                            length,
                            hash,
                        };
                        groups.push(group);
                    }
                    group.count++;
                    group.totalSelfSize += node.selfSize();
                    group.totalRetainedSize += node.retainedSize();
                    group.nodes.push({
                        id: node.id(),
                        selfSize: node.selfSize(),
                        retainedSize: node.retainedSize(),
                        distance: node.distance(),
                    });
                }
                else {
                    let group = untruncatedGroups.get(name);
                    if (!group) {
                        group = {
                            value: name,
                            count: 0,
                            totalSelfSize: 0,
                            totalRetainedSize: 0,
                            nodes: [],
                            truncated: false,
                        };
                        untruncatedGroups.set(name, group);
                    }
                    group.count++;
                    group.totalSelfSize += node.selfSize();
                    group.totalRetainedSize += node.retainedSize();
                    group.nodes.push({
                        id: node.id(),
                        selfSize: node.selfSize(),
                        retainedSize: node.retainedSize(),
                        distance: node.distance(),
                    });
                }
            }
        }
        const allGroups = [
            ...untruncatedGroups.values(),
            ...Array.from(truncatedGroups.values()).flat(),
        ];
        return allGroups.sort((a, b) => b.totalRetainedSize - a.totalRetainedSize);
    }
    createNodeIdFilter(minNodeId, maxNodeId) {
        function nodeIdFilter(node) {
            const id = node.id();
            return id > minNodeId && id <= maxNodeId;
        }
        return nodeIdFilter;
    }
    createAllocationStackFilter(bottomUpAllocationNodeId) {
        if (!this.#allocationProfile) {
            throw new Error('No Allocation Profile provided');
        }
        const traceIds = this.#allocationProfile.traceIds(bottomUpAllocationNodeId);
        if (!traceIds.length) {
            return undefined;
        }
        const set = {};
        for (let i = 0; i < traceIds.length; i++) {
            set[traceIds[i]] = true;
        }
        function traceIdFilter(node) {
            return Boolean(set[node.traceNodeId()]);
        }
        return traceIdFilter;
    }
    createNamedFilter(filterName) {
        const bitmap = createBitVector(this.nodeCount);
        const getBit = (node) => {
            const ordinal = node.nodeIndex / this.nodeFieldCount;
            return bitmap.getBit(ordinal);
        };
        const traverse = (filter) => {
            const distances = new Int32Array(this.nodeCount);
            for (let i = 0; i < this.nodeCount; ++i) {
                distances[i] = this.#noDistance;
            }
            const nodesToVisit = new Uint32Array(this.nodeCount);
            distances[this.rootNode().ordinal()] = 0;
            nodesToVisit[0] = this.rootNode().nodeIndex;
            const nodesToVisitLength = 1;
            this.bfs(nodesToVisit, nodesToVisitLength, distances, filter);
            for (let i = 0; i < this.nodeCount; ++i) {
                if (distances[i] !== this.#noDistance) {
                    bitmap.setBit(i);
                }
            }
        };
        const markUnreachableNodes = () => {
            for (let i = 0; i < this.nodeCount; ++i) {
                if (this.nodeDistances[i] === this.#noDistance) {
                    bitmap.setBit(i);
                }
            }
        };
        switch (filterName) {
            case 'objectsRetainedByContexts':
                traverse((_node, edge) => {
                    return !this.isContextObject(edge.node());
                });
                markUnreachableNodes();
                return (node) => !getBit(node);
            case 'objectsRetainedByDetachedDomNodes':
                traverse((_node, edge) => {
                    return edge.node().detachedness() !== 2 ;
                });
                markUnreachableNodes();
                return (node) => !getBit(node);
            case 'objectsRetainedByConsole':
                traverse((node, edge) => {
                    return !(node.isSynthetic() && edge.hasStringName() && edge.name().endsWith(' / DevTools console'));
                });
                markUnreachableNodes();
                return (node) => !getBit(node);
            case 'duplicatedStrings':
                return this.createDuplicatedStringsFilter(bitmap);
            case 'objectsRetainedByEventHandlers': {
                const node = this.createNode(0);
                const nodeFieldCount = this.nodeFieldCount;
                const eventHandlerBitmap = createBitVector(this.nodeCount);
                for (let i = 0; i < this.nodeCount; ++i) {
                    node.nodeIndex = i * nodeFieldCount;
                    if (node.rawName() === 'V8EventListener') {
                        const callbackNode = this.getEdgeTarget(node, '1');
                        if (!callbackNode) {
                            continue;
                        }
                        const callbackOrdinal = callbackNode.nodeIndex / nodeFieldCount;
                        if (this.getEdgeTarget(callbackNode, 'code')) {
                            eventHandlerBitmap.setBit(callbackOrdinal);
                            continue;
                        }
                        let foundChildWithCode = false;
                        for (let childEdgeIt = callbackNode.edges(); childEdgeIt.hasNext(); childEdgeIt.next()) {
                            const childNode = childEdgeIt.item().node();
                            if (this.getEdgeTarget(childNode, 'code')) {
                                eventHandlerBitmap.setBit(childNode.nodeIndex / nodeFieldCount);
                                foundChildWithCode = true;
                                break;
                            }
                        }
                        if (!foundChildWithCode) {
                            eventHandlerBitmap.setBit(callbackOrdinal);
                        }
                    }
                }
                traverse((currentNode, edge) => {
                    const targetNode = edge.node();
                    const targetOrdinal = targetNode.nodeIndex / nodeFieldCount;
                    return !eventHandlerBitmap.getBit(targetOrdinal);
                });
                markUnreachableNodes();
                return (node) => !getBit(node);
            }
            case 'sharedNativeContext':
                return (node) => {
                    const ordinal = node.nodeIndex / this.nodeFieldCount;
                    return this.nodeNativeContextAttribution[ordinal] === SHARED_NATIVE_CONTEXT;
                };
            case 'noNativeContext':
                return (node) => {
                    const ordinal = node.nodeIndex / this.nodeFieldCount;
                    return this.nodeNativeContextAttribution[ordinal] === NO_NATIVE_CONTEXT;
                };
            default:
                if (filterName.startsWith('nativeContext_')) {
                    const targetNodeIndex = Number(filterName.substring('nativeContext_'.length));
                    const targetOrdinal = targetNodeIndex / this.nodeFieldCount;
                    return (node) => {
                        const ordinal = node.nodeIndex / this.nodeFieldCount;
                        return this.nodeNativeContextAttribution[ordinal] === targetOrdinal;
                    };
                }
        }
        throw new Error('Invalid filter name');
    }
    createDuplicatedStringsFilter(bitmap) {
        const untruncatedStringToNodeIndexMap = new Map();
        const truncatedStringToNodeIndexesMap = new Map();
        const node = this.createNode(0);
        for (let i = 0; i < this.nodeCount; ++i) {
            node.nodeIndex = i * this.nodeFieldCount;
            const rawType = node.rawType();
            if (rawType !== this.nodeStringType && rawType !== this.nodeConsStringType) {
                continue;
            }
            if (node.isFlatConsString()) {
                continue;
            }
            if (node.selfSize() === 0) {
                continue;
            }
            const name = node.name();
            const truncated = node.nodeIsTruncatedString();
            if (truncated) {
                const length = node.nodeStringLength();
                const hash = node.nodeStringHash();
                let entries = truncatedStringToNodeIndexesMap.get(name);
                if (!entries) {
                    entries = [];
                    truncatedStringToNodeIndexesMap.set(name, entries);
                }
                const match = entries.find(e => e.length === length && e.hash === hash);
                if (match) {
                    bitmap.setBit(match.nodeIndex / this.nodeFieldCount);
                    bitmap.setBit(node.nodeIndex / this.nodeFieldCount);
                }
                else {
                    entries.push({ nodeIndex: node.nodeIndex, length, hash });
                }
            }
            else {
                const alreadyVisitedNodeIndex = untruncatedStringToNodeIndexMap.get(name);
                if (alreadyVisitedNodeIndex === undefined) {
                    untruncatedStringToNodeIndexMap.set(name, node.nodeIndex);
                }
                else {
                    bitmap.setBit(alreadyVisitedNodeIndex / this.nodeFieldCount);
                    bitmap.setBit(node.nodeIndex / this.nodeFieldCount);
                }
            }
        }
        return (node) => {
            const ordinal = node.nodeIndex / this.nodeFieldCount;
            return bitmap.getBit(ordinal);
        };
    }
    getAggregatesByClassKey(sortedIndexes, key, filter) {
        let aggregates;
        if (key && this.#aggregates[key]) {
            aggregates = this.#aggregates[key];
        }
        else {
            const aggregatesMap = this.buildAggregates(filter);
            this.calculateClassesRetainedSize(aggregatesMap, filter);
            aggregates = Object.create(null);
            for (const [classKey, aggregate] of aggregatesMap.entries()) {
                const newKey = this.#classKeyFromClassKey(classKey);
                aggregates[newKey] = aggregate;
            }
            if (key) {
                this.#aggregates[key] = aggregates;
            }
        }
        if (sortedIndexes && (!key || !this.#aggregatesSortedFlags[key])) {
            this.sortAggregateIndexes(aggregates);
            if (key) {
                this.#aggregatesSortedFlags[key] = sortedIndexes;
            }
        }
        return aggregates;
    }
    allocationTracesTops() {
        return this.#allocationProfile.serializeTraceTops();
    }
    allocationNodeCallers(nodeId) {
        return this.#allocationProfile.serializeCallers(nodeId);
    }
    allocationStack(nodeIndex) {
        const node = this.createNode(nodeIndex);
        const allocationNodeId = node.traceNodeId();
        if (!allocationNodeId) {
            return null;
        }
        return this.#allocationProfile.serializeAllocationStack(allocationNodeId);
    }
    aggregatesForDiff(interfaceDefinitions) {
        if (this.#aggregatesForDiff?.interfaceDefinitions === interfaceDefinitions) {
            return this.#aggregatesForDiff.aggregates;
        }
        const originalInterfaceDefinitions = this.#interfaceDefinitions;
        this.applyInterfaceDefinitions(JSON.parse(interfaceDefinitions));
        const aggregates = this.getAggregatesByClassKey(true, 'allObjects');
        this.applyInterfaceDefinitions(originalInterfaceDefinitions ?? []);
        const result = {};
        const node = this.createNode();
        for (const classKey in aggregates) {
            const aggregate = aggregates[classKey];
            const indexes = aggregate.idxs;
            const ids = new Array(indexes.length);
            const selfSizes = new Array(indexes.length);
            for (let i = 0; i < indexes.length; i++) {
                node.nodeIndex = indexes[i];
                ids[i] = node.id();
                selfSizes[i] = node.selfSize();
            }
            result[classKey] = { name: node.className(), indexes, ids, selfSizes };
        }
        this.#aggregatesForDiff = { interfaceDefinitions, aggregates: result };
        return result;
    }
    isUserRoot(_node) {
        return true;
    }
    isContextObject(_node) {
        return false;
    }
    calculateShallowSizes() {
    }
    calculateDistances(isForRetainersView, filter) {
        const nodeCount = this.nodeCount;
        if (isForRetainersView) {
            const originalFilter = filter;
            filter = (node, edge) => {
                return !this.#ignoredNodesInRetainersView.has(edge.nodeIndex()) &&
                    (!originalFilter || originalFilter(node, edge));
            };
            if (this.#nodeDistancesForRetainersView === undefined) {
                this.#nodeDistancesForRetainersView = new Int32Array(nodeCount);
            }
        }
        const distances = isForRetainersView ? this.#nodeDistancesForRetainersView : this.nodeDistances;
        const noDistance = this.#noDistance;
        for (let i = 0; i < nodeCount; ++i) {
            distances[i] = noDistance;
        }
        const nodesToVisit = new Uint32Array(this.nodeCount);
        let nodesToVisitLength = 0;
        for (let iter = this.rootNode().edges(); iter.hasNext(); iter.next()) {
            const node = iter.edge.node();
            if (this.isUserRoot(node)) {
                distances[node.ordinal()] = 1;
                nodesToVisit[nodesToVisitLength++] = node.nodeIndex;
            }
        }
        this.bfs(nodesToVisit, nodesToVisitLength, distances, filter);
        distances[this.rootNode().ordinal()] =
            nodesToVisitLength > 0 ? baseSystemDistance : 0;
        nodesToVisit[0] = this.rootNode().nodeIndex;
        nodesToVisitLength = 1;
        this.bfs(nodesToVisit, nodesToVisitLength, distances, filter);
    }
    bfs(nodesToVisit, nodesToVisitLength, distances, filter) {
        const edgeFieldsCount = this.edgeFieldsCount;
        const nodeFieldCount = this.nodeFieldCount;
        const containmentEdges = this.containmentEdges;
        const firstEdgeIndexes = this.firstEdgeIndexes;
        const edgeToNodeOffset = this.edgeToNodeOffset;
        const edgeTypeOffset = this.edgeTypeOffset;
        const nodeCount = this.nodeCount;
        const edgeWeakType = this.edgeWeakType;
        const noDistance = this.#noDistance;
        let index = 0;
        const edge = this.createEdge(0);
        const node = this.createNode(0);
        while (index < nodesToVisitLength) {
            const nodeIndex = nodesToVisit[index++];
            const nodeOrdinal = nodeIndex / nodeFieldCount;
            const distance = distances[nodeOrdinal] + 1;
            const firstEdgeIndex = firstEdgeIndexes[nodeOrdinal];
            const edgesEnd = firstEdgeIndexes[nodeOrdinal + 1];
            node.nodeIndex = nodeIndex;
            for (let edgeIndex = firstEdgeIndex; edgeIndex < edgesEnd; edgeIndex += edgeFieldsCount) {
                const edgeType = containmentEdges.getValue(edgeIndex + edgeTypeOffset);
                if (edgeType === edgeWeakType) {
                    continue;
                }
                const childNodeIndex = containmentEdges.getValue(edgeIndex + edgeToNodeOffset);
                const childNodeOrdinal = childNodeIndex / nodeFieldCount;
                if (distances[childNodeOrdinal] !== noDistance) {
                    continue;
                }
                edge.edgeIndex = edgeIndex;
                if (filter && !filter(node, edge)) {
                    continue;
                }
                distances[childNodeOrdinal] = distance;
                nodesToVisit[nodesToVisitLength++] = childNodeIndex;
            }
        }
        if (nodesToVisitLength > nodeCount) {
            throw new Error('BFS failed. Nodes to visit (' + nodesToVisitLength + ') is more than nodes count (' + nodeCount + ')');
        }
    }
    buildAggregates(filter) {
        const aggregates = new Map();
        const nodes = this.nodes;
        const nodesLength = nodes.length;
        const nodeFieldCount = this.nodeFieldCount;
        const selfSizeOffset = this.nodeSelfSizeOffset;
        const node = this.rootNode();
        const nodeDistances = this.nodeDistances;
        for (let nodeIndex = 0; nodeIndex < nodesLength; nodeIndex += nodeFieldCount) {
            node.nodeIndex = nodeIndex;
            if (filter && !filter(node)) {
                continue;
            }
            const selfSize = nodes.getValue(nodeIndex + selfSizeOffset);
            if (!selfSize) {
                continue;
            }
            const classKey = node.classKeyInternal();
            const nodeOrdinal = nodeIndex / nodeFieldCount;
            const distance = nodeDistances[nodeOrdinal];
            let aggregate = aggregates.get(classKey);
            if (!aggregate) {
                aggregate = {
                    count: 1,
                    distance,
                    self: selfSize,
                    maxRet: 0,
                    name: node.className(),
                    idxs: [nodeIndex],
                };
                aggregates.set(classKey, aggregate);
            }
            else {
                aggregate.distance = Math.min(aggregate.distance, distance);
                ++aggregate.count;
                aggregate.self += selfSize;
                aggregate.idxs.push(nodeIndex);
            }
        }
        for (const aggregate of aggregates.values()) {
            aggregate.idxs = aggregate.idxs.slice();
        }
        return aggregates;
    }
    calculateClassesRetainedSize(aggregates, filter) {
        const rootNodeIndex = this.rootNodeIndexInternal;
        const node = this.createNode(rootNodeIndex);
        const list = [rootNodeIndex];
        const sizes = [-1];
        const classKeys = [];
        const seenClassKeys = new Map();
        const nodeFieldCount = this.nodeFieldCount;
        const dominatedNodes = this.dominatedNodes;
        const firstDominatedNodeIndex = this.firstDominatedNodeIndex;
        while (list.length) {
            const nodeIndex = list.pop();
            node.nodeIndex = nodeIndex;
            let classKey = node.classKeyInternal();
            const seen = Boolean(seenClassKeys.get(classKey));
            const nodeOrdinal = nodeIndex / nodeFieldCount;
            const dominatedIndexFrom = firstDominatedNodeIndex[nodeOrdinal];
            const dominatedIndexTo = firstDominatedNodeIndex[nodeOrdinal + 1];
            if (!seen && (!filter || filter(node)) && node.selfSize()) {
                aggregates.get(classKey).maxRet += node.retainedSize();
                if (dominatedIndexFrom !== dominatedIndexTo) {
                    seenClassKeys.set(classKey, true);
                    sizes.push(list.length);
                    classKeys.push(classKey);
                }
            }
            for (let i = dominatedIndexFrom; i < dominatedIndexTo; i++) {
                list.push(dominatedNodes[i]);
            }
            const l = list.length;
            while (sizes[sizes.length - 1] === l) {
                sizes.pop();
                classKey = classKeys.pop();
                seenClassKeys.set(classKey, false);
            }
        }
    }
    sortAggregateIndexes(aggregates) {
        const nodeA = this.createNode();
        const nodeB = this.createNode();
        for (const clss in aggregates) {
            aggregates[clss].idxs.sort((idxA, idxB) => {
                nodeA.nodeIndex = idxA;
                nodeB.nodeIndex = idxB;
                return nodeA.id() < nodeB.id() ? -1 : 1;
            });
        }
    }
    tryParseWeakMapEdgeName(edgeNameIndex) {
        const previousResult = this.#edgeNamesThatAreNotWeakMaps.getBit(edgeNameIndex);
        if (previousResult) {
            return undefined;
        }
        const edgeName = this.strings[edgeNameIndex];
        const ephemeronNameRegex = /^\d+(?<duplicatedPart> \/ part of key \(.*? @\d+\) -> value \(.*? @\d+\) pair in WeakMap \(table @(?<tableId>\d+)\))$/;
        const match = edgeName.match(ephemeronNameRegex);
        if (!match) {
            this.#edgeNamesThatAreNotWeakMaps.setBit(edgeNameIndex);
            return undefined;
        }
        return match.groups;
    }
    computeIsEssentialEdge(nodeIndex, edgeIndex, userObjectsMapAndFlag) {
        const edgeType = this.containmentEdges.getValue(edgeIndex + this.edgeTypeOffset);
        if (edgeType === this.edgeInternalType) {
            const edgeNameIndex = this.containmentEdges.getValue(edgeIndex + this.edgeNameOffset);
            const match = this.tryParseWeakMapEdgeName(edgeNameIndex);
            if (match) {
                const nodeId = this.nodes.getValue(nodeIndex + this.nodeIdOffset);
                if (nodeId === parseInt(match.tableId, 10)) {
                    return false;
                }
            }
        }
        if (edgeType === this.edgeWeakType) {
            return false;
        }
        const childNodeIndex = this.containmentEdges.getValue(edgeIndex + this.edgeToNodeOffset);
        if (nodeIndex === childNodeIndex) {
            return false;
        }
        if (nodeIndex !== this.rootNodeIndex) {
            if (edgeType === this.edgeShortcutType) {
                return false;
            }
            const flags = userObjectsMapAndFlag ? userObjectsMapAndFlag.map : null;
            const userObjectFlag = userObjectsMapAndFlag ? userObjectsMapAndFlag.flag : 0;
            const nodeOrdinal = nodeIndex / this.nodeFieldCount;
            const childNodeOrdinal = childNodeIndex / this.nodeFieldCount;
            const nodeFlag = !flags || (flags[nodeOrdinal] & userObjectFlag);
            const childNodeFlag = !flags || (flags[childNodeOrdinal] & userObjectFlag);
            if (childNodeFlag && !nodeFlag) {
                return false;
            }
        }
        return true;
    }
    initEssentialEdges() {
        const essentialEdges = createBitVector(this.#edgeCount);
        const { nodes, nodeFieldCount, edgeFieldsCount } = this;
        const userObjectsMapAndFlag = this.userObjectsMapAndFlag();
        const endNodeIndex = nodes.length;
        const node = this.createNode(0);
        for (let nodeIndex = 0; nodeIndex < endNodeIndex; nodeIndex += nodeFieldCount) {
            node.nodeIndex = nodeIndex;
            const edgeIndexesEnd = node.edgeIndexesEnd();
            for (let edgeIndex = node.edgeIndexesStart(); edgeIndex < edgeIndexesEnd; edgeIndex += edgeFieldsCount) {
                if (this.computeIsEssentialEdge(nodeIndex, edgeIndex, userObjectsMapAndFlag)) {
                    essentialEdges.setBit(edgeIndex / edgeFieldsCount);
                }
            }
        }
        return essentialEdges;
    }
    static hasOnlyWeakRetainers(inputs, nodeOrdinal) {
        const { retainingEdges, edgeFieldsCount, firstRetainerIndex, essentialEdges } = inputs;
        const beginRetainerIndex = firstRetainerIndex[nodeOrdinal];
        const endRetainerIndex = firstRetainerIndex[nodeOrdinal + 1];
        for (let retainerIndex = beginRetainerIndex; retainerIndex < endRetainerIndex; ++retainerIndex) {
            const retainerEdgeIndex = retainingEdges[retainerIndex];
            if (essentialEdges.getBit(retainerEdgeIndex / edgeFieldsCount)) {
                return false;
            }
        }
        return true;
    }
    static async calculateDominatorsAndRetainedSizes(inputs) {
        const { nodeCount, firstEdgeIndexes, edgeFieldsCount, nodeFieldCount, firstRetainerIndex, retainingEdges, retainingNodes, edgeToNodeOrdinals, rootNodeOrdinal, essentialEdges, nodeSelfSizesPromise, port, } = inputs;
        function isEssentialEdge(edgeIndex) {
            return essentialEdges.getBit(edgeIndex / edgeFieldsCount);
        }
        const arrayLength = nodeCount + 1;
        const parent = new Uint32Array(arrayLength);
        const ancestor = new Uint32Array(arrayLength);
        const vertex = new Uint32Array(arrayLength);
        const label = new Uint32Array(arrayLength);
        const semi = new Uint32Array(arrayLength);
        const bucket = new Array(arrayLength);
        let n = 0;
        const nextEdgeIndex = new Uint32Array(arrayLength);
        const dfs = (root) => {
            const rootOrdinal = root - 1;
            nextEdgeIndex[rootOrdinal] = firstEdgeIndexes[rootOrdinal];
            let v = root;
            while (v !== 0) {
                if (semi[v] === 0) {
                    semi[v] = ++n;
                    vertex[n] = label[v] = v;
                }
                let vNext = parent[v];
                const vOrdinal = v - 1;
                for (; nextEdgeIndex[vOrdinal] < firstEdgeIndexes[vOrdinal + 1]; nextEdgeIndex[vOrdinal] += edgeFieldsCount) {
                    const edgeIndex = nextEdgeIndex[vOrdinal];
                    if (!isEssentialEdge(edgeIndex)) {
                        continue;
                    }
                    const wOrdinal = edgeToNodeOrdinals[edgeIndex / edgeFieldsCount];
                    const w = wOrdinal + 1;
                    if (semi[w] === 0) {
                        parent[w] = v;
                        nextEdgeIndex[wOrdinal] = firstEdgeIndexes[wOrdinal];
                        vNext = w;
                        break;
                    }
                }
                v = vNext;
            }
        };
        const compressionStack = new Uint32Array(arrayLength);
        const compress = (v) => {
            let stackPointer = 0;
            while (ancestor[ancestor[v]] !== 0) {
                compressionStack[++stackPointer] = v;
                v = ancestor[v];
            }
            while (stackPointer > 0) {
                const w = compressionStack[stackPointer--];
                if (semi[label[ancestor[w]]] < semi[label[w]]) {
                    label[w] = label[ancestor[w]];
                }
                ancestor[w] = ancestor[ancestor[w]];
            }
        };
        const evaluate = (v) => {
            if (ancestor[v] === 0) {
                return v;
            }
            compress(v);
            return label[v];
        };
        const link = (v, w) => {
            ancestor[w] = v;
        };
        const r = rootNodeOrdinal + 1;
        n = 0;
        const dom = new Uint32Array(arrayLength);
        dfs(r);
        if (n < nodeCount) {
            const errors = [`Heap snapshot: ${nodeCount - n} nodes are unreachable from the root.`];
            appendToProblemReport(errors, 'The following nodes have only weak retainers:');
            for (let v = 1; v <= nodeCount; v++) {
                const vOrdinal = v - 1;
                if (semi[v] === 0 && HeapSnapshot.hasOnlyWeakRetainers(inputs, vOrdinal)) {
                    appendToProblemReport(errors, vOrdinal * nodeFieldCount);
                    parent[v] = r;
                    dfs(v);
                }
            }
            reportProblemToPrimaryWorker(errors, port);
        }
        if (n < nodeCount) {
            const errors = [`Heap snapshot: Still found ${nodeCount - n} unreachable nodes:`];
            for (let v = 1; v <= nodeCount; v++) {
                if (semi[v] === 0) {
                    const vOrdinal = v - 1;
                    appendToProblemReport(errors, vOrdinal * nodeFieldCount);
                    parent[v] = r;
                    semi[v] = ++n;
                    vertex[n] = label[v] = v;
                }
            }
            reportProblemToPrimaryWorker(errors, port);
        }
        for (let i = n; i >= 2; --i) {
            const w = vertex[i];
            const wOrdinal = w - 1;
            let isOrphanNode = true;
            for (let retainerIndex = firstRetainerIndex[wOrdinal]; retainerIndex < firstRetainerIndex[wOrdinal + 1]; retainerIndex++) {
                if (!isEssentialEdge(retainingEdges[retainerIndex])) {
                    continue;
                }
                isOrphanNode = false;
                const vOrdinal = retainingNodes[retainerIndex] / nodeFieldCount;
                const v = vOrdinal + 1;
                const u = evaluate(v);
                if (semi[u] < semi[w]) {
                    semi[w] = semi[u];
                }
            }
            if (isOrphanNode) {
                semi[w] = semi[r];
            }
            if (bucket[vertex[semi[w]]] === undefined) {
                bucket[vertex[semi[w]]] = new Set();
            }
            bucket[vertex[semi[w]]].add(w);
            link(parent[w], w);
            if (bucket[parent[w]] !== undefined) {
                for (const v of bucket[parent[w]]) {
                    const u = evaluate(v);
                    dom[v] = semi[u] < semi[v] ? u : parent[w];
                }
                bucket[parent[w]].clear();
            }
        }
        dom[0] = dom[r] = r;
        for (let i = 2; i <= n; i++) {
            const w = vertex[i];
            if (dom[w] !== vertex[semi[w]]) {
                dom[w] = dom[dom[w]];
            }
        }
        const dominatorsTree = new Uint32Array(nodeCount);
        const retainedSizes = new Float64Array(nodeCount);
        const nodeSelfSizes = await nodeSelfSizesPromise;
        for (let nodeOrdinal = 0; nodeOrdinal < nodeCount; nodeOrdinal++) {
            dominatorsTree[nodeOrdinal] = dom[nodeOrdinal + 1] - 1;
            retainedSizes[nodeOrdinal] = nodeSelfSizes[nodeOrdinal];
        }
        for (let i = n; i > 1; i--) {
            const nodeOrdinal = vertex[i] - 1;
            const dominatorOrdinal = dominatorsTree[nodeOrdinal];
            retainedSizes[dominatorOrdinal] += retainedSizes[nodeOrdinal];
        }
        return { dominatorsTree, retainedSizes };
    }
    static buildDominatedNodes(inputs) {
        const { nodeCount, dominatorsTree, rootNodeOrdinal, nodeFieldCount } = inputs;
        const indexArray = new Uint32Array(nodeCount + 1);
        const dominatedNodes = new Uint32Array(nodeCount - 1);
        let fromNodeOrdinal = 0;
        let toNodeOrdinal = nodeCount;
        if (rootNodeOrdinal === fromNodeOrdinal) {
            fromNodeOrdinal = 1;
        }
        else if (rootNodeOrdinal === toNodeOrdinal - 1) {
            toNodeOrdinal = toNodeOrdinal - 1;
        }
        else {
            throw new Error('Root node is expected to be either first or last');
        }
        for (let nodeOrdinal = fromNodeOrdinal; nodeOrdinal < toNodeOrdinal; ++nodeOrdinal) {
            ++indexArray[dominatorsTree[nodeOrdinal]];
        }
        let firstDominatedNodeIndex = 0;
        for (let i = 0, l = nodeCount; i < l; ++i) {
            const dominatedCount = dominatedNodes[firstDominatedNodeIndex] = indexArray[i];
            indexArray[i] = firstDominatedNodeIndex;
            firstDominatedNodeIndex += dominatedCount;
        }
        indexArray[nodeCount] = dominatedNodes.length;
        for (let nodeOrdinal = fromNodeOrdinal; nodeOrdinal < toNodeOrdinal; ++nodeOrdinal) {
            const dominatorOrdinal = dominatorsTree[nodeOrdinal];
            let dominatedRefIndex = indexArray[dominatorOrdinal];
            dominatedRefIndex += (--dominatedNodes[dominatedRefIndex]);
            dominatedNodes[dominatedRefIndex] = nodeOrdinal * nodeFieldCount;
        }
        return { firstDominatedNodeIndex: indexArray, dominatedNodes };
    }
    calculateObjectNames() {
        const { nodes, nodeCount, nodeNameOffset, nodeNativeType, nodeHiddenType, nodeObjectType, nodeCodeType, nodeClosureType, nodeRegExpType, } = this;
        const stringTable = new Map();
        const getIndexForString = (s) => {
            let index = stringTable.get(s);
            if (index === undefined) {
                index = this.addString(s);
                stringTable.set(s, index);
            }
            return index;
        };
        const hiddenClassIndex = getIndexForString('(system)');
        const codeClassIndex = getIndexForString('(compiled code)');
        const functionClassIndex = getIndexForString('Function');
        const regExpClassIndex = getIndexForString('RegExp');
        function getNodeClassIndex(node) {
            switch (node.rawType()) {
                case nodeHiddenType:
                    return hiddenClassIndex;
                case nodeObjectType:
                case nodeNativeType: {
                    let name = node.rawName();
                    if (name.startsWith('<')) {
                        const firstSpace = name.indexOf(' ');
                        if (firstSpace !== -1) {
                            name = name.substring(0, firstSpace) + '>';
                        }
                        return getIndexForString(name);
                    }
                    if (name.startsWith('Detached <')) {
                        const firstSpace = name.indexOf(' ', 10);
                        if (firstSpace !== -1) {
                            name = name.substring(0, firstSpace) + '>';
                        }
                        return getIndexForString(name);
                    }
                    return nodes.getValue(node.nodeIndex + nodeNameOffset);
                }
                case nodeCodeType:
                    return codeClassIndex;
                case nodeClosureType:
                    return functionClassIndex;
                case nodeRegExpType:
                    return regExpClassIndex;
                default:
                    return getIndexForString('(' + node.type() + ')');
            }
        }
        const node = this.createNode(0);
        for (let i = 0; i < nodeCount; ++i) {
            node.setClassIndex(getNodeClassIndex(node));
            node.nodeIndex = node.nextNodeIndex();
        }
    }
    calculateNativeContextAttribution() {
        const attribution = new Int32Array(this.nodeCount).fill(NO_NATIVE_CONTEXT);
        const isFixed = createBitVector(this.nodeCount);
        const edgeTargets = this.buildInitEdgeTargets();
        this.#nativeContextOrdinals = [];
        for (let ordinal = 0; ordinal < this.nodeCount; ordinal++) {
            if (this.isNativeContext(ordinal)) {
                this.#nativeContextOrdinals.push(ordinal);
                attribution[ordinal] = ordinal;
                isFixed.setBit(ordinal);
            }
            else {
                const owner = this.inferFixedNativeContextForOrdinal(ordinal, edgeTargets);
                if (owner >= 0) {
                    attribution[ordinal] = owner;
                    isFixed.setBit(ordinal);
                }
            }
        }
        this.propagateNativeContextAttribution(attribution, isFixed);
        this.nodeNativeContextAttribution = attribution;
    }
    calculateNativeContextSizes() {
        const nodeFieldCount = this.nodeFieldCount;
        const node = this.createNode(0);
        const nativeContexts = [];
        const ordinalToInfo = new Map();
        for (const ordinal of this.#nativeContextOrdinals) {
            node.nodeIndex = ordinal * nodeFieldCount;
            const info = {
                nodeId: node.id(),
                nodeIndex: node.nodeIndex,
                nodeName: node.name(),
                attributedSize: 0,
                retainedSize: node.retainedSize(),
                selfSize: node.selfSize(),
            };
            nativeContexts.push(info);
            ordinalToInfo.set(ordinal, info);
        }
        let sharedSize = 0;
        let noAttributionSize = 0;
        const selfSizeOffset = this.nodeSelfSizeOffset;
        const nodes = this.nodes;
        for (let i = 0; i < this.nodeCount; ++i) {
            const ownerOrdinal = this.nodeNativeContextAttribution[i];
            const selfSize = nodes.getValue(i * nodeFieldCount + selfSizeOffset);
            if (ownerOrdinal === SHARED_NATIVE_CONTEXT) {
                sharedSize += selfSize;
            }
            else if (ownerOrdinal === NO_NATIVE_CONTEXT) {
                noAttributionSize += selfSize;
            }
            else {
                console.assert(ownerOrdinal >= 0, 'ownerOrdinal should be >= 0');
                const info = ordinalToInfo.get(ownerOrdinal);
                console.assert(info !== undefined, 'info should exist');
                if (info) {
                    info.attributedSize += selfSize;
                }
            }
        }
        this.#nativeContextSizes = {
            nativeContexts,
            sharedSize,
            noAttributionSize,
        };
    }
    buildInitEdgeTargets() {
        const { nodeCount, nodeFieldCount, containmentEdges, edgeFieldsCount, edgeTypeOffset, edgeNameOffset, edgeToNodeOffset, edgeInternalType, firstEdgeIndexes, strings, } = this;
        const nativeContext = new Int32Array(nodeCount).fill(-1);
        const map = new Int32Array(nodeCount).fill(-1);
        const nativeContextIdx = strings.indexOf('native_context');
        const mapIdx = strings.indexOf('map');
        for (let ordinal = 0; ordinal < nodeCount; ordinal++) {
            const first = firstEdgeIndexes[ordinal];
            const last = firstEdgeIndexes[ordinal + 1];
            for (let edgeIndex = first; edgeIndex < last; edgeIndex += edgeFieldsCount) {
                const edgeType = containmentEdges.getValue(edgeIndex + edgeTypeOffset);
                if (edgeType !== edgeInternalType) {
                    continue;
                }
                const nameIdx = containmentEdges.getValue(edgeIndex + edgeNameOffset);
                const childNodeIndex = containmentEdges.getValue(edgeIndex + edgeToNodeOffset);
                const childOrdinal = childNodeIndex / nodeFieldCount;
                if (nameIdx === nativeContextIdx && nativeContext[ordinal] === -1 && this.isNativeContext(childOrdinal)) {
                    nativeContext[ordinal] = childOrdinal;
                }
                else if (nameIdx === mapIdx && map[ordinal] === -1) {
                    map[ordinal] = childOrdinal;
                }
            }
        }
        return { nativeContext, map };
    }
    inferFixedNativeContextForOrdinal(ordinal, edgeTargets) {
        const mapOrdinal = edgeTargets.map[ordinal];
        if (mapOrdinal >= 0) {
            const metaMapOrdinal = edgeTargets.map[mapOrdinal];
            if (metaMapOrdinal >= 0) {
                const mapNativeContextOrdinal = edgeTargets.nativeContext[metaMapOrdinal];
                if (mapNativeContextOrdinal >= 0) {
                    return mapNativeContextOrdinal;
                }
            }
        }
        return NO_NATIVE_CONTEXT;
    }
    mergeNativeContextOwner(current, incoming) {
        console.assert(incoming !== NO_NATIVE_CONTEXT, 'Incoming owner should not be NO_NATIVE_CONTEXT');
        if (current === SHARED_NATIVE_CONTEXT || incoming === SHARED_NATIVE_CONTEXT) {
            return SHARED_NATIVE_CONTEXT;
        }
        if (current === NO_NATIVE_CONTEXT) {
            return incoming;
        }
        if (current === incoming) {
            return current;
        }
        return SHARED_NATIVE_CONTEXT;
    }
    propagateNativeContextAttribution(attribution, isFixed) {
        const { nodeCount, containmentEdges, edgeFieldsCount, edgeTypeOffset, edgeToNodeOffset, edgeShortcutType, edgeWeakType, nodeFieldCount, firstEdgeIndexes, } = this;
        const queue = [];
        for (let ordinal = 0; ordinal < nodeCount; ordinal++) {
            if (isFixed.getBit(ordinal)) {
                queue.push(ordinal);
            }
        }
        let queueIndex = 0;
        while (queueIndex < queue.length) {
            const ordinal = queue[queueIndex];
            queueIndex++;
            const current = attribution[ordinal];
            console.assert(current !== NO_NATIVE_CONTEXT, 'Queue should not contain unattributed nodes');
            const first = firstEdgeIndexes[ordinal];
            const last = firstEdgeIndexes[ordinal + 1];
            for (let edgeIndex = first; edgeIndex < last; edgeIndex += edgeFieldsCount) {
                const edgeType = containmentEdges.getValue(edgeIndex + edgeTypeOffset);
                if (edgeType === edgeShortcutType || edgeType === edgeWeakType) {
                    continue;
                }
                const childNodeIndex = containmentEdges.getValue(edgeIndex + edgeToNodeOffset);
                const childOrdinal = childNodeIndex / nodeFieldCount;
                if (childOrdinal === ordinal || isFixed.getBit(childOrdinal)) {
                    continue;
                }
                const merged = this.mergeNativeContextOwner(attribution[childOrdinal], current);
                if (merged !== attribution[childOrdinal]) {
                    attribution[childOrdinal] = merged;
                    queue.push(childOrdinal);
                }
            }
        }
    }
    getNativeContextSizes() {
        return this.#nativeContextSizes;
    }
    getRetainedByContextSummary() {
        const isRetainedByContext = this.createNamedFilter('objectsRetainedByContexts');
        let contextCount = 0;
        let retainedByContextSize = 0;
        let retainedByContextCount = 0;
        let notRetainedByContextSize = 0;
        let notRetainedByContextCount = 0;
        const node = this.rootNode();
        const { nodes, nodeFieldCount, nodeSelfSizeOffset: selfSizeOffset } = this;
        const nodesLength = nodes.length;
        for (let nodeIndex = 0; nodeIndex < nodesLength; nodeIndex += nodeFieldCount) {
            const selfSize = nodes.getValue(nodeIndex + selfSizeOffset);
            if (!selfSize) {
                continue;
            }
            node.nodeIndex = nodeIndex;
            if (isRetainedByContext(node)) {
                retainedByContextCount++;
                retainedByContextSize += selfSize;
            }
            else {
                notRetainedByContextCount++;
                notRetainedByContextSize += selfSize;
            }
            if (this.isContextObject(node)) {
                contextCount++;
            }
        }
        return {
            contextCount,
            retainedByContextSize,
            retainedByContextCount,
            notRetainedByContextSize,
            notRetainedByContextCount,
            totalSize: retainedByContextSize + notRetainedByContextSize,
        };
    }
    nodeNativeContext(nodeIndex) {
        const ordinal = nodeIndex / this.nodeFieldCount;
        const nativeContextOrdinal = this.nodeNativeContextAttribution[ordinal];
        if (nativeContextOrdinal < 0) {
            return nativeContextOrdinal;
        }
        return nativeContextOrdinal * this.nodeFieldCount;
    }
    isNativeContext(nodeOrdinal) {
        const nameIdx = this.nodes.getValue(nodeOrdinal * this.nodeFieldCount + this.nodeNameOffset);
        const name = this.strings[nameIdx];
        return name === 'system / NativeContext' || name.startsWith('system / NativeContext / ') ||
            name === 'Detached system / NativeContext' || name.startsWith('Detached system / NativeContext / ');
    }
    interfaceDefinitions() {
        return JSON.stringify(this.#interfaceDefinitions ?? []);
    }
    isPlainJSObject(node) {
        return node.rawType() === this.nodeObjectType && node.rawName() === 'Object';
    }
    inferInterfaceDefinitions() {
        const { edgePropertyType } = this;
        const candidates = new Map();
        let totalObjectCount = 0;
        for (let it = this.allNodes(); it.hasNext(); it.next()) {
            const node = it.item();
            if (!this.isPlainJSObject(node)) {
                continue;
            }
            ++totalObjectCount;
            let interfaceName = '{';
            const properties = [];
            for (let edgeIt = node.edges(); edgeIt.hasNext(); edgeIt.next()) {
                const edge = edgeIt.item();
                const edgeName = edge.name();
                if (edge.rawType() !== edgePropertyType || edgeName === '__proto__') {
                    continue;
                }
                const formattedEdgeName = JSHeapSnapshotNode.formatPropertyName(edgeName);
                if (interfaceName.length > MIN_INTERFACE_PROPERTY_COUNT &&
                    interfaceName.length + formattedEdgeName.length > MAX_INTERFACE_NAME_LENGTH) {
                    break;
                }
                if (interfaceName.length !== 1) {
                    interfaceName += ', ';
                }
                interfaceName += formattedEdgeName;
                properties.push(edgeName);
            }
            if (properties.length === 0) {
                continue;
            }
            interfaceName += '}';
            const candidate = candidates.get(interfaceName);
            if (candidate) {
                ++candidate.count;
            }
            else {
                candidates.set(interfaceName, { name: interfaceName, properties, count: 1 });
            }
        }
        const sortedCandidates = Array.from(candidates.values());
        sortedCandidates.sort((a, b) => b.count - a.count);
        const result = [];
        const minCount = Math.max(MIN_OBJECT_COUNT_PER_INTERFACE, totalObjectCount / MIN_OBJECT_PROPORTION_PER_INTERFACE);
        for (let i = 0; i < sortedCandidates.length; ++i) {
            const candidate = sortedCandidates[i];
            if (candidate.count < minCount) {
                break;
            }
            result.push(candidate);
        }
        return result;
    }
    applyInterfaceDefinitions(definitions) {
        const { edgePropertyType } = this;
        this.#interfaceDefinitions = definitions;
        this.#aggregates = {};
        this.#aggregatesSortedFlags = {};
        function selectBetterMatch(a, b) {
            if (!b || a.propertyCount > b.propertyCount) {
                return a;
            }
            if (b.propertyCount > a.propertyCount) {
                return b;
            }
            return a.index <= b.index ? a : b;
        }
        const propertyTree = {
            next: new Map(),
            matchInfo: null,
            greatestNext: null,
        };
        for (let interfaceIndex = 0; interfaceIndex < definitions.length; ++interfaceIndex) {
            const definition = definitions[interfaceIndex];
            const properties = definition.properties.toSorted();
            let currentNode = propertyTree;
            for (const property of properties) {
                const nextMap = currentNode.next;
                let nextNode = nextMap.get(property);
                if (!nextNode) {
                    nextNode = {
                        next: new Map(),
                        matchInfo: null,
                        greatestNext: null,
                    };
                    nextMap.set(property, nextNode);
                    if (currentNode.greatestNext === null || currentNode.greatestNext < property) {
                        currentNode.greatestNext = property;
                    }
                }
                currentNode = nextNode;
            }
            if (!currentNode.matchInfo) {
                currentNode.matchInfo = {
                    name: definition.name,
                    propertyCount: properties.length,
                    index: interfaceIndex,
                };
            }
        }
        const initialMatch = {
            name: 'Object',
            propertyCount: 0,
            index: Infinity,
        };
        for (let it = this.allNodes(); it.hasNext(); it.next()) {
            const node = it.item();
            if (!this.isPlainJSObject(node)) {
                continue;
            }
            const properties = [];
            for (let edgeIt = node.edges(); edgeIt.hasNext(); edgeIt.next()) {
                const edge = edgeIt.item();
                if (edge.rawType() === edgePropertyType) {
                    properties.push(edge.name());
                }
            }
            properties.sort();
            const states = new Set();
            states.add(propertyTree);
            let match = selectBetterMatch(initialMatch, propertyTree.matchInfo);
            for (const property of properties) {
                for (const currentState of Array.from(states.keys())) {
                    if (currentState.greatestNext === null || property >= currentState.greatestNext) {
                        states.delete(currentState);
                    }
                    const nextState = currentState.next.get(property);
                    if (nextState) {
                        states.add(nextState);
                        match = selectBetterMatch(match, nextState.matchInfo);
                    }
                }
            }
            let classIndex = match === initialMatch ? node.rawNameIndex() : this.#interfaceNames.get(match.name);
            if (classIndex === undefined) {
                classIndex = this.addString(match.name);
                this.#interfaceNames.set(match.name, classIndex);
            }
            node.setClassIndex(classIndex);
        }
    }
    iterateFilteredChildren(nodeOrdinal, edgeFilterCallback, childCallback) {
        const beginEdgeIndex = this.firstEdgeIndexes[nodeOrdinal];
        const endEdgeIndex = this.firstEdgeIndexes[nodeOrdinal + 1];
        for (let edgeIndex = beginEdgeIndex; edgeIndex < endEdgeIndex; edgeIndex += this.edgeFieldsCount) {
            const childNodeIndex = this.containmentEdges.getValue(edgeIndex + this.edgeToNodeOffset);
            const childNodeOrdinal = childNodeIndex / this.nodeFieldCount;
            const type = this.containmentEdges.getValue(edgeIndex + this.edgeTypeOffset);
            if (!edgeFilterCallback(type)) {
                continue;
            }
            childCallback(childNodeOrdinal);
        }
    }
    addString(string) {
        this.strings.push(string);
        return this.strings.length - 1;
    }
    getEdgeTarget(node, edgeName) {
        for (let edgeIt = node.edges(); edgeIt.hasNext(); edgeIt.next()) {
            const edge = edgeIt.item();
            if (edge.name() === edgeName) {
                return edge.node();
            }
        }
        return null;
    }
    initDetachednessAndClassIndex() {
        this.detachednessAndClassIndexArray = new Uint32Array(this.nodeCount);
        if (this.nodeDetachednessAndClassIndexOffset !== -1) {
            const { nodeFieldCount, nodeDetachednessAndClassIndexOffset: offset } = this;
            for (let i = 0; i < this.nodeCount; ++i) {
                this.detachednessAndClassIndexArray[i] = Number(this.nodes.getValue(i * nodeFieldCount + offset));
            }
        }
        else {
            const node = this.rootNode();
            const nodesLength = this.nodes.length;
            const { nodeFieldCount, nodeNativeType, nodeTypeOffset } = this;
            for (let nodeIndex = 0; nodeIndex < nodesLength; nodeIndex += nodeFieldCount) {
                if (this.nodes.getValue(nodeIndex + nodeTypeOffset) === nodeNativeType) {
                    node.nodeIndex = nodeIndex;
                    if (node.name().startsWith('Detached ')) {
                        node.setDetachedness(2 );
                    }
                }
            }
        }
    }
    propagateDOMState() {
        if (this.nodeDetachednessAndClassIndexOffset === -1) {
            return;
        }
        const visited = new Uint8Array(this.nodeCount);
        const attached = [];
        const detached = [];
        const stringIndexCache = new Map();
        const node = this.createNode(0);
        const addDetachedPrefixToNodeName = function (snapshot, nodeIndex) {
            const oldStringIndex = snapshot.nodes.getValue(nodeIndex + snapshot.nodeNameOffset);
            let newStringIndex = stringIndexCache.get(oldStringIndex);
            if (newStringIndex === undefined) {
                newStringIndex = snapshot.addString('Detached ' + snapshot.strings[oldStringIndex]);
                stringIndexCache.set(oldStringIndex, newStringIndex);
            }
            snapshot.nodes.setValue(nodeIndex + snapshot.nodeNameOffset, newStringIndex);
        };
        const processNode = function (snapshot, nodeOrdinal, newState) {
            if (visited[nodeOrdinal]) {
                return;
            }
            const nodeIndex = nodeOrdinal * snapshot.nodeFieldCount;
            if (snapshot.nodes.getValue(nodeIndex + snapshot.nodeTypeOffset) !== snapshot.nodeNativeType) {
                visited[nodeOrdinal] = 1;
                return;
            }
            node.nodeIndex = nodeIndex;
            node.setDetachedness(newState);
            if (newState === 1 ) {
                attached.push(nodeOrdinal);
            }
            else if (newState === 2 ) {
                addDetachedPrefixToNodeName(snapshot, nodeIndex);
                detached.push(nodeOrdinal);
            }
            visited[nodeOrdinal] = 1;
        };
        const propagateState = function (snapshot, parentNodeOrdinal, newState) {
            snapshot.iterateFilteredChildren(parentNodeOrdinal, edgeType => ![snapshot.edgeHiddenType, snapshot.edgeInvisibleType, snapshot.edgeWeakType].includes(edgeType), nodeOrdinal => processNode(snapshot, nodeOrdinal, newState));
        };
        for (let nodeOrdinal = 0; nodeOrdinal < this.nodeCount; ++nodeOrdinal) {
            node.nodeIndex = nodeOrdinal * this.nodeFieldCount;
            const state = node.detachedness();
            if (state === 0 ) {
                continue;
            }
            processNode(this, nodeOrdinal, state);
        }
        while (attached.length !== 0) {
            const nodeOrdinal = attached.pop();
            propagateState(this, nodeOrdinal, 1 );
        }
        while (detached.length !== 0) {
            const nodeOrdinal = detached.pop();
            node.nodeIndex = nodeOrdinal * this.nodeFieldCount;
            const nodeState = node.detachedness();
            if (nodeState === 1 ) {
                continue;
            }
            propagateState(this, nodeOrdinal, 2 );
        }
    }
    buildSamples() {
        const samples = this.#rawSamples;
        if (!samples?.length) {
            return;
        }
        const sampleCount = samples.length / 2;
        const sizeForRange = new Array(sampleCount);
        const timestamps = new Array(sampleCount);
        const lastAssignedIds = new Array(sampleCount);
        const timestampOffset = this.#metaNode.sample_fields.indexOf('timestamp_us');
        const lastAssignedIdOffset = this.#metaNode.sample_fields.indexOf('last_assigned_id');
        for (let i = 0; i < sampleCount; i++) {
            sizeForRange[i] = 0;
            timestamps[i] = (samples[2 * i + timestampOffset]) / 1000;
            lastAssignedIds[i] = samples[2 * i + lastAssignedIdOffset];
        }
        const nodes = this.nodes;
        const nodesLength = nodes.length;
        const nodeFieldCount = this.nodeFieldCount;
        const node = this.rootNode();
        for (let nodeIndex = 0; nodeIndex < nodesLength; nodeIndex += nodeFieldCount) {
            node.nodeIndex = nodeIndex;
            const nodeId = node.id();
            if (nodeId % 2 === 0) {
                continue;
            }
            const rangeIndex = lowerBound(lastAssignedIds, nodeId, DEFAULT_COMPARATOR);
            if (rangeIndex === sampleCount) {
                continue;
            }
            sizeForRange[rangeIndex] += node.selfSize();
        }
        this.#samples = new Samples(timestamps, lastAssignedIds, sizeForRange);
    }
    buildLocationMap() {
        const map = new Map();
        const locations = this.#locations;
        for (let i = 0; i < locations.length; i += this.#locationFieldCount) {
            const nodeIndex = locations[i + this.#locationIndexOffset];
            const scriptId = locations[i + this.#locationScriptIdOffset];
            const line = locations[i + this.#locationLineOffset];
            const col = locations[i + this.#locationColumnOffset];
            map.set(nodeIndex, new Location(scriptId, line, col));
        }
        this.#locationMap = map;
    }
    getLocation(nodeIndex) {
        return this.#locationMap.get(nodeIndex) || null;
    }
    getSamples() {
        return this.#samples;
    }
    calculateFlags() {
        throw new Error('Not implemented');
    }
    calculateStatistics() {
        throw new Error('Not implemented');
    }
    userObjectsMapAndFlag() {
        throw new Error('Not implemented');
    }
    calculateSnapshotDiff(baseSnapshotId, baseSnapshotAggregates) {
        let snapshotDiff = this.#snapshotDiffs[baseSnapshotId];
        if (snapshotDiff) {
            return snapshotDiff;
        }
        snapshotDiff = {};
        const aggregates = this.getAggregatesByClassKey(true, 'allObjects');
        for (const classKey in baseSnapshotAggregates) {
            const baseAggregate = baseSnapshotAggregates[classKey];
            const diff = this.calculateDiffForClass(baseAggregate, aggregates[classKey]);
            if (diff) {
                snapshotDiff[classKey] = diff;
            }
        }
        const emptyBaseAggregate = new AggregateForDiff();
        for (const classKey in aggregates) {
            if (classKey in baseSnapshotAggregates) {
                continue;
            }
            const classDiff = this.calculateDiffForClass(emptyBaseAggregate, aggregates[classKey]);
            if (classDiff) {
                snapshotDiff[classKey] = classDiff;
            }
        }
        this.#snapshotDiffs[baseSnapshotId] = snapshotDiff;
        return snapshotDiff;
    }
    calculateDiffForClass(baseAggregate, aggregate) {
        const baseIds = baseAggregate.ids;
        const baseIndexes = baseAggregate.indexes;
        const baseSelfSizes = baseAggregate.selfSizes;
        const indexes = aggregate ? aggregate.idxs : [];
        let i = 0;
        let j = 0;
        const l = baseIds.length;
        const m = indexes.length;
        const diff = new Diff(aggregate ? aggregate.name : baseAggregate.name);
        const nodeB = this.createNode(indexes[j]);
        while (i < l && j < m) {
            const nodeAId = baseIds[i];
            if (nodeAId < nodeB.id()) {
                diff.deletedIndexes.push(baseIndexes[i]);
                diff.deletedIds.push(nodeAId);
                diff.deletedSelfSizes.push(baseSelfSizes[i]);
                diff.removedCount++;
                diff.removedSize += baseSelfSizes[i];
                ++i;
            }
            else if (nodeAId >
                nodeB.id()) {
                diff.addedIndexes.push(indexes[j]);
                diff.addedIds.push(nodeB.id());
                diff.addedSelfSizes.push(nodeB.selfSize());
                diff.addedCount++;
                diff.addedSize += nodeB.selfSize();
                nodeB.nodeIndex = indexes[++j];
            }
            else {
                ++i;
                nodeB.nodeIndex = indexes[++j];
            }
        }
        while (i < l) {
            diff.deletedIndexes.push(baseIndexes[i]);
            diff.deletedIds.push(baseIds[i]);
            diff.deletedSelfSizes.push(baseSelfSizes[i]);
            diff.removedCount++;
            diff.removedSize += baseSelfSizes[i];
            ++i;
        }
        while (j < m) {
            diff.addedIndexes.push(indexes[j]);
            diff.addedIds.push(nodeB.id());
            diff.addedSelfSizes.push(nodeB.selfSize());
            diff.addedCount++;
            diff.addedSize += nodeB.selfSize();
            nodeB.nodeIndex = indexes[++j];
        }
        diff.countDelta = diff.addedCount - diff.removedCount;
        diff.sizeDelta = diff.addedSize - diff.removedSize;
        if (!diff.addedCount && !diff.removedCount) {
            return null;
        }
        return diff;
    }
    nodeForSnapshotObjectId(snapshotObjectId) {
        for (let it = this.allNodes(); it.hasNext(); it.next()) {
            if (it.node.id() === snapshotObjectId) {
                return it.node;
            }
        }
        return null;
    }
    #classKeyFromClassKey(key) {
        return typeof key === 'number' ? (',' + this.strings[key]) : key;
    }
    nodeClassKey(snapshotObjectId) {
        const node = this.nodeForSnapshotObjectId(snapshotObjectId);
        if (node) {
            return this.#classKeyFromClassKey(node.classKeyInternal());
        }
        return null;
    }
    createEdgesProvider(nodeIndex, options) {
        const node = this.createNode(nodeIndex);
        const defaultFilter = this.containmentEdgesFilter();
        const minRetainedSize = options?.minRetainedSize;
        const excludePrimitives = options?.excludePrimitives ?? false;
        let filter = defaultFilter;
        if (minRetainedSize !== undefined || excludePrimitives) {
            filter = (edge) => {
                if (defaultFilter && !defaultFilter(edge)) {
                    return false;
                }
                const targetNode = edge.node();
                if (minRetainedSize !== undefined && targetNode.retainedSize() < minRetainedSize) {
                    return false;
                }
                if (excludePrimitives) {
                    const rawType = targetNode.rawType();
                    if (rawType === this.nodeNumberType) {
                        return false;
                    }
                    if (rawType === this.nodeNativeType) {
                        const targetName = targetNode.rawName();
                        if (targetName === 'undefined' || targetName === 'null' || targetName === 'true' ||
                            targetName === 'false') {
                            return false;
                        }
                    }
                }
                return true;
            };
        }
        const indexProvider = new HeapSnapshotEdgeIndexProvider(this);
        const provider = new HeapSnapshotEdgesProvider(this, filter, node.edges(), indexProvider);
        if (options?.sortBy) {
            const sortBy = options.sortBy;
            let comparator;
            if (sortBy === 'selfSize') {
                comparator = new ComparatorConfig('selfSize', false, '!edgeName', true);
            }
            else if (sortBy === 'name') {
                comparator = new ComparatorConfig('!edgeName', true, 'retainedSize', false);
            }
            else {
                comparator = new ComparatorConfig('retainedSize', false, '!edgeName', true);
            }
            provider.sortAndRewind(comparator);
        }
        return provider;
    }
    createEdgesProviderForTest(nodeIndex, filter) {
        const node = this.createNode(nodeIndex);
        const indexProvider = new HeapSnapshotEdgeIndexProvider(this);
        return new HeapSnapshotEdgesProvider(this, filter, node.edges(), indexProvider);
    }
    retainingEdgesFilter() {
        return null;
    }
    containmentEdgesFilter() {
        return null;
    }
    createRetainingEdgesProvider(nodeIndex) {
        const node = this.createNode(nodeIndex);
        const filter = this.retainingEdgesFilter();
        const indexProvider = new HeapSnapshotRetainerEdgeIndexProvider(this);
        return new HeapSnapshotEdgesProvider(this, filter, node.retainers(), indexProvider);
    }
    getRetainingPaths(nodeIndex, maxDepth = 30, maxNodes = 5000, maxSiblings = 100) {
        const { nodeFieldCount, firstRetainerIndex, retainingNodes, retainingEdges, edgeTypeOffset, edgeWeakType, containmentEdges, } = this;
        const distances = this.#nodeDistancesForRetainersView ?? this.nodeDistances;
        let traversedNodesCount = 0;
        const visiting = new Set();
        const visited = new Map();
        const rootDistance = 2;
        const limitsReached = {};
        const buildForest = (currentIndex, currentDepth) => {
            traversedNodesCount++;
            if (traversedNodesCount > maxNodes) {
                limitsReached.nodes = true;
                return [];
            }
            if (currentDepth >= maxDepth) {
                limitsReached.depth = true;
                return [];
            }
            const ordinal = currentIndex / nodeFieldCount;
            const currentDistance = distances[ordinal];
            if (currentDistance <= rootDistance) {
                return [];
            }
            if (visiting.has(currentIndex)) {
                return [];
            }
            const cachedDepth = visited.get(currentIndex);
            if (cachedDepth !== undefined) {
                if (currentDepth >= cachedDepth) {
                    return [];
                }
            }
            visiting.add(currentIndex);
            const beginRetainerIndex = firstRetainerIndex[ordinal];
            const endRetainerIndex = firstRetainerIndex[ordinal + 1];
            const retainers = [];
            for (let retainerIndex = beginRetainerIndex; retainerIndex < endRetainerIndex; ++retainerIndex) {
                const retainerNodeIndex = retainingNodes[retainerIndex];
                const retainerNodeOrdinal = retainerNodeIndex / nodeFieldCount;
                const dist = distances[retainerNodeOrdinal];
                const globalEdgeIndex = retainingEdges[retainerIndex];
                if (this.isEdgeIgnoredInRetainersView(globalEdgeIndex)) {
                    continue;
                }
                const edgeType = containmentEdges.getValue(globalEdgeIndex + edgeTypeOffset);
                if (edgeType === edgeWeakType) {
                    continue;
                }
                if (dist >= 0) {
                    const remainingDepth = maxDepth - currentDepth;
                    const neededDepth = dist - rootDistance;
                    if (neededDepth < remainingDepth) {
                        retainers.push({ retainerIndex, dist, nodeIndex: retainerNodeIndex });
                    }
                    else {
                        limitsReached.depth = true;
                    }
                }
            }
            retainers.sort((a, b) => a.dist - b.dist);
            const length = Math.min(retainers.length, maxSiblings);
            if (retainers.length > maxSiblings) {
                limitsReached.siblings = true;
            }
            const forest = [];
            for (let i = 0; i < length; i++) {
                const retainer = retainers[i];
                const edge = this.createRetainingEdge(retainer.retainerIndex);
                const globalEdgeIndex = retainingEdges[retainer.retainerIndex];
                const isRoot = retainer.dist === rootDistance;
                let children = [];
                if (isRoot) {
                    traversedNodesCount++;
                    if (traversedNodesCount > maxNodes) {
                        limitsReached.nodes = true;
                        break;
                    }
                }
                else {
                    children = buildForest(retainer.nodeIndex, currentDepth + 1);
                    if (children.length === 0) {
                        continue;
                    }
                }
                const retainerNode = this.createNode(retainer.nodeIndex);
                forest.push({
                    edgeIndex: globalEdgeIndex,
                    edgeName: edge.name(),
                    edgeType: edge.type(),
                    nodeId: retainerNode.id(),
                    nodeIndex: retainer.nodeIndex,
                    nodeName: retainerNode.name(),
                    distance: retainer.dist,
                    children,
                });
            }
            visiting.delete(currentIndex);
            visited.set(currentIndex, currentDepth);
            return forest;
        };
        const paths = buildForest(nodeIndex, 0);
        return { paths, limitsReached };
    }
    getDominatorsOf(nodeIndex) {
        const chain = [];
        let currentIndex = nodeIndex;
        const rootIndex = this.rootNodeIndex;
        while (currentIndex !== undefined) {
            const node = this.createNode(currentIndex);
            chain.push({
                nodeId: node.id(),
                nodeIndex: currentIndex,
                nodeName: node.name(),
                retainedSize: node.retainedSize(),
                selfSize: node.selfSize(),
            });
            if (currentIndex === rootIndex) {
                break;
            }
            const nextIndex = node.dominatorIndex();
            if (nextIndex === currentIndex) {
                break;
            }
            currentIndex = nextIndex;
        }
        return chain;
    }
    createAddedNodesProvider(baseSnapshotId, classKey) {
        const snapshotDiff = this.#snapshotDiffs[baseSnapshotId];
        const diffForClass = snapshotDiff[classKey];
        return new HeapSnapshotNodesProvider(this, diffForClass.addedIndexes);
    }
    createDeletedNodesProvider(nodeIndexes) {
        return new HeapSnapshotNodesProvider(this, nodeIndexes);
    }
    createNodesProviderForClass(classKey, nodeFilter) {
        return new HeapSnapshotNodesProvider(this, this.aggregatesWithFilter(nodeFilter)[classKey].idxs);
    }
    queryObjects(queryOptions) {
        const { nodes, nodeFieldCount, retainedSizes } = this;
        const nodesLength = nodes.length;
        const matchingIndexes = [];
        const classNamePattern = queryOptions.className ? new RegExp(queryOptions.className, 'i') : null;
        const propertyNamePattern = queryOptions.propertyName ? new RegExp(queryOptions.propertyName, 'i') : null;
        const targetNodeType = queryOptions.nodeType ? queryOptions.nodeType.toLowerCase() : null;
        const node = this.rootNode();
        for (let nodeIndex = 0, ordinal = 0; nodeIndex < nodesLength; nodeIndex += nodeFieldCount, ordinal++) {
            node.nodeIndex = nodeIndex;
            if (queryOptions.minSelfSize !== undefined && node.selfSize() < queryOptions.minSelfSize) {
                continue;
            }
            if (queryOptions.maxSelfSize !== undefined && node.selfSize() > queryOptions.maxSelfSize) {
                continue;
            }
            const retainedSize = retainedSizes[ordinal];
            if (queryOptions.minRetainedSize !== undefined && retainedSize < queryOptions.minRetainedSize) {
                continue;
            }
            if (queryOptions.maxRetainedSize !== undefined && retainedSize > queryOptions.maxRetainedSize) {
                continue;
            }
            if (queryOptions.isDetached !== undefined) {
                const isDetached = node.detachedness() === 2 ;
                if (isDetached !== queryOptions.isDetached) {
                    continue;
                }
            }
            if (classNamePattern) {
                const name = node.name();
                if (!classNamePattern.test(name)) {
                    continue;
                }
            }
            if (targetNodeType) {
                const typeStr = node.type();
                if (typeStr.toLowerCase() !== targetNodeType) {
                    continue;
                }
            }
            if (propertyNamePattern) {
                let propMatch = false;
                for (const iter = node.edges(); iter.hasNext(); iter.next()) {
                    if (propertyNamePattern.test(iter.edge.name())) {
                        propMatch = true;
                        break;
                    }
                }
                if (!propMatch) {
                    continue;
                }
            }
            matchingIndexes.push(nodeIndex);
        }
        const sortBy = queryOptions.sortBy ?? 'retainedSize';
        if (sortBy === 'retainedSize') {
            matchingIndexes.sort((a, b) => retainedSizes[b / nodeFieldCount] - retainedSizes[a / nodeFieldCount]);
        }
        else if (sortBy === 'selfSize') {
            matchingIndexes.sort((a, b) => {
                node.nodeIndex = b;
                const sizeB = node.selfSize();
                node.nodeIndex = a;
                const sizeA = node.selfSize();
                return sizeB - sizeA;
            });
        }
        else if (sortBy === 'id') {
            matchingIndexes.sort((a, b) => {
                node.nodeIndex = b;
                const idB = node.id();
                node.nodeIndex = a;
                const idA = node.id();
                return idA - idB;
            });
        }
        return new HeapSnapshotNodesProvider(this, matchingIndexes);
    }
    maxJsNodeId() {
        const nodeFieldCount = this.nodeFieldCount;
        const nodes = this.nodes;
        const nodesLength = nodes.length;
        let id = 0;
        for (let nodeIndex = this.nodeIdOffset; nodeIndex < nodesLength; nodeIndex += nodeFieldCount) {
            const nextId = nodes.getValue(nodeIndex);
            if (nextId % 2 === 0) {
                continue;
            }
            if (id < nextId) {
                id = nextId;
            }
        }
        return id;
    }
    updateStaticData() {
        return new StaticData(this.nodeCount, this.rootNodeIndexInternal, this.totalSize, this.maxJsNodeId());
    }
    ignoreNodeInRetainersView(nodeIndex) {
        this.#ignoredNodesInRetainersView.add(nodeIndex);
        this.calculateDistances( true);
        this.#updateIgnoredEdgesInRetainersView();
    }
    unignoreNodeInRetainersView(nodeIndex) {
        this.#ignoredNodesInRetainersView.delete(nodeIndex);
        if (this.#ignoredNodesInRetainersView.size === 0) {
            this.#nodeDistancesForRetainersView = undefined;
        }
        else {
            this.calculateDistances( true);
        }
        this.#updateIgnoredEdgesInRetainersView();
    }
    unignoreAllNodesInRetainersView() {
        this.#ignoredNodesInRetainersView.clear();
        this.#nodeDistancesForRetainersView = undefined;
        this.#updateIgnoredEdgesInRetainersView();
    }
    #updateIgnoredEdgesInRetainersView() {
        const distances = this.#nodeDistancesForRetainersView;
        this.#ignoredEdgesInRetainersView.clear();
        if (distances === undefined) {
            return;
        }
        const unreachableWeakMapEdges = new Multimap();
        const noDistance = this.#noDistance;
        const { nodeCount, nodeFieldCount } = this;
        const node = this.createNode(0);
        for (let nodeOrdinal = 0; nodeOrdinal < nodeCount; ++nodeOrdinal) {
            if (distances[nodeOrdinal] !== noDistance) {
                continue;
            }
            node.nodeIndex = nodeOrdinal * nodeFieldCount;
            for (let iter = node.edges(); iter.hasNext(); iter.next()) {
                const edge = iter.edge;
                if (!edge.isInternal()) {
                    continue;
                }
                const match = this.tryParseWeakMapEdgeName(edge.nameIndex());
                if (match) {
                    unreachableWeakMapEdges.set(edge.nodeIndex(), match.duplicatedPart);
                }
            }
        }
        for (const targetNodeIndex of unreachableWeakMapEdges.keys()) {
            node.nodeIndex = targetNodeIndex;
            for (let it = node.retainers(); it.hasNext(); it.next()) {
                const reverseEdge = it.item();
                if (!reverseEdge.isInternal()) {
                    continue;
                }
                const match = this.tryParseWeakMapEdgeName(reverseEdge.nameIndex());
                if (match && unreachableWeakMapEdges.hasValue(targetNodeIndex, match.duplicatedPart)) {
                    const forwardEdgeIndex = this.retainingEdges[reverseEdge.itemIndex()];
                    this.#ignoredEdgesInRetainersView.add(forwardEdgeIndex);
                }
            }
        }
    }
    areNodesIgnoredInRetainersView() {
        return this.#ignoredNodesInRetainersView.size > 0;
    }
    getDistanceForRetainersView(nodeIndex) {
        const nodeOrdinal = nodeIndex / this.nodeFieldCount;
        const distances = this.#nodeDistancesForRetainersView ?? this.nodeDistances;
        const distance = distances[nodeOrdinal];
        if (distance === this.#noDistance) {
            return Math.max(0, this.nodeDistances[nodeOrdinal]) + baseUnreachableDistance;
        }
        return distance;
    }
    isNodeIgnoredInRetainersView(nodeIndex) {
        return this.#ignoredNodesInRetainersView.has(nodeIndex);
    }
    isEdgeIgnoredInRetainersView(edgeIndex) {
        return this.#ignoredEdgesInRetainersView.has(edgeIndex);
    }
}
class HeapSnapshotItemProvider {
    iterator;
    #indexProvider;
    #isEmpty;
    iterationOrder;
    currentComparator;
    #sortedPrefixLength;
    #sortedSuffixLength;
    constructor(iterator, indexProvider) {
        this.iterator = iterator;
        this.#indexProvider = indexProvider;
        this.#isEmpty = !iterator.hasNext();
        this.iterationOrder = null;
        this.currentComparator = null;
        this.#sortedPrefixLength = 0;
        this.#sortedSuffixLength = 0;
    }
    createIterationOrder() {
        if (this.iterationOrder) {
            return;
        }
        this.iterationOrder = [];
        for (let iterator = this.iterator; iterator.hasNext(); iterator.next()) {
            this.iterationOrder.push(iterator.item().itemIndex());
        }
    }
    isEmpty() {
        return this.#isEmpty;
    }
    serializeItemsRange(begin, end) {
        this.createIterationOrder();
        if (begin > end) {
            throw new Error('Start position > end position: ' + begin + ' > ' + end);
        }
        if (!this.iterationOrder) {
            throw new Error('Iteration order undefined');
        }
        if (end > this.iterationOrder.length) {
            end = this.iterationOrder.length;
        }
        if (this.#sortedPrefixLength < end && begin < this.iterationOrder.length - this.#sortedSuffixLength &&
            this.currentComparator) {
            const currentComparator = this.currentComparator;
            this.sort(currentComparator, this.#sortedPrefixLength, this.iterationOrder.length - 1 - this.#sortedSuffixLength, begin, end - 1);
            if (begin <= this.#sortedPrefixLength) {
                this.#sortedPrefixLength = end;
            }
            if (end >= this.iterationOrder.length - this.#sortedSuffixLength) {
                this.#sortedSuffixLength = this.iterationOrder.length - begin;
            }
        }
        let position = begin;
        const count = end - begin;
        const result = new Array(count);
        for (let i = 0; i < count; ++i) {
            const itemIndex = this.iterationOrder[position++];
            const item = this.#indexProvider.itemForIndex(itemIndex);
            result[i] = item.serialize();
        }
        return new ItemsRange(begin, end, this.iterationOrder.length, result);
    }
    sortAndRewind(comparator) {
        this.currentComparator = comparator;
        this.#sortedPrefixLength = 0;
        this.#sortedSuffixLength = 0;
    }
}
class HeapSnapshotEdgesProvider extends HeapSnapshotItemProvider {
    snapshot;
    constructor(snapshot, filter, edgesIter, indexProvider) {
        const iter = filter ? new HeapSnapshotFilteredIterator(edgesIter, filter) :
            edgesIter;
        super(iter, indexProvider);
        this.snapshot = snapshot;
    }
    sort(comparator, leftBound, rightBound, windowLeft, windowRight) {
        const fieldName1 = comparator.fieldName1;
        const fieldName2 = comparator.fieldName2;
        const ascending1 = comparator.ascending1;
        const ascending2 = comparator.ascending2;
        const edgeA = this.iterator.item().clone();
        const edgeB = edgeA.clone();
        const nodeA = this.snapshot.createNode();
        const nodeB = this.snapshot.createNode();
        function compareEdgeField(fieldName, ascending, indexA, indexB) {
            edgeA.edgeIndex = indexA;
            edgeB.edgeIndex = indexB;
            let result = 0;
            if (fieldName === '!edgeName') {
                if (edgeB.name() === '__proto__') {
                    return -1;
                }
                if (edgeA.name() === '__proto__') {
                    return 1;
                }
                result = edgeA.hasStringName() === edgeB.hasStringName() ?
                    (edgeA.name() < edgeB.name() ? -1 : (edgeA.name() > edgeB.name() ? 1 : 0)) :
                    (edgeA.hasStringName() ? -1 : 1);
            }
            else {
                result = edgeA.getValueForSorting(fieldName) - edgeB.getValueForSorting(fieldName);
            }
            return ascending ? result : -result;
        }
        function compareNodeField(fieldName, ascending, indexA, indexB) {
            edgeA.edgeIndex = indexA;
            nodeA.nodeIndex = edgeA.nodeIndex();
            const valueA = nodeA[fieldName]();
            edgeB.edgeIndex = indexB;
            nodeB.nodeIndex = edgeB.nodeIndex();
            const valueB = nodeB[fieldName]();
            const result = valueA < valueB ? -1 : (valueA > valueB ? 1 : 0);
            return ascending ? result : -result;
        }
        function compareEdgeAndEdge(indexA, indexB) {
            let result = compareEdgeField(fieldName1, ascending1, indexA, indexB);
            if (result === 0) {
                result = compareEdgeField(fieldName2, ascending2, indexA, indexB);
            }
            if (result === 0) {
                return indexA - indexB;
            }
            return result;
        }
        function compareEdgeAndNode(indexA, indexB) {
            let result = compareEdgeField(fieldName1, ascending1, indexA, indexB);
            if (result === 0) {
                result = compareNodeField(fieldName2, ascending2, indexA, indexB);
            }
            if (result === 0) {
                return indexA - indexB;
            }
            return result;
        }
        function compareNodeAndEdge(indexA, indexB) {
            let result = compareNodeField(fieldName1, ascending1, indexA, indexB);
            if (result === 0) {
                result = compareEdgeField(fieldName2, ascending2, indexA, indexB);
            }
            if (result === 0) {
                return indexA - indexB;
            }
            return result;
        }
        function compareNodeAndNode(indexA, indexB) {
            let result = compareNodeField(fieldName1, ascending1, indexA, indexB);
            if (result === 0) {
                result = compareNodeField(fieldName2, ascending2, indexA, indexB);
            }
            if (result === 0) {
                return indexA - indexB;
            }
            return result;
        }
        if (!this.iterationOrder) {
            throw new Error('Iteration order not defined');
        }
        function isEdgeFieldName(fieldName) {
            return fieldName.startsWith('!edge');
        }
        if (isEdgeFieldName(fieldName1)) {
            if (isEdgeFieldName(fieldName2)) {
                sortRange(this.iterationOrder, compareEdgeAndEdge, leftBound, rightBound, windowLeft, windowRight);
            }
            else {
                sortRange(this.iterationOrder, compareEdgeAndNode, leftBound, rightBound, windowLeft, windowRight);
            }
        }
        else if (isEdgeFieldName(fieldName2)) {
            sortRange(this.iterationOrder, compareNodeAndEdge, leftBound, rightBound, windowLeft, windowRight);
        }
        else {
            sortRange(this.iterationOrder, compareNodeAndNode, leftBound, rightBound, windowLeft, windowRight);
        }
    }
}
class HeapSnapshotNodesProvider extends HeapSnapshotItemProvider {
    snapshot;
    constructor(snapshot, nodeIndexes) {
        const indexProvider = new HeapSnapshotNodeIndexProvider(snapshot);
        const it = new HeapSnapshotIndexRangeIterator(indexProvider, nodeIndexes);
        super(it, indexProvider);
        this.snapshot = snapshot;
    }
    nodePosition(snapshotObjectId) {
        this.createIterationOrder();
        const node = this.snapshot.createNode();
        let i = 0;
        if (!this.iterationOrder) {
            throw new Error('Iteration order not defined');
        }
        for (; i < this.iterationOrder.length; i++) {
            node.nodeIndex = this.iterationOrder[i];
            if (node.id() === snapshotObjectId) {
                break;
            }
        }
        if (i === this.iterationOrder.length) {
            return -1;
        }
        const targetNodeIndex = this.iterationOrder[i];
        let smallerCount = 0;
        const currentComparator = this.currentComparator;
        const compare = this.buildCompareFunction(currentComparator);
        for (let i = 0; i < this.iterationOrder.length; i++) {
            if (compare(this.iterationOrder[i], targetNodeIndex) < 0) {
                ++smallerCount;
            }
        }
        return smallerCount;
    }
    buildCompareFunction(comparator) {
        const nodeA = this.snapshot.createNode();
        const nodeB = this.snapshot.createNode();
        const fieldAccessor1 = nodeA[comparator.fieldName1];
        const fieldAccessor2 = nodeA[comparator.fieldName2];
        const ascending1 = comparator.ascending1 ? 1 : -1;
        const ascending2 = comparator.ascending2 ? 1 : -1;
        function sortByNodeField(fieldAccessor, ascending) {
            const valueA = fieldAccessor.call(nodeA);
            const valueB = fieldAccessor.call(nodeB);
            return valueA < valueB ? -ascending : (valueA > valueB ? ascending : 0);
        }
        function sortByComparator(indexA, indexB) {
            nodeA.nodeIndex = indexA;
            nodeB.nodeIndex = indexB;
            let result = sortByNodeField(fieldAccessor1, ascending1);
            if (result === 0) {
                result = sortByNodeField(fieldAccessor2, ascending2);
            }
            return result || indexA - indexB;
        }
        return sortByComparator;
    }
    sort(comparator, leftBound, rightBound, windowLeft, windowRight) {
        if (!this.iterationOrder) {
            throw new Error('Iteration order not defined');
        }
        sortRange(this.iterationOrder, this.buildCompareFunction(comparator), leftBound, rightBound, windowLeft, windowRight);
    }
}
class JSHeapSnapshot extends HeapSnapshot {
    nodeFlags;
    flags;
    #statistics;
    constructor(profile, progress) {
        super(profile, progress);
        this.nodeFlags = {
            canBeQueried: 1,
            detachedDOMTreeNode: 2,
            pageObject: 4,
        };
    }
    createNode(nodeIndex) {
        return new JSHeapSnapshotNode(this, nodeIndex === undefined ? -1 : nodeIndex);
    }
    createEdge(edgeIndex) {
        return new JSHeapSnapshotEdge(this, edgeIndex);
    }
    createRetainingEdge(retainerIndex) {
        return new JSHeapSnapshotRetainerEdge(this, retainerIndex);
    }
    containmentEdgesFilter() {
        return (edge) => !edge.isInvisible();
    }
    retainingEdgesFilter() {
        const containmentEdgesFilter = this.containmentEdgesFilter();
        function filter(edge) {
            return containmentEdgesFilter(edge) && !edge.node().isRoot() && !edge.isWeak();
        }
        return filter;
    }
    calculateFlags() {
        this.flags = new Uint8Array(this.nodeCount);
        this.markDetachedDOMTreeNodes();
        this.markQueriableHeapObjects();
        this.markPageOwnedNodes();
    }
    #hasUserRoots() {
        for (let iter = this.rootNode().edges(); iter.hasNext(); iter.next()) {
            if (this.isUserRoot(iter.edge.node())) {
                return true;
            }
        }
        return false;
    }
    calculateShallowSizes() {
        if (!this.#hasUserRoots()) {
            return;
        }
        const { nodeCount, nodes, nodeFieldCount, nodeSelfSizeOffset } = this;
        const kUnvisited = 0xffffffff;
        const kHasMultipleOwners = 0xfffffffe;
        if (nodeCount >= kHasMultipleOwners) {
            throw new Error('Too many nodes for calculateShallowSizes');
        }
        const owners = new Uint32Array(nodeCount);
        const worklist = [];
        const node = this.createNode(0);
        for (let i = 0; i < nodeCount; ++i) {
            if (node.isHidden() || node.isArray() || (node.isNative() && node.rawName() === 'system / ExternalStringData')) {
                owners[i] = kUnvisited;
            }
            else {
                owners[i] = i;
                worklist.push(i);
            }
            node.nodeIndex = node.nextNodeIndex();
        }
        while (worklist.length !== 0) {
            const id = worklist.pop();
            const owner = owners[id];
            node.nodeIndex = id * nodeFieldCount;
            for (let iter = node.edges(); iter.hasNext(); iter.next()) {
                const edge = iter.edge;
                if (edge.isWeak()) {
                    continue;
                }
                const targetId = edge.nodeIndex() / nodeFieldCount;
                switch (owners[targetId]) {
                    case kUnvisited:
                        owners[targetId] = owner;
                        worklist.push(targetId);
                        break;
                    case targetId:
                    case owner:
                    case kHasMultipleOwners:
                        break;
                    default:
                        owners[targetId] = kHasMultipleOwners;
                        worklist.push(targetId);
                        break;
                }
            }
        }
        for (let i = 0; i < nodeCount; ++i) {
            const ownerId = owners[i];
            switch (ownerId) {
                case kUnvisited:
                case kHasMultipleOwners:
                case i:
                    break;
                default: {
                    const ownedNodeIndex = i * nodeFieldCount;
                    const ownerNodeIndex = ownerId * nodeFieldCount;
                    node.nodeIndex = ownerNodeIndex;
                    if (node.isSynthetic() || node.isRoot()) {
                        break;
                    }
                    const sizeToTransfer = nodes.getValue(ownedNodeIndex + nodeSelfSizeOffset);
                    nodes.setValue(ownedNodeIndex + nodeSelfSizeOffset, 0);
                    nodes.setValue(ownerNodeIndex + nodeSelfSizeOffset, nodes.getValue(ownerNodeIndex + nodeSelfSizeOffset) + sizeToTransfer);
                    break;
                }
            }
        }
    }
    calculateDistances(isForRetainersView) {
        const pendingEphemeronEdges = new Set();
        const snapshot = this;
        function filter(node, edge) {
            if (node.isHidden() && edge.name() === 'sloppy_function_map' && node.rawName() === 'system / NativeContext') {
                return false;
            }
            if (node.isArray() && node.rawName() === '(map descriptors)') {
                const index = parseInt(edge.name(), 10);
                return index < 2 || (index % 3) !== 1;
            }
            if (edge.isInternal()) {
                const match = snapshot.tryParseWeakMapEdgeName(edge.nameIndex());
                if (match) {
                    if (!pendingEphemeronEdges.delete(match.duplicatedPart)) {
                        pendingEphemeronEdges.add(match.duplicatedPart);
                        return false;
                    }
                }
            }
            return true;
        }
        super.calculateDistances(isForRetainersView, filter);
    }
    isUserRoot(node) {
        return node.isUserRoot() || node.isDocumentDOMTreesRoot();
    }
    isContextObject(node) {
        const name = node.rawName();
        return name === 'system / Context' || name.startsWith('system / Context / ');
    }
    userObjectsMapAndFlag() {
        return { map: this.flags, flag: this.nodeFlags.pageObject };
    }
    flagsOfNode(node) {
        return this.flags[node.nodeIndex / this.nodeFieldCount];
    }
    markDetachedDOMTreeNodes() {
        const nodes = this.nodes;
        const nodesLength = nodes.length;
        const nodeFieldCount = this.nodeFieldCount;
        const nodeNativeType = this.nodeNativeType;
        const nodeTypeOffset = this.nodeTypeOffset;
        const flag = this.nodeFlags.detachedDOMTreeNode;
        const node = this.rootNode();
        for (let nodeIndex = 0, ordinal = 0; nodeIndex < nodesLength; nodeIndex += nodeFieldCount, ordinal++) {
            const nodeType = nodes.getValue(nodeIndex + nodeTypeOffset);
            if (nodeType !== nodeNativeType) {
                continue;
            }
            node.nodeIndex = nodeIndex;
            if (node.detachedness() === 2 ) {
                this.flags[ordinal] |= flag;
            }
        }
    }
    markQueriableHeapObjects() {
        const flag = this.nodeFlags.canBeQueried;
        const hiddenEdgeType = this.edgeHiddenType;
        const internalEdgeType = this.edgeInternalType;
        const invisibleEdgeType = this.edgeInvisibleType;
        const weakEdgeType = this.edgeWeakType;
        const edgeToNodeOffset = this.edgeToNodeOffset;
        const edgeTypeOffset = this.edgeTypeOffset;
        const edgeFieldsCount = this.edgeFieldsCount;
        const containmentEdges = this.containmentEdges;
        const nodeFieldCount = this.nodeFieldCount;
        const firstEdgeIndexes = this.firstEdgeIndexes;
        const flags = this.flags;
        const list = [];
        for (let iter = this.rootNode().edges(); iter.hasNext(); iter.next()) {
            if (iter.edge.node().isUserRoot()) {
                list.push(iter.edge.node().nodeIndex / nodeFieldCount);
            }
        }
        while (list.length) {
            const nodeOrdinal = list.pop();
            if (flags[nodeOrdinal] & flag) {
                continue;
            }
            flags[nodeOrdinal] |= flag;
            const beginEdgeIndex = firstEdgeIndexes[nodeOrdinal];
            const endEdgeIndex = firstEdgeIndexes[nodeOrdinal + 1];
            for (let edgeIndex = beginEdgeIndex; edgeIndex < endEdgeIndex; edgeIndex += edgeFieldsCount) {
                const childNodeIndex = containmentEdges.getValue(edgeIndex + edgeToNodeOffset);
                const childNodeOrdinal = childNodeIndex / nodeFieldCount;
                if (flags[childNodeOrdinal] & flag) {
                    continue;
                }
                const type = containmentEdges.getValue(edgeIndex + edgeTypeOffset);
                if (type === hiddenEdgeType || type === invisibleEdgeType || type === internalEdgeType ||
                    type === weakEdgeType) {
                    continue;
                }
                list.push(childNodeOrdinal);
            }
        }
    }
    markPageOwnedNodes() {
        const edgeShortcutType = this.edgeShortcutType;
        const edgeElementType = this.edgeElementType;
        const edgeToNodeOffset = this.edgeToNodeOffset;
        const edgeTypeOffset = this.edgeTypeOffset;
        const edgeFieldsCount = this.edgeFieldsCount;
        const edgeWeakType = this.edgeWeakType;
        const firstEdgeIndexes = this.firstEdgeIndexes;
        const containmentEdges = this.containmentEdges;
        const nodeFieldCount = this.nodeFieldCount;
        const nodesCount = this.nodeCount;
        const flags = this.flags;
        const pageObjectFlag = this.nodeFlags.pageObject;
        const nodesToVisit = new Uint32Array(nodesCount);
        let nodesToVisitLength = 0;
        const rootNodeOrdinal = this.rootNodeIndexInternal / nodeFieldCount;
        const node = this.rootNode();
        for (let edgeIndex = firstEdgeIndexes[rootNodeOrdinal], endEdgeIndex = firstEdgeIndexes[rootNodeOrdinal + 1]; edgeIndex < endEdgeIndex; edgeIndex += edgeFieldsCount) {
            const edgeType = containmentEdges.getValue(edgeIndex + edgeTypeOffset);
            const nodeIndex = containmentEdges.getValue(edgeIndex + edgeToNodeOffset);
            if (edgeType === edgeElementType) {
                node.nodeIndex = nodeIndex;
                if (!node.isDocumentDOMTreesRoot()) {
                    continue;
                }
            }
            else if (edgeType !== edgeShortcutType) {
                continue;
            }
            const nodeOrdinal = nodeIndex / nodeFieldCount;
            nodesToVisit[nodesToVisitLength++] = nodeOrdinal;
            flags[nodeOrdinal] |= pageObjectFlag;
        }
        while (nodesToVisitLength) {
            const nodeOrdinal = nodesToVisit[--nodesToVisitLength];
            const beginEdgeIndex = firstEdgeIndexes[nodeOrdinal];
            const endEdgeIndex = firstEdgeIndexes[nodeOrdinal + 1];
            for (let edgeIndex = beginEdgeIndex; edgeIndex < endEdgeIndex; edgeIndex += edgeFieldsCount) {
                const childNodeIndex = containmentEdges.getValue(edgeIndex + edgeToNodeOffset);
                const childNodeOrdinal = childNodeIndex / nodeFieldCount;
                if (flags[childNodeOrdinal] & pageObjectFlag) {
                    continue;
                }
                const type = containmentEdges.getValue(edgeIndex + edgeTypeOffset);
                if (type === edgeWeakType) {
                    continue;
                }
                nodesToVisit[nodesToVisitLength++] = childNodeOrdinal;
                flags[childNodeOrdinal] |= pageObjectFlag;
            }
        }
    }
    calculateStatistics() {
        const nodeFieldCount = this.nodeFieldCount;
        const nodes = this.nodes;
        const nodesLength = nodes.length;
        const nodeTypeOffset = this.nodeTypeOffset;
        const nodeSizeOffset = this.nodeSelfSizeOffset;
        const nodeNativeType = this.nodeNativeType;
        const nodeCodeType = this.nodeCodeType;
        const nodeConsStringType = this.nodeConsStringType;
        const nodeSlicedStringType = this.nodeSlicedStringType;
        const nodeHiddenType = this.nodeHiddenType;
        const nodeStringType = this.nodeStringType;
        let sizeNative = this.profile.snapshot.extra_native_bytes ?? 0;
        let sizeTypedArrays = 0;
        let sizeCode = 0;
        let sizeStrings = 0;
        let sizeJSArrays = 0;
        let sizeSystem = 0;
        const node = this.rootNode();
        for (let nodeIndex = 0; nodeIndex < nodesLength; nodeIndex += nodeFieldCount) {
            const nodeSize = nodes.getValue(nodeIndex + nodeSizeOffset);
            const nodeType = nodes.getValue(nodeIndex + nodeTypeOffset);
            if (nodeType === nodeHiddenType) {
                sizeSystem += nodeSize;
                continue;
            }
            node.nodeIndex = nodeIndex;
            if (nodeType === nodeNativeType) {
                sizeNative += nodeSize;
                if (node.rawName() === 'system / JSArrayBufferData') {
                    sizeTypedArrays += nodeSize;
                }
            }
            else if (nodeType === nodeCodeType) {
                sizeCode += nodeSize;
            }
            else if (nodeType === nodeConsStringType || nodeType === nodeSlicedStringType || nodeType === nodeStringType) {
                sizeStrings += nodeSize;
            }
            else if (node.rawName() === 'Array') {
                sizeJSArrays += this.calculateArraySize(node);
            }
        }
        this.#statistics = {
            total: this.totalSize,
            native: {
                total: sizeNative,
                typedArrays: sizeTypedArrays,
            },
            v8heap: {
                total: this.totalSize - sizeNative,
                code: sizeCode,
                jsArrays: sizeJSArrays,
                strings: sizeStrings,
                system: sizeSystem,
            },
        };
    }
    calculateArraySize(node) {
        let size = node.selfSize();
        const beginEdgeIndex = node.edgeIndexesStart();
        const endEdgeIndex = node.edgeIndexesEnd();
        const containmentEdges = this.containmentEdges;
        const strings = this.strings;
        const edgeToNodeOffset = this.edgeToNodeOffset;
        const edgeTypeOffset = this.edgeTypeOffset;
        const edgeNameOffset = this.edgeNameOffset;
        const edgeFieldsCount = this.edgeFieldsCount;
        const edgeInternalType = this.edgeInternalType;
        for (let edgeIndex = beginEdgeIndex; edgeIndex < endEdgeIndex; edgeIndex += edgeFieldsCount) {
            const edgeType = containmentEdges.getValue(edgeIndex + edgeTypeOffset);
            if (edgeType !== edgeInternalType) {
                continue;
            }
            const edgeName = strings[containmentEdges.getValue(edgeIndex + edgeNameOffset)];
            if (edgeName !== 'elements') {
                continue;
            }
            const elementsNodeIndex = containmentEdges.getValue(edgeIndex + edgeToNodeOffset);
            node.nodeIndex = elementsNodeIndex;
            if (node.retainersCount() === 1) {
                size += node.selfSize();
            }
            break;
        }
        return size;
    }
    getStatistics() {
        return this.#statistics;
    }
}
async function createJSHeapSnapshotForTesting(profile) {
    const result = new JSHeapSnapshot(profile, new HeapSnapshotProgress());
    const channel = new MessageChannel();
    new SecondaryInitManager(channel.port2);
    await result.initialize(channel.port1);
    return result;
}
class JSHeapSnapshotNode extends HeapSnapshotNode {
    canBeQueried() {
        const snapshot = this.snapshot;
        const flags = snapshot.flagsOfNode(this);
        return Boolean(flags & snapshot.nodeFlags.canBeQueried);
    }
    name() {
        const snapshot = this.snapshot;
        if (this.rawType() === snapshot.nodeConsStringType) {
            return this.consStringName();
        }
        if (this.rawType() === snapshot.nodeObjectType && this.rawName() === 'Object') {
            return this.#plainObjectName();
        }
        return this.rawName();
    }
    consStringName() {
        const snapshot = this.snapshot;
        const consStringType = snapshot.nodeConsStringType;
        const edgeInternalType = snapshot.edgeInternalType;
        const edgeFieldsCount = snapshot.edgeFieldsCount;
        const edgeToNodeOffset = snapshot.edgeToNodeOffset;
        const edgeTypeOffset = snapshot.edgeTypeOffset;
        const edgeNameOffset = snapshot.edgeNameOffset;
        const strings = snapshot.strings;
        const edges = snapshot.containmentEdges;
        const firstEdgeIndexes = snapshot.firstEdgeIndexes;
        const nodeFieldCount = snapshot.nodeFieldCount;
        const nodeTypeOffset = snapshot.nodeTypeOffset;
        const nodeNameOffset = snapshot.nodeNameOffset;
        const nodes = snapshot.nodes;
        const nodesStack = [];
        nodesStack.push(this.nodeIndex);
        let name = '';
        while (nodesStack.length && name.length < 1024) {
            const nodeIndex = nodesStack.pop();
            if (nodes.getValue(nodeIndex + nodeTypeOffset) !== consStringType) {
                name += strings[nodes.getValue(nodeIndex + nodeNameOffset)];
                continue;
            }
            const nodeOrdinal = nodeIndex / nodeFieldCount;
            const beginEdgeIndex = firstEdgeIndexes[nodeOrdinal];
            const endEdgeIndex = firstEdgeIndexes[nodeOrdinal + 1];
            let firstNodeIndex = 0;
            let secondNodeIndex = 0;
            for (let edgeIndex = beginEdgeIndex; edgeIndex < endEdgeIndex && (!firstNodeIndex || !secondNodeIndex); edgeIndex += edgeFieldsCount) {
                const edgeType = edges.getValue(edgeIndex + edgeTypeOffset);
                if (edgeType === edgeInternalType) {
                    const edgeName = strings[edges.getValue(edgeIndex + edgeNameOffset)];
                    if (edgeName === 'first') {
                        firstNodeIndex = edges.getValue(edgeIndex + edgeToNodeOffset);
                    }
                    else if (edgeName === 'second') {
                        secondNodeIndex = edges.getValue(edgeIndex + edgeToNodeOffset);
                    }
                }
            }
            nodesStack.push(secondNodeIndex);
            nodesStack.push(firstNodeIndex);
        }
        return name;
    }
    #plainObjectName() {
        const snapshot = this.snapshot;
        const { edgeFieldsCount, edgePropertyType } = snapshot;
        const edge = snapshot.createEdge(0);
        let categoryNameStart = '{';
        let categoryNameEnd = '}';
        let edgeIndexFromStart = this.edgeIndexesStart();
        let edgeIndexFromEnd = this.edgeIndexesEnd() - edgeFieldsCount;
        let nextFromEnd = false;
        while (edgeIndexFromStart <= edgeIndexFromEnd) {
            edge.edgeIndex = nextFromEnd ? edgeIndexFromEnd : edgeIndexFromStart;
            if (edge.rawType() !== edgePropertyType || edge.name() === '__proto__') {
                if (nextFromEnd) {
                    edgeIndexFromEnd -= edgeFieldsCount;
                }
                else {
                    edgeIndexFromStart += edgeFieldsCount;
                }
                continue;
            }
            const formatted = _a.formatPropertyName(edge.name());
            if (categoryNameStart.length > 1 && categoryNameStart.length + categoryNameEnd.length + formatted.length > 100) {
                break;
            }
            if (nextFromEnd) {
                edgeIndexFromEnd -= edgeFieldsCount;
                if (categoryNameEnd.length > 1) {
                    categoryNameEnd = ', ' + categoryNameEnd;
                }
                categoryNameEnd = formatted + categoryNameEnd;
            }
            else {
                edgeIndexFromStart += edgeFieldsCount;
                if (categoryNameStart.length > 1) {
                    categoryNameStart += ', ';
                }
                categoryNameStart += formatted;
            }
            nextFromEnd = !nextFromEnd;
        }
        if (edgeIndexFromStart <= edgeIndexFromEnd) {
            categoryNameStart += ', …';
        }
        if (categoryNameEnd.length > 1) {
            categoryNameStart += ', ';
        }
        return categoryNameStart + categoryNameEnd;
    }
    static formatPropertyName(name) {
        if (/[,'"{}]/.test(name)) {
            name = JSON.stringify({ [name]: 0 });
            name = name.substring(1, name.length - 3);
        }
        return name;
    }
    id() {
        const snapshot = this.snapshot;
        return snapshot.nodes.getValue(this.nodeIndex + snapshot.nodeIdOffset);
    }
    isHidden() {
        return this.rawType() === this.snapshot.nodeHiddenType;
    }
    isArray() {
        return this.rawType() === this.snapshot.nodeArrayType;
    }
    isSynthetic() {
        return this.rawType() === this.snapshot.nodeSyntheticType;
    }
    isNative() {
        return this.rawType() === this.snapshot.nodeNativeType;
    }
    isUserRoot() {
        return !this.isSynthetic();
    }
    isDocumentDOMTreesRoot() {
        return this.isSynthetic() && this.rawName() === '(Document DOM trees)';
    }
    serialize() {
        const result = super.serialize();
        const snapshot = this.snapshot;
        const flags = snapshot.flagsOfNode(this);
        if (flags & snapshot.nodeFlags.canBeQueried) {
            result.canBeQueried = true;
        }
        if (flags & snapshot.nodeFlags.detachedDOMTreeNode) {
            result.detachedDOMTreeNode = true;
        }
        return result;
    }
}
_a = JSHeapSnapshotNode;
class JSHeapSnapshotEdge extends HeapSnapshotEdge {
    clone() {
        const snapshot = this.snapshot;
        return new JSHeapSnapshotEdge(snapshot, this.edgeIndex);
    }
    hasStringName() {
        if (!this.isShortcut()) {
            return this.#hasStringName();
        }
        return isNaN(parseInt(this.#name(), 10));
    }
    isElement() {
        return this.rawType() === this.snapshot.edgeElementType;
    }
    isHidden() {
        return this.rawType() === this.snapshot.edgeHiddenType;
    }
    isWeak() {
        return this.rawType() === this.snapshot.edgeWeakType;
    }
    isInternal() {
        return this.rawType() === this.snapshot.edgeInternalType;
    }
    isInvisible() {
        return this.rawType() === this.snapshot.edgeInvisibleType;
    }
    isShortcut() {
        return this.rawType() === this.snapshot.edgeShortcutType;
    }
    name() {
        const name = this.#name();
        if (!this.isShortcut()) {
            return String(name);
        }
        const numName = parseInt(name, 10);
        return String(isNaN(numName) ? name : numName);
    }
    toString() {
        const name = this.name();
        switch (this.type()) {
            case 'context':
                return '->' + name;
            case 'element':
                return '[' + name + ']';
            case 'weak':
                return '[[' + name + ']]';
            case 'property':
                return name.indexOf(' ') === -1 ? '.' + name : '["' + name + '"]';
            case 'shortcut':
                if (typeof name === 'string') {
                    return name.indexOf(' ') === -1 ? '.' + name : '["' + name + '"]';
                }
                return '[' + name + ']';
            case 'internal':
            case 'hidden':
            case 'invisible':
                return '{' + name + '}';
        }
        return '?' + name + '?';
    }
    #hasStringName() {
        const type = this.rawType();
        const snapshot = this.snapshot;
        return type !== snapshot.edgeElementType && type !== snapshot.edgeHiddenType;
    }
    #name() {
        return this.#hasStringName() ? this.snapshot.strings[this.nameOrIndex()] : this.nameOrIndex();
    }
    nameOrIndex() {
        return this.edges.getValue(this.edgeIndex + this.snapshot.edgeNameOffset);
    }
    rawType() {
        return this.edges.getValue(this.edgeIndex + this.snapshot.edgeTypeOffset);
    }
    nameIndex() {
        if (!this.#hasStringName()) {
            throw new Error('Edge does not have string name');
        }
        return this.nameOrIndex();
    }
}
class JSHeapSnapshotRetainerEdge extends HeapSnapshotRetainerEdge {
    clone() {
        const snapshot = this.snapshot;
        return new JSHeapSnapshotRetainerEdge(snapshot, this.retainerIndex());
    }
    isHidden() {
        return this.edge().isHidden();
    }
    isInvisible() {
        return this.edge().isInvisible();
    }
    isShortcut() {
        return this.edge().isShortcut();
    }
    isWeak() {
        return this.edge().isWeak();
    }
}

var HeapSnapshot$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    HeapSnapshot: HeapSnapshot,
    HeapSnapshotEdge: HeapSnapshotEdge,
    HeapSnapshotEdgeIndexProvider: HeapSnapshotEdgeIndexProvider,
    HeapSnapshotEdgeIterator: HeapSnapshotEdgeIterator,
    HeapSnapshotEdgesProvider: HeapSnapshotEdgesProvider,
    HeapSnapshotFilteredIterator: HeapSnapshotFilteredIterator,
    HeapSnapshotIndexRangeIterator: HeapSnapshotIndexRangeIterator,
    HeapSnapshotItemProvider: HeapSnapshotItemProvider,
    HeapSnapshotNode: HeapSnapshotNode,
    HeapSnapshotNodeIndexProvider: HeapSnapshotNodeIndexProvider,
    HeapSnapshotNodeIterator: HeapSnapshotNodeIterator,
    HeapSnapshotNodesProvider: HeapSnapshotNodesProvider,
    HeapSnapshotProgress: HeapSnapshotProgress,
    HeapSnapshotRetainerEdge: HeapSnapshotRetainerEdge,
    HeapSnapshotRetainerEdgeIndexProvider: HeapSnapshotRetainerEdgeIndexProvider,
    HeapSnapshotRetainerEdgeIterator: HeapSnapshotRetainerEdgeIterator,
    JSHeapSnapshot: JSHeapSnapshot,
    JSHeapSnapshotEdge: JSHeapSnapshotEdge,
    JSHeapSnapshotNode: JSHeapSnapshotNode,
    JSHeapSnapshotRetainerEdge: JSHeapSnapshotRetainerEdge,
    SecondaryInitManager: SecondaryInitManager,
    createJSHeapSnapshotForTesting: createJSHeapSnapshotForTesting
});

// Copyright 2023 The Chromium Authors
new FinalizationRegistry(url => {
    URL.revokeObjectURL(url);
});

/**
 * marked v18.0.4 - a markdown parser
 * Copyright (c) 2018-2026, MarkedJS. (MIT License)
 * Copyright (c) 2011-2018, Christopher Jeffrey. (MIT License)
 * https://github.com/markedjs/marked
 */
function M() { return { async: false, breaks: false, extensions: null, gfm: true, hooks: null, pedantic: false, renderer: null, silent: false, tokenizer: null, walkTokens: null }; }
var T = M();
function N(l) { T = l; }
var _ = { exec: () => null };
function E(l) { let e = []; return t => { let n = Math.max(0, Math.min(3, t - 1)), s = e[n]; return s || (s = l(n), e[n] = s), s; }; }
function d(l, e = "") { let t = typeof l == "string" ? l : l.source, n = { replace: (s, r) => { let i = typeof r == "string" ? r : r.source; return i = i.replace(m.caret, "$1"), t = t.replace(s, i), n; }, getRegex: () => new RegExp(t, e) }; return n; }
var Te = ((l = "") => { try {
    return !!new RegExp("(?<=1)(?<!1)" + l);
}
catch {
    return false;
} })(), m = { codeRemoveIndent: /^(?: {1,4}| {0,3}\t)/gm, outputLinkReplace: /\\([\[\]])/g, indentCodeCompensation: /^(\s+)(?:```)/, beginningSpace: /^\s+/, endingHash: /#$/, startingSpaceChar: /^ /, endingSpaceChar: / $/, nonSpaceChar: /[^ ]/, newLineCharGlobal: /\n/g, tabCharGlobal: /\t/g, multipleSpaceGlobal: /\s+/g, blankLine: /^[ \t]*$/, doubleBlankLine: /\n[ \t]*\n[ \t]*$/, blockquoteStart: /^ {0,3}>/, blockquoteSetextReplace: /\n {0,3}((?:=+|-+) *)(?=\n|$)/g, blockquoteSetextReplace2: /^ {0,3}>[ \t]?/gm, listReplaceNesting: /^ {1,4}(?=( {4})*[^ ])/g, listIsTask: /^\[[ xX]\] +\S/, listReplaceTask: /^\[[ xX]\] +/, listTaskCheckbox: /\[[ xX]\]/, anyLine: /\n.*\n/, hrefBrackets: /^<(.*)>$/, tableDelimiter: /[:|]/, tableAlignChars: /^\||\| *$/g, tableRowBlankLine: /\n[ \t]*$/, tableAlignRight: /^ *-+: *$/, tableAlignCenter: /^ *:-+: *$/, tableAlignLeft: /^ *:-+ *$/, startATag: /^<a /i, endATag: /^<\/a>/i, startPreScriptTag: /^<(pre|code|kbd|script)(\s|>)/i, endPreScriptTag: /^<\/(pre|code|kbd|script)(\s|>)/i, startAngleBracket: /^</, endAngleBracket: />$/, pedanticHrefTitle: /^([^'"]*[^\s])\s+(['"])(.*)\2/, unicodeAlphaNumeric: /[\p{L}\p{N}]/u, escapeTest: /[&<>"']/, escapeReplace: /[&<>"']/g, escapeTestNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/, escapeReplaceNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g, caret: /(^|[^\[])\^/g, percentDecode: /%25/g, findPipe: /\|/g, splitPipe: / \|/, slashPipe: /\\\|/g, carriageReturn: /\r\n|\r/g, spaceLine: /^ +$/gm, notSpaceStart: /^\S*/, endingNewline: /\n$/, listItemRegex: l => new RegExp(`^( {0,3}${l})((?:[	 ][^\\n]*)?(?:\\n|$))`), nextBulletRegex: E(l => new RegExp(`^ {0,${l}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`)), hrRegex: E(l => new RegExp(`^ {0,${l}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`)), fencesBeginRegex: E(l => new RegExp(`^ {0,${l}}(?:\`\`\`|~~~)`)), headingBeginRegex: E(l => new RegExp(`^ {0,${l}}#`)), htmlBeginRegex: E(l => new RegExp(`^ {0,${l}}<(?:[a-z].*>|!--)`, "i")), blockquoteBeginRegex: E(l => new RegExp(`^ {0,${l}}>`)) }, Oe = /^(?:[ \t]*(?:\n|$))+/, we = /^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/, ye = /^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/, B = /^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/, Pe = /^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/, j = / {0,3}(?:[*+-]|\d{1,9}[.)])/, oe = /^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/, ae = d(oe).replace(/bull/g, j).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/\|table/g, "").getRegex(), Se = d(oe).replace(/bull/g, j).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/table/g, / {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(), F = /^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/, $e = /^[^\n]+/, U = /(?!\s*\])(?:\\[\s\S]|[^\[\]\\])+/, Le = d(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label", U).replace("title", /(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(), _e = d(/^(bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g, j).getRegex(), H = "address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul", K = /<!--(?:-?>|[\s\S]*?(?:-->|$))/, ze = d("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))", "i").replace("comment", K).replace("tag", H).replace("attribute", / +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(), le = d(F).replace("hr", B).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("|table", "").replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", H).getRegex(), Me = d(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph", le).getRegex(), W = { blockquote: Me, code: we, def: Le, fences: ye, heading: Pe, hr: B, html: ze, lheading: ae, list: _e, newline: Oe, paragraph: le, table: _, text: $e }, se = d("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr", B).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("blockquote", " {0,3}>").replace("code", "(?: {4}| {0,3}	)[^\\n]").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", H).getRegex(), Ee = { ...W, lheading: Se, table: se, paragraph: d(F).replace("hr", B).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("table", se).replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", H).getRegex() }, Ie = { ...W, html: d(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment", K).replace(/tag/g, "(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(), def: /^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/, heading: /^(#{1,6})(.*)(?:\n+|$)/, fences: _, lheading: /^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/, paragraph: d(F).replace("hr", B).replace("heading", ` *#{1,6} *[^
]`).replace("lheading", ae).replace("|table", "").replace("blockquote", " {0,3}>").replace("|fences", "").replace("|list", "").replace("|html", "").replace("|tag", "").getRegex() }, Ae = /^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/, Ce = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/, ue = /^( {2,}|\\)\n(?!\s*$)/, Be = /^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/, I = /[\p{P}\p{S}]/u, Z = /[\s\p{P}\p{S}]/u, X = /[^\s\p{P}\p{S}]/u, De = d(/^((?![*_])punctSpace)/, "u").replace(/punctSpace/g, Z).getRegex(), pe = /(?!~)[\p{P}\p{S}]/u, qe = /(?!~)[\s\p{P}\p{S}]/u, ve = /(?:[^\s\p{P}\p{S}]|~)/u, He = d(/link|precode-code|html/, "g").replace("link", /\[(?:[^\[\]`]|(?<a>`+)[^`]+\k<a>(?!`))*?\]\((?:\\[\s\S]|[^\\\(\)]|\((?:\\[\s\S]|[^\\\(\)])*\))*\)/).replace("precode-", Te ? "(?<!`)()" : "(^^|[^`])").replace("code", /(?<b>`+)[^`]+\k<b>(?!`)/).replace("html", /<(?! )[^<>]*?>/).getRegex(), ce = /^(?:\*+(?:((?!\*)punct)|([^\s*]))?)|^_+(?:((?!_)punct)|([^\s_]))?/, Ze = d(ce, "u").replace(/punct/g, I).getRegex(), Ge = d(ce, "u").replace(/punct/g, pe).getRegex(), he = "^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)", Ne = d(he, "gu").replace(/notPunctSpace/g, X).replace(/punctSpace/g, Z).replace(/punct/g, I).getRegex(), Qe = d(he, "gu").replace(/notPunctSpace/g, ve).replace(/punctSpace/g, qe).replace(/punct/g, pe).getRegex(), je = d("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)", "gu").replace(/notPunctSpace/g, X).replace(/punctSpace/g, Z).replace(/punct/g, I).getRegex(), Fe = d(/^~~?(?:((?!~)punct)|[^\s~])/, "u").replace(/punct/g, I).getRegex(), Ue = "^[^~]+(?=[^~])|(?!~)punct(~~?)(?=[\\s]|$)|notPunctSpace(~~?)(?!~)(?=punctSpace|$)|(?!~)punctSpace(~~?)(?=notPunctSpace)|[\\s](~~?)(?!~)(?=punct)|(?!~)punct(~~?)(?!~)(?=punct)|notPunctSpace(~~?)(?=notPunctSpace)", Ke = d(Ue, "gu").replace(/notPunctSpace/g, X).replace(/punctSpace/g, Z).replace(/punct/g, I).getRegex(), We = d(/\\(punct)/, "gu").replace(/punct/g, I).getRegex(), Xe = d(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme", /[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email", /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(), Je = d(K).replace("(?:-->|$)", "-->").getRegex(), Ve = d("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment", Je).replace("attribute", /\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(), v = /(?:\[(?:\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\])|[^\[\]\\`])*?/, Ye = d(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]+(?:\n[ \t]*)?|\n[ \t]*)(title))?\s*\)/).replace("label", v).replace("href", /<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title", /"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(), ke = d(/^!?\[(label)\]\[(ref)\]/).replace("label", v).replace("ref", U).getRegex(), de = d(/^!?\[(ref)\](?:\[\])?/).replace("ref", U).getRegex(), et = d("reflink|nolink(?!\\()", "g").replace("reflink", ke).replace("nolink", de).getRegex(), ie = /[hH][tT][tT][pP][sS]?|[fF][tT][pP]/, J = { _backpedal: _, anyPunctuation: We, autolink: Xe, blockSkip: He, br: ue, code: Ce, del: _, delLDelim: _, delRDelim: _, emStrongLDelim: Ze, emStrongRDelimAst: Ne, emStrongRDelimUnd: je, escape: Ae, link: Ye, nolink: de, punctuation: De, reflink: ke, reflinkSearch: et, tag: Ve, text: Be, url: _ }, tt = { ...J, link: d(/^!?\[(label)\]\((.*?)\)/).replace("label", v).getRegex(), reflink: d(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label", v).getRegex() }, Q = { ...J, emStrongRDelimAst: Qe, emStrongLDelim: Ge, delLDelim: Fe, delRDelim: Ke, url: d(/^((?:protocol):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/).replace("protocol", ie).replace("email", /[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(), _backpedal: /(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/, del: /^(~~?)(?=[^\s~])((?:\\[\s\S]|[^\\])*?(?:\\[\s\S]|[^\s~\\]))\1(?=[^~]|$)/, text: d(/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|protocol:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/).replace("protocol", ie).getRegex() }, nt = { ...Q, br: d(ue).replace("{2,}", "*").getRegex(), text: d(Q.text).replace("\\b_", "\\b_| {2,}\\n").replace(/\{2,\}/g, "*").getRegex() }, D = { normal: W, gfm: Ee, pedantic: Ie }, A = { normal: J, gfm: Q, breaks: nt, pedantic: tt };
var rt = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }, ge = l => rt[l];
function O(l, e) { if (e) {
    if (m.escapeTest.test(l))
        return l.replace(m.escapeReplace, ge);
}
else if (m.escapeTestNoEncode.test(l))
    return l.replace(m.escapeReplaceNoEncode, ge); return l; }
function V(l) { try {
    l = encodeURI(l).replace(m.percentDecode, "%");
}
catch {
    return null;
} return l; }
function Y(l, e) { let t = l.replace(m.findPipe, (r, i, o) => { let u = false, a = i; for (; --a >= 0 && o[a] === "\\";)
    u = !u; return u ? "|" : " |"; }), n = t.split(m.splitPipe), s = 0; if (n[0].trim() || n.shift(), n.length > 0 && !n.at(-1)?.trim() && n.pop(), e)
    if (n.length > e)
        n.splice(e);
    else
        for (; n.length < e;)
            n.push(""); for (; s < n.length; s++)
    n[s] = n[s].trim().replace(m.slashPipe, "|"); return n; }
function $(l, e, t) { let n = l.length; if (n === 0)
    return ""; let s = 0; for (; s < n;) {
    let r = l.charAt(n - s - 1);
    if (r === e && true)
        s++;
    else break;
} return l.slice(0, n - s); }
function ee(l) {
    let e = l.split(`
`), t = e.length - 1;
    for (; t >= 0 && m.blankLine.test(e[t]);)
        t--;
    return e.length - t <= 2 ? l : e.slice(0, t + 1).join(`
`);
}
function fe(l, e) { if (l.indexOf(e[1]) === -1)
    return -1; let t = 0; for (let n = 0; n < l.length; n++)
    if (l[n] === "\\")
        n++;
    else if (l[n] === e[0])
        t++;
    else if (l[n] === e[1] && (t--, t < 0))
        return n; return t > 0 ? -2 : -1; }
function me(l, e = 0) { let t = e, n = ""; for (let s of l)
    if (s === "	") {
        let r = 4 - t % 4;
        n += " ".repeat(r), t += r;
    }
    else
        n += s, t++; return n; }
function xe(l, e, t, n, s) { let r = e.href, i = e.title || null, o = l[1].replace(s.other.outputLinkReplace, "$1"); n.state.inLink = true; let u = { type: l[0].charAt(0) === "!" ? "image" : "link", raw: t, href: r, title: i, text: o, tokens: n.inlineTokens(o) }; return n.state.inLink = false, u; }
function st(l, e, t) {
    let n = l.match(t.other.indentCodeCompensation);
    if (n === null)
        return e;
    let s = n[1];
    return e.split(`
`).map(r => { let i = r.match(t.other.beginningSpace); if (i === null)
        return r; let [o] = i; return o.length >= s.length ? r.slice(s.length) : r; }).join(`
`);
}
var w = class {
    options;
    rules;
    lexer;
    constructor(e) { this.options = e || T; }
    space(e) { let t = this.rules.block.newline.exec(e); if (t && t[0].length > 0)
        return { type: "space", raw: t[0] }; }
    code(e) { let t = this.rules.block.code.exec(e); if (t) {
        let n = this.options.pedantic ? t[0] : ee(t[0]), s = n.replace(this.rules.other.codeRemoveIndent, "");
        return { type: "code", raw: n, codeBlockStyle: "indented", text: s };
    } }
    fences(e) { let t = this.rules.block.fences.exec(e); if (t) {
        let n = t[0], s = st(n, t[3] || "", this.rules);
        return { type: "code", raw: n, lang: t[2] ? t[2].trim().replace(this.rules.inline.anyPunctuation, "$1") : t[2], text: s };
    } }
    heading(e) {
        let t = this.rules.block.heading.exec(e);
        if (t) {
            let n = t[2].trim();
            if (this.rules.other.endingHash.test(n)) {
                let s = $(n, "#");
                (this.options.pedantic || !s || this.rules.other.endingSpaceChar.test(s)) && (n = s.trim());
            }
            return { type: "heading", raw: $(t[0], `
`), depth: t[1].length, text: n, tokens: this.lexer.inline(n) };
        }
    }
    hr(e) {
        let t = this.rules.block.hr.exec(e);
        if (t)
            return { type: "hr", raw: $(t[0], `
`) };
    }
    blockquote(e) {
        let t = this.rules.block.blockquote.exec(e);
        if (t) {
            let n = $(t[0], `
`).split(`
`), s = "", r = "", i = [];
            for (; n.length > 0;) {
                let o = false, u = [], a;
                for (a = 0; a < n.length; a++)
                    if (this.rules.other.blockquoteStart.test(n[a]))
                        u.push(n[a]), o = true;
                    else if (!o)
                        u.push(n[a]);
                    else
                        break;
                n = n.slice(a);
                let c = u.join(`
`), p = c.replace(this.rules.other.blockquoteSetextReplace, `
    $1`).replace(this.rules.other.blockquoteSetextReplace2, "");
                s = s ? `${s}
${c}` : c, r = r ? `${r}
${p}` : p;
                let k = this.lexer.state.top;
                if (this.lexer.state.top = true, this.lexer.blockTokens(p, i, true), this.lexer.state.top = k, n.length === 0)
                    break;
                let h = i.at(-1);
                if (h?.type === "code")
                    break;
                if (h?.type === "blockquote") {
                    let R = h, f = R.raw + `
` + n.join(`
`), S = this.blockquote(f);
                    i[i.length - 1] = S, s = s.substring(0, s.length - R.raw.length) + S.raw, r = r.substring(0, r.length - R.text.length) + S.text;
                    break;
                }
                else if (h?.type === "list") {
                    let R = h, f = R.raw + `
` + n.join(`
`), S = this.list(f);
                    i[i.length - 1] = S, s = s.substring(0, s.length - h.raw.length) + S.raw, r = r.substring(0, r.length - R.raw.length) + S.raw, n = f.substring(i.at(-1).raw.length).split(`
`);
                    continue;
                }
            }
            return { type: "blockquote", raw: s, tokens: i, text: r };
        }
    }
    list(e) {
        let t = this.rules.block.list.exec(e);
        if (t) {
            let n = t[1].trim(), s = n.length > 1, r = { type: "list", raw: "", ordered: s, start: s ? +n.slice(0, -1) : "", loose: false, items: [] };
            n = s ? `\\d{1,9}\\${n.slice(-1)}` : `\\${n}`, this.options.pedantic && (n = s ? n : "[*+-]");
            let i = this.rules.other.listItemRegex(n), o = false;
            for (; e;) {
                let a = false, c = "", p = "";
                if (!(t = i.exec(e)) || this.rules.block.hr.test(e))
                    break;
                c = t[0], e = e.substring(c.length);
                let k = me(t[2].split(`
`, 1)[0], t[1].length), h = e.split(`
`, 1)[0], R = !k.trim(), f = 0;
                if (this.options.pedantic ? (f = 2, p = k.trimStart()) : R ? f = t[1].length + 1 : (f = k.search(this.rules.other.nonSpaceChar), f = f > 4 ? 1 : f, p = k.slice(f), f += t[1].length), R && this.rules.other.blankLine.test(h) && (c += h + `
`, e = e.substring(h.length + 1), a = true), !a) {
                    let S = this.rules.other.nextBulletRegex(f), te = this.rules.other.hrRegex(f), ne = this.rules.other.fencesBeginRegex(f), re = this.rules.other.headingBeginRegex(f), be = this.rules.other.htmlBeginRegex(f), Re = this.rules.other.blockquoteBeginRegex(f);
                    for (; e;) {
                        let G = e.split(`
`, 1)[0], C;
                        if (h = G, this.options.pedantic ? (h = h.replace(this.rules.other.listReplaceNesting, "  "), C = h) : C = h.replace(this.rules.other.tabCharGlobal, "    "), ne.test(h) || re.test(h) || be.test(h) || Re.test(h) || S.test(h) || te.test(h))
                            break;
                        if (C.search(this.rules.other.nonSpaceChar) >= f || !h.trim())
                            p += `
` + C.slice(f);
                        else {
                            if (R || k.replace(this.rules.other.tabCharGlobal, "    ").search(this.rules.other.nonSpaceChar) >= 4 || ne.test(k) || re.test(k) || te.test(k))
                                break;
                            p += `
` + h;
                        }
                        R = !h.trim(), c += G + `
`, e = e.substring(G.length + 1), k = C.slice(f);
                    }
                }
                r.loose || (o ? r.loose = true : this.rules.other.doubleBlankLine.test(c) && (o = true)), r.items.push({ type: "list_item", raw: c, task: !!this.options.gfm && this.rules.other.listIsTask.test(p), loose: false, text: p, tokens: [] }), r.raw += c;
            }
            let u = r.items.at(-1);
            if (u)
                u.raw = u.raw.trimEnd(), u.text = u.text.trimEnd();
            else
                return;
            r.raw = r.raw.trimEnd();
            for (let a of r.items) {
                this.lexer.state.top = false, a.tokens = this.lexer.blockTokens(a.text, []);
                let c = a.tokens[0];
                if (a.task && (c?.type === "text" || c?.type === "paragraph")) {
                    a.text = a.text.replace(this.rules.other.listReplaceTask, ""), c.raw = c.raw.replace(this.rules.other.listReplaceTask, ""), c.text = c.text.replace(this.rules.other.listReplaceTask, "");
                    for (let k = this.lexer.inlineQueue.length - 1; k >= 0; k--)
                        if (this.rules.other.listIsTask.test(this.lexer.inlineQueue[k].src)) {
                            this.lexer.inlineQueue[k].src = this.lexer.inlineQueue[k].src.replace(this.rules.other.listReplaceTask, "");
                            break;
                        }
                    let p = this.rules.other.listTaskCheckbox.exec(a.raw);
                    if (p) {
                        let k = { type: "checkbox", raw: p[0] + " ", checked: p[0] !== "[ ]" };
                        a.checked = k.checked, r.loose ? a.tokens[0] && ["paragraph", "text"].includes(a.tokens[0].type) && "tokens" in a.tokens[0] && a.tokens[0].tokens ? (a.tokens[0].raw = k.raw + a.tokens[0].raw, a.tokens[0].text = k.raw + a.tokens[0].text, a.tokens[0].tokens.unshift(k)) : a.tokens.unshift({ type: "paragraph", raw: k.raw, text: k.raw, tokens: [k] }) : a.tokens.unshift(k);
                    }
                }
                else
                    a.task && (a.task = false);
                if (!r.loose) {
                    let p = a.tokens.filter(h => h.type === "space"), k = p.length > 0 && p.some(h => this.rules.other.anyLine.test(h.raw));
                    r.loose = k;
                }
            }
            if (r.loose)
                for (let a of r.items) {
                    a.loose = true;
                    for (let c of a.tokens)
                        c.type === "text" && (c.type = "paragraph");
                }
            return r;
        }
    }
    html(e) { let t = this.rules.block.html.exec(e); if (t) {
        let n = ee(t[0]);
        return { type: "html", block: true, raw: n, pre: t[1] === "pre" || t[1] === "script" || t[1] === "style", text: n };
    } }
    def(e) {
        let t = this.rules.block.def.exec(e);
        if (t) {
            let n = t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal, " "), s = t[2] ? t[2].replace(this.rules.other.hrefBrackets, "$1").replace(this.rules.inline.anyPunctuation, "$1") : "", r = t[3] ? t[3].substring(1, t[3].length - 1).replace(this.rules.inline.anyPunctuation, "$1") : t[3];
            return { type: "def", tag: n, raw: $(t[0], `
`), href: s, title: r };
        }
    }
    table(e) {
        let t = this.rules.block.table.exec(e);
        if (!t || !this.rules.other.tableDelimiter.test(t[2]))
            return;
        let n = Y(t[1]), s = t[2].replace(this.rules.other.tableAlignChars, "").split("|"), r = t[3]?.trim() ? t[3].replace(this.rules.other.tableRowBlankLine, "").split(`
`) : [], i = { type: "table", raw: $(t[0], `
`), header: [], align: [], rows: [] };
        if (n.length === s.length) {
            for (let o of s)
                this.rules.other.tableAlignRight.test(o) ? i.align.push("right") : this.rules.other.tableAlignCenter.test(o) ? i.align.push("center") : this.rules.other.tableAlignLeft.test(o) ? i.align.push("left") : i.align.push(null);
            for (let o = 0; o < n.length; o++)
                i.header.push({ text: n[o], tokens: this.lexer.inline(n[o]), header: true, align: i.align[o] });
            for (let o of r)
                i.rows.push(Y(o, i.header.length).map((u, a) => ({ text: u, tokens: this.lexer.inline(u), header: false, align: i.align[a] })));
            return i;
        }
    }
    lheading(e) {
        let t = this.rules.block.lheading.exec(e);
        if (t) {
            let n = t[1].trim();
            return { type: "heading", raw: $(t[0], `
`), depth: t[2].charAt(0) === "=" ? 1 : 2, text: n, tokens: this.lexer.inline(n) };
        }
    }
    paragraph(e) {
        let t = this.rules.block.paragraph.exec(e);
        if (t) {
            let n = t[1].charAt(t[1].length - 1) === `
` ? t[1].slice(0, -1) : t[1];
            return { type: "paragraph", raw: t[0], text: n, tokens: this.lexer.inline(n) };
        }
    }
    text(e) { let t = this.rules.block.text.exec(e); if (t)
        return { type: "text", raw: t[0], text: t[0], tokens: this.lexer.inline(t[0]) }; }
    escape(e) { let t = this.rules.inline.escape.exec(e); if (t)
        return { type: "escape", raw: t[0], text: t[1] }; }
    tag(e) { let t = this.rules.inline.tag.exec(e); if (t)
        return !this.lexer.state.inLink && this.rules.other.startATag.test(t[0]) ? this.lexer.state.inLink = true : this.lexer.state.inLink && this.rules.other.endATag.test(t[0]) && (this.lexer.state.inLink = false), !this.lexer.state.inRawBlock && this.rules.other.startPreScriptTag.test(t[0]) ? this.lexer.state.inRawBlock = true : this.lexer.state.inRawBlock && this.rules.other.endPreScriptTag.test(t[0]) && (this.lexer.state.inRawBlock = false), { type: "html", raw: t[0], inLink: this.lexer.state.inLink, inRawBlock: this.lexer.state.inRawBlock, block: false, text: t[0] }; }
    link(e) { let t = this.rules.inline.link.exec(e); if (t) {
        let n = t[2].trim();
        if (!this.options.pedantic && this.rules.other.startAngleBracket.test(n)) {
            if (!this.rules.other.endAngleBracket.test(n))
                return;
            let i = $(n.slice(0, -1), "\\");
            if ((n.length - i.length) % 2 === 0)
                return;
        }
        else {
            let i = fe(t[2], "()");
            if (i === -2)
                return;
            if (i > -1) {
                let u = (t[0].indexOf("!") === 0 ? 5 : 4) + t[1].length + i;
                t[2] = t[2].substring(0, i), t[0] = t[0].substring(0, u).trim(), t[3] = "";
            }
        }
        let s = t[2], r = "";
        if (this.options.pedantic) {
            let i = this.rules.other.pedanticHrefTitle.exec(s);
            i && (s = i[1], r = i[3]);
        }
        else
            r = t[3] ? t[3].slice(1, -1) : "";
        return s = s.trim(), this.rules.other.startAngleBracket.test(s) && (this.options.pedantic && !this.rules.other.endAngleBracket.test(n) ? s = s.slice(1) : s = s.slice(1, -1)), xe(t, { href: s && s.replace(this.rules.inline.anyPunctuation, "$1"), title: r && r.replace(this.rules.inline.anyPunctuation, "$1") }, t[0], this.lexer, this.rules);
    } }
    reflink(e, t) { let n; if ((n = this.rules.inline.reflink.exec(e)) || (n = this.rules.inline.nolink.exec(e))) {
        let s = (n[2] || n[1]).replace(this.rules.other.multipleSpaceGlobal, " "), r = t[s.toLowerCase()];
        if (!r) {
            let i = n[0].charAt(0);
            return { type: "text", raw: i, text: i };
        }
        return xe(n, r, n[0], this.lexer, this.rules);
    } }
    emStrong(e, t, n = "") { let s = this.rules.inline.emStrongLDelim.exec(e); if (!s || !s[1] && !s[2] && !s[3] && !s[4] || s[4] && n.match(this.rules.other.unicodeAlphaNumeric))
        return; if (!(s[1] || s[3] || "") || !n || this.rules.inline.punctuation.exec(n)) {
        let i = [...s[0]].length - 1, o, u, a = i, c = 0, p = s[0][0] === "*" ? this.rules.inline.emStrongRDelimAst : this.rules.inline.emStrongRDelimUnd;
        for (p.lastIndex = 0, t = t.slice(-1 * e.length + i); (s = p.exec(t)) !== null;) {
            if (o = s[1] || s[2] || s[3] || s[4] || s[5] || s[6], !o)
                continue;
            if (u = [...o].length, s[3] || s[4]) {
                a += u;
                continue;
            }
            else if ((s[5] || s[6]) && i % 3 && !((i + u) % 3)) {
                c += u;
                continue;
            }
            if (a -= u, a > 0)
                continue;
            u = Math.min(u, u + a + c);
            let k = [...s[0]][0].length, h = e.slice(0, i + s.index + k + u);
            if (Math.min(i, u) % 2) {
                let f = h.slice(1, -1);
                return { type: "em", raw: h, text: f, tokens: this.lexer.inlineTokens(f) };
            }
            let R = h.slice(2, -2);
            return { type: "strong", raw: h, text: R, tokens: this.lexer.inlineTokens(R) };
        }
    } }
    codespan(e) { let t = this.rules.inline.code.exec(e); if (t) {
        let n = t[2].replace(this.rules.other.newLineCharGlobal, " "), s = this.rules.other.nonSpaceChar.test(n), r = this.rules.other.startingSpaceChar.test(n) && this.rules.other.endingSpaceChar.test(n);
        return s && r && (n = n.substring(1, n.length - 1)), { type: "codespan", raw: t[0], text: n };
    } }
    br(e) { let t = this.rules.inline.br.exec(e); if (t)
        return { type: "br", raw: t[0] }; }
    del(e, t, n = "") { let s = this.rules.inline.delLDelim.exec(e); if (!s)
        return; if (!(s[1] || "") || !n || this.rules.inline.punctuation.exec(n)) {
        let i = [...s[0]].length - 1, o, u, a = i, c = this.rules.inline.delRDelim;
        for (c.lastIndex = 0, t = t.slice(-1 * e.length + i); (s = c.exec(t)) !== null;) {
            if (o = s[1] || s[2] || s[3] || s[4] || s[5] || s[6], !o || (u = [...o].length, u !== i))
                continue;
            if (s[3] || s[4]) {
                a += u;
                continue;
            }
            if (a -= u, a > 0)
                continue;
            u = Math.min(u, u + a);
            let p = [...s[0]][0].length, k = e.slice(0, i + s.index + p + u), h = k.slice(i, -i);
            return { type: "del", raw: k, text: h, tokens: this.lexer.inlineTokens(h) };
        }
    } }
    autolink(e) { let t = this.rules.inline.autolink.exec(e); if (t) {
        let n, s;
        return t[2] === "@" ? (n = t[1], s = "mailto:" + n) : (n = t[1], s = n), { type: "link", raw: t[0], text: n, href: s, tokens: [{ type: "text", raw: n, text: n }] };
    } }
    url(e) { let t; if (t = this.rules.inline.url.exec(e)) {
        let n, s;
        if (t[2] === "@")
            n = t[0], s = "mailto:" + n;
        else {
            let r;
            do
                r = t[0], t[0] = this.rules.inline._backpedal.exec(t[0])?.[0] ?? "";
            while (r !== t[0]);
            n = t[0], t[1] === "www." ? s = "http://" + t[0] : s = t[0];
        }
        return { type: "link", raw: t[0], text: n, href: s, tokens: [{ type: "text", raw: n, text: n }] };
    } }
    inlineText(e) { let t = this.rules.inline.text.exec(e); if (t) {
        let n = this.lexer.state.inRawBlock;
        return { type: "text", raw: t[0], text: t[0], escaped: n };
    } }
};
var x = class l {
    tokens;
    options;
    state;
    inlineQueue;
    tokenizer;
    constructor(e) { this.tokens = [], this.tokens.links = Object.create(null), this.options = e || T, this.options.tokenizer = this.options.tokenizer || new w, this.tokenizer = this.options.tokenizer, this.tokenizer.options = this.options, this.tokenizer.lexer = this, this.inlineQueue = [], this.state = { inLink: false, inRawBlock: false, top: true }; let t = { other: m, block: D.normal, inline: A.normal }; this.options.pedantic ? (t.block = D.pedantic, t.inline = A.pedantic) : this.options.gfm && (t.block = D.gfm, this.options.breaks ? t.inline = A.breaks : t.inline = A.gfm), this.tokenizer.rules = t; }
    static get rules() { return { block: D, inline: A }; }
    static lex(e, t) { return new l(t).lex(e); }
    static lexInline(e, t) { return new l(t).inlineTokens(e); }
    lex(e) {
        e = e.replace(m.carriageReturn, `
`), this.blockTokens(e, this.tokens);
        for (let t = 0; t < this.inlineQueue.length; t++) {
            let n = this.inlineQueue[t];
            this.inlineTokens(n.src, n.tokens);
        }
        return this.inlineQueue = [], this.tokens;
    }
    blockTokens(e, t = [], n = false) {
        this.tokenizer.lexer = this, this.options.pedantic && (e = e.replace(m.tabCharGlobal, "    ").replace(m.spaceLine, ""));
        let s = 1 / 0;
        for (; e;) {
            if (e.length < s)
                s = e.length;
            else {
                this.infiniteLoopError(e.charCodeAt(0));
                break;
            }
            let r;
            if (this.options.extensions?.block?.some(o => (r = o.call({ lexer: this }, e, t)) ? (e = e.substring(r.raw.length), t.push(r), true) : false))
                continue;
            if (r = this.tokenizer.space(e)) {
                e = e.substring(r.raw.length);
                let o = t.at(-1);
                r.raw.length === 1 && o !== void 0 ? o.raw += `
` : t.push(r);
                continue;
            }
            if (r = this.tokenizer.code(e)) {
                e = e.substring(r.raw.length);
                let o = t.at(-1);
                o?.type === "paragraph" || o?.type === "text" ? (o.raw += (o.raw.endsWith(`
`) ? "" : `
`) + r.raw, o.text += `
` + r.text, this.inlineQueue.at(-1).src = o.text) : t.push(r);
                continue;
            }
            if (r = this.tokenizer.fences(e)) {
                e = e.substring(r.raw.length), t.push(r);
                continue;
            }
            if (r = this.tokenizer.heading(e)) {
                e = e.substring(r.raw.length), t.push(r);
                continue;
            }
            if (r = this.tokenizer.hr(e)) {
                e = e.substring(r.raw.length), t.push(r);
                continue;
            }
            if (r = this.tokenizer.blockquote(e)) {
                e = e.substring(r.raw.length), t.push(r);
                continue;
            }
            if (r = this.tokenizer.list(e)) {
                e = e.substring(r.raw.length), t.push(r);
                continue;
            }
            if (r = this.tokenizer.html(e)) {
                e = e.substring(r.raw.length), t.push(r);
                continue;
            }
            if (r = this.tokenizer.def(e)) {
                e = e.substring(r.raw.length);
                let o = t.at(-1);
                o?.type === "paragraph" || o?.type === "text" ? (o.raw += (o.raw.endsWith(`
`) ? "" : `
`) + r.raw, o.text += `
` + r.raw, this.inlineQueue.at(-1).src = o.text) : this.tokens.links[r.tag] || (this.tokens.links[r.tag] = { href: r.href, title: r.title }, t.push(r));
                continue;
            }
            if (r = this.tokenizer.table(e)) {
                e = e.substring(r.raw.length), t.push(r);
                continue;
            }
            if (r = this.tokenizer.lheading(e)) {
                e = e.substring(r.raw.length), t.push(r);
                continue;
            }
            let i = e;
            if (this.options.extensions?.startBlock) {
                let o = 1 / 0, u = e.slice(1), a;
                this.options.extensions.startBlock.forEach(c => { a = c.call({ lexer: this }, u), typeof a == "number" && a >= 0 && (o = Math.min(o, a)); }), o < 1 / 0 && o >= 0 && (i = e.substring(0, o + 1));
            }
            if (this.state.top && (r = this.tokenizer.paragraph(i))) {
                let o = t.at(-1);
                n && o?.type === "paragraph" ? (o.raw += (o.raw.endsWith(`
`) ? "" : `
`) + r.raw, o.text += `
` + r.text, this.inlineQueue.pop(), this.inlineQueue.at(-1).src = o.text) : t.push(r), n = i.length !== e.length, e = e.substring(r.raw.length);
                continue;
            }
            if (r = this.tokenizer.text(e)) {
                e = e.substring(r.raw.length);
                let o = t.at(-1);
                o?.type === "text" ? (o.raw += (o.raw.endsWith(`
`) ? "" : `
`) + r.raw, o.text += `
` + r.text, this.inlineQueue.pop(), this.inlineQueue.at(-1).src = o.text) : t.push(r);
                continue;
            }
            if (e) {
                this.infiniteLoopError(e.charCodeAt(0));
                break;
            }
        }
        return this.state.top = true, t;
    }
    inline(e, t = []) { return this.inlineQueue.push({ src: e, tokens: t }), t; }
    inlineTokens(e, t = []) { this.tokenizer.lexer = this; let n = e, s = null; if (this.tokens.links) {
        let a = Object.keys(this.tokens.links);
        if (a.length > 0)
            for (; (s = this.tokenizer.rules.inline.reflinkSearch.exec(n)) !== null;)
                a.includes(s[0].slice(s[0].lastIndexOf("[") + 1, -1)) && (n = n.slice(0, s.index) + "[" + "a".repeat(s[0].length - 2) + "]" + n.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex));
    } for (; (s = this.tokenizer.rules.inline.anyPunctuation.exec(n)) !== null;)
        n = n.slice(0, s.index) + "++" + n.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex); let r; for (; (s = this.tokenizer.rules.inline.blockSkip.exec(n)) !== null;)
        r = s[2] ? s[2].length : 0, n = n.slice(0, s.index + r) + "[" + "a".repeat(s[0].length - r - 2) + "]" + n.slice(this.tokenizer.rules.inline.blockSkip.lastIndex); n = this.options.hooks?.emStrongMask?.call({ lexer: this }, n) ?? n; let i = false, o = "", u = 1 / 0; for (; e;) {
        if (e.length < u)
            u = e.length;
        else {
            this.infiniteLoopError(e.charCodeAt(0));
            break;
        }
        i || (o = ""), i = false;
        let a;
        if (this.options.extensions?.inline?.some(p => (a = p.call({ lexer: this }, e, t)) ? (e = e.substring(a.raw.length), t.push(a), true) : false))
            continue;
        if (a = this.tokenizer.escape(e)) {
            e = e.substring(a.raw.length), t.push(a);
            continue;
        }
        if (a = this.tokenizer.tag(e)) {
            e = e.substring(a.raw.length), t.push(a);
            continue;
        }
        if (a = this.tokenizer.link(e)) {
            e = e.substring(a.raw.length), t.push(a);
            continue;
        }
        if (a = this.tokenizer.reflink(e, this.tokens.links)) {
            e = e.substring(a.raw.length);
            let p = t.at(-1);
            a.type === "text" && p?.type === "text" ? (p.raw += a.raw, p.text += a.text) : t.push(a);
            continue;
        }
        if (a = this.tokenizer.emStrong(e, n, o)) {
            e = e.substring(a.raw.length), t.push(a);
            continue;
        }
        if (a = this.tokenizer.codespan(e)) {
            e = e.substring(a.raw.length), t.push(a);
            continue;
        }
        if (a = this.tokenizer.br(e)) {
            e = e.substring(a.raw.length), t.push(a);
            continue;
        }
        if (a = this.tokenizer.del(e, n, o)) {
            e = e.substring(a.raw.length), t.push(a);
            continue;
        }
        if (a = this.tokenizer.autolink(e)) {
            e = e.substring(a.raw.length), t.push(a);
            continue;
        }
        if (!this.state.inLink && (a = this.tokenizer.url(e))) {
            e = e.substring(a.raw.length), t.push(a);
            continue;
        }
        let c = e;
        if (this.options.extensions?.startInline) {
            let p = 1 / 0, k = e.slice(1), h;
            this.options.extensions.startInline.forEach(R => { h = R.call({ lexer: this }, k), typeof h == "number" && h >= 0 && (p = Math.min(p, h)); }), p < 1 / 0 && p >= 0 && (c = e.substring(0, p + 1));
        }
        if (a = this.tokenizer.inlineText(c)) {
            e = e.substring(a.raw.length), a.raw.slice(-1) !== "_" && (o = a.raw.slice(-1)), i = true;
            let p = t.at(-1);
            p?.type === "text" ? (p.raw += a.raw, p.text += a.text) : t.push(a);
            continue;
        }
        if (e) {
            this.infiniteLoopError(e.charCodeAt(0));
            break;
        }
    } return t; }
    infiniteLoopError(e) { let t = "Infinite loop on byte: " + e; if (this.options.silent)
        console.error(t);
    else
        throw new Error(t); }
};
var y = class {
    options;
    parser;
    constructor(e) { this.options = e || T; }
    space(e) { return ""; }
    code({ text: e, lang: t, escaped: n }) {
        let s = (t || "").match(m.notSpaceStart)?.[0], r = e.replace(m.endingNewline, "") + `
`;
        return s ? '<pre><code class="language-' + O(s) + '">' + (n ? r : O(r, true)) + `</code></pre>
` : "<pre><code>" + (n ? r : O(r, true)) + `</code></pre>
`;
    }
    blockquote({ tokens: e }) {
        return `<blockquote>
${this.parser.parse(e)}</blockquote>
`;
    }
    html({ text: e }) { return e; }
    def(e) { return ""; }
    heading({ tokens: e, depth: t }) {
        return `<h${t}>${this.parser.parseInline(e)}</h${t}>
`;
    }
    hr(e) {
        return `<hr>
`;
    }
    list(e) {
        let t = e.ordered, n = e.start, s = "";
        for (let o = 0; o < e.items.length; o++) {
            let u = e.items[o];
            s += this.listitem(u);
        }
        let r = t ? "ol" : "ul", i = t && n !== 1 ? ' start="' + n + '"' : "";
        return "<" + r + i + `>
` + s + "</" + r + `>
`;
    }
    listitem(e) {
        return `<li>${this.parser.parse(e.tokens)}</li>
`;
    }
    checkbox({ checked: e }) { return "<input " + (e ? 'checked="" ' : "") + 'disabled="" type="checkbox"> '; }
    paragraph({ tokens: e }) {
        return `<p>${this.parser.parseInline(e)}</p>
`;
    }
    table(e) {
        let t = "", n = "";
        for (let r = 0; r < e.header.length; r++)
            n += this.tablecell(e.header[r]);
        t += this.tablerow({ text: n });
        let s = "";
        for (let r = 0; r < e.rows.length; r++) {
            let i = e.rows[r];
            n = "";
            for (let o = 0; o < i.length; o++)
                n += this.tablecell(i[o]);
            s += this.tablerow({ text: n });
        }
        return s && (s = `<tbody>${s}</tbody>`), `<table>
<thead>
` + t + `</thead>
` + s + `</table>
`;
    }
    tablerow({ text: e }) {
        return `<tr>
${e}</tr>
`;
    }
    tablecell(e) {
        let t = this.parser.parseInline(e.tokens), n = e.header ? "th" : "td";
        return (e.align ? `<${n} align="${e.align}">` : `<${n}>`) + t + `</${n}>
`;
    }
    strong({ tokens: e }) { return `<strong>${this.parser.parseInline(e)}</strong>`; }
    em({ tokens: e }) { return `<em>${this.parser.parseInline(e)}</em>`; }
    codespan({ text: e }) { return `<code>${O(e, true)}</code>`; }
    br(e) { return "<br>"; }
    del({ tokens: e }) { return `<del>${this.parser.parseInline(e)}</del>`; }
    link({ href: e, title: t, tokens: n }) { let s = this.parser.parseInline(n), r = V(e); if (r === null)
        return s; e = r; let i = '<a href="' + e + '"'; return t && (i += ' title="' + O(t) + '"'), i += ">" + s + "</a>", i; }
    image({ href: e, title: t, text: n, tokens: s }) { s && (n = this.parser.parseInline(s, this.parser.textRenderer)); let r = V(e); if (r === null)
        return O(n); e = r; let i = `<img src="${e}" alt="${O(n)}"`; return t && (i += ` title="${O(t)}"`), i += ">", i; }
    text(e) { return "tokens" in e && e.tokens ? this.parser.parseInline(e.tokens) : "escaped" in e && e.escaped ? e.text : O(e.text); }
};
var L = class {
    strong({ text: e }) { return e; }
    em({ text: e }) { return e; }
    codespan({ text: e }) { return e; }
    del({ text: e }) { return e; }
    html({ text: e }) { return e; }
    text({ text: e }) { return e; }
    link({ text: e }) { return "" + e; }
    image({ text: e }) { return "" + e; }
    br() { return ""; }
    checkbox({ raw: e }) { return e; }
};
var b = class l {
    options;
    renderer;
    textRenderer;
    constructor(e) { this.options = e || T, this.options.renderer = this.options.renderer || new y, this.renderer = this.options.renderer, this.renderer.options = this.options, this.renderer.parser = this, this.textRenderer = new L; }
    static parse(e, t) { return new l(t).parse(e); }
    static parseInline(e, t) { return new l(t).parseInline(e); }
    parse(e) { this.renderer.parser = this; let t = ""; for (let n = 0; n < e.length; n++) {
        let s = e[n];
        if (this.options.extensions?.renderers?.[s.type]) {
            let i = s, o = this.options.extensions.renderers[i.type].call({ parser: this }, i);
            if (o !== false || !["space", "hr", "heading", "code", "table", "blockquote", "list", "html", "def", "paragraph", "text"].includes(i.type)) {
                t += o || "";
                continue;
            }
        }
        let r = s;
        switch (r.type) {
            case "space": {
                t += this.renderer.space(r);
                break;
            }
            case "hr": {
                t += this.renderer.hr(r);
                break;
            }
            case "heading": {
                t += this.renderer.heading(r);
                break;
            }
            case "code": {
                t += this.renderer.code(r);
                break;
            }
            case "table": {
                t += this.renderer.table(r);
                break;
            }
            case "blockquote": {
                t += this.renderer.blockquote(r);
                break;
            }
            case "list": {
                t += this.renderer.list(r);
                break;
            }
            case "checkbox": {
                t += this.renderer.checkbox(r);
                break;
            }
            case "html": {
                t += this.renderer.html(r);
                break;
            }
            case "def": {
                t += this.renderer.def(r);
                break;
            }
            case "paragraph": {
                t += this.renderer.paragraph(r);
                break;
            }
            case "text": {
                t += this.renderer.text(r);
                break;
            }
            default: {
                let i = 'Token with "' + r.type + '" type was not found.';
                if (this.options.silent)
                    return console.error(i), "";
                throw new Error(i);
            }
        }
    } return t; }
    parseInline(e, t = this.renderer) { this.renderer.parser = this; let n = ""; for (let s = 0; s < e.length; s++) {
        let r = e[s];
        if (this.options.extensions?.renderers?.[r.type]) {
            let o = this.options.extensions.renderers[r.type].call({ parser: this }, r);
            if (o !== false || !["escape", "html", "link", "image", "strong", "em", "codespan", "br", "del", "text"].includes(r.type)) {
                n += o || "";
                continue;
            }
        }
        let i = r;
        switch (i.type) {
            case "escape": {
                n += t.text(i);
                break;
            }
            case "html": {
                n += t.html(i);
                break;
            }
            case "link": {
                n += t.link(i);
                break;
            }
            case "image": {
                n += t.image(i);
                break;
            }
            case "checkbox": {
                n += t.checkbox(i);
                break;
            }
            case "strong": {
                n += t.strong(i);
                break;
            }
            case "em": {
                n += t.em(i);
                break;
            }
            case "codespan": {
                n += t.codespan(i);
                break;
            }
            case "br": {
                n += t.br(i);
                break;
            }
            case "del": {
                n += t.del(i);
                break;
            }
            case "text": {
                n += t.text(i);
                break;
            }
            default: {
                let o = 'Token with "' + i.type + '" type was not found.';
                if (this.options.silent)
                    return console.error(o), "";
                throw new Error(o);
            }
        }
    } return n; }
};
var P = class {
    options;
    block;
    constructor(e) { this.options = e || T; }
    static passThroughHooks = new Set(["preprocess", "postprocess", "processAllTokens", "emStrongMask"]);
    static passThroughHooksRespectAsync = new Set(["preprocess", "postprocess", "processAllTokens"]);
    preprocess(e) { return e; }
    postprocess(e) { return e; }
    processAllTokens(e) { return e; }
    emStrongMask(e) { return e; }
    provideLexer(e = this.block) { return e ? x.lex : x.lexInline; }
    provideParser(e = this.block) { return e ? b.parse : b.parseInline; }
};
var q = class {
    defaults = M();
    options = this.setOptions;
    parse = this.parseMarkdown(true);
    parseInline = this.parseMarkdown(false);
    Parser = b;
    Renderer = y;
    TextRenderer = L;
    Lexer = x;
    Tokenizer = w;
    Hooks = P;
    constructor(...e) { this.use(...e); }
    walkTokens(e, t) { let n = []; for (let s of e)
        switch (n = n.concat(t.call(this, s)), s.type) {
            case "table": {
                let r = s;
                for (let i of r.header)
                    n = n.concat(this.walkTokens(i.tokens, t));
                for (let i of r.rows)
                    for (let o of i)
                        n = n.concat(this.walkTokens(o.tokens, t));
                break;
            }
            case "list": {
                let r = s;
                n = n.concat(this.walkTokens(r.items, t));
                break;
            }
            default: {
                let r = s;
                this.defaults.extensions?.childTokens?.[r.type] ? this.defaults.extensions.childTokens[r.type].forEach(i => { let o = r[i].flat(1 / 0); n = n.concat(this.walkTokens(o, t)); }) : r.tokens && (n = n.concat(this.walkTokens(r.tokens, t)));
            }
        } return n; }
    use(...e) { let t = this.defaults.extensions || { renderers: {}, childTokens: {} }; return e.forEach(n => { let s = { ...n }; if (s.async = this.defaults.async || s.async || false, n.extensions && (n.extensions.forEach(r => { if (!r.name)
        throw new Error("extension name required"); if ("renderer" in r) {
        let i = t.renderers[r.name];
        i ? t.renderers[r.name] = function (...o) { let u = r.renderer.apply(this, o); return u === false && (u = i.apply(this, o)), u; } : t.renderers[r.name] = r.renderer;
    } if ("tokenizer" in r) {
        if (!r.level || r.level !== "block" && r.level !== "inline")
            throw new Error("extension level must be 'block' or 'inline'");
        let i = t[r.level];
        i ? i.unshift(r.tokenizer) : t[r.level] = [r.tokenizer], r.start && (r.level === "block" ? t.startBlock ? t.startBlock.push(r.start) : t.startBlock = [r.start] : r.level === "inline" && (t.startInline ? t.startInline.push(r.start) : t.startInline = [r.start]));
    } "childTokens" in r && r.childTokens && (t.childTokens[r.name] = r.childTokens); }), s.extensions = t), n.renderer) {
        let r = this.defaults.renderer || new y(this.defaults);
        for (let i in n.renderer) {
            if (!(i in r))
                throw new Error(`renderer '${i}' does not exist`);
            if (["options", "parser"].includes(i))
                continue;
            let o = i, u = n.renderer[o], a = r[o];
            r[o] = (...c) => { let p = u.apply(r, c); return p === false && (p = a.apply(r, c)), p || ""; };
        }
        s.renderer = r;
    } if (n.tokenizer) {
        let r = this.defaults.tokenizer || new w(this.defaults);
        for (let i in n.tokenizer) {
            if (!(i in r))
                throw new Error(`tokenizer '${i}' does not exist`);
            if (["options", "rules", "lexer"].includes(i))
                continue;
            let o = i, u = n.tokenizer[o], a = r[o];
            r[o] = (...c) => { let p = u.apply(r, c); return p === false && (p = a.apply(r, c)), p; };
        }
        s.tokenizer = r;
    } if (n.hooks) {
        let r = this.defaults.hooks || new P;
        for (let i in n.hooks) {
            if (!(i in r))
                throw new Error(`hook '${i}' does not exist`);
            if (["options", "block"].includes(i))
                continue;
            let o = i, u = n.hooks[o], a = r[o];
            P.passThroughHooks.has(i) ? r[o] = c => { if (this.defaults.async && P.passThroughHooksRespectAsync.has(i))
                return (async () => { let k = await u.call(r, c); return a.call(r, k); })(); let p = u.call(r, c); return a.call(r, p); } : r[o] = (...c) => { if (this.defaults.async)
                return (async () => { let k = await u.apply(r, c); return k === false && (k = await a.apply(r, c)), k; })(); let p = u.apply(r, c); return p === false && (p = a.apply(r, c)), p; };
        }
        s.hooks = r;
    } if (n.walkTokens) {
        let r = this.defaults.walkTokens, i = n.walkTokens;
        s.walkTokens = function (o) { let u = []; return u.push(i.call(this, o)), r && (u = u.concat(r.call(this, o))), u; };
    } this.defaults = { ...this.defaults, ...s }; }), this; }
    setOptions(e) { return this.defaults = { ...this.defaults, ...e }, this; }
    lexer(e, t) { return x.lex(e, t ?? this.defaults); }
    parser(e, t) { return b.parse(e, t ?? this.defaults); }
    parseMarkdown(e) { return (n, s) => { let r = { ...s }, i = { ...this.defaults, ...r }, o = this.onError(!!i.silent, !!i.async); if (this.defaults.async === true && r.async === false)
        return o(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise.")); if (typeof n > "u" || n === null)
        return o(new Error("marked(): input parameter is undefined or null")); if (typeof n != "string")
        return o(new Error("marked(): input parameter is of type " + Object.prototype.toString.call(n) + ", string expected")); if (i.hooks && (i.hooks.options = i, i.hooks.block = e), i.async)
        return (async () => { let u = i.hooks ? await i.hooks.preprocess(n) : n, c = await (i.hooks ? await i.hooks.provideLexer(e) : e ? x.lex : x.lexInline)(u, i), p = i.hooks ? await i.hooks.processAllTokens(c) : c; i.walkTokens && await Promise.all(this.walkTokens(p, i.walkTokens)); let h = await (i.hooks ? await i.hooks.provideParser(e) : e ? b.parse : b.parseInline)(p, i); return i.hooks ? await i.hooks.postprocess(h) : h; })().catch(o); try {
        i.hooks && (n = i.hooks.preprocess(n));
        let a = (i.hooks ? i.hooks.provideLexer(e) : e ? x.lex : x.lexInline)(n, i);
        i.hooks && (a = i.hooks.processAllTokens(a)), i.walkTokens && this.walkTokens(a, i.walkTokens);
        let p = (i.hooks ? i.hooks.provideParser(e) : e ? b.parse : b.parseInline)(a, i);
        return i.hooks && (p = i.hooks.postprocess(p)), p;
    }
    catch (u) {
        return o(u);
    } }; }
    onError(e, t) {
        return n => {
            if (n.message += `
Please report this to https://github.com/markedjs/marked.`, e) {
                let s = "<p>An error occurred:</p><pre>" + O(n.message + "", true) + "</pre>";
                return t ? Promise.resolve(s) : s;
            }
            if (t)
                return Promise.reject(n);
            throw n;
        };
    }
};
var z = new q;
function g(l, e) { return z.parse(l, e); }
g.options = g.setOptions = function (l) { return z.setOptions(l), g.defaults = z.defaults, N(g.defaults), g; };
g.getDefaults = M;
g.defaults = T;
g.use = function (...l) { return z.use(...l), g.defaults = z.defaults, N(g.defaults), g; };
g.walkTokens = function (l, e) { return z.walkTokens(l, e); };
g.parseInline = z.parseInline;
g.Parser = b;
g.parser = b.parse;
g.Renderer = y;
g.TextRenderer = L;
g.Lexer = x;
g.lexer = x.lex;
g.Tokenizer = w;
g.Hooks = P;
g.parse = g;
g.options; g.setOptions; g.use; g.walkTokens; g.parseInline; b.parse; x.lex;

// Copyright 2013 The Chromium Authors
class BalancedJSONTokenizer {
    callback;
    index;
    balance;
    buffer;
    findMultiple;
    closingDoubleQuoteRegex;
    lastBalancedIndex;
    constructor(callback, findMultiple) {
        this.callback = callback;
        this.index = 0;
        this.balance = 0;
        this.buffer = '';
        this.findMultiple = findMultiple || false;
        this.closingDoubleQuoteRegex = /[^\\](?:\\\\)*"/g;
    }
    write(chunk) {
        this.buffer += chunk;
        const lastIndex = this.buffer.length;
        const buffer = this.buffer;
        let index;
        for (index = this.index; index < lastIndex; ++index) {
            const character = buffer[index];
            if (character === '"') {
                this.closingDoubleQuoteRegex.lastIndex = index;
                if (!this.closingDoubleQuoteRegex.test(buffer)) {
                    break;
                }
                index = this.closingDoubleQuoteRegex.lastIndex - 1;
            }
            else if (character === '{') {
                ++this.balance;
            }
            else if (character === '}') {
                --this.balance;
                if (this.balance < 0) {
                    this.reportBalanced();
                    return false;
                }
                if (!this.balance) {
                    this.lastBalancedIndex = index + 1;
                    if (!this.findMultiple) {
                        break;
                    }
                }
            }
            else if (character === ']' && !this.balance) {
                this.reportBalanced();
                return false;
            }
        }
        this.index = index;
        this.reportBalanced();
        return true;
    }
    reportBalanced() {
        if (!this.lastBalancedIndex) {
            return;
        }
        this.callback(this.buffer.slice(0, this.lastBalancedIndex));
        this.buffer = this.buffer.slice(this.lastBalancedIndex);
        this.index -= this.lastBalancedIndex;
        this.lastBalancedIndex = 0;
    }
    remainder() {
        return this.buffer;
    }
}

// Copyright 2012 The Chromium Authors
class HeapSnapshotLoader {
    #progress;
    #buffer;
    #dataCallback;
    #done;
    #snapshot;
    #array;
    #arrayIndex;
    #json = '';
    parsingComplete;
    constructor(dispatcher) {
        this.#reset();
        this.#progress = new HeapSnapshotProgress(dispatcher);
        this.#buffer = [];
        this.#dataCallback = null;
        this.#done = false;
        this.parsingComplete = this.#parseInput();
        this.parsingComplete.catch(() => { });
    }
    dispose() {
        this.#reset();
    }
    #reset() {
        this.#json = '';
        this.#snapshot = undefined;
    }
    close() {
        this.#done = true;
        if (this.#dataCallback) {
            this.#dataCallback('');
            this.#dataCallback = null;
        }
    }
    async buildSnapshot(secondWorker) {
        await this.parsingComplete;
        this.#snapshot = this.#snapshot || {};
        this.#progress.updateStatus('Processing snapshot…');
        const result = new JSHeapSnapshot(this.#snapshot, this.#progress);
        await result.initialize(secondWorker);
        this.#reset();
        return result;
    }
    #parseIntArray() {
        let index = 0;
        const char0 = '0'.charCodeAt(0);
        const char9 = '9'.charCodeAt(0);
        const minus = '-'.charCodeAt(0);
        const closingBracket = ']'.charCodeAt(0);
        const length = this.#json.length;
        while (true) {
            while (index < length) {
                const code = this.#json.charCodeAt(index);
                if ((char0 <= code && code <= char9) || code === minus) {
                    break;
                }
                else if (code === closingBracket) {
                    this.#json = this.#json.slice(index + 1);
                    return false;
                }
                ++index;
            }
            if (index === length) {
                this.#json = '';
                return true;
            }
            const startIndex = index;
            let negative = false;
            if (this.#json.charCodeAt(index) === minus) {
                negative = true;
                ++index;
            }
            let nextNumber = 0;
            while (index < length) {
                const code = this.#json.charCodeAt(index);
                if (char0 > code || code > char9) {
                    break;
                }
                nextNumber *= 10;
                nextNumber += (code - char0);
                ++index;
            }
            if (index === length) {
                this.#json = this.#json.slice(startIndex);
                return true;
            }
            if (!this.#array) {
                throw new Error('Array not instantiated');
            }
            this.#array.setValue(this.#arrayIndex++, negative ? -nextNumber : nextNumber);
        }
    }
    #parseStringsArray() {
        this.#progress.updateStatus('Parsing strings…');
        const closingBracketIndex = this.#json.lastIndexOf(']');
        if (closingBracketIndex === -1) {
            throw new Error('Incomplete JSON');
        }
        this.#json = this.#json.slice(0, closingBracketIndex + 1);
        if (!this.#snapshot) {
            throw new Error('No snapshot in parseStringsArray');
        }
        this.#snapshot.strings = JSON.parse(this.#json);
    }
    write(chunk) {
        if (!chunk) {
            return;
        }
        this.#buffer.push(chunk);
        if (!this.#dataCallback) {
            return;
        }
        this.#dataCallback(this.#buffer.shift());
        this.#dataCallback = null;
    }
    #fetchChunk() {
        if (this.#buffer.length > 0) {
            return Promise.resolve(this.#buffer.shift());
        }
        if (this.#done) {
            return Promise.resolve('');
        }
        const { promise, resolve } = Promise.withResolvers();
        this.#dataCallback = resolve;
        return promise;
    }
    async #findToken(token, startIndex) {
        while (true) {
            const pos = this.#json.indexOf(token, startIndex || 0);
            if (pos !== -1) {
                return pos;
            }
            startIndex = this.#json.length - token.length + 1;
            const chunk = await this.#fetchChunk();
            if (!chunk) {
                throw new Error(`Token ${token} not found (unexpected end of input)`);
            }
            this.#json += chunk;
        }
    }
    async #parseArray(name, title, length) {
        const nameIndex = await this.#findToken(name);
        const bracketIndex = await this.#findToken('[', nameIndex);
        this.#json = this.#json.slice(bracketIndex + 1);
        this.#array = length === undefined ? createExpandableBigUint32Array() :
            createFixedBigUint32Array(length);
        this.#arrayIndex = 0;
        while (this.#parseIntArray()) {
            if (length) {
                this.#progress.updateProgress(title, this.#arrayIndex, this.#array.length);
            }
            else {
                this.#progress.updateStatus(title);
            }
            const chunk = await this.#fetchChunk();
            if (!chunk) {
                throw new Error(`Unexpected end of input while ${title}`);
            }
            this.#json += chunk;
        }
        const result = this.#array;
        this.#array = null;
        return result;
    }
    async #parseInput() {
        const snapshotToken = '"snapshot"';
        const snapshotTokenIndex = await this.#findToken(snapshotToken);
        if (snapshotTokenIndex === -1) {
            throw new Error('Snapshot token not found');
        }
        this.#progress.updateStatus('Loading snapshot info…');
        const json = this.#json.slice(snapshotTokenIndex + snapshotToken.length + 1);
        let jsonTokenizerDone = false;
        const jsonTokenizer = new BalancedJSONTokenizer(metaJSON => {
            this.#json = jsonTokenizer.remainder();
            jsonTokenizerDone = true;
            this.#snapshot = this.#snapshot || {};
            this.#snapshot.snapshot = JSON.parse(metaJSON);
        });
        jsonTokenizer.write(json);
        while (!jsonTokenizerDone) {
            const chunk = await this.#fetchChunk();
            if (!chunk) {
                throw new Error('Unexpected end of input while loading snapshot info');
            }
            jsonTokenizer.write(chunk);
        }
        this.#snapshot = this.#snapshot || {};
        const nodes = await this.#parseArray('"nodes"', 'Loading nodes… {PH1}%', this.#snapshot.snapshot.meta.node_fields.length * this.#snapshot.snapshot.node_count);
        this.#snapshot.nodes = nodes;
        const edges = await this.#parseArray('"edges"', 'Loading edges… {PH1}%', this.#snapshot.snapshot.meta.edge_fields.length * this.#snapshot.snapshot.edge_count);
        this.#snapshot.edges = edges;
        if (this.#snapshot.snapshot.trace_function_count) {
            const traceFunctionInfos = await this.#parseArray('"trace_function_infos"', 'Loading allocation traces… {PH1}%', this.#snapshot.snapshot.meta.trace_function_info_fields.length *
                this.#snapshot.snapshot.trace_function_count);
            this.#snapshot.trace_function_infos = traceFunctionInfos.asUint32ArrayOrFail();
            const thisTokenEndIndex = await this.#findToken(':');
            const nextTokenIndex = await this.#findToken('"', thisTokenEndIndex);
            const openBracketIndex = this.#json.indexOf('[');
            const closeBracketIndex = this.#json.lastIndexOf(']', nextTokenIndex);
            this.#snapshot.trace_tree = JSON.parse(this.#json.substring(openBracketIndex, closeBracketIndex + 1));
            this.#json = this.#json.slice(closeBracketIndex + 1);
        }
        if (this.#snapshot.snapshot.meta.sample_fields) {
            const samples = await this.#parseArray('"samples"', 'Loading samples…');
            this.#snapshot.samples = samples.asArrayOrFail();
        }
        if (this.#snapshot.snapshot.meta['location_fields']) {
            const locations = await this.#parseArray('"locations"', 'Loading locations…');
            this.#snapshot.locations = locations.asArrayOrFail();
        }
        else {
            this.#snapshot.locations = [];
        }
        if (this.#snapshot.snapshot.meta.scope_fields) {
            const scopes = await this.#parseArray('"scopes"', 'Loading scopes…');
            this.#snapshot.scopes = scopes.asArrayOrFail();
        }
        if (this.#snapshot.snapshot.meta.scope_context_var_fields) {
            const scopeContextVars = await this.#parseArray('"scope_context_vars"', 'Loading scope context vars…');
            this.#snapshot.scope_context_vars = scopeContextVars.asArrayOrFail();
        }
        if (this.#snapshot.snapshot.meta.scope_use_fields) {
            const scopeUses = await this.#parseArray('"scope_uses"', 'Loading scope uses…');
            this.#snapshot.scope_uses = scopeUses.asArrayOrFail();
        }
        this.#progress.updateStatus('Loading strings…');
        const stringsTokenIndex = await this.#findToken('"strings"');
        const bracketIndex = await this.#findToken('[', stringsTokenIndex);
        this.#json = this.#json.slice(bracketIndex);
        while (this.#buffer.length > 0 || !this.#done) {
            this.#json += await this.#fetchChunk();
        }
        this.#parseStringsArray();
    }
}

var HeapSnapshotLoader$1 = /*#__PURE__*/Object.freeze({
    __proto__: null,
    HeapSnapshotLoader: HeapSnapshotLoader
});

// Copyright 2011 The Chromium Authors
class HeapSnapshotWorkerDispatcher {
    #objects = [];
    #postMessage;
    constructor(postMessage) {
        this.#postMessage = postMessage;
    }
    sendEvent(name, data) {
        this.#postMessage({ eventName: name, data });
    }
    async dispatchMessage({ data, ports, }) {
        const response = {
            callId: data.callId,
            result: null,
        };
        try {
            switch (data.disposition) {
                case 'createLoader':
                    this.#objects[data.objectId] = new HeapSnapshotLoader(this);
                    break;
                case 'dispose': {
                    delete this.#objects[data.objectId];
                    break;
                }
                case 'getter': {
                    const object = this.#objects[data.objectId];
                    const result = object[data.methodName];
                    response.result = result;
                    break;
                }
                case 'factory': {
                    const object = this.#objects[data.objectId];
                    const args = data.methodArguments.slice();
                    args.push(...ports);
                    const result = await object[data.methodName].apply(object, args);
                    if (result) {
                        this.#objects[data.newObjectId] = result;
                    }
                    response.result = Boolean(result);
                    break;
                }
                case 'method': {
                    const object = this.#objects[data.objectId];
                    response.result = object[data.methodName].apply(object, data.methodArguments);
                    break;
                }
                case 'evaluateForTest': {
                    try {
                        globalThis.HeapSnapshotWorker = {
                            AllocationProfile: AllocationProfile$1,
                            HeapSnapshot: HeapSnapshot$1,
                            HeapSnapshotLoader: HeapSnapshotLoader$1,
                        };
                        globalThis.HeapSnapshotModel = HeapSnapshotModel;
                        response.result = await self.eval(data.source);
                    }
                    catch (error) {
                        response.result = error.toString();
                    }
                    break;
                }
                case 'setupForSecondaryInit': {
                    this.#objects[data.objectId] = new SecondaryInitManager(ports[0]);
                }
            }
        }
        catch (error) {
            response.error = error.toString();
            response.errorCallStack = error.stack;
            if (data.methodName) {
                response.errorMethodName = data.methodName;
            }
        }
        this.#postMessage(response);
    }
}

// Copyright 2020 The Chromium Authors
const dispatcher = new HeapSnapshotWorkerDispatcher(HOST_RUNTIME.workerScope.postMessage.bind(HOST_RUNTIME.workerScope));
HOST_RUNTIME.workerScope.onmessage = dispatcher.dispatchMessage.bind(dispatcher);
HOST_RUNTIME.workerScope.postMessage('workerReady');
//# sourceMappingURL=devtools-heap-snapshot-worker.js.map
