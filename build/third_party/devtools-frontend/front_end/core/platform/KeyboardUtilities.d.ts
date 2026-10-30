export declare const enum ArrowKey {
    UP = "ArrowUp",
    DOWN = "ArrowDown",
    LEFT = "ArrowLeft",
    RIGHT = "ArrowRight"
}
export declare const enum PageKey {
    UP = "PageUp",
    DOWN = "PageDown"
}
export declare const ENTER_KEY = "Enter";
export declare const ESCAPE_KEY = "Escape";
export declare const TAB_KEY = "Tab";
export declare const ARROW_KEYS: Set<ArrowKey>;
export declare function keyIsArrowKey(key: string): key is ArrowKey;
export declare function isEscKey(event: {
    readonly key: string;
}): boolean;
export declare function isEnterOrSpaceKey(event: {
    readonly key: string;
}): boolean;
