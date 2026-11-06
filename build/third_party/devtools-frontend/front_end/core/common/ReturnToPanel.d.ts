/**
 * Set instance of this class as flavor to mark what panel triggered the
 * 'elements.toggle-element-search' action if it was not the elements panel.
 * This will cause specified panel to be made visible instead of the elements
 * panel after the inspection is done.
 **/
export declare class ReturnToPanelFlavor {
    readonly viewId: string;
    constructor(viewId: string);
}
