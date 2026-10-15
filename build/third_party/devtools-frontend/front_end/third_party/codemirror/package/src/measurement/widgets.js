import { contains, elt, removeChildrenAndAdd } from "../util/dom.js";
import { e_target } from "../util/event.js";
export function widgetHeight(widget) {
    if (widget.height != null)
        return widget.height;
    let cm = widget.doc.cm;
    if (!cm)
        return 0;
    if (!contains(document.body, widget.node)) {
        let parentStyle = "position: relative;";
        if (widget.coverGutter)
            parentStyle += "margin-left: -" + cm.display.gutters.offsetWidth + "px;";
        if (widget.noHScroll)
            parentStyle += "width: " + cm.display.wrapper.clientWidth + "px;";
        removeChildrenAndAdd(cm.display.measure, elt("div", [widget.node], null, parentStyle));
    }
    return widget.height = widget.node.parentNode.offsetHeight;
}
// Return true when the given mouse event happened in a widget
export function eventInWidget(display, e) {
    for (let n = e_target(e); n != display.wrapper; n = n.parentNode) {
        if (!n || (n.nodeType == 1 && n.getAttribute("cm-ignore-events") == "true") ||
            (n.parentNode == display.sizer && n != display.mover))
            return true;
    }
}
//# sourceMappingURL=widgets.js.map