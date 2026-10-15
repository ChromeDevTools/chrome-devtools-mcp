import { webkit } from "../util/browser.js";
import { addClass, rmClass } from "../util/dom.js";
import { signal } from "../util/event.js";
import { restartBlink } from "./selection.js";
export function ensureFocus(cm) {
    if (!cm.hasFocus()) {
        cm.display.input.focus();
        if (!cm.state.focused)
            onFocus(cm);
    }
}
export function delayBlurEvent(cm) {
    cm.state.delayingBlurEvent = true;
    setTimeout(() => {
        if (cm.state.delayingBlurEvent) {
            cm.state.delayingBlurEvent = false;
            if (cm.state.focused)
                onBlur(cm);
        }
    }, 100);
}
export function onFocus(cm, e) {
    if (cm.state.delayingBlurEvent && !cm.state.draggingText)
        cm.state.delayingBlurEvent = false;
    if (cm.options.readOnly == "nocursor")
        return;
    if (!cm.state.focused) {
        signal(cm, "focus", cm, e);
        cm.state.focused = true;
        addClass(cm.display.wrapper, "CodeMirror-focused");
        // This test prevents this from firing when a context
        // menu is closed (since the input reset would kill the
        // select-all detection hack)
        if (!cm.curOp && cm.display.selForContextMenu != cm.doc.sel) {
            cm.display.input.reset();
            if (webkit)
                setTimeout(() => cm.display.input.reset(true), 20); // Issue #1730
        }
        cm.display.input.receivedFocus();
    }
    restartBlink(cm);
}
export function onBlur(cm, e) {
    if (cm.state.delayingBlurEvent)
        return;
    if (cm.state.focused) {
        signal(cm, "blur", cm, e);
        cm.state.focused = false;
        rmClass(cm.display.wrapper, "CodeMirror-focused");
    }
    clearInterval(cm.display.blinker);
    setTimeout(() => { if (!cm.state.focused)
        cm.display.shift = false; }, 150);
}
//# sourceMappingURL=focus.js.map