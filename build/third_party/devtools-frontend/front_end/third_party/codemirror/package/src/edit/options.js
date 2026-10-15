import { onBlur } from "../display/focus.js";
import { getGutters, updateGutters } from "../display/gutters.js";
import { loadMode, resetModeState } from "../display/mode_state.js";
import { initScrollbars, updateScrollbars } from "../display/scrollbars.js";
import { updateSelection } from "../display/selection.js";
import { regChange } from "../display/view_tracking.js";
import { getKeyMap } from "../input/keymap.js";
import { defaultSpecialCharPlaceholder } from "../line/line_data.js";
import { Pos } from "../line/pos.js";
import { findMaxLine } from "../line/spans.js";
import { clearCaches, compensateForHScroll, estimateLineHeights } from "../measurement/position_measurement.js";
import { replaceRange } from "../model/changes.js";
import { mobile, windows } from "../util/browser.js";
import { addClass, rmClass } from "../util/dom.js";
import { off, on } from "../util/event.js";
import { themeChanged } from "./utils.js";
export let Init = { toString: function () { return "CodeMirror.Init"; } };
export let defaults = {};
export let optionHandlers = {};
export function defineOptions(CodeMirror) {
    let optionHandlers = CodeMirror.optionHandlers;
    function option(name, deflt, handle, notOnInit) {
        CodeMirror.defaults[name] = deflt;
        if (handle)
            optionHandlers[name] =
                notOnInit ? (cm, val, old) => { if (old != Init)
                    handle(cm, val, old); } : handle;
    }
    CodeMirror.defineOption = option;
    // Passed to option handlers when there is no old value.
    CodeMirror.Init = Init;
    // These two are, on init, called from the constructor because they
    // have to be initialized before the editor can start at all.
    option("value", "", (cm, val) => cm.setValue(val), true);
    option("mode", null, (cm, val) => {
        cm.doc.modeOption = val;
        loadMode(cm);
    }, true);
    option("indentUnit", 2, loadMode, true);
    option("indentWithTabs", false);
    option("smartIndent", true);
    option("tabSize", 4, cm => {
        resetModeState(cm);
        clearCaches(cm);
        regChange(cm);
    }, true);
    option("lineSeparator", null, (cm, val) => {
        cm.doc.lineSep = val;
        if (!val)
            return;
        let newBreaks = [], lineNo = cm.doc.first;
        cm.doc.iter(line => {
            for (let pos = 0;;) {
                let found = line.text.indexOf(val, pos);
                if (found == -1)
                    break;
                pos = found + val.length;
                newBreaks.push(Pos(lineNo, found));
            }
            lineNo++;
        });
        for (let i = newBreaks.length - 1; i >= 0; i--)
            replaceRange(cm.doc, val, newBreaks[i], Pos(newBreaks[i].line, newBreaks[i].ch + val.length));
    });
    option("specialChars", /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u200b\u200e\u200f\u2028\u2029\ufeff\ufff9-\ufffc]/g, (cm, val, old) => {
        cm.state.specialChars = new RegExp(val.source + (val.test("\t") ? "" : "|\t"), "g");
        if (old != Init)
            cm.refresh();
    });
    option("specialCharPlaceholder", defaultSpecialCharPlaceholder, cm => cm.refresh(), true);
    option("electricChars", true);
    option("inputStyle", mobile ? "contenteditable" : "textarea", () => {
        throw new Error("inputStyle can not (yet) be changed in a running editor"); // FIXME
    }, true);
    option("spellcheck", false, (cm, val) => cm.getInputField().spellcheck = val, true);
    option("autocorrect", false, (cm, val) => cm.getInputField().autocorrect = val, true);
    option("autocapitalize", false, (cm, val) => cm.getInputField().autocapitalize = val, true);
    option("rtlMoveVisually", !windows);
    option("wholeLineUpdateBefore", true);
    option("theme", "default", cm => {
        themeChanged(cm);
        updateGutters(cm);
    }, true);
    option("keyMap", "default", (cm, val, old) => {
        let next = getKeyMap(val);
        let prev = old != Init && getKeyMap(old);
        if (prev && prev.detach)
            prev.detach(cm, next);
        if (next.attach)
            next.attach(cm, prev || null);
    });
    option("extraKeys", null);
    option("configureMouse", null);
    option("lineWrapping", false, wrappingChanged, true);
    option("gutters", [], (cm, val) => {
        cm.display.gutterSpecs = getGutters(val, cm.options.lineNumbers);
        updateGutters(cm);
    }, true);
    option("fixedGutter", true, (cm, val) => {
        cm.display.gutters.style.left = val ? compensateForHScroll(cm.display) + "px" : "0";
        cm.refresh();
    }, true);
    option("coverGutterNextToScrollbar", false, cm => updateScrollbars(cm), true);
    option("scrollbarStyle", "native", cm => {
        initScrollbars(cm);
        updateScrollbars(cm);
        cm.display.scrollbars.setScrollTop(cm.doc.scrollTop);
        cm.display.scrollbars.setScrollLeft(cm.doc.scrollLeft);
    }, true);
    option("lineNumbers", false, (cm, val) => {
        cm.display.gutterSpecs = getGutters(cm.options.gutters, val);
        updateGutters(cm);
    }, true);
    option("firstLineNumber", 1, updateGutters, true);
    option("lineNumberFormatter", integer => integer, updateGutters, true);
    option("showCursorWhenSelecting", false, updateSelection, true);
    option("resetSelectionOnContextMenu", true);
    option("lineWiseCopyCut", true);
    option("pasteLinesPerSelection", true);
    option("selectionsMayTouch", false);
    option("readOnly", false, (cm, val) => {
        if (val == "nocursor") {
            onBlur(cm);
            cm.display.input.blur();
        }
        cm.display.input.readOnlyChanged(val);
    });
    option("screenReaderLabel", null, (cm, val) => {
        val = (val === '') ? null : val;
        cm.display.input.screenReaderLabelChanged(val);
    });
    option("disableInput", false, (cm, val) => { if (!val)
        cm.display.input.reset(); }, true);
    option("dragDrop", true, dragDropChanged);
    option("allowDropFileTypes", null);
    option("cursorBlinkRate", 530);
    option("cursorScrollMargin", 0);
    option("cursorHeight", 1, updateSelection, true);
    option("singleCursorHeightPerLine", true, updateSelection, true);
    option("workTime", 100);
    option("workDelay", 100);
    option("flattenSpans", true, resetModeState, true);
    option("addModeClass", false, resetModeState, true);
    option("pollInterval", 100);
    option("undoDepth", 200, (cm, val) => cm.doc.history.undoDepth = val);
    option("historyEventDelay", 1250);
    option("viewportMargin", 10, cm => cm.refresh(), true);
    option("maxHighlightLength", 10000, resetModeState, true);
    option("moveInputWithCursor", true, (cm, val) => {
        if (!val)
            cm.display.input.resetPosition();
    });
    option("tabindex", null, (cm, val) => cm.display.input.getField().tabIndex = val || "");
    option("autofocus", null);
    option("direction", "ltr", (cm, val) => cm.doc.setDirection(val), true);
    option("phrases", null);
}
function dragDropChanged(cm, value, old) {
    let wasOn = old && old != Init;
    if (!value != !wasOn) {
        let funcs = cm.display.dragFunctions;
        let toggle = value ? on : off;
        toggle(cm.display.scroller, "dragstart", funcs.start);
        toggle(cm.display.scroller, "dragenter", funcs.enter);
        toggle(cm.display.scroller, "dragover", funcs.over);
        toggle(cm.display.scroller, "dragleave", funcs.leave);
        toggle(cm.display.scroller, "drop", funcs.drop);
    }
}
function wrappingChanged(cm) {
    if (cm.options.lineWrapping) {
        addClass(cm.display.wrapper, "CodeMirror-wrap");
        cm.display.sizer.style.minWidth = "";
        cm.display.sizerWidth = null;
    }
    else {
        rmClass(cm.display.wrapper, "CodeMirror-wrap");
        findMaxLine(cm);
    }
    estimateLineHeights(cm);
    regChange(cm);
    clearCaches(cm);
    setTimeout(() => updateScrollbars(cm), 100);
}
//# sourceMappingURL=options.js.map