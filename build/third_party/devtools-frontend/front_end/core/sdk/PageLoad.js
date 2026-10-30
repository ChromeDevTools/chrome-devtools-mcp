// Copyright 2021 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
export class PageLoad {
    id;
    url;
    startTime;
    loadTime;
    contentLoadTime;
    mainRequest;
    constructor(mainRequest) {
        this.id = ++PageLoad.lastIdentifier;
        this.url = mainRequest.url();
        this.startTime = mainRequest.startTime;
        this.mainRequest = mainRequest;
    }
    static forRequest(request) {
        return pageLoadForRequest.get(request) || null;
    }
    bindRequest(request) {
        pageLoadForRequest.set(request, this);
    }
    static lastIdentifier = 0;
}
const pageLoadForRequest = new WeakMap();
//# sourceMappingURL=PageLoad.js.map