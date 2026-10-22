import * as Platform from '../../core/platform/platform.js';
export declare class SearchConfig {
    #private;
    constructor(query: string, ignoreCase: boolean, isRegex: boolean);
    static fromPlainObject(object: {
        query: string;
        ignoreCase: boolean;
        isRegex: boolean;
    }): SearchConfig;
    filePathMatchesFileQuery(filePath: Platform.DevToolsPath.RawPathString | Platform.DevToolsPath.EncodedPathString | Platform.DevToolsPath.UrlString): boolean;
    queries(): string[];
    query(): string;
    ignoreCase(): boolean;
    isRegex(): boolean;
    toPlainObject(): {
        query: string;
        ignoreCase: boolean;
        isRegex: boolean;
    };
}
