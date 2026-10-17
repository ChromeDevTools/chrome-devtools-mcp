// Copyright 2017 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { OverlayModel } from './OverlayModel.js';
import { SDKModel } from './SDKModel.js';
/**
 * Manages concurrent screencast requests by queuing and prioritizing.
 *
 * When startScreencast is invoked:
 * - If a screencast is currently active, the existing screencast's parameters and callbacks are
 * saved in the #screencastOperations array.
 * - The active screencast is then stopped.
 * - A new screencast is initiated using the parameters and callbacks from the current startScreencast call.
 *
 * When stopScreencast is invoked:
 * - The currently active screencast is stopped.
 * - The #screencastOperations is checked for interrupted screencast operations.
 * - If any operations are found, the latest one is started
 * using its saved parameters and callbacks.
 *
 * This ensures that:
 * - Only one screencast is active at a time.
 * - Interrupted screencasts are resumed after the current screencast is stopped.
 * This ensures animation previews, which use screencasting, don't disrupt ongoing remote debugging sessions. Without this mechanism, stopping a preview screencast would terminate the debugging screencast, freezing the ScreencastView.
 **/
export class ScreenCaptureModel extends SDKModel {
    #agent;
    #nextScreencastOperationId = 1;
    #screencastOperations = [];
    constructor(target) {
        super(target);
        this.#agent = target.pageAgent();
        target.registerPageDispatcher(this);
    }
    async startScreencast(format, quality, maxWidth, maxHeight, everyNthFrame, onFrame, onVisibilityChanged) {
        const currentRequest = this.#screencastOperations.at(-1);
        if (currentRequest) {
            // If there already is a screencast operation in progress, we need to stop it now and handle the
            // incoming request. Once that request is stopped, we'll return back to handling the stopped operation.
            await this.#agent.invoke_stopScreencast();
        }
        const operation = {
            id: this.#nextScreencastOperationId++,
            request: {
                format,
                quality,
                maxWidth,
                maxHeight,
                everyNthFrame,
            },
            callbacks: {
                onScreencastFrame: onFrame,
                onScreencastVisibilityChanged: onVisibilityChanged,
            },
        };
        this.#screencastOperations.push(operation);
        void this.#agent.invoke_startScreencast({ format, quality, maxWidth, maxHeight, everyNthFrame });
        return operation.id;
    }
    stopScreencast(id) {
        const operationToStop = this.#screencastOperations.pop();
        if (!operationToStop) {
            throw new Error('There is no screencast operation to stop.');
        }
        if (operationToStop.id !== id) {
            throw new Error('Trying to stop a screencast operation that is not being served right now.');
        }
        void this.#agent.invoke_stopScreencast();
        // The latest operation is concluded, let's return back to the previous request now, if it exists.
        const nextOperation = this.#screencastOperations.at(-1);
        if (nextOperation) {
            void this.#agent.invoke_startScreencast({
                format: nextOperation.request.format,
                quality: nextOperation.request.quality,
                maxWidth: nextOperation.request.maxWidth,
                maxHeight: nextOperation.request.maxHeight,
                everyNthFrame: nextOperation.request.everyNthFrame,
            });
        }
    }
    async captureScreenshot(format, quality, mode, clip) {
        const properties = {
            format,
            quality,
            fromSurface: true,
        };
        switch (mode) {
            case "fromClip" /* ScreenshotMode.FROM_CLIP */:
                properties.captureBeyondViewport = true;
                properties.clip = clip;
                break;
            case "fullpage" /* ScreenshotMode.FULLPAGE */:
                properties.captureBeyondViewport = true;
                break;
            case "fromViewport" /* ScreenshotMode.FROM_VIEWPORT */:
                properties.captureBeyondViewport = false;
                break;
            default:
                throw new Error('Unexpected or unspecified screnshotMode');
        }
        await OverlayModel.muteHighlight(this.target().targetManager());
        const result = await this.#agent.invoke_captureScreenshot(properties);
        await OverlayModel.unmuteHighlight(this.target().targetManager());
        return result.data;
    }
    screencastFrame({ data, metadata, sessionId }) {
        void this.#agent.invoke_screencastFrameAck({ sessionId });
        const currentRequest = this.#screencastOperations.at(-1);
        if (currentRequest) {
            currentRequest.callbacks.onScreencastFrame.call(null, data, metadata);
        }
    }
    screencastVisibilityChanged({ visible }) {
        const currentRequest = this.#screencastOperations.at(-1);
        if (currentRequest) {
            currentRequest.callbacks.onScreencastVisibilityChanged.call(null, visible);
        }
    }
    backForwardCacheNotUsed(_params) {
    }
    domContentEventFired(_params) {
    }
    loadEventFired(_params) {
    }
    lifecycleEvent(_params) {
    }
    navigatedWithinDocument(_params) {
    }
    frameAttached(_params) {
    }
    frameNavigated(_params) {
    }
    documentOpened(_params) {
    }
    frameDetached(_params) {
    }
    frameStartedLoading(_params) {
    }
    frameStoppedLoading(_params) {
    }
    frameRequestedNavigation(_params) {
    }
    frameStartedNavigating(_params) {
    }
    frameSubtreeWillBeDetached(_params) {
    }
    frameScheduledNavigation(_params) {
    }
    frameClearedScheduledNavigation(_params) {
    }
    frameResized() {
    }
    javascriptDialogOpening(_params) {
    }
    javascriptDialogClosed(_params) {
    }
    interstitialShown() {
    }
    interstitialHidden() {
    }
    windowOpen(_params) {
    }
    fileChooserOpened(_params) {
    }
    compilationCacheProduced(_params) {
    }
    downloadWillBegin(_params) {
    }
    downloadProgress() {
    }
    prefetchStatusUpdated(_params) {
    }
    prerenderStatusUpdated(_params) {
    }
}
SDKModel.register(ScreenCaptureModel, { capabilities: 64 /* Capability.SCREEN_CAPTURE */, autostart: false });
//# sourceMappingURL=ScreenCaptureModel.js.map