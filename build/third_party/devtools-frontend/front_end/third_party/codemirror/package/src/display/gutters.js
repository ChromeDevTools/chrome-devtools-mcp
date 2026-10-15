import { elt, removeChildren } from "../util/dom.js";
import { alignHorizontally } from "./line_numbers.js";
import { updateGutterSpace } from "./update_display.js";
import { regChange } from "./view_tracking.js";
export function getGutters(gutters, lineNumbers) {
    let result = [], sawLineNumbers = false;
    for (let i = 0; i < gutters.length; i++) {
        let name = gutters[i], style = null;
        if (typeof name != "string") {
            style = name.style;
            name = name.className;
        }
        if (name == "CodeMirror-linenumbers") {
            if (!lineNumbers)
                continue;
            else
                sawLineNumbers = true;
        }
        result.push({ className: name, style });
    }
    if (lineNumbers && !sawLineNumbers)
        result.push({ className: "CodeMirror-linenumbers", style: null });
    return result;
}
// Rebuild the gutter elements, ensure the margin to the left of the
// code matches their width.
export function renderGutters(display) {
    let gutters = display.gutters, specs = display.gutterSpecs;
    removeChildren(gutters);
    display.lineGutter = null;
    for (let i = 0; i < specs.length; ++i) {
        let { className, style } = specs[i];
        let gElt = gutters.appendChild(elt("div", null, "CodeMirror-gutter " + className));
        if (style)
            gElt.style.cssText = style;
        if (className == "CodeMirror-linenumbers") {
            display.lineGutter = gElt;
            gElt.style.width = (display.lineNumWidth || 1) + "px";
        }
    }
    gutters.style.display = specs.length ? "" : "none";
    updateGutterSpace(display);
}
export function updateGutters(cm) {
    renderGutters(cm.display);
    regChange(cm);
    alignHorizontally(cm);
}
//# sourceMappingURL=gutters.js.map