/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { CommentFormatter, } from './formatters/CommentFormatter.js';
import { ConsoleFormatter } from './formatters/ConsoleFormatter.js';
import { CssFormatter, resolveContainerQueries, } from './formatters/CssFormatter.js';
import { collectRankedContexts, formatName, HeapSnapshotFormatter, isEdgeLike, isNodeLike, } from './formatters/HeapSnapshotFormatter.js';
import { IssueFormatter } from './formatters/IssueFormatter.js';
import { NetworkFormatter } from './formatters/NetworkFormatter.js';
import { SnapshotFormatter } from './formatters/SnapshotFormatter.js';
import { UncaughtError } from './collectors/PageCollector.js';
import { TextSnapshot } from './TextSnapshot.js';
import { DevTools, getToonEncode, getGcfEncode } from './third_party/index.js';
import { handleDialog, listPages } from './tools/pages.js';
import { getInsightOutput, getTraceSummary, } from './processors/PerformanceTrace.js';
import { stableIdSymbol } from './utils/id.js';
import { paginate } from './utils/pagination.js';
const { formatBytesToKb } = DevTools.I18n.ByteUtilities;
export class McpResponse {
    #includePages = false;
    #includeExtensionServiceWorkers = false;
    #includeExtensionPages = false;
    #snapshotParams;
    #attachedNetworkRequestId;
    #attachedNetworkRequestOptions;
    #attachedConsoleMessageId;
    #attachedTraceSummary;
    #attachedTraceInsight;
    #attachedLighthouseResult;
    #textResponseLines = [];
    #images = [];
    #heapSnapshotOptions;
    #networkRequestsOptions;
    #consoleDataOptions;
    #cssStylesData;
    #listExtensions;
    #listThirdPartyDeveloperTools;
    #listWebMcpTools;
    #devToolsData;
    #tabId;
    #args;
    #page;
    #redactNetworkHeaders = true;
    #error;
    #attachedWaitForResult;
    #reconnectNotice = false;
    #devToolsComments;
    get #deviceScope() {
        return this.#page?.viewport?.isMobile ? 'PHONE' : 'DESKTOP';
    }
    constructor(args) {
        this.#args = args;
    }
    setPage(page) {
        this.#page = page;
    }
    setRedactNetworkHeaders(value) {
        this.#redactNetworkHeaders = value;
    }
    /**
     * Surfaces a one-time note that the browser reconnected and page ids changed.
     * Set by the tool handler when the context reports a pending reconnect notice.
     */
    setReconnectNotice() {
        this.#reconnectNotice = true;
    }
    attachDevToolsData(data) {
        this.#devToolsData = data;
    }
    setTabId(tabId) {
        this.#tabId = tabId;
    }
    setIncludePages(value) {
        this.#includePages = value;
        if (this.#args.categoryExtensions) {
            this.#includeExtensionServiceWorkers = value;
            this.#includeExtensionPages = value;
        }
    }
    setIncludeExtensionServiceWorkers(value) {
        this.#includeExtensionServiceWorkers = value;
    }
    includeSnapshot(params) {
        this.#snapshotParams = params ?? {
            verbose: false,
        };
    }
    setListExtensions() {
        this.#listExtensions = true;
    }
    setListThirdPartyDeveloperTools() {
        this.#listThirdPartyDeveloperTools = true;
    }
    setListWebMcpTools() {
        this.#listWebMcpTools = true;
    }
    setIncludeNetworkRequests(value, options) {
        if (!value) {
            this.#networkRequestsOptions = undefined;
            return;
        }
        this.#networkRequestsOptions = {
            include: value,
            pagination: options?.pageSize !== undefined || options?.pageIdx !== undefined
                ? {
                    pageSize: options.pageSize,
                    pageIdx: options.pageIdx,
                }
                : undefined,
            resourceTypes: options?.resourceTypes,
            includePreservedRequests: options?.includePreservedRequests,
            networkRequestIdInDevToolsUI: options?.networkRequestIdInDevToolsUI,
        };
    }
    setIncludeConsoleData(value, options) {
        if (!value) {
            this.#consoleDataOptions = undefined;
            return;
        }
        this.#consoleDataOptions = {
            include: value,
            pagination: options?.pageSize !== undefined || options?.pageIdx !== undefined
                ? {
                    pageSize: options.pageSize,
                    pageIdx: options.pageIdx,
                }
                : undefined,
            types: options?.types,
            includePreservedMessages: options?.includePreservedMessages,
            includeStackTraces: options?.includeStackTraces,
            serviceWorkerId: options?.serviceWorkerId,
        };
    }
    setIncludeCssStyles(matchedStyles, options) {
        this.#cssStylesData = {
            matchedStyles,
            options,
        };
    }
    setError(error) {
        this.#error = error;
    }
    attachNetworkRequest(reqId, options) {
        this.#attachedNetworkRequestId = reqId;
        this.#attachedNetworkRequestOptions = options;
    }
    attachConsoleMessage(msgid) {
        this.#attachedConsoleMessageId = msgid;
    }
    attachTraceSummary(result) {
        this.#attachedTraceSummary = result;
    }
    attachTraceInsight(trace, insightSetId, insightName) {
        this.#attachedTraceInsight = {
            trace,
            insightSetId,
            insightName,
        };
    }
    attachLighthouseResult(result) {
        this.#attachedLighthouseResult = result;
    }
    get includePages() {
        return this.#includePages;
    }
    get attachedTraceSummary() {
        return this.#attachedTraceSummary;
    }
    get attachedTracedInsight() {
        return this.#attachedTraceInsight;
    }
    get attachedLighthouseResult() {
        return this.#attachedLighthouseResult;
    }
    get includeNetworkRequests() {
        return this.#networkRequestsOptions?.include ?? false;
    }
    get includeConsoleData() {
        return this.#consoleDataOptions?.include ?? false;
    }
    get attachedNetworkRequestId() {
        return this.#attachedNetworkRequestId;
    }
    get networkRequestsPageIdx() {
        return this.#networkRequestsOptions?.pagination?.pageIdx;
    }
    get consoleMessagesPageIdx() {
        return this.#consoleDataOptions?.pagination?.pageIdx;
    }
    get consoleMessagesTypes() {
        return this.#consoleDataOptions?.types;
    }
    get error() {
        return this.#error;
    }
    appendResponseLine(value) {
        this.#textResponseLines.push(value);
    }
    attachWaitForResult(result) {
        this.#attachedWaitForResult = result;
    }
    setDevToolsComments(threads) {
        this.#devToolsComments = threads;
    }
    get devToolsComments() {
        return this.#devToolsComments;
    }
    setHeapSnapshotAggregates(aggregateData, options) {
        this.#heapSnapshotOptions = {
            ...this.#heapSnapshotOptions,
            include: true,
            aggregateData,
            pagination: options,
            formatOptions: options,
        };
    }
    setHeapSnapshotStats(stats, staticData, nativeContextSizes, retainedByContextSummary, options) {
        this.#heapSnapshotOptions = {
            ...this.#heapSnapshotOptions,
            include: true,
            stats,
            staticData,
            nativeContextSizes,
            retainedByContextSummary,
            formatOptions: options,
        };
    }
    setHeapSnapshotNodes(nodes, options) {
        this.#heapSnapshotOptions = {
            ...this.#heapSnapshotOptions,
            include: true,
            nodes,
            pagination: options,
            formatOptions: options,
        };
    }
    setHeapSnapshotDuplicateStrings(duplicateStrings, options) {
        this.#heapSnapshotOptions = {
            ...this.#heapSnapshotOptions,
            include: true,
            duplicateStrings,
            pagination: options,
            formatOptions: options,
        };
    }
    setHeapSnapshotRetainingPaths(retainingPaths, options) {
        this.#heapSnapshotOptions = {
            ...this.#heapSnapshotOptions,
            include: true,
            retainingPaths,
            formatOptions: options,
        };
    }
    setHeapSnapshotDominators(dominators, options) {
        this.#heapSnapshotOptions = {
            ...this.#heapSnapshotOptions,
            include: true,
            dominators,
            formatOptions: options,
        };
    }
    setHeapSnapshotClassDiffs(diff, options) {
        this.#heapSnapshotOptions = {
            ...this.#heapSnapshotOptions,
            include: true,
            diff,
            pagination: options,
            formatOptions: options,
        };
    }
    setHeapSnapshotDetailedClassDiff(detailedClassDiff, options) {
        this.#heapSnapshotOptions = {
            ...this.#heapSnapshotOptions,
            include: true,
            detailedClassDiff,
            formatOptions: options,
        };
    }
    setHeapSnapshotObjectDetails(objectInfo, options) {
        this.#heapSnapshotOptions = {
            ...this.#heapSnapshotOptions,
            include: true,
            objectInfo,
            formatOptions: options,
        };
    }
    setHeapSnapshotContextAnalysis(contextAnalysis, options) {
        this.#heapSnapshotOptions = {
            ...this.#heapSnapshotOptions,
            include: true,
            contextAnalysis,
            contextAnalysisOptions: options,
            formatOptions: options,
        };
    }
    attachImage(value) {
        this.#images.push(value);
    }
    get responseLines() {
        return this.#textResponseLines;
    }
    get images() {
        return this.#images;
    }
    get snapshotParams() {
        return this.#snapshotParams;
    }
    get listWebMcpTools() {
        return this.#listWebMcpTools;
    }
    async #handleSnapshot(context) {
        if (this.#includePages) {
            await context.createPagesSnapshot();
        }
        if (!this.#snapshotParams) {
            return undefined;
        }
        if (!this.#page) {
            throw new Error('Response must have a page');
        }
        this.#page.textSnapshot = await TextSnapshot.create(this.#page, {
            verbose: this.#snapshotParams.verbose,
            devtoolsData: this.#devToolsData,
        });
        const formatter = new SnapshotFormatter(this.#page.textSnapshot);
        if (this.#snapshotParams.filePath) {
            const result = await context.saveFile(new TextEncoder().encode(formatter.toString()), this.#snapshotParams.filePath, '.txt');
            return result.filename;
        }
        return formatter;
    }
    async #handleAttachedNetworkRequest(context) {
        if (!this.#attachedNetworkRequestId) {
            return undefined;
        }
        if (!this.#page) {
            throw new Error(`Response must have an McpPage`);
        }
        const request = this.#page.getNetworkRequestById(this.#attachedNetworkRequestId);
        return await NetworkFormatter.from(request, {
            requestId: this.#attachedNetworkRequestId,
            requestIdResolver: req => this.getNetworkRequestStableId(req),
            fetchData: true,
            requestFilePath: this.#attachedNetworkRequestOptions?.requestFilePath,
            responseFilePath: this.#attachedNetworkRequestOptions?.responseFilePath,
            saveFile: (data, filename, extension) => context.saveFile(data, filename, extension),
            redactNetworkHeaders: this.#redactNetworkHeaders,
        });
    }
    async #handleAttachedConsoleMessage() {
        if (!this.#attachedConsoleMessageId) {
            return undefined;
        }
        if (!this.#page) {
            throw new Error(`Response must have an McpPage`);
        }
        const message = this.#page.getConsoleMessageById(this.#attachedConsoleMessageId);
        const consoleMessageStableId = this.#attachedConsoleMessageId;
        if ('args' in message || message instanceof UncaughtError) {
            const consoleMessage = message;
            return await ConsoleFormatter.from(consoleMessage, {
                id: consoleMessageStableId,
                fetchDetailedData: true,
                devTools: this.#page.devtoolsUniverse,
            });
        }
        if (message instanceof DevTools.AggregatedIssue) {
            const formatter = new IssueFormatter(message, {
                id: consoleMessageStableId,
                requestIdResolver: this.#page.resolveCdpRequestId.bind(this.#page),
                elementIdResolver: this.#page.textSnapshot?.resolveCdpElementId.bind(this.#page.textSnapshot),
            });
            if (!formatter.isValid()) {
                throw new Error("Can't provide details for the msgid " + consoleMessageStableId);
            }
            return formatter;
        }
        return undefined;
    }
    async #handleThirdPartyDevelopeTools() {
        if (this.#args.categoryExperimentalThirdParty &&
            this.#listThirdPartyDeveloperTools &&
            this.#page) {
            return await this.#page.getToolGroups();
        }
        return undefined;
    }
    async #handleWebMCP() {
        if (this.#args.categoryExperimentalWebmcp &&
            this.#listWebMcpTools &&
            this.#page) {
            return this.#page.getWebMcpTools();
        }
        return undefined;
    }
    async #handleConsoleList(context) {
        if (!this.#consoleDataOptions?.include) {
            return undefined;
        }
        let messages;
        let page;
        if (this.#consoleDataOptions.serviceWorkerId) {
            messages = context.getServiceWorkerConsoleData(this.#consoleDataOptions.serviceWorkerId);
        }
        else {
            page = this.#page;
            if (!page) {
                throw new Error(`Response must have an McpPage`);
            }
            messages = page.getConsoleData(this.#consoleDataOptions.includePreservedMessages);
        }
        if (this.#consoleDataOptions.types?.length) {
            const normalizedTypes = new Set(this.#consoleDataOptions.types);
            messages = messages.filter(message => {
                if ('type' in message) {
                    return normalizedTypes.has(message.type());
                }
                if (message instanceof DevTools.AggregatedIssue) {
                    return normalizedTypes.has('issue');
                }
                return normalizedTypes.has('error');
            });
        }
        return (await Promise.all(messages.map(async (item) => {
            const consoleMessageStableId = this.getConsoleMessageStableId(item);
            if ('args' in item || item instanceof UncaughtError) {
                const consoleMessage = item;
                return await ConsoleFormatter.from(consoleMessage, {
                    id: consoleMessageStableId,
                    fetchDetailedData: false,
                    fetchStackTrace: this.#consoleDataOptions?.includeStackTraces,
                    devTools: page ? page.devtoolsUniverse : undefined,
                });
            }
            if (item instanceof DevTools.AggregatedIssue) {
                const formatter = new IssueFormatter(item, {
                    id: consoleMessageStableId,
                });
                if (!formatter.isValid()) {
                    return null;
                }
                return formatter;
            }
            return null;
        }))).filter(item => item !== null);
    }
    async #handleNetworkRequestList(context) {
        if (!this.#networkRequestsOptions?.include) {
            return undefined;
        }
        if (!this.#page) {
            throw new Error(`Response must have an McpPage`);
        }
        let requests = this.#page.getNetworkRequests(this.#networkRequestsOptions?.includePreservedRequests);
        // Apply resource type filtering if specified
        if (this.#networkRequestsOptions.resourceTypes?.length) {
            const normalizedTypes = new Set(this.#networkRequestsOptions.resourceTypes);
            requests = requests.filter(request => {
                const type = request.resourceType();
                return normalizedTypes.has(type);
            });
        }
        return await Promise.all(requests.map(request => NetworkFormatter.from(request, {
            requestId: this.getNetworkRequestStableId(request),
            selectedInDevToolsUI: this.getNetworkRequestStableId(request) ===
                this.#networkRequestsOptions?.networkRequestIdInDevToolsUI,
            fetchData: false,
            saveFile: (data, filename, extension) => context.saveFile(data, filename, extension),
            redactNetworkHeaders: this.#redactNetworkHeaders,
        })));
    }
    async #handleComments() {
        const comments = this.#devToolsComments;
        if (!comments) {
            return undefined;
        }
        const page = this.#page;
        const initialSnapshot = page?.textSnapshot;
        const formatter = await CommentFormatter.from(comments, {
            resolveBackendNodeId: page
                ? (id) => page.resolveBackendNodeId(id)
                : undefined,
            resolveCdpRequestId: page
                ? (id) => page.resolveCdpRequestId(id)
                : undefined,
        });
        let commentsSnapshotRegenerated;
        if (page?.textSnapshot && page.textSnapshot !== initialSnapshot) {
            commentsSnapshotRegenerated = page.textSnapshot.verbose
                ? 'verbose'
                : 'standard';
        }
        return { formatter, commentsSnapshotRegenerated };
    }
    async handle(context, dataFormat = 'default') {
        if (this.#attachedWaitForResult?.openedPages && !this.#includePages) {
            await context.createPagesSnapshot();
        }
        const [snapshot, detailedNetworkRequest, detailedConsoleMessage, thirdPartyDeveloperTools, webmcpTools, consoleMessages, networkRequests, commentsResult,] = await Promise.all([
            this.#handleSnapshot(context),
            this.#handleAttachedNetworkRequest(context),
            this.#handleAttachedConsoleMessage(),
            this.#handleThirdPartyDevelopeTools(),
            this.#handleWebMCP(),
            this.#handleConsoleList(context),
            this.#handleNetworkRequestList(context),
            this.#handleComments(),
        ]);
        if (this.#includeExtensionServiceWorkers) {
            context.createWorkersSnapshot();
        }
        let extensions;
        if (this.#listExtensions) {
            extensions = await context.listExtensions();
        }
        return await this.format(context, {
            detailedConsoleMessage,
            consoleMessages,
            snapshot,
            detailedNetworkRequest,
            networkRequests,
            traceInsight: this.#attachedTraceInsight,
            traceSummary: this.#attachedTraceSummary,
            extensions,
            lighthouseResult: this.#attachedLighthouseResult,
            thirdPartyDeveloperTools,
            webmcpTools,
            comments: commentsResult?.formatter,
            commentsSnapshotRegenerated: commentsResult?.commentsSnapshotRegenerated,
            errorMessage: this.#error?.message,
        }, dataFormat);
    }
    getConsoleMessageStableId(message) {
        return message[stableIdSymbol] ?? -1;
    }
    getNetworkRequestStableId(request) {
        return request[stableIdSymbol] ?? -1;
    }
    async format(context, data, dataFormat = 'default') {
        const structuredContent = {};
        // Resolve the compact encoder based on the chosen format
        let compactEncode;
        if (dataFormat === 'toon') {
            try {
                compactEncode = await getToonEncode();
            }
            catch {
                throw new Error('The `@toon-format/toon` package is required to use --experimentalDataFormat=toon. ' +
                    'Make sure the peer dependency is installed:\n' +
                    '- For npx: npx --package chrome-devtools-mcp@latest --package @toon-format/toon@latest chrome-devtools-mcp --experimentalDataFormat=toon\n' +
                    '- For npm: npm install @toon-format/toon (add -g if installed globally)');
            }
        }
        else if (dataFormat === 'gcf') {
            try {
                compactEncode = await getGcfEncode();
            }
            catch {
                throw new Error('The `@blackwell-systems/gcf` package is required to use --experimentalDataFormat=gcf. ' +
                    'Make sure the peer dependency is installed:\n' +
                    '- For npx: npx --package chrome-devtools-mcp@latest --package @blackwell-systems/gcf@latest chrome-devtools-mcp --experimentalDataFormat=gcf\n' +
                    '- For npm: npm install @blackwell-systems/gcf (add -g if installed globally)');
            }
        }
        const response = [];
        if (this.#reconnectNotice) {
            structuredContent.reconnected = true;
            response.push(`Note: the browser was restarted or reconnected since the last call. Page ids have changed. Call ${listPages(this.#args).name} to see open pages.`);
        }
        if (this.#textResponseLines.length) {
            structuredContent.message = this.#textResponseLines.join('\n');
            response.push(...this.#textResponseLines);
        }
        if (this.#attachedWaitForResult) {
            if (this.#attachedWaitForResult.navigatedToUrl) {
                response.push(`Page navigated to ${this.#attachedWaitForResult.navigatedToUrl}.`);
                structuredContent.navigatedToUrl =
                    this.#attachedWaitForResult.navigatedToUrl;
            }
            if (this.#attachedWaitForResult.openedPages) {
                const openedPages = this.#attachedWaitForResult.openedPages;
                const openedMcpPages = context
                    .getPages()
                    .filter(mcpPage => openedPages.has(mcpPage.target));
                if (openedMcpPages.length) {
                    const targetInfos = await context.getTargetInfos();
                    response.push('## Opened pages');
                    const structuredPages = [];
                    for (const mcpPage of openedMcpPages) {
                        const page = formatPage(mcpPage, context, targetInfos.get(mcpPage.targetId));
                        response.push(page.text);
                        structuredPages.push(page.structured);
                    }
                    structuredContent.openedPages = structuredPages;
                }
            }
        }
        const page = this.#page;
        const networkConditions = page?.networkConditions;
        if (page && networkConditions) {
            const timeout = page.pptrPage.getDefaultNavigationTimeout();
            response.push(`Emulating network conditions: ${networkConditions}`);
            response.push(`Default navigation timeout set to ${timeout} ms`);
            structuredContent.networkConditions = networkConditions;
            structuredContent.navigationTimeout = timeout;
        }
        const geolocation = this.#page?.geolocation;
        if (geolocation) {
            response.push(`Emulating geolocation: latitude=${geolocation.latitude}, longitude=${geolocation.longitude}`);
            structuredContent.geolocation = geolocation;
        }
        const viewport = this.#page?.viewport;
        if (viewport) {
            response.push(`Emulating viewport: ${JSON.stringify(viewport)}`);
            structuredContent.viewport = viewport;
        }
        const userAgent = this.#page?.userAgent;
        if (userAgent) {
            response.push(`Emulating user agent: ${userAgent}`);
            structuredContent.userAgent = userAgent;
        }
        const cpuThrottlingRate = this.#page?.cpuThrottlingRate ?? 1;
        if (cpuThrottlingRate > 1) {
            response.push(`Emulating CPU throttling: ${cpuThrottlingRate}x slowdown`);
            structuredContent.cpuThrottlingRate = cpuThrottlingRate;
        }
        const colorScheme = this.#page?.colorScheme;
        if (colorScheme) {
            response.push(`Emulating color scheme: ${colorScheme}`);
            structuredContent.colorScheme = colorScheme;
        }
        const forcedColors = this.#page?.forcedColors;
        if (forcedColors) {
            response.push(`Emulating forced-colors: ${forcedColors}`);
            structuredContent.forcedColors = forcedColors;
        }
        const prefersContrast = this.#page?.prefersContrast;
        if (prefersContrast) {
            response.push(`Emulating prefers-contrast: ${prefersContrast}`);
            structuredContent.prefersContrast = prefersContrast;
        }
        const prefersReducedMotion = this.#page?.prefersReducedMotion;
        if (prefersReducedMotion) {
            response.push(`Emulating prefers-reduced-motion: ${prefersReducedMotion}`);
            structuredContent.prefersReducedMotion = prefersReducedMotion;
        }
        const dialog = this.#page?.getDialog();
        if (dialog) {
            const defaultValueIfNeeded = dialog.type() === 'prompt'
                ? ` (default value: "${dialog.defaultValue()}")`
                : '';
            response.push(`# Open dialog
${dialog.type()}: ${dialog.message()}${defaultValueIfNeeded}.
Call ${handleDialog(this.#args).name} to handle it before continuing.`);
            structuredContent.dialog = {
                type: dialog.type(),
                message: dialog.message(),
                defaultValue: dialog.defaultValue(),
            };
        }
        if (this.#includePages) {
            const allPages = context.getPages();
            const { regularPages, extensionPages } = allPages.reduce((acc, mcpPage) => {
                if (mcpPage.url().startsWith('chrome-extension://')) {
                    acc.extensionPages.push(mcpPage);
                }
                else {
                    acc.regularPages.push(mcpPage);
                }
                return acc;
            }, { regularPages: [], extensionPages: [] });
            const selectionFallback = context.getSelectedPageFallback();
            if (selectionFallback) {
                let selectedPageId;
                try {
                    selectedPageId = context.getSelectedMcpPage().id;
                }
                catch {
                    selectedPageId = undefined;
                }
                response.push(`Note: the previously selected page ${selectionFallback.wasClosed ? 'was closed' : 'is no longer listed'}.${selectedPageId !== undefined ? ` Page ${selectedPageId} is now selected.` : ''}`);
            }
            const targetInfos = regularPages.length ||
                (this.#includeExtensionPages && extensionPages.length)
                ? await context.getTargetInfos()
                : new Map();
            if (regularPages.length) {
                const parts = [`## Pages`];
                const structuredPages = [];
                for (const mcpPage of regularPages) {
                    const isolatedContextName = mcpPage.isolatedContextName;
                    const contextLabel = isolatedContextName
                        ? ` isolatedContext=${isolatedContextName}`
                        : '';
                    const page = formatPage(mcpPage, context, targetInfos.get(mcpPage.targetId));
                    parts.push(`${page.text}${context.isPageSelected(mcpPage) ? ' [selected]' : ''}${contextLabel}`);
                    structuredPages.push(page.structured);
                }
                response.push(...parts);
                structuredContent.pages = structuredPages;
            }
            if (this.#includeExtensionPages) {
                if (extensionPages.length) {
                    response.push(`## Extension Pages`);
                    const structuredExtensionPages = [];
                    for (const mcpPage of extensionPages) {
                        const isolatedContextName = mcpPage.isolatedContextName;
                        const contextLabel = isolatedContextName
                            ? ` isolatedContext=${isolatedContextName}`
                            : '';
                        const page = formatPage(mcpPage, context, targetInfos.get(mcpPage.targetId));
                        response.push(`${page.text}${context.isPageSelected(mcpPage) ? ' [selected]' : ''}${contextLabel}`);
                        structuredExtensionPages.push(page.structured);
                    }
                    structuredContent.extensionPages = structuredExtensionPages;
                }
            }
        }
        if (this.#includeExtensionServiceWorkers) {
            const extensionServiceWorkers = context
                .getWorkers()
                .filter(worker => worker.type === 'service_worker');
            if (extensionServiceWorkers.length) {
                response.push(`## Extension Service Workers`);
            }
            for (const extensionServiceWorker of extensionServiceWorkers) {
                response.push(`${extensionServiceWorker.id}: ${extensionServiceWorker.url}`);
            }
            structuredContent.extensionServiceWorkers = extensionServiceWorkers.map(extensionServiceWorker => {
                return {
                    id: extensionServiceWorker.id,
                    url: extensionServiceWorker.url,
                };
            });
        }
        if (this.#tabId) {
            structuredContent.tabId = this.#tabId;
        }
        if (data.traceSummary) {
            const summary = getTraceSummary(data.traceSummary, this.#deviceScope);
            response.push(summary);
            structuredContent.traceSummary = summary;
            structuredContent.traceInsights = [];
            for (const insightSet of data.traceSummary.insights?.values() ?? []) {
                for (const [insightName, model] of Object.entries(insightSet.model)) {
                    structuredContent.traceInsights.push({
                        insightName,
                        insightKey: typeof model === 'object' &&
                            model !== null &&
                            'insightKey' in model
                            ? model.insightKey
                            : undefined,
                    });
                }
            }
        }
        if (data.traceInsight) {
            const insightOutput = getInsightOutput(data.traceInsight.trace, data.traceInsight.insightSetId, data.traceInsight.insightName, this.#deviceScope);
            if ('error' in insightOutput) {
                response.push(insightOutput.error);
            }
            else {
                response.push(insightOutput.output);
            }
        }
        if (data.lighthouseResult) {
            structuredContent.lighthouseResult = data.lighthouseResult;
            const { summary, failedAudits, reports } = data.lighthouseResult;
            response.push('## Lighthouse audit results');
            response.push(`Mode: ${summary.mode}`);
            response.push(`Device: ${summary.device}`);
            response.push(`URL: ${summary.url}`);
            response.push('### Category scores');
            for (const score of summary.scores) {
                // Lighthouse uses a null score for categories that could not be
                // scored and renders scores as Math.round(score * 100).
                const formattedScore = score.score === null ? 'n/a' : Math.round(score.score * 100);
                response.push(`- ${score.title}: ${formattedScore} (${score.id})`);
            }
            response.push('### Audit summary');
            response.push(`Passed: ${summary.audits.passed}`);
            response.push(`Failed: ${summary.audits.failed}`);
            response.push(`Total timing: ${summary.timing.total}ms`);
            if (failedAudits.length) {
                response.push('### Failed audits');
                for (const audit of failedAudits) {
                    const categories = audit.categories.length
                        ? ` [${audit.categories.join(', ')}]`
                        : '';
                    const displayValue = audit.displayValue
                        ? ` (${audit.displayValue})`
                        : '';
                    response.push(`- ${audit.id}${categories}: ${audit.title}${displayValue} (score: ${audit.score})`);
                    if (audit.description) {
                        response.push(`  ${collapseWhitespace(audit.description)}`);
                    }
                    if (audit.totalNodes) {
                        const shown = audit.totalNodes > audit.nodes.length
                            ? `, showing ${audit.nodes.length}`
                            : '';
                        response.push(`  Nodes (${audit.totalNodes}${shown}):`);
                    }
                    for (const node of audit.nodes) {
                        // Values are JSON-encoded so that quotes or spaces within them
                        // cannot be confused with the `key=value` delimiters.
                        const parts = [];
                        if (node.selector) {
                            parts.push(`selector=${JSON.stringify(node.selector)}`);
                        }
                        if (node.nodeLabel) {
                            parts.push(`label=${JSON.stringify(collapseWhitespace(node.nodeLabel))}`);
                        }
                        if (node.snippet) {
                            parts.push(`snippet=${JSON.stringify(collapseWhitespace(node.snippet))}`);
                        }
                        response.push(`  - ${parts.join(' ')}`);
                        if (node.explanation) {
                            response.push(`    ${collapseWhitespace(node.explanation)}`);
                        }
                    }
                }
            }
            response.push('### Reports');
            for (const report of reports) {
                response.push(`- ${report}`);
            }
        }
        if (data.snapshot) {
            if (typeof data.snapshot === 'string') {
                response.push(`Saved snapshot to ${data.snapshot}.`);
                structuredContent.snapshotFilePath = data.snapshot;
            }
            else {
                structuredContent.snapshot = data.snapshot.toJSON();
                response.push('## Latest page snapshot');
                response.push(compactEncode
                    ? compactEncode(structuredContent.snapshot)
                    : data.snapshot.toString());
            }
        }
        if (this.#heapSnapshotOptions?.include) {
            response.push('## Heap Snapshot Data');
            const formatOptions = this.#heapSnapshotOptions.formatOptions ?? {};
            const stats = this.#heapSnapshotOptions.stats;
            const staticData = this.#heapSnapshotOptions.staticData;
            if (stats) {
                response.push(`Statistics: ${JSON.stringify(stats, null, 2)}`);
                structuredContent.heapSnapshot = structuredContent.heapSnapshot || {};
                structuredContent.heapSnapshot.stats = stats;
            }
            if (staticData) {
                response.push(`Static Data: ${JSON.stringify(staticData, null, 2)}`);
                structuredContent.heapSnapshot = structuredContent.heapSnapshot || {};
                structuredContent.heapSnapshot.staticData = staticData;
            }
            const nativeContextSizes = this.#heapSnapshotOptions.nativeContextSizes;
            if (nativeContextSizes) {
                response.push('### Native Contexts');
                response.push(HeapSnapshotFormatter.formatNativeContextSizes(nativeContextSizes, formatOptions));
                structuredContent.heapSnapshot = structuredContent.heapSnapshot || {};
                structuredContent.heapSnapshot.nativeContextSizes = nativeContextSizes;
            }
            const retainedByContextSummary = this.#heapSnapshotOptions.retainedByContextSummary;
            if (retainedByContextSummary) {
                response.push('### Retained by Context Summary');
                response.push(HeapSnapshotFormatter.formatRetainedByContextSummary(retainedByContextSummary));
                structuredContent.heapSnapshot = structuredContent.heapSnapshot || {};
                structuredContent.heapSnapshot.retainedByContextSummary =
                    retainedByContextSummary;
            }
            const aggregateData = this.#heapSnapshotOptions.aggregateData;
            if (aggregateData) {
                const paginationData = this.#dataWithPagination(aggregateData.aggregates, this.#heapSnapshotOptions.pagination);
                response.push(`Objects: ${aggregateData.objectCount}`);
                response.push(`Total shallow size: ${formatBytesToKb(aggregateData.totalSelfSize)}`);
                structuredContent.heapSnapshot = structuredContent.heapSnapshot || {};
                structuredContent.heapSnapshot.aggregateStats = {
                    objectCount: aggregateData.objectCount,
                    totalSelfSize: aggregateData.totalSelfSize,
                };
                structuredContent.pagination = paginationData.pagination;
                response.push(...paginationData.info);
                structuredContent.heapSnapshotAggregates = paginationData.items;
                response.push(compactEncode
                    ? compactEncode(paginationData.items.map(aggregate => ({
                        ...aggregate,
                        className: formatName(aggregate.className, formatOptions),
                    })))
                    : HeapSnapshotFormatter.formatAggregates(paginationData.items, formatOptions));
            }
            const nodes = this.#heapSnapshotOptions.nodes;
            if (nodes) {
                let items = Array.from(nodes.items);
                const firstItem = nodes.items[0];
                if (firstItem) {
                    if (isNodeLike(firstItem)) {
                        items = items
                            .filter(isNodeLike)
                            .sort((a, b) => b.retainedSize - a.retainedSize);
                    }
                    else if (isEdgeLike(firstItem)) {
                        items = items.filter(isEdgeLike);
                    }
                }
                const paginationData = this.#dataWithPagination(items, this.#heapSnapshotOptions.pagination);
                response.push(HeapSnapshotFormatter.formatNodes(paginationData.items, formatOptions));
                structuredContent.pagination = paginationData.pagination;
                response.push(...paginationData.info);
                structuredContent.heapSnapshotNodes = paginationData.items;
            }
            const retainingPaths = this.#heapSnapshotOptions.retainingPaths;
            if (retainingPaths) {
                response.push('### Retaining Paths');
                const { paths, limitsReached } = retainingPaths;
                if (paths.length === 0) {
                    response.push('No retaining paths found.');
                }
                else {
                    response.push(HeapSnapshotFormatter.formatRetainingPaths(paths, formatOptions));
                }
                const reached = Object.entries(limitsReached)
                    .filter(([, hit]) => hit)
                    .map(([limit]) => limit);
                if (reached.length > 0) {
                    response.push(`Note: results are truncated, the following limits were reached: ${reached.join(', ')}.`);
                }
                structuredContent.heapSnapshotRetainingPaths =
                    retainingPaths;
            }
            const dominators = this.#heapSnapshotOptions.dominators;
            if (dominators) {
                response.push('### Dominator Chain');
                if (dominators.length === 0) {
                    response.push('No dominators found.');
                }
                else {
                    response.push(HeapSnapshotFormatter.formatDominators(dominators, formatOptions));
                }
                structuredContent.heapSnapshotDominators = dominators;
            }
            const diff = this.#heapSnapshotOptions.diff;
            if (diff) {
                response.push('### Heap Snapshot Diff');
                response.push(HeapSnapshotFormatter.formatDiffTotals(diff.totals));
                structuredContent.heapSnapshot = structuredContent.heapSnapshot || {};
                structuredContent.heapSnapshot.classDiffStats = diff.totals;
                const paginationData = this.#dataWithPagination(diff.classDiffs, this.#heapSnapshotOptions.pagination);
                structuredContent.pagination = paginationData.pagination;
                response.push(...paginationData.info);
                response.push(compactEncode
                    ? compactEncode(paginationData.items.map(diff => ({
                        ...diff,
                        className: formatName(diff.className, formatOptions),
                    })))
                    : HeapSnapshotFormatter.formatDiffSummary(paginationData.items, formatOptions));
                structuredContent.heapSnapshotClassDiffs = paginationData.items;
            }
            const detailedClassDiff = this.#heapSnapshotOptions.detailedClassDiff;
            if (detailedClassDiff) {
                response.push('### Heap Snapshot Detailed Diff');
                response.push(compactEncode
                    ? compactEncode({
                        ...detailedClassDiff,
                        className: formatName(detailedClassDiff.className, formatOptions),
                    })
                    : HeapSnapshotFormatter.formatDiffDetails(detailedClassDiff, formatOptions));
                structuredContent.heapSnapshotDetailedClassDiff = detailedClassDiff;
            }
            const duplicateStrings = this.#heapSnapshotOptions.duplicateStrings;
            if (duplicateStrings) {
                response.push('### Duplicate Strings');
                const paginationData = this.#dataWithPagination(duplicateStrings, this.#heapSnapshotOptions.pagination);
                structuredContent.pagination = paginationData.pagination;
                response.push(...paginationData.info);
                const formatted = HeapSnapshotFormatter.formatDuplicateStrings(paginationData.items, formatOptions);
                response.push(formatted);
                structuredContent.heapSnapshotDuplicateStrings = paginationData.items;
            }
            const objectInfo = this.#heapSnapshotOptions.objectInfo;
            if (objectInfo) {
                response.push('### Object Details');
                if (compactEncode) {
                    response.push(compactEncode({
                        ...objectInfo,
                        name: formatName(objectInfo.name, formatOptions),
                    }));
                }
                else {
                    response.push(HeapSnapshotFormatter.formatObjectInfo(objectInfo, formatOptions));
                }
                structuredContent.heapSnapshotObjectDetails = objectInfo;
            }
            const contextAnalysis = this.#heapSnapshotOptions.contextAnalysis;
            if (contextAnalysis) {
                const contextAnalysisOptions = this.#heapSnapshotOptions.contextAnalysisOptions;
                const rankedContexts = collectRankedContexts(contextAnalysis, {
                    retainedSize: contextAnalysisOptions?.retainedSize,
                    scopeInfoNodeId: contextAnalysisOptions?.scopeInfoNodeId,
                });
                const paginationData = this.#dataWithPagination(rankedContexts, {
                    pageIdx: contextAnalysisOptions?.pageIdx ?? 0,
                    pageSize: contextAnalysisOptions?.pageSize,
                });
                const report = {
                    contexts: paginationData.items,
                    scriptsWithoutScopes: contextAnalysis.scriptsWithoutScopes,
                };
                response.push('### Context Analysis');
                structuredContent.pagination = paginationData.pagination;
                response.push(...paginationData.info);
                response.push(compactEncode
                    ? compactEncode(report)
                    : HeapSnapshotFormatter.formatContextAnalysis(report, formatOptions));
                structuredContent.heapSnapshotContextAnalysis = report;
            }
        }
        if (data.detailedNetworkRequest) {
            response.push(data.detailedNetworkRequest.toStringDetailed());
            structuredContent.networkRequest =
                data.detailedNetworkRequest.toJSONDetailed();
        }
        if (data.detailedConsoleMessage) {
            response.push(data.detailedConsoleMessage.toStringDetailed());
            structuredContent.consoleMessage =
                data.detailedConsoleMessage.toJSONDetailed();
        }
        if (data.extensions) {
            const extensionArray = Array.from(data.extensions.values());
            structuredContent.extensions = extensionArray;
            response.push('## Extensions');
            if (extensionArray.length === 0) {
                response.push('No extensions installed.');
            }
            else {
                const extensionsMessage = extensionArray
                    .map(extension => {
                    return `id=${extension.id} "${extension.name}" v${extension.version} ${extension.enabled ? 'Enabled' : 'Disabled'}`;
                })
                    .join('\n');
                response.push(extensionsMessage);
            }
        }
        const thirdPartyDeveloperTools = data.thirdPartyDeveloperTools;
        if (thirdPartyDeveloperTools?.length) {
            structuredContent.thirdPartyDeveloperTools = thirdPartyDeveloperTools;
            response.push('## Third-party developer tools');
            for (const toolGroup of thirdPartyDeveloperTools) {
                response.push(`${toolGroup.name}: ${toolGroup.description}`);
                response.push('Available tools:');
                const toolDefinitionsMessage = toolGroup.tools
                    .map(tool => {
                    return `name="${tool.name}", description="${tool.description}", inputSchema=${JSON.stringify(tool.inputSchema)}`;
                })
                    .join('\n');
                response.push(toolDefinitionsMessage);
            }
        }
        if (this.#listWebMcpTools && data.webmcpTools) {
            structuredContent.webmcpTools = data.webmcpTools.map(({ name, description, inputSchema, annotations }) => ({
                name,
                description,
                inputSchema,
                annotations,
            }));
            response.push('## WebMCP tools');
            if (data.webmcpTools.length === 0) {
                response.push('No WebMCP tools available.');
            }
            else {
                const webmcpToolsMessage = data.webmcpTools
                    .map(tool => {
                    return `name="${tool.name}", description="${tool.description}", inputSchema=${JSON.stringify(tool.inputSchema)}, annotations=${JSON.stringify(tool.annotations)}`;
                })
                    .join('\n');
                response.push(webmcpToolsMessage);
            }
        }
        if (this.#networkRequestsOptions?.include && data.networkRequests) {
            const requests = data.networkRequests;
            response.push('## Network requests');
            if (requests.length) {
                const paginationData = this.#dataWithPagination(requests, this.#networkRequestsOptions.pagination);
                structuredContent.pagination = paginationData.pagination;
                response.push(...paginationData.info);
                if (data.networkRequests) {
                    structuredContent.networkRequests = paginationData.items.map(i => i.toJSON());
                    response.push(...(compactEncode
                        ? [compactEncode(structuredContent.networkRequests)]
                        : paginationData.items.map(i => i.toString())));
                }
            }
            else {
                response.push('No requests found.');
            }
        }
        if (this.#consoleDataOptions?.include) {
            const messages = data.consoleMessages ?? [];
            response.push('## Console messages');
            if (messages.length) {
                const grouped = ConsoleFormatter.groupConsecutive(messages);
                const paginationData = this.#dataWithPagination(grouped, this.#consoleDataOptions.pagination);
                structuredContent.pagination = paginationData.pagination;
                structuredContent.consoleMessages = paginationData.items.map(item => item.toJSON());
                response.push(...paginationData.info);
                if (compactEncode) {
                    response.push(compactEncode(structuredContent.consoleMessages));
                }
                else {
                    response.push(...paginationData.items.map(item => item.toString()));
                }
                if (structuredContent.consoleMessages.some(message => 'stackTrace' in message)) {
                    response.push('Note: stack trace line and column numbers use 1-based indexing');
                }
            }
            else {
                response.push('<no console messages found>');
            }
        }
        if (data.comments) {
            const commentsJson = data.comments.toJSON();
            structuredContent.comments = commentsJson;
            response.push(compactEncode ? compactEncode(commentsJson) : data.comments.toString());
            if (data.commentsSnapshotRegenerated) {
                response.push(`Note: DevTools comments regenerated the ${data.commentsSnapshotRegenerated} text snapshot.`);
                structuredContent.commentsSnapshotRegenerated =
                    data.commentsSnapshotRegenerated;
            }
        }
        if (this.#cssStylesData) {
            const resolveUid = (backendNodeId) => this.#page?.textSnapshot?.resolveCdpElementId(backendNodeId);
            const containerDetails = await resolveContainerQueries(this.#cssStylesData.matchedStyles, resolveUid);
            const options = {
                ...this.#cssStylesData.options,
                resolveUid,
                containerDetails,
            };
            const allRules = CssFormatter.collectRules(this.#cssStylesData.matchedStyles, options);
            let rules = allRules;
            const hasPagination = this.#cssStylesData.options.pageSize !== undefined ||
                this.#cssStylesData.options.pageIdx !== undefined;
            if (hasPagination) {
                const paginationData = this.#dataWithPagination(allRules, this.#cssStylesData.options);
                structuredContent.pagination = paginationData.pagination;
                response.push(...paginationData.info);
                rules = paginationData.items;
            }
            const formatter = new CssFormatter(this.#cssStylesData.matchedStyles, options, rules);
            structuredContent.matchedStyles = formatter.toJSON();
            if (compactEncode) {
                response.push(compactEncode(structuredContent.matchedStyles));
            }
            else {
                response.push(formatter.toString());
            }
        }
        if (data.errorMessage) {
            response.push(`Error: ${data.errorMessage}`);
            structuredContent.errorMessage = data.errorMessage;
        }
        const text = {
            type: 'text',
            text: response.join('\n'),
        };
        const images = this.#images.map(imageData => {
            return {
                type: 'image',
                ...imageData,
            };
        });
        return {
            content: [text, ...images],
            structuredContent,
        };
    }
    #dataWithPagination(data, pagination) {
        const response = [];
        const paginationResult = paginate(data, pagination);
        if (paginationResult.invalidPage) {
            response.push('Invalid page number provided. Showing first page.');
        }
        const { startIndex, endIndex, currentPage, totalPages } = paginationResult;
        const displayStartIndex = data.length === 0 ? 0 : startIndex + 1;
        response.push(`Showing ${displayStartIndex}-${endIndex} of ${data.length} (Page ${currentPage + 1} of ${totalPages}).`);
        if (pagination) {
            if (paginationResult.hasNextPage) {
                response.push(`Next page: ${currentPage + 1}`);
            }
            if (paginationResult.hasPreviousPage) {
                response.push(`Previous page: ${currentPage - 1}`);
            }
        }
        return {
            info: response,
            items: paginationResult.items,
            pagination: {
                currentPage: paginationResult.currentPage,
                totalPages: paginationResult.totalPages,
                hasNextPage: paginationResult.hasNextPage,
                hasPreviousPage: paginationResult.hasPreviousPage,
                startIndex: paginationResult.startIndex,
                endIndex: paginationResult.endIndex,
                invalidPage: paginationResult.invalidPage,
            },
        };
    }
    resetResponseLineForTesting() {
        this.#textResponseLines = [];
    }
}
function truncateTitle(title, maxLength = 50) {
    if (title.length <= maxLength) {
        return title;
    }
    return title.slice(0, maxLength - 3) + '...';
}
const collapseWhitespace = (value) => {
    return value.replace(/\s+/g, ' ').trim();
};
function formatPage(mcpPage, context, targetInfo) {
    const title = mcpPage.getTitle(targetInfo);
    const url = mcpPage.url();
    const pageLabel = title ? `${truncateTitle(title)} (${url})` : url;
    return {
        text: `${mcpPage.id}: ${pageLabel}`,
        structured: createStructuredPage(mcpPage, context, title),
    };
}
function createStructuredPage(mcpPage, context, rawTitle) {
    const isolatedContextName = mcpPage.isolatedContextName;
    const title = truncateTitle(rawTitle);
    const entry = {
        id: mcpPage.id,
        url: mcpPage.url(),
        title,
        selected: context.isPageSelected(mcpPage),
    };
    if (isolatedContextName) {
        entry.isolatedContext = isolatedContextName;
    }
    return entry;
}
//# sourceMappingURL=McpResponse.js.map