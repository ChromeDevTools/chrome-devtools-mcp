// Copyright 2011 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as Platform from '../../core/platform/platform.js';
export class HeapSnapshotWorkerProxy extends Common.ObjectWrapper.ObjectWrapper {
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
        this.worker = Platform.HostRuntime.HOST_RUNTIME.createWorker(workerUrl ?? import.meta.resolve('../../entrypoints/heap_snapshot_worker/heap_snapshot_worker-entrypoint.js'));
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
        this.dispatchEventToListeners("Wait" /* HeapSnapshotWorkerProxy.Events.WAIT */, hasLongRunningCalls);
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
(function (HeapSnapshotWorkerProxy) {
    let Events;
    (function (Events) {
        Events["WAIT"] = "Wait";
    })(Events = HeapSnapshotWorkerProxy.Events || (HeapSnapshotWorkerProxy.Events = {}));
})(HeapSnapshotWorkerProxy || (HeapSnapshotWorkerProxy = {}));
export class HeapSnapshotProxyObject {
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
export class HeapSnapshotLoaderProxy extends HeapSnapshotProxyObject {
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
export class HeapSnapshotProxy extends HeapSnapshotProxyObject {
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
export class HeapSnapshotProviderProxy extends HeapSnapshotProxyObject {
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
//# sourceMappingURL=HeapSnapshotProxy.js.map