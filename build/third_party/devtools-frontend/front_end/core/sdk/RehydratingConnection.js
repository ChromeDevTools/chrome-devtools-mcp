// Copyright 2024 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
import * as i18n from '../i18n/i18n.js';
import * as ProtocolClient from '../protocol_client/protocol_client.js';
import * as Root from '../root/root.js';
import * as EnhancedTraces from './EnhancedTracesParser.js';
import { TraceObject } from './TraceObject.js';
const UIStrings = {
    /**
     * @description Text that appears when no source text is available for the given script.
     */
    noSourceText: 'No source text available',
    /**
     * @description Text to indicate rehydrating connection cannot find host window.
     */
    noHostWindow: 'Can’t find host window',
    /**
     * @description Text to indicate that there is an error loading the log.
     */
    errorLoadingLog: 'Error loading log',
};
const str_ = i18n.i18n.registerUIStrings('core/sdk/RehydratingConnection.ts', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
/**
 * The `traceURL` (and legacy `loadTimelineFromURL`) query parameter is attacker-controllable, and its
 * fetched response is replayed into the trusted DevTools front-end as synthetic CDP events. Rather
 * than relying solely on the page-wide `connect-src` CSP, restrict fetches to trusted locations:
 *  - the same origin as the DevTools front-end,
 *  - the `devtools:` scheme (bundled resources),
 *  - a loopback address, the documented way to load a local trace while developing
 *    (see front_end/panels/timeline/README.md).
 */
export function isTraceUrlAllowed(traceUrl) {
    let url;
    try {
        url = new URL(traceUrl, window.location.href);
    }
    catch {
        return false;
    }
    if (url.protocol === 'devtools:') {
        return true;
    }
    if (url.origin === window.location.origin) {
        return true;
    }
    if (url.protocol === 'http:' || url.protocol === 'https:') {
        const host = url.hostname.toLowerCase();
        return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
    }
    return false;
}
export class RehydratingConnectionTransport {
    rehydratingConnectionState = 1 /* RehydratingConnectionState.UNINITIALIZED */;
    onDisconnect = null;
    onMessage = null;
    trace = null;
    sessions = new Map();
    /**
     * Set to the in-flight `traceURL` fetch (including its hydration/error handling) so tests can await
     * the load deterministically. Stays `undefined` when loading via message passing, or when a
     * disallowed URL is rejected without fetching.
     */
    fetchPromiseForTest;
    #onConnectionLost;
    #rehydratingWindow = window;
    #onReceiveHostWindowPayloadBound = this.onReceiveHostWindowPayload.bind(this);
    constructor(onConnectionLost) {
        this.#onConnectionLost = onConnectionLost;
        if (!this.#maybeHandleLoadingFromUrl()) {
            this.#setupMessagePassing();
        }
    }
    /** Returns true if found a trace URL. */
    #maybeHandleLoadingFromUrl() {
        let traceUrl = Root.Runtime.Runtime.queryParam('traceURL');
        if (!traceUrl) {
            // For compatibility, handle the older loadTimelineFromURL.
            const timelineUrl = Root.Runtime.Runtime.queryParam('loadTimelineFromURL');
            if (timelineUrl) {
                // It was double-URI encoded for some reason.
                traceUrl = decodeURIComponent(timelineUrl);
            }
        }
        if (traceUrl) {
            // `traceUrl` comes from the page query string and its response is replayed into the trusted
            // front-end as synthetic CDP events. Only fetch from trusted origins instead of relying on the
            // page CSP alone.
            if (!isTraceUrlAllowed(traceUrl)) {
                this.#onConnectionLost(i18nString(UIStrings.errorLoadingLog));
                return true;
            }
            this.fetchPromiseForTest = fetch(traceUrl)
                .then(r => r.arrayBuffer())
                .then(b => Common.Gzip.arrayBufferToString(b))
                .then(async (traceJson) => {
                const trace = new TraceObject(JSON.parse(traceJson));
                await this.startHydration(trace);
            })
                .catch(() => {
                this.#onConnectionLost(i18nString(UIStrings.errorLoadingLog));
            });
            return true;
        }
        return false;
    }
    #setupMessagePassing() {
        this.#rehydratingWindow.addEventListener('message', this.#onReceiveHostWindowPayloadBound);
        if (this.#rehydratingWindow.opener) {
            this.#rehydratingWindow.opener.postMessage({ type: 'REHYDRATING_WINDOW_READY' });
        }
        else if (this.#rehydratingWindow !== window.top) {
            this.#rehydratingWindow.parent.postMessage({ type: 'REHYDRATING_IFRAME_READY' }, '*');
        }
        else {
            this.#onConnectionLost(i18nString(UIStrings.noHostWindow));
        }
    }
    /**
     * This is a callback for rehydrated session to receive payload from host window. Payload includes but not limited to
     * the trace event and all necessary data to power a rehydrated session.
     */
    onReceiveHostWindowPayload(event) {
        if (event.data.type === 'REHYDRATING_TRACE_FILE') {
            const traceJson = event.data.traceJson;
            let trace;
            try {
                trace = new TraceObject(JSON.parse(traceJson));
            }
            catch {
                this.#onConnectionLost(i18nString(UIStrings.errorLoadingLog));
                return;
            }
            void this.startHydration(trace);
        }
        this.#rehydratingWindow.removeEventListener('message', this.#onReceiveHostWindowPayloadBound);
    }
    async startHydration(trace) {
        // OnMessage should've been set before hydration, and the connection should
        // be initialized and not hydrated already.
        if (!this.onMessage || this.rehydratingConnectionState !== 2 /* RehydratingConnectionState.INITIALIZED */) {
            return false;
        }
        if (!('traceEvents' in trace)) {
            console.error('RehydratingConnection failed to initialize due to missing trace events in payload');
            return false;
        }
        this.trace = trace;
        const enhancedTracesParser = new EnhancedTraces.EnhancedTracesParser(trace);
        const hydratingData = enhancedTracesParser.data();
        let sessionId = 0;
        // Set up default rehydrating session.
        this.sessions.set(sessionId, new RehydratingSessionBase(this));
        for (const hydratingDataPerTarget of hydratingData) {
            const target = hydratingDataPerTarget.target;
            const executionContexts = hydratingDataPerTarget.executionContexts;
            const scripts = hydratingDataPerTarget.scripts;
            const resources = hydratingDataPerTarget.resources;
            this.postToFrontend({
                method: 'Target.targetCreated',
                params: {
                    targetInfo: {
                        targetId: target.targetId,
                        type: target.type,
                        title: target.url,
                        url: target.url,
                        attached: false,
                        canAccessOpener: false,
                    },
                },
            });
            sessionId += 1;
            const session = new RehydratingSession(sessionId, target, executionContexts, scripts, resources, this);
            this.sessions.set(sessionId, session);
            session.declareSessionAttachedToTarget();
        }
        await this.#onRehydrated();
        return true;
    }
    async #onRehydrated() {
        if (!this.trace) {
            return;
        }
        this.rehydratingConnectionState = 3 /* RehydratingConnectionState.REHYDRATED */;
        // Use revealer to load trace into performance panel
        await Common.Revealer.reveal(this.trace);
    }
    setOnMessage(onMessage) {
        this.onMessage = onMessage;
        this.rehydratingConnectionState = 2 /* RehydratingConnectionState.INITIALIZED */;
    }
    setOnDisconnect(onDisconnect) {
        this.onDisconnect = onDisconnect;
    }
    // The function "sendRawMessage" is typically devtools front-end
    // sending message to the backend via CDP. In this case, given that Rehydrating
    // connection is an emulation of devtool back-end, sendRawMessage here
    // is in fact rehydrating connection directly handling and acting on the
    // receieved message.
    sendRawMessage(message) {
        if (typeof message === 'string') {
            message = JSON.parse(message);
        }
        const data = message;
        if (typeof data.sessionId !== 'undefined') {
            const session = this.sessions.get(data.sessionId);
            if (session) {
                session.handleFrontendMessageAsFakeCDPAgent(data);
            }
            else {
                console.error('Invalid SessionId: ' + data.sessionId);
            }
        }
        else {
            this.sessions.get(0)?.handleFrontendMessageAsFakeCDPAgent(data);
        }
    }
    // Posting rehydrating connection's message/response
    // to devtools frontend through debugger protocol.
    postToFrontend(arg) {
        if (this.onMessage) {
            this.onMessage(arg);
        }
        else {
            // onMessage should be set before the connection is rehydrated
            console.error('onMessage was not initialized');
        }
    }
    disconnect() {
        return Promise.reject();
    }
}
/** Default rehydrating session with default responses. **/
class RehydratingSessionBase {
    connection = null;
    constructor(connection) {
        this.connection = connection;
    }
    sendMessageToFrontend(payload) {
        // The frontend doesn't expect CDP responses within the same synchronous event loop, so it breaks unexpectedly.
        //  Any async boundary will do, so we use setTimeout.
        setTimeout(() => {
            this.connection?.postToFrontend(payload);
        });
    }
    handleFrontendMessageAsFakeCDPAgent(data) {
        // Send default response in default session.
        this.sendMessageToFrontend({
            id: data.id,
            result: {},
        });
    }
}
export class RehydratingSession extends RehydratingSessionBase {
    sessionId;
    target;
    executionContexts = [];
    scripts = [];
    resources = [];
    constructor(sessionId, target, executionContexts, scripts, resources, connection) {
        super(connection);
        this.sessionId = sessionId;
        this.target = target;
        this.executionContexts = executionContexts;
        this.scripts = scripts;
        this.resources = resources;
    }
    sendMessageToFrontend(payload, attachSessionId = true) {
        // Attach the session's Id to the message.
        if (this.sessionId !== 0 && attachSessionId) {
            payload.sessionId = this.sessionId;
        }
        super.sendMessageToFrontend(payload);
    }
    handleFrontendMessageAsFakeCDPAgent(data) {
        switch (data.method) {
            case 'Runtime.enable':
                this.handleRuntimeEnabled(data.id);
                break;
            case 'Debugger.enable':
                this.handleDebuggerEnable(data.id);
                break;
            case 'CSS.enable':
                this.sendMessageToFrontend({
                    id: data.id,
                    result: {},
                });
                break;
            case 'Debugger.getScriptSource':
                if (data.params) {
                    const params = data.params;
                    this.handleDebuggerGetScriptSource(data.id, params.scriptId);
                }
                break;
            case 'Page.getResourceTree':
                this.handleGetResourceTree(data.id);
                break;
            case 'Page.getResourceContent': {
                const request = data.params;
                this.handleGetResourceContent(request.frameId, request.url, data.id);
                break;
            }
            case 'CSS.getStyleSheetText': {
                const request = data.params;
                this.handleGetStyleSheetText(request.styleSheetId, data.id);
                break;
            }
            default:
                this.sendMessageToFrontend({
                    id: data.id,
                    error: {
                        message: `Command ${data.method} not implemented in RehydratingSession.`,
                        code: ProtocolClient.CDPConnection.CDPErrorStatus.DEVTOOLS_STUB_ERROR,
                    },
                });
                break;
        }
    }
    declareSessionAttachedToTarget() {
        this.sendMessageToFrontend({
            method: 'Target.attachedToTarget',
            params: {
                sessionId: this.sessionId,
                waitingForDebugger: false,
                targetInfo: {
                    targetId: this.target.targetId,
                    type: this.target.type,
                    title: this.target.url,
                    url: this.target.url,
                    attached: true,
                    canAccessOpener: false,
                },
            },
        }, 
        /* attachSessionId */ false);
    }
    // Runtime.Enable indicates that Runtime domain is flushing the event to communicate
    // the current state with the backend. In rehydrating connection, we made up the artificial
    // execution context to support the rehydrated session.
    handleRuntimeEnabled(id) {
        for (const executionContext of this.executionContexts) {
            executionContext.name = executionContext.origin;
            this.sendMessageToFrontend({
                method: 'Runtime.executionContextCreated',
                params: {
                    context: executionContext,
                },
            });
        }
        this.sendMessageToFrontend({
            id,
            result: {},
        });
    }
    handleDebuggerGetScriptSource(id, scriptId) {
        const script = this.scripts.find(script => script.scriptId === scriptId);
        if (!script) {
            console.error('No script for id: ' + scriptId);
            return;
        }
        this.sendMessageToFrontend({
            id,
            result: {
                scriptSource: typeof script.sourceText === 'undefined' ? i18nString(UIStrings.noSourceText) : script.sourceText,
            },
        });
    }
    // Debugger.Enable indicates that Debugger domain is flushing the event to communicate
    // the current state with the backend. In rehydrating connection, we made up the artificial
    // script parsed event to communicate the current script state and respond with a mock
    // debugger id.
    handleDebuggerEnable(id) {
        const htmlResourceUrls = new Set(this.resources.filter(r => r.mimeType === 'text/html').map(r => r.url));
        for (const script of this.scripts) {
            // Handle inline scripts.
            if (htmlResourceUrls.has(script.url)) {
                script.embedderName = script.url;
                // We don't have the actual embedded offset from this trace event. Non-zero
                // values are important though: that is what `Script.isInlineScript()`
                // checks. Otherwise these scripts would try to show individually within the
                // Sources panel.
                script.startColumn = 1;
                script.startLine = 1;
                script.endColumn = 1;
                script.endLine = 1;
            }
            this.sendMessageToFrontend({
                method: 'Debugger.scriptParsed',
                params: script,
            });
        }
        const mockDebuggerId = '7777777777777777777.8888888888888888888';
        this.sendMessageToFrontend({
            id,
            result: {
                debuggerId: mockDebuggerId,
            },
        });
    }
    handleGetResourceTree(id) {
        const resources = this.resources.filter(r => r.mimeType === 'text/html' || r.mimeType === 'text/css');
        if (!resources.length) {
            return;
        }
        const frameTree = {
            frame: {
                id: this.target.targetId,
                url: this.target.url,
            },
            childFrames: [],
            resources: resources.map(r => ({
                url: r.url,
                type: r.mimeType === 'text/html' ? 'Document' : 'Stylesheet',
                mimeType: r.mimeType,
                contentSize: r.content.length,
            })),
        };
        this.sendMessageToFrontend({
            id,
            result: {
                frameTree,
            },
        });
        const stylesheets = this.resources.filter(r => r.mimeType === 'text/css');
        for (const stylesheet of stylesheets) {
            this.sendMessageToFrontend({
                method: 'CSS.styleSheetAdded',
                params: {
                    header: {
                        styleSheetId: `sheet.${stylesheet.frame}.${stylesheet.url}`,
                        frameId: stylesheet.frame,
                        sourceURL: stylesheet.url,
                    },
                },
            });
        }
    }
    handleGetResourceContent(frame, url, id) {
        const resource = this.resources.find(r => r.frame === frame && r.url === url);
        if (!resource) {
            return;
        }
        this.sendMessageToFrontend({
            id,
            result: {
                content: resource.content,
                base64Encoded: false,
            },
        });
    }
    handleGetStyleSheetText(stylesheetId, id) {
        const resource = this.resources.find(r => `sheet.${r.frame}.${r.url}` === stylesheetId);
        if (!resource) {
            return;
        }
        this.sendMessageToFrontend({
            id,
            result: {
                text: resource.content,
            },
        });
    }
}
//# sourceMappingURL=RehydratingConnection.js.map