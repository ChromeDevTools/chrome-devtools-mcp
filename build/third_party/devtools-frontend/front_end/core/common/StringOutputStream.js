// Copyright 2015 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
export class StringOutputStream {
    #data = '';
    async write(chunk) {
        this.#data += chunk;
    }
    async close() {
    }
    data() {
        return this.#data;
    }
}
//# sourceMappingURL=StringOutputStream.js.map