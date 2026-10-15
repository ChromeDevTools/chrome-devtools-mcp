import { chrome, gecko, ie, mac, presto, safari, webkit } from "../util/browser.js";
import { e_preventDefault } from "../util/event.js";
import { setScrollLeft, updateScrollTop } from "./scrolling.js";
import { updateDisplaySimple } from "./update_display.js";
// Since the delta values reported on mouse wheel events are
// unstandardized between browsers and even browser versions, and
// generally horribly unpredictable, this code starts by measuring
// the scroll effect that the first few mouse wheel events have,
// and, from that, detects the way it can convert deltas to pixel
// offsets afterwards.
//
// The reason we want to know the amount a wheel event will scroll
// is that it gives us a chance to update the display before the
// actual scrolling happens, reducing flickering.
let wheelSamples = 0, wheelPixelsPerUnit = null;
// Fill in a browser-detected starting value on browsers where we
// know one. These don't have to be accurate -- the result of them
// being wrong would just be a slight flicker on the first wheel
// scroll (if it is large enough).
if (ie)
    wheelPixelsPerUnit = -.53;
else if (gecko)
    wheelPixelsPerUnit = 15;
else if (chrome)
    wheelPixelsPerUnit = -.7;
else if (safari)
    wheelPixelsPerUnit = -1 / 3;
function wheelEventDelta(e) {
    let dx = e.wheelDeltaX, dy = e.wheelDeltaY;
    if (dx == null && e.detail && e.axis == e.HORIZONTAL_AXIS)
        dx = e.detail;
    if (dy == null && e.detail && e.axis == e.VERTICAL_AXIS)
        dy = e.detail;
    else if (dy == null)
        dy = e.wheelDelta;
    return { x: dx, y: dy };
}
export function wheelEventPixels(e) {
    let delta = wheelEventDelta(e);
    delta.x *= wheelPixelsPerUnit;
    delta.y *= wheelPixelsPerUnit;
    return delta;
}
export function onScrollWheel(cm, e) {
    let delta = wheelEventDelta(e), dx = delta.x, dy = delta.y;
    let display = cm.display, scroll = display.scroller;
    // Quit if there's nothing to scroll here
    let canScrollX = scroll.scrollWidth > scroll.clientWidth;
    let canScrollY = scroll.scrollHeight > scroll.clientHeight;
    if (!(dx && canScrollX || dy && canScrollY))
        return;
    // Webkit browsers on OS X abort momentum scrolls when the target
    // of the scroll event is removed from the scrollable element.
    // This hack (see related code in patchDisplay) makes sure the
    // element is kept around.
    if (dy && mac && webkit) {
        outer: for (let cur = e.target, view = display.view; cur != scroll; cur = cur.parentNode) {
            for (let i = 0; i < view.length; i++) {
                if (view[i].node == cur) {
                    cm.display.currentWheelTarget = cur;
                    break outer;
                }
            }
        }
    }
    // On some browsers, horizontal scrolling will cause redraws to
    // happen before the gutter has been realigned, causing it to
    // wriggle around in a most unseemly way. When we have an
    // estimated pixels/delta value, we just handle horizontal
    // scrolling entirely here. It'll be slightly off from native, but
    // better than glitching out.
    if (dx && !gecko && !presto && wheelPixelsPerUnit != null) {
        if (dy && canScrollY)
            updateScrollTop(cm, Math.max(0, scroll.scrollTop + dy * wheelPixelsPerUnit));
        setScrollLeft(cm, Math.max(0, scroll.scrollLeft + dx * wheelPixelsPerUnit));
        // Only prevent default scrolling if vertical scrolling is
        // actually possible. Otherwise, it causes vertical scroll
        // jitter on OSX trackpads when deltaX is small and deltaY
        // is large (issue #3579)
        if (!dy || (dy && canScrollY))
            e_preventDefault(e);
        display.wheelStartX = null; // Abort measurement, if in progress
        return;
    }
    // 'Project' the visible viewport to cover the area that is being
    // scrolled into view (if we know enough to estimate it).
    if (dy && wheelPixelsPerUnit != null) {
        let pixels = dy * wheelPixelsPerUnit;
        let top = cm.doc.scrollTop, bot = top + display.wrapper.clientHeight;
        if (pixels < 0)
            top = Math.max(0, top + pixels - 50);
        else
            bot = Math.min(cm.doc.height, bot + pixels + 50);
        updateDisplaySimple(cm, { top: top, bottom: bot });
    }
    if (wheelSamples < 20) {
        if (display.wheelStartX == null) {
            display.wheelStartX = scroll.scrollLeft;
            display.wheelStartY = scroll.scrollTop;
            display.wheelDX = dx;
            display.wheelDY = dy;
            setTimeout(() => {
                if (display.wheelStartX == null)
                    return;
                let movedX = scroll.scrollLeft - display.wheelStartX;
                let movedY = scroll.scrollTop - display.wheelStartY;
                let sample = (movedY && display.wheelDY && movedY / display.wheelDY) ||
                    (movedX && display.wheelDX && movedX / display.wheelDX);
                display.wheelStartX = display.wheelStartY = null;
                if (!sample)
                    return;
                wheelPixelsPerUnit = (wheelPixelsPerUnit * wheelSamples + sample) / (wheelSamples + 1);
                ++wheelSamples;
            }, 200);
        }
        else {
            display.wheelDX += dx;
            display.wheelDY += dy;
        }
    }
}
//# sourceMappingURL=scroll_events.js.map