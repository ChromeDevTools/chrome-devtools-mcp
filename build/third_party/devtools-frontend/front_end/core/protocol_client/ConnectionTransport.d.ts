export declare abstract class ConnectionTransport {
    onMessage: ((arg0: Object) => void) | null;
    abstract setOnMessage(onMessage: (arg0: Object | string) => void): void;
    abstract setOnDisconnect(onDisconnect: (arg0: string) => void): void;
    abstract sendRawMessage(message: string): void;
    abstract disconnect(): Promise<void>;
    static setFactory(factory: () => ConnectionTransport): void;
    static getFactory(): () => ConnectionTransport;
}
