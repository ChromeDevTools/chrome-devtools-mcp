import type * as Platform from '../platform/platform.js';
import * as ProtocolClient from '../protocol_client/protocol_client.js';
export declare class MainConnection implements ProtocolClient.ConnectionTransport.ConnectionTransport {
    #private;
    onMessage: ((arg0: Object | string) => void) | null;
    constructor();
    setOnMessage(onMessage: (arg0: Object | string) => void): void;
    setOnDisconnect(onDisconnect: (arg0: string) => void): void;
    sendRawMessage(message: string): void;
    private dispatchMessage;
    private dispatchMessageChunk;
    disconnect(): Promise<void>;
}
export declare class WebSocketTransport implements ProtocolClient.ConnectionTransport.ConnectionTransport {
    #private;
    onMessage: ((arg0: Object | string) => void) | null;
    constructor(url: Platform.DevToolsPath.UrlString, onWebSocketDisconnect: (message: Platform.UIString.LocalizedString) => void);
    setOnMessage(onMessage: (arg0: Object | string) => void): void;
    setOnDisconnect(onDisconnect: (arg0: string) => void): void;
    private onError;
    private onOpen;
    private onClose;
    private close;
    sendRawMessage(message: string): void;
    disconnect(): Promise<void>;
}
export declare class StubTransport implements ProtocolClient.ConnectionTransport.ConnectionTransport {
    #private;
    onMessage: ((arg0: Object | string) => void) | null;
    setOnMessage(onMessage: (arg0: Object | string) => void): void;
    setOnDisconnect(onDisconnect: (arg0: string) => void): void;
    sendRawMessage(message: string): void;
    private respondWithError;
    disconnect(): Promise<void>;
}
export declare function initMainConnection(createRootTarget: () => Promise<void>, onConnectionLost: (message: Platform.UIString.LocalizedString) => void): Promise<void>;
