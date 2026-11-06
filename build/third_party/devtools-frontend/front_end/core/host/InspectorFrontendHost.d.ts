import { type InspectorFrontendHostAPI } from './InspectorFrontendHostAPI.js';
import { InspectorFrontendHostStub } from './InspectorFrontendHostStub.js';
export declare let InspectorFrontendHostInstance: InspectorFrontendHostAPI;
declare global {
    var InspectorFrontendHost: InspectorFrontendHostAPI;
    var InspectorFrontendAPI: InspectorFrontendAPIImpl;
}
declare class InspectorFrontendAPIImpl {
    constructor();
    private dispatch;
    streamWrite(id: number, chunk: string): void;
}
/**
 * Used in `front_end/devtools_compatibility.js` to verify that calls from there
 * are valid.
 */
export type InspectorFrontendAPIImplMethods = keyof InspectorFrontendAPIImpl;
/**
 * Installs the provided host bindings implementation as the globally used one by DevTools.
 *
 *   - In non-hosted mode this is provided by `devtools_compatibility.js`.
 *   - In hosted mode this tends to be the {@link InspectorFrontendHostStub}.
 *   - For the MCP server this is a custom node.js specific implementation.
 *
 * Note that missing methods will be copied over from the stub.
 */
export declare function installInspectorFrontendHost(instance: InspectorFrontendHostAPI): void;
export declare function isUnderTest(prefs?: Record<string, string>): boolean;
export { InspectorFrontendHostStub };
