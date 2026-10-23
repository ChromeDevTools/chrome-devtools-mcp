import * as Common from '../../core/common/common.js';
import type { ToolName } from './tools/Tool.js';
/**
 * AI tools the user allowed with "Yes, always allow".
 */
export declare const alwaysAllowedToolsSettingDescriptor: Common.Settings.SettingDescriptor<ToolName[]>;
export declare const enum Events {
    TOOLS_CHANGED = "ToolsChanged"
}
export interface EventTypes {
    [Events.TOOLS_CHANGED]: void;
}
export declare class AlwaysAllowedTools extends Common.ObjectWrapper.ObjectWrapper<EventTypes> {
    #private;
    constructor(settings: Common.Settings.Settings);
    isAllowed(toolName: ToolName): boolean;
    allow(toolName: ToolName): void;
    remove(toolName: ToolName): void;
    list(): readonly ToolName[];
}
