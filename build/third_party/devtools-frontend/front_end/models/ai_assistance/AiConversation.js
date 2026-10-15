import * as Host from '../../core/host/host.js';
import * as Platform from '../../core/platform/platform.js';
import * as Root from '../../core/root/root.js';
import * as SDK from '../../core/sdk/sdk.js';
import { AccessibilityAgent } from './agents/AccessibilityAgent.js';
import { ContextSelectionAgent } from './agents/ContextSelectionAgent.js';
import { FileAgent } from './agents/FileAgent.js';
import { NetworkAgent } from './agents/NetworkAgent.js';
import { PerformanceAgent } from './agents/PerformanceAgent.js';
import { StorageAgent } from './agents/StorageAgent.js';
import { StylingAgent } from './agents/StylingAgent.js';
import { AiAgent2 } from './AiAgent2.js';
import { AiHistoryStorage } from './AiHistoryStorage.js';
import { isContextSelectionEnabled } from './AiUtils.js';
import { DOMNodeContext } from './contexts/DOMNodeContext.js';
import { FileContext } from './contexts/FileContext.js';
import { LighthouseContext } from './contexts/LighthouseContext.js';
import { PerformanceTraceContext } from './contexts/PerformanceTraceContext.js';
import { RequestContext } from './contexts/RequestContext.js';
import { StorageContext } from './contexts/StorageContext.js';
import { ToolRegistry } from './tools/ToolRegistry.js';
export const NOT_FOUND_IMAGE_DATA = '';
export const CONTEXT_TITLE = 'Analyzing data';
const MAX_TITLE_LENGTH = 80;
/**
 * Page URL prefixes permitted during an AI agent run.
 * Agents trigger these navigations internally:
 * - `about:blank`: Used before recording a performance trace to ensure a clean state.
 * - `chrome://terms`: Used by Lighthouse during Back-Forward Cache audits.
 */
