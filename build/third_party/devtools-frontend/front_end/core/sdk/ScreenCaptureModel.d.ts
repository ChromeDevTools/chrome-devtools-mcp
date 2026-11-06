import type * as ProtocolProxyApi from '../../generated/protocol-proxy-api.js';
import type * as Protocol from '../../generated/protocol.js';
import { SDKModel } from './SDKModel.js';
import { type Target } from './Target.js';
export declare const enum ScreenshotMode {
    FROM_VIEWPORT = "fromViewport",
    FROM_CLIP = "fromClip",
    FULLPAGE = "fullpage"
}
type ScreencastFrameCallback = ((arg0: Protocol.binary, arg1: Protocol.Page.ScreencastFrameMetadata) => void);
type ScreencastVisibilityChangedCallback = ((arg0: boolean) => void);
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
export declare class ScreenCaptureModel extends SDKModel<void> implements ProtocolProxyApi.PageDispatcher {
    #private;
    constructor(target: Target);
    startScreencast(format: Protocol.Page.StartScreencastRequestFormat, quality: number, maxWidth: number | undefined, maxHeight: number | undefined, everyNthFrame: number | undefined, onFrame: ScreencastFrameCallback, onVisibilityChanged: ScreencastVisibilityChangedCallback): Promise<number>;
    stopScreencast(id: number): void;
    captureScreenshot(format: Protocol.Page.CaptureScreenshotRequestFormat, quality: number, mode: ScreenshotMode, clip?: Protocol.Page.Viewport): Promise<string | null>;
    screencastFrame({ data, metadata, sessionId }: Protocol.Page.ScreencastFrameEvent): void;
    screencastVisibilityChanged({ visible }: Protocol.Page.ScreencastVisibilityChangedEvent): void;
    backForwardCacheNotUsed(_params: Protocol.Page.BackForwardCacheNotUsedEvent): void;
    domContentEventFired(_params: Protocol.Page.DomContentEventFiredEvent): void;
    loadEventFired(_params: Protocol.Page.LoadEventFiredEvent): void;
    lifecycleEvent(_params: Protocol.Page.LifecycleEventEvent): void;
    navigatedWithinDocument(_params: Protocol.Page.NavigatedWithinDocumentEvent): void;
    frameAttached(_params: Protocol.Page.FrameAttachedEvent): void;
    frameNavigated(_params: Protocol.Page.FrameNavigatedEvent): void;
    documentOpened(_params: Protocol.Page.DocumentOpenedEvent): void;
    frameDetached(_params: Protocol.Page.FrameDetachedEvent): void;
    frameStartedLoading(_params: Protocol.Page.FrameStartedLoadingEvent): void;
    frameStoppedLoading(_params: Protocol.Page.FrameStoppedLoadingEvent): void;
    frameRequestedNavigation(_params: Protocol.Page.FrameRequestedNavigationEvent): void;
    frameStartedNavigating(_params: Protocol.Page.FrameStartedNavigatingEvent): void;
    frameSubtreeWillBeDetached(_params: Protocol.Page.FrameSubtreeWillBeDetachedEvent): void;
    frameScheduledNavigation(_params: Protocol.Page.FrameScheduledNavigationEvent): void;
    frameClearedScheduledNavigation(_params: Protocol.Page.FrameClearedScheduledNavigationEvent): void;
    frameResized(): void;
    javascriptDialogOpening(_params: Protocol.Page.JavascriptDialogOpeningEvent): void;
    javascriptDialogClosed(_params: Protocol.Page.JavascriptDialogClosedEvent): void;
    interstitialShown(): void;
    interstitialHidden(): void;
    windowOpen(_params: Protocol.Page.WindowOpenEvent): void;
    fileChooserOpened(_params: Protocol.Page.FileChooserOpenedEvent): void;
    compilationCacheProduced(_params: Protocol.Page.CompilationCacheProducedEvent): void;
    downloadWillBegin(_params: Protocol.Page.DownloadWillBeginEvent): void;
    downloadProgress(): void;
    prefetchStatusUpdated(_params: Protocol.Preload.PrefetchStatusUpdatedEvent): void;
    prerenderStatusUpdated(_params: Protocol.Preload.PrerenderStatusUpdatedEvent): void;
}
export {};
