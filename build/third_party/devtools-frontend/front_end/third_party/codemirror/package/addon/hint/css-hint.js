"use strict";
// CodeMirror, copyright (c) by Marijn Haverbeke and others
// Distributed under an MIT license: https://codemirror.net/LICENSE
(function (mod) {
    if (typeof exports == "object" && typeof module == "object") // CommonJS
        mod(require("../../lib/codemirror"), require("../../mode/css/css"));
    else if (typeof define == "function" && define.amd) // AMD
        define(["../../lib/codemirror", "../../mode/css/css"], mod);
    else // Plain browser env
        mod(CodeMirror);
})(function (CodeMirror) {
    "use strict";
    var pseudoClasses = { "active": 1, "after": 1, "before": 1, "checked": 1, "default": 1,
        "disabled": 1, "empty": 1, "enabled": 1, "first-child": 1, "first-letter": 1,
        "first-line": 1, "first-of-type": 1, "focus": 1, "hover": 1, "in-range": 1,
        "indeterminate": 1, "invalid": 1, "lang": 1, "last-child": 1, "last-of-type": 1,
        "link": 1, "not": 1, "nth-child": 1, "nth-last-child": 1, "nth-last-of-type": 1,
        "nth-of-type": 1, "only-of-type": 1, "only-child": 1, "optional": 1, "out-of-range": 1,
        "placeholder": 1, "read-only": 1, "read-write": 1, "required": 1, "root": 1,
        "selection": 1, "target": 1, "valid": 1, "visited": 1
    };
    CodeMirror.registerHelper("hint", "css", function (cm) {
        var cur = cm.getCursor(), token = cm.getTokenAt(cur);
        var inner = CodeMirror.innerMode(cm.getMode(), token.state);
        if (inner.mode.name != "css")
            return;
        if (token.type == "keyword" && "!important".indexOf(token.string) == 0)
            return { list: ["!important"], from: CodeMirror.Pos(cur.line, token.start),
                to: CodeMirror.Pos(cur.line, token.end) };
        var start = token.start, end = cur.ch, word = token.string.slice(0, end - start);
        if (/[^\w$_-]/.test(word)) {
            word = "";
            start = end = cur.ch;
        }
        var spec = CodeMirror.resolveMode("text/css");
        var result = [];
        function add(keywords) {
            for (var name in keywords)
                if (!word || name.lastIndexOf(word, 0) == 0)
                    result.push(name);
        }
        var st = inner.state.state;
        if (st == "pseudo" || token.type == "variable-3") {
            add(pseudoClasses);
        }
        else if (st == "block" || st == "maybeprop") {
            add(spec.propertyKeywords);
        }
        else if (st == "prop" || st == "parens" || st == "at" || st == "params") {
            add(spec.valueKeywords);
            add(spec.colorKeywords);
        }
        else if (st == "media" || st == "media_parens") {
            add(spec.mediaTypes);
            add(spec.mediaFeatures);
        }
        if (result.length)
            return {
                list: result,
                from: CodeMirror.Pos(cur.line, start),
                to: CodeMirror.Pos(cur.line, end)
            };
    });
});
//# sourceMappingURL=css-hint.js.map