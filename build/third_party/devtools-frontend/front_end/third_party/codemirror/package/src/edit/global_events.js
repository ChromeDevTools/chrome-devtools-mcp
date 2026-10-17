import { onBlur } from "../display/focus.js";
import { on } from "../util/event.js";
// These must be handled carefully, because naively registering a
// handler for each editor will cause the editors to never be
// garbage collected.
function forEachCodeMirror(f) {
    if (!document.getElementsByClassName)
        return;
    let byClass = document.getElementsByClassName("CodeMirror"), editors = [];
    for (let i = 0; i < byClass.length; i++) {
        let cm = byClass[i].CodeMirror;
        if (cm)
            editors.push(cm);
    }
    if (editors.length)
        editors[0].operation(() => {
            for (let i = 0; i < editors.length; i++)
                f(editors[i]);
        });
}
let globalsRegistered = false;
export function ensureGlobalHandlers() {
    if (globalsRegistered)
        return;
    registerGlobalHandlers();
    globalsRegistered = true;
}
function registerGlobalHandlers() {
    // When the window resizes, we need to refresh active editors.
    let resizeTimer;
    on(window, "resize", () => {
        if (resizeTimer == null)
            resizeTimer = setTimeout(() => {
                resizeTimer = null;
                forEachCodeMirror(onResize);
            }, 100);
    });
    // When the window loses focus, we want to show the editor as blurred
    on(window, "blur", () => forEachCodeMirror(onBlur));
}
// Called when the window resizes
function onResize(cm) {
    let d = cm.display;
    // Might be a text scaling operation, clear size caches.
    d.cachedCharWidth = d.cachedTextHeight = d.cachedPaddingH = null;
    d.scrollbarsClipped = false;
    cm.setSize();
}
//# sourceMappingURL=global_events.js.map