export const ALLOWED_PAGE_NAVIGATIONS = [
    Platform.DevToolsPath.urlString `about:blank`,
    Platform.DevToolsPath.urlString `chrome://terms`,
];
export function generateContextDetailsMarkdown(details) {
    const detailsMarkdown = [];
    for (const detail of details) {
        const text = `\`\`\`\`${detail.codeLang || ''}\n${detail.text.trim()}\n\`\`\`\``;
        detailsMarkdown.push(`**${detail.title}:**\n${text}`);
    }
    return detailsMarkdown.join('\n\n');
}
export class AiConversation {
    static fromSerializedConversation(serializedConversation) {
        const history = serializedConversation.history.map(entry => {
            if (entry.type === "side-effect" /* ResponseType.SIDE_EFFECT */) {
                return { ...entry, confirm: () => { } };
            }
            return entry;
        });
        return new AiConversation({
            type: serializedConversation.type,
            data: history,
            id: serializedConversation.id,
            isReadOnly: true,
        });
    }
    id;
    // Handled in #updateAgent
    #type;
    // Handled in #updateAgent
    #agent;
    #isReadOnly;
    history;
    #aidaClient;
    #changeManager;
    #origin;
    #navigationOccurredDuringRun = false;
    #contexts = [];
    #performanceRecordAndReload;
    #lighthouseRecording;
    #onInspectElement;
    #networkTimeCalculator;
    #aiHistoryStorage;
    #targetManager;
    constructor(options) {
        const { type, data = [], id = crypto.randomUUID(), isReadOnly = true, aidaClient = new Host.AidaClient.AidaClient(), changeManager, performanceRecordAndReload, onInspectElement, networkTimeCalculator, lighthouseRecording, aiHistoryStorage = AiHistoryStorage.instance(), 
        // eslint-disable-next-line @devtools/no-instance-of-migrated-singletons
        targetManager = SDK.TargetManager.TargetManager.instance(), } = options;
        this.#changeManager = changeManager;
        this.#aidaClient = aidaClient;
        this.#performanceRecordAndReload = performanceRecordAndReload;
        this.#onInspectElement = onInspectElement;
        this.#networkTimeCalculator = networkTimeCalculator;
        this.#lighthouseRecording = lighthouseRecording;
        this.#aiHistoryStorage = aiHistoryStorage;
        this.#targetManager = targetManager;
        this.id = id;
        this.#isReadOnly = isReadOnly;
        this.history = this.#reconstructHistory(data);
        // Needs to be last
        this.#updateAgent(type);
    }
    get isReadOnly() {
        return this.#isReadOnly;
    }
    static titleForSerialized(serialized) {
        const query = serialized.history.find(item => item.type === "user-query" /* ResponseType.USER_QUERY */)?.query;
        if (!query) {
            return undefined;
        }
        return AiConversation.title(query);
    }
    static title(query) {
        return `${query.substring(0, MAX_TITLE_LENGTH)}${query.length > MAX_TITLE_LENGTH ? '…' : ''}`;
    }
    get title() {
        const query = this.history.find(response => response.type === "user-query" /* ResponseType.USER_QUERY */)?.query;
        if (!query) {
            return;
        }
        return AiConversation.title(query);
    }
    get isEmpty() {
        return this.history.length === 0;
    }
    #setOriginIfEmpty(newOrigin) {
        if (!this.#origin) {
            this.#origin = newOrigin;
        }
    }
    setContext(updateContext) {
        if (!updateContext) {
            this.#contexts = [];
            if (isContextSelectionEnabled()) {
                this.#updateAgent("none" /* ConversationType.NONE */);
            }
            return;
        }
        this.#contexts = [updateContext];
        if (isContextSelectionEnabled()) {
            if (updateContext instanceof FileContext) {
                this.#updateAgent("drjones-file" /* ConversationType.FILE */);
            }
            else if (updateContext instanceof DOMNodeContext) {
                this.#updateAgent("freestyler" /* ConversationType.STYLING */);
            }
            else if (updateContext instanceof RequestContext) {
                this.#updateAgent("drjones-network-request" /* ConversationType.NETWORK */);
            }
            else if (updateContext instanceof PerformanceTraceContext) {
                this.#updateAgent("drjones-performance-full" /* ConversationType.PERFORMANCE */);
            }
            else if (updateContext instanceof LighthouseContext) {
                this.#updateAgent("accessibility" /* ConversationType.ACCESSIBILITY */);
            }
            else if (updateContext instanceof StorageContext) {
                this.#updateAgent("storage" /* ConversationType.STORAGE */);
            }
        }
    }
    get selectedContext() {
        return this.#contexts.at(0);
    }
    #reconstructHistory(historyWithoutImages) {
        const imageHistory = this.#aiHistoryStorage.getImageHistory();
        if (imageHistory && imageHistory.length > 0) {
            const history = [];
            for (const data of historyWithoutImages) {
                if (data.type === "user-query" /* ResponseType.USER_QUERY */ && data.imageId) {
                    const image = imageHistory.find(item => item.id === data.imageId);
                    const inlineData = image ? { data: image.data, mimeType: image.mimeType } :
                        { data: NOT_FOUND_IMAGE_DATA, mimeType: 'image/jpeg' };
                    history.push({ ...data, imageInput: { inlineData } });
                }
                else {
                    history.push(data);
                }
            }
            return history;
        }
        return historyWithoutImages;
    }
    getConversationMarkdown() {
        const contentParts = [];
        contentParts.push('# Exported Chat from Chrome DevTools AI Assistance\n\n' +
            `**Export Timestamp (UTC):** ${new Date().toISOString()}\n\n` +
            '---');
        for (const item of this.history) {
            switch (item.type) {
                case "user-query" /* ResponseType.USER_QUERY */: {
                    contentParts.push(`## User\n\n${item.query}`);
                    if (item.imageInput) {
                        contentParts.push('User attached an image');
                    }
                    contentParts.push('## AI');
                    break;
                }
                case "context" /* ResponseType.CONTEXT */: {
                    contentParts.push(`### ${CONTEXT_TITLE}`);
                    if (item.details && item.details.length > 0) {
                        contentParts.push(generateContextDetailsMarkdown(item.details));
                    }
                    break;
                }
                case "title" /* ResponseType.TITLE */: {
                    contentParts.push(`### ${item.title}`);
                    break;
                }
                case "thought" /* ResponseType.THOUGHT */: {
                    contentParts.push(`${item.thought}`);
                    break;
                }
                case "action" /* ResponseType.ACTION */: {
                    // We want to export only actions with output field
                    if (!item.output) {
                        break;
                    }
                    if (item.code) {
                        contentParts.push(`**Code executed:**\n\`\`\`\n${item.code.trim()}\n\`\`\``);
                    }
                    contentParts.push(`**Data returned:**\n\`\`\`\n${item.output}\n\`\`\``);
                    break;
                }
                case "answer" /* ResponseType.ANSWER */: {
                    if (item.complete) {
                        contentParts.push(`### Answer\n\n${item.text.trim()}`);
                    }
                    break;
                }
            }
        }
        return contentParts.join('\n\n');
    }
    archiveConversation() {
        this.#isReadOnly = true;
    }
    async addHistoryItem(item) {
        this.history.push(item);
        await this.#aiHistoryStorage.upsertHistoryEntry(this.serialize());
        if (item.type === "user-query" /* ResponseType.USER_QUERY */) {
            void this.#aiHistoryStorage.addRecentPrompt(item.query);
            if (item.imageId && item.imageInput && 'inlineData' in item.imageInput) {
                const inlineData = item.imageInput.inlineData;
                await this.#aiHistoryStorage.upsertImage({
                    id: item.imageId,
                    data: inlineData.data,
                    mimeType: inlineData.mimeType,
                });
            }
        }
    }
    serialize() {
        return {
            id: this.id,
            history: this.history
                .map(item => {
                switch (item.type) {
                    case "context-change" /* ResponseType.CONTEXT_CHANGE */: {
                        return null;
                    }
                    case "user-query" /* ResponseType.USER_QUERY */: {
                        return { ...item, imageInput: undefined };
                    }
                    case "side-effect" /* ResponseType.SIDE_EFFECT */: {
                        return { ...item, confirm: undefined };
                    }
                    case "context" /* ResponseType.CONTEXT */: {
                        return { ...item, widgets: undefined };
                    }
                    case "action" /* ResponseType.ACTION */: {
                        const tool = item.toolName ? ToolRegistry.get(item.toolName) : undefined;
                        const shouldRedact = tool?.annotations?.includes("redact-from-history" /* ToolAnnotation.REDACT_FROM_HISTORY */);
                        return {
                            ...item,
                            output: shouldRedact ? '<redacted>' : item.output,
                            widgets: undefined,
                        };
                    }
                    default:
                        return item;
                }
            })
                .filter(history => !!history),
            type: this.#type,
        };
    }
    #filterHistoryForNewAgent() {
        return this.#agent?.history
            .map(content => {
            return {
                ...content,
                parts: content.parts.filter(part => !('functionCall' in part) && !('functionResponse' in part)),
            };
        })
            .filter(content => content.parts.length > 0) ??
            [];
    }
    #updateAgent(type) {
        if (this.#type === type) {
            return;
        }
        const previousType = this.#type;
        this.#type = type;
        // In AI Architecture V2, DevTools uses a single unified agent (AiAgent2) that
        // dynamically loads skills on demand. Reusing the existing agent instance across
        // context changes preserves its loaded activeSkills and declared tools so the model
        // does not need to re-learn skills it already acquired earlier in the conversation.
        if (Root.Runtime.hostConfig.devToolsAiV2Architecture?.enabled && this.#agent instanceof AiAgent2) {
            return;
        }
        // In legacy V1 architecture, agents are recreated when switching conversation types.
        // Discard conversation history when transitioning away from Storage to prevent
        // sensitive data (e.g. cookies or storage items) from leaking into subsequent agent queries.
        const isTransitioningFromStorage = previousType === "storage" /* ConversationType.STORAGE */ && type !== "storage" /* ConversationType.STORAGE */;
        const history = isTransitioningFromStorage ? [] : this.#filterHistoryForNewAgent();
        const baseOptions = {
            aidaClient: this.#aidaClient,
            serverSideLoggingAllowed: isAiAssistanceServerSideLoggingAllowed(),
            sessionId: this.id,
            changeManager: this.#changeManager,
            performanceRecordAndReload: this.#performanceRecordAndReload,
            onInspectElement: this.#onInspectElement,
            networkTimeCalculator: this.#networkTimeCalculator,
            lighthouseRecording: this.#lighthouseRecording,
            history,
            targetManager: this.#targetManager,
        };
        this.#agent = Root.Runtime.hostConfig.devToolsAiV2Architecture?.enabled ? new AiAgent2({
            ...baseOptions,
            originLock: this.getOriginLock,
        }) :
            this.#createV1Agent(type, {
                ...baseOptions,
                allowedOrigin: this.allowedOrigin,
            });
    }
    #createV1Agent(type, options) {
        switch (type) {
            case "freestyler" /* ConversationType.STYLING */:
                return new StylingAgent(options);
            case "drjones-network-request" /* ConversationType.NETWORK */:
                return new NetworkAgent(options);
            case "drjones-file" /* ConversationType.FILE */:
                return new FileAgent(options);
            case "drjones-performance-full" /* ConversationType.PERFORMANCE */:
                return new PerformanceAgent(options);
            case "accessibility" /* ConversationType.ACCESSIBILITY */:
                return new AccessibilityAgent(options);
            case "storage" /* ConversationType.STORAGE */:
                return new StorageAgent(options);
            case "none" /* ConversationType.NONE */:
                return new ContextSelectionAgent(options);
            default:
                Platform.assertNever(type, 'Unknown conversation type');
        }
    }
    async *run(initialQuery, options = {}) {
        this.#navigationOccurredDuringRun = false;
        const originAtRunStart = this.#origin ?? getPrimaryPageSecurityOrigin(this.#targetManager);
        const listener = (event) => {
            // Prevent the agent from executing tools or reading data from an untrusted origin
            // if the page navigates unexpectedly during execution.
            const frame = event.data.frame;
            if (frame.resourceTreeModel().target() !== this.#targetManager.primaryPageTarget()) {
                return;
            }
            const newOrigin = frame.securityOrigin();
            const newInspectedURL = frame.url;
            const isSameOrigin = Boolean(originAtRunStart && newOrigin && originAtRunStart.isSameOriginWith(newOrigin));
            const isAllowedNavigation = Boolean(newInspectedURL && ALLOWED_PAGE_NAVIGATIONS.some(allowed => newInspectedURL.startsWith(allowed)));
            if (!isSameOrigin && !isAllowedNavigation) {
                this.#navigationOccurredDuringRun = true;
            }
        };
        const targetManager = this.#targetManager;
        targetManager.addModelListener(SDK.ResourceTreeModel.ResourceTreeModel, SDK.ResourceTreeModel.Events.PrimaryPageChanged, listener, this);
        try {
            if (this.isBlockedByOrigin) {
                // This error should not be reached. If it happens, some
                // invariants do not hold anymore.
                throw new Error('cross-origin context data should not be included');
            }
            yield* this.#runAgent(initialQuery, options, { isInitialCall: true });
        }
        finally {
            targetManager.removeModelListener(SDK.ResourceTreeModel.ResourceTreeModel, SDK.ResourceTreeModel.Events.PrimaryPageChanged, listener, this);
        }
    }
    #getQueryAfterSelection(initialQuery, selection) {
        return `${selection}\nOriginal user query: ${initialQuery}`;
    }
    async *#runAgent(initialQuery, options = {}, runOptions = {}) {
        this.#setOriginIfEmpty(this.selectedContext?.getOrigin());
        if (this.isBlockedByOrigin) {
            yield {
                type: "error" /* ResponseType.ERROR */,
                error: "cross-origin" /* ErrorType.CROSS_ORIGIN */,
            };
            return;
        }
        if (runOptions.isInitialCall) {
            const userQuery = {
                type: "user-query" /* ResponseType.USER_QUERY */,
                query: initialQuery,
                imageInput: options.multimodalInput?.input,
                imageId: options.multimodalInput?.id,
            };
            void this.addHistoryItem(userQuery);
            yield userQuery;
        }
        function shouldAddToHistory(data) {
            if (data.type === "context-change" /* ResponseType.CONTEXT_CHANGE */) {
                return false;
            }
            // We don't want to save partial responses to the conversation history.
            // TODO(crbug.com/463325400): We should save interleaved answers to the history as well.
            if (data.type === "answer" /* ResponseType.ANSWER */ && !data.complete) {
                return false;
            }
            return true;
        }
        for await (const data of this.#agent.run(initialQuery, {
            signal: options.signal,
            selected: this.selectedContext ?? null,
        }, options.multimodalInput)) {
            // Add to history if relevant
            if (shouldAddToHistory(data)) {
                void this.addHistoryItem(data);
            }
            // Always yield the data
            yield data;
            // If we change the context
            // requery with the specialized agent.
            if (data.type === "context-change" /* ResponseType.CONTEXT_CHANGE */) {
                this.setContext(data.context);
                yield* this.#runAgent(this.#getQueryAfterSelection(initialQuery, data.description), options, { isInitialCall: false });
                return;
            }
        }
    }
    /**
     * Indicates whether the new conversation context is blocked due to cross-origin restrictions.
     * This happens when the conversation's context has a different
     * origin than the selected context.
     */
    get isBlockedByOrigin() {
        return !this.#contexts.every(context => context.isOriginAllowed(this.#origin));
    }
    get origin() {
        return this.#origin;
    }
    get type() {
        return this.#type;
    }
    /**
     * Returns the conversation's origin-locking state:
     * - `BLOCKED_BY_NAVIGATION`: An unapproved cross-origin navigation occurred during the active run.
     * - `ESTABLISHED_ORIGIN`: The conversation is locked to the established origin.
     * - `UNINITIALIZED`: No origin lock has been established yet.
     */
    getOriginLock = () => {
        if (this.#navigationOccurredDuringRun) {
            return { status: 'BLOCKED_BY_NAVIGATION' };
        }
        if (this.#origin) {
            return { status: 'ESTABLISHED_ORIGIN', origin: this.#origin };
        }
        const pageOrigin = getPrimaryPageSecurityOrigin(this.#targetManager);
        if (pageOrigin) {
            this.#origin = pageOrigin;
            return { status: 'ESTABLISHED_ORIGIN', origin: this.#origin };
        }
        return { status: 'UNINITIALIZED' };
    };
    /**
     * Returns the permitted origin for legacy V1 agent tool execution.
     * Maps the OriginLockState to the AllowedOriginResult format expected by V1 agents.
     */
    allowedOrigin = () => {
        const lock = this.getOriginLock();
        if (lock.status === 'BLOCKED_BY_NAVIGATION') {
            return { blocked: true };
        }
        if (lock.status === 'ESTABLISHED_ORIGIN') {
            return { origin: lock.origin };
        }
        return { origin: undefined };
    };
}
/**
 * Checks whether server-side logging is allowed by the global system policy.
 * Note that even if this returns true, individual agents can still dynamically
 * deactivate/activate logging during their execution (e.g., when handling
 * sensitive tools).
 */
function isAiAssistanceServerSideLoggingAllowed() {
    return !Root.Runtime.hostConfig.aidaAvailability?.disallowLogging;
}
/**
 * Returns the security origin of the primary page target.
 *
 * Resolves the canonical SecurityOrigin from the main frame, falling back to
 * the inspected URL as a last resort in test environments where no frame exists.
 *
 * @param targetManager Target manager used to locate the primary page target.
 * @returns The parsed SecurityOrigin, or undefined if no target or inspected URL exists.
 */
function getPrimaryPageSecurityOrigin(targetManager) {
    const target = targetManager.primaryPageTarget();
    const frameOrigin = target?.model(SDK.ResourceTreeModel.ResourceTreeModel)?.mainFrame?.securityOrigin();
    if (frameOrigin) {
        return frameOrigin;
    }
    const inspectedURL = target?.inspectedURL();
    return inspectedURL ? SDK.SecurityOrigin.SecurityOrigin.create(inspectedURL) : undefined;
}
//# sourceMappingURL=AiConversation.js.map