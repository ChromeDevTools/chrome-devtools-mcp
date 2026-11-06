export declare const enum MimeType {
    HTML = "text/html",
    XML = "text/xml",
    PLAIN = "text/plain",
    XHTML = "application/xhtml+xml",
    SVG = "image/svg+xml",
    CSS = "text/css",
    XSL = "text/xsl",
    VTT = "text/vtt",
    PDF = "application/pdf",
    EVENTSTREAM = "text/event-stream"
}
/**
 * @returns true iff `mimeType` has textual content. Concretely we return true if:
 *   - `mimeType` starts with "text/" or "multipart/"
 *   - `mimeType` ends with "+xml"
 *   - `mimeType` contains "json"
 *   - if `mimeType` is one of a predefined list textual mime types.
 */
export declare function isTextType(mimeType: string): boolean;
/**
 * Port of net::HttpUtils::ParseContentType to extract mimeType and charset from
 * the 'Content-Type' header.
 */
export declare function parseContentType(contentType: string): {
    mimeType: string | null;
    charset: string | null;
};
