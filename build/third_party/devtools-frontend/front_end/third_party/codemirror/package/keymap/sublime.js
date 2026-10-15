"use strict";
// CodeMirror, copyright (c) by Marijn Haverbeke and others
// Distributed under an MIT license: https://codemirror.net/LICENSE
// A rough approximation of Sublime Text's keybindings
// Depends on addon/search/searchcursor.js and optionally addon/dialog/dialogs.js
(function (mod) {
    if (typeof exports == "object" && typeof module == "object") // CommonJS
        mod(require("../lib/codemirror"), require("../addon/search/searchcursor"), require("../addon/edit/matchbrackets"));
    else if (typeof define == "function" && define.amd) // AMD
        define(["../lib/codemirror", "../addon/search/searchcursor", "../addon/edit/matchbrackets"], mod);
    else // Plain browser env
        mod(CodeMirror);
})(function (CodeMirror) {
    "use strict";
    var cmds = CodeMirror.commands;
    var Pos = CodeMirror.Pos;
    // This is not exactly Sublime's algorithm. I couldn't make heads or tails of that.
    function findPosSubword(doc, start, dir) {
        if (dir < 0 && start.ch == 0)
            return doc.clipPos(Pos(start.line - 1));
        var line = doc.getLine(start.line);
        if (dir > 0 && start.ch >= line.length)
            return doc.clipPos(Pos(start.line + 1, 0));
        var state = "start", type, startPos = start.ch;
        for (var pos = startPos, e = dir < 0 ? 0 : line.length, i = 0; pos != e; pos += dir, i++) {
            var next = line.charAt(dir < 0 ? pos - 1 : pos);
            var cat = next != "_" && CodeMirror.isWordChar(next) ? "w" : "o";
            if (cat == "w" && next.toUpperCase() == next)
                cat = "W";
            if (state == "start") {
                if (cat != "o") {
                    state = "in";
                    type = cat;
                }
                else
                    startPos = pos + dir;
            }
            else if (state == "in") {
                if (type != cat) {
                    if (type == "w" && cat == "W" && dir < 0)
                        pos--;
                    if (type == "W" && cat == "w" && dir > 0) { // From uppercase to lowercase
                        if (pos == startPos + 1) {
                            type = "w";
                            continue;
                        }
                        else
                            pos--;
                    }
                    break;
                }
            }
        }
        return Pos(start.line, pos);
    }
    function moveSubword(cm, dir) {
        cm.extendSelectionsBy(function (range) {
            if (cm.display.shift || cm.doc.extend || range.empty())
                return findPosSubword(cm.doc, range.head, dir);
            else
                return dir < 0 ? range.from() : range.to();
        });
    }
    cmds.goSubwordLeft = function (cm) { moveSubword(cm, -1); };
    cmds.goSubwordRight = function (cm) { moveSubword(cm, 1); };
    cmds.scrollLineUp = function (cm) {
        var info = cm.getScrollInfo();
        if (!cm.somethingSelected()) {
            var visibleBottomLine = cm.lineAtHeight(info.top + info.clientHeight, "local");
            if (cm.getCursor().line >= visibleBottomLine)
                cm.execCommand("goLineUp");
        }
        cm.scrollTo(null, info.top - cm.defaultTextHeight());
    };
    cmds.scrollLineDown = function (cm) {
        var info = cm.getScrollInfo();
        if (!cm.somethingSelected()) {
            var visibleTopLine = cm.lineAtHeight(info.top, "local") + 1;
            if (cm.getCursor().line <= visibleTopLine)
                cm.execCommand("goLineDown");
        }
        cm.scrollTo(null, info.top + cm.defaultTextHeight());
    };
    cmds.splitSelectionByLine = function (cm) {
        var ranges = cm.listSelections(), lineRanges = [];
        for (var i = 0; i < ranges.length; i++) {
            var from = ranges[i].from(), to = ranges[i].to();
            for (var line = from.line; line <= to.line; ++line)
                if (!(to.line > from.line && line == to.line && to.ch == 0))
                    lineRanges.push({ anchor: line == from.line ? from : Pos(line, 0),
                        head: line == to.line ? to : Pos(line) });
        }
        cm.setSelections(lineRanges, 0);
    };
    cmds.singleSelectionTop = function (cm) {
        var range = cm.listSelections()[0];
        cm.setSelection(range.anchor, range.head, { scroll: false });
    };
    cmds.selectLine = function (cm) {
        var ranges = cm.listSelections(), extended = [];
        for (var i = 0; i < ranges.length; i++) {
            var range = ranges[i];
            extended.push({ anchor: Pos(range.from().line, 0),
                head: Pos(range.to().line + 1, 0) });
        }
        cm.setSelections(extended);
    };
    function insertLine(cm, above) {
        if (cm.isReadOnly())
            return CodeMirror.Pass;
        cm.operation(function () {
            var len = cm.listSelections().length, newSelection = [], last = -1;
            for (var i = 0; i < len; i++) {
                var head = cm.listSelections()[i].head;
                if (head.line <= last)
                    continue;
                var at = Pos(head.line + (above ? 0 : 1), 0);
                cm.replaceRange("\n", at, null, "+insertLine");
                cm.indentLine(at.line, null, true);
                newSelection.push({ head: at, anchor: at });
                last = head.line + 1;
            }
            cm.setSelections(newSelection);
        });
        cm.execCommand("indentAuto");
    }
    cmds.insertLineAfter = function (cm) { return insertLine(cm, false); };
    cmds.insertLineBefore = function (cm) { return insertLine(cm, true); };
    function wordAt(cm, pos) {
        var start = pos.ch, end = start, line = cm.getLine(pos.line);
        while (start && CodeMirror.isWordChar(line.charAt(start - 1)))
            --start;
        while (end < line.length && CodeMirror.isWordChar(line.charAt(end)))
            ++end;
        return { from: Pos(pos.line, start), to: Pos(pos.line, end), word: line.slice(start, end) };
    }
    cmds.selectNextOccurrence = function (cm) {
        var from = cm.getCursor("from"), to = cm.getCursor("to");
        var fullWord = cm.state.sublimeFindFullWord == cm.doc.sel;
        if (CodeMirror.cmpPos(from, to) == 0) {
            var word = wordAt(cm, from);
            if (!word.word)
                return;
            cm.setSelection(word.from, word.to);
            fullWord = true;
        }
        else {
            var text = cm.getRange(from, to);
            var query = fullWord ? new RegExp("\\b" + text + "\\b") : text;
            var cur = cm.getSearchCursor(query, to);
            var found = cur.findNext();
            if (!found) {
                cur = cm.getSearchCursor(query, Pos(cm.firstLine(), 0));
                found = cur.findNext();
            }
            if (!found || isSelectedRange(cm.listSelections(), cur.from(), cur.to()))
                return;
            cm.addSelection(cur.from(), cur.to());
        }
        if (fullWord)
            cm.state.sublimeFindFullWord = cm.doc.sel;
    };
    cmds.skipAndSelectNextOccurrence = function (cm) {
        var prevAnchor = cm.getCursor("anchor"), prevHead = cm.getCursor("head");
        cmds.selectNextOccurrence(cm);
        if (CodeMirror.cmpPos(prevAnchor, prevHead) != 0) {
            cm.doc.setSelections(cm.doc.listSelections()
                .filter(function (sel) {
                return sel.anchor != prevAnchor || sel.head != prevHead;
            }));
        }
    };
    function addCursorToSelection(cm, dir) {
        var ranges = cm.listSelections(), newRanges = [];
        for (var i = 0; i < ranges.length; i++) {
            var range = ranges[i];
            var newAnchor = cm.findPosV(range.anchor, dir, "line", range.anchor.goalColumn);
            var newHead = cm.findPosV(range.head, dir, "line", range.head.goalColumn);
            newAnchor.goalColumn = range.anchor.goalColumn != null ?
                range.anchor.goalColumn : cm.cursorCoords(range.anchor, "div").left;
            newHead.goalColumn = range.head.goalColumn != null ?
                range.head.goalColumn : cm.cursorCoords(range.head, "div").left;
            var newRange = { anchor: newAnchor, head: newHead };
            newRanges.push(range);
            newRanges.push(newRange);
        }
        cm.setSelections(newRanges);
    }
    cmds.addCursorToPrevLine = function (cm) { addCursorToSelection(cm, -1); };
    cmds.addCursorToNextLine = function (cm) { addCursorToSelection(cm, 1); };
    function isSelectedRange(ranges, from, to) {
        for (var i = 0; i < ranges.length; i++)
            if (CodeMirror.cmpPos(ranges[i].from(), from) == 0 &&
                CodeMirror.cmpPos(ranges[i].to(), to) == 0)
                return true;
        return false;
    }
    var mirror = "(){}[]";
    function selectBetweenBrackets(cm) {
        var ranges = cm.listSelections(), newRanges = [];
        for (var i = 0; i < ranges.length; i++) {
            var range = ranges[i], pos = range.head, opening = cm.scanForBracket(pos, -1);
            if (!opening)
                return false;
            for (;;) {
                var closing = cm.scanForBracket(pos, 1);
                if (!closing)
                    return false;
                if (closing.ch == mirror.charAt(mirror.indexOf(opening.ch) + 1)) {
                    var startPos = Pos(opening.pos.line, opening.pos.ch + 1);
                    if (CodeMirror.cmpPos(startPos, range.from()) == 0 &&
                        CodeMirror.cmpPos(closing.pos, range.to()) == 0) {
                        opening = cm.scanForBracket(opening.pos, -1);
                        if (!opening)
                            return false;
                    }
                    else {
                        newRanges.push({ anchor: startPos, head: closing.pos });
                        break;
                    }
                }
                pos = Pos(closing.pos.line, closing.pos.ch + 1);
            }
        }
        cm.setSelections(newRanges);
        return true;
    }
    cmds.selectScope = function (cm) {
        selectBetweenBrackets(cm) || cm.execCommand("selectAll");
    };
    cmds.selectBetweenBrackets = function (cm) {
        if (!selectBetweenBrackets(cm))
            return CodeMirror.Pass;
    };
    function puncType(type) {
        return !type ? null : /\bpunctuation\b/.test(type) ? type : undefined;
    }
    cmds.goToBracket = function (cm) {
        cm.extendSelectionsBy(function (range) {
            var next = cm.scanForBracket(range.head, 1, puncType(cm.getTokenTypeAt(range.head)));
            if (next && CodeMirror.cmpPos(next.pos, range.head) != 0)
                return next.pos;
            var prev = cm.scanForBracket(range.head, -1, puncType(cm.getTokenTypeAt(Pos(range.head.line, range.head.ch + 1))));
            return prev && Pos(prev.pos.line, prev.pos.ch + 1) || range.head;
        });
    };
    cmds.swapLineUp = function (cm) {
        if (cm.isReadOnly())
            return CodeMirror.Pass;
        var ranges = cm.listSelections(), linesToMove = [], at = cm.firstLine() - 1, newSels = [];
        for (var i = 0; i < ranges.length; i++) {
            var range = ranges[i], from = range.from().line - 1, to = range.to().line;
            newSels.push({ anchor: Pos(range.anchor.line - 1, range.anchor.ch),
                head: Pos(range.head.line - 1, range.head.ch) });
            if (range.to().ch == 0 && !range.empty())
                --to;
            if (from > at)
                linesToMove.push(from, to);
            else if (linesToMove.length)
                linesToMove[linesToMove.length - 1] = to;
            at = to;
        }
        cm.operation(function () {
            for (var i = 0; i < linesToMove.length; i += 2) {
                var from = linesToMove[i], to = linesToMove[i + 1];
                var line = cm.getLine(from);
                cm.replaceRange("", Pos(from, 0), Pos(from + 1, 0), "+swapLine");
                if (to > cm.lastLine())
                    cm.replaceRange("\n" + line, Pos(cm.lastLine()), null, "+swapLine");
                else
                    cm.replaceRange(line + "\n", Pos(to, 0), null, "+swapLine");
            }
            cm.setSelections(newSels);
            cm.scrollIntoView();
        });
    };
    cmds.swapLineDown = function (cm) {
        if (cm.isReadOnly())
            return CodeMirror.Pass;
        var ranges = cm.listSelections(), linesToMove = [], at = cm.lastLine() + 1;
        for (var i = ranges.length - 1; i >= 0; i--) {
            var range = ranges[i], from = range.to().line + 1, to = range.from().line;
            if (range.to().ch == 0 && !range.empty())
                from--;
            if (from < at)
                linesToMove.push(from, to);
            else if (linesToMove.length)
                linesToMove[linesToMove.length - 1] = to;
            at = to;
        }
        cm.operation(function () {
            for (var i = linesToMove.length - 2; i >= 0; i -= 2) {
                var from = linesToMove[i], to = linesToMove[i + 1];
                var line = cm.getLine(from);
                if (from == cm.lastLine())
                    cm.replaceRange("", Pos(from - 1), Pos(from), "+swapLine");
                else
                    cm.replaceRange("", Pos(from, 0), Pos(from + 1, 0), "+swapLine");
                cm.replaceRange(line + "\n", Pos(to, 0), null, "+swapLine");
            }
            cm.scrollIntoView();
        });
    };
    cmds.toggleCommentIndented = function (cm) {
        cm.toggleComment({ indent: true });
    };
    cmds.joinLines = function (cm) {
        var ranges = cm.listSelections(), joined = [];
        for (var i = 0; i < ranges.length; i++) {
            var range = ranges[i], from = range.from();
            var start = from.line, end = range.to().line;
            while (i < ranges.length - 1 && ranges[i + 1].from().line == end)
                end = ranges[++i].to().line;
            joined.push({ start: start, end: end, anchor: !range.empty() && from });
        }
        cm.operation(function () {
            var offset = 0, ranges = [];
            for (var i = 0; i < joined.length; i++) {
                var obj = joined[i];
                var anchor = obj.anchor && Pos(obj.anchor.line - offset, obj.anchor.ch), head;
                for (var line = obj.start; line <= obj.end; line++) {
                    var actual = line - offset;
                    if (line == obj.end)
                        head = Pos(actual, cm.getLine(actual).length + 1);
                    if (actual < cm.lastLine()) {
                        cm.replaceRange(" ", Pos(actual), Pos(actual + 1, /^\s*/.exec(cm.getLine(actual + 1))[0].length));
                        ++offset;
                    }
                }
                ranges.push({ anchor: anchor || head, head: head });
            }
            cm.setSelections(ranges, 0);
        });
    };
    cmds.duplicateLine = function (cm) {
        cm.operation(function () {
            var rangeCount = cm.listSelections().length;
            for (var i = 0; i < rangeCount; i++) {
                var range = cm.listSelections()[i];
                if (range.empty())
                    cm.replaceRange(cm.getLine(range.head.line) + "\n", Pos(range.head.line, 0));
                else
                    cm.replaceRange(cm.getRange(range.from(), range.to()), range.from());
            }
            cm.scrollIntoView();
        });
    };
    function sortLines(cm, caseSensitive, direction) {
        if (cm.isReadOnly())
            return CodeMirror.Pass;
        var ranges = cm.listSelections(), toSort = [], selected;
        for (var i = 0; i < ranges.length; i++) {
            var range = ranges[i];
            if (range.empty())
                continue;
            var from = range.from().line, to = range.to().line;
            while (i < ranges.length - 1 && ranges[i + 1].from().line == to)
                to = ranges[++i].to().line;
            if (!ranges[i].to().ch)
                to--;
            toSort.push(from, to);
        }
        if (toSort.length)
            selected = true;
        else
            toSort.push(cm.firstLine(), cm.lastLine());
        cm.operation(function () {
            var ranges = [];
            for (var i = 0; i < toSort.length; i += 2) {
                var from = toSort[i], to = toSort[i + 1];
                var start = Pos(from, 0), end = Pos(to);
                var lines = cm.getRange(start, end, false);
                if (caseSensitive)
                    lines.sort(function (a, b) { return a < b ? -direction : a == b ? 0 : direction; });
                else
                    lines.sort(function (a, b) {
                        var au = a.toUpperCase(), bu = b.toUpperCase();
                        if (au != bu) {
                            a = au;
                            b = bu;
                        }
                        return a < b ? -direction : a == b ? 0 : direction;
                    });
                cm.replaceRange(lines, start, end);
                if (selected)
                    ranges.push({ anchor: start, head: Pos(to + 1, 0) });
            }
            if (selected)
                cm.setSelections(ranges, 0);
        });
    }
    cmds.sortLines = function (cm) { sortLines(cm, true, 1); };
    cmds.reverseSortLines = function (cm) { sortLines(cm, true, -1); };
    cmds.sortLinesInsensitive = function (cm) { sortLines(cm, false, 1); };
    cmds.reverseSortLinesInsensitive = function (cm) { sortLines(cm, false, -1); };
    cmds.nextBookmark = function (cm) {
        var marks = cm.state.sublimeBookmarks;
        if (marks)
            while (marks.length) {
                var current = marks.shift();
                var found = current.find();
                if (found) {
                    marks.push(current);
                    return cm.setSelection(found.from, found.to);
                }
            }
    };
    cmds.prevBookmark = function (cm) {
        var marks = cm.state.sublimeBookmarks;
        if (marks)
            while (marks.length) {
                marks.unshift(marks.pop());
                var found = marks[marks.length - 1].find();
                if (!found)
                    marks.pop();
                else
                    return cm.setSelection(found.from, found.to);
            }
    };
    cmds.toggleBookmark = function (cm) {
        var ranges = cm.listSelections();
        var marks = cm.state.sublimeBookmarks || (cm.state.sublimeBookmarks = []);
        for (var i = 0; i < ranges.length; i++) {
            var from = ranges[i].from(), to = ranges[i].to();
            var found = ranges[i].empty() ? cm.findMarksAt(from) : cm.findMarks(from, to);
            for (var j = 0; j < found.length; j++) {
                if (found[j].sublimeBookmark) {
                    found[j].clear();
                    for (var k = 0; k < marks.length; k++)
                        if (marks[k] == found[j])
                            marks.splice(k--, 1);
                    break;
                }
            }
            if (j == found.length)
                marks.push(cm.markText(from, to, { sublimeBookmark: true, clearWhenEmpty: false }));
        }
    };
    cmds.clearBookmarks = function (cm) {
        var marks = cm.state.sublimeBookmarks;
        if (marks)
            for (var i = 0; i < marks.length; i++)
                marks[i].clear();
        marks.length = 0;
    };
    cmds.selectBookmarks = function (cm) {
        var marks = cm.state.sublimeBookmarks, ranges = [];
        if (marks)
            for (var i = 0; i < marks.length; i++) {
                var found = marks[i].find();
                if (!found)
                    marks.splice(i--, 0);
                else
                    ranges.push({ anchor: found.from, head: found.to });
            }
        if (ranges.length)
            cm.setSelections(ranges, 0);
    };
    function modifyWordOrSelection(cm, mod) {
        cm.operation(function () {
            var ranges = cm.listSelections(), indices = [], replacements = [];
            for (var i = 0; i < ranges.length; i++) {
                var range = ranges[i];
                if (range.empty()) {
                    indices.push(i);
                    replacements.push("");
                }
                else
                    replacements.push(mod(cm.getRange(range.from(), range.to())));
            }
            cm.replaceSelections(replacements, "around", "case");
            for (var i = indices.length - 1, at; i >= 0; i--) {
                var range = ranges[indices[i]];
                if (at && CodeMirror.cmpPos(range.head, at) > 0)
                    continue;
                var word = wordAt(cm, range.head);
                at = word.from;
                cm.replaceRange(mod(word.word), word.from, word.to);
            }
        });
    }
    cmds.smartBackspace = function (cm) {
        if (cm.somethingSelected())
            return CodeMirror.Pass;
        cm.operation(function () {
            var cursors = cm.listSelections();
            var indentUnit = cm.getOption("indentUnit");
            for (var i = cursors.length - 1; i >= 0; i--) {
                var cursor = cursors[i].head;
                var toStartOfLine = cm.getRange({ line: cursor.line, ch: 0 }, cursor);
                var column = CodeMirror.countColumn(toStartOfLine, null, cm.getOption("tabSize"));
                // Delete by one character by default
                var deletePos = cm.findPosH(cursor, -1, "char", false);
                if (toStartOfLine && !/\S/.test(toStartOfLine) && column % indentUnit == 0) {
                    var prevIndent = new Pos(cursor.line, CodeMirror.findColumn(toStartOfLine, column - indentUnit, indentUnit));
                    // Smart delete only if we found a valid prevIndent location
                    if (prevIndent.ch != cursor.ch)
                        deletePos = prevIndent;
                }
                cm.replaceRange("", deletePos, cursor, "+delete");
            }
        });
    };
    cmds.delLineRight = function (cm) {
        cm.operation(function () {
            var ranges = cm.listSelections();
            for (var i = ranges.length - 1; i >= 0; i--)
                cm.replaceRange("", ranges[i].anchor, Pos(ranges[i].to().line), "+delete");
            cm.scrollIntoView();
        });
    };
    cmds.upcaseAtCursor = function (cm) {
        modifyWordOrSelection(cm, function (str) { return str.toUpperCase(); });
    };
    cmds.downcaseAtCursor = function (cm) {
        modifyWordOrSelection(cm, function (str) { return str.toLowerCase(); });
    };
    cmds.setSublimeMark = function (cm) {
        if (cm.state.sublimeMark)
            cm.state.sublimeMark.clear();
        cm.state.sublimeMark = cm.setBookmark(cm.getCursor());
    };
    cmds.selectToSublimeMark = function (cm) {
        var found = cm.state.sublimeMark && cm.state.sublimeMark.find();
        if (found)
            cm.setSelection(cm.getCursor(), found);
    };
    cmds.deleteToSublimeMark = function (cm) {
        var found = cm.state.sublimeMark && cm.state.sublimeMark.find();
        if (found) {
            var from = cm.getCursor(), to = found;
            if (CodeMirror.cmpPos(from, to) > 0) {
                var tmp = to;
                to = from;
                from = tmp;
            }
            cm.state.sublimeKilled = cm.getRange(from, to);
            cm.replaceRange("", from, to);
        }
    };
    cmds.swapWithSublimeMark = function (cm) {
        var found = cm.state.sublimeMark && cm.state.sublimeMark.find();
        if (found) {
            cm.state.sublimeMark.clear();
            cm.state.sublimeMark = cm.setBookmark(cm.getCursor());
            cm.setCursor(found);
        }
    };
    cmds.sublimeYank = function (cm) {
        if (cm.state.sublimeKilled != null)
            cm.replaceSelection(cm.state.sublimeKilled, null, "paste");
    };
    cmds.showInCenter = function (cm) {
        var pos = cm.cursorCoords(null, "local");
        cm.scrollTo(null, (pos.top + pos.bottom) / 2 - cm.getScrollInfo().clientHeight / 2);
    };
    function getTarget(cm) {
        var from = cm.getCursor("from"), to = cm.getCursor("to");
        if (CodeMirror.cmpPos(from, to) == 0) {
            var word = wordAt(cm, from);
            if (!word.word)
                return;
            from = word.from;
            to = word.to;
        }
        return { from: from, to: to, query: cm.getRange(from, to), word: word };
    }
    function findAndGoTo(cm, forward) {
        var target = getTarget(cm);
        if (!target)
            return;
        var query = target.query;
        var cur = cm.getSearchCursor(query, forward ? target.to : target.from);
        if (forward ? cur.findNext() : cur.findPrevious()) {
            cm.setSelection(cur.from(), cur.to());
        }
        else {
            cur = cm.getSearchCursor(query, forward ? Pos(cm.firstLine(), 0)
                : cm.clipPos(Pos(cm.lastLine())));
            if (forward ? cur.findNext() : cur.findPrevious())
                cm.setSelection(cur.from(), cur.to());
            else if (target.word)
                cm.setSelection(target.from, target.to);
        }
    }
    ;
    cmds.findUnder = function (cm) { findAndGoTo(cm, true); };
    cmds.findUnderPrevious = function (cm) { findAndGoTo(cm, false); };
    cmds.findAllUnder = function (cm) {
        var target = getTarget(cm);
        if (!target)
            return;
        var cur = cm.getSearchCursor(target.query);
        var matches = [];
        var primaryIndex = -1;
        while (cur.findNext()) {
            matches.push({ anchor: cur.from(), head: cur.to() });
            if (cur.from().line <= target.from.line && cur.from().ch <= target.from.ch)
                primaryIndex++;
        }
        cm.setSelections(matches, primaryIndex);
    };
    var keyMap = CodeMirror.keyMap;
    keyMap.macSublime = {
        "Cmd-Left": "goLineStartSmart",
        "Shift-Tab": "indentLess",
        "Shift-Ctrl-K": "deleteLine",
        "Alt-Q": "wrapLines",
        "Ctrl-Left": "goSubwordLeft",
        "Ctrl-Right": "goSubwordRight",
        "Ctrl-Alt-Up": "scrollLineUp",
        "Ctrl-Alt-Down": "scrollLineDown",
        "Cmd-L": "selectLine",
        "Shift-Cmd-L": "splitSelectionByLine",
        "Esc": "singleSelectionTop",
        "Cmd-Enter": "insertLineAfter",
        "Shift-Cmd-Enter": "insertLineBefore",
        "Cmd-D": "selectNextOccurrence",
        "Shift-Cmd-Space": "selectScope",
        "Shift-Cmd-M": "selectBetweenBrackets",
        "Cmd-M": "goToBracket",
        "Cmd-Ctrl-Up": "swapLineUp",
        "Cmd-Ctrl-Down": "swapLineDown",
        "Cmd-/": "toggleCommentIndented",
        "Cmd-J": "joinLines",
        "Shift-Cmd-D": "duplicateLine",
        "F5": "sortLines",
        "Shift-F5": "reverseSortLines",
        "Cmd-F5": "sortLinesInsensitive",
        "Shift-Cmd-F5": "reverseSortLinesInsensitive",
        "F2": "nextBookmark",
        "Shift-F2": "prevBookmark",
        "Cmd-F2": "toggleBookmark",
        "Shift-Cmd-F2": "clearBookmarks",
        "Alt-F2": "selectBookmarks",
        "Backspace": "smartBackspace",
        "Cmd-K Cmd-D": "skipAndSelectNextOccurrence",
        "Cmd-K Cmd-K": "delLineRight",
        "Cmd-K Cmd-U": "upcaseAtCursor",
        "Cmd-K Cmd-L": "downcaseAtCursor",
        "Cmd-K Cmd-Space": "setSublimeMark",
        "Cmd-K Cmd-A": "selectToSublimeMark",
        "Cmd-K Cmd-W": "deleteToSublimeMark",
        "Cmd-K Cmd-X": "swapWithSublimeMark",
        "Cmd-K Cmd-Y": "sublimeYank",
        "Cmd-K Cmd-C": "showInCenter",
        "Cmd-K Cmd-G": "clearBookmarks",
        "Cmd-K Cmd-Backspace": "delLineLeft",
        "Cmd-K Cmd-1": "foldAll",
        "Cmd-K Cmd-0": "unfoldAll",
        "Cmd-K Cmd-J": "unfoldAll",
        "Ctrl-Shift-Up": "addCursorToPrevLine",
        "Ctrl-Shift-Down": "addCursorToNextLine",
        "Cmd-F3": "findUnder",
        "Shift-Cmd-F3": "findUnderPrevious",
        "Alt-F3": "findAllUnder",
        "Shift-Cmd-[": "fold",
        "Shift-Cmd-]": "unfold",
        "Cmd-I": "findIncremental",
        "Shift-Cmd-I": "findIncrementalReverse",
        "Cmd-H": "replace",
        "F3": "findNext",
        "Shift-F3": "findPrev",
        "fallthrough": "macDefault"
    };
    CodeMirror.normalizeKeyMap(keyMap.macSublime);
    keyMap.pcSublime = {
        "Shift-Tab": "indentLess",
        "Shift-Ctrl-K": "deleteLine",
        "Alt-Q": "wrapLines",
        "Ctrl-T": "transposeChars",
        "Alt-Left": "goSubwordLeft",
        "Alt-Right": "goSubwordRight",
        "Ctrl-Up": "scrollLineUp",
        "Ctrl-Down": "scrollLineDown",
        "Ctrl-L": "selectLine",
        "Shift-Ctrl-L": "splitSelectionByLine",
        "Esc": "singleSelectionTop",
        "Ctrl-Enter": "insertLineAfter",
        "Shift-Ctrl-Enter": "insertLineBefore",
        "Ctrl-D": "selectNextOccurrence",
        "Shift-Ctrl-Space": "selectScope",
        "Shift-Ctrl-M": "selectBetweenBrackets",
        "Ctrl-M": "goToBracket",
        "Shift-Ctrl-Up": "swapLineUp",
        "Shift-Ctrl-Down": "swapLineDown",
        "Ctrl-/": "toggleCommentIndented",
        "Ctrl-J": "joinLines",
        "Shift-Ctrl-D": "duplicateLine",
        "F9": "sortLines",
        "Shift-F9": "reverseSortLines",
        "Ctrl-F9": "sortLinesInsensitive",
        "Shift-Ctrl-F9": "reverseSortLinesInsensitive",
        "F2": "nextBookmark",
        "Shift-F2": "prevBookmark",
        "Ctrl-F2": "toggleBookmark",
        "Shift-Ctrl-F2": "clearBookmarks",
        "Alt-F2": "selectBookmarks",
        "Backspace": "smartBackspace",
        "Ctrl-K Ctrl-D": "skipAndSelectNextOccurrence",
        "Ctrl-K Ctrl-K": "delLineRight",
        "Ctrl-K Ctrl-U": "upcaseAtCursor",
        "Ctrl-K Ctrl-L": "downcaseAtCursor",
        "Ctrl-K Ctrl-Space": "setSublimeMark",
        "Ctrl-K Ctrl-A": "selectToSublimeMark",
        "Ctrl-K Ctrl-W": "deleteToSublimeMark",
        "Ctrl-K Ctrl-X": "swapWithSublimeMark",
        "Ctrl-K Ctrl-Y": "sublimeYank",
        "Ctrl-K Ctrl-C": "showInCenter",
        "Ctrl-K Ctrl-G": "clearBookmarks",
        "Ctrl-K Ctrl-Backspace": "delLineLeft",
        "Ctrl-K Ctrl-1": "foldAll",
        "Ctrl-K Ctrl-0": "unfoldAll",
        "Ctrl-K Ctrl-J": "unfoldAll",
        "Ctrl-Alt-Up": "addCursorToPrevLine",
        "Ctrl-Alt-Down": "addCursorToNextLine",
        "Ctrl-F3": "findUnder",
        "Shift-Ctrl-F3": "findUnderPrevious",
        "Alt-F3": "findAllUnder",
        "Shift-Ctrl-[": "fold",
        "Shift-Ctrl-]": "unfold",
        "Ctrl-I": "findIncremental",
        "Shift-Ctrl-I": "findIncrementalReverse",
        "Ctrl-H": "replace",
        "F3": "findNext",
        "Shift-F3": "findPrev",
        "fallthrough": "pcDefault"
    };
    CodeMirror.normalizeKeyMap(keyMap.pcSublime);
    var mac = keyMap.default == keyMap.macDefault;
    keyMap.sublime = mac ? keyMap.macSublime : keyMap.pcSublime;
});
//# sourceMappingURL=sublime.js.map