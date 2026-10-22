import { Attribute, Cookie } from './Cookie.js';
export declare class CookieParser {
    #private;
    constructor(domain?: string);
    static parseSetCookie(header: string | undefined, domain?: string): Cookie[] | null;
    getCookieAttribute(header: string | undefined): Attribute | null;
    cookies(): Cookie[];
    parseSetCookie(setCookieHeader: string | undefined): Cookie[] | null;
    private initialize;
    private flushCookie;
    private extractKeyValue;
    private advanceAndCheckCookieDelimiter;
    private addCookie;
}
