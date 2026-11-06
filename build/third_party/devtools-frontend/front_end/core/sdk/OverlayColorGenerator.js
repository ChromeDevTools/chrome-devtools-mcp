// Copyright 2020 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
/**
 * Used to cycle through a list of predetermined #colors for the overlays.
 * This helps users differentiate between overlays when several are shown at the
 * same time.
 */
export class OverlayColorGenerator {
    #colors;
    #index;
    constructor() {
        const format = "rgba" /* Common.Color.Format.RGBA */;
        this.#colors = [
            // F59794
            new Common.Color.Legacy([0.9607843137254902, 0.592156862745098, 0.5803921568627451, 1], format),
            // F0BF4C
            new Common.Color.Legacy([0.9411764705882353, 0.7490196078431373, 0.2980392156862745, 1], format),
            // D4ED31
            new Common.Color.Legacy([0.8313725490196079, 0.9294117647058824, 0.19215686274509805, 1], format),
            // 9EEB47
            new Common.Color.Legacy([0.6196078431372549, 0.9215686274509803, 0.2784313725490196, 1], format),
            // 5BD1D7
            new Common.Color.Legacy([0.3568627450980392, 0.8196078431372549, 0.8431372549019608, 1], format),
            // BCCEFB
            new Common.Color.Legacy([0.7372549019607844, 0.807843137254902, 0.984313725490196, 1], format),
            // C6BEEE
            new Common.Color.Legacy([0.7764705882352941, 0.7450980392156863, 0.9333333333333333, 1], format),
            // D094EA
            new Common.Color.Legacy([0.8156862745098039, 0.5803921568627451, 0.9176470588235294, 1], format),
            // EB94CF
            new Common.Color.Legacy([0.9215686274509803, 0.5803921568627451, 0.8117647058823529, 1], format),
        ];
        this.#index = 0;
    }
    /**
     * Generate the next color in the spectrum
     */
    next() {
        const color = this.#colors[this.#index];
        this.#index++;
        if (this.#index >= this.#colors.length) {
            this.#index = 0;
        }
        return color;
    }
}
//# sourceMappingURL=OverlayColorGenerator.js.map