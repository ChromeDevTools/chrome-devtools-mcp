import { activeElt } from "../util/dom.js";
import { off, on } from "../util/event.js";
import { copyObj } from "../util/misc.js";
import { CodeMirror } from "./CodeMirror.js";
export function fromTextArea(textarea, options) {
    options = options ? copyObj(options) : {};
    options.value = textarea.value;
    if (!options.tabindex && textarea.tabIndex)
        options.tabindex = textarea.tabIndex;
    if (!options.placeholder && textarea.placeholder)
        options.placeholder = textarea.placeholder;
    // Set autofocus to true if this textarea is focused, or if it has
    // autofocus and no other element is focused.
    if (options.autofocus == null) {
        let hasFocus = activeElt();
        options.autofocus = hasFocus == textarea ||
            textarea.getAttribute("autofocus") != null && hasFocus == document.body;
    }
    function save() { textarea.value = cm.getValue(); }
    let realSubmit;
    if (textarea.form) {
        on(textarea.form, "submit", save);
        // Deplorable hack to make the submit method do the right thing.
        if (!options.leaveSubmitMethodAlone) {
            let form = textarea.form;
            realSubmit = form.submit;
            try {
                let wrappedSubmit = form.submit = () => {
                    save();
                    form.submit = realSubmit;
                    form.submit();
                    form.submit = wrappedSubmit;
                };
            }
            catch (e) { }
        }
    }
    options.finishInit = cm => {
        cm.save = save;
        cm.getTextArea = () => textarea;
        cm.toTextArea = () => {
            cm.toTextArea = isNaN; // Prevent this from being ran twice
            save();
            textarea.parentNode.removeChild(cm.getWrapperElement());
            textarea.style.display = "";
            if (textarea.form) {
                off(textarea.form, "submit", save);
                if (!options.leaveSubmitMethodAlone && typeof textarea.form.submit == "function")
                    textarea.form.submit = realSubmit;
            }
        };
    };
    textarea.style.display = "none";
    let cm = CodeMirror(node => textarea.parentNode.insertBefore(node, textarea.nextSibling), options);
    return cm;
}
//# sourceMappingURL=fromTextArea.js.map