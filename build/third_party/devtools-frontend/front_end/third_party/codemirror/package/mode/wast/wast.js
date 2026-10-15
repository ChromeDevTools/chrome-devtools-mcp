"use strict";
// CodeMirror, copyright (c) by Marijn Haverbeke and others
// Distributed under an MIT license: https://codemirror.net/LICENSE
(function (mod) {
    if (typeof exports == "object" && typeof module == "object") // CommonJS
        mod(require("../../lib/codemirror"), require("../../addon/mode/simple"));
    else if (typeof define == "function" && define.amd) // AMD
        define(["../../lib/codemirror", "../../addon/mode/simple"], mod);
    else // Plain browser env
        mod(CodeMirror);
})(function (CodeMirror) {
    "use strict";
    var kKeywords = [
        "align",
        "block",
        "br(_if|_table|_on_(cast|data|func|i31|null))?",
        "call(_indirect|_ref)?",
        "current_memory",
        "\\bdata\\b",
        "catch(_all)?",
        "delegate",
        "drop",
        "elem",
        "else",
        "end",
        "export",
        "\\bextern\\b",
        "\\bfunc\\b",
        "global(\\.(get|set))?",
        "if",
        "import",
        "local(\\.(get|set|tee))?",
        "loop",
        "module",
        "mut",
        "nop",
        "offset",
        "param",
        "result",
        "rethrow",
        "return(_call(_indirect|_ref)?)?",
        "select",
        "start",
        "table(\\.(size|get|set|size|grow|fill|init|copy))?",
        "then",
        "throw",
        "try",
        "type",
        "unreachable",
        "unwind",
        // Numeric opcodes.
        "i(32|64)\\.(store(8|16)|(load(8|16)_[su]))",
        "i64\\.(load32_[su]|store32)",
        "[fi](32|64)\\.(const|load|store)",
        "f(32|64)\\.(abs|add|ceil|copysign|div|eq|floor|[gl][et]|max|min|mul|nearest|neg?|sqrt|sub|trunc)",
        "i(32|64)\\.(a[dn]d|c[lt]z|(div|rem)_[su]|eqz?|[gl][te]_[su]|mul|ne|popcnt|rot[lr]|sh(l|r_[su])|sub|x?or)",
        "i64\\.extend_[su]_i32",
        "i32\\.wrap_i64",
        "i(32|64)\\.trunc_f(32|64)_[su]",
        "f(32|64)\\.convert_i(32|64)_[su]",
        "f64\\.promote_f32",
        "f32\\.demote_f64",
        "f32\\.reinterpret_i32",
        "i32\\.reinterpret_f32",
        "f64\\.reinterpret_i64",
        "i64\\.reinterpret_f64",
        // Atomics.
        "memory(\\.((atomic\\.(notify|wait(32|64)))|grow|size))?",
        "i64\.atomic\\.(load32_u|store32|rmw32\\.(a[dn]d|sub|x?or|(cmp)?xchg)_u)",
        "i(32|64)\\.atomic\\.(load((8|16)_u)?|store(8|16)?|rmw(\\.(a[dn]d|sub|x?or|(cmp)?xchg)|(8|16)\\.(a[dn]d|sub|x?or|(cmp)?xchg)_u))",
        // SIMD.
        "v128\\.load(8x8|16x4|32x2)_[su]",
        "v128\\.load(8|16|32|64)_splat",
        "v128\\.(load|store)(8|16|32|64)_lane",
        "v128\\.load(32|64)_zero",
        "v128\.(load|store|const|not|andnot|and|or|xor|bitselect|any_true)",
        "i(8x16|16x8)\\.(extract_lane_[su]|(add|sub)_sat_[su]|avgr_u)",
        "i(8x16|16x8|32x4|64x2)\\.(neg|add|sub|abs|shl|shr_[su]|all_true|bitmask|eq|ne|[lg][te]_s)",
        "(i(8x16|16x8|32x4|64x2)|f(32x4|64x2))\.(splat|replace_lane)",
        "i(8x16|16x8|32x4)\\.(([lg][te]_u)|((min|max)_[su]))",
        "f(32x4|64x2)\\.(neg|add|sub|abs|nearest|eq|ne|[lg][te]|sqrt|mul|div|min|max|ceil|floor|trunc)",
        "[fi](32x4|64x2)\\.extract_lane",
        "i8x16\\.(shuffle|swizzle|popcnt|narrow_i16x8_[su])",
        "i16x8\\.(narrow_i32x4_[su]|mul|extadd_pairwise_i8x16_[su]|q15mulr_sat_s)",
        "i16x8\\.(extend|extmul)_(low|high)_i8x16_[su]",
        "i32x4\\.(mul|dot_i16x8_s|trunc_sat_f64x2_[su]_zero)",
        "i32x4\\.((extend|extmul)_(low|high)_i16x8_|trunc_sat_f32x4_|extadd_pairwise_i16x8_)[su]",
        "i64x2\\.(mul|(extend|extmul)_(low|high)_i32x4_[su])",
        "f32x4\\.(convert_i32x4_[su]|demote_f64x2_zero)",
        "f64x2\\.(promote_low_f32x4|convert_low_i32x4_[su])",
        // Reference types, function references, and GC.
        "\\bany\\b",
        "array\\.len",
        "(array|struct)(\\.(new_(default_)?with_rtt|get(_[su])?|set))?",
        "\\beq\\b",
        "field",
        "i31\\.(new|get_[su])",
        "\\bnull\\b",
        "ref(\\.(([ai]s_(data|func|i31))|cast|eq|func|(is_|as_non_)?null|test))?",
        "rtt(\\.(canon|sub))?",
    ];
    CodeMirror.defineSimpleMode('wast', {
        start: [
            { regex: /[+\-]?(?:nan(?::0x[0-9a-fA-F]+)?|infinity|inf|0x[0-9a-fA-F]+\.?[0-9a-fA-F]*p[+\/-]?\d+|\d+(?:\.\d*)?[eE][+\-]?\d*|\d+\.\d*|0x[0-9a-fA-F]+|\d+)/, token: "number" },
            { regex: new RegExp(kKeywords.join('|')), token: "keyword" },
            { regex: /\b((any|data|eq|extern|i31|func)ref|[fi](32|64)|i(8|16))\b/, token: "atom" },
            { regex: /\$([a-zA-Z0-9_`\+\-\*\/\\\^~=<>!\?@#$%&|:\.]+)/, token: "variable-2" },
            { regex: /"(?:[^"\\\x00-\x1f\x7f]|\\[nt\\'"]|\\[0-9a-fA-F][0-9a-fA-F])*"/, token: "string" },
            { regex: /\(;.*?/, token: "comment", next: "comment" },
            { regex: /;;.*$/, token: "comment" },
            { regex: /\(/, indent: true },
            { regex: /\)/, dedent: true },
        ],
        comment: [
            { regex: /.*?;\)/, token: "comment", next: "start" },
            { regex: /.*/, token: "comment" },
        ],
        meta: {
            dontIndentStates: ['comment'],
        },
    });
    // https://github.com/WebAssembly/design/issues/981 mentions text/webassembly,
    // which seems like a reasonable choice, although it's not standard right now.
    CodeMirror.defineMIME("text/webassembly", "wast");
});
//# sourceMappingURL=wast.js.map