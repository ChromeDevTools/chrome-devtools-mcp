import { runInOp } from "../display/operations.js";
import { ensureCursorVisible } from "../display/scrolling.js";
import { cmp } from "../line/pos.js";
import { replaceRange } from "../model/changes.js";
import { lst } from "../util/misc.js";
// Helper for deleting text near the selection(s), used to implement
// backspace, delete, and similar functionality.
export function deleteNearSelection(cm, compute) {
    let ranges = cm.doc.sel.ranges, kill = [];
    // Build up a set of ranges to kill first, merging overlapping
    // ranges.
    for (let i = 0; i < ranges.length; i++) {
        let toKill = compute(ranges[i]);
        while (kill.length && cmp(toKill.from, lst(kill).to) <= 0) {
            let replaced = kill.pop();
            if (cmp(replaced.from, toKill.from) < 0) {
                toKill.from = replaced.from;
                break;
            }
        }
        kill.push(toKill);
    }
    // Next, remove those actual ranges.
    runInOp(cm, () => {
        for (let i = kill.length - 1; i >= 0; i--)
            replaceRange(cm.doc, "", kill[i].from, kill[i].to, "+delete");
        ensureCursorVisible(cm);
    });
}
//# sourceMappingURL=deleteNearSelection.js.map