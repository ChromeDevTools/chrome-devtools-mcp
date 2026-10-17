import { Pos } from "../line/pos.js";
import { cursorCoords, displayHeight, displayWidth, estimateCoords, paddingTop, paddingVert, scrollGap, textHeight } from "../measurement/position_measurement.js";
import { gecko, phantom } from "../util/browser.js";
import { elt } from "../util/dom.js";
import { signalDOMEvent } from "../util/event.js";
import { startWorker } from "./highlight_worker.js";
import { alignHorizontally } from "./line_numbers.js";
import { updateDisplaySimple } from "./update_display.js";
// SCROLLING THINGS INTO VIEW
// If an editor sits on the top or bottom of the window, partially
// scrolled out of view, this ensures that the cursor is visible.
export function maybeScrollWindow(cm, rect) {
    if (signalDOMEvent(cm, "scrollCursorIntoView"))
        return;
    let display = cm.display, box = display.sizer.getBoundingClientRect(), doScroll = null;
    if (rect.top + box.top < 0)
        doScroll = true;
    else if (rect.bottom + box.top > (window.innerHeight || document.documentElement.clientHeight))
        doScroll = false;
    if (doScroll != null && !phantom) {
        let scrollNode = elt("div", "\u200b", null, `position: absolute;
                         top: ${rect.top - display.viewOffset - paddingTop(cm.display)}px;
                         height: ${rect.bottom - rect.top + scrollGap(cm) + display.barHeight}px;
                         left: ${rect.left}px; width: ${Math.max(2, rect.right - rect.left)}px;`);
        cm.display.lineSpace.appendChild(scrollNode);
        scrollNode.scrollIntoView(doScroll);
        cm.display.lineSpace.removeChild(scrollNode);
    }
}
// Scroll a given position into view (immediately), verifying that
// it actually became visible (as line heights are accurately
// measured, the position of something may 'drift' during drawing).
export function scrollPosIntoView(cm, pos, end, margin) {
    if (margin == null)
        margin = 0;
    let rect;
    if (!cm.options.lineWrapping && pos == end) {
        // Set pos and end to the cursor positions around the character pos sticks to
        // If pos.sticky == "before", that is around pos.ch - 1, otherwise around pos.ch
        // If pos == Pos(_, 0, "before"), pos and end are unchanged
        pos = pos.ch ? Pos(pos.line, pos.sticky == "before" ? pos.ch - 1 : pos.ch, "after") : pos;
        end = pos.sticky == "before" ? Pos(pos.line, pos.ch + 1, "before") : pos;
    }
    for (let limit = 0; limit < 5; limit++) {
        let changed = false;
        let coords = cursorCoords(cm, pos);
        let endCoords = !end || end == pos ? coords : cursorCoords(cm, end);
        rect = { left: Math.min(coords.left, endCoords.left),
            top: Math.min(coords.top, endCoords.top) - margin,
            right: Math.max(coords.left, endCoords.left),
            bottom: Math.max(coords.bottom, endCoords.bottom) + margin };
        let scrollPos = calculateScrollPos(cm, rect);
        let startTop = cm.doc.scrollTop, startLeft = cm.doc.scrollLeft;
        if (scrollPos.scrollTop != null) {
            updateScrollTop(cm, scrollPos.scrollTop);
            if (Math.abs(cm.doc.scrollTop - startTop) > 1)
                changed = true;
        }
        if (scrollPos.scrollLeft != null) {
            setScrollLeft(cm, scrollPos.scrollLeft);
            if (Math.abs(cm.doc.scrollLeft - startLeft) > 1)
                changed = true;
        }
        if (!changed)
            break;
    }
    return rect;
}
// Scroll a given set of coordinates into view (immediately).
export function scrollIntoView(cm, rect) {
    let scrollPos = calculateScrollPos(cm, rect);
    if (scrollPos.scrollTop != null)
        updateScrollTop(cm, scrollPos.scrollTop);
    if (scrollPos.scrollLeft != null)
        setScrollLeft(cm, scrollPos.scrollLeft);
}
// Calculate a new scroll position needed to scroll the given
// rectangle into view. Returns an object with scrollTop and
// scrollLeft properties. When these are undefined, the
// vertical/horizontal position does not need to be adjusted.
function calculateScrollPos(cm, rect) {
    let display = cm.display, snapMargin = textHeight(cm.display);
    if (rect.top < 0)
        rect.top = 0;
    let screentop = cm.curOp && cm.curOp.scrollTop != null ? cm.curOp.scrollTop : display.scroller.scrollTop;
    let screen = displayHeight(cm), result = {};
    if (rect.bottom - rect.top > screen)
        rect.bottom = rect.top + screen;
    let docBottom = cm.doc.height + paddingVert(display);
    let atTop = rect.top < snapMargin, atBottom = rect.bottom > docBottom - snapMargin;
    if (rect.top < screentop) {
        result.scrollTop = atTop ? 0 : rect.top;
    }
    else if (rect.bottom > screentop + screen) {
        let newTop = Math.min(rect.top, (atBottom ? docBottom : rect.bottom) - screen);
        if (newTop != screentop)
            result.scrollTop = newTop;
    }
    let gutterSpace = cm.options.fixedGutter ? 0 : display.gutters.offsetWidth;
    let screenleft = cm.curOp && cm.curOp.scrollLeft != null ? cm.curOp.scrollLeft : display.scroller.scrollLeft - gutterSpace;
    let screenw = displayWidth(cm) - display.gutters.offsetWidth;
    let tooWide = rect.right - rect.left > screenw;
    if (tooWide)
        rect.right = rect.left + screenw;
    if (rect.left < 10)
        result.scrollLeft = 0;
    else if (rect.left < screenleft)
        result.scrollLeft = Math.max(0, rect.left + gutterSpace - (tooWide ? 0 : 10));
    else if (rect.right > screenw + screenleft - 3)
        result.scrollLeft = rect.right + (tooWide ? 0 : 10) - screenw;
    return result;
}
// Store a relative adjustment to the scroll position in the current
// operation (to be applied when the operation finishes).
export function addToScrollTop(cm, top) {
    if (top == null)
        return;
    resolveScrollToPos(cm);
    cm.curOp.scrollTop = (cm.curOp.scrollTop == null ? cm.doc.scrollTop : cm.curOp.scrollTop) + top;
}
// Make sure that at the end of the operation the current cursor is
// shown.
export function ensureCursorVisible(cm) {
    resolveScrollToPos(cm);
    let cur = cm.getCursor();
    cm.curOp.scrollToPos = { from: cur, to: cur, margin: cm.options.cursorScrollMargin };
}
export function scrollToCoords(cm, x, y) {
    if (x != null || y != null)
        resolveScrollToPos(cm);
    if (x != null)
        cm.curOp.scrollLeft = x;
    if (y != null)
        cm.curOp.scrollTop = y;
}
export function scrollToRange(cm, range) {
    resolveScrollToPos(cm);
    cm.curOp.scrollToPos = range;
}
// When an operation has its scrollToPos property set, and another
// scroll action is applied before the end of the operation, this
// 'simulates' scrolling that position into view in a cheap way, so
// that the effect of intermediate scroll commands is not ignored.
function resolveScrollToPos(cm) {
    let range = cm.curOp.scrollToPos;
    if (range) {
        cm.curOp.scrollToPos = null;
        let from = estimateCoords(cm, range.from), to = estimateCoords(cm, range.to);
        scrollToCoordsRange(cm, from, to, range.margin);
    }
}
export function scrollToCoordsRange(cm, from, to, margin) {
    let sPos = calculateScrollPos(cm, {
        left: Math.min(from.left, to.left),
        top: Math.min(from.top, to.top) - margin,
        right: Math.max(from.right, to.right),
        bottom: Math.max(from.bottom, to.bottom) + margin
    });
    scrollToCoords(cm, sPos.scrollLeft, sPos.scrollTop);
}
// Sync the scrollable area and scrollbars, ensure the viewport
// covers the visible area.
export function updateScrollTop(cm, val) {
    if (Math.abs(cm.doc.scrollTop - val) < 2)
        return;
    if (!gecko)
        updateDisplaySimple(cm, { top: val });
    setScrollTop(cm, val, true);
    if (gecko)
        updateDisplaySimple(cm);
    startWorker(cm, 100);
}
export function setScrollTop(cm, val, forceScroll) {
    val = Math.max(0, Math.min(cm.display.scroller.scrollHeight - cm.display.scroller.clientHeight, val));
    if (cm.display.scroller.scrollTop == val && !forceScroll)
        return;
    cm.doc.scrollTop = val;
    cm.display.scrollbars.setScrollTop(val);
    if (cm.display.scroller.scrollTop != val)
        cm.display.scroller.scrollTop = val;
}
// Sync scroller and scrollbar, ensure the gutter elements are
// aligned.
export function setScrollLeft(cm, val, isScroller, forceScroll) {
    val = Math.max(0, Math.min(val, cm.display.scroller.scrollWidth - cm.display.scroller.clientWidth));
    if ((isScroller ? val == cm.doc.scrollLeft : Math.abs(cm.doc.scrollLeft - val) < 2) && !forceScroll)
        return;
    cm.doc.scrollLeft = val;
    alignHorizontally(cm);
    if (cm.display.scroller.scrollLeft != val)
        cm.display.scroller.scrollLeft = val;
    cm.display.scrollbars.setScrollLeft(val);
}
//# sourceMappingURL=scrolling.js.map