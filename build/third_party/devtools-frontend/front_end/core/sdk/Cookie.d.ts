import type * as Protocol from '../../generated/protocol.js';
import type * as Platform from '../platform/platform.js';
export declare class Cookie {
    #private;
    constructor(name: string, value: string, type?: Type | null, priority?: Protocol.Network.CookiePriority, partitionKey?: Protocol.Network.CookiePartitionKey);
    static fromProtocolCookie(protocolCookie: Protocol.Network.Cookie): Cookie;
    key(): string;
    name(): string;
    value(): string;
    type(): Type | null | undefined;
    httpOnly(): boolean;
    secure(): boolean;
    partitioned(): boolean;
    sameSite(): Protocol.Network.CookieSameSite;
    partitionKey(): Protocol.Network.CookiePartitionKey;
    setPartitionKey(topLevelSite: string, hasCrossSiteAncestor: boolean): void;
    topLevelSite(): string;
    setTopLevelSite(topLevelSite: string, hasCrossSiteAncestor: boolean): void;
    hasCrossSiteAncestor(): boolean;
    setHasCrossSiteAncestor(hasCrossSiteAncestor: boolean): void;
    partitionKeyOpaque(): boolean;
    setPartitionKeyOpaque(): void;
    priority(): Protocol.Network.CookiePriority;
    session(): boolean;
    path(): string;
    domain(): string;
    expires(): number;
    maxAge(): number;
    sourcePort(): number;
    sourceScheme(): Protocol.Network.CookieSourceScheme;
    size(): number;
    /**
     * @deprecated
     */
    url(): Platform.DevToolsPath.UrlString | null;
    setSize(size: number): void;
    expiresDate(requestDate: Date): Date | null;
    addAttribute(key: Attribute | null, value?: string | number | boolean): void;
    hasAttribute(key: Attribute): boolean;
    getAttribute(key: Attribute): string | number | boolean | undefined;
    setCookieLine(cookieLine: string): void;
    getCookieLine(): string | null;
    matchesSecurityOrigin(securityOrigin: string): boolean;
    static isDomainMatch(domain: string, hostname: string): boolean;
}
export declare const enum Type {
    REQUEST = 0,
    RESPONSE = 1
}
export declare const enum Attribute {
    NAME = "name",
    VALUE = "value",
    SIZE = "size",
    DOMAIN = "domain",
    PATH = "path",
    EXPIRES = "expires",
    MAX_AGE = "max-age",
    HTTP_ONLY = "http-only",
    SECURE = "secure",
    SAME_SITE = "same-site",
    SOURCE_SCHEME = "source-scheme",
    SOURCE_PORT = "source-port",
    PRIORITY = "priority",
    PARTITIONED = "partitioned",
    PARTITION_KEY = "partition-key",
    PARTITION_KEY_SITE = "partition-key-site",
    HAS_CROSS_SITE_ANCESTOR = "has-cross-site-ancestor"
}
