// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as Host from '../../core/host/host.js';
import * as SDK from '../../core/sdk/sdk.js';
export var Events;
(function (Events) {
    Events["COMMENT_THREADS_CHANGED"] = "CommentThreadsChanged";
})(Events || (Events = {}));
/**
 * Headless model bridge connecting DevTools comments subsystem to CD4A.
 * Provides serialization, transmission state tracking, and element reveal capabilities.
 */
export class CD4ABridge extends Common.ObjectWrapper.ObjectWrapper {
    #commentManager;
    #targetManager;
    #networkLog;
    #inspectorFrontendHost;
    #eventListeners;
    constructor(commentManager, targetManager, networkLog, inspectorFrontendHost = Host.InspectorFrontendHost.InspectorFrontendHostInstance) {
        super();
        this.#commentManager = commentManager;
        this.#targetManager = targetManager;
        this.#networkLog = networkLog;
        this.#inspectorFrontendHost = inspectorFrontendHost;
        this.#eventListeners = [
            this.#commentManager.addEventListener("CommentThreadsChanged" /* CommentManager.Events.COMMENT_THREADS_CHANGED */, () => {
                this.dispatchEventToListeners("CommentThreadsChanged" /* Events.COMMENT_THREADS_CHANGED */);
            }),
        ];
    }
    dispose() {
        Common.EventTarget.removeEventListeners(this.#eventListeners);
    }
    #getDOMNode(nodeSignature) {
        if (!this.#targetManager) {
            return undefined;
        }
        const target = this.#targetManager.targetById(nodeSignature.targetId);
        const domModel = target?.model(SDK.DOMModel.DOMModel);
        if (!domModel) {
            return undefined;
        }
        for (const node of domModel.idToDOMNode.values()) {
            if (node.backendNodeId() === nodeSignature.backendNodeId) {
                return node;
            }
        }
        return undefined;
    }
    #formatCommentText(thread) {
        const rawText = thread.comments[0]?.text ?? '';
        const details = [];
        if (thread.anchor.vePath) {
            details.push(`- DevTools VEPath: ${thread.anchor.vePath}`);
        }
        if (thread.anchor.textSignature) {
            details.push(`- DevTools element: ${thread.anchor.textSignature}`);
        }
        if (thread.anchor.node) {
            const domNode = this.#getDOMNode(thread.anchor.node);
            const simpleSelector = domNode?.simpleSelector();
            if (simpleSelector) {
                details.push(`- DOM node selector: ${simpleSelector}`);
            }
        }
        if (thread.anchor.editor) {
            const editorInfo = thread.anchor.editor.filePath ?
                `${thread.anchor.editor.filePath}:${thread.anchor.editor.lineNumber}` :
                `line ${thread.anchor.editor.lineNumber}`;
            details.push(`- Editor: ${editorInfo}`);
        }
        if (details.length === 0) {
            return rawText;
        }
        return rawText ? `${rawText}\n\n${details.join('\n')}` : details.join('\n');
    }
    getCommentThreads() {
        const threads = this.#commentManager.takeComments();
        return threads.map(thread => {
            const threadPayload = {
                id: thread.id,
                text: this.#formatCommentText(thread),
            };
            if (thread.anchor.networkRequestId) {
                threadPayload.networkRequestId = thread.anchor.networkRequestId;
            }
            if (thread.anchor.node) {
                threadPayload.node = { ...thread.anchor.node };
            }
            return threadPayload;
        });
    }
    setAgentAttached(value) {
        this.#commentManager.setAgentAttached(value);
    }
    resolveCommentThread(threadId, replyText) {
        return this.#commentManager.resolveCommentThread(threadId, replyText);
    }
    async reveal(panelName, target) {
        if (panelName) {
            this.#inspectorFrontendHost.events.dispatchEventToListeners(Host.InspectorFrontendHostAPI.Events.ShowPanel, panelName);
        }
        if (target?.networkRequestId && this.#networkLog) {
            const [request] = this.#networkLog.requestsForId(target.networkRequestId);
            if (request) {
                await Common.Revealer.reveal(request);
            }
        }
        if (target?.node && this.#targetManager) {
            const sdkTarget = this.#targetManager.targetById(target.node.targetId);
            const domModel = sdkTarget?.model(SDK.DOMModel.DOMModel);
            if (domModel) {
                const cdpNodeId = target.node.backendNodeId;
                const nodeMap = await domModel.pushNodesByBackendIdsToFrontend(new Set([cdpNodeId]));
                const node = nodeMap?.get(cdpNodeId);
                if (node) {
                    await Common.Revealer.reveal(node);
                }
            }
        }
    }
}
//# sourceMappingURL=CD4ABridge.js.map