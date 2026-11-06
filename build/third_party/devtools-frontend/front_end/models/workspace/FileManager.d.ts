import * as Common from '../../core/common/common.js';
import type * as Platform from '../../core/platform/platform.js';
import type * as TextUtils from '../../core/text_utils/text_utils.js';
export interface SaveCallbackParam {
    fileSystemPath?: Platform.DevToolsPath.RawPathString | Platform.DevToolsPath.UrlString;
}
export declare class FileManager extends Common.ObjectWrapper.ObjectWrapper<EventTypes> {
    #private;
    constructor();
    dispose(): void;
    static instance(opts?: {
        forceNew: boolean | null;
    }): FileManager;
    static removeInstance(): void;
    /**
     * {@link FileManager.close | close} *must* be called, for the InspectorFrontendHostStub case, to complete the saving.
     * @param url The url of the file to save. **NOTE:** The backend truncates this filename to 64 characters.
     */
    save(url: Platform.DevToolsPath.RawPathString | Platform.DevToolsPath.UrlString, contentData: TextUtils.ContentData.ContentData, forceSaveAs: boolean): Promise<SaveCallbackParam | null>;
    /**
     * Used in web tests
     */
    private savedURL;
    append(url: Platform.DevToolsPath.RawPathString | Platform.DevToolsPath.UrlString, content: string): void;
    close(url: Platform.DevToolsPath.RawPathString | Platform.DevToolsPath.UrlString): void;
    /**
     * Used in web tests
     */
    private appendedToURL;
}
export declare const enum Events {
    APPENDED_TO_URL = "AppendedToURL"
}
export interface EventTypes {
    [Events.APPENDED_TO_URL]: string;
}
