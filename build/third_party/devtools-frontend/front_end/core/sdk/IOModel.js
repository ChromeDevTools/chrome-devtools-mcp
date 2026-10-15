// Copyright 2020 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
import { RemoteObject } from './RemoteObject.js';
import { SDKModel } from './SDKModel.js';
export class IOModel extends SDKModel {
    async read(handle, size, offset) {
        const result = await this.target().ioAgent().invoke_read({ handle, offset, size });
        if (result.getError()) {
            throw new Error(result.getError());
        }
        if (result.eof) {
            return null;
        }
        if (result.base64Encoded) {
            return Common.Base64.decode(result.data);
        }
        return result.data;
    }
    async close(handle) {
        await this.target().ioAgent().invoke_close({ handle });
    }
    async resolveBlob(objectOrObjectId) {
        const objectId = objectOrObjectId instanceof RemoteObject ? objectOrObjectId.objectId : objectOrObjectId;
        if (!objectId) {
            throw new Error('Remote object has undefined objectId');
        }
        const result = await this.target().ioAgent().invoke_resolveBlob({ objectId });
        if (result.getError()) {
            throw new Error(result.getError());
        }
        return `blob:${result.uuid}`;
    }
    async readToString(handle) {
        const strings = [];
        const decoder = new TextDecoder();
        for (;;) {
            const data = await this.read(handle, 1024 * 1024);
            if (data === null) {
                strings.push(decoder.decode());
                break;
            }
            if (data instanceof Uint8Array) {
                strings.push(decoder.decode(data, { stream: true }));
            }
            else {
                strings.push(data);
            }
        }
        return strings.join('');
    }
    async readToBuffer(handle) {
        const items = [];
        for (;;) {
            const data = await this.read(handle, 1024 * 1024);
            if (data === null) {
                break;
            }
            if (data instanceof Uint8Array) {
                items.push(data);
            }
            else {
                throw new Error('Unexpected stream data type: expected binary, got a string');
            }
        }
        let length = 0;
        for (const item of items) {
            length += item.length;
        }
        const result = new Uint8Array(length);
        let offset = 0;
        for (const item of items) {
            result.set(item, offset);
            offset += item.length;
        }
        return result;
    }
}
SDKModel.register(IOModel, { capabilities: 131072 /* Capability.IO */, autostart: true });
//# sourceMappingURL=IOModel.js.map