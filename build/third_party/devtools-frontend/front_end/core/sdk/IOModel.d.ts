import type * as Protocol from '../../generated/protocol.js';
import { RemoteObject } from './RemoteObject.js';
import { SDKModel } from './SDKModel.js';
export declare class IOModel extends SDKModel<void> {
    read(handle: Protocol.IO.StreamHandle, size?: number, offset?: number): Promise<string | Uint8Array | null>;
    close(handle: Protocol.IO.StreamHandle): Promise<void>;
    resolveBlob(objectOrObjectId: Protocol.Runtime.RemoteObjectId | RemoteObject): Promise<string>;
    readToString(handle: Protocol.IO.StreamHandle): Promise<string>;
    readToBuffer(handle: Protocol.IO.StreamHandle): Promise<Uint8Array<ArrayBuffer>>;
}
