// Important: we purposefully treat `potentially_blocking` as
// non-render-blocking here because:
// 1. An async script can run on the main thread at any point, including before
//    the page is loaded
// 2. An async script will never block the parsing and rendering process of the
//    browser.
// 3. Therefore, from a developer's point of view, there is nothing more they
//    can do if they've put `async` on, and within the context of Insights, we
//    shouldn't report an async script as render-blocking.
// In the future we may want to consider suggesting the use of `defer` over
// `async`, as it doesn't have this concern, but for now we'll allow `async`
// and not report it as an issue.
const NON_RENDER_BLOCKING_VALUES = new Set([
    'non_blocking',
    'dynamically_injected_non_blocking',
    'potentially_blocking',
]);
export function isSyntheticNetworkRequestEventRenderBlocking(event) {
    return !NON_RENDER_BLOCKING_VALUES.has(event.args.data.renderBlocking);
}
const HIGH_NETWORK_PRIORITIES = new Set([
    "VeryHigh" /* Protocol.Network.ResourcePriority.VeryHigh */,
    "High" /* Protocol.Network.ResourcePriority.High */,
    "Medium" /* Protocol.Network.ResourcePriority.Medium */,
]);
export function isSyntheticNetworkRequestHighPriority(event) {
    return HIGH_NETWORK_PRIORITIES.has(event.args.data.priority);
}
export const CACHEABLE_STATUS_CODES = new Set([200, 203, 206]);
/** @type {Set<LH.Crdp.Network.ResourceType>} */
export const STATIC_RESOURCE_TYPES = new Set([
    "Font" /* Protocol.Network.ResourceType.Font */,
    "Image" /* Protocol.Network.ResourceType.Image */,
    "Media" /* Protocol.Network.ResourceType.Media */,
    "Script" /* Protocol.Network.ResourceType.Script */,
    "Stylesheet" /* Protocol.Network.ResourceType.Stylesheet */,
]);
export const NON_NETWORK_SCHEMES = [
    'blob', // @see https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL
    'data', // @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/Data_URIs
    'intent', // @see https://developer.chrome.com/docs/multidevice/android/intents/
    'file', // @see https://en.wikipedia.org/wiki/File_URI_scheme
    'filesystem', // @see https://developer.mozilla.org/en-US/docs/Web/API/FileSystem
    'chrome-extension',
];
/**
 * Parses Cache-Control directives based on https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control
 * eg. 'no-cache, no-store, max-age=0, no-transform, private' will return
 * {no-cache: true, no-store: true, max-age: 0, no-transform: true, private: true}
 */
export function parseCacheControl(header) {
    if (!header) {
        return null;
    }
    const directives = header.split(',').map(directive => directive.trim());
    const cacheControlOptions = {};
    for (const directive of directives) {
        const [key, value] = directive.split('=').map(part => part.trim());
        switch (key) {
            case 'max-age': {
                const maxAge = parseInt(value, 10);
                if (!isNaN(maxAge)) {
                    cacheControlOptions['max-age'] = maxAge;
                }
                break;
            }
            case 'no-cache':
                cacheControlOptions['no-cache'] = true;
                break;
            case 'no-store':
                cacheControlOptions['no-store'] = true;
                break;
            case 'must-revalidate':
                cacheControlOptions['must-revalidate'] = true;
                break;
            case 'private':
                cacheControlOptions['private'] = true;
                break;
            default:
                // Ignore unknown directives
                break;
        }
    }
    return cacheControlOptions;
}
const SECURE_LOCALHOST_DOMAINS = ['localhost', '127.0.0.1'];
/**
 * Is the host localhost-enough to satisfy the "secure context" definition
 * https://github.com/GoogleChrome/lighthouse/pull/11766#discussion_r582340683
 */
export function isSyntheticNetworkRequestLocalhost(event) {
    try {
        const hostname = new URL(event.args.data.url).hostname;
        // Any hostname terminating in `.localhost` is considered to be local.
        // https://w3c.github.io/webappsec-secure-contexts/#localhost
        // This method doesn't consider IPs that resolve to loopback, IPv6 or other loopback edgecases
        return SECURE_LOCALHOST_DOMAINS.includes(hostname) || hostname.endsWith('.localhost');
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=Network.js.map