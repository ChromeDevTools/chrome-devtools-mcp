import { sawCollapsedSpans } from "../line/saw_special_spans.js";
import { heightAtLine, visualLineEndNo, visualLineNo } from "../line/spans.js";
import { getLine, lineNumberFor } from "../line/utils_line.js";
import { displayHeight, displayWidth, getDimensions, paddingVert, scrollGap } from "../measurement/position_measurement.js";
import { mac, webkit } from "../util/browser.js";
import { activeElt, contains, removeChildren } from "../util/dom.js";
import { hasHandler, signal } from "../util/event.js";
import { indexOf } from "../util/misc.js";
import { signalLater } from "../util/operation_group.js";
import { startWorker } from "./highlight_worker.js";
import { maybeUpdateLineNumberWidth } from "./line_numbers.js";
import { measureForScrollbars, updateScrollbars } from "./scrollbars.js";
import { updateSelection } from "./selection.js";
import { buildLineElement, updateLineForChanges } from "./update_line.js";
import { updateHeightsInViewport, visibleLines } from "./update_lines.js";
import { adjustView, countDirtyView, resetView } from "./view_tracking.js";
// DISPLAY DRAWING
export class DisplayUpdate {
    constructor(cm, viewport, force) {
        let display = cm.display;
        this.viewport = viewport;
        // Store some values that we'll need later (but don't want to force a relayout for)
        this.visible = visibleLines(display, cm.doc, viewport);
        this.editorIsHidden = !display.wrapper.offsetWidth;
        this.wrapperHeight = display.wrapper.clientHeight;
        this.wrapperWidth = display.wrapper.clientWidth;
        this.oldDisplayWidth = displayWidth(cm);
        this.force = force;
        this.dims = getDimensions(cm);
        this.events = [];
    }
    signal(emitter, type) {
        if (hasHandler(emitter, type))
            this.events.push(arguments);
    }
    finish() {
        for (let i = 0; i < this.events.length; i++)
            signal.apply(null, this.events[i]);
    }
}
export function maybeClipScrollbars(cm) {
    let display = cm.display;
    if (!display.scrollbarsClipped && display.scroller.offsetWidth) {
        display.nativeBarWidth = display.scroller.offsetWidth - display.scroller.clientWidth;
        display.heightForcer.style.height = scrollGap(cm) + "px";
        display.sizer.style.marginBottom = -display.nativeBarWidth + "px";
        display.sizer.style.borderRightWidth = scrollGap(cm) + "px";
        display.scrollbarsClipped = true;
    }
}
function selectionSnapshot(cm) {
    if (cm.hasFocus())
        return null;
    let active = activeElt();
    if (!active || !contains(cm.display.lineDiv, active))
        return null;
    let result = { activeElt: active };
    if (window.getSelection) {
        let sel = window.getSelection();
        if (sel.anchorNode && sel.extend && contains(cm.display.lineDiv, sel.anchorNode)) {
            result.anchorNode = sel.anchorNode;
            result.anchorOffset = sel.anchorOffset;
            result.focusNode = sel.focusNode;
            result.focusOffset = sel.focusOffset;
        }
    }
    return result;
}
function restoreSelection(snapshot) {
    if (!snapshot || !snapshot.activeElt || snapshot.activeElt == activeElt())
        return;
    snapshot.activeElt.focus();
    if (!/^(INPUT|TEXTAREA)$/.test(snapshot.activeElt.nodeName) &&
        snapshot.anchorNode && contains(document.body, snapshot.anchorNode) && contains(document.body, snapshot.focusNode)) {
        let sel = window.getSelection(), range = document.createRange();
        range.setEnd(snapshot.anchorNode, snapshot.anchorOffset);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
        sel.extend(snapshot.focusNode, snapshot.focusOffset);
    }
}
// Does the actual updating of the line display. Bails out
// (returning false) when there is nothing to be done and forced is
// false.
export function updateDisplayIfNeeded(cm, update) {
    let display = cm.display, doc = cm.doc;
    if (update.editorIsHidden) {
        resetView(cm);
        return false;
    }
    // Bail out if the visible area is already rendered and nothing changed.
    if (!update.force &&
        update.visible.from >= display.viewFrom && update.visible.to <= display.viewTo &&
        (display.updateLineNumbers == null || display.updateLineNumbers >= display.viewTo) &&
        display.renderedView == display.view && countDirtyView(cm) == 0)
        return false;
    if (maybeUpdateLineNumberWidth(cm)) {
        resetView(cm);
        update.dims = getDimensions(cm);
    }
    // Compute a suitable new viewport (from & to)
    let end = doc.first + doc.size;
    let from = Math.max(update.visible.from - cm.options.viewportMargin, doc.first);
    let to = Math.min(end, update.visible.to + cm.options.viewportMargin);
    if (display.viewFrom < from && from - display.viewFrom < 20)
        from = Math.max(doc.first, display.viewFrom);
    if (display.viewTo > to && display.viewTo - to < 20)
        to = Math.min(end, display.viewTo);
    if (sawCollapsedSpans) {
        from = visualLineNo(cm.doc, from);
        to = visualLineEndNo(cm.doc, to);
    }
    let different = from != display.viewFrom || to != display.viewTo ||
        display.lastWrapHeight != update.wrapperHeight || display.lastWrapWidth != update.wrapperWidth;
    adjustView(cm, from, to);
    display.viewOffset = heightAtLine(getLine(cm.doc, display.viewFrom));
    // Position the mover div to align with the current scroll position
    cm.display.mover.style.top = display.viewOffset + "px";
    let toUpdate = countDirtyView(cm);
    if (!different && toUpdate == 0 && !update.force && display.renderedView == display.view &&
        (display.updateLineNumbers == null || display.updateLineNumbers >= display.viewTo))
        return false;
    // For big changes, we hide the enclosing element during the
    // update, since that speeds up the operations on most browsers.
    let selSnapshot = selectionSnapshot(cm);
    if (toUpdate > 4)
        display.lineDiv.style.display = "none";
    patchDisplay(cm, display.updateLineNumbers, update.dims);
    if (toUpdate > 4)
        display.lineDiv.style.display = "";
    display.renderedView = display.view;
    // There might have been a widget with a focused element that got
    // hidden or updated, if so re-focus it.
    restoreSelection(selSnapshot);
    // Prevent selection and cursors from interfering with the scroll
    // width and height.
    removeChildren(display.cursorDiv);
    removeChildren(display.selectionDiv);
    display.gutters.style.height = display.sizer.style.minHeight = 0;
    if (different) {
        display.lastWrapHeight = update.wrapperHeight;
        display.lastWrapWidth = update.wrapperWidth;
        startWorker(cm, 400);
    }
    display.updateLineNumbers = null;
    return true;
}
export function postUpdateDisplay(cm, update) {
    let viewport = update.viewport;
    for (let first = true;; first = false) {
        if (!first || !cm.options.lineWrapping || update.oldDisplayWidth == displayWidth(cm)) {
            // Clip forced viewport to actual scrollable area.
            if (viewport && viewport.top != null)
                viewport = { top: Math.min(cm.doc.height + paddingVert(cm.display) - displayHeight(cm), viewport.top) };
            // Updated line heights might result in the drawn area not
            // actually covering the viewport. Keep looping until it does.
            update.visible = visibleLines(cm.display, cm.doc, viewport);
            if (update.visible.from >= cm.display.viewFrom && update.visible.to <= cm.display.viewTo)
                break;
        }
        else if (first) {
            update.visible = visibleLines(cm.display, cm.doc, viewport);
        }
        if (!updateDisplayIfNeeded(cm, update))
            break;
        updateHeightsInViewport(cm);
        let barMeasure = measureForScrollbars(cm);
        updateSelection(cm);
        updateScrollbars(cm, barMeasure);
        setDocumentHeight(cm, barMeasure);
        update.force = false;
    }
    update.signal(cm, "update", cm);
    if (cm.display.viewFrom != cm.display.reportedViewFrom || cm.display.viewTo != cm.display.reportedViewTo) {
        update.signal(cm, "viewportChange", cm, cm.display.viewFrom, cm.display.viewTo);
        cm.display.reportedViewFrom = cm.display.viewFrom;
        cm.display.reportedViewTo = cm.display.viewTo;
    }
}
export function updateDisplaySimple(cm, viewport) {
    let update = new DisplayUpdate(cm, viewport);
    if (updateDisplayIfNeeded(cm, update)) {
        updateHeightsInViewport(cm);
        postUpdateDisplay(cm, update);
        let barMeasure = measureForScrollbars(cm);
        updateSelection(cm);
        updateScrollbars(cm, barMeasure);
        setDocumentHeight(cm, barMeasure);
        update.finish();
    }
}
// Sync the actual display DOM structure with display.view, removing
// nodes for lines that are no longer in view, and creating the ones
// that are not there yet, and updating the ones that are out of
// date.
function patchDisplay(cm, updateNumbersFrom, dims) {
    let display = cm.display, lineNumbers = cm.options.lineNumbers;
    let container = display.lineDiv, cur = container.firstChild;
    function rm(node) {
        let next = node.nextSibling;
        // Works around a throw-scroll bug in OS X Webkit
        if (webkit && mac && cm.display.currentWheelTarget == node)
            node.style.display = "none";
        else
            node.parentNode.removeChild(node);
        return next;
    }
    let view = display.view, lineN = display.viewFrom;
    // Loop over the elements in the view, syncing cur (the DOM nodes
    // in display.lineDiv) with the view as we go.
    for (let i = 0; i < view.length; i++) {
        let lineView = view[i];
        if (lineView.hidden) {
        }
        else if (!lineView.node || lineView.node.parentNode != container) { // Not drawn yet
            let node = buildLineElement(cm, lineView, lineN, dims);
            container.insertBefore(node, cur);
        }
        else { // Already drawn
            while (cur != lineView.node)
                cur = rm(cur);
            let updateNumber = lineNumbers && updateNumbersFrom != null &&
                updateNumbersFrom <= lineN && lineView.lineNumber;
            if (lineView.changes) {
                if (indexOf(lineView.changes, "gutter") > -1)
                    updateNumber = false;
                updateLineForChanges(cm, lineView, lineN, dims);
            }
            if (updateNumber) {
                removeChildren(lineView.lineNumber);
                lineView.lineNumber.appendChild(document.createTextNode(lineNumberFor(cm.options, lineN)));
            }
            cur = lineView.node.nextSibling;
        }
        lineN += lineView.size;
    }
    while (cur)
        cur = rm(cur);
}
export function updateGutterSpace(display) {
    let width = display.gutters.offsetWidth;
    display.sizer.style.marginLeft = width + "px";
    // Send an event to consumers responding to changes in gutter width.
    signalLater(display, "gutterChanged", display);
}
export function setDocumentHeight(cm, measure) {
    cm.display.sizer.style.minHeight = measure.docHeight + "px";
    cm.display.heightForcer.style.top = measure.docHeight + "px";
    cm.display.gutters.style.height = (measure.docHeight + cm.display.barHeight + scrollGap(cm)) + "px";
}
//# sourceMappingURL=update_display.js.map