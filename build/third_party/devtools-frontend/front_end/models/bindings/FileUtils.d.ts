import * as Common from '../../core/common/common.js';
import type * as Platform from '../../core/platform/platform.js';
import * as Workspace from '../workspace/workspace.js';
export interface ChunkedReader {
    fileSize(): number;
    loadedSize(): number;
    fileName(): string;
    cancel(): void;
    error(): DOMException | Error | null;
}
export declare class ChunkedFileReader implements ChunkedReader {
    #private;
    constructor(file: File, chunkSize?: number, chunkTransferredCallback?: ((arg0: ChunkedReader) => void));
    read(output: Common.StringOutputStream.OutputStream): Promise<boolean>;
    cancel(): void;
    loadedSize(): number;
    fileSize(): number;
    fileName(): string;
    error(): DOMException | null;
    private decodeChunkBuffer;
    private finishRead;
    private loadChunk;
}
export declare class FileOutputStream implements Common.StringOutputStream.OutputStream {
    #private;
    constructor(fileManager: Workspace.FileManager.FileManager);
    open(fileName: Platform.DevToolsPath.RawPathString | Platform.DevToolsPath.UrlString): Promise<boolean>;
    write(data: string): Promise<void>;
    close(): Promise<void>;
    private onAppendDone;
}
