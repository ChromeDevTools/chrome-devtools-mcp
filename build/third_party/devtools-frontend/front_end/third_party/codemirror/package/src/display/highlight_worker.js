import { getContextBefore, highlightLine, processLine } from "../line/highlight.js";
import { copyState } from "../modes.js";
import { bind } from "../util/misc.js";
import { runInOp } from "./operations.js";
import { regLineChange } from "./view_tracking.js";
// HIGHLIGHT WORKER
export function startWorker(cm, time) {
    if (cm.doc.highlightFrontier < cm.display.viewTo)
        cm.state.highlight.set(time, bind(highlightWorker, cm));
}
function highlightWorker(cm) {
    let doc = cm.doc;
    if (doc.highlightFrontier >= cm.display.viewTo)
        return;
    let end = +new Date + cm.options.workTime;
    let context = getContextBefore(cm, doc.highlightFrontier);
    let changedLines = [];
    doc.iter(context.line, Math.min(doc.first + doc.size, cm.display.viewTo + 500), line => {
        if (context.line >= cm.display.viewFrom) { // Visible
            let oldStyles = line.styles;
            let resetState = line.text.length > cm.options.maxHighlightLength ? copyState(doc.mode, context.state) : null;
            let highlighted = highlightLine(cm, line, context, true);
            if (resetState)
                context.state = resetState;
            line.styles = highlighted.styles;
            let oldCls = line.styleClasses, newCls = highlighted.classes;
            if (newCls)
                line.styleClasses = newCls;
            else if (oldCls)
                line.styleClasses = null;
            let ischange = !oldStyles || oldStyles.length != line.styles.length ||
                oldCls != newCls && (!oldCls || !newCls || oldCls.bgClass != newCls.bgClass || oldCls.textClass != newCls.textClass);
            for (let i = 0; !ischange && i < oldStyles.length; ++i)
                ischange = oldStyles[i] != line.styles[i];
            if (ischange)
                changedLines.push(context.line);
            line.stateAfter = context.save();
            context.nextLine();
        }
        else {
            if (line.text.length <= cm.options.maxHighlightLength)
                processLine(cm, line.text, context);
            line.stateAfter = context.line % 5 == 0 ? context.save() : null;
            context.nextLine();
        }
        if (+new Date > end) {
            startWorker(cm, cm.options.workDelay);
            return true;
        }
    });
    doc.highlightFrontier = context.line;
    doc.modeFrontier = Math.max(doc.modeFrontier, context.line);
    if (changedLines.length)
        runInOp(cm, () => {
            for (let i = 0; i < changedLines.length; i++)
                regLineChange(cm, changedLines[i], "text");
        });
}
//# sourceMappingURL=highlight_worker.js.map