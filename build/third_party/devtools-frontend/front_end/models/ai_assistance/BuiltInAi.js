// Copyright 2025 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../../core/common/common.js';
import * as Host from '../../core/host/host.js';
import * as Root from '../../core/root/root.js';
export class BuiltInAi extends Common.ObjectWrapper.ObjectWrapper {
    #availability = null;
    #hasGpu;
    #consoleInsightsSession;
    initDoneForTesting;
    #downloadProgress = null;
    #currentlyCreatingSession = false;
    static instance() {
        if (!Root.DevToolsContext.globalInstance().has(BuiltInAi)) {
            Root.DevToolsContext.globalInstance().set(BuiltInAi, new BuiltInAi());
        }
        return Root.DevToolsContext.globalInstance().get(BuiltInAi);
    }
    constructor() {
        super();
        this.#hasGpu = this.#isGpuAvailable();
        this.initDoneForTesting =
            this.getLanguageModelAvailability().then(() => this.#sendAvailabilityMetrics()).then(() => this.initialize());
    }
    async getLanguageModelAvailability() {
        if (!Root.Runtime.hostConfig.devToolsConsoleInsightsTeasers?.enabled) {
            this.#availability = "disabled" /* LanguageModelAvailability.DISABLED */;
            return this.#availability;
        }
        try {
            // @ts-expect-error
            this.#availability = await window.LanguageModel.availability({
                expectedInputs: [{
                        type: 'text',
                        languages: ['en'],
                    }],
                expectedOutputs: [{
                        type: 'text',
                        languages: ['en'],
                    }],
            });
        }
        catch {
            this.#availability = "unavailable" /* LanguageModelAvailability.UNAVAILABLE */;
        }
        return this.#availability;
    }
    isDownloading() {
        return this.#availability === "downloading" /* LanguageModelAvailability.DOWNLOADING */;
    }
    isEventuallyAvailable() {
        if (!this.#hasGpu && !Boolean(Root.Runtime.hostConfig.devToolsConsoleInsightsTeasers?.allowWithoutGpu)) {
            return false;
        }
        return this.#availability === "available" /* LanguageModelAvailability.AVAILABLE */ ||
            this.#availability === "downloading" /* LanguageModelAvailability.DOWNLOADING */ ||
            this.#availability === "downloadable" /* LanguageModelAvailability.DOWNLOADABLE */;
    }
    #setDownloadProgress(newValue) {
        this.#downloadProgress = newValue;
        this.dispatchEventToListeners("downloadProgressChanged" /* Events.DOWNLOAD_PROGRESS_CHANGED */, this.#downloadProgress);
    }
    getDownloadProgress() {
        return this.#downloadProgress;
    }
    startDownloadingModel() {
        if (!Root.Runtime.hostConfig.devToolsConsoleInsightsTeasers?.allowWithoutGpu && !this.#hasGpu) {
            return;
        }
        if (this.#availability !== "downloadable" /* LanguageModelAvailability.DOWNLOADABLE */) {
            return;
        }
        void this.#createSession();
        // Without the timeout, the returned availability would still be `downloadable`
        setTimeout(() => {
            void this.getLanguageModelAvailability();
        }, 1000);
    }
    #isGpuAvailable() {
        // In node-based API tests, there is no global `document` available. Since this
        // class is instantiated during Universe bootstrapping, we need to guard against
        // using document when not in the browser.
        if (typeof document === 'undefined') {
            return false;
        }
        const canvas = document.createElement('canvas');
        try {
            const webgl = canvas.getContext('webgl');
            if (!webgl) {
                return false;
            }
            const debugInfo = webgl.getExtension('WEBGL_debug_renderer_info');
            if (!debugInfo) {
                return false;
            }
            const renderer = webgl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
            if (renderer.includes('SwiftShader')) {
                return false;
            }
        }
        catch {
            return false;
        }
        return true;
    }
    hasSession() {
        return Boolean(this.#consoleInsightsSession);
    }
    async initialize() {
        if (!Root.Runtime.hostConfig.devToolsConsoleInsightsTeasers?.allowWithoutGpu && !this.#hasGpu) {
            return;
        }
        if (this.#availability !== "available" /* LanguageModelAvailability.AVAILABLE */ &&
            this.#availability !== "downloading" /* LanguageModelAvailability.DOWNLOADING */) {
            return;
        }
        await this.#createSession();
    }
    async #createSession() {
        if (this.#currentlyCreatingSession) {
            return;
        }
        this.#currentlyCreatingSession = true;
        const monitor = (m) => {
            m.addEventListener('downloadprogress', ((e) => {
                this.#setDownloadProgress(e.loaded);
            }));
        };
        try {
            // @ts-expect-error
            this.#consoleInsightsSession = await window.LanguageModel.create({
                monitor,
                initialPrompts: [{
                        role: 'system',
                        content: `
You are an expert web developer. Your goal is to help a human web developer who
is using Chrome DevTools to debug a web site or web app. The Chrome DevTools
console is showing a message which is either an error or a warning. Please help
the user understand the problematic console message.

Your instructions are as follows:
  - Explain the reason why the error or warning is showing up.
  - The explanation has a maximum length of 200 characters. Anything beyond this
    length will be cut off. Make sure that your explanation is at most 200 characters long.
  - Your explanation should not end in the middle of a sentence.
  - Your explanation should consist of a single paragraph only. Do not include any
    headings or code blocks. Only write a single paragraph of text.
  - Your response should be concise and to the point. Avoid lengthy explanations
    or unnecessary details.
          `,
                    }],
                expectedInputs: [{
                        type: 'text',
                        languages: ['en'],
                    }],
                expectedOutputs: [{
                        type: 'text',
                        languages: ['en'],
                    }],
            });
            if (this.#availability !== "available" /* LanguageModelAvailability.AVAILABLE */) {
                this.dispatchEventToListeners("downloadedAndSessionCreated" /* Events.DOWNLOADED_AND_SESSION_CREATED */);
                void this.getLanguageModelAvailability();
            }
        }
        catch (e) {
            console.error('Error when creating LanguageModel session', e.message);
        }
        this.#currentlyCreatingSession = false;
    }
    static removeInstance() {
        Root.DevToolsContext.globalInstance().delete(BuiltInAi);
    }
    async *getConsoleInsight(prompt, abortController) {
        if (!this.#consoleInsightsSession) {
            return;
        }
        // Clone the session to start a fresh conversation for each answer. Otherwise
        // previous dialog would pollute the context resulting in worse answers.
        let session = null;
        try {
            session = await this.#consoleInsightsSession.clone();
            const stream = session.promptStreaming(prompt, {
                signal: abortController.signal,
            });
            for await (const chunk of stream) {
                yield chunk;
            }
        }
        finally {
            if (session) {
                session.destroy();
            }
        }
    }
    #sendAvailabilityMetrics() {
        if (this.#hasGpu) {
            switch (this.#availability) {
                case "unavailable" /* LanguageModelAvailability.UNAVAILABLE */:
                    Host.userMetrics.builtInAiAvailability(Host.UserMetrics.BuiltInAiAvailability.UNAVAILABLE_HAS_GPU);
                    break;
                case "downloadable" /* LanguageModelAvailability.DOWNLOADABLE */:
                    Host.userMetrics.builtInAiAvailability(Host.UserMetrics.BuiltInAiAvailability.DOWNLOADABLE_HAS_GPU);
                    break;
                case "downloading" /* LanguageModelAvailability.DOWNLOADING */:
                    Host.userMetrics.builtInAiAvailability(Host.UserMetrics.BuiltInAiAvailability.DOWNLOADING_HAS_GPU);
                    break;
                case "available" /* LanguageModelAvailability.AVAILABLE */:
                    Host.userMetrics.builtInAiAvailability(Host.UserMetrics.BuiltInAiAvailability.AVAILABLE_HAS_GPU);
                    break;
                case "disabled" /* LanguageModelAvailability.DISABLED */:
                    Host.userMetrics.builtInAiAvailability(Host.UserMetrics.BuiltInAiAvailability.DISABLED_HAS_GPU);
                    break;
            }
        }
        else {
            switch (this.#availability) {
                case "unavailable" /* LanguageModelAvailability.UNAVAILABLE */:
                    Host.userMetrics.builtInAiAvailability(Host.UserMetrics.BuiltInAiAvailability.UNAVAILABLE_NO_GPU);
                    break;
                case "downloadable" /* LanguageModelAvailability.DOWNLOADABLE */:
                    Host.userMetrics.builtInAiAvailability(Host.UserMetrics.BuiltInAiAvailability.DOWNLOADABLE_NO_GPU);
                    break;
                case "downloading" /* LanguageModelAvailability.DOWNLOADING */:
                    Host.userMetrics.builtInAiAvailability(Host.UserMetrics.BuiltInAiAvailability.DOWNLOADING_NO_GPU);
                    break;
                case "available" /* LanguageModelAvailability.AVAILABLE */:
                    Host.userMetrics.builtInAiAvailability(Host.UserMetrics.BuiltInAiAvailability.AVAILABLE_NO_GPU);
                    break;
                case "disabled" /* LanguageModelAvailability.DISABLED */:
                    Host.userMetrics.builtInAiAvailability(Host.UserMetrics.BuiltInAiAvailability.DISABLED_NO_GPU);
                    break;
            }
        }
    }
}
//# sourceMappingURL=BuiltInAi.js.map