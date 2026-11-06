import * as Common from '../common/common.js';
/**
 * Used to cycle through a list of predetermined #colors for the overlays.
 * This helps users differentiate between overlays when several are shown at the
 * same time.
 */
export declare class OverlayColorGenerator {
    #private;
    constructor();
    /**
     * Generate the next color in the spectrum
     */
    next(): Common.Color.Color;
}
