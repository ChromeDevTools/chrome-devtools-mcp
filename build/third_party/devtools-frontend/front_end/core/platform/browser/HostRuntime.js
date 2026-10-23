// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
class WebWorkerScope {
    postMessage(message, transfer) {
        // Type for frame.postMessage is conflicting here.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        // Cap the height to not hit the GPU limit.
        // https://crbug.com/1260828
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
    /* eslint-disable-next-line @devtools/no-imperative-dom-api */
    const link = document.createElement('a');
    link.download = options.fileName + '.png';
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const blobUrl = URL.createObjectURL(blob);
    lastScreenshotBlobUrl = blobUrl;
    link.href = blobUrl;
    link.click();
}
async function copyScreenshot(options) {
    const response = await fetch('data:image/png;base64,' + options.base64Png);
    const blob = await response.blob();
    await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
    ]);
}
let cssEvaluationElement = null;
export const HOST_RUNTIME = {
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
    copyScreenshot,
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
//# sourceMappingURL=HostRuntime.js.map