import { getHandlers } from "./event.js";
let operationGroup = null;
export function pushOperation(op) {
    if (operationGroup) {
        operationGroup.ops.push(op);
    }
    else {
        op.ownsGroup = operationGroup = {
            ops: [op],
            delayedCallbacks: []
        };
    }
}
function fireCallbacksForOps(group) {
    // Calls delayed callbacks and cursorActivity handlers until no
    // new ones appear
    let callbacks = group.delayedCallbacks, i = 0;
    do {
        for (; i < callbacks.length; i++)
            callbacks[i].call(null);
        for (let j = 0; j < group.ops.length; j++) {
            let op = group.ops[j];
            if (op.cursorActivityHandlers)
                while (op.cursorActivityCalled < op.cursorActivityHandlers.length)
                    op.cursorActivityHandlers[op.cursorActivityCalled++].call(null, op.cm);
        }
    } while (i < callbacks.length);
}
export function finishOperation(op, endCb) {
    let group = op.ownsGroup;
    if (!group)
        return;
    try {
        fireCallbacksForOps(group);
    }
    finally {
        operationGroup = null;
        endCb(group);
    }
}
let orphanDelayedCallbacks = null;
// Often, we want to signal events at a point where we are in the
// middle of some work, but don't want the handler to start calling
// other methods on the editor, which might be in an inconsistent
// state or simply not expect any other events to happen.
// signalLater looks whether there are any handlers, and schedules
// them to be executed when the last operation ends, or, if no
// operation is active, when a timeout fires.
export function signalLater(emitter, type /*, values...*/) {
    let arr = getHandlers(emitter, type);
    if (!arr.length)
        return;
    let args = Array.prototype.slice.call(arguments, 2), list;
    if (operationGroup) {
        list = operationGroup.delayedCallbacks;
    }
    else if (orphanDelayedCallbacks) {
        list = orphanDelayedCallbacks;
    }
    else {
        list = orphanDelayedCallbacks = [];
        setTimeout(fireOrphanDelayed, 0);
    }
    for (let i = 0; i < arr.length; ++i)
        list.push(() => arr[i].apply(null, args));
}
function fireOrphanDelayed() {
    let delayed = orphanDelayedCallbacks;
    orphanDelayedCallbacks = null;
    for (let i = 0; i < delayed.length; ++i)
        delayed[i]();
}
//# sourceMappingURL=operation_group.js.map