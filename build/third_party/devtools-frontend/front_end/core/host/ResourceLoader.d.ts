import * as Common from '../common/common.js';
export declare const ResourceLoader: {};
export declare const bindOutputStream: (stream: Common.StringOutputStream.OutputStream) => number;
export declare const discardOutputStream: (id: number) => void;
export declare const streamWrite: (id: number, chunk: string) => void;
export interface LoadErrorDescription {
    statusCode: number;
    netError?: number;
    netErrorName?: string;
    urlValid?: boolean;
    message?: string;
}
export declare const load: (url: string, headers: Record<string, string> | null, callback: (arg0: boolean, arg1: Record<string, string>, arg2: string, arg3: LoadErrorDescription) => void, allowRemoteFilePaths: boolean) => void;
export declare function netErrorToMessage(netError: number | undefined, httpStatusCode: number | undefined, netErrorName: string | undefined): string | null;
export declare const loadAsStream: (url: string, headers: Record<string, string> | null, stream: Common.StringOutputStream.OutputStream, callback?: ((arg0: boolean, arg1: Record<string, string>, arg2: LoadErrorDescription) => void), allowRemoteFilePaths?: boolean) => void;
