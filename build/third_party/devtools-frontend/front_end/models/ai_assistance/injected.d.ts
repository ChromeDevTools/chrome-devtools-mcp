/**
 * @file This files include scripts that are executed not in
 * the DevTools target but the page one.
 * They need remain isolated for importing other function so
 * bundling them for production does not create issues.
 */
export declare const AI_ASSISTANCE_CSS_CLASS_NAME = "ai-style-change";
export declare const FREESTYLER_WORLD_NAME = "DevTools AI Assistance";
export declare const FREESTYLER_WORLD_CSP = "connect-src 'none'";
export declare const FREESTYLER_BINDING_NAME = "__freestyler";
export interface FreestyleCallbackArgs {
    method: string;
    selector: string;
    className: `${typeof AI_ASSISTANCE_CSS_CLASS_NAME}-${number}`;
    styles: Record<string, string>;
    element: Node;
    error: Error;
}
export declare const freestylerBinding: string;
export declare const PAGE_EXPOSED_FUNCTIONS: string[];
export declare const injectedFunctions: string;
