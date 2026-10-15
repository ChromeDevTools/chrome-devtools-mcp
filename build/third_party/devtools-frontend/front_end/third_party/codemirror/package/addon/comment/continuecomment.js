"use strict";
// CodeMirror, copyright (c) by Marijn Haverbeke and others
// Distributed under an MIT license: https://codemirror.net/LICENSE
(function (mod) {
    if (typeof exports == "object" && typeof module == "object") // CommonJS
        mod(require("../../lib/codemirror"));
    else if (typeof define == "function" && define.amd) // AMD
        define(["../../lib/codemirror"], mod);
    else // Plain browser env
        mod(CodeMirror);
})(function (CodeMirror) {
    var nonspace = /\S/g;
    var repeat = String.prototype.repeat || function (n) { return Array(n + 1).join(this); };
    function continueComment(cm) {
        if (cm.getOption("disableInput"))
            return CodeMirror.Pass;
        var ranges = cm.listSelections(), mode, inserts = [];
        for (var i = 0; i < ranges.length; i++) {
            var pos = ranges[i].head;
            if (!/\bcomment\b/.test(cm.getTokenTypeAt(pos)))
                return CodeMirror.Pass;
            var modeHere = cm.getModeAt(pos);
            if (!mode)
                mode = modeHere;
            else if (mode != modeHere)
                return CodeMirror.Pass;
            var insert = null, line, found;
            var blockStart = mode.blockCommentStart, lineCmt = mode.lineComment;
            if (blockStart && mode.blockCommentContinue) {
                line = cm.getLine(pos.line);
                var end = line.lastIndexOf(mode.blockCommentEnd, pos.ch - mode.blockCommentEnd.length);
                // 1. if this block comment ended
                // 2. if this is actually inside a line comment
                if (end != -1 && end == pos.ch - mode.blockCommentEnd.length ||
                    lineCmt && (found = line.lastIndexOf(lineCmt, pos.ch - 1)) > -1 &&
                        /\bcomment\b/.test(cm.getTokenTypeAt({ line: pos.line, ch: found + 1 }))) {
                    // ...then don't continue it
                }
                else if (pos.ch >= blockStart.length &&
                    (found = line.lastIndexOf(blockStart, pos.ch - blockStart.length)) > -1 &&
                    found > end) {
                    // reuse the existing leading spaces/tabs/mixed
                    // or build the correct indent using CM's tab/indent options
                    if (nonspaceAfter(0, line) >= found) {
                        insert = line.slice(0, found);
                    }
                    else {
                        var tabSize = cm.options.tabSize, numTabs;
                        found = CodeMirror.countColumn(line, found, tabSize);
                        insert = !cm.options.indentWithTabs ? repeat.call(" ", found) :
                            repeat.call("\t", (numTabs = Math.floor(found / tabSize))) +
                                repeat.call(" ", found - tabSize * numTabs);
                    }
                }
                else if ((found = line.indexOf(mode.blockCommentContinue)) > -1 &&
                    found <= pos.ch &&
                    found <= nonspaceAfter(0, line)) {
                    insert = line.slice(0, found);
                }
                if (insert != null)
                    insert += mode.blockCommentContinue;
            }
            if (insert == null && lineCmt && continueLineCommentEnabled(cm)) {
                if (line == null)
                    line = cm.getLine(pos.line);
                found = line.indexOf(lineCmt);
                // cursor at pos 0, line comment also at pos 0 => shift it down, don't continue
                if (!pos.ch && !found)
                    insert = "";
                // continue only if the line starts with an optional space + line comment
                else if (found > -1 && nonspaceAfter(0, line) >= found) {
                    // don't continue if there's only space(s) after cursor or the end of the line
                    insert = nonspaceAfter(pos.ch, line) > -1;
                    // but always continue if the next line starts with a line comment too
                    if (!insert) {
                        var next = cm.getLine(pos.line + 1) || '', nextFound = next.indexOf(lineCmt);
                        insert = nextFound > -1 && nonspaceAfter(0, next) >= nextFound || null;
                    }
                    if (insert) {
                        insert = line.slice(0, found) + lineCmt +
                            line.slice(found + lineCmt.length).match(/^\s*/)[0];
                    }
                }
            }
            if (insert == null)
                return CodeMirror.Pass;
            inserts[i] = "\n" + insert;
        }
        cm.operation(function () {
            for (var i = ranges.length - 1; i >= 0; i--)
                cm.replaceRange(inserts[i], ranges[i].from(), ranges[i].to(), "+insert");
        });
    }
    function nonspaceAfter(ch, str) {
        nonspace.lastIndex = ch;
        var m = nonspace.exec(str);
        return m ? m.index : -1;
    }
    function continueLineCommentEnabled(cm) {
        var opt = cm.getOption("continueComments");
        if (opt && typeof opt == "object")
            return opt.continueLineComment !== false;
        return true;
    }
    CodeMirror.defineOption("continueComments", null, function (cm, val, prev) {
        if (prev && prev != CodeMirror.Init)
            cm.removeKeyMap("continueComment");
        if (val) {
            var key = "Enter";
            if (typeof val == "string")
                key = val;
            else if (typeof val == "object" && val.key)
                key = val.key;
            var map = { name: "continueComment" };
            map[key] = continueComment;
            cm.addKeyMap(map);
        }
    });
});
//# sourceMappingURL=continuecomment.js.map