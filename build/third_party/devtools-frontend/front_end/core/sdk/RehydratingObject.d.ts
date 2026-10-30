import type * as Protocol from '../../generated/protocol.js';
/** This object is emitted to ScriptParsed and also used in the RehydratingConnection **/
export interface RehydratingScript extends Protocol.Debugger.ScriptParsedEvent {
    sourceText?: string;
    executionContextAuxData?: RehydratingExecutionContextAuxData;
    isolate: string;
    /** The manually provided string via the `//# sourceURL` directive. Meanwhile the `url` is the script's `src`  */
    sourceURL?: string;
    pid: number;
}
export interface RehydratingResource {
    url: string;
    content: string;
    frame: string;
    mimeType: string;
}
export interface RehydratingExecutionContextAuxData {
    frameId?: Protocol.Page.FrameId;
    isDefault?: boolean;
    type?: string;
}
export interface RehydratingExecutionContext extends Protocol.Runtime.ExecutionContextDescription {
    /** AKA V8ContextToken. https://source.chromium.org/chromium/chromium/src/+/main:third_party/blink/renderer/core/inspector/inspector_trace_events.cc;l=1229;drc=3c88f61e18b043e70c225d8d57c77832a85e7f58 */
    v8Context?: string;
    auxData?: RehydratingExecutionContextAuxData;
    isolate: string;
}
export interface RehydratingTarget {
    targetId: Protocol.Target.TargetID;
    type: string;
    url: string;
    pid?: number;
    isolate?: string;
}
export interface HydratingDataPerTarget {
    target: RehydratingTarget;
    executionContexts: RehydratingExecutionContext[];
    scripts: RehydratingScript[];
    resources: RehydratingResource[];
}
export interface ProtocolMessage {
    id: number;
    method: string;
    sessionId?: number;
    params?: object;
}
export interface ProtocolEvent {
    method: string;
    params: object;
}
export interface ProtocolResponse {
    id: number;
}
export type ServerMessage = (ProtocolEvent | ProtocolMessage | ProtocolResponse) & Record<string, unknown>;
export interface Session {
    target: RehydratingTarget;
    executionContexts: RehydratingExecutionContext[];
    scripts: RehydratingScript[];
}
