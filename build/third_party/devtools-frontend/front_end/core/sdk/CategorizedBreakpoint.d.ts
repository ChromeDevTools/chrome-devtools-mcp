export declare const enum Category {
    ANIMATION = "animation",
    AUCTION_WORKLET = "auction-worklet",
    CANVAS = "canvas",
    CLIPBOARD = "clipboard",
    CONTROL = "control",
    DEVICE = "device",
    DOM_MUTATION = "dom-mutation",
    DRAG_DROP = "drag-drop",
    GEOLOCATION = "geolocation",
    KEYBOARD = "keyboard",
    LOAD = "load",
    MEDIA = "media",
    MOUSE = "mouse",
    NOTIFICATION = "notification",
    PARSE = "parse",
    PICTURE_IN_PICTURE = "picture-in-picture",
    POINTER = "pointer",
    SCRIPT = "script",
    TIMER = "timer",
    TOUCH = "touch",
    TRUSTED_TYPE_VIOLATION = "trusted-type-violation",
    WEB_AUDIO = "web-audio",
    WINDOW = "window",
    WORKER = "worker",
    XHR = "xhr"
}
export declare class CategorizedBreakpoint {
    #private;
    /**
     * The name of this breakpoint as passed to 'setInstrumentationBreakpoint',
     * 'setEventListenerBreakpoint' and 'setBreakOnCSPViolation'.
     *
     * Note that the backend adds a 'listener:' and 'instrumentation:' prefix
     * to this name in the 'Debugger.paused' CDP event.
     */
    readonly name: string;
    constructor(category: Category, name: string);
    category(): Category;
    enabled(): boolean;
    setEnabled(enabled: boolean): void;
}
