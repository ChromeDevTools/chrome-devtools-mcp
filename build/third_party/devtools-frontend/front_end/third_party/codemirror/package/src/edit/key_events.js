import { restartBlink } from "../display/selection.js";
import { isModifierKey, keyName, lookupKey } from "../input/keymap.js";
import { eventInWidget } from "../measurement/widgets.js";
import { gecko, ie, ie_version, mac, presto } from "../util/browser.js";
import { activeElt, addClass, rmClass } from "../util/dom.js";
import { e_preventDefault, off, on, signalDOMEvent } from "../util/event.js";
import { hasCopyEvent } from "../util/feature_detection.js";
import { Delayed, Pass } from "../util/misc.js";
import { signalLater } from "../util/operation_group.js";
import { commands } from "./commands.js";
// Run a handler that was bound to a key.
function doHandleBinding(cm, bound, dropShift) {
    if (typeof bound == "string") {
        bound = commands[bound];
        if (!bound)
            return false;
    }
    // Ensure previous input has been read, so that the handler sees a
    // consistent view of the document
    cm.display.input.ensurePolled();
    let prevShift = cm.display.shift, done = false;
    try {
        if (cm.isReadOnly())
            cm.state.suppressEdits = true;
        if (dropShift)
            cm.display.shift = false;
        done = bound(cm) != Pass;
    }
    finally {
        cm.display.shift = prevShift;
        cm.state.suppressEdits = false;
    }
    return done;
}
function lookupKeyForEditor(cm, name, handle) {
    for (let i = 0; i < cm.state.keyMaps.length; i++) {
        let result = lookupKey(name, cm.state.keyMaps[i], handle, cm);
        if (result)
            return result;
    }
    return (cm.options.extraKeys && lookupKey(name, cm.options.extraKeys, handle, cm))
        || lookupKey(name, cm.options.keyMap, handle, cm);
}
// Note that, despite the name, this function is also used to check
// for bound mouse clicks.
let stopSeq = new Delayed;
export function dispatchKey(cm, name, e, handle) {
    let seq = cm.state.keySeq;
    if (seq) {
        if (isModifierKey(name))
            return "handled";
        if (/\'$/.test(name))
            cm.state.keySeq = null;
        else
            stopSeq.set(50, () => {
                if (cm.state.keySeq == seq) {
                    cm.state.keySeq = null;
                    cm.display.input.reset();
                }
            });
        if (dispatchKeyInner(cm, seq + " " + name, e, handle))
            return true;
    }
    return dispatchKeyInner(cm, name, e, handle);
}
function dispatchKeyInner(cm, name, e, handle) {
    let result = lookupKeyForEditor(cm, name, handle);
    if (result == "multi")
        cm.state.keySeq = name;
    if (result == "handled")
        signalLater(cm, "keyHandled", cm, name, e);
    if (result == "handled" || result == "multi") {
        e_preventDefault(e);
        restartBlink(cm);
    }
    return !!result;
}
// Handle a key from the keydown event.
function handleKeyBinding(cm, e) {
    let name = keyName(e, true);
    if (!name)
        return false;
    if (e.shiftKey && !cm.state.keySeq) {
        // First try to resolve full name (including 'Shift-'). Failing
        // that, see if there is a cursor-motion command (starting with
        // 'go') bound to the keyname without 'Shift-'.
        return dispatchKey(cm, "Shift-" + name, e, b => doHandleBinding(cm, b, true))
            || dispatchKey(cm, name, e, b => {
                if (typeof b == "string" ? /^go[A-Z]/.test(b) : b.motion)
                    return doHandleBinding(cm, b);
            });
    }
    else {
        return dispatchKey(cm, name, e, b => doHandleBinding(cm, b));
    }
}
// Handle a key from the keypress event
function handleCharBinding(cm, e, ch) {
    return dispatchKey(cm, "'" + ch + "'", e, b => doHandleBinding(cm, b, true));
}
let lastStoppedKey = null;
export function onKeyDown(e) {
    let cm = this;
    if (e.target && e.target != cm.display.input.getField())
        return;
    cm.curOp.focus = activeElt();
    if (signalDOMEvent(cm, e))
        return;
    // IE does strange things with escape.
    if (ie && ie_version < 11 && e.keyCode == 27)
        e.returnValue = false;
    let code = e.keyCode;
    cm.display.shift = code == 16 || e.shiftKey;
    let handled = handleKeyBinding(cm, e);
    if (presto) {
        lastStoppedKey = handled ? code : null;
        // Opera has no cut event... we try to at least catch the key combo
        if (!handled && code == 88 && !hasCopyEvent && (mac ? e.metaKey : e.ctrlKey))
            cm.replaceSelection("", null, "cut");
    }
    if (gecko && !mac && !handled && code == 46 && e.shiftKey && !e.ctrlKey && document.execCommand)
        document.execCommand("cut");
    // Turn mouse into crosshair when Alt is held on Mac.
    if (code == 18 && !/\bCodeMirror-crosshair\b/.test(cm.display.lineDiv.className))
        showCrossHair(cm);
}
function showCrossHair(cm) {
    let lineDiv = cm.display.lineDiv;
    addClass(lineDiv, "CodeMirror-crosshair");
    function up(e) {
        if (e.keyCode == 18 || !e.altKey) {
            rmClass(lineDiv, "CodeMirror-crosshair");
            off(document, "keyup", up);
            off(document, "mouseover", up);
        }
    }
    on(document, "keyup", up);
    on(document, "mouseover", up);
}
export function onKeyUp(e) {
    if (e.keyCode == 16)
        this.doc.sel.shift = false;
    signalDOMEvent(this, e);
}
export function onKeyPress(e) {
    let cm = this;
    if (e.target && e.target != cm.display.input.getField())
        return;
    if (eventInWidget(cm.display, e) || signalDOMEvent(cm, e) || e.ctrlKey && !e.altKey || mac && e.metaKey)
        return;
    let keyCode = e.keyCode, charCode = e.charCode;
    if (presto && keyCode == lastStoppedKey) {
        lastStoppedKey = null;
        e_preventDefault(e);
        return;
    }
    if ((presto && (!e.which || e.which < 10)) && handleKeyBinding(cm, e))
        return;
    let ch = String.fromCharCode(charCode == null ? keyCode : charCode);
    // Some browsers fire keypress events for backspace
    if (ch == "\x08")
        return;
    if (handleCharBinding(cm, e, ch))
        return;
    cm.display.input.onKeyPress(e);
}
//# sourceMappingURL=key_events.js.map