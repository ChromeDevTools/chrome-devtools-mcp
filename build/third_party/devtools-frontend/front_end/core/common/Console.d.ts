import { ObjectWrapper } from './Object.js';
export declare class Console extends ObjectWrapper<EventTypes> {
    #private;
    static instance(opts?: {
        forceNew: boolean;
    }): Console;
    static removeInstance(): void;
    /**
     * Add a message to the Console panel.
     *
     * @param text the message text.
     * @param level the message level.
     * @param show whether to show the Console panel (if it's not already shown).
     * @param source the message source.
     */
    addMessage(text: string, level?: MessageLevel, show?: boolean, source?: FrontendMessageSource): void;
    log(text: string): void;
    warn(text: string, source?: FrontendMessageSource): void;
    /**
     * Adds an error message to the Console panel.
     *
     * @param text the message text.
     * @param show whether to show the Console panel (if it's not already shown).
     */
    error(text: string, show?: boolean): void;
    messages(): Message[];
    show(): void;
    showPromise(): Promise<void>;
}
export declare const enum Events {
    MESSAGE_ADDED = "messageAdded"
}
export interface EventTypes {
    [Events.MESSAGE_ADDED]: Message;
}
export declare const enum MessageLevel {
    INFO = "info",
    WARNING = "warning",
    ERROR = "error"
}
export declare enum FrontendMessageSource {
    CSS = "css",
    ConsoleAPI = "console-api",
    ISSUE_PANEL = "issue-panel",
    SELF_XSS = "self-xss"
}
export declare class Message {
    text: string;
    level: MessageLevel;
    timestamp: number;
    show: boolean;
    source?: FrontendMessageSource;
    constructor(text: string, level: MessageLevel, timestamp: number, show: boolean, source?: FrontendMessageSource);
}
