// Copyright 2026 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
export class Size {
    width;
    height;
    constructor(width, height) {
        this.width = width;
        this.height = height;
    }
    clipTo(size) {
        if (!size) {
            return this;
        }
        return new Size(Math.min(this.width, size.width), Math.min(this.height, size.height));
    }
    scale(scale) {
        return new Size(this.width * scale, this.height * scale);
    }
    isEqual(size) {
        return size !== null && this.width === size.width && this.height === size.height;
    }
    widthToMax(size) {
        return new Size(Math.max(this.width, (typeof size === 'number' ? size : size.width)), this.height);
    }
    addWidth(size) {
        return new Size(this.width + (typeof size === 'number' ? size : size.width), this.height);
    }
    heightToMax(size) {
        return new Size(this.width, Math.max(this.height, (typeof size === 'number' ? size : size.height)));
    }
    addHeight(size) {
        return new Size(this.width, this.height + (typeof size === 'number' ? size : size.height));
    }
}
//# sourceMappingURL=Size.js.map