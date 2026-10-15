// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * Set instance of this class as flavor to mark what panel triggered the
 * 'elements.toggle-element-search' action if it was not the elements panel.
 * This will cause specified panel to be made visible instead of the elements
 * panel after the inspection is done.
 **/
export class ReturnToPanelFlavor {
    viewId;
    constructor(viewId) {
        this.viewId = viewId;
    }
}
//# sourceMappingURL=ReturnToPanel.js.map