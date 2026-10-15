"use strict";
// CodeMirror, copyright (c) by Marijn Haverbeke and others
// Distributed under an MIT license: https://codemirror.net/LICENSE
(function (mod) {
    if (typeof exports == "object" && typeof module == "object") // CommonJS
        mod(require("../lib/codemirror"));
    else if (typeof define == "function" && define.amd) // AMD
        define(["../lib/codemirror"], mod);
    else // Plain browser env
        mod(CodeMirror);
})(function (CodeMirror) {
    "use strict";
    var cmds = CodeMirror.commands;
    var Pos = CodeMirror.Pos;
    function posEq(a, b) { return a.line == b.line && a.ch == b.ch; }
    // Kill 'ring'
    var killRing = [];
    function addToRing(str) {
        killRing.push(str);
        if (killRing.length > 50)
            killRing.shift();
    }
    function growRingTop(str) {
        if (!killRing.length)
            return addToRing(str);
        killRing[killRing.length - 1] += str;
    }
    function getFromRing(n) { return killRing[killRing.length - (n ? Math.min(n, 1) : 1)] || ""; }
    function popFromRing() { if (killRing.length > 1)
        killRing.pop(); return getFromRing(); }
    var lastKill = null;
    // Internal generic kill function, used by several mapped kill "family" functions.
    function _kill(cm, from, to, ring, text) {
        if (text == null)
            text = cm.getRange(from, to);
        if (ring == "grow" && lastKill && lastKill.cm == cm && posEq(from, lastKill.pos) && cm.isClean(lastKill.gen))
            growRingTop(text);
        else if (ring !== false)
            addToRing(text);
        cm.replaceRange("", from, to, "+delete");
        if (ring == "grow")
            lastKill = { cm: cm, pos: from, gen: cm.changeGeneration() };
        else
            lastKill = null;
    }
    // Boundaries of various units
    function byChar(cm, pos, dir) {
        return cm.findPosH(pos, dir, "char", true);
    }
    function byWord(cm, pos, dir) {
        return cm.findPosH(pos, dir, "word", true);
    }
    function byLine(cm, pos, dir) {
        return cm.findPosV(pos, dir, "line", cm.doc.sel.goalColumn);
    }
    function byPage(cm, pos, dir) {
        return cm.findPosV(pos, dir, "page", cm.doc.sel.goalColumn);
    }
    function byParagraph(cm, pos, dir) {
        var no = pos.line, line = cm.getLine(no);
        var sawText = /\S/.test(dir < 0 ? line.slice(0, pos.ch) : line.slice(pos.ch));
        var fst = cm.firstLine(), lst = cm.lastLine();
        for (;;) {
            no += dir;
            if (no < fst || no > lst)
                return cm.clipPos(Pos(no - dir, dir < 0 ? 0 : null));
            line = cm.getLine(no);
            var hasText = /\S/.test(line);
            if (hasText)
                sawText = true;
            else if (sawText)
                return Pos(no, 0);
        }
    }
    function bySentence(cm, pos, dir) {
        var line = pos.line, ch = pos.ch;
        var text = cm.getLine(pos.line), sawWord = false;
        for (;;) {
            var next = text.charAt(ch + (dir < 0 ? -1 : 0));
            if (!next) { // End/beginning of line reached
                if (line == (dir < 0 ? cm.firstLine() : cm.lastLine()))
                    return Pos(line, ch);
                text = cm.getLine(line + dir);
                if (!/\S/.test(text))
                    return Pos(line, ch);
                line += dir;
                ch = dir < 0 ? text.length : 0;
                continue;
            }
            if (sawWord && /[!?.]/.test(next))
                return Pos(line, ch + (dir > 0 ? 1 : 0));
            if (!sawWord)
                sawWord = /\w/.test(next);
            ch += dir;
        }
    }
    function byExpr(cm, pos, dir) {
        var wrap;
        if (cm.findMatchingBracket && (wrap = cm.findMatchingBracket(pos, { strict: true }))
            && wrap.match && (wrap.forward ? 1 : -1) == dir)
            return dir > 0 ? Pos(wrap.to.line, wrap.to.ch + 1) : wrap.to;
        for (var first = true;; first = false) {
            var token = cm.getTokenAt(pos);
            var after = Pos(pos.line, dir < 0 ? token.start : token.end);
            if (first && dir > 0 && token.end == pos.ch || !/\w/.test(token.string)) {
                var newPos = cm.findPosH(after, dir, "char");
                if (posEq(after, newPos))
                    return pos;
                else
                    pos = newPos;
            }
            else {
                return after;
            }
        }
    }
    // Prefixes (only crudely supported)
    function getPrefix(cm, precise) {
        var digits = cm.state.emacsPrefix;
        if (!digits)
            return precise ? null : 1;
        clearPrefix(cm);
        return digits == "-" ? -1 : Number(digits);
    }
    function repeated(cmd) {
        var f = typeof cmd == "string" ? function (cm) { cm.execCommand(cmd); } : cmd;
        return function (cm) {
            var prefix = getPrefix(cm);
            f(cm);
            for (var i = 1; i < prefix; ++i)
                f(cm);
        };
    }
    function findEnd(cm, pos, by, dir) {
        var prefix = getPrefix(cm);
        if (prefix < 0) {
            dir = -dir;
            prefix = -prefix;
        }
        for (var i = 0; i < prefix; ++i) {
            var newPos = by(cm, pos, dir);
            if (posEq(newPos, pos))
                break;
            pos = newPos;
        }
        return pos;
    }
    function move(by, dir) {
        var f = function (cm) {
            cm.extendSelection(findEnd(cm, cm.getCursor(), by, dir));
        };
        f.motion = true;
        return f;
    }
    function killTo(cm, by, dir, ring) {
        var selections = cm.listSelections(), cursor;
        var i = selections.length;
        while (i--) {
            cursor = selections[i].head;
            _kill(cm, cursor, findEnd(cm, cursor, by, dir), ring);
        }
    }
    function _killRegion(cm, ring) {
        if (cm.somethingSelected()) {
            var selections = cm.listSelections(), selection;
            var i = selections.length;
            while (i--) {
                selection = selections[i];
                _kill(cm, selection.anchor, selection.head, ring);
            }
            return true;
        }
    }
    function addPrefix(cm, digit) {
        if (cm.state.emacsPrefix) {
            if (digit != "-")
                cm.state.emacsPrefix += digit;
            return;
        }
        // Not active yet
        cm.state.emacsPrefix = digit;
        cm.on("keyHandled", maybeClearPrefix);
        cm.on("inputRead", maybeDuplicateInput);
    }
    var prefixPreservingKeys = { "Alt-G": true, "Ctrl-X": true, "Ctrl-Q": true, "Ctrl-U": true };
    function maybeClearPrefix(cm, arg) {
        if (!cm.state.emacsPrefixMap && !prefixPreservingKeys.hasOwnProperty(arg))
            clearPrefix(cm);
    }
    function clearPrefix(cm) {
        cm.state.emacsPrefix = null;
        cm.off("keyHandled", maybeClearPrefix);
        cm.off("inputRead", maybeDuplicateInput);
    }
    function maybeDuplicateInput(cm, event) {
        var dup = getPrefix(cm);
        if (dup > 1 && event.origin == "+input") {
            var one = event.text.join("\n"), txt = "";
            for (var i = 1; i < dup; ++i)
                txt += one;
            cm.replaceSelection(txt);
        }
    }
    function maybeRemovePrefixMap(cm, arg) {
        if (typeof arg == "string" && (/^\d$/.test(arg) || arg == "Ctrl-U"))
            return;
        cm.removeKeyMap(prefixMap);
        cm.state.emacsPrefixMap = false;
        cm.off("keyHandled", maybeRemovePrefixMap);
        cm.off("inputRead", maybeRemovePrefixMap);
    }
    // Utilities
    cmds.setMark = function (cm) {
        cm.setCursor(cm.getCursor());
        cm.setExtending(!cm.getExtending());
        cm.on("change", function () { cm.setExtending(false); });
    };
    function clearMark(cm) {
        cm.setExtending(false);
        cm.setCursor(cm.getCursor());
    }
    function makePrompt(msg) {
        var fragment = document.createDocumentFragment();
        var input = document.createElement("input");
        input.setAttribute("type", "text");
        input.style.width = "10em";
        fragment.appendChild(document.createTextNode(msg + ": "));
        fragment.appendChild(input);
        return fragment;
    }
    function getInput(cm, msg, f) {
        if (cm.openDialog)
            cm.openDialog(makePrompt(msg), f, { bottom: true });
        else
            f(prompt(msg, ""));
    }
    function operateOnWord(cm, op) {
        var start = cm.getCursor(), end = cm.findPosH(start, 1, "word");
        cm.replaceRange(op(cm.getRange(start, end)), start, end);
        cm.setCursor(end);
    }
    function toEnclosingExpr(cm) {
        var pos = cm.getCursor(), line = pos.line, ch = pos.ch;
        var stack = [];
        while (line >= cm.firstLine()) {
            var text = cm.getLine(line);
            for (var i = ch == null ? text.length : ch; i > 0;) {
                var ch = text.charAt(--i);
                if (ch == ")")
                    stack.push("(");
                else if (ch == "]")
                    stack.push("[");
                else if (ch == "}")
                    stack.push("{");
                else if (/[\(\{\[]/.test(ch) && (!stack.length || stack.pop() != ch))
                    return cm.extendSelection(Pos(line, i));
            }
            --line;
            ch = null;
        }
    }
    // Commands. Names should match emacs function names (albeit in camelCase)
    // except where emacs function names collide with code mirror core commands.
    cmds.killRegion = function (cm) {
        _kill(cm, cm.getCursor("start"), cm.getCursor("end"), true);
    };
    // Maps to emacs kill-line
    cmds.killLineEmacs = repeated(function (cm) {
        var start = cm.getCursor(), end = cm.clipPos(Pos(start.line));
        var text = cm.getRange(start, end);
        if (!/\S/.test(text)) {
            text += "\n";
            end = Pos(start.line + 1, 0);
        }
        _kill(cm, start, end, "grow", text);
    });
    cmds.killRingSave = function (cm) {
        addToRing(cm.getSelection());
        clearMark(cm);
    };
    cmds.yank = function (cm) {
        var start = cm.getCursor();
        cm.replaceRange(getFromRing(getPrefix(cm)), start, start, "paste");
        cm.setSelection(start, cm.getCursor());
    };
    cmds.yankPop = function (cm) {
        cm.replaceSelection(popFromRing(), "around", "paste");
    };
    cmds.forwardChar = move(byChar, 1);
    cmds.backwardChar = move(byChar, -1);
    cmds.deleteChar = function (cm) { killTo(cm, byChar, 1, false); };
    cmds.deleteForwardChar = function (cm) {
        _killRegion(cm, false) || killTo(cm, byChar, 1, false);
    };
    cmds.deleteBackwardChar = function (cm) {
        _killRegion(cm, false) || killTo(cm, byChar, -1, false);
    };
    cmds.forwardWord = move(byWord, 1);
    cmds.backwardWord = move(byWord, -1);
    cmds.killWord = function (cm) { killTo(cm, byWord, 1, "grow"); };
    cmds.backwardKillWord = function (cm) { killTo(cm, byWord, -1, "grow"); };
    cmds.nextLine = move(byLine, 1);
    cmds.previousLine = move(byLine, -1);
    cmds.scrollDownCommand = move(byPage, 1);
    cmds.scrollUpCommand = move(byPage, -1);
    cmds.backwardParagraph = move(byParagraph, -1);
    cmds.forwardParagraph = move(byParagraph, 1);
    cmds.backwardSentence = move(bySentence, -1);
    cmds.forwardSentence = move(bySentence, 1);
    cmds.killSentence = function (cm) { killTo(cm, bySentence, 1, "grow"); };
    cmds.backwardKillSentence = function (cm) {
        _kill(cm, cm.getCursor(), bySentence(cm, cm.getCursor(), 1), "grow");
    };
    cmds.killSexp = function (cm) { killTo(cm, byExpr, 1, "grow"); };
    cmds.backwardKillSexp = function (cm) { killTo(cm, byExpr, -1, "grow"); };
    cmds.forwardSexp = move(byExpr, 1);
    cmds.backwardSexp = move(byExpr, -1);
    cmds.markSexp = function (cm) {
        var cursor = cm.getCursor();
        cm.setSelection(findEnd(cm, cursor, byExpr, 1), cursor);
    };
    cmds.transposeSexps = function (cm) {
        var leftStart = byExpr(cm, cm.getCursor(), -1);
        var leftEnd = byExpr(cm, leftStart, 1);
        var rightEnd = byExpr(cm, leftEnd, 1);
        var rightStart = byExpr(cm, rightEnd, -1);
        cm.replaceRange(cm.getRange(rightStart, rightEnd) +
            cm.getRange(leftEnd, rightStart) +
            cm.getRange(leftStart, leftEnd), leftStart, rightEnd);
    };
    cmds.backwardUpList = repeated(toEnclosingExpr);
    cmds.justOneSpace = function (cm) {
        var pos = cm.getCursor(), from = pos.ch;
        var to = pos.ch, text = cm.getLine(pos.line);
        while (from && /\s/.test(text.charAt(from - 1)))
            --from;
        while (to < text.length && /\s/.test(text.charAt(to)))
            ++to;
        cm.replaceRange(" ", Pos(pos.line, from), Pos(pos.line, to));
    };
    cmds.openLine = repeated(function (cm) {
        cm.replaceSelection("\n", "start");
    });
    // maps to emacs 'transpose-chars'
    cmds.transposeCharsRepeatable = repeated(function (cm) {
        cm.execCommand("transposeChars");
    });
    cmds.capitalizeWord = repeated(function (cm) {
        operateOnWord(cm, function (w) {
            var letter = w.search(/\w/);
            if (letter == -1)
                return w;
            return w.slice(0, letter) + w.charAt(letter).toUpperCase() +
                w.slice(letter + 1).toLowerCase();
        });
    });
    cmds.upcaseWord = repeated(function (cm) {
        operateOnWord(cm, function (w) { return w.toUpperCase(); });
    });
    cmds.downcaseWord = repeated(function (cm) {
        operateOnWord(cm, function (w) { return w.toLowerCase(); });
    });
    // maps to emacs 'undo'
    cmds.undoRepeatable = repeated("undo");
    cmds.keyboardQuit = function (cm) {
        cm.execCommand("clearSearch");
        clearMark(cm);
    };
    cmds.newline = repeated(function (cm) { cm.replaceSelection("\n", "end"); });
    cmds.gotoLine = function (cm) {
        var prefix = getPrefix(cm, true);
        if (prefix != null && prefix > 0)
            return cm.setCursor(prefix - 1);
        getInput(cm, "Goto line", function (str) {
            var num;
            if (str && !isNaN(num = Number(str)) && num == (num | 0) && num > 0)
                cm.setCursor(num - 1);
        });
    };
    cmds.indentRigidly = function (cm) {
        cm.indentSelection(getPrefix(cm, true) || cm.getOption("indentUnit"));
    };
    cmds.exchangePointAndMark = function (cm) {
        cm.setSelection(cm.getCursor("head"), cm.getCursor("anchor"));
    };
    cmds.quotedInsertTab = repeated("insertTab");
    cmds.universalArgument = function addPrefixMap(cm) {
        cm.state.emacsPrefixMap = true;
        cm.addKeyMap(prefixMap);
        cm.on("keyHandled", maybeRemovePrefixMap);
        cm.on("inputRead", maybeRemovePrefixMap);
    };
    CodeMirror.emacs = { kill: _kill, killRegion: _killRegion, repeated: repeated };
    // Actual keymap
    var keyMap = CodeMirror.keyMap.emacs = CodeMirror.normalizeKeyMap({
        "Ctrl-W": "killRegion",
        "Ctrl-K": "killLineEmacs",
        "Alt-W": "killRingSave",
        "Ctrl-Y": "yank",
        "Alt-Y": "yankPop",
        "Ctrl-Space": "setMark",
        "Ctrl-Shift-2": "setMark",
        "Ctrl-F": "forwardChar",
        "Ctrl-B": "backwardChar",
        "Right": "forwardChar",
        "Left": "backwardChar",
        "Ctrl-D": "deleteChar",
        "Delete": "deleteForwardChar",
        "Ctrl-H": "deleteBackwardChar",
        "Backspace": "deleteBackwardChar",
        "Alt-F": "forwardWord",
        "Alt-B": "backwardWord",
        "Alt-Right": "forwardWord",
        "Alt-Left": "backwardWord",
        "Alt-D": "killWord",
        "Alt-Backspace": "backwardKillWord",
        "Ctrl-N": "nextLine",
        "Ctrl-P": "previousLine",
        "Down": "nextLine",
        "Up": "previousLine",
        "Ctrl-A": "goLineStart",
        "Ctrl-E": "goLineEnd",
        "End": "goLineEnd",
        "Home": "goLineStart",
        "Alt-V": "scrollDownCommand",
        "Ctrl-V": "scrollUpCommand",
        "PageUp": "scrollUpCommand",
        "PageDown": "scrollDownCommand",
        "Ctrl-Up": "backwardParagraph",
        "Ctrl-Down": "forwardParagraph",
        "Alt-{": "backwardParagraph",
        "Alt-}": "forwardParagraph",
        "Alt-A": "backwardSentence",
        "Alt-E": "forwardSentence",
        "Alt-K": "killSentence",
        "Ctrl-X Delete": "backwardKillSentence",
        "Ctrl-Alt-K": "killSexp",
        "Ctrl-Alt-Backspace": "backwardKillSexp",
        "Ctrl-Alt-F": "forwardSexp",
        "Ctrl-Alt-B": "backwardSexp",
        "Shift-Ctrl-Alt-2": "markSexp",
        "Ctrl-Alt-T": "transposeSexps",
        "Ctrl-Alt-U": "backwardUpList",
        "Alt-Space": "justOneSpace",
        "Ctrl-O": "openLine",
        "Ctrl-T": "transposeCharsRepeatable",
        "Alt-C": "capitalizeWord",
        "Alt-U": "upcaseWord",
        "Alt-L": "downcaseWord",
        "Alt-;": "toggleComment",
        "Ctrl-/": "undoRepeatable",
        "Shift-Ctrl--": "undoRepeatable",
        "Ctrl-Z": "undoRepeatable",
        "Cmd-Z": "undoRepeatable",
        "Ctrl-X U": "undoRepeatable",
        "Shift-Ctrl-Z": "redo",
        "Shift-Alt-,": "goDocStart",
        "Shift-Alt-.": "goDocEnd",
        "Ctrl-S": "findPersistentNext",
        "Ctrl-R": "findPersistentPrev",
        "Ctrl-G": "keyboardQuit",
        "Shift-Alt-5": "replace",
        "Alt-/": "autocomplete",
        "Enter": "newlineAndIndent",
        "Ctrl-J": "newline",
        "Tab": "indentAuto",
        "Alt-G G": "gotoLine",
        "Ctrl-X Tab": "indentRigidly",
        "Ctrl-X Ctrl-X": "exchangePointAndMark",
        "Ctrl-X Ctrl-S": "save",
        "Ctrl-X Ctrl-W": "save",
        "Ctrl-X S": "saveAll",
        "Ctrl-X F": "open",
        "Ctrl-X K": "close",
        "Ctrl-X H": "selectAll",
        "Ctrl-Q Tab": "quotedInsertTab",
        "Ctrl-U": "universalArgument",
        "fallthrough": "default"
    });
    var prefixMap = { "Ctrl-G": clearPrefix };
    function regPrefix(d) {
        prefixMap[d] = function (cm) { addPrefix(cm, d); };
        keyMap["Ctrl-" + d] = function (cm) { addPrefix(cm, d); };
        prefixPreservingKeys["Ctrl-" + d] = true;
    }
    for (var i = 0; i < 10; ++i)
        regPrefix(String(i));
    regPrefix("-");
});
//# sourceMappingURL=emacs.js.map