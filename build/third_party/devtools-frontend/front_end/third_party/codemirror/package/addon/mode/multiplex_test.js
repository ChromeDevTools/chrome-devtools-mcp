"use strict";
// CodeMirror, copyright (c) by Marijn Haverbeke and others
// Distributed under an MIT license: https://codemirror.net/LICENSE
(function () {
    CodeMirror.defineMode("markdown_with_stex", function () {
        var inner = CodeMirror.getMode({}, "stex");
        var outer = CodeMirror.getMode({}, "markdown");
        var innerOptions = {
            open: '$',
            close: '$',
            mode: inner,
            delimStyle: 'delim',
            innerStyle: 'inner'
        };
        return CodeMirror.multiplexingMode(outer, innerOptions);
    });
    var mode = CodeMirror.getMode({}, "markdown_with_stex");
    function MT(name) {
        test.mode(name, mode, Array.prototype.slice.call(arguments, 1), 'multiplexing');
    }
    MT("stexInsideMarkdown", "[strong **Equation:**] [delim&delim-open $][inner&tag \\pi][delim&delim-close $]");
    CodeMirror.defineMode("identical_delim_multiplex", function () {
        return CodeMirror.multiplexingMode(CodeMirror.getMode({ indentUnit: 2 }, "javascript"), {
            open: "#",
            close: "#",
            mode: CodeMirror.getMode({}, "markdown"),
            parseDelimiters: true,
            innerStyle: "q"
        });
    });
    var mode2 = CodeMirror.getMode({}, "identical_delim_multiplex");
    test.mode("identical_delimiters_with_parseDelimiters", mode2, [
        "[keyword let] [def x] [operator =] [q #foo][q&em *bar*][q #];"
    ], "multiplexing");
})();
//# sourceMappingURL=multiplex_test.js.map