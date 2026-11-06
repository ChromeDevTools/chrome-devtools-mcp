import * as Common from '../../core/common/common.js';
import * as Host from '../../core/host/host.js';
import type * as Platform from '../../core/platform/platform.js';
import * as ProjectSettings from '../project_settings/project_settings.js';
/**
 * Description and state of the automatic file system.
 */
export interface AutomaticFileSystem {
    root: Platform.DevToolsPath.RawPathString;
    uuid: string;
    state: 'disconnected' | 'connecting' | 'connected';
}
/**
 * Indicates the availability of the Automatic Workspace Folders feature.
 *
 * `'available'` means that the feature is enabled and the project settings
 * are also available. It doesn't indicate whether or not the page is actually
 * providing a `com.chrome.devtools.json` or not, and whether or not that file
 * (if it exists) provides workspace information.
 */
export type AutomaticFileSystemAvailability = 'available' | 'unavailable';
/**
 * Automatically connects and disconnects workspace folders.
 *
 * @see http://go/chrome-devtools:automatic-workspace-folders-design
 */
export declare class AutomaticFileSystemManager extends Common.ObjectWrapper.ObjectWrapper<EventTypes> {
    #private;
    /**
     * Yields the current `AutomaticFileSystem` (if any).
     *
     * @returns the current automatic file system or `null`.
     */
    get automaticFileSystem(): Readonly<AutomaticFileSystem> | null;
    /**
     * Yields the availability of the Automatic Workspace Folders feature.
     *
     * `'available'` means that the feature is enabled and the project settings
     * are also available. It doesn't indicate whether or not the page is actually
     * providing a `com.chrome.devtools.json` or not, and whether or not that file
     * (if it exists) provides workspace information.
     *
     * @returns `'available'` if the feature is available and the project settings
     *         feature is also available, otherwise `'unavailable'`.
     */
    get availability(): AutomaticFileSystemAvailability;
    /**
     * @internal
     */
    constructor(inspectorFrontendHost: Host.InspectorFrontendHostAPI.InspectorFrontendHostAPI, projectSettingsModel: ProjectSettings.ProjectSettingsModel.ProjectSettingsModel);
    /**
     * Yields the `AutomaticFileSystemManager` singleton.
     *
     * @returns the singleton.
     */
    static instance({ forceNew, inspectorFrontendHost, projectSettingsModel }?: {
        forceNew: boolean | null;
        inspectorFrontendHost: Host.InspectorFrontendHostAPI.InspectorFrontendHostAPI | null;
        projectSettingsModel: ProjectSettings.ProjectSettingsModel.ProjectSettingsModel | null;
    }): AutomaticFileSystemManager;
    /**
     * Clears the `AutomaticFileSystemManager` singleton (if any);
     */
    static removeInstance(): void;
    dispose(): void;
    /**
     * Attempt to connect the automatic workspace folder (if any).
     *
     * @param addIfMissing if `false` (the default), this will only try to connect
     *                     to a previously connected automatic workspace folder.
     *                     If the folder was never connected before and `true` is
     *                     specified, the user will be asked to grant permission
     *                     to allow Chrome DevTools to access the folder first.
     * @returns `true` if the automatic workspace folder was connected, `false`
     *          if there wasn't any, or the connection attempt failed (e.g. the
     *          user did not grant permission).
     */
    connectAutomaticFileSystem(addIfMissing?: boolean): Promise<boolean>;
    /**
     * Disconnects any automatic workspace folder.
     */
    disconnectedAutomaticFileSystem(): void;
}
/**
 * Events emitted by the `AutomaticFileSystemManager`.
 */
export declare const enum Events {
    /**
     * Emitted whenever the `automaticFileSystem` property of the
     * `AutomaticFileSystemManager` changes.
     */
    AUTOMATIC_FILE_SYSTEM_CHANGED = "AutomaticFileSystemChanged",
    /**
     * Emitted whenever the `availability` property of the
     * `AutomaticFileSystemManager` changes.
     */
    AVAILABILITY_CHANGED = "AvailabilityChanged"
}
/**
 * @internal
 */
export interface EventTypes {
    [Events.AUTOMATIC_FILE_SYSTEM_CHANGED]: Readonly<AutomaticFileSystem> | null;
    [Events.AVAILABILITY_CHANGED]: AutomaticFileSystemAvailability;
}
