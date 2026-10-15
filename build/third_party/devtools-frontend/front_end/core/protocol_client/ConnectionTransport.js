// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
let connectionFactory;
export class ConnectionTransport {
    static setFactory(factory) {
        connectionFactory = factory;
    }
    static getFactory() {
        return connectionFactory;
    }
}
//# sourceMappingURL=ConnectionTransport.js.map