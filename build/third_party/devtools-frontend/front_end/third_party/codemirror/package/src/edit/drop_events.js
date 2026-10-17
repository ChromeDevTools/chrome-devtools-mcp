import { operation } from "../display/operations.js";
import { drawSelectionCursor } from "../display/selection.js";
import { clipPos } from "../line/pos.js";
import { posFromMouse } from "../measurement/position_measurement.js";
import { eventInWidget } from "../measurement/widgets.js";
import { changeEnd } from "../model/change_measurement.js";
import { makeChange, replaceRange } from "../model/changes.js";
import { simpleSelection } from "../model/selection.js";
import { setSelectionNoUndo, setSelectionReplaceHistory } from "../model/selection_updates.js";
import { ie, presto, safari } from "../util/browser.js";
import { elt, removeChildrenAndAdd } from "../util/dom.js";
import { e_preventDefault, e_stop, signalDOMEvent } from "../util/event.js";
import { indexOf } from "../util/misc.js";
// Kludge to work around strange IE behavior where it'll sometimes
// re-fire a series of drag-related events right after the drop (#1551)
let lastDrop = 0;
export function onDrop(e) {
    let cm = this;
    clearDragCursor(cm);
    if (signalDOMEvent(cm, e) || eventInWidget(cm.display, e))
        return;
    e_preventDefault(e);
    if (ie)
        lastDrop = +new Date;
    let pos = posFromMouse(cm, e, true), files = e.dataTransfer.files;
    if (!pos || cm.isReadOnly())
        return;
    // Might be a file drop, in which case we simply extract the text
    // and insert it.
    if (files && files.length && window.FileReader && window.File) {
        let n = files.length, text = Array(n), read = 0;
        const markAsReadAndPasteIfAllFilesAreRead = () => {
            if (++read == n) {
                operation(cm, () => {
                    pos = clipPos(cm.doc, pos);
                    let change = { from: pos, to: pos,
                        text: cm.doc.splitLines(text.filter(t => t != null).join(cm.doc.lineSeparator())),
                        origin: "paste" };
                    makeChange(cm.doc, change);
                    setSelectionReplaceHistory(cm.doc, simpleSelection(clipPos(cm.doc, pos), clipPos(cm.doc, changeEnd(change))));
                })();
            }
        };
        const readTextFromFile = (file, i) => {
            if (cm.options.allowDropFileTypes &&
                indexOf(cm.options.allowDropFileTypes, file.type) == -1) {
                markAsReadAndPasteIfAllFilesAreRead();
                return;
            }
            let reader = new FileReader;
            reader.onerror = () => markAsReadAndPasteIfAllFilesAreRead();
            reader.onload = () => {
                let content = reader.result;
                if (/[\x00-\x08\x0e-\x1f]{2}/.test(content)) {
                    markAsReadAndPasteIfAllFilesAreRead();
                    return;
                }
                text[i] = content;
                markAsReadAndPasteIfAllFilesAreRead();
            };
            reader.readAsText(file);
        };
        for (let i = 0; i < files.length; i++)
            readTextFromFile(files[i], i);
    }
    else { // Normal drop
        // Don't do a replace if the drop happened inside of the selected text.
        if (cm.state.draggingText && cm.doc.sel.contains(pos) > -1) {
            cm.state.draggingText(e);
            // Ensure the editor is re-focused
            setTimeout(() => cm.display.input.focus(), 20);
            return;
        }
        try {
            let text = e.dataTransfer.getData("Text");
            if (text) {
                let selected;
                if (cm.state.draggingText && !cm.state.draggingText.copy)
                    selected = cm.listSelections();
                setSelectionNoUndo(cm.doc, simpleSelection(pos, pos));
                if (selected)
                    for (let i = 0; i < selected.length; ++i)
                        replaceRange(cm.doc, "", selected[i].anchor, selected[i].head, "drag");
                cm.replaceSelection(text, "around", "paste");
                cm.display.input.focus();
            }
        }
        catch (e) { }
    }
}
export function onDragStart(cm, e) {
    if (ie && (!cm.state.draggingText || +new Date - lastDrop < 100)) {
        e_stop(e);
        return;
    }
    if (signalDOMEvent(cm, e) || eventInWidget(cm.display, e))
        return;
    e.dataTransfer.setData("Text", cm.getSelection());
    e.dataTransfer.effectAllowed = "copyMove";
    // Use dummy image instead of default browsers image.
    // Recent Safari (~6.0.2) have a tendency to segfault when this happens, so we don't do it there.
    if (e.dataTransfer.setDragImage && !safari) {
        let img = elt("img", null, null, "position: fixed; left: 0; top: 0;");
        img.src = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
        if (presto) {
            img.width = img.height = 1;
            cm.display.wrapper.appendChild(img);
            // Force a relayout, or Opera won't use our image for some obscure reason
            img._top = img.offsetTop;
        }
        e.dataTransfer.setDragImage(img, 0, 0);
        if (presto)
            img.parentNode.removeChild(img);
    }
}
export function onDragOver(cm, e) {
    let pos = posFromMouse(cm, e);
    if (!pos)
        return;
    let frag = document.createDocumentFragment();
    drawSelectionCursor(cm, pos, frag);
    if (!cm.display.dragCursor) {
        cm.display.dragCursor = elt("div", null, "CodeMirror-cursors CodeMirror-dragcursors");
        cm.display.lineSpace.insertBefore(cm.display.dragCursor, cm.display.cursorDiv);
    }
    removeChildrenAndAdd(cm.display.dragCursor, frag);
}
export function clearDragCursor(cm) {
    if (cm.display.dragCursor) {
        cm.display.lineSpace.removeChild(cm.display.dragCursor);
        cm.display.dragCursor = null;
    }
}
//# sourceMappingURL=drop_events.js.map