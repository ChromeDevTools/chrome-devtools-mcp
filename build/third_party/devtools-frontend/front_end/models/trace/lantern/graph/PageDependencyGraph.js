// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Core from '../core/core.js';
import { CPUNode } from './CPUNode.js';
import { NetworkNode } from './NetworkNode.js';
// COMPAT: m71+ We added RunTask to `disabled-by-default-lighthouse`
const SCHEDULABLE_TASK_TITLE_LH = 'RunTask';
// m69-70 DoWork is different and we now need RunTask, see https://bugs.chromium.org/p/chromium/issues/detail?id=871204#c11
const SCHEDULABLE_TASK_TITLE_ALT1 = 'ThreadControllerImpl::RunTask';
// In m66-68 refactored to this task title, https://crrev.com/c/883346
const SCHEDULABLE_TASK_TITLE_ALT2 = 'ThreadControllerImpl::DoWork';
// m65 and earlier
const SCHEDULABLE_TASK_TITLE_ALT3 = 'TaskQueueManager::ProcessTaskFromWorkQueue';
// Shorter tasks have negligible impact on simulation results.
const SIGNIFICANT_DUR_THRESHOLD_MS = 10;
// TODO: video files tend to be enormous and throw off all graph traversals, move this ignore
//    into estimation logic when we use the dependency graph for other purposes.
const IGNORED_MIME_TYPES_REGEX = /^video/;
class PageDependencyGraph {
    static getNetworkInitiators(request) {
        if (!request.initiator) {
            return [];
        }
        if (request.initiator.url) {
            return [request.initiator.url];
        }
        if (request.initiator.type === 'script') {
            // Script initiators have the stack of callFrames from all functions that led to this request.
            // If async stacks are enabled, then the stack will also have the parent functions that asynchronously
            // led to this request chained in the `parent` property.
            const scriptURLs = new Set();
            let stack = request.initiator.stack;
            while (stack) {
                const callFrames = stack.callFrames || [];
                for (const frame of callFrames) {
                    if (frame.url) {
                        scriptURLs.add(frame.url);
                    }
                }
                stack = stack.parent;
            }
            return Array.from(scriptURLs);
        }
        return [];
    }
    static getNetworkNodeOutput(networkRequests) {
        const nodes = [];
        const idToNodeMap = new Map();
        const urlToNodeMap = new Map();
        const frameIdToNodeMap = new Map();
        networkRequests.forEach(request => {
            if (IGNORED_MIME_TYPES_REGEX.test(request.mimeType)) {
                return;
            }
            if (request.fromWorker) {
                return;
            }
            // Network requestIds can be duplicated for an unknown reason
            // Suffix all subsequent requests with `:duplicate` until it's unique
            // NOTE: This should never happen with modern NetworkRequest library, but old fixtures
            // might still have this issue.
            while (idToNodeMap.has(request.requestId)) {
                request.requestId += ':duplicate';
            }
            const node = new NetworkNode(request);
            nodes.push(node);
            const urlList = urlToNodeMap.get(request.url) || [];
            urlList.push(node);
            idToNodeMap.set(request.requestId, node);
            urlToNodeMap.set(request.url, urlList);
            // If the request was for the root document of an iframe, save an entry in our
            // map so we can link up the task `args.data.frame` dependencies later in graph creation.
            if (request.frameId && request.resourceType === 'Document' && request.documentURL === request.url) {
                // If there's ever any ambiguity, permanently set the value to `false` to avoid loops in the graph.
                const value = frameIdToNodeMap.has(request.frameId) ? null : node;
                frameIdToNodeMap.set(request.frameId, value);
            }
        });
        return { nodes, idToNodeMap, urlToNodeMap, frameIdToNodeMap };
    }
    static isScheduleableTask(evt) {
        return evt.name === SCHEDULABLE_TASK_TITLE_LH || evt.name === SCHEDULABLE_TASK_TITLE_ALT1 ||
            evt.name === SCHEDULABLE_TASK_TITLE_ALT2 || evt.name === SCHEDULABLE_TASK_TITLE_ALT3;
    }
    /**
     * There should *always* be at least one top level event, having 0 typically means something is
     * drastically wrong with the trace and we should just give up early and loudly.
     */
    static assertHasToplevelEvents(events) {
        const hasToplevelTask = events.some(this.isScheduleableTask);
        if (!hasToplevelTask) {
            throw new Core.LanternError('Could not find any top level events');
        }
    }
    static getCPUNodes(mainThreadEvents) {
        const nodes = [];
        let i = 0;
        PageDependencyGraph.assertHasToplevelEvents(mainThreadEvents);
        // TODO(crbug.com/568836981): Remove `scriptUrlById` once `v8.evaluateModule`
        // includes `args.data.url` in all supported Chrome versions. Prior to that
        // Chromium change, `v8.evaluateModule` has empty `args`, so we correlate
        // `ModuleEvaluated.args.data.scriptId` with the URL from `v8.compileModule`.
        const scriptUrlById = new Map();
        while (i < mainThreadEvents.length) {
            const evt = mainThreadEvents[i];
            i++;
            // Skip all trace events that aren't schedulable tasks with sizable duration
            if (!PageDependencyGraph.isScheduleableTask(evt) || !evt.dur) {
                continue;
            }
            let correctedEndTs = undefined;
            // Capture all events that occurred within the task
            const children = [];
            for (const endTime = evt.ts + evt.dur; i < mainThreadEvents.length && mainThreadEvents[i].ts < endTime; i++) {
                const event = mainThreadEvents[i];
                // Temporary fix for a Chrome bug where some RunTask events can be overlapping.
                // We correct that here be ensuring each RunTask ends at least 1 microsecond before the next
                // https://github.com/GoogleChrome/lighthouse/issues/15896
                // https://issues.chromium.org/issues/329678173
                if (PageDependencyGraph.isScheduleableTask(event) && event.dur) {
                    correctedEndTs = Math.max(event.ts - 1, evt.ts);
                    break;
                }
                if (event.name === 'v8.compileModule' && event.args.data?.scriptId !== undefined && event.args.data.url) {
                    scriptUrlById.set(event.args.data.scriptId, event.args.data.url);
                }
                children.push(event);
            }
            nodes.push(new CPUNode(evt, children, correctedEndTs, scriptUrlById));
        }
        return nodes;
    }
    static linkNetworkNodes(rootNode, networkNodeOutput) {
        networkNodeOutput.nodes.forEach(node => {
            const directInitiatorRequest = node.request.initiatorRequest || rootNode.request;
            const directInitiatorNode = networkNodeOutput.idToNodeMap.get(directInitiatorRequest.requestId) || rootNode;
            const canDependOnInitiator = !directInitiatorNode.isDependentOn(node) && node.canDependOn(directInitiatorNode);
            const initiators = PageDependencyGraph.getNetworkInitiators(node.request);
            if (initiators.length) {
                initiators.forEach(initiator => {
                    const parentCandidates = networkNodeOutput.urlToNodeMap.get(initiator) || [];
                    // Only add the edge if the parent is unambiguous with valid timing and isn't circular.
                    if (parentCandidates.length === 1 && parentCandidates[0].startTime <= node.startTime &&
                        !parentCandidates[0].isDependentOn(node)) {
                        node.addDependency(parentCandidates[0]);
                    }
                    else if (canDependOnInitiator) {
                        directInitiatorNode.addDependent(node);
                    }
                });
            }
            else if (canDependOnInitiator) {
                directInitiatorNode.addDependent(node);
            }
            // Make sure the nodes are attached to the graph if the initiator information was invalid.
            if (node !== rootNode && node.getDependencies().length === 0 && node.canDependOn(rootNode)) {
                node.addDependency(rootNode);
            }
            if (!node.request.redirects) {
                return;
            }
            const redirects = [...node.request.redirects, node.request];
            for (let i = 1; i < redirects.length; i++) {
                const redirectNode = networkNodeOutput.idToNodeMap.get(redirects[i - 1].requestId);
                const actualNode = networkNodeOutput.idToNodeMap.get(redirects[i].requestId);
                if (actualNode && redirectNode) {
                    actualNode.addDependency(redirectNode);
                }
            }
        });
    }
    static linkCPUNodes(rootNode, networkNodeOutput, cpuNodes) {
        const linkableResourceTypes = new Set([
            'XHR',
            'Fetch',
            'Script',
        ]);
        function addDependentNetworkRequest(cpuNode, reqId) {
            const networkNode = networkNodeOutput.idToNodeMap.get(reqId);
            if (!networkNode ||
                // Ignore all network nodes that started before this CPU task started
                // A network request that started earlier could not possibly have been started by this task
                networkNode.startTime <= cpuNode.startTime) {
                return;
            }
            const { request } = networkNode;
            const resourceType = request.resourceType || request.redirectDestination?.resourceType;
            if (!linkableResourceTypes.has(resourceType)) {
                // We only link some resources to CPU nodes because we observe LCP simulation
                // regressions when including images, etc.
                return;
            }
            cpuNode.addDependent(networkNode);
        }
        /**
         * If the node has an associated frameId, then create a dependency on the root document request
         * for the frame. The task obviously couldn't have started before the frame was even downloaded.
         */
        function addDependencyOnFrame(cpuNode, frameId) {
            if (!frameId) {
                return;
            }
            const networkNode = networkNodeOutput.frameIdToNodeMap.get(frameId);
            if (!networkNode) {
                return;
            }
            // Ignore all network nodes that started after this CPU task started
            // A network request that started after could not possibly be required this task
            if (networkNode.startTime >= cpuNode.startTime) {
                return;
            }
            cpuNode.addDependency(networkNode);
        }
        function addDependencyOnUrl(cpuNode, url) {
            if (!url) {
                return;
            }
            // Allow network requests that end up to 100ms before the task started
            // Some script evaluations can start before the script finishes downloading
            const minimumAllowableTimeSinceNetworkNodeEnd = -100 * 1000;
            const candidates = networkNodeOutput.urlToNodeMap.get(url) || [];
            let minCandidate = null;
            let minDistance = Infinity;
            // Find the closest request that finished before this CPU task started
            for (const candidate of candidates) {
                // Explicitly ignore all requests that started after this CPU node
                // A network request that started after this task started cannot possibly be a dependency
                if (cpuNode.startTime <= candidate.startTime) {
                    continue;
                }
                const distance = cpuNode.startTime - candidate.endTime;
                if (distance >= minimumAllowableTimeSinceNetworkNodeEnd && distance < minDistance) {
                    minCandidate = candidate;
                    minDistance = distance;
                }
            }
            if (!minCandidate) {
                return;
            }
            cpuNode.addDependency(minCandidate);
        }
        const timers = new Map();
        for (const node of cpuNodes) {
            for (const evt of node.childEvents) {
                if (!evt.args.data) {
                    continue;
                }
                const argsUrl = evt.args.data.url;
                const stackTraceUrls = (evt.args.data.stackTrace || []).map(l => l.url).filter(Boolean);
                switch (evt.name) {
                    case 'TimerInstall':
                        // @ts-expect-error - 'TimerInstall' event means timerId exists.
                        timers.set(evt.args.data.timerId, node);
                        stackTraceUrls.forEach(url => addDependencyOnUrl(node, url));
                        break;
                    case 'TimerFire': {
                        // @ts-expect-error - 'TimerFire' event means timerId exists.
                        const installer = timers.get(evt.args.data.timerId);
                        if (!installer || installer.endTime > node.startTime) {
                            break;
                        }
                        installer.addDependent(node);
                        break;
                    }
                    case 'InvalidateLayout':
                    case 'ScheduleStyleRecalculation':
                        addDependencyOnFrame(node, evt.args.data.frame);
                        stackTraceUrls.forEach(url => addDependencyOnUrl(node, url));
                        break;
                    case 'EvaluateScript':
                    case 'v8.evaluateModule':
                        addDependencyOnFrame(node, evt.args.data.frame);
                        // @ts-expect-error - 'EvaluateScript'/'v8.evaluateModule' event means argsUrl is defined.
                        addDependencyOnUrl(node, argsUrl);
                        stackTraceUrls.forEach(url => addDependencyOnUrl(node, url));
                        break;
                    // TODO(crbug.com/568836981): Remove this workaround once v8.evaluateModule
                    // includes `args.data.url` in all supported Chrome versions.
                    case 'ModuleEvaluated': {
                        addDependencyOnFrame(node, evt.args.data.frame);
                        if (evt.args.data.scriptId !== undefined) {
                            const moduleUrl = node.getScriptUrlById(evt.args.data.scriptId);
                            if (moduleUrl) {
                                addDependencyOnUrl(node, moduleUrl);
                            }
                        }
                        break;
                    }
                    case 'XHRReadyStateChange':
                        // Only create the dependency if the request was completed
                        // 'XHRReadyStateChange' event means readyState is defined.
                        if (evt.args.data.readyState !== 4) {
                            break;
                        }
                        // @ts-expect-error - 'XHRReadyStateChange' event means argsUrl is defined.
                        addDependencyOnUrl(node, argsUrl);
                        stackTraceUrls.forEach(url => addDependencyOnUrl(node, url));
                        break;
                    case 'FunctionCall':
                    case 'v8.compile':
                    case 'v8.compileModule':
                        addDependencyOnFrame(node, evt.args.data.frame);
                        // @ts-expect-error - events mean argsUrl is defined.
                        addDependencyOnUrl(node, argsUrl);
                        break;
                    case 'ParseAuthorStyleSheet':
                        addDependencyOnFrame(node, evt.args.data.frame);
                        // @ts-expect-error - 'ParseAuthorStyleSheet' event means styleSheetUrl is defined.
                        addDependencyOnUrl(node, evt.args.data.styleSheetUrl);
                        break;
                    case 'ResourceSendRequest':
                        addDependencyOnFrame(node, evt.args.data.frame);
                        // @ts-expect-error - 'ResourceSendRequest' event means requestId is defined.
                        addDependentNetworkRequest(node, evt.args.data.requestId);
                        stackTraceUrls.forEach(url => addDependencyOnUrl(node, url));
                        break;
                }
            }
            // Nodes starting before the root node cannot depend on it.
            if (node.getNumberOfDependencies() === 0 && node.canDependOn(rootNode)) {
                node.addDependency(rootNode);
            }
        }
        // Second pass to prune the graph of short tasks.
        const minimumEvtDur = SIGNIFICANT_DUR_THRESHOLD_MS * 1000;
        let foundFirstLayout = false;
        let foundFirstPaint = false;
        let foundFirstParse = false;
        for (const node of cpuNodes) {
            // Don't prune if event is the first ParseHTML/Layout/Paint.
            // See https://github.com/GoogleChrome/lighthouse/issues/9627#issuecomment-526699524 for more.
            let isFirst = false;
            if (!foundFirstLayout && node.childEvents.some(evt => evt.name === 'Layout')) {
                isFirst = foundFirstLayout = true;
            }
            if (!foundFirstPaint && node.childEvents.some(evt => evt.name === 'Paint')) {
                isFirst = foundFirstPaint = true;
            }
            if (!foundFirstParse && node.childEvents.some(evt => evt.name === 'ParseHTML')) {
                isFirst = foundFirstParse = true;
            }
            if (isFirst || node.duration >= minimumEvtDur) {
                // Don't prune this node. The task is long / important so it will impact simulation.
                continue;
            }
            // Prune the node if it isn't highly connected to minimize graph size. Rewiring the graph
            // here replaces O(M + N) edges with (M * N) edges, which is fine if either  M or N is at
            // most 1.
            if (node.getNumberOfDependencies() === 1 || node.getNumberOfDependents() <= 1) {
                PageDependencyGraph.pruneNode(node);
            }
        }
    }
    /**
     * Removes the given node from the graph, but retains all paths between its dependencies and
     * dependents.
     */
    static pruneNode(node) {
        const dependencies = node.getDependencies();
        const dependents = node.getDependents();
        for (const dependency of dependencies) {
            node.removeDependency(dependency);
            for (const dependent of dependents) {
                dependency.addDependent(dependent);
            }
        }
        for (const dependent of dependents) {
            node.removeDependent(dependent);
        }
    }
    /**
     * TODO: remove when CDT backend in Lighthouse is gone. Until then, this is a useful debugging tool
     * to find delta between using CDP or the trace to create the network requests.
     *
     * When a test fails using the trace backend, I enabled this debug method and copied the network
     * requests when CDP was used, then when trace is used, and diff'd them. This method helped
     * remove non-logical differences from the comparison (order of properties, slight rounding
     * discrepancies, removing object cycles, etc).
     *
     * When using for a unit test, make sure to do `.only` so you are getting what you expect.
     */
    static debugNormalizeRequests(lanternRequests) {
        for (const request of lanternRequests) {
            request.rendererStartTime = Math.round(request.rendererStartTime * 1000) / 1000;
            request.networkRequestTime = Math.round(request.networkRequestTime * 1000) / 1000;
            request.responseHeadersEndTime = Math.round(request.responseHeadersEndTime * 1000) / 1000;
            request.networkEndTime = Math.round(request.networkEndTime * 1000) / 1000;
        }
        for (const r of lanternRequests) {
            delete r.rawRequest;
            if (r.initiatorRequest) {
                // @ts-expect-error
                r.initiatorRequest = { id: r.initiatorRequest.requestId };
            }
            if (r.redirectDestination) {
                // @ts-expect-error
                r.redirectDestination = { id: r.redirectDestination.requestId };
            }
            if (r.redirectSource) {
                // @ts-expect-error
                r.redirectSource = { id: r.redirectSource.requestId };
            }
            if (r.redirects) {
                // @ts-expect-error
                r.redirects = r.redirects.map(r2 => r2.requestId);
            }
        }
        const requests = lanternRequests
            .map(r => ({
            requestId: r.requestId,
            connectionId: r.connectionId,
            connectionReused: r.connectionReused,
            url: r.url,
            protocol: r.protocol,
            parsedURL: r.parsedURL,
            documentURL: r.documentURL,
            rendererStartTime: r.rendererStartTime,
            networkRequestTime: r.networkRequestTime,
            responseHeadersEndTime: r.responseHeadersEndTime,
            networkEndTime: r.networkEndTime,
            transferSize: r.transferSize,
            resourceSize: r.resourceSize,
            fromDiskCache: r.fromDiskCache,
            fromMemoryCache: r.fromMemoryCache,
            finished: r.finished,
            statusCode: r.statusCode,
            redirectSource: r.redirectSource,
            redirectDestination: r.redirectDestination,
            redirects: r.redirects,
            failed: r.failed,
            initiator: r.initiator,
            timing: r.timing ? {
                requestTime: r.timing.requestTime,
                proxyStart: r.timing.proxyStart,
                proxyEnd: r.timing.proxyEnd,
                dnsStart: r.timing.dnsStart,
                dnsEnd: r.timing.dnsEnd,
                connectStart: r.timing.connectStart,
                connectEnd: r.timing.connectEnd,
                sslStart: r.timing.sslStart,
                sslEnd: r.timing.sslEnd,
                workerStart: r.timing.workerStart,
                workerReady: r.timing.workerReady,
                workerFetchStart: r.timing.workerFetchStart,
                workerRespondWithSettled: r.timing.workerRespondWithSettled,
                sendStart: r.timing.sendStart,
                sendEnd: r.timing.sendEnd,
                pushStart: r.timing.pushStart,
                pushEnd: r.timing.pushEnd,
                receiveHeadersStart: r.timing.receiveHeadersStart,
                receiveHeadersEnd: r.timing.receiveHeadersEnd,
            } :
                r.timing,
            resourceType: r.resourceType,
            mimeType: r.mimeType,
            priority: r.priority,
            initiatorRequest: r.initiatorRequest,
            frameId: r.frameId,
            fromWorker: r.fromWorker,
            isLinkPreload: r.isLinkPreload,
            serverResponseTime: r.serverResponseTime,
        }))
            .filter(r => !r.fromWorker);
        const debug = requests;
        // Set breakpoint here.
        // Copy `debug` and compare with https://www.diffchecker.com/text-compare/
        // eslint-disable-next-line no-console
        console.log(debug);
    }
    static createGraph(mainThreadEvents, networkRequests, url) {
        // This is for debugging trace/devtoolslog network records.
        // const debug = PageDependencyGraph.debugNormalizeRequests(networkRequests);
        const networkNodeOutput = PageDependencyGraph.getNetworkNodeOutput(networkRequests);
        const cpuNodes = PageDependencyGraph.getCPUNodes(mainThreadEvents);
        const { requestedUrl, mainDocumentUrl } = url;
        if (!requestedUrl) {
            throw new Core.LanternError('requestedUrl is required to get the root request');
        }
        if (!mainDocumentUrl) {
            throw new Core.LanternError('mainDocumentUrl is required to get the main resource');
        }
        const rootRequest = Core.NetworkAnalyzer.findResourceForUrl(networkRequests, requestedUrl);
        if (!rootRequest) {
            throw new Core.LanternError('rootRequest not found');
        }
        const rootNode = networkNodeOutput.idToNodeMap.get(rootRequest.requestId);
        if (!rootNode) {
            throw new Core.LanternError('rootNode not found');
        }
        const mainDocumentRequest = Core.NetworkAnalyzer.findLastDocumentForUrl(networkRequests, mainDocumentUrl);
        if (!mainDocumentRequest) {
            throw new Core.LanternError('mainDocumentRequest not found');
        }
        const mainDocumentNode = networkNodeOutput.idToNodeMap.get(mainDocumentRequest.requestId);
        if (!mainDocumentNode) {
            throw new Core.LanternError('mainDocumentNode not found');
        }
        PageDependencyGraph.linkNetworkNodes(rootNode, networkNodeOutput);
        PageDependencyGraph.linkCPUNodes(rootNode, networkNodeOutput, cpuNodes);
        mainDocumentNode.setIsMainDocument(true);
        if (NetworkNode.findCycle(rootNode)) {
            // Uncomment the following if you are debugging cycles.
            // this.printGraph(rootNode);
            throw new Core.LanternError('Invalid dependency graph created, cycle detected');
        }
        return rootNode;
    }
    // Unused, but useful for debugging.
    static printGraph(rootNode, widthInCharacters = 80) {
        function padRight(str, target, padChar = ' ') {
            return str + padChar.repeat(Math.max(target - str.length, 0));
        }
        const nodes = [];
        rootNode.traverse(node => nodes.push(node));
        nodes.sort((a, b) => a.startTime - b.startTime);
        // Assign labels (A, B, C, ..., Z, Z1, Z2, ...) for each node.
        const nodeToLabel = new Map();
        rootNode.traverse(node => {
            const ascii = 65 + nodeToLabel.size;
            let label;
            if (ascii > 90) {
                label = `Z${ascii - 90}`;
            }
            else {
                label = String.fromCharCode(ascii);
            }
            nodeToLabel.set(node, label);
        });
        const min = nodes[0].startTime;
        const max = nodes.reduce((max, node) => Math.max(max, node.endTime), 0);
        const totalTime = max - min;
        const timePerCharacter = totalTime / widthInCharacters;
        nodes.forEach(node => {
            const offset = Math.round((node.startTime - min) / timePerCharacter);
            const length = Math.ceil((node.endTime - node.startTime) / timePerCharacter);
            const bar = padRight('', offset) + padRight('', length, '=');
            // @ts-expect-error -- disambiguate displayName from across possible Node types.
            const displayName = node.request ? node.request.url : node.type;
            // eslint-disable-next-line
            console.log(padRight(bar, widthInCharacters), `| ${displayName.slice(0, 50)}`);
        });
        // Print labels for each node.
        // eslint-disable-next-line
        console.log();
        // Print dependencies.
        nodes.forEach(node => {
            // @ts-expect-error -- disambiguate displayName from across possible Node types.
            const displayName = node.request ? node.request.url : node.type;
            // eslint-disable-next-line
            console.log(nodeToLabel.get(node), displayName.slice(0, widthInCharacters - 5));
            for (const child of node.dependents) {
                // @ts-expect-error -- disambiguate displayName from across possible Node types.
                const displayName = child.request ? child.request.url : child.type;
                // eslint-disable-next-line
                console.log('  ->', nodeToLabel.get(child), displayName.slice(0, widthInCharacters - 10));
            }
            // eslint-disable-next-line
            console.log();
        });
        // Show cycle.
        const cyclePath = NetworkNode.findCycle(rootNode);
        // eslint-disable-next-line
        console.log('Cycle?', cyclePath ? 'yes' : 'no');
        if (cyclePath) {
            const path = [...cyclePath];
            path.push(path[0]);
            // eslint-disable-next-line
            console.log(path.map(node => nodeToLabel.get(node)).join(' -> '));
        }
    }
}
export { PageDependencyGraph };
//# sourceMappingURL=PageDependencyGraph.js.map