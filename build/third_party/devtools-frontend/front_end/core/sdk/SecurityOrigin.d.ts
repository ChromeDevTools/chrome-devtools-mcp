/**
 * Scheme prefixes for imported artifact data (such as HAR archives and performance traces).
 * DevTools isolates imported artifacts into scheme-scoped and host-scoped origins
 * (`imported-har://${host}`, `imported-trace://${host}`). These origins never match live
 * web origins (`https://${host}`) or other artifact schemes.
 */
export declare const IMPORTED_ORIGIN_PREFIXES: ReadonlySet<string>;
/**
 * An immutable security origin for an entity in DevTools (such as a document,
 * network request, or storage key).
 *
 * DevTools features that handle user data or execute commands on behalf of the user
 * (such as DevTools AI Assistance and Extensions) must enforce strict origin boundaries
 * to prevent prompt injection and cross-origin data exfiltration.
 *
 * This class serves as the single source of truth for origin comparison and classification:
 *
 * 1. **Standard Origins**: Web URLs (HTTP, HTTPS, WSS) resolve to `<scheme>://<host>[:<port>]`.
 *    Two standard origins are same-origin if their scheme, host, and port match.
 *
 * 2. **File URLs (`file://`)**: In the WHATWG web security model, `file://` URLs are assigned
 *    opaque origins. In DevTools, however, users frequently debug local files (`file:///path/index.html`).
 *    Treating all `file://` URLs as opaque would block the user from inspecting elements or styles within
 *    the same file. Conversely, treating all `file://` URLs as a single shared origin would allow a malicious
 *    local file to traverse into other local files via iframes (b/524362513).
 *    Therefore, DevTools treats `file://` URLs as **path-scoped origins** (`file://<authority><path>`).
 *    `isOpaque()` returns `false` for `file://` URLs, and two `file://` URLs are considered same-origin
 *    only if their full file path and host match exactly.
 *
 * 3. **Imported Artifact Origins (`imported-har:`, `imported-trace:`)**: Custom schemes for imported
 *    recordings (such as HAR archives and performance traces) resolve to `<scheme>//<host>`.
 *    DevTools isolates imported artifact origins from live web pages (`imported-trace://example.com` != `https://example.com`)
 *    and isolates different artifact schemes from each other (`imported-trace://example.com` != `imported-har://example.com`).
 *
 * 4. **Opaque Origins**: Opaque contexts (`data:`, `about:blank`, invalid URLs, or synthetic
 *    opaque origins) are backed by unique UUIDs. An opaque origin never matches any other origin,
 *    even another opaque origin created from the same URL string.
 */
export declare class SecurityOrigin {
    #private;
    private constructor();
    /**
     * Creates a `SecurityOrigin` instance from a raw URL or origin string.
     *
     * - If the URL is determined to be opaque (e.g. `data:`, `about:blank`, empty, `null`),
     *   a new unique opaque origin is returned.
     * - If the URL is an imported artifact scheme (e.g. `imported-har:`, `imported-trace:`),
     *   a scheme-and-host origin (`<scheme>//<host>`) is returned.
     * - If the URL is a `file://` URL, a path-scoped origin (`file://<authority><path>`) is returned.
     * - Otherwise, the standard origin (`<scheme>://<host>[:<port>]`) is extracted and returned.
     *
     * @param rawUrl The raw URL or origin string to evaluate.
     */
    static create(rawUrl: string): SecurityOrigin;
    /**
     * Creates a synthetic, unique opaque origin.
     *
     * Useful when an entity (like a sandboxed iframe or detached DOM tree) needs an
     * isolated origin that will never match any other origin in the session.
     */
    static createUniqueOpaque(): SecurityOrigin;
    /**
     * Creates an isolated security origin for an imported performance trace.
     *
     * Imported traces isolate to `imported-trace://${authority}` based on the recorded
     * main frame URL. If the URL is missing, invalid, or has no host, this returns a
     * unique opaque origin so that unhosted traces do not share access with each other
     * or live web origins.
     *
     * @param mainFrameURL The URL string of the main frame recorded in the trace.
     */
    static createForImportedTrace(mainFrameURL: string | null | undefined): SecurityOrigin;
    /**
     * Checks whether this security origin is equivalent to another security origin.
     *
     * - Standard origins return `true` if their scheme, host, and port match.
     * - File origins return `true` if their full file path and host match.
     * - Opaque origins return `true` only if both instances have identical UUIDs.
     * - Passing `null` always returns `false`.
     *
     * @param other The other `SecurityOrigin` to compare with.
     */
    isSameOriginWith(other: SecurityOrigin | null): boolean;
    /**
     * Returns whether this origin is opaque.
     *
     * Opaque origins include `data:` URLs, `about:blank`, invalid URLs, and instances
     * created via `createUniqueOpaque()`.
     */
    isOpaque(): boolean;
    /**
     * Returns whether this origin represents a local file origin (`file://`).
     */
    isFile(): boolean;
    /**
     * Returns a stable string identifier for display, logging, or storage keys.
     *
     * WARNING: Do not compare `siteId()` strings to verify origin equality or
     * enforce security boundaries. Always use `isSameOriginWith()` instead.
     *
     * Return formats:
     * - Standard origins: `<scheme>://<host>[:<port>]` (e.g., `https://example.com:8080`).
     * - File origins: `file://<authority><path>` (e.g., `file:///path/to/file.html`).
     * - Opaque origins: A bare UUID string (e.g., `3fa85f64-5717-4562-b3fc-2c963f66afa6`).
     *   Note: Opaque site IDs do not have URI schemes and are not valid URLs.
     */
    siteId(): string;
}
