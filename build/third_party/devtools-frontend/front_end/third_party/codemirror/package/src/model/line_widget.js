import { runInOp } from "../display/operations.js";
import { addToScrollTop } from "../display/scrolling.js";
import { regLineChange } from "../display/view_tracking.js";
import { heightAtLine, lineIsHidden } from "../line/spans.js";
import { lineNo, updateLineHeight } from "../line/utils_line.js";
import { widgetHeight } from "../measurement/widgets.js";
import { eventMixin } from "../util/event.js";
import { signalLater } from "../util/operation_group.js";
import { changeLine } from "./changes.js";
// Line widgets are block elements displayed above or below a line.
export class LineWidget {
    constructor(doc, node, options) {
        if (options)
            for (let opt in options)
                if (options.hasOwnProperty(opt))
                    this[opt] = options[opt];
        this.doc = doc;
        this.node = node;
    }
    clear() {
        let cm = this.doc.cm, ws = this.line.widgets, line = this.line, no = lineNo(line);
        if (no == null || !ws)
            return;
        for (let i = 0; i < ws.length; ++i)
            if (ws[i] == this)
                ws.splice(i--, 1);
        if (!ws.length)
            line.widgets = null;
        let height = widgetHeight(this);
        updateLineHeight(line, Math.max(0, line.height - height));
        if (cm) {
            runInOp(cm, () => {
                adjustScrollWhenAboveVisible(cm, line, -height);
                regLineChange(cm, no, "widget");
            });
            signalLater(cm, "lineWidgetCleared", cm, this, no);
        }
    }
    changed() {
        let oldH = this.height, cm = this.doc.cm, line = this.line;
        this.height = null;
        let diff = widgetHeight(this) - oldH;
        if (!diff)
            return;
        if (!lineIsHidden(this.doc, line))
            updateLineHeight(line, line.height + diff);
        if (cm) {
            runInOp(cm, () => {
                cm.curOp.forceUpdate = true;
                adjustScrollWhenAboveVisible(cm, line, diff);
                signalLater(cm, "lineWidgetChanged", cm, this, lineNo(line));
            });
        }
    }
}
eventMixin(LineWidget);
function adjustScrollWhenAboveVisible(cm, line, diff) {
    if (heightAtLine(line) < ((cm.curOp && cm.curOp.scrollTop) || cm.doc.scrollTop))
        addToScrollTop(cm, diff);
}
export function addLineWidget(doc, handle, node, options) {
    let widget = new LineWidget(doc, node, options);
    let cm = doc.cm;
    if (cm && widget.noHScroll)
        cm.display.alignWidgets = true;
    changeLine(doc, handle, "widget", line => {
        let widgets = line.widgets || (line.widgets = []);
        if (widget.insertAt == null)
            widgets.push(widget);
        else
            widgets.splice(Math.min(widgets.length, Math.max(0, widget.insertAt)), 0, widget);
        widget.line = line;
        if (cm && !lineIsHidden(doc, line)) {
            let aboveVisible = heightAtLine(line) < doc.scrollTop;
            updateLineHeight(line, line.height + widgetHeight(widget));
            if (aboveVisible)
                addToScrollTop(cm, widget.height);
            cm.curOp.forceUpdate = true;
        }
        return true;
    });
    if (cm)
        signalLater(cm, "lineWidgetAdded", cm, widget, typeof handle == "number" ? handle : lineNo(handle));
    return widget;
}
//# sourceMappingURL=line_widget.js.map