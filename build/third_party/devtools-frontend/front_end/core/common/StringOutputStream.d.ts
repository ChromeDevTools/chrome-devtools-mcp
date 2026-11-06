export interface OutputStream {
    write(data: string, endOfFile?: boolean): Promise<void>;
    close(): Promise<void>;
}
export declare class StringOutputStream implements OutputStream {
    #private;
    write(chunk: string): Promise<void>;
    close(): Promise<void>;
    data(): string;
}
