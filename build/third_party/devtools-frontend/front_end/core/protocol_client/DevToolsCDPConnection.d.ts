import { type CDPConnection, type CDPConnectionObserver, type CDPError, type Command, type CommandParams, type CommandResult } from './CDPConnection.js';
import type { ConnectionTransport } from './ConnectionTransport.js';
export declare class DevToolsCDPConnection implements CDPConnection {
    #private;
    constructor(transport: ConnectionTransport);
    observe(observer: CDPConnectionObserver): void;
    unobserve(observer: CDPConnectionObserver): void;
    send<T extends Command>(method: T, params: CommandParams<T>, sessionId?: string): Promise<{
        result: CommandResult<T>;
    } | {
        error: CDPError;
    }>;
    resolvePendingCalls(sessionId: string): void;
    private sendRawMessageForTesting;
    private onMessage;
}
