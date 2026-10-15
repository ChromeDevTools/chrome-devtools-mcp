import { Display } from "../display/Display.js";
import { onBlur, onFocus } from "../display/focus.js";
import { maybeUpdateLineNumberWidth } from "../display/line_numbers.js";
import { endOperation, operation, startOperation } from "../display/operations.js";
import { onScrollWheel } from "../display/scroll_events.js";
import { initScrollbars } from "../display/scrollbars.js";
import { setScrollLeft, updateScrollTop } from "../display/scrolling.js";
import { clipPos, Pos } from "../line/pos.js";
import { posFromMouse } from "../measurement/position_measurement.js";
import { eventInWidget } from "../measurement/widgets.js";
import Doc from "../model/Doc.js";
import { attachDoc } from "../model/document_data.js";
import { Range } from "../model/selection.js";
import { extendSelection } from "../model/selection_updates.js";
import { ie, ie_version, mobile, webkit } from "../util/browser.js";
import { e_preventDefault, e_stop, on, signal, signalDOMEvent } from "../util/event.js";
import { copyObj, Delayed } from "../util/misc.js";
import { clearDragCursor, onDragOver, onDragStart, onDrop } from "./drop_events.js";
import { ensureGlobalHandlers } from "./global_events.js";
import { onKeyDown, onKeyPress, onKeyUp } from "./key_events.js";
import { clickInGutter, onContextMenu, onMouseDown } from "./mouse_events.js";
import { defaults, Init, optionHandlers } from "./options.js";
import { themeChanged } from "./utils.js";
// A CodeMirror instance represents an editor. This is the object
// that user code is usually dealing with.
export function CodeMirror(place, options) {
    if (!(this instanceof CodeMirror))
        return new CodeMirror(place, options);
    this.options = options = options ? copyObj(options) : {};
    // Determine effective options based on given values and defaults.
    copyObj(defaults, options, false);
    let doc = options.value;
    if (typeof doc == "string")
        doc = new Doc(doc, options.mode, null, options.lineSeparator, options.direction);
    else if (options.mode)
        doc.modeOption = options.mode;
    this.doc = doc;
    let input = new CodeMirror.inputStyles[options.inputStyle](this);
    let display = this.display = new Display(place, doc, input, options);
    display.wrapper.CodeMirror = this;
    themeChanged(this);
    if (options.lineWrapping)
        this.display.wrapper.className += " CodeMirror-wrap";
    initScrollbars(this);
    this.state = {
        keyMaps: [], // stores maps added by addKeyMap
        overlays: [], // highlighting overlays, as added by addOverlay
        modeGen: 0, // bumped when mode/overlay changes, used to invalidate highlighting info
        overwrite: false,
        delayingBlurEvent: false,
        focused: false,
        suppressEdits: false, // used to disable editing during key handlers when in readOnly mode
        pasteIncoming: -1, cutIncoming: -1, // help recognize paste/cut edits in input.poll
        selectingText: false,
        draggingText: false,
        highlight: new Delayed(), // stores highlight worker timeout
        keySeq: null, // Unfinished key sequence
        specialChars: null
    };
    if (options.autofocus && !mobile)
        display.input.focus();
    // Override magic textarea content restore that IE sometimes does
    // on our hidden textarea on reload
    if (ie && ie_version < 11)
        setTimeout(() => this.display.input.reset(true), 20);
    registerEventHandlers(this);
    ensureGlobalHandlers();
    startOperation(this);
    this.curOp.forceUpdate = true;
    attachDoc(this, doc);
    if ((options.autofocus && !mobile) || this.hasFocus())
        setTimeout(() => {
            if (this.hasFocus() && !this.state.focused)
                onFocus(this);
        }, 20);
    else
        onBlur(this);
    for (let opt in optionHandlers)
        if (optionHandlers.hasOwnProperty(opt))
            optionHandlers[opt](this, options[opt], Init);
    maybeUpdateLineNumberWidth(this);
    if (options.finishInit)
        options.finishInit(this);
    for (let i = 0; i < initHooks.length; ++i)
        initHooks[i](this);
    endOperation(this);
    // Suppress optimizelegibility in Webkit, since it breaks text
    // measuring on line wrapping boundaries.
    if (webkit && options.lineWrapping &&
        getComputedStyle(display.lineDiv).textRendering == "optimizelegibility")
        display.lineDiv.style.textRendering = "auto";
}
// The default configuration options.
CodeMirror.defaults = defaults;
// Functions to run when options are changed.
CodeMirror.optionHandlers = optionHandlers;
export default CodeMirror;
// Attach the necessary event handlers when initializing the editor
function registerEventHandlers(cm) {
    let d = cm.display;
    on(d.scroller, "mousedown", operation(cm, onMouseDown));
    // Older IE's will not fire a second mousedown for a double click
    if (ie && ie_version < 11)
        on(d.scroller, "dblclick", operation(cm, e => {
            if (signalDOMEvent(cm, e))
                return;
            let pos = posFromMouse(cm, e);
            if (!pos || clickInGutter(cm, e) || eventInWidget(cm.display, e))
                return;
            e_preventDefault(e);
            let word = cm.findWordAt(pos);
            extendSelection(cm.doc, word.anchor, word.head);
        }));
    else
        on(d.scroller, "dblclick", e => signalDOMEvent(cm, e) || e_preventDefault(e));
    // Some browsers fire contextmenu *after* opening the menu, at
    // which point we can't mess with it anymore. Context menu is
    // handled in onMouseDown for these browsers.
    on(d.scroller, "contextmenu", e => onContextMenu(cm, e));
    on(d.input.getField(), "contextmenu", e => {
        if (!d.scroller.contains(e.target))
            onContextMenu(cm, e);
    });
    // Used to suppress mouse event handling when a touch happens
    let touchFinished, prevTouch = { end: 0 };
    function finishTouch() {
        if (d.activeTouch) {
            touchFinished = setTimeout(() => d.activeTouch = null, 1000);
            prevTouch = d.activeTouch;
            prevTouch.end = +new Date;
        }
    }
    function isMouseLikeTouchEvent(e) {
        if (e.touches.length != 1)
            return false;
        let touch = e.touches[0];
        return touch.radiusX <= 1 && touch.radiusY <= 1;
    }
    function farAway(touch, other) {
        if (other.left == null)
            return true;
        let dx = other.left - touch.left, dy = other.top - touch.top;
        return dx * dx + dy * dy > 20 * 20;
    }
    on(d.scroller, "touchstart", e => {
        if (!signalDOMEvent(cm, e) && !isMouseLikeTouchEvent(e) && !clickInGutter(cm, e)) {
            d.input.ensurePolled();
            clearTimeout(touchFinished);
            let now = +new Date;
            d.activeTouch = { start: now, moved: false,
                prev: now - prevTouch.end <= 300 ? prevTouch : null };
            if (e.touches.length == 1) {
                d.activeTouch.left = e.touches[0].pageX;
                d.activeTouch.top = e.touches[0].pageY;
            }
        }
    });
    on(d.scroller, "touchmove", () => {
        if (d.activeTouch)
            d.activeTouch.moved = true;
    });
    on(d.scroller, "touchend", e => {
        let touch = d.activeTouch;
        if (touch && !eventInWidget(d, e) && touch.left != null &&
            !touch.moved && new Date - touch.start < 300) {
            let pos = cm.coordsChar(d.activeTouch, "page"), range;
            if (!touch.prev || farAway(touch, touch.prev)) // Single tap
                range = new Range(pos, pos);
            else if (!touch.prev.prev || farAway(touch, touch.prev.prev)) // Double tap
                range = cm.findWordAt(pos);
            else // Triple tap
                range = new Range(Pos(pos.line, 0), clipPos(cm.doc, Pos(pos.line + 1, 0)));
            cm.setSelection(range.anchor, range.head);
            cm.focus();
            e_preventDefault(e);
        }
        finishTouch();
    });
    on(d.scroller, "touchcancel", finishTouch);
    // Sync scrolling between fake scrollbars and real scrollable
    // area, ensure viewport is updated when scrolling.
    on(d.scroller, "scroll", () => {
        if (d.scroller.clientHeight) {
            updateScrollTop(cm, d.scroller.scrollTop);
            setScrollLeft(cm, d.scroller.scrollLeft, true);
            signal(cm, "scroll", cm);
        }
    });
    // Listen to wheel events in order to try and update the viewport on time.
    on(d.scroller, "mousewheel", e => onScrollWheel(cm, e));
    on(d.scroller, "DOMMouseScroll", e => onScrollWheel(cm, e));
    // Prevent wrapper from ever scrolling
    on(d.wrapper, "scroll", () => d.wrapper.scrollTop = d.wrapper.scrollLeft = 0);
    d.dragFunctions = {
        enter: e => { if (!signalDOMEvent(cm, e))
            e_stop(e); },
        over: e => { if (!signalDOMEvent(cm, e)) {
            onDragOver(cm, e);
            e_stop(e);
        } },
        start: e => onDragStart(cm, e),
        drop: operation(cm, onDrop),
        leave: e => { if (!signalDOMEvent(cm, e)) {
            clearDragCursor(cm);
        } }
    };
    let inp = d.input.getField();
    on(inp, "keyup", e => onKeyUp.call(cm, e));
    on(inp, "keydown", operation(cm, onKeyDown));
    on(inp, "keypress", operation(cm, onKeyPress));
    on(inp, "focus", e => onFocus(cm, e));
    on(inp, "blur", e => onBlur(cm, e));
}
let initHooks = [];
CodeMirror.defineInitHook = f => initHooks.push(f);
//# sourceMappingURL=CodeMirror.js.map