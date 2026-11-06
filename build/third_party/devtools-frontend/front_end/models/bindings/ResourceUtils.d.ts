import * as Platform from '../../core/platform/platform.js';
import * as SDK from '../../core/sdk/sdk.js';
import type * as Protocol from '../../generated/protocol.js';
import * as Workspace from '../workspace/workspace.js';
export declare function resourceForURL(url: Platform.DevToolsPath.UrlString): SDK.Resource.Resource | null;
export declare function displayNameForURL(url: Platform.DevToolsPath.UrlString): string;
export declare function metadataForURL(target: SDK.Target.Target, frameId: Protocol.Page.FrameId, url: Platform.DevToolsPath.UrlString): Workspace.UISourceCode.UISourceCodeMetadata | null;
export declare function resourceMetadata(resource: SDK.Resource.Resource | null): Workspace.UISourceCode.UISourceCodeMetadata | null;
