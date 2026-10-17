import { operation, runInOp } from "../display/operations.js";
import { prepareSelection } from "../display/selection.js";
import { cursorCoords, posFromMouse } from "../measurement/position_measurement.js";
import { eventInWidget } from "../measurement/widgets.js";
import { simpleSelection } from "../model/selection.js";
import { selectAll, setSelection } from "../model/selection_updates.js";
import { captureRightClick, ie, ie_version, ios, mac, mobile, presto, webkit } from "../util/browser.js";
import { activeElt, removeChildrenAndAdd, selectInput } from "../util/dom.js";
import { e_preventDefault, e_stop, off, on, signalDOMEvent } from "../util/event.js";
import { hasSelection } from "../util/feature_detection.js";
import { Delayed, sel_dontScroll } from "../util/misc.js";
import { applyTextInput, copyableRanges, handlePaste, hiddenTextarea, setLastCopied } from "./input.js";
// TEXTAREA INPUT STYLE
export default class TextareaInput {
    constructor(cm) {
        this.cm = cm;
        // See input.poll and input.reset
        this.prevInput = "";
        // Flag that indicates whether we expect input to appear real soon
        // now (after some event like 'keypress' or 'input') and are
        // polling intensively.
        this.pollingFast = false;
        // Self-resetting timeout for the poller
        this.polling = new Delayed();
        // Used to work around IE issue with selection being forgotten when focus moves away from textarea
        this.hasSelection = false;
        this.composing = null;
    }
    init(display) {
        let input = this, cm = this.cm;
        this.createField(display);
        const te = this.textarea;
        display.wrapper.insertBefore(this.wrapper, display.wrapper.firstChild);
        // Needed to hide big blue blinking cursor on Mobile Safari (doesn't seem to work in iOS 8 anymore)
        if (ios)
            te.style.width = "0px";
        on(te, "input", () => {
            if (ie && ie_version >= 9 && this.hasSelection)
                this.hasSelection = null;
            input.poll();
        });
        on(te, "paste", e => {
            if (signalDOMEvent(cm, e) || handlePaste(e, cm))
                return;
            cm.state.pasteIncoming = +new Date;
            input.fastPoll();
        });
        function prepareCopyCut(e) {
            if (signalDOMEvent(cm, e))
                return;
            if (cm.somethingSelected()) {
                setLastCopied({ lineWise: false, text: cm.getSelections() });
            }
            else if (!cm.options.lineWiseCopyCut) {
                return;
            }
            else {
                let ranges = copyableRanges(cm);
                setLastCopied({ lineWise: true, text: ranges.text });
                if (e.type == "cut") {
                    cm.setSelections(ranges.ranges, null, sel_dontScroll);
                }
                else {
                    input.prevInput = "";
                    te.value = ranges.text.join("\n");
                    selectInput(te);
                }
            }
            if (e.type == "cut")
                cm.state.cutIncoming = +new Date;
        }
        on(te, "cut", prepareCopyCut);
        on(te, "copy", prepareCopyCut);
        on(display.scroller, "paste", e => {
            if (eventInWidget(display, e) || signalDOMEvent(cm, e))
                return;
            if (!te.dispatchEvent) {
                cm.state.pasteIncoming = +new Date;
                input.focus();
                return;
            }
            // Pass the `paste` event to the textarea so it's handled by its event listener.
            const event = new Event("paste");
            event.clipboardData = e.clipboardData;
            te.dispatchEvent(event);
        });
        // Prevent normal selection in the editor (we handle our own)
        on(display.lineSpace, "selectstart", e => {
            if (!eventInWidget(display, e))
                e_preventDefault(e);
        });
        on(te, "compositionstart", () => {
            let start = cm.getCursor("from");
            if (input.composing)
                input.composing.range.clear();
            input.composing = {
                start: start,
                range: cm.markText(start, cm.getCursor("to"), { className: "CodeMirror-composing" })
            };
        });
        on(te, "compositionend", () => {
            if (input.composing) {
                input.poll();
                input.composing.range.clear();
                input.composing = null;
            }
        });
    }
    createField(_display) {
        // Wraps and hides input textarea
        this.wrapper = hiddenTextarea();
        // The semihidden textarea that is focused when the editor is
        // focused, and receives input.
        this.textarea = this.wrapper.firstChild;
    }
    screenReaderLabelChanged(label) {
        // Label for screenreaders, accessibility
        if (label) {
            this.textarea.setAttribute('aria-label', label);
        }
        else {
            this.textarea.removeAttribute('aria-label');
        }
    }
    prepareSelection() {
        // Redraw the selection and/or cursor
        let cm = this.cm, display = cm.display, doc = cm.doc;
        let result = prepareSelection(cm);
        // Move the hidden textarea near the cursor to prevent scrolling artifacts
        if (cm.options.moveInputWithCursor) {
            let headPos = cursorCoords(cm, doc.sel.primary().head, "div");
            let wrapOff = display.wrapper.getBoundingClientRect(), lineOff = display.lineDiv.getBoundingClientRect();
            result.teTop = Math.max(0, Math.min(display.wrapper.clientHeight - 10, headPos.top + lineOff.top - wrapOff.top));
            result.teLeft = Math.max(0, Math.min(display.wrapper.clientWidth - 10, headPos.left + lineOff.left - wrapOff.left));
        }
        return result;
    }
    showSelection(drawn) {
        let cm = this.cm, display = cm.display;
        removeChildrenAndAdd(display.cursorDiv, drawn.cursors);
        removeChildrenAndAdd(display.selectionDiv, drawn.selection);
        if (drawn.teTop != null) {
            this.wrapper.style.top = drawn.teTop + "px";
            this.wrapper.style.left = drawn.teLeft + "px";
        }
    }
    // Reset the input to correspond to the selection (or to be empty,
    // when not typing and nothing is selected)
    reset(typing) {
        if (this.contextMenuPending || this.composing)
            return;
        let cm = this.cm;
        if (cm.somethingSelected()) {
            this.prevInput = "";
            let content = cm.getSelection();
            this.textarea.value = content;
            if (cm.state.focused)
                selectInput(this.textarea);
            if (ie && ie_version >= 9)
                this.hasSelection = content;
        }
        else if (!typing) {
            this.prevInput = this.textarea.value = "";
            if (ie && ie_version >= 9)
                this.hasSelection = null;
        }
    }
    getField() { return this.textarea; }
    supportsTouch() { return false; }
    focus() {
        if (this.cm.options.readOnly != "nocursor" && (!mobile || activeElt() != this.textarea)) {
            try {
                this.textarea.focus();
            }
            catch (e) { } // IE8 will throw if the textarea is display: none or not in DOM
        }
    }
    blur() { this.textarea.blur(); }
    resetPosition() {
        this.wrapper.style.top = this.wrapper.style.left = 0;
    }
    receivedFocus() { this.slowPoll(); }
    // Poll for input changes, using the normal rate of polling. This
    // runs as long as the editor is focused.
    slowPoll() {
        if (this.pollingFast)
            return;
        this.polling.set(this.cm.options.pollInterval, () => {
            this.poll();
            if (this.cm.state.focused)
                this.slowPoll();
        });
    }
    // When an event has just come in that is likely to add or change
    // something in the input textarea, we poll faster, to ensure that
    // the change appears on the screen quickly.
    fastPoll() {
        let missed = false, input = this;
        input.pollingFast = true;
        function p() {
            let changed = input.poll();
            if (!changed && !missed) {
                missed = true;
                input.polling.set(60, p);
            }
            else {
                input.pollingFast = false;
                input.slowPoll();
            }
        }
        input.polling.set(20, p);
    }
    // Read input from the textarea, and update the document to match.
    // When something is selected, it is present in the textarea, and
    // selected (unless it is huge, in which case a placeholder is
    // used). When nothing is selected, the cursor sits after previously
    // seen text (can be empty), which is stored in prevInput (we must
    // not reset the textarea when typing, because that breaks IME).
    poll() {
        let cm = this.cm, input = this.textarea, prevInput = this.prevInput;
        // Since this is called a *lot*, try to bail out as cheaply as
        // possible when it is clear that nothing happened. hasSelection
        // will be the case when there is a lot of text in the textarea,
        // in which case reading its value would be expensive.
        if (this.contextMenuPending || !cm.state.focused ||
            (hasSelection(input) && !prevInput && !this.composing) ||
            cm.isReadOnly() || cm.options.disableInput || cm.state.keySeq)
            return false;
        let text = input.value;
        // If nothing changed, bail.
        if (text == prevInput && !cm.somethingSelected())
            return false;
        // Work around nonsensical selection resetting in IE9/10, and
        // inexplicable appearance of private area unicode characters on
        // some key combos in Mac (#2689).
        if (ie && ie_version >= 9 && this.hasSelection === text ||
            mac && /[\uf700-\uf7ff]/.test(text)) {
            cm.display.input.reset();
            return false;
        }
        if (cm.doc.sel == cm.display.selForContextMenu) {
            let first = text.charCodeAt(0);
            if (first == 0x200b && !prevInput)
                prevInput = "\u200b";
            if (first == 0x21da) {
                this.reset();
                return this.cm.execCommand("undo");
            }
        }
        // Find the part of the input that is actually new
        let same = 0, l = Math.min(prevInput.length, text.length);
        while (same < l && prevInput.charCodeAt(same) == text.charCodeAt(same))
            ++same;
        runInOp(cm, () => {
            applyTextInput(cm, text.slice(same), prevInput.length - same, null, this.composing ? "*compose" : null);
            // Don't leave long text in the textarea, since it makes further polling slow
            if (text.length > 1000 || text.indexOf("\n") > -1)
                input.value = this.prevInput = "";
            else
                this.prevInput = text;
            if (this.composing) {
                this.composing.range.clear();
                this.composing.range = cm.markText(this.composing.start, cm.getCursor("to"), { className: "CodeMirror-composing" });
            }
        });
        return true;
    }
    ensurePolled() {
        if (this.pollingFast && this.poll())
            this.pollingFast = false;
    }
    onKeyPress() {
        if (ie && ie_version >= 9)
            this.hasSelection = null;
        this.fastPoll();
    }
    onContextMenu(e) {
        let input = this, cm = input.cm, display = cm.display, te = input.textarea;
        if (input.contextMenuPending)
            input.contextMenuPending();
        let pos = posFromMouse(cm, e), scrollPos = display.scroller.scrollTop;
        if (!pos || presto)
            return; // Opera is difficult.
        // Reset the current text selection only if the click is done outside of the selection
        // and 'resetSelectionOnContextMenu' option is true.
        let reset = cm.options.resetSelectionOnContextMenu;
        if (reset && cm.doc.sel.contains(pos) == -1)
            operation(cm, setSelection)(cm.doc, simpleSelection(pos), sel_dontScroll);
        let oldCSS = te.style.cssText, oldWrapperCSS = input.wrapper.style.cssText;
        let wrapperBox = input.wrapper.offsetParent.getBoundingClientRect();
        input.wrapper.style.cssText = "position: static";
        te.style.cssText = `position: absolute; width: 30px; height: 30px;
      top: ${e.clientY - wrapperBox.top - 5}px; left: ${e.clientX - wrapperBox.left - 5}px;
      z-index: 1000; background: ${ie ? "rgba(255, 255, 255, .05)" : "transparent"};
      outline: none; border-width: 0; outline: none; overflow: hidden; opacity: .05; filter: alpha(opacity=5);`;
        let oldScrollY;
        if (webkit)
            oldScrollY = window.scrollY; // Work around Chrome issue (#2712)
        display.input.focus();
        if (webkit)
            window.scrollTo(null, oldScrollY);
        display.input.reset();
        // Adds "Select all" to context menu in FF
        if (!cm.somethingSelected())
            te.value = input.prevInput = " ";
        input.contextMenuPending = rehide;
        display.selForContextMenu = cm.doc.sel;
        clearTimeout(display.detectingSelectAll);
        // Select-all will be greyed out if there's nothing to select, so
        // this adds a zero-width space so that we can later check whether
        // it got selected.
        function prepareSelectAllHack() {
            if (te.selectionStart != null) {
                let selected = cm.somethingSelected();
                let extval = "\u200b" + (selected ? te.value : "");
                te.value = "\u21da"; // Used to catch context-menu undo
                te.value = extval;
                input.prevInput = selected ? "" : "\u200b";
                te.selectionStart = 1;
                te.selectionEnd = extval.length;
                // Re-set this, in case some other handler touched the
                // selection in the meantime.
                display.selForContextMenu = cm.doc.sel;
            }
        }
        function rehide() {
            if (input.contextMenuPending != rehide)
                return;
            input.contextMenuPending = false;
            input.wrapper.style.cssText = oldWrapperCSS;
            te.style.cssText = oldCSS;
            if (ie && ie_version < 9)
                display.scrollbars.setScrollTop(display.scroller.scrollTop = scrollPos);
            // Try to detect the user choosing select-all
            if (te.selectionStart != null) {
                if (!ie || (ie && ie_version < 9))
                    prepareSelectAllHack();
                let i = 0, poll = () => {
                    if (display.selForContextMenu == cm.doc.sel && te.selectionStart == 0 &&
                        te.selectionEnd > 0 && input.prevInput == "\u200b") {
                        operation(cm, selectAll)(cm);
                    }
                    else if (i++ < 10) {
                        display.detectingSelectAll = setTimeout(poll, 500);
                    }
                    else {
                        display.selForContextMenu = null;
                        display.input.reset();
                    }
                };
                display.detectingSelectAll = setTimeout(poll, 200);
            }
        }
        if (ie && ie_version >= 9)
            prepareSelectAllHack();
        if (captureRightClick) {
            e_stop(e);
            let mouseup = () => {
                off(window, "mouseup", mouseup);
                setTimeout(rehide, 20);
            };
            on(window, "mouseup", mouseup);
        }
        else {
            setTimeout(rehide, 50);
        }
    }
    readOnlyChanged(val) {
        if (!val)
            this.reset();
        this.textarea.disabled = val == "nocursor";
        this.textarea.readOnly = !!val;
    }
    setUneditable() { }
}
TextareaInput.prototype.needsContentAttribute = false;
//# sourceMappingURL=TextareaInput.js.map