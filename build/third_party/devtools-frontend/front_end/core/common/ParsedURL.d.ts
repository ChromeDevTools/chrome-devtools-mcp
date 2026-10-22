import * as Platform from '../platform/platform.js';
/**
 * http://tools.ietf.org/html/rfc3986#section-5.2.4
 */
export declare function normalizePath(path: string): string;
export declare function schemeIs(url: Platform.DevToolsPath.UrlString | URL, scheme: string): boolean;
/**
 * Returns true if the URL uses an unprivileged web-safe scheme (or is a `blob:`/`filesystem:` URL wrapping one).
 */
export declare function hasWebSafeScheme(url: Platform.DevToolsPath.UrlString | URL | string): boolean;
/**
 * Returns true if the URL uses a privileged scheme (or is a `blob:`/`filesystem:` URL wrapping one).
 */
export declare function isPrivilegedScheme(url: Platform.DevToolsPath.UrlString | URL | string): boolean;
/**
 * File paths in DevTools that are represented either as unencoded absolute or relative paths, or encoded paths, or URLs.
 * @example
 * RawPathString: “/Hello World/file.js”
 * EncodedPathString: “/Hello%20World/file.js”
 * UrlString: “file:///Hello%20World/file/js”
 */
type BrandedPathString = Platform.DevToolsPath.UrlString | Platform.DevToolsPath.RawPathString | Platform.DevToolsPath.EncodedPathString;
export declare class ParsedURL {
    #private;
    isValid: boolean;
    url: string;
    scheme: string;
    user: string;
    host: string;
    port: string;
    path: string;
    queryParams: string;
    fragment: string;
    folderPathComponents: string;
    lastPathComponent: string;
    readonly blobInnerScheme: string | undefined;
    constructor(url: string);
    static fromString(string: string): ParsedURL | null;
    static preEncodeSpecialCharactersInPath(path: string): string;
    static rawPathToEncodedPathString(path: Platform.DevToolsPath.RawPathString): Platform.DevToolsPath.EncodedPathString;
    /**
     * @param name Must not be encoded
     */
    static encodedFromParentPathAndName(parentPath: Platform.DevToolsPath.EncodedPathString, name: string): Platform.DevToolsPath.EncodedPathString;
    /**
     * @param name Must not be encoded
     */
    static urlFromParentUrlAndName(parentUrl: Platform.DevToolsPath.UrlString, name: string): Platform.DevToolsPath.UrlString;
    static encodedPathToRawPathString(encPath: Platform.DevToolsPath.EncodedPathString): Platform.DevToolsPath.RawPathString;
    static rawPathToUrlString(fileSystemPath: Platform.DevToolsPath.RawPathString): Platform.DevToolsPath.UrlString;
    static relativePathToUrlString(relativePath: Platform.DevToolsPath.RawPathString, baseURL: Platform.DevToolsPath.UrlString): Platform.DevToolsPath.UrlString;
    static urlToRawPathString(fileURL: Platform.DevToolsPath.UrlString, isWindows?: boolean): Platform.DevToolsPath.RawPathString;
    static sliceUrlToEncodedPathString(url: Platform.DevToolsPath.UrlString, start: number): Platform.DevToolsPath.EncodedPathString;
    static substr<DevToolsPathType extends BrandedPathString>(devToolsPath: DevToolsPathType, from: number, length?: number): DevToolsPathType;
    static substring<DevToolsPathType extends BrandedPathString>(devToolsPath: DevToolsPathType, start: number, end?: number): DevToolsPathType;
    static prepend<DevToolsPathType extends BrandedPathString>(prefix: string, devToolsPath: DevToolsPathType): DevToolsPathType;
    static concatenate<DevToolsPathType extends BrandedPathString>(devToolsPath: DevToolsPathType, ...appendage: string[]): DevToolsPathType;
    static trim<DevToolsPathType extends BrandedPathString>(devToolsPath: DevToolsPathType): DevToolsPathType;
    static slice<DevToolsPathType extends BrandedPathString>(devToolsPath: DevToolsPathType, start?: number, end?: number): DevToolsPathType;
    static join<DevToolsPathType extends BrandedPathString>(devToolsPaths: DevToolsPathType[], separator?: string): DevToolsPathType;
    static split<DevToolsPathType extends BrandedPathString>(devToolsPath: DevToolsPathType, separator: string | RegExp, limit?: number): DevToolsPathType[];
    static toLowerCase<DevToolsPathType extends BrandedPathString>(devToolsPath: DevToolsPathType): DevToolsPathType;
    static isValidUrlString(str: string): str is Platform.DevToolsPath.UrlString;
    static urlWithoutHash(url: string): string;
    static urlRegex(): RegExp;
    static extractPath(url: Platform.DevToolsPath.UrlString): Platform.DevToolsPath.EncodedPathString;
    static extractOrigin(url: Platform.DevToolsPath.UrlString): Platform.DevToolsPath.UrlString;
    static extractExtension(url: string): string;
    static extractName(url: string): string;
    static completeURL(baseURL: Platform.DevToolsPath.UrlString, href: string): Platform.DevToolsPath.UrlString | null;
    static splitLineAndColumn(string: string): {
        url: Platform.DevToolsPath.UrlString;
        lineNumber?: number;
        columnNumber?: number;
    };
    static removeWasmFunctionInfoFromURL(url: string): Platform.DevToolsPath.UrlString;
    private static beginsWithWindowsDriveLetter;
    private static beginsWithScheme;
    static isRelativeURL(url: string): boolean;
    get displayName(): string;
    dataURLDisplayName(): string;
    isAboutBlank(): boolean;
    isDataURL(): boolean;
    extractDataUrlMimeType(): {
        type?: string;
        subtype?: string | undefined;
    };
    isBlobURL(): boolean;
    lastPathComponentWithFragment(): string;
    domain(): string;
    securityOrigin(): Platform.DevToolsPath.UrlString;
    urlWithoutScheme(): string;
    static urlRegexInstance: RegExp | null;
}
export {};
