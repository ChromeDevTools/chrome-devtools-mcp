import { strictEqual, notStrictEqual } from 'assert';
import { resolve, dirname, normalize, join, relative, extname, basename } from 'path';
import { statSync, readdirSync, readFileSync, writeFile } from 'fs';
import { format, inspect } from 'util';
import { fileURLToPath } from 'url';
import { createRequire } from 'node:module';
import { readdirSync as readdirSync$1, readFileSync as readFileSync$1 } from 'node:fs';

/**
Copyright 2020 Intel Corporation
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/
var Pe = Object.defineProperty;
var a = (e, t) => Pe(e, "name", { value: t, configurable: true });
var P = class {
  type = 3;
  name = "";
  prefix = "";
  value = "";
  suffix = "";
  modifier = 3;
  constructor(t, r, n, c, l, f) {
    this.type = t, this.name = r, this.prefix = n, this.value = c, this.suffix = l, this.modifier = f;
  }
  hasCustomName() {
    return this.name !== "" && typeof this.name != "number";
  }
};
a(P, "Part");
var Re = /[$_\p{ID_Start}]/u;
var Ee = /[$_\u200C\u200D\p{ID_Continue}]/u;
var v = ".*";
function Oe(e, t) {
  return (t ? /^[\x00-\xFF]*$/ : /^[\x00-\x7F]*$/).test(e);
}
a(Oe, "isASCII");
function D(e, t = false) {
  let r = [], n = 0;
  for (; n < e.length; ) {
    let c = e[n], l = a(function(f) {
      if (!t) throw new TypeError(f);
      r.push({ type: "INVALID_CHAR", index: n, value: e[n++] });
    }, "ErrorOrInvalid");
    if (c === "*") {
      r.push({ type: "ASTERISK", index: n, value: e[n++] });
      continue;
    }
    if (c === "+" || c === "?") {
      r.push({ type: "OTHER_MODIFIER", index: n, value: e[n++] });
      continue;
    }
    if (c === "\\") {
      r.push({ type: "ESCAPED_CHAR", index: n++, value: e[n++] });
      continue;
    }
    if (c === "{") {
      r.push({ type: "OPEN", index: n, value: e[n++] });
      continue;
    }
    if (c === "}") {
      r.push({ type: "CLOSE", index: n, value: e[n++] });
      continue;
    }
    if (c === ":") {
      let f = "", s = n + 1;
      for (; s < e.length; ) {
        let i = e.substr(s, 1);
        if (s === n + 1 && Re.test(i) || s !== n + 1 && Ee.test(i)) {
          f += e[s++];
          continue;
        }
        break;
      }
      if (!f) {
        l(`Missing parameter name at ${n}`);
        continue;
      }
      r.push({ type: "NAME", index: n, value: f }), n = s;
      continue;
    }
    if (c === "(") {
      let f = 1, s = "", i = n + 1, o = false;
      if (e[i] === "?") {
        l(`Pattern cannot start with "?" at ${i}`);
        continue;
      }
      for (; i < e.length; ) {
        if (!Oe(e[i], false)) {
          l(`Invalid character '${e[i]}' at ${i}.`), o = true;
          break;
        }
        if (e[i] === "\\") {
          s += e[i++] + e[i++];
          continue;
        }
        if (e[i] === ")") {
          if (f--, f === 0) {
            i++;
            break;
          }
        } else if (e[i] === "(" && (f++, e[i + 1] !== "?")) {
          l(`Capturing groups are not allowed at ${i}`), o = true;
          break;
        }
        s += e[i++];
      }
      if (o) continue;
      if (f) {
        l(`Unbalanced pattern at ${n}`);
        continue;
      }
      if (!s) {
        l(`Missing pattern at ${n}`);
        continue;
      }
      r.push({ type: "REGEX", index: n, value: s }), n = i;
      continue;
    }
    r.push({ type: "CHAR", index: n, value: e[n++] });
  }
  return r.push({ type: "END", index: n, value: "" }), r;
}
a(D, "lexer");
function F(e, t = {}) {
  let r = D(e);
  t.delimiter ??= "/#?", t.prefixes ??= "./";
  let n = `[^${x(t.delimiter)}]+?`, c = [], l = 0, f = 0, i =  new Set(), o = a((u) => {
    if (f < r.length && r[f].type === u) return r[f++].value;
  }, "tryConsume"), h = a(() => o("OTHER_MODIFIER") ?? o("ASTERISK"), "tryConsumeModifier"), p = a((u) => {
    let d = o(u);
    if (d !== void 0) return d;
    let { type: g, index: y } = r[f];
    throw new TypeError(`Unexpected ${g} at ${y}, expected ${u}`);
  }, "mustConsume"), A = a(() => {
    let u = "", d;
    for (; d = o("CHAR") ?? o("ESCAPED_CHAR"); ) u += d;
    return u;
  }, "consumeText"), xe = a((u) => u, "DefaultEncodePart"), N = t.encodePart || xe, H = "", $ = a((u) => {
    H += u;
  }, "appendToPendingFixedValue"), M = a(() => {
    H.length && (c.push(new P(3, "", "", N(H), "", 3)), H = "");
  }, "maybeAddPartFromPendingFixedValue"), X = a((u, d, g, y, Z) => {
    let m = 3;
    switch (Z) {
      case "?":
        m = 1;
        break;
      case "*":
        m = 0;
        break;
      case "+":
        m = 2;
        break;
    }
    if (!d && !g && m === 3) {
      $(u);
      return;
    }
    if (M(), !d && !g) {
      if (!u) return;
      c.push(new P(3, "", "", N(u), "", m));
      return;
    }
    let S;
    g ? g === "*" ? S = v : S = g : S = n;
    let k = 2;
    S === n ? (k = 1, S = "") : S === v && (k = 0, S = "");
    let E;
    if (d ? E = d : g && (E = l++), i.has(E)) throw new TypeError(`Duplicate name '${E}'.`);
    i.add(E), c.push(new P(k, E, N(u), S, N(y), m));
  }, "addPart");
  for (; f < r.length; ) {
    let u = o("CHAR"), d = o("NAME"), g = o("REGEX");
    if (!d && !g && (g = o("ASTERISK")), d || g) {
      let m = u ?? "";
      t.prefixes.indexOf(m) === -1 && ($(m), m = ""), M();
      let S = h();
      X(m, d, g, "", S);
      continue;
    }
    let y = u ?? o("ESCAPED_CHAR");
    if (y) {
      $(y);
      continue;
    }
    if (o("OPEN")) {
      let m = A(), S = o("NAME"), k = o("REGEX");
      !S && !k && (k = o("ASTERISK"));
      let E = A();
      p("CLOSE");
      let be = h();
      X(m, S, k, E, be);
      continue;
    }
    M(), p("END");
  }
  return c;
}
a(F, "parse");
function x(e) {
  return e.replace(/([.+*?^${}()[\]|/\\])/g, "\\$1");
}
a(x, "escapeString");
function B(e) {
  return e && e.ignoreCase ? "ui" : "u";
}
a(B, "flags");
function q(e, t, r) {
  return W(F(e, r), t, r);
}
a(q, "stringToRegexp");
function T(e) {
  switch (e) {
    case 0:
      return "*";
    case 1:
      return "?";
    case 2:
      return "+";
    case 3:
      return "";
  }
}
a(T, "modifierToString");
function W(e, t, r = {}) {
  r.delimiter ??= "/#?", r.prefixes ??= "./", r.sensitive ??= false, r.strict ??= false, r.end ??= true, r.start ??= true, r.endsWith = "";
  let n = r.start ? "^" : "";
  for (let s of e) {
    if (s.type === 3) {
      s.modifier === 3 ? n += x(s.value) : n += `(?:${x(s.value)})${T(s.modifier)}`;
      continue;
    }
    t && t.push(s.name);
    let i = `[^${x(r.delimiter)}]+?`, o = s.value;
    if (s.type === 1 ? o = i : s.type === 0 && (o = v), !s.prefix.length && !s.suffix.length) {
      s.modifier === 3 || s.modifier === 1 ? n += `(${o})${T(s.modifier)}` : n += `((?:${o})${T(s.modifier)})`;
      continue;
    }
    if (s.modifier === 3 || s.modifier === 1) {
      n += `(?:${x(s.prefix)}(${o})${x(s.suffix)})`, n += T(s.modifier);
      continue;
    }
    n += `(?:${x(s.prefix)}`, n += `((?:${o})(?:`, n += x(s.suffix), n += x(s.prefix), n += `(?:${o}))*)${x(s.suffix)})`, s.modifier === 0 && (n += "?");
  }
  let c = `[${x(r.endsWith)}]|$`, l = `[${x(r.delimiter)}]`;
  if (r.end) return r.strict || (n += `${l}?`), r.endsWith.length ? n += `(?=${c})` : n += "$", new RegExp(n, B(r));
  r.strict || (n += `(?:${l}(?=${c}))?`);
  let f = false;
  if (e.length) {
    let s = e[e.length - 1];
    s.type === 3 && s.modifier === 3 && (f = r.delimiter.indexOf(s) > -1);
  }
  return f || (n += `(?=${l}|${c})`), new RegExp(n, B(r));
}
a(W, "partsToRegexp");
var b = { delimiter: "", prefixes: "", sensitive: true, strict: true };
var J = { delimiter: ".", prefixes: "", sensitive: true, strict: true };
var Q = { delimiter: "/", prefixes: "/", sensitive: true, strict: true };
function ee(e, t) {
  return e.length ? e[0] === "/" ? true : !t || e.length < 2 ? false : (e[0] == "\\" || e[0] == "{") && e[1] == "/" : false;
}
a(ee, "isAbsolutePathname");
function te(e, t) {
  return e.startsWith(t) ? e.substring(t.length, e.length) : e;
}
a(te, "maybeStripPrefix");
function ke(e, t) {
  return e.endsWith(t) ? e.substr(0, e.length - t.length) : e;
}
a(ke, "maybeStripSuffix");
function _(e) {
  return !e || e.length < 2 ? false : e[0] === "[" || (e[0] === "\\" || e[0] === "{") && e[1] === "[";
}
a(_, "treatAsIPv6Hostname");
var re$1 = ["ftp", "file", "http", "https", "ws", "wss"];
function U(e) {
  if (!e) return true;
  for (let t of re$1) if (e.test(t)) return true;
  return false;
}
a(U, "isSpecialScheme");
function ne(e, t) {
  if (e = te(e, "#"), t || e === "") return e;
  let r = new URL("https://example.com");
  return r.hash = e, r.hash ? r.hash.substring(1, r.hash.length) : "";
}
a(ne, "canonicalizeHash");
function se(e, t) {
  if (e = te(e, "?"), t || e === "") return e;
  let r = new URL("https://example.com");
  return r.search = e, r.search ? r.search.substring(1, r.search.length) : "";
}
a(se, "canonicalizeSearch");
function ie(e, t) {
  return t || e === "" ? e : _(e) ? K(e) : j(e);
}
a(ie, "canonicalizeHostname");
function ae(e, t) {
  if (t || e === "") return e;
  let r = new URL("https://example.com");
  return r.password = e, r.password;
}
a(ae, "canonicalizePassword");
function oe(e, t) {
  if (t || e === "") return e;
  let r = new URL("https://example.com");
  return r.username = e, r.username;
}
a(oe, "canonicalizeUsername");
function ce(e, t, r) {
  if (r || e === "") return e;
  if (t && !re$1.includes(t)) return new URL(`${t}:${e}`).pathname;
  let n = e[0] == "/";
  return e = new URL(n ? e : "/-" + e, "https://example.com").pathname, n || (e = e.substring(2, e.length)), e;
}
a(ce, "canonicalizePathname");
function le(e, t, r) {
  return z(t) === e && (e = ""), r || e === "" ? e : G(e);
}
a(le, "canonicalizePort");
function fe(e, t) {
  return e = ke(e, ":"), t || e === "" ? e : w(e);
}
a(fe, "canonicalizeProtocol");
function z(e) {
  switch (e) {
    case "ws":
    case "http":
      return "80";
    case "wws":
    case "https":
      return "443";
    case "ftp":
      return "21";
    default:
      return "";
  }
}
a(z, "defaultPortForProtocol");
function w(e) {
  if (e === "") return e;
  if (/^[-+.A-Za-z0-9]*$/.test(e)) return e.toLowerCase();
  throw new TypeError(`Invalid protocol '${e}'.`);
}
a(w, "protocolEncodeCallback");
function he(e) {
  if (e === "") return e;
  let t = new URL("https://example.com");
  return t.username = e, t.username;
}
a(he, "usernameEncodeCallback");
function ue(e) {
  if (e === "") return e;
  let t = new URL("https://example.com");
  return t.password = e, t.password;
}
a(ue, "passwordEncodeCallback");
function j(e) {
  if (e === "") return e;
  if (/[\t\n\r #%/:<>?@[\]^\\|]/g.test(e)) throw new TypeError(`Invalid hostname '${e}'`);
  let t = new URL("https://example.com");
  return t.hostname = e, t.hostname;
}
a(j, "hostnameEncodeCallback");
function K(e) {
  if (e === "") return e;
  if (/[^0-9a-fA-F[\]:]/g.test(e)) throw new TypeError(`Invalid IPv6 hostname '${e}'`);
  return e.toLowerCase();
}
a(K, "ipv6HostnameEncodeCallback");
function G(e) {
  if (e === "" || /^[0-9]*$/.test(e) && parseInt(e) <= 65535) return e;
  throw new TypeError(`Invalid port '${e}'.`);
}
a(G, "portEncodeCallback");
function de(e) {
  if (e === "") return e;
  let t = new URL("https://example.com");
  return t.pathname = e[0] !== "/" ? "/-" + e : e, e[0] !== "/" ? t.pathname.substring(2, t.pathname.length) : t.pathname;
}
a(de, "standardURLPathnameEncodeCallback");
function pe(e) {
  return e === "" ? e : new URL(`data:${e}`).pathname;
}
a(pe, "pathURLPathnameEncodeCallback");
function ge(e) {
  if (e === "") return e;
  let t = new URL("https://example.com");
  return t.search = e, t.search.substring(1, t.search.length);
}
a(ge, "searchEncodeCallback");
function me(e) {
  if (e === "") return e;
  let t = new URL("https://example.com");
  return t.hash = e, t.hash.substring(1, t.hash.length);
}
a(me, "hashEncodeCallback");
var C = class {
  #i;
  #n = [];
  #t = {};
  #e = 0;
  #s = 1;
  #l = 0;
  #o = 0;
  #d = 0;
  #p = 0;
  #g = false;
  constructor(t) {
    this.#i = t;
  }
  get result() {
    return this.#t;
  }
  parse() {
    for (this.#n = D(this.#i, true); this.#e < this.#n.length; this.#e += this.#s) {
      if (this.#s = 1, this.#n[this.#e].type === "END") {
        if (this.#o === 0) {
          this.#b(), this.#f() ? this.#r(9, 1) : this.#h() ? this.#r(8, 1) : this.#r(7, 0);
          continue;
        } else if (this.#o === 2) {
          this.#u(5);
          continue;
        }
        this.#r(10, 0);
        break;
      }
      if (this.#d > 0) if (this.#A()) this.#d -= 1;
      else continue;
      if (this.#T()) {
        this.#d += 1;
        continue;
      }
      switch (this.#o) {
        case 0:
          this.#P() && this.#u(1);
          break;
        case 1:
          if (this.#P()) {
            this.#C();
            let t = 7, r = 1;
            this.#E() ? (t = 2, r = 3) : this.#g && (t = 2), this.#r(t, r);
          }
          break;
        case 2:
          this.#S() ? this.#u(3) : (this.#x() || this.#h() || this.#f()) && this.#u(5);
          break;
        case 3:
          this.#O() ? this.#r(4, 1) : this.#S() && this.#r(5, 1);
          break;
        case 4:
          this.#S() && this.#r(5, 1);
          break;
        case 5:
          this.#y() ? this.#p += 1 : this.#w() && (this.#p -= 1), this.#k() && !this.#p ? this.#r(6, 1) : this.#x() ? this.#r(7, 0) : this.#h() ? this.#r(8, 1) : this.#f() && this.#r(9, 1);
          break;
        case 6:
          this.#x() ? this.#r(7, 0) : this.#h() ? this.#r(8, 1) : this.#f() && this.#r(9, 1);
          break;
        case 7:
          this.#h() ? this.#r(8, 1) : this.#f() && this.#r(9, 1);
          break;
        case 8:
          this.#f() && this.#r(9, 1);
          break;
      }
    }
    this.#t.hostname !== void 0 && this.#t.port === void 0 && (this.#t.port = "");
  }
  #r(t, r) {
    switch (this.#o) {
      case 0:
        break;
      case 1:
        this.#t.protocol = this.#c();
        break;
      case 2:
        break;
      case 3:
        this.#t.username = this.#c();
        break;
      case 4:
        this.#t.password = this.#c();
        break;
      case 5:
        this.#t.hostname = this.#c();
        break;
      case 6:
        this.#t.port = this.#c();
        break;
      case 7:
        this.#t.pathname = this.#c();
        break;
      case 8:
        this.#t.search = this.#c();
        break;
      case 9:
        this.#t.hash = this.#c();
        break;
    }
    this.#o !== 0 && t !== 10 && ([1, 2, 3, 4].includes(this.#o) && [6, 7, 8, 9].includes(t) && (this.#t.hostname ??= ""), [1, 2, 3, 4, 5, 6].includes(this.#o) && [8, 9].includes(t) && (this.#t.pathname ??= this.#g ? "/" : ""), [1, 2, 3, 4, 5, 6, 7].includes(this.#o) && t === 9 && (this.#t.search ??= "")), this.#R(t, r);
  }
  #R(t, r) {
    this.#o = t, this.#l = this.#e + r, this.#e += r, this.#s = 0;
  }
  #b() {
    this.#e = this.#l, this.#s = 0;
  }
  #u(t) {
    this.#b(), this.#o = t;
  }
  #m(t) {
    return t < 0 && (t = this.#n.length - t), t < this.#n.length ? this.#n[t] : this.#n[this.#n.length - 1];
  }
  #a(t, r) {
    let n = this.#m(t);
    return n.value === r && (n.type === "CHAR" || n.type === "ESCAPED_CHAR" || n.type === "INVALID_CHAR");
  }
  #P() {
    return this.#a(this.#e, ":");
  }
  #E() {
    return this.#a(this.#e + 1, "/") && this.#a(this.#e + 2, "/");
  }
  #S() {
    return this.#a(this.#e, "@");
  }
  #O() {
    return this.#a(this.#e, ":");
  }
  #k() {
    return this.#a(this.#e, ":");
  }
  #x() {
    return this.#a(this.#e, "/");
  }
  #h() {
    if (this.#a(this.#e, "?")) return true;
    if (this.#n[this.#e].value !== "?") return false;
    let t = this.#m(this.#e - 1);
    return t.type !== "NAME" && t.type !== "REGEX" && t.type !== "CLOSE" && t.type !== "ASTERISK";
  }
  #f() {
    return this.#a(this.#e, "#");
  }
  #T() {
    return this.#n[this.#e].type == "OPEN";
  }
  #A() {
    return this.#n[this.#e].type == "CLOSE";
  }
  #y() {
    return this.#a(this.#e, "[");
  }
  #w() {
    return this.#a(this.#e, "]");
  }
  #c() {
    let t = this.#n[this.#e], r = this.#m(this.#l).index;
    return this.#i.substring(r, t.index);
  }
  #C() {
    let t = {};
    Object.assign(t, b), t.encodePart = w;
    let r = q(this.#c(), void 0, t);
    this.#g = U(r);
  }
};
a(C, "Parser");
var V = ["protocol", "username", "password", "hostname", "port", "pathname", "search", "hash"];
var O = "*";
function Se(e, t) {
  if (typeof e != "string") throw new TypeError("parameter 1 is not of type 'string'.");
  let r = new URL(e, t);
  return { protocol: r.protocol.substring(0, r.protocol.length - 1), username: r.username, password: r.password, hostname: r.hostname, port: r.port, pathname: r.pathname, search: r.search !== "" ? r.search.substring(1, r.search.length) : void 0, hash: r.hash !== "" ? r.hash.substring(1, r.hash.length) : void 0 };
}
a(Se, "extractValues");
function R(e, t) {
  return t ? I(e) : e;
}
a(R, "processBaseURLString");
function L(e, t, r) {
  let n;
  if (typeof t.baseURL == "string") try {
    n = new URL(t.baseURL), t.protocol === void 0 && (e.protocol = R(n.protocol.substring(0, n.protocol.length - 1), r)), !r && t.protocol === void 0 && t.hostname === void 0 && t.port === void 0 && t.username === void 0 && (e.username = R(n.username, r)), !r && t.protocol === void 0 && t.hostname === void 0 && t.port === void 0 && t.username === void 0 && t.password === void 0 && (e.password = R(n.password, r)), t.protocol === void 0 && t.hostname === void 0 && (e.hostname = R(n.hostname, r)), t.protocol === void 0 && t.hostname === void 0 && t.port === void 0 && (e.port = R(n.port, r)), t.protocol === void 0 && t.hostname === void 0 && t.port === void 0 && t.pathname === void 0 && (e.pathname = R(n.pathname, r)), t.protocol === void 0 && t.hostname === void 0 && t.port === void 0 && t.pathname === void 0 && t.search === void 0 && (e.search = R(n.search.substring(1, n.search.length), r)), t.protocol === void 0 && t.hostname === void 0 && t.port === void 0 && t.pathname === void 0 && t.search === void 0 && t.hash === void 0 && (e.hash = R(n.hash.substring(1, n.hash.length), r));
  } catch {
    throw new TypeError(`invalid baseURL '${t.baseURL}'.`);
  }
  if (typeof t.protocol == "string" && (e.protocol = fe(t.protocol, r)), typeof t.username == "string" && (e.username = oe(t.username, r)), typeof t.password == "string" && (e.password = ae(t.password, r)), typeof t.hostname == "string" && (e.hostname = ie(t.hostname, r)), typeof t.port == "string" && (e.port = le(t.port, e.protocol, r)), typeof t.pathname == "string") {
    if (e.pathname = t.pathname, n && !ee(e.pathname, r)) {
      let c = n.pathname.lastIndexOf("/");
      c >= 0 && (e.pathname = R(n.pathname.substring(0, c + 1), r) + e.pathname);
    }
    e.pathname = ce(e.pathname, e.protocol, r);
  }
  return typeof t.search == "string" && (e.search = se(t.search, r)), typeof t.hash == "string" && (e.hash = ne(t.hash, r)), e;
}
a(L, "applyInit");
function I(e) {
  return e.replace(/([+*?:{}()\\])/g, "\\$1");
}
a(I, "escapePatternString");
function Te(e) {
  return e.replace(/([.+*?^${}()[\]|/\\])/g, "\\$1");
}
a(Te, "escapeRegexpString");
function Ae(e, t) {
  t.delimiter ??= "/#?", t.prefixes ??= "./", t.sensitive ??= false, t.strict ??= false, t.end ??= true, t.start ??= true, t.endsWith = "";
  let r = ".*", n = `[^${Te(t.delimiter)}]+?`, c = /[$_\u200C\u200D\p{ID_Continue}]/u, l = "";
  for (let f = 0; f < e.length; ++f) {
    let s = e[f];
    if (s.type === 3) {
      if (s.modifier === 3) {
        l += I(s.value);
        continue;
      }
      l += `{${I(s.value)}}${T(s.modifier)}`;
      continue;
    }
    let i = s.hasCustomName(), o = !!s.suffix.length || !!s.prefix.length && (s.prefix.length !== 1 || !t.prefixes.includes(s.prefix)), h = f > 0 ? e[f - 1] : null, p = f < e.length - 1 ? e[f + 1] : null;
    if (!o && i && s.type === 1 && s.modifier === 3 && p && !p.prefix.length && !p.suffix.length) if (p.type === 3) {
      let A = p.value.length > 0 ? p.value[0] : "";
      o = c.test(A);
    } else o = !p.hasCustomName();
    if (!o && !s.prefix.length && h && h.type === 3) {
      let A = h.value[h.value.length - 1];
      o = t.prefixes.includes(A);
    }
    o && (l += "{"), l += I(s.prefix), i && (l += `:${s.name}`), s.type === 2 ? l += `(${s.value})` : s.type === 1 ? i || (l += `(${n})`) : s.type === 0 && (!i && (!h || h.type === 3 || h.modifier !== 3 || o || s.prefix !== "") ? l += "*" : l += `(${r})`), s.type === 1 && i && s.suffix.length && c.test(s.suffix[0]) && (l += "\\"), l += I(s.suffix), o && (l += "}"), s.modifier !== 3 && (l += T(s.modifier));
  }
  return l;
}
a(Ae, "partsToPattern");
var Y = class {
  #i;
  #n = {};
  #t = {};
  #e = {};
  #s = {};
  #l = false;
  constructor(t = {}, r, n) {
    try {
      let c;
      if (typeof r == "string" ? c = r : n = r, typeof t == "string") {
        let i = new C(t);
        if (i.parse(), t = i.result, c === void 0 && typeof t.protocol != "string") throw new TypeError("A base URL must be provided for a relative constructor string.");
        t.baseURL = c;
      } else {
        if (!t || typeof t != "object") throw new TypeError("parameter 1 is not of type 'string' and cannot convert to dictionary.");
        if (c) throw new TypeError("parameter 1 is not of type 'string'.");
      }
      typeof n > "u" && (n = { ignoreCase: false });
      let l = { ignoreCase: n.ignoreCase === true }, f = { pathname: O, protocol: O, username: O, password: O, hostname: O, port: O, search: O, hash: O };
      this.#i = L(f, t, true), z(this.#i.protocol) === this.#i.port && (this.#i.port = "");
      let s;
      for (s of V) {
        if (!(s in this.#i)) continue;
        let i = {}, o = this.#i[s];
        switch (this.#t[s] = [], s) {
          case "protocol":
            Object.assign(i, b), i.encodePart = w;
            break;
          case "username":
            Object.assign(i, b), i.encodePart = he;
            break;
          case "password":
            Object.assign(i, b), i.encodePart = ue;
            break;
          case "hostname":
            Object.assign(i, J), _(o) ? i.encodePart = K : i.encodePart = j;
            break;
          case "port":
            Object.assign(i, b), i.encodePart = G;
            break;
          case "pathname":
            U(this.#n.protocol) ? (Object.assign(i, Q, l), i.encodePart = de) : (Object.assign(i, b, l), i.encodePart = pe);
            break;
          case "search":
            Object.assign(i, b, l), i.encodePart = ge;
            break;
          case "hash":
            Object.assign(i, b, l), i.encodePart = me;
            break;
        }
        try {
          this.#s[s] = F(o, i), this.#n[s] = W(this.#s[s], this.#t[s], i), this.#e[s] = Ae(this.#s[s], i), this.#l = this.#l || this.#s[s].some((h) => h.type === 2);
        } catch {
          throw new TypeError(`invalid ${s} pattern '${this.#i[s]}'.`);
        }
      }
    } catch (c) {
      throw new TypeError(`Failed to construct 'URLPattern': ${c.message}`);
    }
  }
  get [Symbol.toStringTag]() {
    return "URLPattern";
  }
  test(t = {}, r) {
    let n = { pathname: "", protocol: "", username: "", password: "", hostname: "", port: "", search: "", hash: "" };
    if (typeof t != "string" && r) throw new TypeError("parameter 1 is not of type 'string'.");
    if (typeof t > "u") return false;
    try {
      typeof t == "object" ? n = L(n, t, false) : n = L(n, Se(t, r), false);
    } catch {
      return false;
    }
    let c;
    for (c of V) if (!this.#n[c].exec(n[c])) return false;
    return true;
  }
  exec(t = {}, r) {
    let n = { pathname: "", protocol: "", username: "", password: "", hostname: "", port: "", search: "", hash: "" };
    if (typeof t != "string" && r) throw new TypeError("parameter 1 is not of type 'string'.");
    if (typeof t > "u") return;
    try {
      typeof t == "object" ? n = L(n, t, false) : n = L(n, Se(t, r), false);
    } catch {
      return null;
    }
    let c = {};
    r ? c.inputs = [t, r] : c.inputs = [t];
    let l;
    for (l of V) {
      let f = this.#n[l].exec(n[l]);
      if (!f) return null;
      let s = {};
      for (let [i, o] of this.#t[l].entries()) if (typeof o == "string" || typeof o == "number") {
        let h = f[i + 1];
        s[o] = h;
      }
      c[l] = { input: n[l] ?? "", groups: s };
    }
    return c;
  }
  static compareComponent(t, r, n) {
    let c = a((i, o) => {
      for (let h of ["type", "modifier", "prefix", "value", "suffix"]) {
        if (i[h] < o[h]) return -1;
        if (i[h] === o[h]) continue;
        return 1;
      }
      return 0;
    }, "comparePart"), l = new P(3, "", "", "", "", 3), f = new P(0, "", "", "", "", 3), s = a((i, o) => {
      let h = 0;
      for (; h < Math.min(i.length, o.length); ++h) {
        let p = c(i[h], o[h]);
        if (p) return p;
      }
      return i.length === o.length ? 0 : c(i[h] ?? l, o[h] ?? l);
    }, "comparePartList");
    return !r.#e[t] && !n.#e[t] ? 0 : r.#e[t] && !n.#e[t] ? s(r.#s[t], [f]) : !r.#e[t] && n.#e[t] ? s([f], n.#s[t]) : s(r.#s[t], n.#s[t]);
  }
  get protocol() {
    return this.#e.protocol;
  }
  get username() {
    return this.#e.username;
  }
  get password() {
    return this.#e.password;
  }
  get hostname() {
    return this.#e.hostname;
  }
  get port() {
    return this.#e.port;
  }
  get pathname() {
    return this.#e.pathname;
  }
  get search() {
    return this.#e.search;
  }
  get hash() {
    return this.#e.hash;
  }
  get hasRegExpGroups() {
    return this.#l;
  }
};
a(Y, "URLPattern");
if (!globalThis.URLPattern) {
  globalThis.URLPattern = Y;
}

const align = {
    right: alignRight,
    center: alignCenter
};
const top = 0;
const right = 1;
const bottom = 2;
const left = 3;
class UI {
    constructor(opts) {
        var _a;
        this.width = opts.width;
        this.wrap = (_a = opts.wrap) !== null && _a !== void 0 ? _a : true;
        this.rows = [];
    }
    span(...args) {
        const cols = this.div(...args);
        cols.span = true;
    }
    resetOutput() {
        this.rows = [];
    }
    div(...args) {
        if (args.length === 0) {
            this.div('');
        }
        if (this.wrap && this.shouldApplyLayoutDSL(...args) && typeof args[0] === 'string') {
            return this.applyLayoutDSL(args[0]);
        }
        const cols = args.map(arg => {
            if (typeof arg === 'string') {
                return this.colFromString(arg);
            }
            return arg;
        });
        this.rows.push(cols);
        return cols;
    }
    shouldApplyLayoutDSL(...args) {
        return args.length === 1 && typeof args[0] === 'string' &&
            /[\t\n]/.test(args[0]);
    }
    applyLayoutDSL(str) {
        const rows = str.split('\n').map(row => row.split('\t'));
        let leftColumnWidth = 0;
        rows.forEach(columns => {
            if (columns.length > 1 && mixin$1.stringWidth(columns[0]) > leftColumnWidth) {
                leftColumnWidth = Math.min(Math.floor(this.width * 0.5), mixin$1.stringWidth(columns[0]));
            }
        });
        rows.forEach(columns => {
            this.div(...columns.map((r, i) => {
                return {
                    text: r.trim(),
                    padding: this.measurePadding(r),
                    width: (i === 0 && columns.length > 1) ? leftColumnWidth : undefined
                };
            }));
        });
        return this.rows[this.rows.length - 1];
    }
    colFromString(text) {
        return {
            text,
            padding: this.measurePadding(text)
        };
    }
    measurePadding(str) {
        const noAnsi = mixin$1.stripAnsi(str);
        return [0, noAnsi.match(/\s*$/)[0].length, 0, noAnsi.match(/^\s*/)[0].length];
    }
    toString() {
        const lines = [];
        this.rows.forEach(row => {
            this.rowToString(row, lines);
        });
        return lines
            .filter(line => !line.hidden)
            .map(line => line.text)
            .join('\n');
    }
    rowToString(row, lines) {
        this.rasterize(row).forEach((rrow, r) => {
            let str = '';
            rrow.forEach((col, c) => {
                const { width } = row[c];
                const wrapWidth = this.negatePadding(row[c]);
                let ts = col;
                if (wrapWidth > mixin$1.stringWidth(col)) {
                    ts += ' '.repeat(wrapWidth - mixin$1.stringWidth(col));
                }
                if (row[c].align && row[c].align !== 'left' && this.wrap) {
                    const fn = align[row[c].align];
                    ts = fn(ts, wrapWidth);
                    if (mixin$1.stringWidth(ts) < wrapWidth) {
                        ts += ' '.repeat((width || 0) - mixin$1.stringWidth(ts) - 1);
                    }
                }
                const padding = row[c].padding || [0, 0, 0, 0];
                if (padding[left]) {
                    str += ' '.repeat(padding[left]);
                }
                str += addBorder(row[c], ts, '| ');
                str += ts;
                str += addBorder(row[c], ts, ' |');
                if (padding[right]) {
                    str += ' '.repeat(padding[right]);
                }
                if (r === 0 && lines.length > 0) {
                    str = this.renderInline(str, lines[lines.length - 1]);
                }
            });
            lines.push({
                text: str.replace(/ +$/, ''),
                span: row.span
            });
        });
        return lines;
    }
    renderInline(source, previousLine) {
        const match = source.match(/^ */);
        const leadingWhitespace = match ? match[0].length : 0;
        const target = previousLine.text;
        const targetTextWidth = mixin$1.stringWidth(target.trimRight());
        if (!previousLine.span) {
            return source;
        }
        if (!this.wrap) {
            previousLine.hidden = true;
            return target + source;
        }
        if (leadingWhitespace < targetTextWidth) {
            return source;
        }
        previousLine.hidden = true;
        return target.trimRight() + ' '.repeat(leadingWhitespace - targetTextWidth) + source.trimLeft();
    }
    rasterize(row) {
        const rrows = [];
        const widths = this.columnWidths(row);
        let wrapped;
        row.forEach((col, c) => {
            col.width = widths[c];
            if (this.wrap) {
                wrapped = mixin$1.wrap(col.text, this.negatePadding(col), { hard: true }).split('\n');
            }
            else {
                wrapped = col.text.split('\n');
            }
            if (col.border) {
                wrapped.unshift('.' + '-'.repeat(this.negatePadding(col) + 2) + '.');
                wrapped.push("'" + '-'.repeat(this.negatePadding(col) + 2) + "'");
            }
            if (col.padding) {
                wrapped.unshift(...new Array(col.padding[top] || 0).fill(''));
                wrapped.push(...new Array(col.padding[bottom] || 0).fill(''));
            }
            wrapped.forEach((str, r) => {
                if (!rrows[r]) {
                    rrows.push([]);
                }
                const rrow = rrows[r];
                for (let i = 0; i < c; i++) {
                    if (rrow[i] === undefined) {
                        rrow.push('');
                    }
                }
                rrow.push(str);
            });
        });
        return rrows;
    }
    negatePadding(col) {
        let wrapWidth = col.width || 0;
        if (col.padding) {
            wrapWidth -= (col.padding[left] || 0) + (col.padding[right] || 0);
        }
        if (col.border) {
            wrapWidth -= 4;
        }
        return wrapWidth;
    }
    columnWidths(row) {
        if (!this.wrap) {
            return row.map(col => {
                return col.width || mixin$1.stringWidth(col.text);
            });
        }
        let unset = row.length;
        let remainingWidth = this.width;
        const widths = row.map(col => {
            if (col.width) {
                unset--;
                remainingWidth -= col.width;
                return col.width;
            }
            return undefined;
        });
        const unsetWidth = unset ? Math.floor(remainingWidth / unset) : 0;
        return widths.map((w, i) => {
            if (w === undefined) {
                return Math.max(unsetWidth, _minWidth(row[i]));
            }
            return w;
        });
    }
}
function addBorder(col, ts, style) {
    if (col.border) {
        if (/[.']-+[.']/.test(ts)) {
            return '';
        }
        if (ts.trim().length !== 0) {
            return style;
        }
        return '  ';
    }
    return '';
}
function _minWidth(col) {
    const padding = col.padding || [];
    const minWidth = 1 + (padding[left] || 0) + (padding[right] || 0);
    if (col.border) {
        return minWidth + 4;
    }
    return minWidth;
}
function getWindowWidth() {
    if (typeof process === 'object' && process.stdout && process.stdout.columns) {
        return process.stdout.columns;
    }
    return 80;
}
function alignRight(str, width) {
    str = str.trim();
    const strWidth = mixin$1.stringWidth(str);
    if (strWidth < width) {
        return ' '.repeat(width - strWidth) + str;
    }
    return str;
}
function alignCenter(str, width) {
    str = str.trim();
    const strWidth = mixin$1.stringWidth(str);
    if (strWidth >= width) {
        return str;
    }
    return ' '.repeat((width - strWidth) >> 1) + str;
}
let mixin$1;
function cliui(opts, _mixin) {
    mixin$1 = _mixin;
    return new UI({
        width: (opts === null || opts === void 0 ? void 0 : opts.width) || getWindowWidth(),
        wrap: opts === null || opts === void 0 ? void 0 : opts.wrap
    });
}

function ansiRegex$2({onlyFirst = false} = {}) {
	const ST = '(?:\\u0007|\\u001B\\u005C|\\u009C)';
	const osc = `(?:(?:\\u001B\\]|\\u009D)[^\\u0007\\u001B\\u009C\\u009D]*${ST})`;
	const csi = '[\\u001B\\u009B][[\\]()#;?]*(?:\\d{1,4}(?:[;:]\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]';
	const pattern = `${osc}|${csi}`;
	return new RegExp(pattern, onlyFirst ? undefined : 'g');
}

const regex$2 = ansiRegex$2();
function stripAnsi$2(string) {
	if (typeof string !== 'string') {
		throw new TypeError(`Expected a \`string\`, got \`${typeof string}\``);
	}
	if (!string.includes('\u001B') && !string.includes('\u009B')) {
		return string;
	}
	return string.replace(regex$2, '');
}

const ambiguousMinimalCodePoint = 161;
const ambiguousMaximumCodePoint = 1114109;
const ambiguousRanges = [161, 161, 164, 164, 167, 168, 170, 170, 173, 174, 176, 180, 182, 186, 188, 191, 198, 198, 208, 208, 215, 216, 222, 225, 230, 230, 232, 234, 236, 237, 240, 240, 242, 243, 247, 250, 252, 252, 254, 254, 257, 257, 273, 273, 275, 275, 283, 283, 294, 295, 299, 299, 305, 307, 312, 312, 319, 322, 324, 324, 328, 331, 333, 333, 338, 339, 358, 359, 363, 363, 462, 462, 464, 464, 466, 466, 468, 468, 470, 470, 472, 472, 474, 474, 476, 476, 593, 593, 609, 609, 708, 708, 711, 711, 713, 715, 717, 717, 720, 720, 728, 731, 733, 733, 735, 735, 768, 879, 913, 929, 931, 937, 945, 961, 963, 969, 1025, 1025, 1040, 1103, 1105, 1105, 8208, 8208, 8211, 8214, 8216, 8217, 8220, 8221, 8224, 8226, 8228, 8231, 8240, 8240, 8242, 8243, 8245, 8245, 8251, 8251, 8254, 8254, 8308, 8308, 8319, 8319, 8321, 8324, 8364, 8364, 8451, 8451, 8453, 8453, 8457, 8457, 8467, 8467, 8470, 8470, 8481, 8482, 8486, 8486, 8491, 8491, 8531, 8532, 8539, 8542, 8544, 8555, 8560, 8569, 8585, 8585, 8592, 8601, 8632, 8633, 8658, 8658, 8660, 8660, 8679, 8679, 8704, 8704, 8706, 8707, 8711, 8712, 8715, 8715, 8719, 8719, 8721, 8721, 8725, 8725, 8730, 8730, 8733, 8736, 8739, 8739, 8741, 8741, 8743, 8748, 8750, 8750, 8756, 8759, 8764, 8765, 8776, 8776, 8780, 8780, 8786, 8786, 8800, 8801, 8804, 8807, 8810, 8811, 8814, 8815, 8834, 8835, 8838, 8839, 8853, 8853, 8857, 8857, 8869, 8869, 8895, 8895, 8978, 8978, 9312, 9449, 9451, 9547, 9552, 9587, 9600, 9615, 9618, 9621, 9632, 9633, 9635, 9641, 9650, 9651, 9654, 9655, 9660, 9661, 9664, 9665, 9670, 9672, 9675, 9675, 9678, 9681, 9698, 9701, 9711, 9711, 9733, 9734, 9737, 9737, 9742, 9743, 9756, 9756, 9758, 9758, 9792, 9792, 9794, 9794, 9824, 9825, 9827, 9829, 9831, 9834, 9836, 9837, 9839, 9839, 9886, 9887, 9919, 9919, 9926, 9933, 9935, 9939, 9941, 9953, 9955, 9955, 9960, 9961, 9963, 9969, 9972, 9972, 9974, 9977, 9979, 9980, 9982, 9983, 10045, 10045, 10102, 10111, 11094, 11097, 12872, 12879, 57344, 63743, 65024, 65039, 65533, 65533, 127232, 127242, 127248, 127277, 127280, 127337, 127344, 127373, 127375, 127376, 127387, 127404, 917760, 917999, 983040, 1048573, 1048576, 1114109];
const fullwidthMinimalCodePoint = 12288;
const fullwidthMaximumCodePoint = 65510;
const fullwidthRanges = [12288, 12288, 65281, 65376, 65504, 65510];
const wideMinimalCodePoint = 4352;
const wideMaximumCodePoint = 262141;
const wideRanges = [4352, 4447, 8986, 8987, 9001, 9002, 9193, 9196, 9200, 9200, 9203, 9203, 9725, 9726, 9748, 9749, 9776, 9783, 9800, 9811, 9855, 9855, 9866, 9871, 9875, 9875, 9889, 9889, 9898, 9899, 9917, 9918, 9924, 9925, 9934, 9934, 9940, 9940, 9962, 9962, 9970, 9971, 9973, 9973, 9978, 9978, 9981, 9981, 9989, 9989, 9994, 9995, 10024, 10024, 10060, 10060, 10062, 10062, 10067, 10069, 10071, 10071, 10133, 10135, 10160, 10160, 10175, 10175, 11035, 11036, 11088, 11088, 11093, 11093, 11904, 11929, 11931, 12019, 12032, 12245, 12272, 12287, 12289, 12350, 12353, 12438, 12441, 12543, 12549, 12591, 12593, 12686, 12688, 12773, 12783, 12830, 12832, 12871, 12880, 42124, 42128, 42182, 43360, 43388, 44032, 55203, 63744, 64255, 65040, 65049, 65072, 65106, 65108, 65126, 65128, 65131, 94176, 94180, 94192, 94198, 94208, 101594, 101631, 101664, 101760, 101874, 101888, 102801, 102816, 102866, 110576, 110579, 110581, 110587, 110589, 110590, 110592, 110888, 110898, 110898, 110928, 110930, 110933, 110933, 110948, 110952, 110960, 111355, 119552, 119638, 119648, 119670, 126980, 126980, 127183, 127183, 127374, 127374, 127377, 127386, 127406, 127406, 127488, 127490, 127504, 127547, 127552, 127560, 127568, 127569, 127584, 127589, 127744, 127776, 127789, 127797, 127799, 127868, 127870, 127891, 127904, 127946, 127951, 127955, 127968, 127984, 127988, 127988, 127992, 128062, 128064, 128064, 128066, 128252, 128255, 128317, 128331, 128334, 128336, 128359, 128378, 128378, 128405, 128406, 128420, 128420, 128507, 128591, 128640, 128709, 128716, 128716, 128720, 128722, 128725, 128729, 128732, 128735, 128747, 128748, 128756, 128764, 128986, 128986, 128992, 129003, 129008, 129008, 129292, 129338, 129340, 129349, 129351, 129535, 129648, 129660, 129664, 129734, 129736, 129736, 129740, 129757, 129759, 129771, 129775, 129786, 131072, 196605, 196608, 262141];

const isInRange = (ranges, codePoint) => {
	let low = 0;
	let high = Math.floor(ranges.length / 2) - 1;
	while (low <= high) {
		const mid = Math.floor((low + high) / 2);
		const i = mid * 2;
		if (codePoint < ranges[i]) {
			high = mid - 1;
		} else if (codePoint > ranges[i + 1]) {
			low = mid + 1;
		} else {
			return true;
		}
	}
	return false;
};

const commonCjkCodePoint = 0x4E_00;
const [wideFastPathStart, wideFastPathEnd] =  findWideFastPathRange(wideRanges);
function findWideFastPathRange(ranges) {
	let fastPathStart = ranges[0];
	let fastPathEnd = ranges[1];
	for (let index = 0; index < ranges.length; index += 2) {
		const start = ranges[index];
		const end = ranges[index + 1];
		if (
			commonCjkCodePoint >= start
			&& commonCjkCodePoint <= end
		) {
			return [start, end];
		}
		if ((end - start) > (fastPathEnd - fastPathStart)) {
			fastPathStart = start;
			fastPathEnd = end;
		}
	}
	return [fastPathStart, fastPathEnd];
}
const isAmbiguous = codePoint => {
	if (
		codePoint < ambiguousMinimalCodePoint
		|| codePoint > ambiguousMaximumCodePoint
	) {
		return false;
	}
	return isInRange(ambiguousRanges, codePoint);
};
const isFullwidth = codePoint => {
	if (
		codePoint < fullwidthMinimalCodePoint
		|| codePoint > fullwidthMaximumCodePoint
	) {
		return false;
	}
	return isInRange(fullwidthRanges, codePoint);
};
const isWide = codePoint => {
	if (
		codePoint >= wideFastPathStart
		&& codePoint <= wideFastPathEnd
	) {
		return true;
	}
	if (
		codePoint < wideMinimalCodePoint
		|| codePoint > wideMaximumCodePoint
	) {
		return false;
	}
	return isInRange(wideRanges, codePoint);
};

function validate(codePoint) {
	if (!Number.isSafeInteger(codePoint)) {
		throw new TypeError(`Expected a code point, got \`${typeof codePoint}\`.`);
	}
}
function eastAsianWidth(codePoint, {ambiguousAsWide = false} = {}) {
	validate(codePoint);
	if (
		isFullwidth(codePoint)
		|| isWide(codePoint)
		|| (ambiguousAsWide && isAmbiguous(codePoint))
	) {
		return 2;
	}
	return 1;
}

var emojiRegex = () => {
	return /[#*0-9]\uFE0F?\u20E3|[\xA9\xAE\u203C\u2049\u2122\u2139\u2194-\u2199\u21A9\u21AA\u231A\u231B\u2328\u23CF\u23ED-\u23EF\u23F1\u23F2\u23F8-\u23FA\u24C2\u25AA\u25AB\u25B6\u25C0\u25FB\u25FC\u25FE\u2600-\u2604\u260E\u2611\u2614\u2615\u2618\u2620\u2622\u2623\u2626\u262A\u262E\u262F\u2638-\u263A\u2640\u2642\u2648-\u2653\u265F\u2660\u2663\u2665\u2666\u2668\u267B\u267E\u267F\u2692\u2694-\u2697\u2699\u269B\u269C\u26A0\u26A7\u26AA\u26B0\u26B1\u26BD\u26BE\u26C4\u26C8\u26CF\u26D1\u26E9\u26F0-\u26F5\u26F7\u26F8\u26FA\u2702\u2708\u2709\u270F\u2712\u2714\u2716\u271D\u2721\u2733\u2734\u2744\u2747\u2757\u2763\u27A1\u2934\u2935\u2B05-\u2B07\u2B1B\u2B1C\u2B55\u3030\u303D\u3297\u3299]\uFE0F?|[\u261D\u270C\u270D](?:\uD83C[\uDFFB-\uDFFF]|\uFE0F)?|[\u270A\u270B](?:\uD83C[\uDFFB-\uDFFF])?|[\u23E9-\u23EC\u23F0\u23F3\u25FD\u2693\u26A1\u26AB\u26C5\u26CE\u26D4\u26EA\u26FD\u2705\u2728\u274C\u274E\u2753-\u2755\u2795-\u2797\u27B0\u27BF\u2B50]|\u26D3\uFE0F?(?:\u200D\uD83D\uDCA5)?|\u26F9(?:\uD83C[\uDFFB-\uDFFF]|\uFE0F)?(?:\u200D[\u2640\u2642]\uFE0F?)?|\u2764\uFE0F?(?:\u200D(?:\uD83D\uDD25|\uD83E\uDE79))?|\uD83C(?:[\uDC04\uDD70\uDD71\uDD7E\uDD7F\uDE02\uDE37\uDF21\uDF24-\uDF2C\uDF36\uDF7D\uDF96\uDF97\uDF99-\uDF9B\uDF9E\uDF9F\uDFCD\uDFCE\uDFD4-\uDFDF\uDFF5\uDFF7]\uFE0F?|[\uDF85\uDFC2\uDFC7](?:\uD83C[\uDFFB-\uDFFF])?|[\uDFC4\uDFCA](?:\uD83C[\uDFFB-\uDFFF])?(?:\u200D[\u2640\u2642]\uFE0F?)?|[\uDFCB\uDFCC](?:\uD83C[\uDFFB-\uDFFF]|\uFE0F)?(?:\u200D[\u2640\u2642]\uFE0F?)?|[\uDCCF\uDD8E\uDD91-\uDD9A\uDE01\uDE1A\uDE2F\uDE32-\uDE36\uDE38-\uDE3A\uDE50\uDE51\uDF00-\uDF20\uDF2D-\uDF35\uDF37-\uDF43\uDF45-\uDF4A\uDF4C-\uDF7C\uDF7E-\uDF84\uDF86-\uDF93\uDFA0-\uDFC1\uDFC5\uDFC6\uDFC8\uDFC9\uDFCF-\uDFD3\uDFE0-\uDFF0\uDFF8-\uDFFF]|\uDDE6\uD83C[\uDDE8-\uDDEC\uDDEE\uDDF1\uDDF2\uDDF4\uDDF6-\uDDFA\uDDFC\uDDFD\uDDFF]|\uDDE7\uD83C[\uDDE6\uDDE7\uDDE9-\uDDEF\uDDF1-\uDDF4\uDDF6-\uDDF9\uDDFB\uDDFC\uDDFE\uDDFF]|\uDDE8\uD83C[\uDDE6\uDDE8\uDDE9\uDDEB-\uDDEE\uDDF0-\uDDF7\uDDFA-\uDDFF]|\uDDE9\uD83C[\uDDEA\uDDEC\uDDEF\uDDF0\uDDF2\uDDF4\uDDFF]|\uDDEA\uD83C[\uDDE6\uDDE8\uDDEA\uDDEC\uDDED\uDDF7-\uDDFA]|\uDDEB\uD83C[\uDDEE-\uDDF0\uDDF2\uDDF4\uDDF7]|\uDDEC\uD83C[\uDDE6\uDDE7\uDDE9-\uDDEE\uDDF1-\uDDF3\uDDF5-\uDDFA\uDDFC\uDDFE]|\uDDED\uD83C[\uDDF0\uDDF2\uDDF3\uDDF7\uDDF9\uDDFA]|\uDDEE\uD83C[\uDDE8-\uDDEA\uDDF1-\uDDF4\uDDF6-\uDDF9]|\uDDEF\uD83C[\uDDEA\uDDF2\uDDF4\uDDF5]|\uDDF0\uD83C[\uDDEA\uDDEC-\uDDEE\uDDF2\uDDF3\uDDF5\uDDF7\uDDFC\uDDFE\uDDFF]|\uDDF1\uD83C[\uDDE6-\uDDE8\uDDEE\uDDF0\uDDF7-\uDDFB\uDDFE]|\uDDF2\uD83C[\uDDE6\uDDE8-\uDDED\uDDF0-\uDDFF]|\uDDF3\uD83C[\uDDE6\uDDE8\uDDEA-\uDDEC\uDDEE\uDDF1\uDDF4\uDDF5\uDDF7\uDDFA\uDDFF]|\uDDF4\uD83C\uDDF2|\uDDF5\uD83C[\uDDE6\uDDEA-\uDDED\uDDF0-\uDDF3\uDDF7-\uDDF9\uDDFC\uDDFE]|\uDDF6\uD83C\uDDE6|\uDDF7\uD83C[\uDDEA\uDDF4\uDDF8\uDDFA\uDDFC]|\uDDF8\uD83C[\uDDE6-\uDDEA\uDDEC-\uDDF4\uDDF7-\uDDF9\uDDFB\uDDFD-\uDDFF]|\uDDF9\uD83C[\uDDE6\uDDE8\uDDE9\uDDEB-\uDDED\uDDEF-\uDDF4\uDDF7\uDDF9\uDDFB\uDDFC\uDDFF]|\uDDFA\uD83C[\uDDE6\uDDEC\uDDF2\uDDF3\uDDF8\uDDFE\uDDFF]|\uDDFB\uD83C[\uDDE6\uDDE8\uDDEA\uDDEC\uDDEE\uDDF3\uDDFA]|\uDDFC\uD83C[\uDDEB\uDDF8]|\uDDFD\uD83C\uDDF0|\uDDFE\uD83C[\uDDEA\uDDF9]|\uDDFF\uD83C[\uDDE6\uDDF2\uDDFC]|\uDF44(?:\u200D\uD83D\uDFEB)?|\uDF4B(?:\u200D\uD83D\uDFE9)?|\uDFC3(?:\uD83C[\uDFFB-\uDFFF])?(?:\u200D(?:[\u2640\u2642]\uFE0F?(?:\u200D\u27A1\uFE0F?)?|\u27A1\uFE0F?))?|\uDFF3\uFE0F?(?:\u200D(?:\u26A7\uFE0F?|\uD83C\uDF08))?|\uDFF4(?:\u200D\u2620\uFE0F?|\uDB40\uDC67\uDB40\uDC62\uDB40(?:\uDC65\uDB40\uDC6E\uDB40\uDC67|\uDC73\uDB40\uDC63\uDB40\uDC74|\uDC77\uDB40\uDC6C\uDB40\uDC73)\uDB40\uDC7F)?)|\uD83D(?:[\uDC3F\uDCFD\uDD49\uDD4A\uDD6F\uDD70\uDD73\uDD76-\uDD79\uDD87\uDD8A-\uDD8D\uDDA5\uDDA8\uDDB1\uDDB2\uDDBC\uDDC2-\uDDC4\uDDD1-\uDDD3\uDDDC-\uDDDE\uDDE1\uDDE3\uDDE8\uDDEF\uDDF3\uDDFA\uDECB\uDECD-\uDECF\uDEE0-\uDEE5\uDEE9\uDEF0\uDEF3]\uFE0F?|[\uDC42\uDC43\uDC46-\uDC50\uDC66\uDC67\uDC6B-\uDC6D\uDC72\uDC74-\uDC76\uDC78\uDC7C\uDC83\uDC85\uDC8F\uDC91\uDCAA\uDD7A\uDD95\uDD96\uDE4C\uDE4F\uDEC0\uDECC](?:\uD83C[\uDFFB-\uDFFF])?|[\uDC6E-\uDC71\uDC73\uDC77\uDC81\uDC82\uDC86\uDC87\uDE45-\uDE47\uDE4B\uDE4D\uDE4E\uDEA3\uDEB4\uDEB5](?:\uD83C[\uDFFB-\uDFFF])?(?:\u200D[\u2640\u2642]\uFE0F?)?|[\uDD74\uDD90](?:\uD83C[\uDFFB-\uDFFF]|\uFE0F)?|[\uDC00-\uDC07\uDC09-\uDC14\uDC16-\uDC25\uDC27-\uDC3A\uDC3C-\uDC3E\uDC40\uDC44\uDC45\uDC51-\uDC65\uDC6A\uDC79-\uDC7B\uDC7D-\uDC80\uDC84\uDC88-\uDC8E\uDC90\uDC92-\uDCA9\uDCAB-\uDCFC\uDCFF-\uDD3D\uDD4B-\uDD4E\uDD50-\uDD67\uDDA4\uDDFB-\uDE2D\uDE2F-\uDE34\uDE37-\uDE41\uDE43\uDE44\uDE48-\uDE4A\uDE80-\uDEA2\uDEA4-\uDEB3\uDEB7-\uDEBF\uDEC1-\uDEC5\uDED0-\uDED2\uDED5-\uDED8\uDEDC-\uDEDF\uDEEB\uDEEC\uDEF4-\uDEFC\uDFE0-\uDFEB\uDFF0]|\uDC08(?:\u200D\u2B1B)?|\uDC15(?:\u200D\uD83E\uDDBA)?|\uDC26(?:\u200D(?:\u2B1B|\uD83D\uDD25))?|\uDC3B(?:\u200D\u2744\uFE0F?)?|\uDC41\uFE0F?(?:\u200D\uD83D\uDDE8\uFE0F?)?|\uDC68(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:\uDC8B\u200D\uD83D)?\uDC68|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDC68\uDC69]\u200D\uD83D(?:\uDC66(?:\u200D\uD83D\uDC66)?|\uDC67(?:\u200D\uD83D[\uDC66\uDC67])?)|[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC66(?:\u200D\uD83D\uDC66)?|\uDC67(?:\u200D\uD83D[\uDC66\uDC67])?)|\uD83E(?:[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3]))|\uD83C(?:\uDFFB(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:\uDC8B\u200D\uD83D)?\uDC68\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC30\u200D\uD83D\uDC68\uD83C[\uDFFC-\uDFFF])|\uD83E(?:[\uDD1D\uDEEF]\u200D\uD83D\uDC68\uD83C[\uDFFC-\uDFFF]|[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3])))?|\uDFFC(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:\uDC8B\u200D\uD83D)?\uDC68\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC30\u200D\uD83D\uDC68\uD83C[\uDFFB\uDFFD-\uDFFF])|\uD83E(?:[\uDD1D\uDEEF]\u200D\uD83D\uDC68\uD83C[\uDFFB\uDFFD-\uDFFF]|[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3])))?|\uDFFD(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:\uDC8B\u200D\uD83D)?\uDC68\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC30\u200D\uD83D\uDC68\uD83C[\uDFFB\uDFFC\uDFFE\uDFFF])|\uD83E(?:[\uDD1D\uDEEF]\u200D\uD83D\uDC68\uD83C[\uDFFB\uDFFC\uDFFE\uDFFF]|[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3])))?|\uDFFE(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:\uDC8B\u200D\uD83D)?\uDC68\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC30\u200D\uD83D\uDC68\uD83C[\uDFFB-\uDFFD\uDFFF])|\uD83E(?:[\uDD1D\uDEEF]\u200D\uD83D\uDC68\uD83C[\uDFFB-\uDFFD\uDFFF]|[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3])))?|\uDFFF(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:\uDC8B\u200D\uD83D)?\uDC68\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC30\u200D\uD83D\uDC68\uD83C[\uDFFB-\uDFFE])|\uD83E(?:[\uDD1D\uDEEF]\u200D\uD83D\uDC68\uD83C[\uDFFB-\uDFFE]|[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3])))?))?|\uDC69(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:\uDC8B\u200D\uD83D)?[\uDC68\uDC69]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC66(?:\u200D\uD83D\uDC66)?|\uDC67(?:\u200D\uD83D[\uDC66\uDC67])?|\uDC69\u200D\uD83D(?:\uDC66(?:\u200D\uD83D\uDC66)?|\uDC67(?:\u200D\uD83D[\uDC66\uDC67])?))|\uD83E(?:[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3]))|\uD83C(?:\uDFFB(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:[\uDC68\uDC69]|\uDC8B\u200D\uD83D[\uDC68\uDC69])\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC30\u200D\uD83D\uDC69\uD83C[\uDFFC-\uDFFF])|\uD83E(?:[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3]|\uDD1D\u200D\uD83D[\uDC68\uDC69]\uD83C[\uDFFC-\uDFFF]|\uDEEF\u200D\uD83D\uDC69\uD83C[\uDFFC-\uDFFF])))?|\uDFFC(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:[\uDC68\uDC69]|\uDC8B\u200D\uD83D[\uDC68\uDC69])\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC30\u200D\uD83D\uDC69\uD83C[\uDFFB\uDFFD-\uDFFF])|\uD83E(?:[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3]|\uDD1D\u200D\uD83D[\uDC68\uDC69]\uD83C[\uDFFB\uDFFD-\uDFFF]|\uDEEF\u200D\uD83D\uDC69\uD83C[\uDFFB\uDFFD-\uDFFF])))?|\uDFFD(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:[\uDC68\uDC69]|\uDC8B\u200D\uD83D[\uDC68\uDC69])\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC30\u200D\uD83D\uDC69\uD83C[\uDFFB\uDFFC\uDFFE\uDFFF])|\uD83E(?:[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3]|\uDD1D\u200D\uD83D[\uDC68\uDC69]\uD83C[\uDFFB\uDFFC\uDFFE\uDFFF]|\uDEEF\u200D\uD83D\uDC69\uD83C[\uDFFB\uDFFC\uDFFE\uDFFF])))?|\uDFFE(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:[\uDC68\uDC69]|\uDC8B\u200D\uD83D[\uDC68\uDC69])\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC30\u200D\uD83D\uDC69\uD83C[\uDFFB-\uDFFD\uDFFF])|\uD83E(?:[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3]|\uDD1D\u200D\uD83D[\uDC68\uDC69]\uD83C[\uDFFB-\uDFFD\uDFFF]|\uDEEF\u200D\uD83D\uDC69\uD83C[\uDFFB-\uDFFD\uDFFF])))?|\uDFFF(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D\uD83D(?:[\uDC68\uDC69]|\uDC8B\u200D\uD83D[\uDC68\uDC69])\uD83C[\uDFFB-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC30\u200D\uD83D\uDC69\uD83C[\uDFFB-\uDFFE])|\uD83E(?:[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3]|\uDD1D\u200D\uD83D[\uDC68\uDC69]\uD83C[\uDFFB-\uDFFE]|\uDEEF\u200D\uD83D\uDC69\uD83C[\uDFFB-\uDFFE])))?))?|\uDD75(?:\uD83C[\uDFFB-\uDFFF]|\uFE0F)?(?:\u200D[\u2640\u2642]\uFE0F?)?|\uDE2E(?:\u200D\uD83D\uDCA8)?|\uDE35(?:\u200D\uD83D\uDCAB)?|\uDE36(?:\u200D\uD83C\uDF2B\uFE0F?)?|\uDE42(?:\u200D[\u2194\u2195]\uFE0F?)?|\uDEB6(?:\uD83C[\uDFFB-\uDFFF])?(?:\u200D(?:[\u2640\u2642]\uFE0F?(?:\u200D\u27A1\uFE0F?)?|\u27A1\uFE0F?))?)|\uD83E(?:[\uDD0C\uDD0F\uDD18-\uDD1F\uDD30-\uDD34\uDD36\uDD77\uDDB5\uDDB6\uDDBB\uDDD2\uDDD3\uDDD5\uDEC3-\uDEC5\uDEF0\uDEF2-\uDEF8](?:\uD83C[\uDFFB-\uDFFF])?|[\uDD26\uDD35\uDD37-\uDD39\uDD3C-\uDD3E\uDDB8\uDDB9\uDDCD\uDDCF\uDDD4\uDDD6-\uDDDD](?:\uD83C[\uDFFB-\uDFFF])?(?:\u200D[\u2640\u2642]\uFE0F?)?|[\uDDDE\uDDDF](?:\u200D[\u2640\u2642]\uFE0F?)?|[\uDD0D\uDD0E\uDD10-\uDD17\uDD20-\uDD25\uDD27-\uDD2F\uDD3A\uDD3F-\uDD45\uDD47-\uDD76\uDD78-\uDDB4\uDDB7\uDDBA\uDDBC-\uDDCC\uDDD0\uDDE0-\uDDFF\uDE70-\uDE7C\uDE80-\uDE8A\uDE8E-\uDEC2\uDEC6\uDEC8\uDECD-\uDEDC\uDEDF-\uDEEA\uDEEF]|\uDDCE(?:\uD83C[\uDFFB-\uDFFF])?(?:\u200D(?:[\u2640\u2642]\uFE0F?(?:\u200D\u27A1\uFE0F?)?|\u27A1\uFE0F?))?|\uDDD1(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\uD83C[\uDF3E\uDF73\uDF7C\uDF84\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E(?:[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3\uDE70]|\uDD1D\u200D\uD83E\uDDD1|\uDDD1\u200D\uD83E\uDDD2(?:\u200D\uD83E\uDDD2)?|\uDDD2(?:\u200D\uD83E\uDDD2)?))|\uD83C(?:\uDFFB(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D(?:\uD83D\uDC8B\u200D)?\uD83E\uDDD1\uD83C[\uDFFC-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF84\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC30\u200D\uD83E\uDDD1\uD83C[\uDFFC-\uDFFF])|\uD83E(?:[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3\uDE70]|\uDD1D\u200D\uD83E\uDDD1\uD83C[\uDFFB-\uDFFF]|\uDEEF\u200D\uD83E\uDDD1\uD83C[\uDFFC-\uDFFF])))?|\uDFFC(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D(?:\uD83D\uDC8B\u200D)?\uD83E\uDDD1\uD83C[\uDFFB\uDFFD-\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF84\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC30\u200D\uD83E\uDDD1\uD83C[\uDFFB\uDFFD-\uDFFF])|\uD83E(?:[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3\uDE70]|\uDD1D\u200D\uD83E\uDDD1\uD83C[\uDFFB-\uDFFF]|\uDEEF\u200D\uD83E\uDDD1\uD83C[\uDFFB\uDFFD-\uDFFF])))?|\uDFFD(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D(?:\uD83D\uDC8B\u200D)?\uD83E\uDDD1\uD83C[\uDFFB\uDFFC\uDFFE\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF84\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC30\u200D\uD83E\uDDD1\uD83C[\uDFFB\uDFFC\uDFFE\uDFFF])|\uD83E(?:[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3\uDE70]|\uDD1D\u200D\uD83E\uDDD1\uD83C[\uDFFB-\uDFFF]|\uDEEF\u200D\uD83E\uDDD1\uD83C[\uDFFB\uDFFC\uDFFE\uDFFF])))?|\uDFFE(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D(?:\uD83D\uDC8B\u200D)?\uD83E\uDDD1\uD83C[\uDFFB-\uDFFD\uDFFF]|\uD83C[\uDF3E\uDF73\uDF7C\uDF84\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC30\u200D\uD83E\uDDD1\uD83C[\uDFFB-\uDFFD\uDFFF])|\uD83E(?:[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3\uDE70]|\uDD1D\u200D\uD83E\uDDD1\uD83C[\uDFFB-\uDFFF]|\uDEEF\u200D\uD83E\uDDD1\uD83C[\uDFFB-\uDFFD\uDFFF])))?|\uDFFF(?:\u200D(?:[\u2695\u2696\u2708]\uFE0F?|\u2764\uFE0F?\u200D(?:\uD83D\uDC8B\u200D)?\uD83E\uDDD1\uD83C[\uDFFB-\uDFFE]|\uD83C[\uDF3E\uDF73\uDF7C\uDF84\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D(?:[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uDC30\u200D\uD83E\uDDD1\uD83C[\uDFFB-\uDFFE])|\uD83E(?:[\uDDAF\uDDBC\uDDBD](?:\u200D\u27A1\uFE0F?)?|[\uDDB0-\uDDB3\uDE70]|\uDD1D\u200D\uD83E\uDDD1\uD83C[\uDFFB-\uDFFF]|\uDEEF\u200D\uD83E\uDDD1\uD83C[\uDFFB-\uDFFE])))?))?|\uDEF1(?:\uD83C(?:\uDFFB(?:\u200D\uD83E\uDEF2\uD83C[\uDFFC-\uDFFF])?|\uDFFC(?:\u200D\uD83E\uDEF2\uD83C[\uDFFB\uDFFD-\uDFFF])?|\uDFFD(?:\u200D\uD83E\uDEF2\uD83C[\uDFFB\uDFFC\uDFFE\uDFFF])?|\uDFFE(?:\u200D\uD83E\uDEF2\uD83C[\uDFFB-\uDFFD\uDFFF])?|\uDFFF(?:\u200D\uD83E\uDEF2\uD83C[\uDFFB-\uDFFE])?))?)/g;
};

const segmenter$2 = new Intl.Segmenter();
const defaultIgnorableCodePointRegex$1 = /^\p{Default_Ignorable_Code_Point}$/u;
function stringWidth$2(string, options = {}) {
	if (typeof string !== 'string' || string.length === 0) {
		return 0;
	}
	const {
		ambiguousIsNarrow = true,
		countAnsiEscapeCodes = false,
	} = options;
	if (!countAnsiEscapeCodes) {
		string = stripAnsi$2(string);
	}
	if (string.length === 0) {
		return 0;
	}
	let width = 0;
	const eastAsianWidthOptions = {ambiguousAsWide: !ambiguousIsNarrow};
	for (const {segment: character} of segmenter$2.segment(string)) {
		const codePoint = character.codePointAt(0);
		if (codePoint <= 0x1F || (codePoint >= 0x7F && codePoint <= 0x9F)) {
			continue;
		}
		if (
			(codePoint >= 0x20_0B && codePoint <= 0x20_0F)
			|| codePoint === 0xFE_FF
		) {
			continue;
		}
		if (
			(codePoint >= 0x3_00 && codePoint <= 0x3_6F)
			|| (codePoint >= 0x1A_B0 && codePoint <= 0x1A_FF)
			|| (codePoint >= 0x1D_C0 && codePoint <= 0x1D_FF)
			|| (codePoint >= 0x20_D0 && codePoint <= 0x20_FF)
			|| (codePoint >= 0xFE_20 && codePoint <= 0xFE_2F)
		) {
			continue;
		}
		if (codePoint >= 0xD8_00 && codePoint <= 0xDF_FF) {
			continue;
		}
		if (codePoint >= 0xFE_00 && codePoint <= 0xFE_0F) {
			continue;
		}
		if (defaultIgnorableCodePointRegex$1.test(character)) {
			continue;
		}
		if (emojiRegex().test(character)) {
			width += 2;
			continue;
		}
		width += eastAsianWidth(codePoint, eastAsianWidthOptions);
	}
	return width;
}

function ansiRegex$1({onlyFirst = false} = {}) {
	const ST = '(?:\\u0007|\\u001B\\u005C|\\u009C)';
	const osc = `(?:(?:\\u001B\\]|\\u009D)[^\\u0007\\u001B\\u009C\\u009D]*${ST})`;
	const csi = '[\\u001B\\u009B][[\\]()#;?]*(?:\\d{1,4}(?:[;:]\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]';
	const pattern = `${osc}|${csi}`;
	return new RegExp(pattern, onlyFirst ? undefined : 'g');
}

const regex$1 = ansiRegex$1();
function stripAnsi$1(string) {
	if (typeof string !== 'string') {
		throw new TypeError(`Expected a \`string\`, got \`${typeof string}\``);
	}
	if (!string.includes('\u001B') && !string.includes('\u009B')) {
		return string;
	}
	return string.replace(regex$1, '');
}

const segmenter$1 = new Intl.Segmenter();
const defaultIgnorableCodePointRegex = /^\p{Default_Ignorable_Code_Point}$/u;
function stringWidth$1(string, options = {}) {
	if (typeof string !== 'string' || string.length === 0) {
		return 0;
	}
	const {
		ambiguousIsNarrow = true,
		countAnsiEscapeCodes = false,
	} = options;
	if (!countAnsiEscapeCodes) {
		string = stripAnsi$1(string);
	}
	if (string.length === 0) {
		return 0;
	}
	let width = 0;
	const eastAsianWidthOptions = {ambiguousAsWide: !ambiguousIsNarrow};
	for (const {segment: character} of segmenter$1.segment(string)) {
		const codePoint = character.codePointAt(0);
		if (codePoint <= 0x1F || (codePoint >= 0x7F && codePoint <= 0x9F)) {
			continue;
		}
		if (
			(codePoint >= 0x20_0B && codePoint <= 0x20_0F)
			|| codePoint === 0xFE_FF
		) {
			continue;
		}
		if (
			(codePoint >= 0x3_00 && codePoint <= 0x3_6F)
			|| (codePoint >= 0x1A_B0 && codePoint <= 0x1A_FF)
			|| (codePoint >= 0x1D_C0 && codePoint <= 0x1D_FF)
			|| (codePoint >= 0x20_D0 && codePoint <= 0x20_FF)
			|| (codePoint >= 0xFE_20 && codePoint <= 0xFE_2F)
		) {
			continue;
		}
		if (codePoint >= 0xD8_00 && codePoint <= 0xDF_FF) {
			continue;
		}
		if (codePoint >= 0xFE_00 && codePoint <= 0xFE_0F) {
			continue;
		}
		if (defaultIgnorableCodePointRegex.test(character)) {
			continue;
		}
		if (emojiRegex().test(character)) {
			width += 2;
			continue;
		}
		width += eastAsianWidth(codePoint, eastAsianWidthOptions);
	}
	return width;
}

const ANSI_BACKGROUND_OFFSET = 10;
const wrapAnsi16 = (offset = 0) => code => `\u001B[${code + offset}m`;
const wrapAnsi256 = (offset = 0) => code => `\u001B[${38 + offset};5;${code}m`;
const wrapAnsi16m = (offset = 0) => (red, green, blue) => `\u001B[${38 + offset};2;${red};${green};${blue}m`;
const styles = {
	modifier: {
		reset: [0, 0],
		bold: [1, 22],
		dim: [2, 22],
		italic: [3, 23],
		underline: [4, 24],
		overline: [53, 55],
		inverse: [7, 27],
		hidden: [8, 28],
		strikethrough: [9, 29],
	},
	color: {
		black: [30, 39],
		red: [31, 39],
		green: [32, 39],
		yellow: [33, 39],
		blue: [34, 39],
		magenta: [35, 39],
		cyan: [36, 39],
		white: [37, 39],
		blackBright: [90, 39],
		gray: [90, 39],
		grey: [90, 39],
		redBright: [91, 39],
		greenBright: [92, 39],
		yellowBright: [93, 39],
		blueBright: [94, 39],
		magentaBright: [95, 39],
		cyanBright: [96, 39],
		whiteBright: [97, 39],
	},
	bgColor: {
		bgBlack: [40, 49],
		bgRed: [41, 49],
		bgGreen: [42, 49],
		bgYellow: [43, 49],
		bgBlue: [44, 49],
		bgMagenta: [45, 49],
		bgCyan: [46, 49],
		bgWhite: [47, 49],
		bgBlackBright: [100, 49],
		bgGray: [100, 49],
		bgGrey: [100, 49],
		bgRedBright: [101, 49],
		bgGreenBright: [102, 49],
		bgYellowBright: [103, 49],
		bgBlueBright: [104, 49],
		bgMagentaBright: [105, 49],
		bgCyanBright: [106, 49],
		bgWhiteBright: [107, 49],
	},
};
Object.keys(styles.modifier);
const foregroundColorNames = Object.keys(styles.color);
const backgroundColorNames = Object.keys(styles.bgColor);
[...foregroundColorNames, ...backgroundColorNames];
function assembleStyles() {
	const codes = new Map();
	for (const [groupName, group] of Object.entries(styles)) {
		for (const [styleName, style] of Object.entries(group)) {
			styles[styleName] = {
				open: `\u001B[${style[0]}m`,
				close: `\u001B[${style[1]}m`,
			};
			group[styleName] = styles[styleName];
			codes.set(style[0], style[1]);
		}
		Object.defineProperty(styles, groupName, {
			value: group,
			enumerable: false,
		});
	}
	Object.defineProperty(styles, 'codes', {
		value: codes,
		enumerable: false,
	});
	styles.color.close = '\u001B[39m';
	styles.bgColor.close = '\u001B[49m';
	styles.color.ansi = wrapAnsi16();
	styles.color.ansi256 = wrapAnsi256();
	styles.color.ansi16m = wrapAnsi16m();
	styles.bgColor.ansi = wrapAnsi16(ANSI_BACKGROUND_OFFSET);
	styles.bgColor.ansi256 = wrapAnsi256(ANSI_BACKGROUND_OFFSET);
	styles.bgColor.ansi16m = wrapAnsi16m(ANSI_BACKGROUND_OFFSET);
	Object.defineProperties(styles, {
		rgbToAnsi256: {
			value(red, green, blue) {
				if (red === green && green === blue) {
					if (red < 8) {
						return 16;
					}
					if (red > 248) {
						return 231;
					}
					return Math.round(((red - 8) / 247) * 24) + 232;
				}
				return 16
					+ (36 * Math.round(red / 255 * 5))
					+ (6 * Math.round(green / 255 * 5))
					+ Math.round(blue / 255 * 5);
			},
			enumerable: false,
		},
		hexToRgb: {
			value(hex) {
				const matches = /[a-f\d]{6}|[a-f\d]{3}/i.exec(hex.toString(16));
				if (!matches) {
					return [0, 0, 0];
				}
				let [colorString] = matches;
				if (colorString.length === 3) {
					colorString = [...colorString].map(character => character + character).join('');
				}
				const integer = Number.parseInt(colorString, 16);
				return [
					(integer >> 16) & 0xFF,
					(integer >> 8) & 0xFF,
					integer & 0xFF,
				];
			},
			enumerable: false,
		},
		hexToAnsi256: {
			value: hex => styles.rgbToAnsi256(...styles.hexToRgb(hex)),
			enumerable: false,
		},
		ansi256ToAnsi: {
			value(code) {
				if (code < 8) {
					return 30 + code;
				}
				if (code < 16) {
					return 90 + (code - 8);
				}
				let red;
				let green;
				let blue;
				if (code >= 232) {
					red = (((code - 232) * 10) + 8) / 255;
					green = red;
					blue = red;
				} else {
					code -= 16;
					const remainder = code % 36;
					red = Math.floor(code / 36) / 5;
					green = Math.floor(remainder / 6) / 5;
					blue = (remainder % 6) / 5;
				}
				const value = Math.max(red, green, blue) * 2;
				if (value === 0) {
					return 30;
				}
				let result = 30 + ((Math.round(blue) << 2) | (Math.round(green) << 1) | Math.round(red));
				if (value === 2) {
					result += 60;
				}
				return result;
			},
			enumerable: false,
		},
		rgbToAnsi: {
			value: (red, green, blue) => styles.ansi256ToAnsi(styles.rgbToAnsi256(red, green, blue)),
			enumerable: false,
		},
		hexToAnsi: {
			value: hex => styles.ansi256ToAnsi(styles.hexToAnsi256(hex)),
			enumerable: false,
		},
	});
	return styles;
}
const ansiStyles = assembleStyles();

const ESCAPES = new Set([
	'\u001B',
	'\u009B',
]);
const END_CODE = 39;
const ANSI_ESCAPE_BELL = '\u0007';
const ANSI_CSI = '[';
const ANSI_OSC = ']';
const ANSI_SGR_TERMINATOR = 'm';
const ANSI_ESCAPE_LINK = `${ANSI_OSC}8;;`;
const wrapAnsiCode = code => `${ESCAPES.values().next().value}${ANSI_CSI}${code}${ANSI_SGR_TERMINATOR}`;
const wrapAnsiHyperlink = url => `${ESCAPES.values().next().value}${ANSI_ESCAPE_LINK}${url}${ANSI_ESCAPE_BELL}`;
const wordLengths = string => string.split(' ').map(character => stringWidth$1(character));
const wrapWord = (rows, word, columns) => {
	const characters = [...word];
	let isInsideEscape = false;
	let isInsideLinkEscape = false;
	let visible = stringWidth$1(stripAnsi$1(rows.at(-1)));
	for (const [index, character] of characters.entries()) {
		const characterLength = stringWidth$1(character);
		if (visible + characterLength <= columns) {
			rows[rows.length - 1] += character;
		} else {
			rows.push(character);
			visible = 0;
		}
		if (ESCAPES.has(character)) {
			isInsideEscape = true;
			const ansiEscapeLinkCandidate = characters.slice(index + 1, index + 1 + ANSI_ESCAPE_LINK.length).join('');
			isInsideLinkEscape = ansiEscapeLinkCandidate === ANSI_ESCAPE_LINK;
		}
		if (isInsideEscape) {
			if (isInsideLinkEscape) {
				if (character === ANSI_ESCAPE_BELL) {
					isInsideEscape = false;
					isInsideLinkEscape = false;
				}
			} else if (character === ANSI_SGR_TERMINATOR) {
				isInsideEscape = false;
			}
			continue;
		}
		visible += characterLength;
		if (visible === columns && index < characters.length - 1) {
			rows.push('');
			visible = 0;
		}
	}
	if (!visible && rows.at(-1).length > 0 && rows.length > 1) {
		rows[rows.length - 2] += rows.pop();
	}
};
const stringVisibleTrimSpacesRight = string => {
	const words = string.split(' ');
	let last = words.length;
	while (last > 0) {
		if (stringWidth$1(words[last - 1]) > 0) {
			break;
		}
		last--;
	}
	if (last === words.length) {
		return string;
	}
	return words.slice(0, last).join(' ') + words.slice(last).join('');
};
const exec = (string, columns, options = {}) => {
	if (options.trim !== false && string.trim() === '') {
		return '';
	}
	let returnValue = '';
	let escapeCode;
	let escapeUrl;
	const lengths = wordLengths(string);
	let rows = [''];
	for (const [index, word] of string.split(' ').entries()) {
		if (options.trim !== false) {
			rows[rows.length - 1] = rows.at(-1).trimStart();
		}
		let rowLength = stringWidth$1(rows.at(-1));
		if (index !== 0) {
			if (rowLength >= columns && (options.wordWrap === false || options.trim === false)) {
				rows.push('');
				rowLength = 0;
			}
			if (rowLength > 0 || options.trim === false) {
				rows[rows.length - 1] += ' ';
				rowLength++;
			}
		}
		if (options.hard && lengths[index] > columns) {
			const remainingColumns = (columns - rowLength);
			const breaksStartingThisLine = 1 + Math.floor((lengths[index] - remainingColumns - 1) / columns);
			const breaksStartingNextLine = Math.floor((lengths[index] - 1) / columns);
			if (breaksStartingNextLine < breaksStartingThisLine) {
				rows.push('');
			}
			wrapWord(rows, word, columns);
			continue;
		}
		if (rowLength + lengths[index] > columns && rowLength > 0 && lengths[index] > 0) {
			if (options.wordWrap === false && rowLength < columns) {
				wrapWord(rows, word, columns);
				continue;
			}
			rows.push('');
		}
		if (rowLength + lengths[index] > columns && options.wordWrap === false) {
			wrapWord(rows, word, columns);
			continue;
		}
		rows[rows.length - 1] += word;
	}
	if (options.trim !== false) {
		rows = rows.map(row => stringVisibleTrimSpacesRight(row));
	}
	const preString = rows.join('\n');
	const pre = [...preString];
	let preStringIndex = 0;
	for (const [index, character] of pre.entries()) {
		returnValue += character;
		if (ESCAPES.has(character)) {
			const {groups} = new RegExp(`(?:\\${ANSI_CSI}(?<code>\\d+)m|\\${ANSI_ESCAPE_LINK}(?<uri>.*)${ANSI_ESCAPE_BELL})`).exec(preString.slice(preStringIndex)) || {groups: {}};
			if (groups.code !== undefined) {
				const code = Number.parseFloat(groups.code);
				escapeCode = code === END_CODE ? undefined : code;
			} else if (groups.uri !== undefined) {
				escapeUrl = groups.uri.length === 0 ? undefined : groups.uri;
			}
		}
		const code = ansiStyles.codes.get(Number(escapeCode));
		if (pre[index + 1] === '\n') {
			if (escapeUrl) {
				returnValue += wrapAnsiHyperlink('');
			}
			if (escapeCode && code) {
				returnValue += wrapAnsiCode(code);
			}
		} else if (character === '\n') {
			if (escapeCode && code) {
				returnValue += wrapAnsiCode(escapeCode);
			}
			if (escapeUrl) {
				returnValue += wrapAnsiHyperlink(escapeUrl);
			}
		}
		preStringIndex += character.length;
	}
	return returnValue;
};
function wrapAnsi(string, columns, options) {
	return String(string)
		.normalize()
		.replaceAll('\r\n', '\n')
		.split('\n')
		.map(line => exec(line, columns, options))
		.join('\n');
}

function ui (opts) {
  return cliui(opts, {
    stringWidth: stringWidth$2,
    stripAnsi: stripAnsi$2,
    wrap: wrapAnsi
  })
}

function escalade (start, callback) {
	let dir = resolve('.', start);
	let tmp, stats = statSync(dir);
	if (!stats.isDirectory()) {
		dir = dirname(dir);
	}
	while (true) {
		tmp = callback(dir, readdirSync(dir));
		if (tmp) return resolve(dir, tmp);
		dir = dirname(tmp = dir);
		if (tmp === dir) break;
	}
}

/**
 * @license
 * Copyright (c) 2016, Contributors
 * SPDX-License-Identifier: ISC
 */
function camelCase(str) {
    const isCamelCase = str !== str.toLowerCase() && str !== str.toUpperCase();
    if (!isCamelCase) {
        str = str.toLowerCase();
    }
    if (str.indexOf('-') === -1 && str.indexOf('_') === -1) {
        return str;
    }
    else {
        let camelcase = '';
        let nextChrUpper = false;
        const leadingHyphens = str.match(/^-+/);
        for (let i = leadingHyphens ? leadingHyphens[0].length : 0; i < str.length; i++) {
            let chr = str.charAt(i);
            if (nextChrUpper) {
                nextChrUpper = false;
                chr = chr.toUpperCase();
            }
            if (i !== 0 && (chr === '-' || chr === '_')) {
                nextChrUpper = true;
            }
            else if (chr !== '-' && chr !== '_') {
                camelcase += chr;
            }
        }
        return camelcase;
    }
}
function decamelize(str, joinString) {
    const lowercase = str.toLowerCase();
    joinString = joinString || '-';
    let notCamelcase = '';
    for (let i = 0; i < str.length; i++) {
        const chrLower = lowercase.charAt(i);
        const chrString = str.charAt(i);
        if (chrLower !== chrString && i > 0) {
            notCamelcase += `${joinString}${lowercase.charAt(i)}`;
        }
        else {
            notCamelcase += chrString;
        }
    }
    return notCamelcase;
}
function looksLikeNumber(x) {
    if (x === null || x === undefined)
        return false;
    if (typeof x === 'number')
        return true;
    if (/^0x[0-9a-f]+$/i.test(x))
        return true;
    if (/^0[^.]/.test(x))
        return false;
    return /^[-]?(?:\d+(?:\.\d*)?|\.\d+)(e[-+]?\d+)?$/.test(x);
}

/**
 * @license
 * Copyright (c) 2016, Contributors
 * SPDX-License-Identifier: ISC
 */
function tokenizeArgString(argString) {
    if (Array.isArray(argString)) {
        return argString.map(e => typeof e !== 'string' ? e + '' : e);
    }
    argString = argString.trim();
    let i = 0;
    let prevC = null;
    let c = null;
    let opening = null;
    const args = [];
    for (let ii = 0; ii < argString.length; ii++) {
        prevC = c;
        c = argString.charAt(ii);
        if (c === ' ' && !opening) {
            if (!(prevC === ' ')) {
                i++;
            }
            continue;
        }
        if (c === opening) {
            opening = null;
        }
        else if ((c === "'" || c === '"') && !opening) {
            opening = c;
        }
        if (!args[i])
            args[i] = '';
        args[i] += c;
    }
    return args;
}

/**
 * @license
 * Copyright (c) 2016, Contributors
 * SPDX-License-Identifier: ISC
 */
var DefaultValuesForTypeKey;
(function (DefaultValuesForTypeKey) {
    DefaultValuesForTypeKey["BOOLEAN"] = "boolean";
    DefaultValuesForTypeKey["STRING"] = "string";
    DefaultValuesForTypeKey["NUMBER"] = "number";
    DefaultValuesForTypeKey["ARRAY"] = "array";
})(DefaultValuesForTypeKey || (DefaultValuesForTypeKey = {}));

/**
 * @license
 * Copyright (c) 2016, Contributors
 * SPDX-License-Identifier: ISC
 */
let mixin;
class YargsParser {
    constructor(_mixin) {
        mixin = _mixin;
    }
    parse(argsInput, options) {
        const opts = Object.assign({
            alias: undefined,
            array: undefined,
            boolean: undefined,
            config: undefined,
            configObjects: undefined,
            configuration: undefined,
            coerce: undefined,
            count: undefined,
            default: undefined,
            envPrefix: undefined,
            narg: undefined,
            normalize: undefined,
            string: undefined,
            number: undefined,
            __: undefined,
            key: undefined
        }, options);
        const args = tokenizeArgString(argsInput);
        const inputIsString = typeof argsInput === 'string';
        const aliases = combineAliases(Object.assign(Object.create(null), opts.alias));
        const configuration = Object.assign({
            'boolean-negation': true,
            'camel-case-expansion': true,
            'combine-arrays': false,
            'dot-notation': true,
            'duplicate-arguments-array': true,
            'flatten-duplicate-arrays': true,
            'greedy-arrays': true,
            'halt-at-non-option': false,
            'nargs-eats-options': false,
            'negation-prefix': 'no-',
            'parse-numbers': true,
            'parse-positional-numbers': true,
            'populate--': false,
            'set-placeholder-key': false,
            'short-option-groups': true,
            'strip-aliased': false,
            'strip-dashed': false,
            'unknown-options-as-args': false
        }, opts.configuration);
        const defaults = Object.assign(Object.create(null), opts.default);
        const configObjects = opts.configObjects || [];
        const envPrefix = opts.envPrefix;
        const notFlagsOption = configuration['populate--'];
        const notFlagsArgv = notFlagsOption ? '--' : '_';
        const newAliases = Object.create(null);
        const defaulted = Object.create(null);
        const __ = opts.__ || mixin.format;
        const flags = {
            aliases: Object.create(null),
            arrays: Object.create(null),
            bools: Object.create(null),
            strings: Object.create(null),
            numbers: Object.create(null),
            counts: Object.create(null),
            normalize: Object.create(null),
            configs: Object.create(null),
            nargs: Object.create(null),
            coercions: Object.create(null),
            keys: []
        };
        const negative = /^-([0-9]+(\.[0-9]+)?|\.[0-9]+)$/;
        const negatedBoolean = new RegExp('^--' + configuration['negation-prefix'] + '(.+)');
        [].concat(opts.array || []).filter(Boolean).forEach(function (opt) {
            const key = typeof opt === 'object' ? opt.key : opt;
            const assignment = Object.keys(opt).map(function (key) {
                const arrayFlagKeys = {
                    boolean: 'bools',
                    string: 'strings',
                    number: 'numbers'
                };
                return arrayFlagKeys[key];
            }).filter(Boolean).pop();
            if (assignment) {
                flags[assignment][key] = true;
            }
            flags.arrays[key] = true;
            flags.keys.push(key);
        });
        [].concat(opts.boolean || []).filter(Boolean).forEach(function (key) {
            flags.bools[key] = true;
            flags.keys.push(key);
        });
        [].concat(opts.string || []).filter(Boolean).forEach(function (key) {
            flags.strings[key] = true;
            flags.keys.push(key);
        });
        [].concat(opts.number || []).filter(Boolean).forEach(function (key) {
            flags.numbers[key] = true;
            flags.keys.push(key);
        });
        [].concat(opts.count || []).filter(Boolean).forEach(function (key) {
            flags.counts[key] = true;
            flags.keys.push(key);
        });
        [].concat(opts.normalize || []).filter(Boolean).forEach(function (key) {
            flags.normalize[key] = true;
            flags.keys.push(key);
        });
        if (typeof opts.narg === 'object') {
            Object.entries(opts.narg).forEach(([key, value]) => {
                if (typeof value === 'number') {
                    flags.nargs[key] = value;
                    flags.keys.push(key);
                }
            });
        }
        if (typeof opts.coerce === 'object') {
            Object.entries(opts.coerce).forEach(([key, value]) => {
                if (typeof value === 'function') {
                    flags.coercions[key] = value;
                    flags.keys.push(key);
                }
            });
        }
        if (typeof opts.config !== 'undefined') {
            if (Array.isArray(opts.config) || typeof opts.config === 'string') {
                [].concat(opts.config).filter(Boolean).forEach(function (key) {
                    flags.configs[key] = true;
                });
            }
            else if (typeof opts.config === 'object') {
                Object.entries(opts.config).forEach(([key, value]) => {
                    if (typeof value === 'boolean' || typeof value === 'function') {
                        flags.configs[key] = value;
                    }
                });
            }
        }
        extendAliases(opts.key, aliases, opts.default, flags.arrays);
        Object.keys(defaults).forEach(function (key) {
            (flags.aliases[key] || []).forEach(function (alias) {
                defaults[alias] = defaults[key];
            });
        });
        let error = null;
        checkConfiguration();
        let notFlags = [];
        const argv = Object.assign(Object.create(null), { _: [] });
        const argvReturn = {};
        for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            const truncatedArg = arg.replace(/^-{3,}/, '---');
            let broken;
            let key;
            let letters;
            let m;
            let next;
            let value;
            if (arg !== '--' && /^-/.test(arg) && isUnknownOptionAsArg(arg)) {
                pushPositional(arg);
            }
            else if (truncatedArg.match(/^---+(=|$)/)) {
                pushPositional(arg);
                continue;
            }
            else if (arg.match(/^--.+=/) || (!configuration['short-option-groups'] && arg.match(/^-.+=/))) {
                m = arg.match(/^--?([^=]+)=([\s\S]*)$/);
                if (m !== null && Array.isArray(m) && m.length >= 3) {
                    if (checkAllAliases(m[1], flags.arrays)) {
                        i = eatArray(i, m[1], args, m[2]);
                    }
                    else if (checkAllAliases(m[1], flags.nargs) !== false) {
                        i = eatNargs(i, m[1], args, m[2]);
                    }
                    else {
                        setArg(m[1], m[2], true);
                    }
                }
            }
            else if (arg.match(negatedBoolean) && configuration['boolean-negation']) {
                m = arg.match(negatedBoolean);
                if (m !== null && Array.isArray(m) && m.length >= 2) {
                    key = m[1];
                    setArg(key, checkAllAliases(key, flags.arrays) ? [false] : false);
                }
            }
            else if (arg.match(/^--.+/) || (!configuration['short-option-groups'] && arg.match(/^-[^-]+/))) {
                m = arg.match(/^--?(.+)/);
                if (m !== null && Array.isArray(m) && m.length >= 2) {
                    key = m[1];
                    if (checkAllAliases(key, flags.arrays)) {
                        i = eatArray(i, key, args);
                    }
                    else if (checkAllAliases(key, flags.nargs) !== false) {
                        i = eatNargs(i, key, args);
                    }
                    else {
                        next = args[i + 1];
                        if (next !== undefined && (!next.match(/^-/) ||
                            next.match(negative)) &&
                            !checkAllAliases(key, flags.bools) &&
                            !checkAllAliases(key, flags.counts)) {
                            setArg(key, next);
                            i++;
                        }
                        else if (/^(true|false)$/.test(next)) {
                            setArg(key, next);
                            i++;
                        }
                        else {
                            setArg(key, defaultValue(key));
                        }
                    }
                }
            }
            else if (arg.match(/^-.\..+=/)) {
                m = arg.match(/^-([^=]+)=([\s\S]*)$/);
                if (m !== null && Array.isArray(m) && m.length >= 3) {
                    setArg(m[1], m[2]);
                }
            }
            else if (arg.match(/^-.\..+/) && !arg.match(negative)) {
                next = args[i + 1];
                m = arg.match(/^-(.\..+)/);
                if (m !== null && Array.isArray(m) && m.length >= 2) {
                    key = m[1];
                    if (next !== undefined && !next.match(/^-/) &&
                        !checkAllAliases(key, flags.bools) &&
                        !checkAllAliases(key, flags.counts)) {
                        setArg(key, next);
                        i++;
                    }
                    else {
                        setArg(key, defaultValue(key));
                    }
                }
            }
            else if (arg.match(/^-[^-]+/) && !arg.match(negative)) {
                letters = arg.slice(1, -1).split('');
                broken = false;
                for (let j = 0; j < letters.length; j++) {
                    next = arg.slice(j + 2);
                    if (letters[j + 1] && letters[j + 1] === '=') {
                        value = arg.slice(j + 3);
                        key = letters[j];
                        if (checkAllAliases(key, flags.arrays)) {
                            i = eatArray(i, key, args, value);
                        }
                        else if (checkAllAliases(key, flags.nargs) !== false) {
                            i = eatNargs(i, key, args, value);
                        }
                        else {
                            setArg(key, value);
                        }
                        broken = true;
                        break;
                    }
                    if (next === '-') {
                        setArg(letters[j], next);
                        continue;
                    }
                    if (/[A-Za-z]/.test(letters[j]) &&
                        /^-?\d+(\.\d*)?(e-?\d+)?$/.test(next) &&
                        checkAllAliases(next, flags.bools) === false) {
                        setArg(letters[j], next);
                        broken = true;
                        break;
                    }
                    if (letters[j + 1] && letters[j + 1].match(/\W/)) {
                        setArg(letters[j], next);
                        broken = true;
                        break;
                    }
                    else {
                        setArg(letters[j], defaultValue(letters[j]));
                    }
                }
                key = arg.slice(-1)[0];
                if (!broken && key !== '-') {
                    if (checkAllAliases(key, flags.arrays)) {
                        i = eatArray(i, key, args);
                    }
                    else if (checkAllAliases(key, flags.nargs) !== false) {
                        i = eatNargs(i, key, args);
                    }
                    else {
                        next = args[i + 1];
                        if (next !== undefined && (!/^(-|--)[^-]/.test(next) ||
                            next.match(negative)) &&
                            !checkAllAliases(key, flags.bools) &&
                            !checkAllAliases(key, flags.counts)) {
                            setArg(key, next);
                            i++;
                        }
                        else if (/^(true|false)$/.test(next)) {
                            setArg(key, next);
                            i++;
                        }
                        else {
                            setArg(key, defaultValue(key));
                        }
                    }
                }
            }
            else if (arg.match(/^-[0-9]$/) &&
                arg.match(negative) &&
                checkAllAliases(arg.slice(1), flags.bools)) {
                key = arg.slice(1);
                setArg(key, defaultValue(key));
            }
            else if (arg === '--') {
                notFlags = args.slice(i + 1);
                break;
            }
            else if (configuration['halt-at-non-option']) {
                notFlags = args.slice(i);
                break;
            }
            else {
                pushPositional(arg);
            }
        }
        applyEnvVars(argv, true);
        applyEnvVars(argv, false);
        setConfig(argv);
        setConfigObjects();
        applyDefaultsAndAliases(argv, flags.aliases, defaults, true);
        applyCoercions(argv);
        if (configuration['set-placeholder-key'])
            setPlaceholderKeys(argv);
        Object.keys(flags.counts).forEach(function (key) {
            if (!hasKey(argv, key.split('.')))
                setArg(key, 0);
        });
        if (notFlagsOption && notFlags.length)
            argv[notFlagsArgv] = [];
        notFlags.forEach(function (key) {
            argv[notFlagsArgv].push(key);
        });
        if (configuration['camel-case-expansion'] && configuration['strip-dashed']) {
            Object.keys(argv).filter(key => key !== '--' && key.includes('-')).forEach(key => {
                delete argv[key];
            });
        }
        if (configuration['strip-aliased']) {
            [].concat(...Object.keys(aliases).map(k => aliases[k])).forEach(alias => {
                if (configuration['camel-case-expansion'] && alias.includes('-')) {
                    delete argv[alias.split('.').map(prop => camelCase(prop)).join('.')];
                }
                delete argv[alias];
            });
        }
        function pushPositional(arg) {
            const maybeCoercedNumber = maybeCoerceNumber('_', arg);
            if (typeof maybeCoercedNumber === 'string' || typeof maybeCoercedNumber === 'number') {
                argv._.push(maybeCoercedNumber);
            }
        }
        function eatNargs(i, key, args, argAfterEqualSign) {
            let ii;
            let toEat = checkAllAliases(key, flags.nargs);
            toEat = typeof toEat !== 'number' || isNaN(toEat) ? 1 : toEat;
            if (toEat === 0) {
                if (!isUndefined(argAfterEqualSign)) {
                    error = Error(__('Argument unexpected for: %s', key));
                }
                setArg(key, defaultValue(key));
                return i;
            }
            let available = isUndefined(argAfterEqualSign) ? 0 : 1;
            if (configuration['nargs-eats-options']) {
                if (args.length - (i + 1) + available < toEat) {
                    error = Error(__('Not enough arguments following: %s', key));
                }
                available = toEat;
            }
            else {
                for (ii = i + 1; ii < args.length; ii++) {
                    if (!args[ii].match(/^-[^0-9]/) || args[ii].match(negative) || isUnknownOptionAsArg(args[ii]))
                        available++;
                    else
                        break;
                }
                if (available < toEat)
                    error = Error(__('Not enough arguments following: %s', key));
            }
            let consumed = Math.min(available, toEat);
            if (!isUndefined(argAfterEqualSign) && consumed > 0) {
                setArg(key, argAfterEqualSign);
                consumed--;
            }
            for (ii = i + 1; ii < (consumed + i + 1); ii++) {
                setArg(key, args[ii]);
            }
            return (i + consumed);
        }
        function eatArray(i, key, args, argAfterEqualSign) {
            let argsToSet = [];
            let next = argAfterEqualSign || args[i + 1];
            const nargsCount = checkAllAliases(key, flags.nargs);
            if (checkAllAliases(key, flags.bools) && !(/^(true|false)$/.test(next))) {
                argsToSet.push(true);
            }
            else if (isUndefined(next) ||
                (isUndefined(argAfterEqualSign) && /^-/.test(next) && !negative.test(next) && !isUnknownOptionAsArg(next))) {
                if (defaults[key] !== undefined) {
                    const defVal = defaults[key];
                    argsToSet = Array.isArray(defVal) ? defVal : [defVal];
                }
            }
            else {
                if (!isUndefined(argAfterEqualSign)) {
                    argsToSet.push(processValue(key, argAfterEqualSign, true));
                }
                for (let ii = i + 1; ii < args.length; ii++) {
                    if ((!configuration['greedy-arrays'] && argsToSet.length > 0) ||
                        (nargsCount && typeof nargsCount === 'number' && argsToSet.length >= nargsCount))
                        break;
                    next = args[ii];
                    if (/^-/.test(next) && !negative.test(next) && !isUnknownOptionAsArg(next))
                        break;
                    i = ii;
                    argsToSet.push(processValue(key, next, inputIsString));
                }
            }
            if (typeof nargsCount === 'number' && ((nargsCount && argsToSet.length < nargsCount) ||
                (isNaN(nargsCount) && argsToSet.length === 0))) {
                error = Error(__('Not enough arguments following: %s', key));
            }
            setArg(key, argsToSet);
            return i;
        }
        function setArg(key, val, shouldStripQuotes = inputIsString) {
            if (/-/.test(key) && configuration['camel-case-expansion']) {
                const alias = key.split('.').map(function (prop) {
                    return camelCase(prop);
                }).join('.');
                addNewAlias(key, alias);
            }
            const value = processValue(key, val, shouldStripQuotes);
            const splitKey = key.split('.');
            setKey(argv, splitKey, value);
            if (flags.aliases[key]) {
                flags.aliases[key].forEach(function (x) {
                    const keyProperties = x.split('.');
                    setKey(argv, keyProperties, value);
                });
            }
            if (splitKey.length > 1 && configuration['dot-notation']) {
                (flags.aliases[splitKey[0]] || []).forEach(function (x) {
                    let keyProperties = x.split('.');
                    const a = [].concat(splitKey);
                    a.shift();
                    keyProperties = keyProperties.concat(a);
                    if (!(flags.aliases[key] || []).includes(keyProperties.join('.'))) {
                        setKey(argv, keyProperties, value);
                    }
                });
            }
            if (checkAllAliases(key, flags.normalize) && !checkAllAliases(key, flags.arrays)) {
                const keys = [key].concat(flags.aliases[key] || []);
                keys.forEach(function (key) {
                    Object.defineProperty(argvReturn, key, {
                        enumerable: true,
                        get() {
                            return val;
                        },
                        set(value) {
                            val = typeof value === 'string' ? mixin.normalize(value) : value;
                        }
                    });
                });
            }
        }
        function addNewAlias(key, alias) {
            if (!(flags.aliases[key] && flags.aliases[key].length)) {
                flags.aliases[key] = [alias];
                newAliases[alias] = true;
            }
            if (!(flags.aliases[alias] && flags.aliases[alias].length)) {
                addNewAlias(alias, key);
            }
        }
        function processValue(key, val, shouldStripQuotes) {
            if (shouldStripQuotes) {
                val = stripQuotes(val);
            }
            if (checkAllAliases(key, flags.bools) || checkAllAliases(key, flags.counts)) {
                if (typeof val === 'string')
                    val = val === 'true';
            }
            let value = Array.isArray(val)
                ? val.map(function (v) { return maybeCoerceNumber(key, v); })
                : maybeCoerceNumber(key, val);
            if (checkAllAliases(key, flags.counts) && (isUndefined(value) || typeof value === 'boolean')) {
                value = increment();
            }
            if (checkAllAliases(key, flags.normalize) && checkAllAliases(key, flags.arrays)) {
                if (Array.isArray(val))
                    value = val.map((val) => { return mixin.normalize(val); });
                else
                    value = mixin.normalize(val);
            }
            return value;
        }
        function maybeCoerceNumber(key, value) {
            if (!configuration['parse-positional-numbers'] && key === '_')
                return value;
            if (!checkAllAliases(key, flags.strings) && !checkAllAliases(key, flags.bools) && !Array.isArray(value)) {
                const shouldCoerceNumber = looksLikeNumber(value) && configuration['parse-numbers'] && (Number.isSafeInteger(Math.floor(parseFloat(`${value}`))));
                if (shouldCoerceNumber || (!isUndefined(value) && checkAllAliases(key, flags.numbers))) {
                    value = Number(value);
                }
            }
            return value;
        }
        function setConfig(argv) {
            const configLookup = Object.create(null);
            applyDefaultsAndAliases(configLookup, flags.aliases, defaults);
            Object.keys(flags.configs).forEach(function (configKey) {
                const configPath = argv[configKey] || configLookup[configKey];
                if (configPath) {
                    try {
                        let config = null;
                        const resolvedConfigPath = mixin.resolve(mixin.cwd(), configPath);
                        const resolveConfig = flags.configs[configKey];
                        if (typeof resolveConfig === 'function') {
                            try {
                                config = resolveConfig(resolvedConfigPath);
                            }
                            catch (e) {
                                config = e;
                            }
                            if (config instanceof Error) {
                                error = config;
                                return;
                            }
                        }
                        else {
                            config = mixin.require(resolvedConfigPath);
                        }
                        setConfigObject(config);
                    }
                    catch (ex) {
                        if (ex.name === 'PermissionDenied')
                            error = ex;
                        else if (argv[configKey])
                            error = Error(__('Invalid JSON config file: %s', configPath));
                    }
                }
            });
        }
        function setConfigObject(config, prev) {
            Object.keys(config).forEach(function (key) {
                const value = config[key];
                const fullKey = prev ? prev + '.' + key : key;
                if (typeof value === 'object' && value !== null && !Array.isArray(value) && configuration['dot-notation']) {
                    setConfigObject(value, fullKey);
                }
                else {
                    if (!hasKey(argv, fullKey.split('.')) || (checkAllAliases(fullKey, flags.arrays) && configuration['combine-arrays'])) {
                        setArg(fullKey, value);
                    }
                }
            });
        }
        function setConfigObjects() {
            if (typeof configObjects !== 'undefined') {
                configObjects.forEach(function (configObject) {
                    setConfigObject(configObject);
                });
            }
        }
        function applyEnvVars(argv, configOnly) {
            if (typeof envPrefix === 'undefined')
                return;
            const prefix = typeof envPrefix === 'string' ? envPrefix : '';
            const env = mixin.env();
            Object.keys(env).forEach(function (envVar) {
                if (prefix === '' || envVar.lastIndexOf(prefix, 0) === 0) {
                    const keys = envVar.split('__').map(function (key, i) {
                        if (i === 0) {
                            key = key.substring(prefix.length);
                        }
                        return camelCase(key);
                    });
                    if (((configOnly && flags.configs[keys.join('.')]) || !configOnly) && !hasKey(argv, keys)) {
                        setArg(keys.join('.'), env[envVar]);
                    }
                }
            });
        }
        function applyCoercions(argv) {
            let coerce;
            const applied = new Set();
            Object.keys(argv).forEach(function (key) {
                if (!applied.has(key)) {
                    coerce = checkAllAliases(key, flags.coercions);
                    if (typeof coerce === 'function') {
                        try {
                            const value = maybeCoerceNumber(key, coerce(argv[key]));
                            ([].concat(flags.aliases[key] || [], key)).forEach(ali => {
                                applied.add(ali);
                                argv[ali] = value;
                            });
                        }
                        catch (err) {
                            error = err;
                        }
                    }
                }
            });
        }
        function setPlaceholderKeys(argv) {
            flags.keys.forEach((key) => {
                if (~key.indexOf('.'))
                    return;
                if (typeof argv[key] === 'undefined')
                    argv[key] = undefined;
            });
            return argv;
        }
        function applyDefaultsAndAliases(obj, aliases, defaults, canLog = false) {
            Object.keys(defaults).forEach(function (key) {
                if (!hasKey(obj, key.split('.'))) {
                    setKey(obj, key.split('.'), defaults[key]);
                    if (canLog)
                        defaulted[key] = true;
                    (aliases[key] || []).forEach(function (x) {
                        if (hasKey(obj, x.split('.')))
                            return;
                        setKey(obj, x.split('.'), defaults[key]);
                    });
                }
            });
        }
        function hasKey(obj, keys) {
            let o = obj;
            if (!configuration['dot-notation'])
                keys = [keys.join('.')];
            keys.slice(0, -1).forEach(function (key) {
                o = (o[key] || {});
            });
            const key = keys[keys.length - 1];
            if (typeof o !== 'object')
                return false;
            else
                return key in o;
        }
        function setKey(obj, keys, value) {
            let o = obj;
            if (!configuration['dot-notation'])
                keys = [keys.join('.')];
            keys.slice(0, -1).forEach(function (key) {
                key = sanitizeKey(key);
                if (typeof o === 'object' && o[key] === undefined) {
                    o[key] = {};
                }
                if (typeof o[key] !== 'object' || Array.isArray(o[key])) {
                    if (Array.isArray(o[key])) {
                        o[key].push({});
                    }
                    else {
                        o[key] = [o[key], {}];
                    }
                    o = o[key][o[key].length - 1];
                }
                else {
                    o = o[key];
                }
            });
            const key = sanitizeKey(keys[keys.length - 1]);
            const isTypeArray = checkAllAliases(keys.join('.'), flags.arrays);
            const isValueArray = Array.isArray(value);
            let duplicate = configuration['duplicate-arguments-array'];
            if (!duplicate && checkAllAliases(key, flags.nargs)) {
                duplicate = true;
                if ((!isUndefined(o[key]) && flags.nargs[key] === 1) || (Array.isArray(o[key]) && o[key].length === flags.nargs[key])) {
                    o[key] = undefined;
                }
            }
            if (value === increment()) {
                o[key] = increment(o[key]);
            }
            else if (Array.isArray(o[key])) {
                if (duplicate && isTypeArray && isValueArray) {
                    o[key] = configuration['flatten-duplicate-arrays'] ? o[key].concat(value) : (Array.isArray(o[key][0]) ? o[key] : [o[key]]).concat([value]);
                }
                else if (!duplicate && Boolean(isTypeArray) === Boolean(isValueArray)) {
                    o[key] = value;
                }
                else {
                    o[key] = o[key].concat([value]);
                }
            }
            else if (o[key] === undefined && isTypeArray) {
                o[key] = isValueArray ? value : [value];
            }
            else if (duplicate && !(o[key] === undefined ||
                checkAllAliases(key, flags.counts) ||
                checkAllAliases(key, flags.bools))) {
                o[key] = [o[key], value];
            }
            else {
                o[key] = value;
            }
        }
        function extendAliases(...args) {
            args.forEach(function (obj) {
                Object.keys(obj || {}).forEach(function (key) {
                    if (flags.aliases[key])
                        return;
                    flags.aliases[key] = [].concat(aliases[key] || []);
                    flags.aliases[key].concat(key).forEach(function (x) {
                        if (/-/.test(x) && configuration['camel-case-expansion']) {
                            const c = camelCase(x);
                            if (c !== key && flags.aliases[key].indexOf(c) === -1) {
                                flags.aliases[key].push(c);
                                newAliases[c] = true;
                            }
                        }
                    });
                    flags.aliases[key].concat(key).forEach(function (x) {
                        if (x.length > 1 && /[A-Z]/.test(x) && configuration['camel-case-expansion']) {
                            const c = decamelize(x, '-');
                            if (c !== key && flags.aliases[key].indexOf(c) === -1) {
                                flags.aliases[key].push(c);
                                newAliases[c] = true;
                            }
                        }
                    });
                    flags.aliases[key].forEach(function (x) {
                        flags.aliases[x] = [key].concat(flags.aliases[key].filter(function (y) {
                            return x !== y;
                        }));
                    });
                });
            });
        }
        function checkAllAliases(key, flag) {
            const toCheck = [].concat(flags.aliases[key] || [], key);
            const keys = Object.keys(flag);
            const setAlias = toCheck.find(key => keys.includes(key));
            return setAlias ? flag[setAlias] : false;
        }
        function hasAnyFlag(key) {
            const flagsKeys = Object.keys(flags);
            const toCheck = [].concat(flagsKeys.map(k => flags[k]));
            return toCheck.some(function (flag) {
                return Array.isArray(flag) ? flag.includes(key) : flag[key];
            });
        }
        function hasFlagsMatching(arg, ...patterns) {
            const toCheck = [].concat(...patterns);
            return toCheck.some(function (pattern) {
                const match = arg.match(pattern);
                return match && hasAnyFlag(match[1]);
            });
        }
        function hasAllShortFlags(arg) {
            if (arg.match(negative) || !arg.match(/^-[^-]+/)) {
                return false;
            }
            let hasAllFlags = true;
            let next;
            const letters = arg.slice(1).split('');
            for (let j = 0; j < letters.length; j++) {
                next = arg.slice(j + 2);
                if (!hasAnyFlag(letters[j])) {
                    hasAllFlags = false;
                    break;
                }
                if ((letters[j + 1] && letters[j + 1] === '=') ||
                    next === '-' ||
                    (/[A-Za-z]/.test(letters[j]) && /^-?\d+(\.\d*)?(e-?\d+)?$/.test(next)) ||
                    (letters[j + 1] && letters[j + 1].match(/\W/))) {
                    break;
                }
            }
            return hasAllFlags;
        }
        function isUnknownOptionAsArg(arg) {
            return configuration['unknown-options-as-args'] && isUnknownOption(arg);
        }
        function isUnknownOption(arg) {
            arg = arg.replace(/^-{3,}/, '--');
            if (arg.match(negative)) {
                return false;
            }
            if (hasAllShortFlags(arg)) {
                return false;
            }
            const flagWithEquals = /^-+([^=]+?)=[\s\S]*$/;
            const normalFlag = /^-+([^=]+?)$/;
            const flagEndingInHyphen = /^-+([^=]+?)-$/;
            const flagEndingInDigits = /^-+([^=]+?\d+)$/;
            const flagEndingInNonWordCharacters = /^-+([^=]+?)\W+.*$/;
            return !hasFlagsMatching(arg, flagWithEquals, negatedBoolean, normalFlag, flagEndingInHyphen, flagEndingInDigits, flagEndingInNonWordCharacters);
        }
        function defaultValue(key) {
            if (!checkAllAliases(key, flags.bools) &&
                !checkAllAliases(key, flags.counts) &&
                `${key}` in defaults) {
                return defaults[key];
            }
            else {
                return defaultForType(guessType(key));
            }
        }
        function defaultForType(type) {
            const def = {
                [DefaultValuesForTypeKey.BOOLEAN]: true,
                [DefaultValuesForTypeKey.STRING]: '',
                [DefaultValuesForTypeKey.NUMBER]: undefined,
                [DefaultValuesForTypeKey.ARRAY]: []
            };
            return def[type];
        }
        function guessType(key) {
            let type = DefaultValuesForTypeKey.BOOLEAN;
            if (checkAllAliases(key, flags.strings))
                type = DefaultValuesForTypeKey.STRING;
            else if (checkAllAliases(key, flags.numbers))
                type = DefaultValuesForTypeKey.NUMBER;
            else if (checkAllAliases(key, flags.bools))
                type = DefaultValuesForTypeKey.BOOLEAN;
            else if (checkAllAliases(key, flags.arrays))
                type = DefaultValuesForTypeKey.ARRAY;
            return type;
        }
        function isUndefined(num) {
            return num === undefined;
        }
        function checkConfiguration() {
            Object.keys(flags.counts).find(key => {
                if (checkAllAliases(key, flags.arrays)) {
                    error = Error(__('Invalid configuration: %s, opts.count excludes opts.array.', key));
                    return true;
                }
                else if (checkAllAliases(key, flags.nargs)) {
                    error = Error(__('Invalid configuration: %s, opts.count excludes opts.narg.', key));
                    return true;
                }
                return false;
            });
        }
        return {
            aliases: Object.assign({}, flags.aliases),
            argv: Object.assign(argvReturn, argv),
            configuration: configuration,
            defaulted: Object.assign({}, defaulted),
            error: error,
            newAliases: Object.assign({}, newAliases)
        };
    }
}
function combineAliases(aliases) {
    const aliasArrays = [];
    const combined = Object.create(null);
    let change = true;
    Object.keys(aliases).forEach(function (key) {
        aliasArrays.push([].concat(aliases[key], key));
    });
    while (change) {
        change = false;
        for (let i = 0; i < aliasArrays.length; i++) {
            for (let ii = i + 1; ii < aliasArrays.length; ii++) {
                const intersect = aliasArrays[i].filter(function (v) {
                    return aliasArrays[ii].indexOf(v) !== -1;
                });
                if (intersect.length) {
                    aliasArrays[i] = aliasArrays[i].concat(aliasArrays[ii]);
                    aliasArrays.splice(ii, 1);
                    change = true;
                    break;
                }
            }
        }
    }
    aliasArrays.forEach(function (aliasArray) {
        aliasArray = aliasArray.filter(function (v, i, self) {
            return self.indexOf(v) === i;
        });
        const lastAlias = aliasArray.pop();
        if (lastAlias !== undefined && typeof lastAlias === 'string') {
            combined[lastAlias] = aliasArray;
        }
    });
    return combined;
}
function increment(orig) {
    return orig !== undefined ? orig + 1 : 1;
}
function sanitizeKey(key) {
    if (key === '__proto__')
        return '___proto___';
    return key;
}
function stripQuotes(val) {
    return (typeof val === 'string' &&
        (val[0] === "'" || val[0] === '"') &&
        val[val.length - 1] === val[0])
        ? val.substring(1, val.length - 1)
        : val;
}

/**
 * @fileoverview Main entrypoint for libraries using yargs-parser in Node.js
 *
 * @license
 * Copyright (c) 2016, Contributors
 * SPDX-License-Identifier: ISC
 */
var _a, _b, _c;
const minNodeVersion = (process && process.env && process.env.YARGS_MIN_NODE_VERSION)
    ? Number(process.env.YARGS_MIN_NODE_VERSION)
    : 20;
const nodeVersion = (_b = (_a = process === null || process === void 0 ? void 0 : process.versions) === null || _a === void 0 ? void 0 : _a.node) !== null && _b !== void 0 ? _b : (_c = process === null || process === void 0 ? void 0 : process.version) === null || _c === void 0 ? void 0 : _c.slice(1);
if (nodeVersion) {
    const major = Number(nodeVersion.match(/^([^.]+)/)[1]);
    if (major < minNodeVersion) {
        throw Error(`yargs parser supports a minimum Node.js version of ${minNodeVersion}. Read our version support policy: https://github.com/yargs/yargs-parser#supported-nodejs-versions`);
    }
}
const env = process ? process.env : {};
const require$2 = createRequire ? createRequire(import.meta.url) : undefined;
const parser = new YargsParser({
    cwd: process.cwd,
    env: () => {
        return env;
    },
    format,
    normalize,
    resolve,
    require: (path) => {
        if (typeof require$2 !== 'undefined') {
            return require$2(path);
        }
        else if (path.match(/\.json$/)) {
            return JSON.parse(readFileSync(path, 'utf8'));
        }
        else {
            throw Error('only .json config files are supported in ESM');
        }
    }
});
const yargsParser = function Parser(args, opts) {
    const result = parser.parse(args.slice(), opts);
    return result.argv;
};
yargsParser.detailed = function (args, opts) {
    return parser.parse(args.slice(), opts);
};
yargsParser.camelCase = camelCase;
yargsParser.decamelize = decamelize;
yargsParser.looksLikeNumber = looksLikeNumber;

function getProcessArgvBinIndex() {
    if (isBundledElectronApp())
        return 0;
    return 1;
}
function isBundledElectronApp() {
    return isElectronApp() && !process.defaultApp;
}
function isElectronApp() {
    return !!process.versions.electron;
}
function hideBin(argv) {
    return argv.slice(getProcessArgvBinIndex() + 1);
}
function getProcessArgvBin() {
    return process.argv[getProcessArgvBinIndex()];
}

function ansiRegex({onlyFirst = false} = {}) {
	const ST = '(?:\\u0007|\\u001B\\u005C|\\u009C)';
	const osc = `(?:(?:\\u001B\\]|\\u009D)[^\\u0007\\u001B\\u009C\\u009D]*${ST})`;
	const csi = '[\\u001B\\u009B][[\\]()#;?]*(?:\\d{1,4}(?:[;:]\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]';
	const pattern = `${osc}|${csi}`;
	return new RegExp(pattern, onlyFirst ? undefined : 'g');
}

const regex = ansiRegex();
function stripAnsi(string) {
	if (typeof string !== 'string') {
		throw new TypeError(`Expected a \`string\`, got \`${typeof string}\``);
	}
	if (!string.includes('\u001B') && !string.includes('\u009B')) {
		return string;
	}
	return string.replace(regex, '');
}

const segmenter = new Intl.Segmenter();
const visibleCharacterRegex = /[^\p{Default_Ignorable_Code_Point}\p{Control}\p{Format}\p{Nonspacing_Mark}\p{Enclosing_Mark}\p{Surrogate}]/v;
const spacingMarkRegex = /\p{Spacing_Mark}/v;
const rgiEmojiRegex = /^\p{RGI_Emoji}$/v;
const unqualifiedKeycapRegex = /^[\d#*]\u20E3$/;
const extendedPictographicRegex = /\p{Extended_Pictographic}/gu;
function isDoubleWidthNonRgiEmojiSequence(segment) {
	if (segment.length > 50) {
		return false;
	}
	if (unqualifiedKeycapRegex.test(segment)) {
		return true;
	}
	if (segment.includes('\u200D')) {
		const pictographics = segment.match(extendedPictographicRegex);
		return pictographics !== null && pictographics.length >= 2;
	}
	return false;
}
function baseVisible(segment) {
	const index = segment.search(visibleCharacterRegex);
	return index === -1 ? undefined : segment.slice(index);
}
function isHangulLeadingJamo(codePoint) {
	return (codePoint >= 0x11_00 && codePoint <= 0x11_5F)
		|| (codePoint >= 0xA9_60 && codePoint <= 0xA9_7C);
}
function isHangulVowelJamo(codePoint) {
	return (codePoint >= 0x11_60 && codePoint <= 0x11_A7)
		|| (codePoint >= 0xD7_B0 && codePoint <= 0xD7_C6);
}
function isHangulTrailingJamo(codePoint) {
	return (codePoint >= 0x11_A8 && codePoint <= 0x11_FF)
		|| (codePoint >= 0xD7_CB && codePoint <= 0xD7_FB);
}
function isHangulJamo(codePoint) {
	return isHangulLeadingJamo(codePoint)
		|| isHangulVowelJamo(codePoint)
		|| isHangulTrailingJamo(codePoint);
}
function hangulClusterWidth(visibleSegment, eastAsianWidthOptions) {
	const codePoints = [];
	for (const character of visibleSegment) {
		if (!visibleCharacterRegex.test(character)) {
			continue;
		}
		codePoints.push(character.codePointAt(0));
	}
	if (codePoints.length === 0) {
		return undefined;
	}
	let width = 0;
	for (let index = 0; index < codePoints.length; index++) {
		const codePoint = codePoints[index];
		if (!isHangulJamo(codePoint)) {
			if (width === 0) {
				return undefined;
			}
			for (let remaining = index; remaining < codePoints.length; remaining++) {
				width += eastAsianWidth(codePoints[remaining], eastAsianWidthOptions);
			}
			return width;
		}
		if (
			isHangulLeadingJamo(codePoint)
			&& isHangulVowelJamo(codePoints[index + 1])
		) {
			width += 2;
			index += isHangulTrailingJamo(codePoints[index + 2]) ? 2 : 1;
			continue;
		}
		width += eastAsianWidth(codePoint, eastAsianWidthOptions);
	}
	return width;
}
function trailingWidth(visibleSegment, eastAsianWidthOptions) {
	let extra = 0;
	let first = true;
	for (const character of visibleSegment) {
		if (first) {
			first = false;
			continue;
		}
		if (
			spacingMarkRegex.test(character)
			|| (character >= '\uFF00' && character <= '\uFFEF')
		) {
			extra += eastAsianWidth(character.codePointAt(0), eastAsianWidthOptions);
		}
	}
	return extra;
}
function stringWidth(input, options = {}) {
	if (typeof input !== 'string' || input.length === 0) {
		return 0;
	}
	const {
		ambiguousIsNarrow = true,
		countAnsiEscapeCodes = false,
	} = options;
	let string = input;
	if (!countAnsiEscapeCodes && (string.includes('\u001B') || string.includes('\u009B'))) {
		string = stripAnsi(string);
	}
	if (string.length === 0) {
		return 0;
	}
	if (/^[\u0020-\u007E]*$/.test(string)) {
		return string.length;
	}
	let width = 0;
	const eastAsianWidthOptions = {ambiguousAsWide: !ambiguousIsNarrow};
	for (const {segment} of segmenter.segment(string)) {
		const visibleSegment = baseVisible(segment);
		if (visibleSegment === undefined) {
			continue;
		}
		if (rgiEmojiRegex.test(segment) || isDoubleWidthNonRgiEmojiSequence(segment)) {
			width += 2;
			continue;
		}
		const hangulWidth = hangulClusterWidth(visibleSegment, eastAsianWidthOptions);
		if (hangulWidth !== undefined) {
			width += hangulWidth;
			continue;
		}
		const codePoint = visibleSegment.codePointAt(0);
		width += eastAsianWidth(codePoint, eastAsianWidthOptions);
		width += trailingWidth(visibleSegment, eastAsianWidthOptions);
	}
	return width;
}

var shim$3 = {
    fs: {
        readFileSync,
        writeFile
    },
    format,
    resolve,
    exists: (file) => {
        try {
            return statSync(file).isFile();
        }
        catch (err) {
            return false;
        }
    }
};

let shim$2;
class Y18N {
    constructor(opts) {
        opts = opts || {};
        this.directory = opts.directory || './locales';
        this.updateFiles = typeof opts.updateFiles === 'boolean' ? opts.updateFiles : true;
        this.locale = opts.locale || 'en';
        this.fallbackToLanguage = typeof opts.fallbackToLanguage === 'boolean' ? opts.fallbackToLanguage : true;
        this.cache = Object.create(null);
        this.writeQueue = [];
    }
    __(...args) {
        if (typeof arguments[0] !== 'string') {
            return this._taggedLiteral(arguments[0], ...arguments);
        }
        const str = args.shift();
        let cb = function () { };
        if (typeof args[args.length - 1] === 'function')
            cb = args.pop();
        cb = cb || function () { };
        if (!this.cache[this.locale])
            this._readLocaleFile();
        if (!this.cache[this.locale][str] && this.updateFiles) {
            this.cache[this.locale][str] = str;
            this._enqueueWrite({
                directory: this.directory,
                locale: this.locale,
                cb
            });
        }
        else {
            cb();
        }
        return shim$2.format.apply(shim$2.format, [this.cache[this.locale][str] || str].concat(args));
    }
    __n() {
        const args = Array.prototype.slice.call(arguments);
        const singular = args.shift();
        const plural = args.shift();
        const quantity = args.shift();
        let cb = function () { };
        if (typeof args[args.length - 1] === 'function')
            cb = args.pop();
        if (!this.cache[this.locale])
            this._readLocaleFile();
        let str = quantity === 1 ? singular : plural;
        if (this.cache[this.locale][singular]) {
            const entry = this.cache[this.locale][singular];
            str = entry[quantity === 1 ? 'one' : 'other'];
        }
        if (!this.cache[this.locale][singular] && this.updateFiles) {
            this.cache[this.locale][singular] = {
                one: singular,
                other: plural
            };
            this._enqueueWrite({
                directory: this.directory,
                locale: this.locale,
                cb
            });
        }
        else {
            cb();
        }
        const values = [str];
        if (~str.indexOf('%d'))
            values.push(quantity);
        return shim$2.format.apply(shim$2.format, values.concat(args));
    }
    setLocale(locale) {
        this.locale = locale;
    }
    getLocale() {
        return this.locale;
    }
    updateLocale(obj) {
        if (!this.cache[this.locale])
            this._readLocaleFile();
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                this.cache[this.locale][key] = obj[key];
            }
        }
    }
    _taggedLiteral(parts, ...args) {
        let str = '';
        parts.forEach(function (part, i) {
            const arg = args[i + 1];
            str += part;
            if (typeof arg !== 'undefined') {
                str += '%s';
            }
        });
        return this.__.apply(this, [str].concat([].slice.call(args, 1)));
    }
    _enqueueWrite(work) {
        this.writeQueue.push(work);
        if (this.writeQueue.length === 1)
            this._processWriteQueue();
    }
    _processWriteQueue() {
        const _this = this;
        const work = this.writeQueue[0];
        const directory = work.directory;
        const locale = work.locale;
        const cb = work.cb;
        const languageFile = this._resolveLocaleFile(directory, locale);
        const serializedLocale = JSON.stringify(this.cache[locale], null, 2);
        shim$2.fs.writeFile(languageFile, serializedLocale, 'utf-8', function (err) {
            _this.writeQueue.shift();
            if (_this.writeQueue.length > 0)
                _this._processWriteQueue();
            cb(err);
        });
    }
    _readLocaleFile() {
        let localeLookup = {};
        const languageFile = this._resolveLocaleFile(this.directory, this.locale);
        try {
            if (shim$2.fs.readFileSync) {
                localeLookup = JSON.parse(shim$2.fs.readFileSync(languageFile, 'utf-8'));
            }
        }
        catch (err) {
            if (err instanceof SyntaxError) {
                err.message = 'syntax error in ' + languageFile;
            }
            if (err.code === 'ENOENT')
                localeLookup = {};
            else
                throw err;
        }
        this.cache[this.locale] = localeLookup;
    }
    _resolveLocaleFile(directory, locale) {
        let file = shim$2.resolve(directory, './', locale + '.json');
        if (this.fallbackToLanguage && !this._fileExistsSync(file) && ~locale.lastIndexOf('_')) {
            const languageFile = shim$2.resolve(directory, './', locale.split('_')[0] + '.json');
            if (this._fileExistsSync(languageFile))
                file = languageFile;
        }
        return file;
    }
    _fileExistsSync(file) {
        return shim$2.exists(file);
    }
}
function y18n$1(opts, _shim) {
    shim$2 = _shim;
    const y18n = new Y18N(opts);
    return {
        __: y18n.__.bind(y18n),
        __n: y18n.__n.bind(y18n),
        setLocale: y18n.setLocale.bind(y18n),
        getLocale: y18n.getLocale.bind(y18n),
        updateLocale: y18n.updateLocale.bind(y18n),
        locale: y18n.locale
    };
}

const y18n = (opts) => {
  return y18n$1(opts, shim$3)
};

function getDefaultExportFromCjs (x) {
	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
}

var getCallerFile$1;
var hasRequiredGetCallerFile;

function requireGetCallerFile () {
	if (hasRequiredGetCallerFile) return getCallerFile$1;
	hasRequiredGetCallerFile = 1;
	getCallerFile$1 = function getCallerFile(position) {
	    if (position === void 0) { position = 2; }
	    if (position >= Error.stackTraceLimit) {
	        throw new TypeError('getCallerFile(position) requires position be less then Error.stackTraceLimit but position was: `' + position + '` and Error.stackTraceLimit was: `' + Error.stackTraceLimit + '`');
	    }
	    var oldPrepareStackTrace = Error.prepareStackTrace;
	    Error.prepareStackTrace = function (_, stack) { return stack; };
	    var stack = new Error().stack;
	    Error.prepareStackTrace = oldPrepareStackTrace;
	    if (stack !== null && typeof stack === 'object') {
	        return stack[position] ? stack[position].getFileName() : undefined;
	    }
	};
	return getCallerFile$1;
}

var getCallerFileExports = requireGetCallerFile();
var getCallerFile = /*@__PURE__*/getDefaultExportFromCjs(getCallerFileExports);

const __dirname$1 = fileURLToPath(import.meta.url);
const mainFilename = __dirname$1.substring(0, __dirname$1.lastIndexOf('node_modules'));
const require$1 = createRequire(import.meta.url);
var shim$1 = {
  assert: {
    notStrictEqual,
    strictEqual
  },
  cliui: ui,
  findUp: escalade,
  getEnv: (key) => {
    return process.env[key]
  },
  inspect,
  getProcessArgvBin,
  mainFilename: mainFilename || process.cwd(),
  Parser: yargsParser,
  path: {
    basename,
    dirname,
    extname,
    relative,
    resolve,
    join
  },
  process: {
    argv: () => process.argv,
    cwd: process.cwd,
    emitWarning: (warning, type) => process.emitWarning(warning, type),
    execPath: () => process.execPath,
    exit: (code) => {
      process.exit(code);
    },
    nextTick: process.nextTick,
    stdColumns: typeof process.stdout.columns !== 'undefined' ? process.stdout.columns : null
  },
  readFileSync: readFileSync$1,
  readdirSync: readdirSync$1,
  require: require$1,
  getCallerFile: () => {
    const callerFile = getCallerFile(3);
    return callerFile.match(/^file:\/\//) ? fileURLToPath(callerFile) : callerFile;
  },
  stringWidth,
  y18n: y18n({
    directory: resolve(__dirname$1, '../../../locales'),
    updateFiles: false
  })
};

function assertNotStrictEqual(actual, expected, shim, message) {
    shim.assert.notStrictEqual(actual, expected, message);
}
function assertSingleKey(actual, shim) {
    shim.assert.strictEqual(typeof actual, 'string');
}
function objectKeys(object) {
    return Object.keys(object);
}

function isPromise(maybePromise) {
    return (!!maybePromise &&
        !!maybePromise.then &&
        typeof maybePromise.then === 'function');
}

class YError extends Error {
    constructor(msg) {
        super(msg || 'yargs error');
        this.name = 'YError';
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, YError);
        }
    }
}

function parseCommand(cmd) {
    const extraSpacesStrippedCommand = cmd.replace(/\s{2,}/g, ' ');
    const splitCommand = extraSpacesStrippedCommand.split(/\s+(?![^[]*]|[^<]*>)/);
    const bregex = /\.*[\][<>]/g;
    const firstCommand = splitCommand.shift();
    if (!firstCommand)
        throw new Error(`No command found in: ${cmd}`);
    const parsedCommand = {
        cmd: firstCommand.replace(bregex, ''),
        demanded: [],
        optional: [],
    };
    splitCommand.forEach((cmd, i) => {
        let variadic = false;
        cmd = cmd.replace(/\s/g, '');
        if (/\.+[\]>]/.test(cmd) && i === splitCommand.length - 1)
            variadic = true;
        if (/^\[/.test(cmd)) {
            parsedCommand.optional.push({
                cmd: cmd.replace(bregex, '').split('|'),
                variadic,
            });
        }
        else {
            parsedCommand.demanded.push({
                cmd: cmd.replace(bregex, '').split('|'),
                variadic,
            });
        }
    });
    return parsedCommand;
}

const positionName = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'];
function argsert(arg1, arg2, arg3) {
    function parseArgs() {
        return typeof arg1 === 'object'
            ? [{ demanded: [], optional: [] }, arg1, arg2]
            : [
                parseCommand(`cmd ${arg1}`),
                arg2,
                arg3,
            ];
    }
    try {
        let position = 0;
        const [parsed, callerArguments, _length] = parseArgs();
        const args = [].slice.call(callerArguments);
        while (args.length && args[args.length - 1] === undefined)
            args.pop();
        const length = _length || args.length;
        if (length < parsed.demanded.length) {
            throw new YError(`Not enough arguments provided. Expected ${parsed.demanded.length} but received ${args.length}.`);
        }
        const totalCommands = parsed.demanded.length + parsed.optional.length;
        if (length > totalCommands) {
            throw new YError(`Too many arguments provided. Expected max ${totalCommands} but received ${length}.`);
        }
        parsed.demanded.forEach(demanded => {
            const arg = args.shift();
            const observedType = guessType(arg);
            const matchingTypes = demanded.cmd.filter(type => type === observedType || type === '*');
            if (matchingTypes.length === 0)
                argumentTypeError(observedType, demanded.cmd, position);
            position += 1;
        });
        parsed.optional.forEach(optional => {
            if (args.length === 0)
                return;
            const arg = args.shift();
            const observedType = guessType(arg);
            const matchingTypes = optional.cmd.filter(type => type === observedType || type === '*');
            if (matchingTypes.length === 0)
                argumentTypeError(observedType, optional.cmd, position);
            position += 1;
        });
    }
    catch (err) {
        console.warn(err.stack);
    }
}
function guessType(arg) {
    if (Array.isArray(arg)) {
        return 'array';
    }
    else if (arg === null) {
        return 'null';
    }
    return typeof arg;
}
function argumentTypeError(observedType, allowedTypes, position) {
    throw new YError(`Invalid ${positionName[position] || 'manyith'} argument. Expected ${allowedTypes.join(' or ')} but received ${observedType}.`);
}

class GlobalMiddleware {
    constructor(yargs) {
        this.globalMiddleware = [];
        this.frozens = [];
        this.yargs = yargs;
    }
    addMiddleware(callback, applyBeforeValidation, global = true, mutates = false) {
        argsert('<array|function> [boolean] [boolean] [boolean]', [callback, applyBeforeValidation, global], arguments.length);
        if (Array.isArray(callback)) {
            for (let i = 0; i < callback.length; i++) {
                if (typeof callback[i] !== 'function') {
                    throw Error('middleware must be a function');
                }
                const m = callback[i];
                m.applyBeforeValidation = applyBeforeValidation;
                m.global = global;
            }
            Array.prototype.push.apply(this.globalMiddleware, callback);
        }
        else if (typeof callback === 'function') {
            const m = callback;
            m.applyBeforeValidation = applyBeforeValidation;
            m.global = global;
            m.mutates = mutates;
            this.globalMiddleware.push(callback);
        }
        return this.yargs;
    }
    addCoerceMiddleware(callback, option) {
        const aliases = this.yargs.getAliases();
        this.globalMiddleware = this.globalMiddleware.filter(m => {
            const toCheck = [...(aliases[option] || []), option];
            if (!m.option)
                return true;
            else
                return !toCheck.includes(m.option);
        });
        callback.option = option;
        return this.addMiddleware(callback, true, true, true);
    }
    getMiddleware() {
        return this.globalMiddleware;
    }
    freeze() {
        this.frozens.push([...this.globalMiddleware]);
    }
    unfreeze() {
        const frozen = this.frozens.pop();
        if (frozen !== undefined)
            this.globalMiddleware = frozen;
    }
    reset() {
        this.globalMiddleware = this.globalMiddleware.filter(m => m.global);
    }
}
function commandMiddlewareFactory(commandMiddleware) {
    if (!commandMiddleware)
        return [];
    return commandMiddleware.map(middleware => {
        middleware.applyBeforeValidation = false;
        return middleware;
    });
}
function applyMiddleware(argv, yargs, middlewares, beforeValidation) {
    return middlewares.reduce((acc, middleware) => {
        if (middleware.applyBeforeValidation !== beforeValidation) {
            return acc;
        }
        if (middleware.mutates) {
            if (middleware.applied)
                return acc;
            middleware.applied = true;
        }
        if (isPromise(acc)) {
            return acc
                .then(initialObj => Promise.all([initialObj, middleware(initialObj, yargs)]))
                .then(([initialObj, middlewareObj]) => Object.assign(initialObj, middlewareObj));
        }
        else {
            const result = middleware(acc, yargs);
            return isPromise(result)
                ? result.then(middlewareObj => Object.assign(acc, middlewareObj))
                : Object.assign(acc, result);
        }
    }, argv);
}

function maybeAsyncResult(getResult, resultHandler, errorHandler = (err) => {
    throw err;
}) {
    try {
        const result = isFunction(getResult) ? getResult() : getResult;
        return isPromise(result)
            ? result.then((result) => resultHandler(result))
            : resultHandler(result);
    }
    catch (err) {
        return errorHandler(err);
    }
}
function isFunction(arg) {
    return typeof arg === 'function';
}

const DEFAULT_MARKER = /(^\*)|(^\$0)/;
class CommandInstance {
    constructor(usage, validation, globalMiddleware, shim) {
        this.requireCache = new Set();
        this.handlers = {};
        this.aliasMap = {};
        this.frozens = [];
        this.shim = shim;
        this.usage = usage;
        this.globalMiddleware = globalMiddleware;
        this.validation = validation;
    }
    addDirectory(dir, req, callerFile, opts) {
        opts = opts || {};
        this.requireCache.add(callerFile);
        const fullDirPath = this.shim.path.resolve(this.shim.path.dirname(callerFile), dir);
        const files = this.shim.readdirSync(fullDirPath, {
            recursive: opts.recurse ? true : false,
        });
        if (!Array.isArray(opts.extensions))
            opts.extensions = ['js'];
        const visit = typeof opts.visit === 'function' ? opts.visit : (o) => o;
        for (const fileb of files) {
            const file = fileb.toString();
            if (opts.exclude) {
                let exclude = false;
                if (typeof opts.exclude === 'function') {
                    exclude = opts.exclude(file);
                }
                else {
                    exclude = opts.exclude.test(file);
                }
                if (exclude)
                    continue;
            }
            if (opts.include) {
                let include = false;
                if (typeof opts.include === 'function') {
                    include = opts.include(file);
                }
                else {
                    include = opts.include.test(file);
                }
                if (!include)
                    continue;
            }
            let supportedExtension = false;
            for (const ext of opts.extensions) {
                if (file.endsWith(ext))
                    supportedExtension = true;
            }
            if (supportedExtension) {
                const joined = this.shim.path.join(fullDirPath, file);
                const module = req(joined);
                const extendableModule = Object.create(null, Object.getOwnPropertyDescriptors({ ...module }));
                const visited = visit(extendableModule, joined, file);
                if (visited) {
                    if (this.requireCache.has(joined))
                        continue;
                    else
                        this.requireCache.add(joined);
                    if (!extendableModule.command) {
                        extendableModule.command = this.shim.path.basename(joined, this.shim.path.extname(joined));
                    }
                    this.addHandler(extendableModule);
                }
            }
        }
    }
    addHandler(cmd, description, builder, handler, commandMiddleware, deprecated) {
        let aliases = [];
        const middlewares = commandMiddlewareFactory(commandMiddleware);
        handler = handler || (() => { });
        if (Array.isArray(cmd)) {
            if (isCommandAndAliases(cmd)) {
                [cmd, ...aliases] = cmd;
            }
            else {
                for (const command of cmd) {
                    this.addHandler(command);
                }
            }
        }
        else if (isCommandHandlerDefinition(cmd)) {
            let command = Array.isArray(cmd.command) || typeof cmd.command === 'string'
                ? cmd.command
                : null;
            if (command === null) {
                throw new Error(`No command name given for module: ${this.shim.inspect(cmd)}`);
            }
            if (cmd.aliases)
                command = [].concat(command).concat(cmd.aliases);
            this.addHandler(command, this.extractDesc(cmd), cmd.builder, cmd.handler, cmd.middlewares, cmd.deprecated);
            return;
        }
        else if (isCommandBuilderDefinition(builder)) {
            this.addHandler([cmd].concat(aliases), description, builder.builder, builder.handler, builder.middlewares, builder.deprecated);
            return;
        }
        if (typeof cmd === 'string') {
            const parsedCommand = parseCommand(cmd);
            aliases = aliases.map(alias => parseCommand(alias).cmd);
            let isDefault = false;
            const parsedAliases = [parsedCommand.cmd].concat(aliases).filter(c => {
                if (DEFAULT_MARKER.test(c)) {
                    isDefault = true;
                    return false;
                }
                return true;
            });
            if (parsedAliases.length === 0 && isDefault)
                parsedAliases.push('$0');
            if (isDefault) {
                parsedCommand.cmd = parsedAliases[0];
                aliases = parsedAliases.slice(1);
                cmd = cmd.replace(DEFAULT_MARKER, parsedCommand.cmd);
            }
            aliases.forEach(alias => {
                this.aliasMap[alias] = parsedCommand.cmd;
            });
            if (description !== false) {
                this.usage.command(cmd, description, isDefault, aliases, deprecated);
            }
            this.handlers[parsedCommand.cmd] = {
                original: cmd,
                description,
                handler,
                builder: builder || {},
                middlewares,
                deprecated,
                demanded: parsedCommand.demanded,
                optional: parsedCommand.optional,
            };
            if (isDefault)
                this.defaultCommand = this.handlers[parsedCommand.cmd];
        }
    }
    getCommandHandlers() {
        return this.handlers;
    }
    getCommands() {
        return Object.keys(this.handlers).concat(Object.keys(this.aliasMap));
    }
    hasDefaultCommand() {
        return !!this.defaultCommand;
    }
    runCommand(command, yargs, parsed, commandIndex, helpOnly, helpOrVersionSet) {
        const commandHandler = this.handlers[command] ||
            this.handlers[this.aliasMap[command]] ||
            this.defaultCommand;
        const currentContext = yargs.getInternalMethods().getContext();
        const parentCommands = currentContext.commands.slice();
        const isDefaultCommand = !command;
        if (command) {
            currentContext.commands.push(command);
            currentContext.fullCommands.push(commandHandler.original);
        }
        const builderResult = this.applyBuilderUpdateUsageAndParse(isDefaultCommand, commandHandler, yargs, parsed.aliases, parentCommands, commandIndex, helpOnly, helpOrVersionSet);
        return isPromise(builderResult)
            ? builderResult.then(result => this.applyMiddlewareAndGetResult(isDefaultCommand, commandHandler, result.innerArgv, currentContext, helpOnly, result.aliases, yargs))
            : this.applyMiddlewareAndGetResult(isDefaultCommand, commandHandler, builderResult.innerArgv, currentContext, helpOnly, builderResult.aliases, yargs);
    }
    applyBuilderUpdateUsageAndParse(isDefaultCommand, commandHandler, yargs, aliases, parentCommands, commandIndex, helpOnly, helpOrVersionSet) {
        const builder = commandHandler.builder;
        let innerYargs = yargs;
        if (isCommandBuilderCallback(builder)) {
            yargs.getInternalMethods().getUsageInstance().freeze();
            const builderOutput = builder(yargs.getInternalMethods().reset(aliases), helpOrVersionSet);
            if (isPromise(builderOutput)) {
                return builderOutput.then(output => {
                    innerYargs = isYargsInstance(output) ? output : yargs;
                    return this.parseAndUpdateUsage(isDefaultCommand, commandHandler, innerYargs, parentCommands, commandIndex, helpOnly);
                });
            }
        }
        else if (isCommandBuilderOptionDefinitions(builder)) {
            yargs.getInternalMethods().getUsageInstance().freeze();
            innerYargs = yargs.getInternalMethods().reset(aliases);
            Object.keys(commandHandler.builder).forEach(key => {
                innerYargs.option(key, builder[key]);
            });
        }
        return this.parseAndUpdateUsage(isDefaultCommand, commandHandler, innerYargs, parentCommands, commandIndex, helpOnly);
    }
    parseAndUpdateUsage(isDefaultCommand, commandHandler, innerYargs, parentCommands, commandIndex, helpOnly) {
        if (isDefaultCommand)
            innerYargs.getInternalMethods().getUsageInstance().unfreeze(true);
        if (this.shouldUpdateUsage(innerYargs)) {
            innerYargs
                .getInternalMethods()
                .getUsageInstance()
                .usage(this.usageFromParentCommandsCommandHandler(parentCommands, commandHandler), commandHandler.description);
        }
        const innerArgv = innerYargs
            .getInternalMethods()
            .runYargsParserAndExecuteCommands(null, undefined, true, commandIndex, helpOnly);
        return isPromise(innerArgv)
            ? innerArgv.then(argv => ({
                aliases: innerYargs.parsed.aliases,
                innerArgv: argv,
            }))
            : {
                aliases: innerYargs.parsed.aliases,
                innerArgv: innerArgv,
            };
    }
    shouldUpdateUsage(yargs) {
        return (!yargs.getInternalMethods().getUsageInstance().getUsageDisabled() &&
            yargs.getInternalMethods().getUsageInstance().getUsage().length === 0);
    }
    usageFromParentCommandsCommandHandler(parentCommands, commandHandler) {
        const c = DEFAULT_MARKER.test(commandHandler.original)
            ? commandHandler.original.replace(DEFAULT_MARKER, '').trim()
            : commandHandler.original;
        const pc = parentCommands.filter(c => {
            return !DEFAULT_MARKER.test(c);
        });
        pc.push(c);
        return `$0 ${pc.join(' ')}`;
    }
    handleValidationAndGetResult(isDefaultCommand, commandHandler, innerArgv, currentContext, aliases, yargs, middlewares, positionalMap) {
        if (!yargs.getInternalMethods().getHasOutput()) {
            const validation = yargs
                .getInternalMethods()
                .runValidation(aliases, positionalMap, yargs.parsed.error, isDefaultCommand);
            innerArgv = maybeAsyncResult(innerArgv, result => {
                validation(result);
                return result;
            });
        }
        if (commandHandler.handler && !yargs.getInternalMethods().getHasOutput()) {
            yargs.getInternalMethods().setHasOutput();
            const populateDoubleDash = !!yargs.getOptions().configuration['populate--'];
            yargs
                .getInternalMethods()
                .postProcess(innerArgv, populateDoubleDash, false, false);
            innerArgv = applyMiddleware(innerArgv, yargs, middlewares, false);
            innerArgv = maybeAsyncResult(innerArgv, result => {
                const handlerResult = commandHandler.handler(result);
                return isPromise(handlerResult)
                    ? handlerResult.then(() => result)
                    : result;
            });
            if (!isDefaultCommand) {
                yargs.getInternalMethods().getUsageInstance().cacheHelpMessage();
            }
            if (isPromise(innerArgv) &&
                !yargs.getInternalMethods().hasParseCallback()) {
                innerArgv.catch(error => {
                    try {
                        yargs.getInternalMethods().getUsageInstance().fail(null, error);
                    }
                    catch (_err) {
                    }
                });
            }
        }
        if (!isDefaultCommand) {
            currentContext.commands.pop();
            currentContext.fullCommands.pop();
        }
        return innerArgv;
    }
    applyMiddlewareAndGetResult(isDefaultCommand, commandHandler, innerArgv, currentContext, helpOnly, aliases, yargs) {
        let positionalMap = {};
        if (helpOnly)
            return innerArgv;
        if (!yargs.getInternalMethods().getHasOutput()) {
            positionalMap = this.populatePositionals(commandHandler, innerArgv, currentContext, yargs);
        }
        const middlewares = this.globalMiddleware
            .getMiddleware()
            .slice(0)
            .concat(commandHandler.middlewares);
        const maybePromiseArgv = applyMiddleware(innerArgv, yargs, middlewares, true);
        return isPromise(maybePromiseArgv)
            ? maybePromiseArgv.then(resolvedInnerArgv => this.handleValidationAndGetResult(isDefaultCommand, commandHandler, resolvedInnerArgv, currentContext, aliases, yargs, middlewares, positionalMap))
            : this.handleValidationAndGetResult(isDefaultCommand, commandHandler, maybePromiseArgv, currentContext, aliases, yargs, middlewares, positionalMap);
    }
    populatePositionals(commandHandler, argv, context, yargs) {
        argv._ = argv._.slice(context.commands.length);
        const demanded = commandHandler.demanded.slice(0);
        const optional = commandHandler.optional.slice(0);
        const positionalMap = {};
        this.validation.positionalCount(demanded.length, argv._.length);
        while (demanded.length) {
            const demand = demanded.shift();
            this.populatePositional(demand, argv, positionalMap);
        }
        while (optional.length) {
            const maybe = optional.shift();
            this.populatePositional(maybe, argv, positionalMap);
        }
        argv._ = context.commands.concat(argv._.map(a => '' + a));
        this.postProcessPositionals(argv, positionalMap, this.cmdToParseOptions(commandHandler.original), yargs);
        return positionalMap;
    }
    populatePositional(positional, argv, positionalMap) {
        const cmd = positional.cmd[0];
        if (positional.variadic) {
            positionalMap[cmd] = argv._.splice(0).map(String);
        }
        else {
            if (argv._.length)
                positionalMap[cmd] = [String(argv._.shift())];
        }
    }
    cmdToParseOptions(cmdString) {
        const parseOptions = {
            array: [],
            default: {},
            alias: {},
            demand: {},
        };
        const parsed = parseCommand(cmdString);
        parsed.demanded.forEach(d => {
            const [cmd, ...aliases] = d.cmd;
            if (d.variadic) {
                parseOptions.array.push(cmd);
                parseOptions.default[cmd] = [];
            }
            parseOptions.alias[cmd] = aliases;
            parseOptions.demand[cmd] = true;
        });
        parsed.optional.forEach(o => {
            const [cmd, ...aliases] = o.cmd;
            if (o.variadic) {
                parseOptions.array.push(cmd);
                parseOptions.default[cmd] = [];
            }
            parseOptions.alias[cmd] = aliases;
        });
        return parseOptions;
    }
    postProcessPositionals(argv, positionalMap, parseOptions, yargs) {
        const options = Object.assign({}, yargs.getOptions());
        options.default = Object.assign(parseOptions.default, options.default);
        for (const key of Object.keys(parseOptions.alias)) {
            options.alias[key] = (options.alias[key] || []).concat(parseOptions.alias[key]);
        }
        options.array = options.array.concat(parseOptions.array);
        options.config = {};
        const unparsed = [];
        Object.keys(positionalMap).forEach(key => {
            positionalMap[key].map(value => {
                if (options.configuration['unknown-options-as-args'])
                    options.key[key] = true;
                unparsed.push(`--${key}`);
                unparsed.push(value);
            });
        });
        if (!unparsed.length)
            return;
        const config = Object.assign({}, options.configuration, {
            'populate--': false,
        });
        const parsed = this.shim.Parser.detailed(unparsed, Object.assign({}, options, {
            configuration: config,
        }));
        if (parsed.error) {
            yargs
                .getInternalMethods()
                .getUsageInstance()
                .fail(parsed.error.message, parsed.error);
        }
        else {
            const positionalKeys = Object.keys(positionalMap);
            Object.keys(positionalMap).forEach(key => {
                positionalKeys.push(...parsed.aliases[key]);
            });
            Object.keys(parsed.argv).forEach(key => {
                if (positionalKeys.includes(key)) {
                    if (!positionalMap[key])
                        positionalMap[key] = parsed.argv[key];
                    if (!this.isInConfigs(yargs, key) &&
                        !this.isDefaulted(yargs, key) &&
                        Object.prototype.hasOwnProperty.call(argv, key) &&
                        Object.prototype.hasOwnProperty.call(parsed.argv, key) &&
                        (Array.isArray(argv[key]) || Array.isArray(parsed.argv[key]))) {
                        argv[key] = [].concat(argv[key], parsed.argv[key]);
                    }
                    else {
                        argv[key] = parsed.argv[key];
                    }
                }
            });
        }
    }
    isDefaulted(yargs, key) {
        const { default: defaults } = yargs.getOptions();
        return (Object.prototype.hasOwnProperty.call(defaults, key) ||
            Object.prototype.hasOwnProperty.call(defaults, this.shim.Parser.camelCase(key)));
    }
    isInConfigs(yargs, key) {
        const { configObjects } = yargs.getOptions();
        return (configObjects.some(c => Object.prototype.hasOwnProperty.call(c, key)) ||
            configObjects.some(c => Object.prototype.hasOwnProperty.call(c, this.shim.Parser.camelCase(key))));
    }
    runDefaultBuilderOn(yargs) {
        if (!this.defaultCommand)
            return;
        if (this.shouldUpdateUsage(yargs)) {
            const commandString = DEFAULT_MARKER.test(this.defaultCommand.original)
                ? this.defaultCommand.original
                : this.defaultCommand.original.replace(/^[^[\]<>]*/, '$0 ');
            yargs
                .getInternalMethods()
                .getUsageInstance()
                .usage(commandString, this.defaultCommand.description);
        }
        const builder = this.defaultCommand.builder;
        if (isCommandBuilderCallback(builder)) {
            return builder(yargs, true);
        }
        else if (!isCommandBuilderDefinition(builder)) {
            Object.keys(builder).forEach(key => {
                yargs.option(key, builder[key]);
            });
        }
        return undefined;
    }
    extractDesc({ describe, description, desc }) {
        for (const test of [describe, description, desc]) {
            if (typeof test === 'string' || test === false)
                return test;
            assertNotStrictEqual(test, true, this.shim);
        }
        return false;
    }
    freeze() {
        this.frozens.push({
            handlers: this.handlers,
            aliasMap: this.aliasMap,
            defaultCommand: this.defaultCommand,
        });
    }
    unfreeze() {
        const frozen = this.frozens.pop();
        assertNotStrictEqual(frozen, undefined, this.shim);
        ({
            handlers: this.handlers,
            aliasMap: this.aliasMap,
            defaultCommand: this.defaultCommand,
        } = frozen);
    }
    reset() {
        this.handlers = {};
        this.aliasMap = {};
        this.defaultCommand = undefined;
        this.requireCache = new Set();
        return this;
    }
}
function command(usage, validation, globalMiddleware, shim) {
    return new CommandInstance(usage, validation, globalMiddleware, shim);
}
function isCommandBuilderDefinition(builder) {
    return (typeof builder === 'object' &&
        !!builder.builder &&
        typeof builder.handler === 'function');
}
function isCommandAndAliases(cmd) {
    return cmd.every(c => typeof c === 'string');
}
function isCommandBuilderCallback(builder) {
    return typeof builder === 'function';
}
function isCommandBuilderOptionDefinitions(builder) {
    return typeof builder === 'object';
}
function isCommandHandlerDefinition(cmd) {
    return typeof cmd === 'object' && !Array.isArray(cmd);
}

function objFilter(original = {}, filter = () => true) {
    const obj = {};
    objectKeys(original).forEach(key => {
        if (filter(key, original[key])) {
            obj[key] = original[key];
        }
    });
    return obj;
}

function setBlocking(blocking) {
    if (typeof process === 'undefined')
        return;
    [process.stdout, process.stderr].forEach(_stream => {
        const stream = _stream;
        if (stream._handle &&
            stream.isTTY &&
            typeof stream._handle.setBlocking === 'function') {
            stream._handle.setBlocking(blocking);
        }
    });
}

function isBoolean(fail) {
    return typeof fail === 'boolean';
}
function usage(yargs, shim) {
    const __ = shim.y18n.__;
    const self = {};
    const fails = [];
    self.failFn = function failFn(f) {
        fails.push(f);
    };
    let failMessage = null;
    let globalFailMessage = null;
    let showHelpOnFail = true;
    self.showHelpOnFail = function showHelpOnFailFn(arg1 = true, arg2) {
        const [enabled, message] = typeof arg1 === 'string' ? [true, arg1] : [arg1, arg2];
        if (yargs.getInternalMethods().isGlobalContext()) {
            globalFailMessage = message;
        }
        failMessage = message;
        showHelpOnFail = enabled;
        return self;
    };
    let failureOutput = false;
    self.fail = function fail(msg, err) {
        const logger = yargs.getInternalMethods().getLoggerInstance();
        if (fails.length) {
            for (let i = fails.length - 1; i >= 0; --i) {
                const fail = fails[i];
                if (isBoolean(fail)) {
                    if (err)
                        throw err;
                    else if (msg)
                        throw Error(msg);
                }
                else {
                    fail(msg, err, self);
                }
            }
        }
        else {
            if (yargs.getExitProcess())
                setBlocking(true);
            if (!failureOutput) {
                failureOutput = true;
                if (showHelpOnFail) {
                    yargs.showHelp('error');
                    logger.error();
                }
                if (msg || err)
                    logger.error(msg || err);
                const globalOrCommandFailMessage = failMessage || globalFailMessage;
                if (globalOrCommandFailMessage) {
                    if (msg || err)
                        logger.error('');
                    logger.error(globalOrCommandFailMessage);
                }
            }
            err = err || new YError(msg);
            if (yargs.getExitProcess()) {
                return yargs.exit(1);
            }
            else if (yargs.getInternalMethods().hasParseCallback()) {
                return yargs.exit(1, err);
            }
            else {
                throw err;
            }
        }
    };
    let usages = [];
    let usageDisabled = false;
    self.usage = (msg, description) => {
        if (msg === null) {
            usageDisabled = true;
            usages = [];
            return self;
        }
        usageDisabled = false;
        usages.push([msg, description || '']);
        return self;
    };
    self.getUsage = () => {
        return usages;
    };
    self.getUsageDisabled = () => {
        return usageDisabled;
    };
    self.getPositionalGroupName = () => {
        return __('Positionals:');
    };
    let examples = [];
    self.example = (cmd, description) => {
        examples.push([cmd, description || '']);
    };
    let commands = [];
    self.command = function command(cmd, description, isDefault, aliases, deprecated = false) {
        if (isDefault) {
            commands = commands.map(cmdArray => {
                cmdArray[2] = false;
                return cmdArray;
            });
        }
        commands.push([cmd, description || '', isDefault, aliases, deprecated]);
    };
    self.getCommands = () => commands;
    let descriptions = {};
    self.describe = function describe(keyOrKeys, desc) {
        if (Array.isArray(keyOrKeys)) {
            keyOrKeys.forEach(k => {
                self.describe(k, desc);
            });
        }
        else if (typeof keyOrKeys === 'object') {
            Object.keys(keyOrKeys).forEach(k => {
                self.describe(k, keyOrKeys[k]);
            });
        }
        else {
            descriptions[keyOrKeys] = desc;
        }
    };
    self.getDescriptions = () => descriptions;
    let epilogs = [];
    self.epilog = msg => {
        epilogs.push(msg);
    };
    let wrapSet = false;
    let wrap;
    self.wrap = cols => {
        wrapSet = true;
        wrap = cols;
    };
    self.getWrap = () => {
        if (shim.getEnv('YARGS_DISABLE_WRAP')) {
            return null;
        }
        if (!wrapSet) {
            wrap = windowWidth();
            wrapSet = true;
        }
        return wrap;
    };
    const deferY18nLookupPrefix = '__yargsString__:';
    self.deferY18nLookup = str => deferY18nLookupPrefix + str;
    self.help = function help() {
        if (cachedHelpMessage)
            return cachedHelpMessage;
        normalizeAliases();
        const base$0 = yargs.customScriptName
            ? yargs.$0
            : shim.path.basename(yargs.$0);
        const demandedOptions = yargs.getDemandedOptions();
        const demandedCommands = yargs.getDemandedCommands();
        const deprecatedOptions = yargs.getDeprecatedOptions();
        const groups = yargs.getGroups();
        const options = yargs.getOptions();
        let keys = [];
        keys = keys.concat(Object.keys(descriptions));
        keys = keys.concat(Object.keys(demandedOptions));
        keys = keys.concat(Object.keys(demandedCommands));
        keys = keys.concat(Object.keys(options.default));
        keys = keys.filter(filterHiddenOptions);
        keys = Object.keys(keys.reduce((acc, key) => {
            if (key !== '_')
                acc[key] = true;
            return acc;
        }, {}));
        const theWrap = self.getWrap();
        const ui = shim.cliui({
            width: theWrap,
            wrap: !!theWrap,
        });
        if (!usageDisabled) {
            if (usages.length) {
                usages.forEach(usage => {
                    ui.div({ text: `${usage[0].replace(/\$0/g, base$0)}` });
                    if (usage[1]) {
                        ui.div({ text: `${usage[1]}`, padding: [1, 0, 0, 0] });
                    }
                });
                ui.div();
            }
            else if (commands.length) {
                let u = null;
                if (demandedCommands._) {
                    u = `${base$0} <${__('command')}>\n`;
                }
                else {
                    u = `${base$0} [${__('command')}]\n`;
                }
                ui.div(`${u}`);
            }
        }
        if (commands.length > 1 || (commands.length === 1 && !commands[0][2])) {
            ui.div(__('Commands:'));
            const context = yargs.getInternalMethods().getContext();
            const parentCommands = context.commands.length
                ? `${context.commands.join(' ')} `
                : '';
            if (yargs.getInternalMethods().getParserConfiguration()['sort-commands'] ===
                true) {
                commands = commands.sort((a, b) => a[0].localeCompare(b[0]));
            }
            const prefix = base$0 ? `${base$0} ` : '';
            commands.forEach(command => {
                const commandString = `${prefix}${parentCommands}${command[0].replace(/^\$0 ?/, '')}`;
                ui.span({
                    text: commandString,
                    padding: [0, 2, 0, 2],
                    width: maxWidth(commands, theWrap, `${base$0}${parentCommands}`) + 4,
                }, { text: command[1] });
                const hints = [];
                if (command[2])
                    hints.push(`[${__('default')}]`);
                if (command[3] && command[3].length) {
                    hints.push(`[${__('aliases:')} ${command[3].join(', ')}]`);
                }
                if (command[4]) {
                    if (typeof command[4] === 'string') {
                        hints.push(`[${__('deprecated: %s', command[4])}]`);
                    }
                    else {
                        hints.push(`[${__('deprecated')}]`);
                    }
                }
                if (hints.length) {
                    ui.div({
                        text: hints.join(' '),
                        padding: [0, 0, 0, 2],
                        align: 'right',
                    });
                }
                else {
                    ui.div();
                }
            });
            ui.div();
        }
        const aliasKeys = (Object.keys(options.alias) || []).concat(Object.keys(yargs.parsed.newAliases) || []);
        keys = keys.filter(key => !yargs.parsed.newAliases[key] &&
            aliasKeys.every(alias => (options.alias[alias] || []).indexOf(key) === -1));
        const defaultGroup = __('Options:');
        if (!groups[defaultGroup])
            groups[defaultGroup] = [];
        addUngroupedKeys(keys, options.alias, groups, defaultGroup);
        const isLongSwitch = (sw) => /^--/.test(getText(sw));
        const displayedGroups = Object.keys(groups)
            .filter(groupName => groups[groupName].length > 0)
            .map(groupName => {
            const normalizedKeys = groups[groupName]
                .filter(filterHiddenOptions)
                .map(key => {
                if (aliasKeys.includes(key))
                    return key;
                for (let i = 0, aliasKey; (aliasKey = aliasKeys[i]) !== undefined; i++) {
                    if ((options.alias[aliasKey] || []).includes(key))
                        return aliasKey;
                }
                return key;
            });
            return { groupName, normalizedKeys };
        })
            .filter(({ normalizedKeys }) => normalizedKeys.length > 0)
            .map(({ groupName, normalizedKeys }) => {
            const switches = normalizedKeys.reduce((acc, key) => {
                acc[key] = [key]
                    .concat(options.alias[key] || [])
                    .map(sw => {
                    if (groupName === self.getPositionalGroupName())
                        return sw;
                    else {
                        return ((/^[0-9]$/.test(sw)
                            ? options.boolean.includes(key)
                                ? '-'
                                : '--'
                            : sw.length > 1
                                ? '--'
                                : '-') + sw);
                    }
                })
                    .sort((sw1, sw2) => isLongSwitch(sw1) === isLongSwitch(sw2)
                    ? 0
                    : isLongSwitch(sw1)
                        ? 1
                        : -1)
                    .join(', ');
                return acc;
            }, {});
            return { groupName, normalizedKeys, switches };
        });
        const shortSwitchesUsed = displayedGroups
            .filter(({ groupName }) => groupName !== self.getPositionalGroupName())
            .some(({ normalizedKeys, switches }) => !normalizedKeys.every(key => isLongSwitch(switches[key])));
        if (shortSwitchesUsed) {
            displayedGroups
                .filter(({ groupName }) => groupName !== self.getPositionalGroupName())
                .forEach(({ normalizedKeys, switches }) => {
                normalizedKeys.forEach(key => {
                    if (isLongSwitch(switches[key])) {
                        switches[key] = addIndentation(switches[key], '-x, '.length);
                    }
                });
            });
        }
        displayedGroups.forEach(({ groupName, normalizedKeys, switches }) => {
            ui.div(groupName);
            normalizedKeys.forEach(key => {
                const kswitch = switches[key];
                let desc = descriptions[key] || '';
                let type = null;
                if (desc.includes(deferY18nLookupPrefix))
                    desc = __(desc.substring(deferY18nLookupPrefix.length));
                if (options.boolean.includes(key))
                    type = `[${__('boolean')}]`;
                if (options.count.includes(key))
                    type = `[${__('count')}]`;
                if (options.string.includes(key))
                    type = `[${__('string')}]`;
                if (options.normalize.includes(key))
                    type = `[${__('string')}]`;
                if (options.array.includes(key))
                    type = `[${__('array')}]`;
                if (options.number.includes(key))
                    type = `[${__('number')}]`;
                const deprecatedExtra = (deprecated) => typeof deprecated === 'string'
                    ? `[${__('deprecated: %s', deprecated)}]`
                    : `[${__('deprecated')}]`;
                const extra = [
                    key in deprecatedOptions
                        ? deprecatedExtra(deprecatedOptions[key])
                        : null,
                    type,
                    key in demandedOptions ? `[${__('required')}]` : null,
                    options.choices && options.choices[key]
                        ? `[${__('choices:')} ${self.stringifiedValues(options.choices[key])}]`
                        : null,
                    defaultString(options.default[key], options.defaultDescription[key]),
                ]
                    .filter(Boolean)
                    .join(' ');
                ui.span({
                    text: getText(kswitch),
                    padding: [0, 2, 0, 2 + getIndentation(kswitch)],
                    width: maxWidth(switches, theWrap) + 4,
                }, desc);
                const shouldHideOptionExtras = yargs.getInternalMethods().getUsageConfiguration()['hide-types'] ===
                    true;
                if (extra && !shouldHideOptionExtras)
                    ui.div({ text: extra, padding: [0, 0, 0, 2], align: 'right' });
                else
                    ui.div();
            });
            ui.div();
        });
        if (examples.length) {
            ui.div(__('Examples:'));
            examples.forEach(example => {
                example[0] = example[0].replace(/\$0/g, base$0);
            });
            examples.forEach(example => {
                if (example[1] === '') {
                    ui.div({
                        text: example[0],
                        padding: [0, 2, 0, 2],
                    });
                }
                else {
                    ui.div({
                        text: example[0],
                        padding: [0, 2, 0, 2],
                        width: maxWidth(examples, theWrap) + 4,
                    }, {
                        text: example[1],
                    });
                }
            });
            ui.div();
        }
        if (epilogs.length > 0) {
            const e = epilogs
                .map(epilog => epilog.replace(/\$0/g, base$0))
                .join('\n');
            ui.div(`${e}\n`);
        }
        return ui.toString().replace(/\s*$/, '');
    };
    function maxWidth(table, theWrap, modifier) {
        let width = 0;
        if (!Array.isArray(table)) {
            table = Object.values(table).map(v => [v]);
        }
        table.forEach(v => {
            width = Math.max(shim.stringWidth(modifier ? `${modifier} ${getText(v[0])}` : getText(v[0])) + getIndentation(v[0]), width);
        });
        if (theWrap)
            width = Math.min(width, parseInt((theWrap * 0.5).toString(), 10));
        return width;
    }
    function normalizeAliases() {
        const demandedOptions = yargs.getDemandedOptions();
        const options = yargs.getOptions();
        (Object.keys(options.alias) || []).forEach(key => {
            options.alias[key].forEach(alias => {
                if (descriptions[alias])
                    self.describe(key, descriptions[alias]);
                if (alias in demandedOptions)
                    yargs.demandOption(key, demandedOptions[alias]);
                if (options.boolean.includes(alias))
                    yargs.boolean(key);
                if (options.count.includes(alias))
                    yargs.count(key);
                if (options.string.includes(alias))
                    yargs.string(key);
                if (options.normalize.includes(alias))
                    yargs.normalize(key);
                if (options.array.includes(alias))
                    yargs.array(key);
                if (options.number.includes(alias))
                    yargs.number(key);
            });
        });
    }
    let cachedHelpMessage;
    self.cacheHelpMessage = function () {
        cachedHelpMessage = this.help();
    };
    self.clearCachedHelpMessage = function () {
        cachedHelpMessage = undefined;
    };
    self.hasCachedHelpMessage = function () {
        return !!cachedHelpMessage;
    };
    function addUngroupedKeys(keys, aliases, groups, defaultGroup) {
        let groupedKeys = [];
        let toCheck = null;
        Object.keys(groups).forEach(group => {
            groupedKeys = groupedKeys.concat(groups[group]);
        });
        keys.forEach(key => {
            toCheck = [key].concat(aliases[key]);
            if (!toCheck.some(k => groupedKeys.indexOf(k) !== -1)) {
                groups[defaultGroup].push(key);
            }
        });
        return groupedKeys;
    }
    function filterHiddenOptions(key) {
        return (yargs.getOptions().hiddenOptions.indexOf(key) < 0 ||
            yargs.parsed.argv[yargs.getOptions().showHiddenOpt]);
    }
    self.showHelp = (level) => {
        const logger = yargs.getInternalMethods().getLoggerInstance();
        if (!level)
            level = 'error';
        const emit = typeof level === 'function' ? level : logger[level];
        emit(self.help());
    };
    self.functionDescription = fn => {
        const description = fn.name
            ? shim.Parser.decamelize(fn.name, '-')
            : __('generated-value');
        return ['(', description, ')'].join('');
    };
    self.stringifiedValues = function stringifiedValues(values, separator) {
        let string = '';
        const sep = separator || ', ';
        const array = [].concat(values);
        if (!values || !array.length)
            return string;
        array.forEach(value => {
            if (string.length)
                string += sep;
            string += JSON.stringify(value);
        });
        return string;
    };
    function defaultString(value, defaultDescription) {
        let string = `[${__('default:')} `;
        if (value === undefined && !defaultDescription)
            return null;
        if (defaultDescription) {
            string += defaultDescription;
        }
        else {
            switch (typeof value) {
                case 'string':
                    string += `"${value}"`;
                    break;
                case 'object':
                    string += JSON.stringify(value);
                    break;
                default:
                    string += value;
            }
        }
        return `${string}]`;
    }
    function windowWidth() {
        const maxWidth = 80;
        if (shim.process.stdColumns) {
            return Math.min(maxWidth, shim.process.stdColumns);
        }
        else {
            return maxWidth;
        }
    }
    let version = null;
    self.version = ver => {
        version = ver;
    };
    self.showVersion = level => {
        const logger = yargs.getInternalMethods().getLoggerInstance();
        if (!level)
            level = 'error';
        const emit = typeof level === 'function' ? level : logger[level];
        emit(version);
    };
    self.reset = function reset(localLookup) {
        failMessage = null;
        failureOutput = false;
        usages = [];
        usageDisabled = false;
        epilogs = [];
        examples = [];
        commands = [];
        descriptions = objFilter(descriptions, k => !localLookup[k]);
        return self;
    };
    const frozens = [];
    self.freeze = function freeze() {
        frozens.push({
            failMessage,
            failureOutput,
            usages,
            usageDisabled,
            epilogs,
            examples,
            commands,
            descriptions,
        });
    };
    self.unfreeze = function unfreeze(defaultCommand = false) {
        const frozen = frozens.pop();
        if (!frozen)
            return;
        if (defaultCommand) {
            descriptions = { ...frozen.descriptions, ...descriptions };
            commands = [...frozen.commands, ...commands];
            usages = [...frozen.usages, ...usages];
            examples = [...frozen.examples, ...examples];
            epilogs = [...frozen.epilogs, ...epilogs];
        }
        else {
            ({
                failMessage,
                failureOutput,
                usages,
                usageDisabled,
                epilogs,
                examples,
                commands,
                descriptions,
            } = frozen);
        }
    };
    return self;
}
function isIndentedText(text) {
    return typeof text === 'object';
}
function addIndentation(text, indent) {
    return isIndentedText(text)
        ? { text: text.text, indentation: text.indentation + indent }
        : { text, indentation: indent };
}
function getIndentation(text) {
    return isIndentedText(text) ? text.indentation : 0;
}
function getText(text) {
    return isIndentedText(text) ? text.text : text;
}

const completionShTemplate = `###-begin-{{app_name}}-completions-###
#
# yargs command completion script
#
# Installation: {{app_path}} {{completion_command}} >> ~/.bashrc
#    or {{app_path}} {{completion_command}} >> ~/.bash_profile on OSX.
#
_{{app_name}}_yargs_completions()
{
    local cur_word args type_list

    cur_word="\${COMP_WORDS[COMP_CWORD]}"
    args=("\${COMP_WORDS[@]}")

    # ask yargs to generate completions.
    # see https://stackoverflow.com/a/40944195/7080036 for the spaces-handling awk
    mapfile -t type_list < <({{app_path}} --get-yargs-completions "\${args[@]}")
    mapfile -t COMPREPLY < <(compgen -W "$( printf '%q ' "\${type_list[@]}" )" -- "\${cur_word}" |
        awk '/ / { print "\\""$0"\\"" } /^[^ ]+$/ { print $0 }')

    # if no match was found, fall back to filename completion
    if [ \${#COMPREPLY[@]} -eq 0 ]; then
      COMPREPLY=()
    fi

    return 0
}
complete -o bashdefault -o default -F _{{app_name}}_yargs_completions {{app_name}}
###-end-{{app_name}}-completions-###
`;
const completionZshTemplate = `#compdef {{app_name}}
###-begin-{{app_name}}-completions-###
#
# yargs command completion script
#
# Installation: {{app_path}} {{completion_command}} >> ~/.zshrc
#    or {{app_path}} {{completion_command}} >> ~/.zprofile on OSX.
#
_{{app_name}}_yargs_completions()
{
  local reply
  local si=$IFS
  IFS=$'\n' reply=($(COMP_CWORD="$((CURRENT-1))" COMP_LINE="$BUFFER" COMP_POINT="$CURSOR" {{app_path}} --get-yargs-completions "\${words[@]}"))
  IFS=$si
  if [[ \${#reply} -gt 0 ]]; then
    _describe 'values' reply
  else
    _default
  fi
}
if [[ "\${zsh_eval_context[-1]}" == "loadautofunc" ]]; then
  _{{app_name}}_yargs_completions "$@"
else
  compdef _{{app_name}}_yargs_completions {{app_name}}
fi
###-end-{{app_name}}-completions-###
`;
const completionFishTemplate = `###-begin-{{app_name}}-completions-###
#
# yargs command completion script
#
# Installation: {{app_path}} {{completion_command}} > ~/.config/fish/completions/{{app_name}}.fish
#
complete -f -c {{app_name}} -a '({{app_path}} --get-yargs-completions (commandline -o)[2..-1])'
###-end-{{app_name}}-completions-###
`;

class Completion {
    constructor(yargs, usage, command, shim) {
        var _a, _b, _c, _d, _e;
        this.yargs = yargs;
        this.usage = usage;
        this.command = command;
        this.shim = shim;
        this.completionKey = 'get-yargs-completions';
        this.aliases = null;
        this.customCompletionFunction = null;
        this.indexAfterLastReset = 0;
        this.zshShell =
            (_c = (((_a = this.shim.getEnv('SHELL')) === null || _a === void 0 ? void 0 : _a.includes('zsh')) ||
                ((_b = this.shim.getEnv('ZSH_NAME')) === null || _b === void 0 ? void 0 : _b.includes('zsh')))) !== null && _c !== void 0 ? _c : false;
        this.fishShell = (_e = (_d = this.shim.getEnv('SHELL')) === null || _d === void 0 ? void 0 : _d.includes('fish')) !== null && _e !== void 0 ? _e : false;
    }
    defaultCompletion(args, argv, current, done) {
        const handlers = this.command.getCommandHandlers();
        for (let i = 0, ii = args.length; i < ii; ++i) {
            if (handlers[args[i]] && handlers[args[i]].builder) {
                const builder = handlers[args[i]].builder;
                if (isCommandBuilderCallback(builder)) {
                    this.indexAfterLastReset = i + 1;
                    const y = this.yargs.getInternalMethods().reset();
                    builder(y, true);
                    return y.argv;
                }
            }
        }
        const completions = [];
        this.commandCompletions(completions, args, current);
        this.optionCompletions(completions, args, argv, current);
        this.choicesFromOptionsCompletions(completions, args, argv, current);
        this.choicesFromPositionalsCompletions(completions, args, argv, current);
        done(null, completions);
    }
    commandCompletions(completions, args, current) {
        const parentCommands = this.yargs
            .getInternalMethods()
            .getContext().commands;
        if (!current.match(/^-/) &&
            parentCommands[parentCommands.length - 1] !== current &&
            !this.previousArgHasChoices(args)) {
            this.usage.getCommands().forEach(usageCommand => {
                const commandName = parseCommand(usageCommand[0]).cmd;
                if (args.indexOf(commandName) === -1) {
                    const desc = usageCommand[1] || '';
                    if (this.fishShell) {
                        completions.push(commandName + '\t' + desc);
                    }
                    else if (this.zshShell) {
                        completions.push(commandName.replace(/:/g, '\\:') + ':' + desc);
                    }
                    else {
                        completions.push(commandName);
                    }
                }
            });
        }
    }
    optionCompletions(completions, args, argv, current) {
        if ((current.match(/^-/) || (current === '' && completions.length === 0)) &&
            !this.previousArgHasChoices(args)) {
            const options = this.yargs.getOptions();
            const positionalKeys = this.yargs.getGroups()[this.usage.getPositionalGroupName()] || [];
            Object.keys(options.key).forEach(key => {
                const negable = !!options.configuration['boolean-negation'] &&
                    options.boolean.includes(key);
                const isPositionalKey = positionalKeys.includes(key);
                if (!isPositionalKey &&
                    !options.hiddenOptions.includes(key) &&
                    !this.argsContainKey(args, key, negable)) {
                    this.completeOptionKey(key, completions, current, negable && !!options.default[key]);
                }
            });
        }
    }
    choicesFromOptionsCompletions(completions, args, argv, current) {
        if (this.previousArgHasChoices(args)) {
            const choices = this.getPreviousArgChoices(args);
            if (choices && choices.length > 0) {
                if (this.fishShell) {
                    completions.push(...choices);
                }
                else {
                    completions.push(...choices.map(c => c.replace(/:/g, '\\:')));
                }
            }
        }
    }
    choicesFromPositionalsCompletions(completions, args, argv, current) {
        if (current === '' &&
            completions.length > 0 &&
            this.previousArgHasChoices(args)) {
            return;
        }
        const positionalKeys = this.yargs.getGroups()[this.usage.getPositionalGroupName()] || [];
        const offset = Math.max(this.indexAfterLastReset, this.yargs.getInternalMethods().getContext().commands.length +
            1);
        const positionalKey = positionalKeys[argv._.length - offset - 1];
        if (!positionalKey) {
            return;
        }
        const choices = this.yargs.getOptions().choices[positionalKey] || [];
        for (const choice of choices) {
            if (choice.startsWith(current)) {
                if (this.fishShell) {
                    completions.push(choice);
                }
                else {
                    completions.push(choice.replace(/:/g, '\\:'));
                }
            }
        }
    }
    getPreviousArgChoices(args) {
        if (args.length < 1)
            return;
        let previousArg = args[args.length - 1];
        let filter = '';
        if (!previousArg.startsWith('-') && args.length > 1) {
            filter = previousArg;
            previousArg = args[args.length - 2];
        }
        if (!previousArg.startsWith('-'))
            return;
        const previousArgKey = previousArg.replace(/^-+/, '');
        const options = this.yargs.getOptions();
        const possibleAliases = [
            previousArgKey,
            ...(this.yargs.getAliases()[previousArgKey] || []),
        ];
        let choices;
        for (const possibleAlias of possibleAliases) {
            if (Object.prototype.hasOwnProperty.call(options.key, possibleAlias) &&
                Array.isArray(options.choices[possibleAlias])) {
                choices = options.choices[possibleAlias];
                break;
            }
        }
        if (choices) {
            return choices.filter(choice => !filter || choice.startsWith(filter));
        }
    }
    previousArgHasChoices(args) {
        const choices = this.getPreviousArgChoices(args);
        return choices !== undefined && choices.length > 0;
    }
    argsContainKey(args, key, negable) {
        const argsContains = (s) => args.indexOf((/^[^0-9]$/.test(s) ? '-' : '--') + s) !== -1;
        if (argsContains(key))
            return true;
        if (negable && argsContains(`no-${key}`))
            return true;
        if (this.aliases) {
            for (const alias of this.aliases[key]) {
                if (argsContains(alias))
                    return true;
            }
        }
        return false;
    }
    completeOptionKey(key, completions, current, negable) {
        var _a, _b, _c, _d;
        let keyWithDesc = key;
        if (this.zshShell || this.fishShell) {
            const descs = this.usage.getDescriptions();
            const aliasKey = (_b = (_a = this === null || this === void 0 ? void 0 : this.aliases) === null || _a === void 0 ? void 0 : _a[key]) === null || _b === void 0 ? void 0 : _b.find(alias => {
                const desc = descs[alias];
                return typeof desc === 'string' && desc.length > 0;
            });
            const descFromAlias = aliasKey ? descs[aliasKey] : undefined;
            const desc = (_d = (_c = descs[key]) !== null && _c !== void 0 ? _c : descFromAlias) !== null && _d !== void 0 ? _d : '';
            const cleanedDesc = desc
                .replace('__yargsString__:', '')
                .replace(/(\r\n|\n|\r)/gm, ' ');
            if (this.fishShell) {
                keyWithDesc = `${key}\t${cleanedDesc}`;
            }
            else {
                keyWithDesc = `${key.replace(/:/g, '\\:')}:${cleanedDesc}`;
            }
        }
        const startsByTwoDashes = (s) => /^--/.test(s);
        const isShortOption = (s) => /^[^0-9]$/.test(s);
        const dashes = !startsByTwoDashes(current) && isShortOption(key) ? '-' : '--';
        completions.push(dashes + keyWithDesc);
        if (negable) {
            completions.push(dashes + 'no-' + keyWithDesc);
        }
    }
    customCompletion(args, argv, current, done) {
        assertNotStrictEqual(this.customCompletionFunction, null, this.shim);
        if (isSyncCompletionFunction(this.customCompletionFunction)) {
            const result = this.customCompletionFunction(current, argv);
            if (isPromise(result)) {
                return result
                    .then(list => {
                    this.shim.process.nextTick(() => {
                        done(null, list);
                    });
                })
                    .catch(err => {
                    this.shim.process.nextTick(() => {
                        done(err, undefined);
                    });
                });
            }
            return done(null, result);
        }
        else if (isFallbackCompletionFunction(this.customCompletionFunction)) {
            return this.customCompletionFunction(current, argv, (onCompleted = done) => this.defaultCompletion(args, argv, current, onCompleted), completions => {
                done(null, completions);
            });
        }
        else {
            return this.customCompletionFunction(current, argv, completions => {
                done(null, completions);
            });
        }
    }
    getCompletion(args, done) {
        const current = args.length ? args[args.length - 1] : '';
        const argv = this.yargs.parse(args, true);
        const completionFunction = this.customCompletionFunction
            ? (argv) => this.customCompletion(args, argv, current, done)
            : (argv) => this.defaultCompletion(args, argv, current, done);
        return isPromise(argv)
            ? argv.then(completionFunction)
            : completionFunction(argv);
    }
    generateCompletionScript($0, cmd) {
        let script;
        if (this.zshShell) {
            script = completionZshTemplate;
        }
        else if (this.fishShell) {
            script = completionFishTemplate;
        }
        else {
            script = completionShTemplate;
        }
        const name = this.shim.path.basename($0);
        if ($0.match(/\.js$/))
            $0 = `./${$0}`;
        script = script.replace(/{{app_name}}/g, name);
        script = script.replace(/{{completion_command}}/g, cmd);
        return script.replace(/{{app_path}}/g, $0);
    }
    registerFunction(fn) {
        this.customCompletionFunction = fn;
    }
    setParsed(parsed) {
        this.aliases = parsed.aliases;
    }
}
function completion(yargs, usage, command, shim) {
    return new Completion(yargs, usage, command, shim);
}
function isSyncCompletionFunction(completionFunction) {
    return completionFunction.length < 3;
}
function isFallbackCompletionFunction(completionFunction) {
    return completionFunction.length > 3;
}

function levenshtein(a, b) {
    if (a.length === 0)
        return b.length;
    if (b.length === 0)
        return a.length;
    const matrix = [];
    let i;
    for (i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    let j;
    for (j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    for (i = 1; i <= b.length; i++) {
        for (j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            }
            else {
                if (i > 1 &&
                    j > 1 &&
                    b.charAt(i - 2) === a.charAt(j - 1) &&
                    b.charAt(i - 1) === a.charAt(j - 2)) {
                    matrix[i][j] = matrix[i - 2][j - 2] + 1;
                }
                else {
                    matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
                }
            }
        }
    }
    return matrix[b.length][a.length];
}

const specialKeys = ['$0', '--', '_'];
function validation(yargs, usage, shim) {
    const __ = shim.y18n.__;
    const __n = shim.y18n.__n;
    const self = {};
    self.nonOptionCount = function nonOptionCount(argv) {
        const demandedCommands = yargs.getDemandedCommands();
        const positionalCount = argv._.length + (argv['--'] ? argv['--'].length : 0);
        const _s = positionalCount - yargs.getInternalMethods().getContext().commands.length;
        if (demandedCommands._ &&
            (_s < demandedCommands._.min || _s > demandedCommands._.max)) {
            if (_s < demandedCommands._.min) {
                if (demandedCommands._.minMsg !== undefined) {
                    usage.fail(demandedCommands._.minMsg
                        ? demandedCommands._.minMsg
                            .replace(/\$0/g, _s.toString())
                            .replace(/\$1/, demandedCommands._.min.toString())
                        : null);
                }
                else {
                    usage.fail(__n('Not enough non-option arguments: got %s, need at least %s', 'Not enough non-option arguments: got %s, need at least %s', _s, _s.toString(), demandedCommands._.min.toString()));
                }
            }
            else if (_s > demandedCommands._.max) {
                if (demandedCommands._.maxMsg !== undefined) {
                    usage.fail(demandedCommands._.maxMsg
                        ? demandedCommands._.maxMsg
                            .replace(/\$0/g, _s.toString())
                            .replace(/\$1/, demandedCommands._.max.toString())
                        : null);
                }
                else {
                    usage.fail(__n('Too many non-option arguments: got %s, maximum of %s', 'Too many non-option arguments: got %s, maximum of %s', _s, _s.toString(), demandedCommands._.max.toString()));
                }
            }
        }
    };
    self.positionalCount = function positionalCount(required, observed) {
        if (observed < required) {
            usage.fail(__n('Not enough non-option arguments: got %s, need at least %s', 'Not enough non-option arguments: got %s, need at least %s', observed, observed + '', required + ''));
        }
    };
    self.requiredArguments = function requiredArguments(argv, demandedOptions) {
        let missing = null;
        for (const key of Object.keys(demandedOptions)) {
            if (!Object.prototype.hasOwnProperty.call(argv, key) ||
                typeof argv[key] === 'undefined') {
                missing = missing || {};
                missing[key] = demandedOptions[key];
            }
        }
        if (missing) {
            const customMsgs = [];
            for (const key of Object.keys(missing)) {
                const msg = missing[key];
                if (msg && customMsgs.indexOf(msg) < 0) {
                    customMsgs.push(msg);
                }
            }
            const customMsg = customMsgs.length ? `\n${customMsgs.join('\n')}` : '';
            usage.fail(__n('Missing required argument: %s', 'Missing required arguments: %s', Object.keys(missing).length, Object.keys(missing).join(', ') + customMsg));
        }
    };
    self.unknownArguments = function unknownArguments(argv, aliases, positionalMap, isDefaultCommand, checkPositionals = true) {
        var _a;
        const commandKeys = yargs
            .getInternalMethods()
            .getCommandInstance()
            .getCommands();
        const unknown = [];
        const currentContext = yargs.getInternalMethods().getContext();
        Object.keys(argv).forEach(key => {
            if (!specialKeys.includes(key) &&
                !Object.prototype.hasOwnProperty.call(positionalMap, key) &&
                !Object.prototype.hasOwnProperty.call(yargs.getInternalMethods().getParseContext(), key) &&
                !self.isValidAndSomeAliasIsNotNew(key, aliases)) {
                unknown.push(key);
            }
        });
        if (checkPositionals &&
            (currentContext.commands.length > 0 ||
                commandKeys.length > 0 ||
                isDefaultCommand)) {
            argv._.slice(currentContext.commands.length).forEach(key => {
                if (!commandKeys.includes('' + key)) {
                    unknown.push('' + key);
                }
            });
        }
        if (checkPositionals) {
            const demandedCommands = yargs.getDemandedCommands();
            const maxNonOptDemanded = ((_a = demandedCommands._) === null || _a === void 0 ? void 0 : _a.max) || 0;
            const expected = currentContext.commands.length + maxNonOptDemanded;
            if (expected < argv._.length) {
                argv._.slice(expected).forEach(key => {
                    key = String(key);
                    if (!currentContext.commands.includes(key) &&
                        !unknown.includes(key)) {
                        unknown.push(key);
                    }
                });
            }
        }
        if (unknown.length) {
            usage.fail(__n('Unknown argument: %s', 'Unknown arguments: %s', unknown.length, unknown.map(s => (s.trim() ? s : `"${s}"`)).join(', ')));
        }
    };
    self.unknownCommands = function unknownCommands(argv) {
        const commandKeys = yargs
            .getInternalMethods()
            .getCommandInstance()
            .getCommands();
        const unknown = [];
        const currentContext = yargs.getInternalMethods().getContext();
        if (currentContext.commands.length > 0 || commandKeys.length > 0) {
            argv._.slice(currentContext.commands.length).forEach(key => {
                if (!commandKeys.includes('' + key)) {
                    unknown.push('' + key);
                }
            });
        }
        if (unknown.length > 0) {
            usage.fail(__n('Unknown command: %s', 'Unknown commands: %s', unknown.length, unknown.join(', ')));
            return true;
        }
        else {
            return false;
        }
    };
    self.isValidAndSomeAliasIsNotNew = function isValidAndSomeAliasIsNotNew(key, aliases) {
        if (!Object.prototype.hasOwnProperty.call(aliases, key)) {
            return false;
        }
        const newAliases = yargs.parsed.newAliases;
        return [key, ...aliases[key]].some(a => !Object.prototype.hasOwnProperty.call(newAliases, a) || !newAliases[key]);
    };
    self.limitedChoices = function limitedChoices(argv) {
        const options = yargs.getOptions();
        const invalid = {};
        if (!Object.keys(options.choices).length)
            return;
        Object.keys(argv).forEach(key => {
            if (specialKeys.indexOf(key) === -1 &&
                Object.prototype.hasOwnProperty.call(options.choices, key)) {
                [].concat(argv[key]).forEach(value => {
                    if (options.choices[key].indexOf(value) === -1 &&
                        value !== undefined) {
                        invalid[key] = (invalid[key] || []).concat(value);
                    }
                });
            }
        });
        const invalidKeys = Object.keys(invalid);
        if (!invalidKeys.length)
            return;
        let msg = __('Invalid values:');
        invalidKeys.forEach(key => {
            msg += `\n  ${__('Argument: %s, Given: %s, Choices: %s', key, usage.stringifiedValues(invalid[key]), usage.stringifiedValues(options.choices[key]))}`;
        });
        usage.fail(msg);
    };
    let implied = {};
    self.implies = function implies(key, value) {
        argsert('<string|object> [array|number|string]', [key, value], arguments.length);
        if (typeof key === 'object') {
            Object.keys(key).forEach(k => {
                self.implies(k, key[k]);
            });
        }
        else {
            yargs.global(key);
            if (!implied[key]) {
                implied[key] = [];
            }
            if (Array.isArray(value)) {
                value.forEach(i => self.implies(key, i));
            }
            else {
                assertNotStrictEqual(value, undefined, shim);
                implied[key].push(value);
            }
        }
    };
    self.getImplied = function getImplied() {
        return implied;
    };
    function keyExists(argv, val) {
        const num = Number(val);
        val = isNaN(num) ? val : num;
        if (typeof val === 'number') {
            val = argv._.length >= val;
        }
        else if (val.match(/^--no-.+/)) {
            val = val.match(/^--no-(.+)/)[1];
            val = !Object.prototype.hasOwnProperty.call(argv, val);
        }
        else {
            val = Object.prototype.hasOwnProperty.call(argv, val);
        }
        return val;
    }
    self.implications = function implications(argv) {
        const implyFail = [];
        Object.keys(implied).forEach(key => {
            const origKey = key;
            (implied[key] || []).forEach(value => {
                let key = origKey;
                const origValue = value;
                key = keyExists(argv, key);
                value = keyExists(argv, value);
                if (key && !value) {
                    implyFail.push(` ${origKey} -> ${origValue}`);
                }
            });
        });
        if (implyFail.length) {
            let msg = `${__('Implications failed:')}\n`;
            implyFail.forEach(value => {
                msg += value;
            });
            usage.fail(msg);
        }
    };
    let conflicting = {};
    self.conflicts = function conflicts(key, value) {
        argsert('<string|object> [array|string]', [key, value], arguments.length);
        if (typeof key === 'object') {
            Object.keys(key).forEach(k => {
                self.conflicts(k, key[k]);
            });
        }
        else {
            yargs.global(key);
            if (!conflicting[key]) {
                conflicting[key] = [];
            }
            if (Array.isArray(value)) {
                value.forEach(i => self.conflicts(key, i));
            }
            else {
                conflicting[key].push(value);
            }
        }
    };
    self.getConflicting = () => conflicting;
    self.conflicting = function conflictingFn(argv) {
        Object.keys(argv).forEach(key => {
            if (conflicting[key]) {
                conflicting[key].forEach(value => {
                    if (value && argv[key] !== undefined && argv[value] !== undefined) {
                        usage.fail(__('Arguments %s and %s are mutually exclusive', key, value));
                    }
                });
            }
        });
        if (yargs.getInternalMethods().getParserConfiguration()['strip-dashed']) {
            Object.keys(conflicting).forEach(key => {
                conflicting[key].forEach(value => {
                    if (value &&
                        argv[shim.Parser.camelCase(key)] !== undefined &&
                        argv[shim.Parser.camelCase(value)] !== undefined) {
                        usage.fail(__('Arguments %s and %s are mutually exclusive', key, value));
                    }
                });
            });
        }
    };
    self.recommendCommands = function recommendCommands(cmd, potentialCommands) {
        const threshold = 3;
        potentialCommands = potentialCommands.sort((a, b) => b.length - a.length);
        let recommended = null;
        let bestDistance = Infinity;
        for (let i = 0, candidate; (candidate = potentialCommands[i]) !== undefined; i++) {
            const d = levenshtein(cmd, candidate);
            if (d <= threshold && d < bestDistance) {
                bestDistance = d;
                recommended = candidate;
            }
        }
        if (recommended)
            usage.fail(__('Did you mean %s?', recommended));
    };
    self.reset = function reset(localLookup) {
        implied = objFilter(implied, k => !localLookup[k]);
        conflicting = objFilter(conflicting, k => !localLookup[k]);
        return self;
    };
    const frozens = [];
    self.freeze = function freeze() {
        frozens.push({
            implied,
            conflicting,
        });
    };
    self.unfreeze = function unfreeze() {
        const frozen = frozens.pop();
        assertNotStrictEqual(frozen, undefined, shim);
        ({ implied, conflicting } = frozen);
    };
    return self;
}

let previouslyVisitedConfigs = [];
let shim;
function applyExtends(config, cwd, mergeExtends, _shim) {
    shim = _shim;
    let defaultConfig = {};
    if (Object.prototype.hasOwnProperty.call(config, 'extends')) {
        if (typeof config.extends !== 'string')
            return defaultConfig;
        const isPath = /\.json|\..*rc$/.test(config.extends);
        let pathToDefault = null;
        if (!isPath) {
            try {
                pathToDefault = import.meta.resolve(config.extends);
            }
            catch (_err) {
                return config;
            }
        }
        else {
            pathToDefault = getPathToDefaultConfig(cwd, config.extends);
        }
        checkForCircularExtends(pathToDefault);
        previouslyVisitedConfigs.push(pathToDefault);
        defaultConfig = isPath
            ? JSON.parse(shim.readFileSync(pathToDefault, 'utf8'))
            : _shim.require(config.extends);
        delete config.extends;
        defaultConfig = applyExtends(defaultConfig, shim.path.dirname(pathToDefault), mergeExtends, shim);
    }
    previouslyVisitedConfigs = [];
    return mergeExtends
        ? mergeDeep(defaultConfig, config)
        : Object.assign({}, defaultConfig, config);
}
function checkForCircularExtends(cfgPath) {
    if (previouslyVisitedConfigs.indexOf(cfgPath) > -1) {
        throw new YError(`Circular extended configurations: '${cfgPath}'.`);
    }
}
function getPathToDefaultConfig(cwd, pathToExtend) {
    return shim.path.resolve(cwd, pathToExtend);
}
function mergeDeep(config1, config2) {
    const target = {};
    function isObject(obj) {
        return obj && typeof obj === 'object' && !Array.isArray(obj);
    }
    Object.assign(target, config1);
    for (const key of Object.keys(config2)) {
        if (key === '__proto__')
            continue;
        if (isObject(config2[key]) && isObject(target[key])) {
            target[key] = mergeDeep(config1[key], config2[key]);
        }
        else {
            target[key] = config2[key];
        }
    }
    return target;
}

var __classPrivateFieldSet = (undefined && undefined.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet = (undefined && undefined.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _YargsInstance_command, _YargsInstance_cwd, _YargsInstance_context, _YargsInstance_completion, _YargsInstance_completionCommand, _YargsInstance_defaultShowHiddenOpt, _YargsInstance_exitError, _YargsInstance_detectLocale, _YargsInstance_emittedWarnings, _YargsInstance_exitProcess, _YargsInstance_frozens, _YargsInstance_globalMiddleware, _YargsInstance_groups, _YargsInstance_hasOutput, _YargsInstance_helpOpt, _YargsInstance_isGlobalContext, _YargsInstance_logger, _YargsInstance_output, _YargsInstance_options, _YargsInstance_parentRequire, _YargsInstance_parserConfig, _YargsInstance_parseFn, _YargsInstance_parseContext, _YargsInstance_pkgs, _YargsInstance_preservedGroups, _YargsInstance_processArgs, _YargsInstance_recommendCommands, _YargsInstance_shim, _YargsInstance_strict, _YargsInstance_strictCommands, _YargsInstance_strictOptions, _YargsInstance_usage, _YargsInstance_usageConfig, _YargsInstance_versionOpt, _YargsInstance_validation;
function YargsFactory(_shim) {
    return (processArgs = [], cwd = _shim.process.cwd(), parentRequire) => {
        const yargs = new YargsInstance(processArgs, cwd, parentRequire, _shim);
        Object.defineProperty(yargs, 'argv', {
            get: () => {
                return yargs.parse();
            },
            enumerable: true,
        });
        yargs.help();
        yargs.version();
        return yargs;
    };
}
const kCopyDoubleDash = Symbol('copyDoubleDash');
const kCreateLogger = Symbol('copyDoubleDash');
const kDeleteFromParserHintObject = Symbol('deleteFromParserHintObject');
const kEmitWarning = Symbol('emitWarning');
const kFreeze = Symbol('freeze');
const kGetDollarZero = Symbol('getDollarZero');
const kGetParserConfiguration = Symbol('getParserConfiguration');
const kGetUsageConfiguration = Symbol('getUsageConfiguration');
const kGuessLocale = Symbol('guessLocale');
const kGuessVersion = Symbol('guessVersion');
const kParsePositionalNumbers = Symbol('parsePositionalNumbers');
const kPkgUp = Symbol('pkgUp');
const kPopulateParserHintArray = Symbol('populateParserHintArray');
const kPopulateParserHintSingleValueDictionary = Symbol('populateParserHintSingleValueDictionary');
const kPopulateParserHintArrayDictionary = Symbol('populateParserHintArrayDictionary');
const kPopulateParserHintDictionary = Symbol('populateParserHintDictionary');
const kSanitizeKey = Symbol('sanitizeKey');
const kSetKey = Symbol('setKey');
const kUnfreeze = Symbol('unfreeze');
const kValidateAsync = Symbol('validateAsync');
const kGetCommandInstance = Symbol('getCommandInstance');
const kGetContext = Symbol('getContext');
const kGetHasOutput = Symbol('getHasOutput');
const kGetLoggerInstance = Symbol('getLoggerInstance');
const kGetParseContext = Symbol('getParseContext');
const kGetUsageInstance = Symbol('getUsageInstance');
const kGetValidationInstance = Symbol('getValidationInstance');
const kHasParseCallback = Symbol('hasParseCallback');
const kIsGlobalContext = Symbol('isGlobalContext');
const kPostProcess = Symbol('postProcess');
const kRebase = Symbol('rebase');
const kReset = Symbol('reset');
const kRunYargsParserAndExecuteCommands = Symbol('runYargsParserAndExecuteCommands');
const kRunValidation = Symbol('runValidation');
const kSetHasOutput = Symbol('setHasOutput');
const kTrackManuallySetKeys = Symbol('kTrackManuallySetKeys');
const DEFAULT_LOCALE = 'en_US';
class YargsInstance {
    constructor(processArgs = [], cwd, parentRequire, shim) {
        this.customScriptName = false;
        this.parsed = false;
        _YargsInstance_command.set(this, void 0);
        _YargsInstance_cwd.set(this, void 0);
        _YargsInstance_context.set(this, { commands: [], fullCommands: [] });
        _YargsInstance_completion.set(this, null);
        _YargsInstance_completionCommand.set(this, null);
        _YargsInstance_defaultShowHiddenOpt.set(this, 'show-hidden');
        _YargsInstance_exitError.set(this, null);
        _YargsInstance_detectLocale.set(this, true);
        _YargsInstance_emittedWarnings.set(this, {});
        _YargsInstance_exitProcess.set(this, true);
        _YargsInstance_frozens.set(this, []);
        _YargsInstance_globalMiddleware.set(this, void 0);
        _YargsInstance_groups.set(this, {});
        _YargsInstance_hasOutput.set(this, false);
        _YargsInstance_helpOpt.set(this, null);
        _YargsInstance_isGlobalContext.set(this, true);
        _YargsInstance_logger.set(this, void 0);
        _YargsInstance_output.set(this, '');
        _YargsInstance_options.set(this, void 0);
        _YargsInstance_parentRequire.set(this, void 0);
        _YargsInstance_parserConfig.set(this, {});
        _YargsInstance_parseFn.set(this, null);
        _YargsInstance_parseContext.set(this, null);
        _YargsInstance_pkgs.set(this, {});
        _YargsInstance_preservedGroups.set(this, {});
        _YargsInstance_processArgs.set(this, void 0);
        _YargsInstance_recommendCommands.set(this, false);
        _YargsInstance_shim.set(this, void 0);
        _YargsInstance_strict.set(this, false);
        _YargsInstance_strictCommands.set(this, false);
        _YargsInstance_strictOptions.set(this, false);
        _YargsInstance_usage.set(this, void 0);
        _YargsInstance_usageConfig.set(this, {});
        _YargsInstance_versionOpt.set(this, null);
        _YargsInstance_validation.set(this, void 0);
        __classPrivateFieldSet(this, _YargsInstance_shim, shim, "f");
        __classPrivateFieldSet(this, _YargsInstance_processArgs, processArgs, "f");
        __classPrivateFieldSet(this, _YargsInstance_cwd, cwd, "f");
        __classPrivateFieldSet(this, _YargsInstance_parentRequire, parentRequire, "f");
        __classPrivateFieldSet(this, _YargsInstance_globalMiddleware, new GlobalMiddleware(this), "f");
        this.$0 = this[kGetDollarZero]();
        this[kReset]();
        __classPrivateFieldSet(this, _YargsInstance_command, __classPrivateFieldGet(this, _YargsInstance_command, "f"), "f");
        __classPrivateFieldSet(this, _YargsInstance_usage, __classPrivateFieldGet(this, _YargsInstance_usage, "f"), "f");
        __classPrivateFieldSet(this, _YargsInstance_validation, __classPrivateFieldGet(this, _YargsInstance_validation, "f"), "f");
        __classPrivateFieldSet(this, _YargsInstance_options, __classPrivateFieldGet(this, _YargsInstance_options, "f"), "f");
        __classPrivateFieldGet(this, _YargsInstance_options, "f").showHiddenOpt = __classPrivateFieldGet(this, _YargsInstance_defaultShowHiddenOpt, "f");
        __classPrivateFieldSet(this, _YargsInstance_logger, this[kCreateLogger](), "f");
        __classPrivateFieldGet(this, _YargsInstance_shim, "f").y18n.setLocale(DEFAULT_LOCALE);
    }
    addHelpOpt(opt, msg) {
        const defaultHelpOpt = 'help';
        argsert('[string|boolean] [string]', [opt, msg], arguments.length);
        if (__classPrivateFieldGet(this, _YargsInstance_helpOpt, "f")) {
            this[kDeleteFromParserHintObject](__classPrivateFieldGet(this, _YargsInstance_helpOpt, "f"));
            __classPrivateFieldSet(this, _YargsInstance_helpOpt, null, "f");
        }
        if (opt === false && msg === undefined)
            return this;
        __classPrivateFieldSet(this, _YargsInstance_helpOpt, typeof opt === 'string' ? opt : defaultHelpOpt, "f");
        this.boolean(__classPrivateFieldGet(this, _YargsInstance_helpOpt, "f"));
        this.describe(__classPrivateFieldGet(this, _YargsInstance_helpOpt, "f"), msg || __classPrivateFieldGet(this, _YargsInstance_usage, "f").deferY18nLookup('Show help'));
        return this;
    }
    help(opt, msg) {
        return this.addHelpOpt(opt, msg);
    }
    addShowHiddenOpt(opt, msg) {
        argsert('[string|boolean] [string]', [opt, msg], arguments.length);
        if (opt === false && msg === undefined)
            return this;
        const showHiddenOpt = typeof opt === 'string' ? opt : __classPrivateFieldGet(this, _YargsInstance_defaultShowHiddenOpt, "f");
        this.boolean(showHiddenOpt);
        this.describe(showHiddenOpt, msg || __classPrivateFieldGet(this, _YargsInstance_usage, "f").deferY18nLookup('Show hidden options'));
        __classPrivateFieldGet(this, _YargsInstance_options, "f").showHiddenOpt = showHiddenOpt;
        return this;
    }
    showHidden(opt, msg) {
        return this.addShowHiddenOpt(opt, msg);
    }
    alias(key, value) {
        argsert('<object|string|array> [string|array]', [key, value], arguments.length);
        this[kPopulateParserHintArrayDictionary](this.alias.bind(this), 'alias', key, value);
        return this;
    }
    array(keys) {
        argsert('<array|string>', [keys], arguments.length);
        this[kPopulateParserHintArray]('array', keys);
        this[kTrackManuallySetKeys](keys);
        return this;
    }
    boolean(keys) {
        argsert('<array|string>', [keys], arguments.length);
        this[kPopulateParserHintArray]('boolean', keys);
        this[kTrackManuallySetKeys](keys);
        return this;
    }
    check(f, global) {
        argsert('<function> [boolean]', [f, global], arguments.length);
        this.middleware((argv, _yargs) => {
            return maybeAsyncResult(() => {
                return f(argv, _yargs.getOptions());
            }, (result) => {
                if (!result) {
                    __classPrivateFieldGet(this, _YargsInstance_usage, "f").fail(__classPrivateFieldGet(this, _YargsInstance_shim, "f").y18n.__('Argument check failed: %s', f.toString()));
                }
                else if (typeof result === 'string' || result instanceof Error) {
                    __classPrivateFieldGet(this, _YargsInstance_usage, "f").fail(result.toString(), result);
                }
                return argv;
            }, (err) => {
                __classPrivateFieldGet(this, _YargsInstance_usage, "f").fail(err.message ? err.message : err.toString(), err);
                return argv;
            });
        }, false, global);
        return this;
    }
    choices(key, value) {
        argsert('<object|string|array> [string|array]', [key, value], arguments.length);
        this[kPopulateParserHintArrayDictionary](this.choices.bind(this), 'choices', key, value);
        return this;
    }
    coerce(keys, value) {
        argsert('<object|string|array> [function]', [keys, value], arguments.length);
        if (Array.isArray(keys)) {
            if (!value) {
                throw new YError('coerce callback must be provided');
            }
            for (const key of keys) {
                this.coerce(key, value);
            }
            return this;
        }
        else if (typeof keys === 'object') {
            for (const key of Object.keys(keys)) {
                this.coerce(key, keys[key]);
            }
            return this;
        }
        if (!value) {
            throw new YError('coerce callback must be provided');
        }
        const coerceKey = keys;
        __classPrivateFieldGet(this, _YargsInstance_options, "f").key[coerceKey] = true;
        __classPrivateFieldGet(this, _YargsInstance_globalMiddleware, "f").addCoerceMiddleware((argv, yargs) => {
            var _a;
            const coerceKeyAliases = (_a = yargs.getAliases()[coerceKey]) !== null && _a !== void 0 ? _a : [];
            const argvKeys = [coerceKey, ...coerceKeyAliases].filter(key => Object.prototype.hasOwnProperty.call(argv, key));
            if (argvKeys.length === 0) {
                return argv;
            }
            return maybeAsyncResult(() => {
                return value(argv[argvKeys[0]]);
            }, (result) => {
                argvKeys.forEach(key => {
                    argv[key] = result;
                });
                return argv;
            }, (err) => {
                throw new YError(err.message);
            });
        }, coerceKey);
        return this;
    }
    conflicts(key1, key2) {
        argsert('<string|object> [string|array]', [key1, key2], arguments.length);
        __classPrivateFieldGet(this, _YargsInstance_validation, "f").conflicts(key1, key2);
        return this;
    }
    config(key = 'config', msg, parseFn) {
        argsert('[object|string] [string|function] [function]', [key, msg, parseFn], arguments.length);
        if (typeof key === 'object' && !Array.isArray(key)) {
            key = applyExtends(key, __classPrivateFieldGet(this, _YargsInstance_cwd, "f"), this[kGetParserConfiguration]()['deep-merge-config'] || false, __classPrivateFieldGet(this, _YargsInstance_shim, "f"));
            __classPrivateFieldGet(this, _YargsInstance_options, "f").configObjects = (__classPrivateFieldGet(this, _YargsInstance_options, "f").configObjects || []).concat(key);
            return this;
        }
        if (typeof msg === 'function') {
            parseFn = msg;
            msg = undefined;
        }
        this.describe(key, msg || __classPrivateFieldGet(this, _YargsInstance_usage, "f").deferY18nLookup('Path to JSON config file'));
        (Array.isArray(key) ? key : [key]).forEach(k => {
            __classPrivateFieldGet(this, _YargsInstance_options, "f").config[k] = parseFn || true;
        });
        return this;
    }
    completion(cmd, desc, fn) {
        argsert('[string] [string|boolean|function] [function]', [cmd, desc, fn], arguments.length);
        if (typeof desc === 'function') {
            fn = desc;
            desc = undefined;
        }
        __classPrivateFieldSet(this, _YargsInstance_completionCommand, cmd || __classPrivateFieldGet(this, _YargsInstance_completionCommand, "f") || 'completion', "f");
        if (!desc && desc !== false) {
            desc = 'generate completion script';
        }
        this.command(__classPrivateFieldGet(this, _YargsInstance_completionCommand, "f"), desc);
        if (fn)
            __classPrivateFieldGet(this, _YargsInstance_completion, "f").registerFunction(fn);
        return this;
    }
    command(cmd, description, builder, handler, middlewares, deprecated) {
        argsert('<string|array|object> [string|boolean] [function|object] [function] [array] [boolean|string]', [cmd, description, builder, handler, middlewares, deprecated], arguments.length);
        __classPrivateFieldGet(this, _YargsInstance_command, "f").addHandler(cmd, description, builder, handler, middlewares, deprecated);
        return this;
    }
    commands(cmd, description, builder, handler, middlewares, deprecated) {
        return this.command(cmd, description, builder, handler, middlewares, deprecated);
    }
    commandDir(dir, opts) {
        argsert('<string> [object]', [dir, opts], arguments.length);
        const req = __classPrivateFieldGet(this, _YargsInstance_parentRequire, "f") || __classPrivateFieldGet(this, _YargsInstance_shim, "f").require;
        __classPrivateFieldGet(this, _YargsInstance_command, "f").addDirectory(dir, req, __classPrivateFieldGet(this, _YargsInstance_shim, "f").getCallerFile(), opts);
        return this;
    }
    count(keys) {
        argsert('<array|string>', [keys], arguments.length);
        this[kPopulateParserHintArray]('count', keys);
        this[kTrackManuallySetKeys](keys);
        return this;
    }
    default(key, value, defaultDescription) {
        argsert('<object|string|array> [*] [string]', [key, value, defaultDescription], arguments.length);
        if (defaultDescription) {
            assertSingleKey(key, __classPrivateFieldGet(this, _YargsInstance_shim, "f"));
            __classPrivateFieldGet(this, _YargsInstance_options, "f").defaultDescription[key] = defaultDescription;
        }
        if (typeof value === 'function') {
            assertSingleKey(key, __classPrivateFieldGet(this, _YargsInstance_shim, "f"));
            if (!__classPrivateFieldGet(this, _YargsInstance_options, "f").defaultDescription[key])
                __classPrivateFieldGet(this, _YargsInstance_options, "f").defaultDescription[key] =
                    __classPrivateFieldGet(this, _YargsInstance_usage, "f").functionDescription(value);
            value = value.call();
        }
        this[kPopulateParserHintSingleValueDictionary](this.default.bind(this), 'default', key, value);
        return this;
    }
    defaults(key, value, defaultDescription) {
        return this.default(key, value, defaultDescription);
    }
    demandCommand(min = 1, max, minMsg, maxMsg) {
        argsert('[number] [number|string] [string|null|undefined] [string|null|undefined]', [min, max, minMsg, maxMsg], arguments.length);
        if (typeof max !== 'number') {
            minMsg = max;
            max = Infinity;
        }
        this.global('_', false);
        __classPrivateFieldGet(this, _YargsInstance_options, "f").demandedCommands._ = {
            min,
            max,
            minMsg,
            maxMsg,
        };
        return this;
    }
    demand(keys, max, msg) {
        if (Array.isArray(max)) {
            max.forEach(key => {
                assertNotStrictEqual(msg, true, __classPrivateFieldGet(this, _YargsInstance_shim, "f"));
                this.demandOption(key, msg);
            });
            max = Infinity;
        }
        else if (typeof max !== 'number') {
            msg = max;
            max = Infinity;
        }
        if (typeof keys === 'number') {
            assertNotStrictEqual(msg, true, __classPrivateFieldGet(this, _YargsInstance_shim, "f"));
            this.demandCommand(keys, max, msg, msg);
        }
        else if (Array.isArray(keys)) {
            keys.forEach(key => {
                assertNotStrictEqual(msg, true, __classPrivateFieldGet(this, _YargsInstance_shim, "f"));
                this.demandOption(key, msg);
            });
        }
        else {
            if (typeof msg === 'string') {
                this.demandOption(keys, msg);
            }
            else if (msg === true || typeof msg === 'undefined') {
                this.demandOption(keys);
            }
        }
        return this;
    }
    demandOption(keys, msg) {
        argsert('<object|string|array> [string]', [keys, msg], arguments.length);
        this[kPopulateParserHintSingleValueDictionary](this.demandOption.bind(this), 'demandedOptions', keys, msg);
        return this;
    }
    deprecateOption(option, message) {
        argsert('<string> [string|boolean]', [option, message], arguments.length);
        __classPrivateFieldGet(this, _YargsInstance_options, "f").deprecatedOptions[option] = message;
        return this;
    }
    describe(keys, description) {
        argsert('<object|string|array> [string]', [keys, description], arguments.length);
        this[kSetKey](keys, true);
        __classPrivateFieldGet(this, _YargsInstance_usage, "f").describe(keys, description);
        return this;
    }
    detectLocale(detect) {
        argsert('<boolean>', [detect], arguments.length);
        __classPrivateFieldSet(this, _YargsInstance_detectLocale, detect, "f");
        return this;
    }
    env(prefix) {
        argsert('[string|boolean]', [prefix], arguments.length);
        if (prefix === false)
            delete __classPrivateFieldGet(this, _YargsInstance_options, "f").envPrefix;
        else
            __classPrivateFieldGet(this, _YargsInstance_options, "f").envPrefix = prefix || '';
        return this;
    }
    epilogue(msg) {
        argsert('<string>', [msg], arguments.length);
        __classPrivateFieldGet(this, _YargsInstance_usage, "f").epilog(msg);
        return this;
    }
    epilog(msg) {
        return this.epilogue(msg);
    }
    example(cmd, description) {
        argsert('<string|array> [string]', [cmd, description], arguments.length);
        if (Array.isArray(cmd)) {
            cmd.forEach(exampleParams => this.example(...exampleParams));
        }
        else {
            __classPrivateFieldGet(this, _YargsInstance_usage, "f").example(cmd, description);
        }
        return this;
    }
    exit(code, err) {
        __classPrivateFieldSet(this, _YargsInstance_hasOutput, true, "f");
        __classPrivateFieldSet(this, _YargsInstance_exitError, err, "f");
        if (__classPrivateFieldGet(this, _YargsInstance_exitProcess, "f"))
            __classPrivateFieldGet(this, _YargsInstance_shim, "f").process.exit(code);
    }
    exitProcess(enabled = true) {
        argsert('[boolean]', [enabled], arguments.length);
        __classPrivateFieldSet(this, _YargsInstance_exitProcess, enabled, "f");
        return this;
    }
    fail(f) {
        argsert('<function|boolean>', [f], arguments.length);
        if (typeof f === 'boolean' && f !== false) {
            throw new YError("Invalid first argument. Expected function or boolean 'false'");
        }
        __classPrivateFieldGet(this, _YargsInstance_usage, "f").failFn(f);
        return this;
    }
    getAliases() {
        return this.parsed ? this.parsed.aliases : {};
    }
    async getCompletion(args, done) {
        argsert('<array> [function]', [args, done], arguments.length);
        if (!done) {
            return new Promise((resolve, reject) => {
                __classPrivateFieldGet(this, _YargsInstance_completion, "f").getCompletion(args, (err, completions) => {
                    if (err)
                        reject(err);
                    else
                        resolve(completions);
                });
            });
        }
        else {
            return __classPrivateFieldGet(this, _YargsInstance_completion, "f").getCompletion(args, done);
        }
    }
    getDemandedOptions() {
        argsert([], 0);
        return __classPrivateFieldGet(this, _YargsInstance_options, "f").demandedOptions;
    }
    getDemandedCommands() {
        argsert([], 0);
        return __classPrivateFieldGet(this, _YargsInstance_options, "f").demandedCommands;
    }
    getDeprecatedOptions() {
        argsert([], 0);
        return __classPrivateFieldGet(this, _YargsInstance_options, "f").deprecatedOptions;
    }
    getDetectLocale() {
        return __classPrivateFieldGet(this, _YargsInstance_detectLocale, "f");
    }
    getExitProcess() {
        return __classPrivateFieldGet(this, _YargsInstance_exitProcess, "f");
    }
    getGroups() {
        return Object.assign({}, __classPrivateFieldGet(this, _YargsInstance_groups, "f"), __classPrivateFieldGet(this, _YargsInstance_preservedGroups, "f"));
    }
    getHelp() {
        __classPrivateFieldSet(this, _YargsInstance_hasOutput, true, "f");
        if (!__classPrivateFieldGet(this, _YargsInstance_usage, "f").hasCachedHelpMessage()) {
            if (!this.parsed) {
                const parse = this[kRunYargsParserAndExecuteCommands](__classPrivateFieldGet(this, _YargsInstance_processArgs, "f"), undefined, undefined, 0, true);
                if (isPromise(parse)) {
                    return parse.then(() => {
                        return __classPrivateFieldGet(this, _YargsInstance_usage, "f").help();
                    });
                }
            }
            const builderResponse = __classPrivateFieldGet(this, _YargsInstance_command, "f").runDefaultBuilderOn(this);
            if (isPromise(builderResponse)) {
                return builderResponse.then(() => {
                    return __classPrivateFieldGet(this, _YargsInstance_usage, "f").help();
                });
            }
        }
        return Promise.resolve(__classPrivateFieldGet(this, _YargsInstance_usage, "f").help());
    }
    getOptions() {
        return __classPrivateFieldGet(this, _YargsInstance_options, "f");
    }
    getStrict() {
        return __classPrivateFieldGet(this, _YargsInstance_strict, "f");
    }
    getStrictCommands() {
        return __classPrivateFieldGet(this, _YargsInstance_strictCommands, "f");
    }
    getStrictOptions() {
        return __classPrivateFieldGet(this, _YargsInstance_strictOptions, "f");
    }
    global(globals, global) {
        argsert('<string|array> [boolean]', [globals, global], arguments.length);
        globals = [].concat(globals);
        if (global !== false) {
            __classPrivateFieldGet(this, _YargsInstance_options, "f").local = __classPrivateFieldGet(this, _YargsInstance_options, "f").local.filter(l => globals.indexOf(l) === -1);
        }
        else {
            globals.forEach(g => {
                if (!__classPrivateFieldGet(this, _YargsInstance_options, "f").local.includes(g))
                    __classPrivateFieldGet(this, _YargsInstance_options, "f").local.push(g);
            });
        }
        return this;
    }
    group(opts, groupName) {
        argsert('<string|array> <string>', [opts, groupName], arguments.length);
        const existing = __classPrivateFieldGet(this, _YargsInstance_preservedGroups, "f")[groupName] || __classPrivateFieldGet(this, _YargsInstance_groups, "f")[groupName];
        if (__classPrivateFieldGet(this, _YargsInstance_preservedGroups, "f")[groupName]) {
            delete __classPrivateFieldGet(this, _YargsInstance_preservedGroups, "f")[groupName];
        }
        const seen = {};
        __classPrivateFieldGet(this, _YargsInstance_groups, "f")[groupName] = (existing || []).concat(opts).filter(key => {
            if (seen[key])
                return false;
            return (seen[key] = true);
        });
        return this;
    }
    hide(key) {
        argsert('<string>', [key], arguments.length);
        __classPrivateFieldGet(this, _YargsInstance_options, "f").hiddenOptions.push(key);
        return this;
    }
    implies(key, value) {
        argsert('<string|object> [number|string|array]', [key, value], arguments.length);
        __classPrivateFieldGet(this, _YargsInstance_validation, "f").implies(key, value);
        return this;
    }
    locale(locale) {
        argsert('[string]', [locale], arguments.length);
        if (locale === undefined) {
            this[kGuessLocale]();
            return __classPrivateFieldGet(this, _YargsInstance_shim, "f").y18n.getLocale();
        }
        __classPrivateFieldSet(this, _YargsInstance_detectLocale, false, "f");
        __classPrivateFieldGet(this, _YargsInstance_shim, "f").y18n.setLocale(locale);
        return this;
    }
    middleware(callback, applyBeforeValidation, global) {
        return __classPrivateFieldGet(this, _YargsInstance_globalMiddleware, "f").addMiddleware(callback, !!applyBeforeValidation, global);
    }
    nargs(key, value) {
        argsert('<string|object|array> [number]', [key, value], arguments.length);
        this[kPopulateParserHintSingleValueDictionary](this.nargs.bind(this), 'narg', key, value);
        return this;
    }
    normalize(keys) {
        argsert('<array|string>', [keys], arguments.length);
        this[kPopulateParserHintArray]('normalize', keys);
        return this;
    }
    number(keys) {
        argsert('<array|string>', [keys], arguments.length);
        this[kPopulateParserHintArray]('number', keys);
        this[kTrackManuallySetKeys](keys);
        return this;
    }
    option(key, opt) {
        argsert('<string|object> [object]', [key, opt], arguments.length);
        if (typeof key === 'object') {
            Object.keys(key).forEach(k => {
                this.options(k, key[k]);
            });
        }
        else {
            if (typeof opt !== 'object') {
                opt = {};
            }
            this[kTrackManuallySetKeys](key);
            if (__classPrivateFieldGet(this, _YargsInstance_versionOpt, "f") && (key === 'version' || (opt === null || opt === void 0 ? void 0 : opt.alias) === 'version')) {
                this[kEmitWarning]([
                    '"version" is a reserved word.',
                    'Please do one of the following:',
                    '- Disable version with `yargs.version(false)` if using "version" as an option',
                    '- Use the built-in `yargs.version` method instead (if applicable)',
                    '- Use a different option key',
                    'https://yargs.js.org/docs/#api-reference-version',
                ].join('\n'), undefined, 'versionWarning');
            }
            __classPrivateFieldGet(this, _YargsInstance_options, "f").key[key] = true;
            if (opt.alias)
                this.alias(key, opt.alias);
            const deprecate = opt.deprecate || opt.deprecated;
            if (deprecate) {
                this.deprecateOption(key, deprecate);
            }
            const demand = opt.demand || opt.required || opt.require;
            if (demand) {
                this.demand(key, demand);
            }
            if (opt.demandOption) {
                this.demandOption(key, typeof opt.demandOption === 'string' ? opt.demandOption : undefined);
            }
            if (opt.conflicts) {
                this.conflicts(key, opt.conflicts);
            }
            if ('default' in opt) {
                this.default(key, opt.default);
            }
            if (opt.implies !== undefined) {
                this.implies(key, opt.implies);
            }
            if (opt.nargs !== undefined) {
                this.nargs(key, opt.nargs);
            }
            if (opt.config) {
                this.config(key, opt.configParser);
            }
            if (opt.normalize) {
                this.normalize(key);
            }
            if (opt.choices) {
                this.choices(key, opt.choices);
            }
            if (opt.coerce) {
                this.coerce(key, opt.coerce);
            }
            if (opt.group) {
                this.group(key, opt.group);
            }
            if (opt.boolean || opt.type === 'boolean') {
                this.boolean(key);
                if (opt.alias)
                    this.boolean(opt.alias);
            }
            if (opt.array || opt.type === 'array') {
                this.array(key);
                if (opt.alias)
                    this.array(opt.alias);
            }
            if (opt.number || opt.type === 'number') {
                this.number(key);
                if (opt.alias)
                    this.number(opt.alias);
            }
            if (opt.string || opt.type === 'string') {
                this.string(key);
                if (opt.alias)
                    this.string(opt.alias);
            }
            if (opt.count || opt.type === 'count') {
                this.count(key);
            }
            if (typeof opt.global === 'boolean') {
                this.global(key, opt.global);
            }
            if (opt.defaultDescription) {
                __classPrivateFieldGet(this, _YargsInstance_options, "f").defaultDescription[key] = opt.defaultDescription;
            }
            if (opt.skipValidation) {
                this.skipValidation(key);
            }
            const desc = opt.describe || opt.description || opt.desc;
            const descriptions = __classPrivateFieldGet(this, _YargsInstance_usage, "f").getDescriptions();
            if (!Object.prototype.hasOwnProperty.call(descriptions, key) ||
                typeof desc === 'string') {
                this.describe(key, desc);
            }
            if (opt.hidden) {
                this.hide(key);
            }
            if (opt.requiresArg) {
                this.requiresArg(key);
            }
        }
        return this;
    }
    options(key, opt) {
        return this.option(key, opt);
    }
    parse(args, shortCircuit, _parseFn) {
        argsert('[string|array] [function|boolean|object] [function]', [args, shortCircuit, _parseFn], arguments.length);
        this[kFreeze]();
        if (typeof args === 'undefined') {
            args = __classPrivateFieldGet(this, _YargsInstance_processArgs, "f");
        }
        if (typeof shortCircuit === 'object') {
            __classPrivateFieldSet(this, _YargsInstance_parseContext, shortCircuit, "f");
            shortCircuit = _parseFn;
        }
        if (typeof shortCircuit === 'function') {
            __classPrivateFieldSet(this, _YargsInstance_parseFn, shortCircuit, "f");
            shortCircuit = false;
        }
        if (!shortCircuit)
            __classPrivateFieldSet(this, _YargsInstance_processArgs, args, "f");
        if (__classPrivateFieldGet(this, _YargsInstance_parseFn, "f"))
            __classPrivateFieldSet(this, _YargsInstance_exitProcess, false, "f");
        const parsed = this[kRunYargsParserAndExecuteCommands](args, !!shortCircuit);
        const tmpParsed = this.parsed;
        __classPrivateFieldGet(this, _YargsInstance_completion, "f").setParsed(this.parsed);
        if (isPromise(parsed)) {
            return parsed
                .then(argv => {
                if (__classPrivateFieldGet(this, _YargsInstance_parseFn, "f"))
                    __classPrivateFieldGet(this, _YargsInstance_parseFn, "f").call(this, __classPrivateFieldGet(this, _YargsInstance_exitError, "f"), argv, __classPrivateFieldGet(this, _YargsInstance_output, "f"));
                return argv;
            })
                .catch(err => {
                if (__classPrivateFieldGet(this, _YargsInstance_parseFn, "f")) {
                    __classPrivateFieldGet(this, _YargsInstance_parseFn, "f")(err, this.parsed.argv, __classPrivateFieldGet(this, _YargsInstance_output, "f"));
                }
                throw err;
            })
                .finally(() => {
                this[kUnfreeze]();
                this.parsed = tmpParsed;
            });
        }
        else {
            if (__classPrivateFieldGet(this, _YargsInstance_parseFn, "f"))
                __classPrivateFieldGet(this, _YargsInstance_parseFn, "f").call(this, __classPrivateFieldGet(this, _YargsInstance_exitError, "f"), parsed, __classPrivateFieldGet(this, _YargsInstance_output, "f"));
            this[kUnfreeze]();
            this.parsed = tmpParsed;
        }
        return parsed;
    }
    parseAsync(args, shortCircuit, _parseFn) {
        const maybePromise = this.parse(args, shortCircuit, _parseFn);
        return !isPromise(maybePromise)
            ? Promise.resolve(maybePromise)
            : maybePromise;
    }
    parseSync(args, shortCircuit, _parseFn) {
        const maybePromise = this.parse(args, shortCircuit, _parseFn);
        if (isPromise(maybePromise)) {
            throw new YError('.parseSync() must not be used with asynchronous builders, handlers, or middleware');
        }
        return maybePromise;
    }
    parserConfiguration(config) {
        argsert('<object>', [config], arguments.length);
        __classPrivateFieldSet(this, _YargsInstance_parserConfig, config, "f");
        return this;
    }
    pkgConf(key, rootPath) {
        argsert('<string> [string]', [key, rootPath], arguments.length);
        let conf = null;
        const obj = this[kPkgUp](rootPath || __classPrivateFieldGet(this, _YargsInstance_cwd, "f"));
        if (obj[key] && typeof obj[key] === 'object') {
            conf = applyExtends(obj[key], rootPath || __classPrivateFieldGet(this, _YargsInstance_cwd, "f"), this[kGetParserConfiguration]()['deep-merge-config'] || false, __classPrivateFieldGet(this, _YargsInstance_shim, "f"));
            __classPrivateFieldGet(this, _YargsInstance_options, "f").configObjects = (__classPrivateFieldGet(this, _YargsInstance_options, "f").configObjects || []).concat(conf);
        }
        return this;
    }
    positional(key, opts) {
        argsert('<string> <object>', [key, opts], arguments.length);
        const supportedOpts = [
            'default',
            'defaultDescription',
            'implies',
            'normalize',
            'choices',
            'conflicts',
            'coerce',
            'type',
            'describe',
            'desc',
            'description',
            'alias',
        ];
        opts = objFilter(opts, (k, v) => {
            if (k === 'type' && !['string', 'number', 'boolean'].includes(v))
                return false;
            return supportedOpts.includes(k);
        });
        const fullCommand = __classPrivateFieldGet(this, _YargsInstance_context, "f").fullCommands[__classPrivateFieldGet(this, _YargsInstance_context, "f").fullCommands.length - 1];
        const parseOptions = fullCommand
            ? __classPrivateFieldGet(this, _YargsInstance_command, "f").cmdToParseOptions(fullCommand)
            : {
                array: [],
                alias: {},
                default: {},
                demand: {},
            };
        objectKeys(parseOptions).forEach(pk => {
            const parseOption = parseOptions[pk];
            if (Array.isArray(parseOption)) {
                if (parseOption.indexOf(key) !== -1)
                    opts[pk] = true;
            }
            else {
                if (parseOption[key] && !(pk in opts))
                    opts[pk] = parseOption[key];
            }
        });
        this.group(key, __classPrivateFieldGet(this, _YargsInstance_usage, "f").getPositionalGroupName());
        return this.option(key, opts);
    }
    recommendCommands(recommend = true) {
        argsert('[boolean]', [recommend], arguments.length);
        __classPrivateFieldSet(this, _YargsInstance_recommendCommands, recommend, "f");
        return this;
    }
    required(keys, max, msg) {
        return this.demand(keys, max, msg);
    }
    require(keys, max, msg) {
        return this.demand(keys, max, msg);
    }
    requiresArg(keys) {
        argsert('<array|string|object> [number]', [keys], arguments.length);
        if (typeof keys === 'string' && __classPrivateFieldGet(this, _YargsInstance_options, "f").narg[keys]) {
            return this;
        }
        else {
            this[kPopulateParserHintSingleValueDictionary](this.requiresArg.bind(this), 'narg', keys, NaN);
        }
        return this;
    }
    showCompletionScript($0, cmd) {
        argsert('[string] [string]', [$0, cmd], arguments.length);
        $0 = $0 || this.$0;
        __classPrivateFieldGet(this, _YargsInstance_logger, "f").log(__classPrivateFieldGet(this, _YargsInstance_completion, "f").generateCompletionScript($0, cmd || __classPrivateFieldGet(this, _YargsInstance_completionCommand, "f") || 'completion'));
        return this;
    }
    showHelp(level) {
        argsert('[string|function]', [level], arguments.length);
        __classPrivateFieldSet(this, _YargsInstance_hasOutput, true, "f");
        if (!__classPrivateFieldGet(this, _YargsInstance_usage, "f").hasCachedHelpMessage()) {
            if (!this.parsed) {
                const parse = this[kRunYargsParserAndExecuteCommands](__classPrivateFieldGet(this, _YargsInstance_processArgs, "f"), undefined, undefined, 0, true);
                if (isPromise(parse)) {
                    parse.then(() => {
                        __classPrivateFieldGet(this, _YargsInstance_usage, "f").showHelp(level);
                    });
                    return this;
                }
            }
            const builderResponse = __classPrivateFieldGet(this, _YargsInstance_command, "f").runDefaultBuilderOn(this);
            if (isPromise(builderResponse)) {
                builderResponse.then(() => {
                    __classPrivateFieldGet(this, _YargsInstance_usage, "f").showHelp(level);
                });
                return this;
            }
        }
        __classPrivateFieldGet(this, _YargsInstance_usage, "f").showHelp(level);
        return this;
    }
    scriptName(scriptName) {
        this.customScriptName = true;
        this.$0 = scriptName;
        return this;
    }
    showHelpOnFail(enabled, message) {
        argsert('[boolean|string] [string]', [enabled, message], arguments.length);
        __classPrivateFieldGet(this, _YargsInstance_usage, "f").showHelpOnFail(enabled, message);
        return this;
    }
    showVersion(level) {
        argsert('[string|function]', [level], arguments.length);
        __classPrivateFieldGet(this, _YargsInstance_usage, "f").showVersion(level);
        return this;
    }
    skipValidation(keys) {
        argsert('<array|string>', [keys], arguments.length);
        this[kPopulateParserHintArray]('skipValidation', keys);
        return this;
    }
    strict(enabled) {
        argsert('[boolean]', [enabled], arguments.length);
        __classPrivateFieldSet(this, _YargsInstance_strict, enabled !== false, "f");
        return this;
    }
    strictCommands(enabled) {
        argsert('[boolean]', [enabled], arguments.length);
        __classPrivateFieldSet(this, _YargsInstance_strictCommands, enabled !== false, "f");
        return this;
    }
    strictOptions(enabled) {
        argsert('[boolean]', [enabled], arguments.length);
        __classPrivateFieldSet(this, _YargsInstance_strictOptions, enabled !== false, "f");
        return this;
    }
    string(keys) {
        argsert('<array|string>', [keys], arguments.length);
        this[kPopulateParserHintArray]('string', keys);
        this[kTrackManuallySetKeys](keys);
        return this;
    }
    terminalWidth() {
        argsert([], 0);
        return __classPrivateFieldGet(this, _YargsInstance_shim, "f").process.stdColumns;
    }
    updateLocale(obj) {
        return this.updateStrings(obj);
    }
    updateStrings(obj) {
        argsert('<object>', [obj], arguments.length);
        __classPrivateFieldSet(this, _YargsInstance_detectLocale, false, "f");
        __classPrivateFieldGet(this, _YargsInstance_shim, "f").y18n.updateLocale(obj);
        return this;
    }
    usage(msg, description, builder, handler) {
        argsert('<string|null|undefined> [string|boolean] [function|object] [function]', [msg, description, builder, handler], arguments.length);
        if (description !== undefined) {
            assertNotStrictEqual(msg, null, __classPrivateFieldGet(this, _YargsInstance_shim, "f"));
            if ((msg || '').match(/^\$0( |$)/)) {
                return this.command(msg, description, builder, handler);
            }
            else {
                throw new YError('.usage() description must start with $0 if being used as alias for .command()');
            }
        }
        else {
            __classPrivateFieldGet(this, _YargsInstance_usage, "f").usage(msg);
            return this;
        }
    }
    usageConfiguration(config) {
        argsert('<object>', [config], arguments.length);
        __classPrivateFieldSet(this, _YargsInstance_usageConfig, config, "f");
        return this;
    }
    version(opt, msg, ver) {
        const defaultVersionOpt = 'version';
        argsert('[boolean|string] [string] [string]', [opt, msg, ver], arguments.length);
        if (__classPrivateFieldGet(this, _YargsInstance_versionOpt, "f")) {
            this[kDeleteFromParserHintObject](__classPrivateFieldGet(this, _YargsInstance_versionOpt, "f"));
            __classPrivateFieldGet(this, _YargsInstance_usage, "f").version(undefined);
            __classPrivateFieldSet(this, _YargsInstance_versionOpt, null, "f");
        }
        if (arguments.length === 0) {
            ver = this[kGuessVersion]();
            opt = defaultVersionOpt;
        }
        else if (arguments.length === 1) {
            if (opt === false) {
                return this;
            }
            ver = opt;
            opt = defaultVersionOpt;
        }
        else if (arguments.length === 2) {
            ver = msg;
            msg = undefined;
        }
        __classPrivateFieldSet(this, _YargsInstance_versionOpt, typeof opt === 'string' ? opt : defaultVersionOpt, "f");
        msg = msg || __classPrivateFieldGet(this, _YargsInstance_usage, "f").deferY18nLookup('Show version number');
        __classPrivateFieldGet(this, _YargsInstance_usage, "f").version(ver || undefined);
        this.boolean(__classPrivateFieldGet(this, _YargsInstance_versionOpt, "f"));
        this.describe(__classPrivateFieldGet(this, _YargsInstance_versionOpt, "f"), msg);
        return this;
    }
    wrap(cols) {
        argsert('<number|null|undefined>', [cols], arguments.length);
        __classPrivateFieldGet(this, _YargsInstance_usage, "f").wrap(cols);
        return this;
    }
    [(_YargsInstance_command = new WeakMap(), _YargsInstance_cwd = new WeakMap(), _YargsInstance_context = new WeakMap(), _YargsInstance_completion = new WeakMap(), _YargsInstance_completionCommand = new WeakMap(), _YargsInstance_defaultShowHiddenOpt = new WeakMap(), _YargsInstance_exitError = new WeakMap(), _YargsInstance_detectLocale = new WeakMap(), _YargsInstance_emittedWarnings = new WeakMap(), _YargsInstance_exitProcess = new WeakMap(), _YargsInstance_frozens = new WeakMap(), _YargsInstance_globalMiddleware = new WeakMap(), _YargsInstance_groups = new WeakMap(), _YargsInstance_hasOutput = new WeakMap(), _YargsInstance_helpOpt = new WeakMap(), _YargsInstance_isGlobalContext = new WeakMap(), _YargsInstance_logger = new WeakMap(), _YargsInstance_output = new WeakMap(), _YargsInstance_options = new WeakMap(), _YargsInstance_parentRequire = new WeakMap(), _YargsInstance_parserConfig = new WeakMap(), _YargsInstance_parseFn = new WeakMap(), _YargsInstance_parseContext = new WeakMap(), _YargsInstance_pkgs = new WeakMap(), _YargsInstance_preservedGroups = new WeakMap(), _YargsInstance_processArgs = new WeakMap(), _YargsInstance_recommendCommands = new WeakMap(), _YargsInstance_shim = new WeakMap(), _YargsInstance_strict = new WeakMap(), _YargsInstance_strictCommands = new WeakMap(), _YargsInstance_strictOptions = new WeakMap(), _YargsInstance_usage = new WeakMap(), _YargsInstance_usageConfig = new WeakMap(), _YargsInstance_versionOpt = new WeakMap(), _YargsInstance_validation = new WeakMap(), kCopyDoubleDash)](argv) {
        if (!argv._ || !argv['--'])
            return argv;
        argv._.push.apply(argv._, argv['--']);
        try {
            delete argv['--'];
        }
        catch (_err) { }
        return argv;
    }
    [kCreateLogger]() {
        return {
            log: (...args) => {
                if (!this[kHasParseCallback]())
                    console.log(...args);
                __classPrivateFieldSet(this, _YargsInstance_hasOutput, true, "f");
                if (__classPrivateFieldGet(this, _YargsInstance_output, "f").length)
                    __classPrivateFieldSet(this, _YargsInstance_output, __classPrivateFieldGet(this, _YargsInstance_output, "f") + '\n', "f");
                __classPrivateFieldSet(this, _YargsInstance_output, __classPrivateFieldGet(this, _YargsInstance_output, "f") + args.join(' '), "f");
            },
            error: (...args) => {
                if (!this[kHasParseCallback]())
                    console.error(...args);
                __classPrivateFieldSet(this, _YargsInstance_hasOutput, true, "f");
                if (__classPrivateFieldGet(this, _YargsInstance_output, "f").length)
                    __classPrivateFieldSet(this, _YargsInstance_output, __classPrivateFieldGet(this, _YargsInstance_output, "f") + '\n', "f");
                __classPrivateFieldSet(this, _YargsInstance_output, __classPrivateFieldGet(this, _YargsInstance_output, "f") + args.join(' '), "f");
            },
        };
    }
    [kDeleteFromParserHintObject](optionKey) {
        objectKeys(__classPrivateFieldGet(this, _YargsInstance_options, "f")).forEach((hintKey) => {
            if (((key) => key === 'configObjects')(hintKey))
                return;
            const hint = __classPrivateFieldGet(this, _YargsInstance_options, "f")[hintKey];
            if (Array.isArray(hint)) {
                if (hint.includes(optionKey))
                    hint.splice(hint.indexOf(optionKey), 1);
            }
            else if (typeof hint === 'object') {
                delete hint[optionKey];
            }
        });
        delete __classPrivateFieldGet(this, _YargsInstance_usage, "f").getDescriptions()[optionKey];
    }
    [kEmitWarning](warning, type, deduplicationId) {
        if (!__classPrivateFieldGet(this, _YargsInstance_emittedWarnings, "f")[deduplicationId]) {
            __classPrivateFieldGet(this, _YargsInstance_shim, "f").process.emitWarning(warning, type);
            __classPrivateFieldGet(this, _YargsInstance_emittedWarnings, "f")[deduplicationId] = true;
        }
    }
    [kFreeze]() {
        __classPrivateFieldGet(this, _YargsInstance_frozens, "f").push({
            options: __classPrivateFieldGet(this, _YargsInstance_options, "f"),
            configObjects: __classPrivateFieldGet(this, _YargsInstance_options, "f").configObjects.slice(0),
            exitProcess: __classPrivateFieldGet(this, _YargsInstance_exitProcess, "f"),
            groups: __classPrivateFieldGet(this, _YargsInstance_groups, "f"),
            strict: __classPrivateFieldGet(this, _YargsInstance_strict, "f"),
            strictCommands: __classPrivateFieldGet(this, _YargsInstance_strictCommands, "f"),
            strictOptions: __classPrivateFieldGet(this, _YargsInstance_strictOptions, "f"),
            completionCommand: __classPrivateFieldGet(this, _YargsInstance_completionCommand, "f"),
            output: __classPrivateFieldGet(this, _YargsInstance_output, "f"),
            exitError: __classPrivateFieldGet(this, _YargsInstance_exitError, "f"),
            hasOutput: __classPrivateFieldGet(this, _YargsInstance_hasOutput, "f"),
            parsed: this.parsed,
            parseFn: __classPrivateFieldGet(this, _YargsInstance_parseFn, "f"),
            parseContext: __classPrivateFieldGet(this, _YargsInstance_parseContext, "f"),
        });
        __classPrivateFieldGet(this, _YargsInstance_usage, "f").freeze();
        __classPrivateFieldGet(this, _YargsInstance_validation, "f").freeze();
        __classPrivateFieldGet(this, _YargsInstance_command, "f").freeze();
        __classPrivateFieldGet(this, _YargsInstance_globalMiddleware, "f").freeze();
    }
    [kGetDollarZero]() {
        let $0 = '';
        let default$0;
        if (/\b(node|iojs|electron|bun)(\.exe)?$/.test(__classPrivateFieldGet(this, _YargsInstance_shim, "f").process.argv()[0])) {
            default$0 = __classPrivateFieldGet(this, _YargsInstance_shim, "f").process.argv().slice(1, 2);
        }
        else {
            default$0 = __classPrivateFieldGet(this, _YargsInstance_shim, "f").process.argv().slice(0, 1);
        }
        $0 = default$0
            .map(x => {
            const b = this[kRebase](__classPrivateFieldGet(this, _YargsInstance_cwd, "f"), x);
            return x.match(/^(\/|([a-zA-Z]:)?\\)/) && b.length < x.length ? b : x;
        })
            .join(' ')
            .trim();
        if (__classPrivateFieldGet(this, _YargsInstance_shim, "f").getEnv('_') &&
            __classPrivateFieldGet(this, _YargsInstance_shim, "f").getProcessArgvBin() === __classPrivateFieldGet(this, _YargsInstance_shim, "f").getEnv('_')) {
            $0 = __classPrivateFieldGet(this, _YargsInstance_shim, "f")
                .getEnv('_')
                .replace(`${__classPrivateFieldGet(this, _YargsInstance_shim, "f").path.dirname(__classPrivateFieldGet(this, _YargsInstance_shim, "f").process.execPath())}/`, '');
        }
        return $0;
    }
    [kGetParserConfiguration]() {
        return __classPrivateFieldGet(this, _YargsInstance_parserConfig, "f");
    }
    [kGetUsageConfiguration]() {
        return __classPrivateFieldGet(this, _YargsInstance_usageConfig, "f");
    }
    [kGuessLocale]() {
        if (!__classPrivateFieldGet(this, _YargsInstance_detectLocale, "f"))
            return;
        const locale = __classPrivateFieldGet(this, _YargsInstance_shim, "f").getEnv('LC_ALL') ||
            __classPrivateFieldGet(this, _YargsInstance_shim, "f").getEnv('LC_MESSAGES') ||
            __classPrivateFieldGet(this, _YargsInstance_shim, "f").getEnv('LANG') ||
            __classPrivateFieldGet(this, _YargsInstance_shim, "f").getEnv('LANGUAGE') ||
            'en_US';
        this.locale(locale.replace(/[.:].*/, ''));
    }
    [kGuessVersion]() {
        const obj = this[kPkgUp]();
        return obj.version || 'unknown';
    }
    [kParsePositionalNumbers](argv) {
        const args = argv['--'] ? argv['--'] : argv._;
        for (let i = 0, arg; (arg = args[i]) !== undefined; i++) {
            if (__classPrivateFieldGet(this, _YargsInstance_shim, "f").Parser.looksLikeNumber(arg) &&
                Number.isSafeInteger(Math.floor(parseFloat(`${arg}`)))) {
                args[i] = Number(arg);
            }
        }
        return argv;
    }
    [kPkgUp](rootPath) {
        const npath = rootPath || '*';
        if (__classPrivateFieldGet(this, _YargsInstance_pkgs, "f")[npath])
            return __classPrivateFieldGet(this, _YargsInstance_pkgs, "f")[npath];
        let obj = {};
        try {
            let startDir = rootPath || __classPrivateFieldGet(this, _YargsInstance_shim, "f").mainFilename;
            if (__classPrivateFieldGet(this, _YargsInstance_shim, "f").path.extname(startDir)) {
                startDir = __classPrivateFieldGet(this, _YargsInstance_shim, "f").path.dirname(startDir);
            }
            const pkgJsonPath = __classPrivateFieldGet(this, _YargsInstance_shim, "f").findUp(startDir, (dir, names) => {
                if (names.includes('package.json')) {
                    return 'package.json';
                }
                else {
                    return undefined;
                }
            });
            assertNotStrictEqual(pkgJsonPath, undefined, __classPrivateFieldGet(this, _YargsInstance_shim, "f"));
            obj = JSON.parse(__classPrivateFieldGet(this, _YargsInstance_shim, "f").readFileSync(pkgJsonPath, 'utf8'));
        }
        catch (_noop) { }
        __classPrivateFieldGet(this, _YargsInstance_pkgs, "f")[npath] = obj || {};
        return __classPrivateFieldGet(this, _YargsInstance_pkgs, "f")[npath];
    }
    [kPopulateParserHintArray](type, keys) {
        keys = [].concat(keys);
        keys.forEach(key => {
            key = this[kSanitizeKey](key);
            __classPrivateFieldGet(this, _YargsInstance_options, "f")[type].push(key);
        });
    }
    [kPopulateParserHintSingleValueDictionary](builder, type, key, value) {
        this[kPopulateParserHintDictionary](builder, type, key, value, (type, key, value) => {
            __classPrivateFieldGet(this, _YargsInstance_options, "f")[type][key] = value;
        });
    }
    [kPopulateParserHintArrayDictionary](builder, type, key, value) {
        this[kPopulateParserHintDictionary](builder, type, key, value, (type, key, value) => {
            __classPrivateFieldGet(this, _YargsInstance_options, "f")[type][key] = (__classPrivateFieldGet(this, _YargsInstance_options, "f")[type][key] || []).concat(value);
        });
    }
    [kPopulateParserHintDictionary](builder, type, key, value, singleKeyHandler) {
        if (Array.isArray(key)) {
            key.forEach(k => {
                builder(k, value);
            });
        }
        else if (((key) => typeof key === 'object')(key)) {
            for (const k of objectKeys(key)) {
                builder(k, key[k]);
            }
        }
        else {
            singleKeyHandler(type, this[kSanitizeKey](key), value);
        }
    }
    [kSanitizeKey](key) {
        if (key === '__proto__')
            return '___proto___';
        return key;
    }
    [kSetKey](key, set) {
        this[kPopulateParserHintSingleValueDictionary](this[kSetKey].bind(this), 'key', key, set);
        return this;
    }
    [kUnfreeze]() {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        const frozen = __classPrivateFieldGet(this, _YargsInstance_frozens, "f").pop();
        assertNotStrictEqual(frozen, undefined, __classPrivateFieldGet(this, _YargsInstance_shim, "f"));
        let configObjects;
        (_a = this, _b = this, _c = this, _d = this, _e = this, _f = this, _g = this, _h = this, _j = this, _k = this, _l = this, _m = this, {
            options: ({ set value(_o) { __classPrivateFieldSet(_a, _YargsInstance_options, _o, "f"); } }).value,
            configObjects,
            exitProcess: ({ set value(_o) { __classPrivateFieldSet(_b, _YargsInstance_exitProcess, _o, "f"); } }).value,
            groups: ({ set value(_o) { __classPrivateFieldSet(_c, _YargsInstance_groups, _o, "f"); } }).value,
            output: ({ set value(_o) { __classPrivateFieldSet(_d, _YargsInstance_output, _o, "f"); } }).value,
            exitError: ({ set value(_o) { __classPrivateFieldSet(_e, _YargsInstance_exitError, _o, "f"); } }).value,
            hasOutput: ({ set value(_o) { __classPrivateFieldSet(_f, _YargsInstance_hasOutput, _o, "f"); } }).value,
            parsed: this.parsed,
            strict: ({ set value(_o) { __classPrivateFieldSet(_g, _YargsInstance_strict, _o, "f"); } }).value,
            strictCommands: ({ set value(_o) { __classPrivateFieldSet(_h, _YargsInstance_strictCommands, _o, "f"); } }).value,
            strictOptions: ({ set value(_o) { __classPrivateFieldSet(_j, _YargsInstance_strictOptions, _o, "f"); } }).value,
            completionCommand: ({ set value(_o) { __classPrivateFieldSet(_k, _YargsInstance_completionCommand, _o, "f"); } }).value,
            parseFn: ({ set value(_o) { __classPrivateFieldSet(_l, _YargsInstance_parseFn, _o, "f"); } }).value,
            parseContext: ({ set value(_o) { __classPrivateFieldSet(_m, _YargsInstance_parseContext, _o, "f"); } }).value,
        } = frozen);
        __classPrivateFieldGet(this, _YargsInstance_options, "f").configObjects = configObjects;
        __classPrivateFieldGet(this, _YargsInstance_usage, "f").unfreeze();
        __classPrivateFieldGet(this, _YargsInstance_validation, "f").unfreeze();
        __classPrivateFieldGet(this, _YargsInstance_command, "f").unfreeze();
        __classPrivateFieldGet(this, _YargsInstance_globalMiddleware, "f").unfreeze();
    }
    [kValidateAsync](validation, argv) {
        return maybeAsyncResult(argv, result => {
            validation(result);
            return result;
        });
    }
    getInternalMethods() {
        return {
            getCommandInstance: this[kGetCommandInstance].bind(this),
            getContext: this[kGetContext].bind(this),
            getHasOutput: this[kGetHasOutput].bind(this),
            getLoggerInstance: this[kGetLoggerInstance].bind(this),
            getParseContext: this[kGetParseContext].bind(this),
            getParserConfiguration: this[kGetParserConfiguration].bind(this),
            getUsageConfiguration: this[kGetUsageConfiguration].bind(this),
            getUsageInstance: this[kGetUsageInstance].bind(this),
            getValidationInstance: this[kGetValidationInstance].bind(this),
            hasParseCallback: this[kHasParseCallback].bind(this),
            isGlobalContext: this[kIsGlobalContext].bind(this),
            postProcess: this[kPostProcess].bind(this),
            reset: this[kReset].bind(this),
            runValidation: this[kRunValidation].bind(this),
            runYargsParserAndExecuteCommands: this[kRunYargsParserAndExecuteCommands].bind(this),
            setHasOutput: this[kSetHasOutput].bind(this),
        };
    }
    [kGetCommandInstance]() {
        return __classPrivateFieldGet(this, _YargsInstance_command, "f");
    }
    [kGetContext]() {
        return __classPrivateFieldGet(this, _YargsInstance_context, "f");
    }
    [kGetHasOutput]() {
        return __classPrivateFieldGet(this, _YargsInstance_hasOutput, "f");
    }
    [kGetLoggerInstance]() {
        return __classPrivateFieldGet(this, _YargsInstance_logger, "f");
    }
    [kGetParseContext]() {
        return __classPrivateFieldGet(this, _YargsInstance_parseContext, "f") || {};
    }
    [kGetUsageInstance]() {
        return __classPrivateFieldGet(this, _YargsInstance_usage, "f");
    }
    [kGetValidationInstance]() {
        return __classPrivateFieldGet(this, _YargsInstance_validation, "f");
    }
    [kHasParseCallback]() {
        return !!__classPrivateFieldGet(this, _YargsInstance_parseFn, "f");
    }
    [kIsGlobalContext]() {
        return __classPrivateFieldGet(this, _YargsInstance_isGlobalContext, "f");
    }
    [kPostProcess](argv, populateDoubleDash, calledFromCommand, runGlobalMiddleware) {
        if (calledFromCommand)
            return argv;
        if (isPromise(argv))
            return argv;
        if (!populateDoubleDash) {
            argv = this[kCopyDoubleDash](argv);
        }
        const parsePositionalNumbers = this[kGetParserConfiguration]()['parse-positional-numbers'] ||
            this[kGetParserConfiguration]()['parse-positional-numbers'] === undefined;
        if (parsePositionalNumbers) {
            argv = this[kParsePositionalNumbers](argv);
        }
        if (runGlobalMiddleware) {
            argv = applyMiddleware(argv, this, __classPrivateFieldGet(this, _YargsInstance_globalMiddleware, "f").getMiddleware(), false);
        }
        return argv;
    }
    [kReset](aliases = {}) {
        __classPrivateFieldSet(this, _YargsInstance_options, __classPrivateFieldGet(this, _YargsInstance_options, "f") || {}, "f");
        const tmpOptions = {};
        tmpOptions.local = __classPrivateFieldGet(this, _YargsInstance_options, "f").local || [];
        tmpOptions.configObjects = __classPrivateFieldGet(this, _YargsInstance_options, "f").configObjects || [];
        const localLookup = {};
        tmpOptions.local.forEach(l => {
            localLookup[l] = true;
            (aliases[l] || []).forEach(a => {
                localLookup[a] = true;
            });
        });
        Object.assign(__classPrivateFieldGet(this, _YargsInstance_preservedGroups, "f"), Object.keys(__classPrivateFieldGet(this, _YargsInstance_groups, "f")).reduce((acc, groupName) => {
            const keys = __classPrivateFieldGet(this, _YargsInstance_groups, "f")[groupName].filter(key => !(key in localLookup));
            if (keys.length > 0) {
                acc[groupName] = keys;
            }
            return acc;
        }, {}));
        __classPrivateFieldSet(this, _YargsInstance_groups, {}, "f");
        const arrayOptions = [
            'array',
            'boolean',
            'string',
            'skipValidation',
            'count',
            'normalize',
            'number',
            'hiddenOptions',
        ];
        const objectOptions = [
            'narg',
            'key',
            'alias',
            'default',
            'defaultDescription',
            'config',
            'choices',
            'demandedOptions',
            'demandedCommands',
            'deprecatedOptions',
        ];
        arrayOptions.forEach(k => {
            tmpOptions[k] = (__classPrivateFieldGet(this, _YargsInstance_options, "f")[k] || []).filter((k) => !localLookup[k]);
        });
        objectOptions.forEach((k) => {
            tmpOptions[k] = objFilter(__classPrivateFieldGet(this, _YargsInstance_options, "f")[k], k => !localLookup[k]);
        });
        tmpOptions.envPrefix = __classPrivateFieldGet(this, _YargsInstance_options, "f").envPrefix;
        __classPrivateFieldSet(this, _YargsInstance_options, tmpOptions, "f");
        __classPrivateFieldSet(this, _YargsInstance_usage, __classPrivateFieldGet(this, _YargsInstance_usage, "f")
            ? __classPrivateFieldGet(this, _YargsInstance_usage, "f").reset(localLookup)
            : usage(this, __classPrivateFieldGet(this, _YargsInstance_shim, "f")), "f");
        __classPrivateFieldSet(this, _YargsInstance_validation, __classPrivateFieldGet(this, _YargsInstance_validation, "f")
            ? __classPrivateFieldGet(this, _YargsInstance_validation, "f").reset(localLookup)
            : validation(this, __classPrivateFieldGet(this, _YargsInstance_usage, "f"), __classPrivateFieldGet(this, _YargsInstance_shim, "f")), "f");
        __classPrivateFieldSet(this, _YargsInstance_command, __classPrivateFieldGet(this, _YargsInstance_command, "f")
            ? __classPrivateFieldGet(this, _YargsInstance_command, "f").reset()
            : command(__classPrivateFieldGet(this, _YargsInstance_usage, "f"), __classPrivateFieldGet(this, _YargsInstance_validation, "f"), __classPrivateFieldGet(this, _YargsInstance_globalMiddleware, "f"), __classPrivateFieldGet(this, _YargsInstance_shim, "f")), "f");
        if (!__classPrivateFieldGet(this, _YargsInstance_completion, "f"))
            __classPrivateFieldSet(this, _YargsInstance_completion, completion(this, __classPrivateFieldGet(this, _YargsInstance_usage, "f"), __classPrivateFieldGet(this, _YargsInstance_command, "f"), __classPrivateFieldGet(this, _YargsInstance_shim, "f")), "f");
        __classPrivateFieldGet(this, _YargsInstance_globalMiddleware, "f").reset();
        __classPrivateFieldSet(this, _YargsInstance_completionCommand, null, "f");
        __classPrivateFieldSet(this, _YargsInstance_output, '', "f");
        __classPrivateFieldSet(this, _YargsInstance_exitError, null, "f");
        __classPrivateFieldSet(this, _YargsInstance_hasOutput, false, "f");
        this.parsed = false;
        return this;
    }
    [kRebase](base, dir) {
        return __classPrivateFieldGet(this, _YargsInstance_shim, "f").path.relative(base, dir);
    }
    [kRunYargsParserAndExecuteCommands](args, shortCircuit, calledFromCommand, commandIndex = 0, helpOnly = false) {
        var _a, _b, _c, _d;
        let skipValidation = !!calledFromCommand || helpOnly;
        args = args || __classPrivateFieldGet(this, _YargsInstance_processArgs, "f");
        __classPrivateFieldGet(this, _YargsInstance_options, "f").__ = __classPrivateFieldGet(this, _YargsInstance_shim, "f").y18n.__;
        __classPrivateFieldGet(this, _YargsInstance_options, "f").configuration = this[kGetParserConfiguration]();
        const populateDoubleDash = !!__classPrivateFieldGet(this, _YargsInstance_options, "f").configuration['populate--'];
        const config = Object.assign({}, __classPrivateFieldGet(this, _YargsInstance_options, "f").configuration, {
            'populate--': true,
        });
        const parsed = __classPrivateFieldGet(this, _YargsInstance_shim, "f").Parser.detailed(args, Object.assign({}, __classPrivateFieldGet(this, _YargsInstance_options, "f"), {
            configuration: { 'parse-positional-numbers': false, ...config },
        }));
        const argv = Object.assign(parsed.argv, __classPrivateFieldGet(this, _YargsInstance_parseContext, "f"));
        let argvPromise = undefined;
        const aliases = parsed.aliases;
        let helpOptSet = false;
        let versionOptSet = false;
        Object.keys(argv).forEach(key => {
            if (key === __classPrivateFieldGet(this, _YargsInstance_helpOpt, "f") && argv[key]) {
                helpOptSet = true;
            }
            else if (key === __classPrivateFieldGet(this, _YargsInstance_versionOpt, "f") && argv[key]) {
                versionOptSet = true;
            }
        });
        argv.$0 = this.$0;
        this.parsed = parsed;
        if (commandIndex === 0) {
            __classPrivateFieldGet(this, _YargsInstance_usage, "f").clearCachedHelpMessage();
        }
        try {
            this[kGuessLocale]();
            if (shortCircuit) {
                return this[kPostProcess](argv, populateDoubleDash, !!calledFromCommand, false);
            }
            if (__classPrivateFieldGet(this, _YargsInstance_helpOpt, "f")) {
                const helpCmds = [__classPrivateFieldGet(this, _YargsInstance_helpOpt, "f")]
                    .concat(aliases[__classPrivateFieldGet(this, _YargsInstance_helpOpt, "f")] || [])
                    .filter(k => k.length > 1);
                if (helpCmds.includes('' + argv._[argv._.length - 1])) {
                    argv._.pop();
                    helpOptSet = true;
                }
            }
            __classPrivateFieldSet(this, _YargsInstance_isGlobalContext, false, "f");
            const handlerKeys = __classPrivateFieldGet(this, _YargsInstance_command, "f").getCommands();
            const requestCompletions = ((_a = __classPrivateFieldGet(this, _YargsInstance_completion, "f")) === null || _a === void 0 ? void 0 : _a.completionKey)
                ? [
                    (_b = __classPrivateFieldGet(this, _YargsInstance_completion, "f")) === null || _b === void 0 ? void 0 : _b.completionKey,
                    ...((_d = this.getAliases()[(_c = __classPrivateFieldGet(this, _YargsInstance_completion, "f")) === null || _c === void 0 ? void 0 : _c.completionKey]) !== null && _d !== void 0 ? _d : []),
                ].some((key) => Object.prototype.hasOwnProperty.call(argv, key))
                : false;
            const skipRecommendation = helpOptSet || requestCompletions || helpOnly;
            if (argv._.length) {
                if (handlerKeys.length) {
                    let firstUnknownCommand;
                    for (let i = commandIndex || 0, cmd; argv._[i] !== undefined; i++) {
                        cmd = String(argv._[i]);
                        if (handlerKeys.includes(cmd) && cmd !== __classPrivateFieldGet(this, _YargsInstance_completionCommand, "f")) {
                            const innerArgv = __classPrivateFieldGet(this, _YargsInstance_command, "f").runCommand(cmd, this, parsed, i + 1, helpOnly, helpOptSet || versionOptSet || helpOnly);
                            return this[kPostProcess](innerArgv, populateDoubleDash, !!calledFromCommand, false);
                        }
                        else if (!firstUnknownCommand &&
                            cmd !== __classPrivateFieldGet(this, _YargsInstance_completionCommand, "f")) {
                            firstUnknownCommand = cmd;
                            break;
                        }
                    }
                    if (!__classPrivateFieldGet(this, _YargsInstance_command, "f").hasDefaultCommand() &&
                        __classPrivateFieldGet(this, _YargsInstance_recommendCommands, "f") &&
                        firstUnknownCommand &&
                        !skipRecommendation) {
                        __classPrivateFieldGet(this, _YargsInstance_validation, "f").recommendCommands(firstUnknownCommand, handlerKeys);
                    }
                }
                if (__classPrivateFieldGet(this, _YargsInstance_completionCommand, "f") &&
                    argv._.includes(__classPrivateFieldGet(this, _YargsInstance_completionCommand, "f")) &&
                    !requestCompletions) {
                    if (__classPrivateFieldGet(this, _YargsInstance_exitProcess, "f"))
                        setBlocking(true);
                    this.showCompletionScript();
                    this.exit(0);
                }
            }
            if (__classPrivateFieldGet(this, _YargsInstance_command, "f").hasDefaultCommand() && !skipRecommendation) {
                const innerArgv = __classPrivateFieldGet(this, _YargsInstance_command, "f").runCommand(null, this, parsed, 0, helpOnly, helpOptSet || versionOptSet || helpOnly);
                return this[kPostProcess](innerArgv, populateDoubleDash, !!calledFromCommand, false);
            }
            if (requestCompletions) {
                if (__classPrivateFieldGet(this, _YargsInstance_exitProcess, "f"))
                    setBlocking(true);
                args = [].concat(args);
                const completionArgs = args.slice(args.indexOf(`--${__classPrivateFieldGet(this, _YargsInstance_completion, "f").completionKey}`) + 1);
                __classPrivateFieldGet(this, _YargsInstance_completion, "f").getCompletion(completionArgs, (err, completions) => {
                    if (err)
                        throw new YError(err.message);
                    (completions || []).forEach(completion => {
                        __classPrivateFieldGet(this, _YargsInstance_logger, "f").log(completion);
                    });
                    this.exit(0);
                });
                return this[kPostProcess](argv, !populateDoubleDash, !!calledFromCommand, false);
            }
            if (!__classPrivateFieldGet(this, _YargsInstance_hasOutput, "f")) {
                if (helpOptSet) {
                    if (__classPrivateFieldGet(this, _YargsInstance_exitProcess, "f"))
                        setBlocking(true);
                    skipValidation = true;
                    this.showHelp(message => {
                        __classPrivateFieldGet(this, _YargsInstance_logger, "f").log(message);
                        this.exit(0);
                    });
                }
                else if (versionOptSet) {
                    if (__classPrivateFieldGet(this, _YargsInstance_exitProcess, "f"))
                        setBlocking(true);
                    skipValidation = true;
                    __classPrivateFieldGet(this, _YargsInstance_usage, "f").showVersion('log');
                    this.exit(0);
                }
            }
            if (!skipValidation && __classPrivateFieldGet(this, _YargsInstance_options, "f").skipValidation.length > 0) {
                skipValidation = Object.keys(argv).some(key => __classPrivateFieldGet(this, _YargsInstance_options, "f").skipValidation.indexOf(key) >= 0 && argv[key] === true);
            }
            if (!skipValidation) {
                if (parsed.error)
                    throw new YError(parsed.error.message);
                if (!requestCompletions) {
                    const validation = this[kRunValidation](aliases, {}, parsed.error);
                    if (!calledFromCommand) {
                        argvPromise = applyMiddleware(argv, this, __classPrivateFieldGet(this, _YargsInstance_globalMiddleware, "f").getMiddleware(), true);
                    }
                    argvPromise = this[kValidateAsync](validation, argvPromise !== null && argvPromise !== void 0 ? argvPromise : argv);
                    if (isPromise(argvPromise) && !calledFromCommand) {
                        argvPromise = argvPromise.then(() => {
                            return applyMiddleware(argv, this, __classPrivateFieldGet(this, _YargsInstance_globalMiddleware, "f").getMiddleware(), false);
                        });
                    }
                }
            }
        }
        catch (err) {
            if (err instanceof YError)
                __classPrivateFieldGet(this, _YargsInstance_usage, "f").fail(err.message, err);
            else
                throw err;
        }
        return this[kPostProcess](argvPromise !== null && argvPromise !== void 0 ? argvPromise : argv, populateDoubleDash, !!calledFromCommand, true);
    }
    [kRunValidation](aliases, positionalMap, parseErrors, isDefaultCommand) {
        const demandedOptions = { ...this.getDemandedOptions() };
        return (argv) => {
            if (parseErrors)
                throw new YError(parseErrors.message);
            __classPrivateFieldGet(this, _YargsInstance_validation, "f").nonOptionCount(argv);
            __classPrivateFieldGet(this, _YargsInstance_validation, "f").requiredArguments(argv, demandedOptions);
            let failedStrictCommands = false;
            if (__classPrivateFieldGet(this, _YargsInstance_strictCommands, "f")) {
                failedStrictCommands = __classPrivateFieldGet(this, _YargsInstance_validation, "f").unknownCommands(argv);
            }
            if (__classPrivateFieldGet(this, _YargsInstance_strict, "f") && !failedStrictCommands) {
                __classPrivateFieldGet(this, _YargsInstance_validation, "f").unknownArguments(argv, aliases, positionalMap, !!isDefaultCommand);
            }
            else if (__classPrivateFieldGet(this, _YargsInstance_strictOptions, "f")) {
                __classPrivateFieldGet(this, _YargsInstance_validation, "f").unknownArguments(argv, aliases, {}, false, false);
            }
            __classPrivateFieldGet(this, _YargsInstance_validation, "f").limitedChoices(argv);
            __classPrivateFieldGet(this, _YargsInstance_validation, "f").implications(argv);
            __classPrivateFieldGet(this, _YargsInstance_validation, "f").conflicting(argv);
        };
    }
    [kSetHasOutput]() {
        __classPrivateFieldSet(this, _YargsInstance_hasOutput, true, "f");
    }
    [kTrackManuallySetKeys](keys) {
        if (typeof keys === 'string') {
            __classPrivateFieldGet(this, _YargsInstance_options, "f").key[keys] = true;
        }
        else {
            for (const k of keys) {
                __classPrivateFieldGet(this, _YargsInstance_options, "f").key[k] = true;
            }
        }
    }
}
function isYargsInstance(y) {
    return !!y && typeof y.getInternalMethods === 'function';
}

const Yargs = YargsFactory(shim$1);

var re = {exports: {}};

var constants;
var hasRequiredConstants;

function requireConstants () {
	if (hasRequiredConstants) return constants;
	hasRequiredConstants = 1;
	const SEMVER_SPEC_VERSION = '2.0.0';
	const MAX_LENGTH = 256;
	const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER ||
	 9007199254740991;
	const MAX_SAFE_COMPONENT_LENGTH = 16;
	const MAX_SAFE_BUILD_LENGTH = MAX_LENGTH - 6;
	const RELEASE_TYPES = [
	  'major',
	  'premajor',
	  'minor',
	  'preminor',
	  'patch',
	  'prepatch',
	  'prerelease',
	];
	constants = {
	  MAX_LENGTH,
	  MAX_SAFE_COMPONENT_LENGTH,
	  MAX_SAFE_BUILD_LENGTH,
	  MAX_SAFE_INTEGER,
	  RELEASE_TYPES,
	  SEMVER_SPEC_VERSION,
	  FLAG_INCLUDE_PRERELEASE: 0b001,
	  FLAG_LOOSE: 0b010,
	};
	return constants;
}

var debug_1;
var hasRequiredDebug;

function requireDebug () {
	if (hasRequiredDebug) return debug_1;
	hasRequiredDebug = 1;
	const debug = (
	  typeof process === 'object' &&
	  process.env &&
	  process.env.NODE_DEBUG &&
	  /\bsemver\b/i.test(process.env.NODE_DEBUG)
	) ? (...args) => console.error('SEMVER', ...args)
	  : () => {};
	debug_1 = debug;
	return debug_1;
}

var hasRequiredRe;

function requireRe () {
	if (hasRequiredRe) return re.exports;
	hasRequiredRe = 1;
	(function (module, exports) {
		const {
		  MAX_SAFE_COMPONENT_LENGTH,
		  MAX_SAFE_BUILD_LENGTH,
		  MAX_LENGTH,
		} = requireConstants();
		const debug = requireDebug();
		exports = module.exports = {};
		const re = exports.re = [];
		const safeRe = exports.safeRe = [];
		const src = exports.src = [];
		const safeSrc = exports.safeSrc = [];
		const t = exports.t = {};
		let R = 0;
		const LETTERDASHNUMBER = '[a-zA-Z0-9-]';
		const safeRegexReplacements = [
		  ['\\s', 1],
		  ['\\d', MAX_LENGTH],
		  [LETTERDASHNUMBER, MAX_SAFE_BUILD_LENGTH],
		];
		const makeSafeRegex = (value) => {
		  for (const [token, max] of safeRegexReplacements) {
		    value = value
		      .split(`${token}*`).join(`${token}{0,${max}}`)
		      .split(`${token}+`).join(`${token}{1,${max}}`);
		  }
		  return value
		};
		const createToken = (name, value, isGlobal) => {
		  const safe = makeSafeRegex(value);
		  const index = R++;
		  debug(name, index, value);
		  t[name] = index;
		  src[index] = value;
		  safeSrc[index] = safe;
		  re[index] = new RegExp(value, isGlobal ? 'g' : undefined);
		  safeRe[index] = new RegExp(safe, isGlobal ? 'g' : undefined);
		};
		createToken('NUMERICIDENTIFIER', '0|[1-9]\\d*');
		createToken('NUMERICIDENTIFIERLOOSE', '\\d+');
		createToken('NONNUMERICIDENTIFIER', `\\d*[a-zA-Z-]${LETTERDASHNUMBER}*`);
		createToken('MAINVERSION', `(${src[t.NUMERICIDENTIFIER]})\\.` +
		                   `(${src[t.NUMERICIDENTIFIER]})\\.` +
		                   `(${src[t.NUMERICIDENTIFIER]})`);
		createToken('MAINVERSIONLOOSE', `(${src[t.NUMERICIDENTIFIERLOOSE]})\\.` +
		                        `(${src[t.NUMERICIDENTIFIERLOOSE]})\\.` +
		                        `(${src[t.NUMERICIDENTIFIERLOOSE]})`);
		createToken('PRERELEASEIDENTIFIER', `(?:${src[t.NONNUMERICIDENTIFIER]
		}|${src[t.NUMERICIDENTIFIER]})`);
		createToken('PRERELEASEIDENTIFIERLOOSE', `(?:${src[t.NONNUMERICIDENTIFIER]
		}|${src[t.NUMERICIDENTIFIERLOOSE]})`);
		createToken('PRERELEASE', `(?:-(${src[t.PRERELEASEIDENTIFIER]
		}(?:\\.${src[t.PRERELEASEIDENTIFIER]})*))`);
		createToken('PRERELEASELOOSE', `(?:-?(${src[t.PRERELEASEIDENTIFIERLOOSE]
		}(?:\\.${src[t.PRERELEASEIDENTIFIERLOOSE]})*))`);
		createToken('BUILDIDENTIFIER', `${LETTERDASHNUMBER}+`);
		createToken('BUILD', `(?:\\+(${src[t.BUILDIDENTIFIER]
		}(?:\\.${src[t.BUILDIDENTIFIER]})*))`);
		createToken('FULLPLAIN', `v?${src[t.MAINVERSION]
		}${src[t.PRERELEASE]}?${
		  src[t.BUILD]}?`);
		createToken('FULL', `^${src[t.FULLPLAIN]}$`);
		createToken('LOOSEPLAIN', `[v=\\s]*${src[t.MAINVERSIONLOOSE]
		}${src[t.PRERELEASELOOSE]}?${
		  src[t.BUILD]}?`);
		createToken('LOOSE', `^${src[t.LOOSEPLAIN]}$`);
		createToken('GTLT', '((?:<|>)?=?)');
		createToken('XRANGEIDENTIFIERLOOSE', `${src[t.NUMERICIDENTIFIERLOOSE]}|x|X|\\*`);
		createToken('XRANGEIDENTIFIER', `${src[t.NUMERICIDENTIFIER]}|x|X|\\*`);
		createToken('XRANGEPLAIN', `[v=\\s]*(${src[t.XRANGEIDENTIFIER]})` +
		                   `(?:\\.(${src[t.XRANGEIDENTIFIER]})` +
		                   `(?:\\.(${src[t.XRANGEIDENTIFIER]})` +
		                   `(?:${src[t.PRERELEASE]})?${
		                     src[t.BUILD]}?` +
		                   `)?)?`);
		createToken('XRANGEPLAINLOOSE', `[v=\\s]*(${src[t.XRANGEIDENTIFIERLOOSE]})` +
		                        `(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})` +
		                        `(?:\\.(${src[t.XRANGEIDENTIFIERLOOSE]})` +
		                        `(?:${src[t.PRERELEASELOOSE]})?${
		                          src[t.BUILD]}?` +
		                        `)?)?`);
		createToken('XRANGE', `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAIN]}$`);
		createToken('XRANGELOOSE', `^${src[t.GTLT]}\\s*${src[t.XRANGEPLAINLOOSE]}$`);
		createToken('COERCEPLAIN', `${'(^|[^\\d])' +
		              '(\\d{1,'}${MAX_SAFE_COMPONENT_LENGTH}})` +
		              `(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?` +
		              `(?:\\.(\\d{1,${MAX_SAFE_COMPONENT_LENGTH}}))?`);
		createToken('COERCE', `${src[t.COERCEPLAIN]}(?:$|[^\\d])`);
		createToken('COERCEFULL', src[t.COERCEPLAIN] +
		              `(?:${src[t.PRERELEASE]})?` +
		              `(?:${src[t.BUILD]})?` +
		              `(?:$|[^\\d])`);
		createToken('COERCERTL', src[t.COERCE], true);
		createToken('COERCERTLFULL', src[t.COERCEFULL], true);
		createToken('LONETILDE', '(?:~>?)');
		createToken('TILDETRIM', `(\\s*)${src[t.LONETILDE]}\\s+`, true);
		exports.tildeTrimReplace = '$1~';
		createToken('TILDE', `^${src[t.LONETILDE]}${src[t.XRANGEPLAIN]}$`);
		createToken('TILDELOOSE', `^${src[t.LONETILDE]}${src[t.XRANGEPLAINLOOSE]}$`);
		createToken('LONECARET', '(?:\\^)');
		createToken('CARETTRIM', `(\\s*)${src[t.LONECARET]}\\s+`, true);
		exports.caretTrimReplace = '$1^';
		createToken('CARET', `^${src[t.LONECARET]}${src[t.XRANGEPLAIN]}$`);
		createToken('CARETLOOSE', `^${src[t.LONECARET]}${src[t.XRANGEPLAINLOOSE]}$`);
		createToken('COMPARATORLOOSE', `^${src[t.GTLT]}\\s*(${src[t.LOOSEPLAIN]})$|^$`);
		createToken('COMPARATOR', `^${src[t.GTLT]}\\s*(${src[t.FULLPLAIN]})$|^$`);
		createToken('COMPARATORTRIM', `(\\s*)${src[t.GTLT]
		}\\s*(${src[t.LOOSEPLAIN]}|${src[t.XRANGEPLAIN]})`, true);
		exports.comparatorTrimReplace = '$1$2$3';
		createToken('HYPHENRANGE', `^\\s*(${src[t.XRANGEPLAIN]})` +
		                   `\\s+-\\s+` +
		                   `(${src[t.XRANGEPLAIN]})` +
		                   `\\s*$`);
		createToken('HYPHENRANGELOOSE', `^\\s*(${src[t.XRANGEPLAINLOOSE]})` +
		                        `\\s+-\\s+` +
		                        `(${src[t.XRANGEPLAINLOOSE]})` +
		                        `\\s*$`);
		createToken('STAR', '(<|>)?=?\\s*\\*');
		createToken('GTE0', '^\\s*>=\\s*0\\.0\\.0\\s*$');
		createToken('GTE0PRE', '^\\s*>=\\s*0\\.0\\.0-0\\s*$'); 
	} (re, re.exports));
	return re.exports;
}

var parseOptions_1;
var hasRequiredParseOptions;

function requireParseOptions () {
	if (hasRequiredParseOptions) return parseOptions_1;
	hasRequiredParseOptions = 1;
	const looseOption = Object.freeze({ loose: true });
	const emptyOpts = Object.freeze({ });
	const parseOptions = options => {
	  if (!options) {
	    return emptyOpts
	  }
	  if (typeof options !== 'object') {
	    return looseOption
	  }
	  return options
	};
	parseOptions_1 = parseOptions;
	return parseOptions_1;
}

var identifiers;
var hasRequiredIdentifiers;

function requireIdentifiers () {
	if (hasRequiredIdentifiers) return identifiers;
	hasRequiredIdentifiers = 1;
	const numeric = /^[0-9]+$/;
	const compareIdentifiers = (a, b) => {
	  if (typeof a === 'number' && typeof b === 'number') {
	    return a === b ? 0 : a < b ? -1 : 1
	  }
	  const anum = numeric.test(a);
	  const bnum = numeric.test(b);
	  if (anum && bnum) {
	    a = +a;
	    b = +b;
	  }
	  return a === b ? 0
	    : (anum && !bnum) ? -1
	    : (bnum && !anum) ? 1
	    : a < b ? -1
	    : 1
	};
	const rcompareIdentifiers = (a, b) => compareIdentifiers(b, a);
	identifiers = {
	  compareIdentifiers,
	  rcompareIdentifiers,
	};
	return identifiers;
}

var semver$1;
var hasRequiredSemver$1;

function requireSemver$1 () {
	if (hasRequiredSemver$1) return semver$1;
	hasRequiredSemver$1 = 1;
	const debug = requireDebug();
	const { MAX_LENGTH, MAX_SAFE_INTEGER } = requireConstants();
	const { safeRe: re, t } = requireRe();
	const parseOptions = requireParseOptions();
	const { compareIdentifiers } = requireIdentifiers();
	const isPrereleaseIdentifier = (prerelease, identifier) => {
	  const identifiers = identifier.split('.');
	  if (identifiers.length > prerelease.length) {
	    return false
	  }
	  for (let i = 0; i < identifiers.length; i++) {
	    if (compareIdentifiers(prerelease[i], identifiers[i]) !== 0) {
	      return false
	    }
	  }
	  return true
	};
	class SemVer {
	  constructor (version, options) {
	    options = parseOptions(options);
	    if (version instanceof SemVer) {
	      if (version.loose === !!options.loose &&
	        version.includePrerelease === !!options.includePrerelease) {
	        return version
	      } else {
	        version = version.version;
	      }
	    } else if (typeof version !== 'string') {
	      throw new TypeError(`Invalid version. Must be a string. Got type "${typeof version}".`)
	    }
	    if (version.length > MAX_LENGTH) {
	      throw new TypeError(
	        `version is longer than ${MAX_LENGTH} characters`
	      )
	    }
	    debug('SemVer', version, options);
	    this.options = options;
	    this.loose = !!options.loose;
	    this.includePrerelease = !!options.includePrerelease;
	    const m = version.trim().match(options.loose ? re[t.LOOSE] : re[t.FULL]);
	    if (!m) {
	      throw new TypeError(`Invalid Version: ${version}`)
	    }
	    this.raw = version;
	    this.major = +m[1];
	    this.minor = +m[2];
	    this.patch = +m[3];
	    if (this.major > MAX_SAFE_INTEGER || this.major < 0) {
	      throw new TypeError('Invalid major version')
	    }
	    if (this.minor > MAX_SAFE_INTEGER || this.minor < 0) {
	      throw new TypeError('Invalid minor version')
	    }
	    if (this.patch > MAX_SAFE_INTEGER || this.patch < 0) {
	      throw new TypeError('Invalid patch version')
	    }
	    if (!m[4]) {
	      this.prerelease = [];
	    } else {
	      this.prerelease = m[4].split('.').map((id) => {
	        if (/^[0-9]+$/.test(id)) {
	          const num = +id;
	          if (num >= 0 && num < MAX_SAFE_INTEGER) {
	            return num
	          }
	        }
	        return id
	      });
	    }
	    this.build = m[5] ? m[5].split('.') : [];
	    this.format();
	  }
	  format () {
	    this.version = `${this.major}.${this.minor}.${this.patch}`;
	    if (this.prerelease.length) {
	      this.version += `-${this.prerelease.join('.')}`;
	    }
	    return this.version
	  }
	  toString () {
	    return this.version
	  }
	  compare (other) {
	    debug('SemVer.compare', this.version, this.options, other);
	    if (!(other instanceof SemVer)) {
	      if (typeof other === 'string' && other === this.version) {
	        return 0
	      }
	      other = new SemVer(other, this.options);
	    }
	    if (other.version === this.version) {
	      return 0
	    }
	    return this.compareMain(other) || this.comparePre(other)
	  }
	  compareMain (other) {
	    if (!(other instanceof SemVer)) {
	      other = new SemVer(other, this.options);
	    }
	    if (this.major < other.major) {
	      return -1
	    }
	    if (this.major > other.major) {
	      return 1
	    }
	    if (this.minor < other.minor) {
	      return -1
	    }
	    if (this.minor > other.minor) {
	      return 1
	    }
	    if (this.patch < other.patch) {
	      return -1
	    }
	    if (this.patch > other.patch) {
	      return 1
	    }
	    return 0
	  }
	  comparePre (other) {
	    if (!(other instanceof SemVer)) {
	      other = new SemVer(other, this.options);
	    }
	    if (this.prerelease.length && !other.prerelease.length) {
	      return -1
	    } else if (!this.prerelease.length && other.prerelease.length) {
	      return 1
	    } else if (!this.prerelease.length && !other.prerelease.length) {
	      return 0
	    }
	    let i = 0;
	    do {
	      const a = this.prerelease[i];
	      const b = other.prerelease[i];
	      debug('prerelease compare', i, a, b);
	      if (a === undefined && b === undefined) {
	        return 0
	      } else if (b === undefined) {
	        return 1
	      } else if (a === undefined) {
	        return -1
	      } else if (a === b) {
	        continue
	      } else {
	        return compareIdentifiers(a, b)
	      }
	    } while (++i)
	  }
	  compareBuild (other) {
	    if (!(other instanceof SemVer)) {
	      other = new SemVer(other, this.options);
	    }
	    let i = 0;
	    do {
	      const a = this.build[i];
	      const b = other.build[i];
	      debug('build compare', i, a, b);
	      if (a === undefined && b === undefined) {
	        return 0
	      } else if (b === undefined) {
	        return 1
	      } else if (a === undefined) {
	        return -1
	      } else if (a === b) {
	        continue
	      } else {
	        return compareIdentifiers(a, b)
	      }
	    } while (++i)
	  }
	  inc (release, identifier, identifierBase) {
	    if (release.startsWith('pre')) {
	      if (!identifier && identifierBase === false) {
	        throw new Error('invalid increment argument: identifier is empty')
	      }
	      if (identifier) {
	        const match = `-${identifier}`.match(this.options.loose ? re[t.PRERELEASELOOSE] : re[t.PRERELEASE]);
	        if (!match || match[1] !== identifier) {
	          throw new Error(`invalid identifier: ${identifier}`)
	        }
	      }
	    }
	    switch (release) {
	      case 'premajor':
	        this.prerelease.length = 0;
	        this.patch = 0;
	        this.minor = 0;
	        this.major++;
	        this.inc('pre', identifier, identifierBase);
	        break
	      case 'preminor':
	        this.prerelease.length = 0;
	        this.patch = 0;
	        this.minor++;
	        this.inc('pre', identifier, identifierBase);
	        break
	      case 'prepatch':
	        this.prerelease.length = 0;
	        this.inc('patch', identifier, identifierBase);
	        this.inc('pre', identifier, identifierBase);
	        break
	      case 'prerelease':
	        if (this.prerelease.length === 0) {
	          this.inc('patch', identifier, identifierBase);
	        }
	        this.inc('pre', identifier, identifierBase);
	        break
	      case 'release':
	        if (this.prerelease.length === 0) {
	          throw new Error(`version ${this.raw} is not a prerelease`)
	        }
	        this.prerelease.length = 0;
	        break
	      case 'major':
	        if (
	          this.minor !== 0 ||
	          this.patch !== 0 ||
	          this.prerelease.length === 0
	        ) {
	          this.major++;
	        }
	        this.minor = 0;
	        this.patch = 0;
	        this.prerelease = [];
	        break
	      case 'minor':
	        if (this.patch !== 0 || this.prerelease.length === 0) {
	          this.minor++;
	        }
	        this.patch = 0;
	        this.prerelease = [];
	        break
	      case 'patch':
	        if (this.prerelease.length === 0) {
	          this.patch++;
	        }
	        this.prerelease = [];
	        break
	      case 'pre': {
	        const base = Number(identifierBase) ? 1 : 0;
	        if (this.prerelease.length === 0) {
	          this.prerelease = [base];
	        } else {
	          let i = this.prerelease.length;
	          while (--i >= 0) {
	            if (typeof this.prerelease[i] === 'number') {
	              this.prerelease[i]++;
	              i = -2;
	            }
	          }
	          if (i === -1) {
	            if (identifier === this.prerelease.join('.') && identifierBase === false) {
	              throw new Error('invalid increment argument: identifier already exists')
	            }
	            this.prerelease.push(base);
	          }
	        }
	        if (identifier) {
	          let prerelease = [identifier, base];
	          if (identifierBase === false) {
	            prerelease = [identifier];
	          }
	          if (isPrereleaseIdentifier(this.prerelease, identifier)) {
	            const prereleaseBase = this.prerelease[identifier.split('.').length];
	            if (isNaN(prereleaseBase)) {
	              this.prerelease = prerelease;
	            }
	          } else {
	            this.prerelease = prerelease;
	          }
	        }
	        break
	      }
	      default:
	        throw new Error(`invalid increment argument: ${release}`)
	    }
	    this.raw = this.format();
	    if (this.build.length) {
	      this.raw += `+${this.build.join('.')}`;
	    }
	    return this
	  }
	}
	semver$1 = SemVer;
	return semver$1;
}

var parse_1;
var hasRequiredParse;

function requireParse () {
	if (hasRequiredParse) return parse_1;
	hasRequiredParse = 1;
	const SemVer = requireSemver$1();
	const parse = (version, options, throwErrors = false) => {
	  if (version instanceof SemVer) {
	    return version
	  }
	  try {
	    return new SemVer(version, options)
	  } catch (er) {
	    if (!throwErrors) {
	      return null
	    }
	    throw er
	  }
	};
	parse_1 = parse;
	return parse_1;
}

var valid_1;
var hasRequiredValid$1;

function requireValid$1 () {
	if (hasRequiredValid$1) return valid_1;
	hasRequiredValid$1 = 1;
	const parse = requireParse();
	const valid = (version, options) => {
	  const v = parse(version, options);
	  return v ? v.version : null
	};
	valid_1 = valid;
	return valid_1;
}

var clean_1;
var hasRequiredClean;

function requireClean () {
	if (hasRequiredClean) return clean_1;
	hasRequiredClean = 1;
	const parse = requireParse();
	const clean = (version, options) => {
	  const s = parse(version.trim().replace(/^[=v]+/, ''), options);
	  return s ? s.version : null
	};
	clean_1 = clean;
	return clean_1;
}

var inc_1;
var hasRequiredInc;

function requireInc () {
	if (hasRequiredInc) return inc_1;
	hasRequiredInc = 1;
	const SemVer = requireSemver$1();
	const inc = (version, release, options, identifier, identifierBase) => {
	  if (typeof (options) === 'string') {
	    identifierBase = identifier;
	    identifier = options;
	    options = undefined;
	  }
	  try {
	    return new SemVer(
	      version instanceof SemVer ? version.version : version,
	      options
	    ).inc(release, identifier, identifierBase).version
	  } catch (er) {
	    return null
	  }
	};
	inc_1 = inc;
	return inc_1;
}

var diff_1;
var hasRequiredDiff;

function requireDiff () {
	if (hasRequiredDiff) return diff_1;
	hasRequiredDiff = 1;
	const parse = requireParse();
	const diff = (version1, version2) => {
	  const v1 = parse(version1, null, true);
	  const v2 = parse(version2, null, true);
	  const comparison = v1.compare(v2);
	  if (comparison === 0) {
	    return null
	  }
	  const v1Higher = comparison > 0;
	  const highVersion = v1Higher ? v1 : v2;
	  const lowVersion = v1Higher ? v2 : v1;
	  const highHasPre = !!highVersion.prerelease.length;
	  const lowHasPre = !!lowVersion.prerelease.length;
	  if (lowHasPre && !highHasPre) {
	    if (!lowVersion.patch && !lowVersion.minor) {
	      return 'major'
	    }
	    if (lowVersion.compareMain(highVersion) === 0) {
	      if (lowVersion.minor && !lowVersion.patch) {
	        return 'minor'
	      }
	      return 'patch'
	    }
	  }
	  const prefix = highHasPre ? 'pre' : '';
	  if (v1.major !== v2.major) {
	    return prefix + 'major'
	  }
	  if (v1.minor !== v2.minor) {
	    return prefix + 'minor'
	  }
	  if (v1.patch !== v2.patch) {
	    return prefix + 'patch'
	  }
	  return 'prerelease'
	};
	diff_1 = diff;
	return diff_1;
}

var major_1;
var hasRequiredMajor;

function requireMajor () {
	if (hasRequiredMajor) return major_1;
	hasRequiredMajor = 1;
	const SemVer = requireSemver$1();
	const major = (a, loose) => new SemVer(a, loose).major;
	major_1 = major;
	return major_1;
}

var minor_1;
var hasRequiredMinor;

function requireMinor () {
	if (hasRequiredMinor) return minor_1;
	hasRequiredMinor = 1;
	const SemVer = requireSemver$1();
	const minor = (a, loose) => new SemVer(a, loose).minor;
	minor_1 = minor;
	return minor_1;
}

var patch_1;
var hasRequiredPatch;

function requirePatch () {
	if (hasRequiredPatch) return patch_1;
	hasRequiredPatch = 1;
	const SemVer = requireSemver$1();
	const patch = (a, loose) => new SemVer(a, loose).patch;
	patch_1 = patch;
	return patch_1;
}

var prerelease_1;
var hasRequiredPrerelease;

function requirePrerelease () {
	if (hasRequiredPrerelease) return prerelease_1;
	hasRequiredPrerelease = 1;
	const parse = requireParse();
	const prerelease = (version, options) => {
	  const parsed = parse(version, options);
	  return (parsed && parsed.prerelease.length) ? parsed.prerelease : null
	};
	prerelease_1 = prerelease;
	return prerelease_1;
}

var compare_1;
var hasRequiredCompare;

function requireCompare () {
	if (hasRequiredCompare) return compare_1;
	hasRequiredCompare = 1;
	const SemVer = requireSemver$1();
	const compare = (a, b, loose) =>
	  new SemVer(a, loose).compare(new SemVer(b, loose));
	compare_1 = compare;
	return compare_1;
}

var rcompare_1;
var hasRequiredRcompare;

function requireRcompare () {
	if (hasRequiredRcompare) return rcompare_1;
	hasRequiredRcompare = 1;
	const compare = requireCompare();
	const rcompare = (a, b, loose) => compare(b, a, loose);
	rcompare_1 = rcompare;
	return rcompare_1;
}

var compareLoose_1;
var hasRequiredCompareLoose;

function requireCompareLoose () {
	if (hasRequiredCompareLoose) return compareLoose_1;
	hasRequiredCompareLoose = 1;
	const compare = requireCompare();
	const compareLoose = (a, b) => compare(a, b, true);
	compareLoose_1 = compareLoose;
	return compareLoose_1;
}

var compareBuild_1;
var hasRequiredCompareBuild;

function requireCompareBuild () {
	if (hasRequiredCompareBuild) return compareBuild_1;
	hasRequiredCompareBuild = 1;
	const SemVer = requireSemver$1();
	const compareBuild = (a, b, loose) => {
	  const versionA = new SemVer(a, loose);
	  const versionB = new SemVer(b, loose);
	  return versionA.compare(versionB) || versionA.compareBuild(versionB)
	};
	compareBuild_1 = compareBuild;
	return compareBuild_1;
}

var sort_1;
var hasRequiredSort;

function requireSort () {
	if (hasRequiredSort) return sort_1;
	hasRequiredSort = 1;
	const compareBuild = requireCompareBuild();
	const sort = (list, loose) => list.sort((a, b) => compareBuild(a, b, loose));
	sort_1 = sort;
	return sort_1;
}

var rsort_1;
var hasRequiredRsort;

function requireRsort () {
	if (hasRequiredRsort) return rsort_1;
	hasRequiredRsort = 1;
	const compareBuild = requireCompareBuild();
	const rsort = (list, loose) => list.sort((a, b) => compareBuild(b, a, loose));
	rsort_1 = rsort;
	return rsort_1;
}

var gt_1;
var hasRequiredGt;

function requireGt () {
	if (hasRequiredGt) return gt_1;
	hasRequiredGt = 1;
	const compare = requireCompare();
	const gt = (a, b, loose) => compare(a, b, loose) > 0;
	gt_1 = gt;
	return gt_1;
}

var lt_1;
var hasRequiredLt;

function requireLt () {
	if (hasRequiredLt) return lt_1;
	hasRequiredLt = 1;
	const compare = requireCompare();
	const lt = (a, b, loose) => compare(a, b, loose) < 0;
	lt_1 = lt;
	return lt_1;
}

var eq_1;
var hasRequiredEq;

function requireEq () {
	if (hasRequiredEq) return eq_1;
	hasRequiredEq = 1;
	const compare = requireCompare();
	const eq = (a, b, loose) => compare(a, b, loose) === 0;
	eq_1 = eq;
	return eq_1;
}

var neq_1;
var hasRequiredNeq;

function requireNeq () {
	if (hasRequiredNeq) return neq_1;
	hasRequiredNeq = 1;
	const compare = requireCompare();
	const neq = (a, b, loose) => compare(a, b, loose) !== 0;
	neq_1 = neq;
	return neq_1;
}

var gte_1;
var hasRequiredGte;

function requireGte () {
	if (hasRequiredGte) return gte_1;
	hasRequiredGte = 1;
	const compare = requireCompare();
	const gte = (a, b, loose) => compare(a, b, loose) >= 0;
	gte_1 = gte;
	return gte_1;
}

var lte_1;
var hasRequiredLte;

function requireLte () {
	if (hasRequiredLte) return lte_1;
	hasRequiredLte = 1;
	const compare = requireCompare();
	const lte = (a, b, loose) => compare(a, b, loose) <= 0;
	lte_1 = lte;
	return lte_1;
}

var cmp_1;
var hasRequiredCmp;

function requireCmp () {
	if (hasRequiredCmp) return cmp_1;
	hasRequiredCmp = 1;
	const eq = requireEq();
	const neq = requireNeq();
	const gt = requireGt();
	const gte = requireGte();
	const lt = requireLt();
	const lte = requireLte();
	const cmp = (a, op, b, loose) => {
	  switch (op) {
	    case '===':
	      if (typeof a === 'object') {
	        a = a.version;
	      }
	      if (typeof b === 'object') {
	        b = b.version;
	      }
	      return a === b
	    case '!==':
	      if (typeof a === 'object') {
	        a = a.version;
	      }
	      if (typeof b === 'object') {
	        b = b.version;
	      }
	      return a !== b
	    case '':
	    case '=':
	    case '==':
	      return eq(a, b, loose)
	    case '!=':
	      return neq(a, b, loose)
	    case '>':
	      return gt(a, b, loose)
	    case '>=':
	      return gte(a, b, loose)
	    case '<':
	      return lt(a, b, loose)
	    case '<=':
	      return lte(a, b, loose)
	    default:
	      throw new TypeError(`Invalid operator: ${op}`)
	  }
	};
	cmp_1 = cmp;
	return cmp_1;
}

var coerce_1;
var hasRequiredCoerce;

function requireCoerce () {
	if (hasRequiredCoerce) return coerce_1;
	hasRequiredCoerce = 1;
	const SemVer = requireSemver$1();
	const parse = requireParse();
	const { safeRe: re, t } = requireRe();
	const coerce = (version, options) => {
	  if (version instanceof SemVer) {
	    return version
	  }
	  if (typeof version === 'number') {
	    version = String(version);
	  }
	  if (typeof version !== 'string') {
	    return null
	  }
	  options = options || {};
	  let match = null;
	  if (!options.rtl) {
	    match = version.match(options.includePrerelease ? re[t.COERCEFULL] : re[t.COERCE]);
	  } else {
	    const coerceRtlRegex = options.includePrerelease ? re[t.COERCERTLFULL] : re[t.COERCERTL];
	    let next;
	    while ((next = coerceRtlRegex.exec(version)) &&
	        (!match || match.index + match[0].length !== version.length)
	    ) {
	      if (!match ||
	            next.index + next[0].length !== match.index + match[0].length) {
	        match = next;
	      }
	      coerceRtlRegex.lastIndex = next.index + next[1].length + next[2].length;
	    }
	    coerceRtlRegex.lastIndex = -1;
	  }
	  if (match === null) {
	    return null
	  }
	  const major = match[2];
	  const minor = match[3] || '0';
	  const patch = match[4] || '0';
	  const prerelease = options.includePrerelease && match[5] ? `-${match[5]}` : '';
	  const build = options.includePrerelease && match[6] ? `+${match[6]}` : '';
	  return parse(`${major}.${minor}.${patch}${prerelease}${build}`, options)
	};
	coerce_1 = coerce;
	return coerce_1;
}

var truncate_1;
var hasRequiredTruncate;

function requireTruncate () {
	if (hasRequiredTruncate) return truncate_1;
	hasRequiredTruncate = 1;
	const parse = requireParse();
	const constants = requireConstants();
	const SemVer = requireSemver$1();
	const truncate = (version, truncation, options) => {
	  if (!constants.RELEASE_TYPES.includes(truncation)) {
	    return null
	  }
	  const clonedVersion = cloneInputVersion(version, options);
	  return clonedVersion && doTruncation(clonedVersion, truncation)
	};
	const cloneInputVersion = (version, options) => {
	  const versionStringToParse = (
	    version instanceof SemVer ? version.version : version
	  );
	  return parse(versionStringToParse, options)
	};
	const doTruncation = (version, truncation) => {
	  if (isPrerelease(truncation)) {
	    return version.version
	  }
	  version.prerelease = [];
	  switch (truncation) {
	    case 'major':
	      version.minor = 0;
	      version.patch = 0;
	      break
	    case 'minor':
	      version.patch = 0;
	      break
	  }
	  return version.format()
	};
	const isPrerelease = (type) => {
	  return type.startsWith('pre')
	};
	truncate_1 = truncate;
	return truncate_1;
}

var lrucache;
var hasRequiredLrucache;

function requireLrucache () {
	if (hasRequiredLrucache) return lrucache;
	hasRequiredLrucache = 1;
	class LRUCache {
	  constructor () {
	    this.max = 1000;
	    this.map = new Map();
	  }
	  get (key) {
	    const value = this.map.get(key);
	    if (value === undefined) {
	      return undefined
	    } else {
	      this.map.delete(key);
	      this.map.set(key, value);
	      return value
	    }
	  }
	  delete (key) {
	    return this.map.delete(key)
	  }
	  set (key, value) {
	    const deleted = this.delete(key);
	    if (!deleted && value !== undefined) {
	      if (this.map.size >= this.max) {
	        const firstKey = this.map.keys().next().value;
	        this.delete(firstKey);
	      }
	      this.map.set(key, value);
	    }
	    return this
	  }
	}
	lrucache = LRUCache;
	return lrucache;
}

var range;
var hasRequiredRange;

function requireRange () {
	if (hasRequiredRange) return range;
	hasRequiredRange = 1;
	const SPACE_CHARACTERS = /\s+/g;
	class Range {
	  constructor (range, options) {
	    options = parseOptions(options);
	    if (range instanceof Range) {
	      if (
	        range.loose === !!options.loose &&
	        range.includePrerelease === !!options.includePrerelease
	      ) {
	        return range
	      } else {
	        return new Range(range.raw, options)
	      }
	    }
	    if (range instanceof Comparator) {
	      this.raw = range.value;
	      this.set = [[range]];
	      this.formatted = undefined;
	      return this
	    }
	    this.options = options;
	    this.loose = !!options.loose;
	    this.includePrerelease = !!options.includePrerelease;
	    this.raw = range.trim().replace(SPACE_CHARACTERS, ' ');
	    this.set = this.raw
	      .split('||')
	      .map(r => this.parseRange(r.trim()))
	      .filter(c => c.length);
	    if (!this.set.length) {
	      throw new TypeError(`Invalid SemVer Range: ${this.raw}`)
	    }
	    if (this.set.length > 1) {
	      const first = this.set[0];
	      this.set = this.set.filter(c => !isNullSet(c[0]));
	      if (this.set.length === 0) {
	        this.set = [first];
	      } else if (this.set.length > 1) {
	        for (const c of this.set) {
	          if (c.length === 1 && isAny(c[0])) {
	            this.set = [c];
	            break
	          }
	        }
	      }
	    }
	    this.formatted = undefined;
	  }
	  get range () {
	    if (this.formatted === undefined) {
	      this.formatted = '';
	      for (let i = 0; i < this.set.length; i++) {
	        if (i > 0) {
	          this.formatted += '||';
	        }
	        const comps = this.set[i];
	        for (let k = 0; k < comps.length; k++) {
	          if (k > 0) {
	            this.formatted += ' ';
	          }
	          this.formatted += comps[k].toString().trim();
	        }
	      }
	    }
	    return this.formatted
	  }
	  format () {
	    return this.range
	  }
	  toString () {
	    return this.range
	  }
	  parseRange (range) {
	    range = range.replace(BUILDSTRIPRE, '');
	    const memoOpts =
	      (this.options.includePrerelease && FLAG_INCLUDE_PRERELEASE) |
	      (this.options.loose && FLAG_LOOSE);
	    const memoKey = memoOpts + ':' + range;
	    const cached = cache.get(memoKey);
	    if (cached) {
	      return cached
	    }
	    const loose = this.options.loose;
	    const hr = loose ? re[t.HYPHENRANGELOOSE] : re[t.HYPHENRANGE];
	    range = range.replace(hr, hyphenReplace(this.options.includePrerelease));
	    debug('hyphen replace', range);
	    range = range.replace(re[t.COMPARATORTRIM], comparatorTrimReplace);
	    debug('comparator trim', range);
	    range = range.replace(re[t.TILDETRIM], tildeTrimReplace);
	    debug('tilde trim', range);
	    range = range.replace(re[t.CARETTRIM], caretTrimReplace);
	    debug('caret trim', range);
	    let rangeList = range
	      .split(' ')
	      .map(comp => parseComparator(comp, this.options))
	      .join(' ')
	      .split(/\s+/)
	      .map(comp => replaceGTE0(comp, this.options));
	    if (loose) {
	      rangeList = rangeList.filter(comp => {
	        debug('loose invalid filter', comp, this.options);
	        return !!comp.match(re[t.COMPARATORLOOSE])
	      });
	    }
	    debug('range list', rangeList);
	    const rangeMap = new Map();
	    const comparators = rangeList.map(comp => new Comparator(comp, this.options));
	    for (const comp of comparators) {
	      if (isNullSet(comp)) {
	        return [comp]
	      }
	      rangeMap.set(comp.value, comp);
	    }
	    if (rangeMap.size > 1 && rangeMap.has('')) {
	      rangeMap.delete('');
	    }
	    const result = [...rangeMap.values()];
	    cache.set(memoKey, result);
	    return result
	  }
	  intersects (range, options) {
	    if (!(range instanceof Range)) {
	      throw new TypeError('a Range is required')
	    }
	    return this.set.some((thisComparators) => {
	      return (
	        isSatisfiable(thisComparators, options) &&
	        range.set.some((rangeComparators) => {
	          return (
	            isSatisfiable(rangeComparators, options) &&
	            thisComparators.every((thisComparator) => {
	              return rangeComparators.every((rangeComparator) => {
	                return thisComparator.intersects(rangeComparator, options)
	              })
	            })
	          )
	        })
	      )
	    })
	  }
	  test (version) {
	    if (!version) {
	      return false
	    }
	    if (typeof version === 'string') {
	      try {
	        version = new SemVer(version, this.options);
	      } catch (er) {
	        return false
	      }
	    }
	    for (let i = 0; i < this.set.length; i++) {
	      if (testSet(this.set[i], version, this.options)) {
	        return true
	      }
	    }
	    return false
	  }
	}
	range = Range;
	const LRU = requireLrucache();
	const cache = new LRU();
	const parseOptions = requireParseOptions();
	const Comparator = requireComparator();
	const debug = requireDebug();
	const SemVer = requireSemver$1();
	const {
	  safeRe: re,
	  src,
	  t,
	  comparatorTrimReplace,
	  tildeTrimReplace,
	  caretTrimReplace,
	} = requireRe();
	const { FLAG_INCLUDE_PRERELEASE, FLAG_LOOSE } = requireConstants();
	const BUILDSTRIPRE = new RegExp(src[t.BUILD], 'g');
	const isNullSet = c => c.value === '<0.0.0-0';
	const isAny = c => c.value === '';
	const isSatisfiable = (comparators, options) => {
	  let result = true;
	  const remainingComparators = comparators.slice();
	  let testComparator = remainingComparators.pop();
	  while (result && remainingComparators.length) {
	    result = remainingComparators.every((otherComparator) => {
	      return testComparator.intersects(otherComparator, options)
	    });
	    testComparator = remainingComparators.pop();
	  }
	  return result
	};
	const parseComparator = (comp, options) => {
	  comp = comp.replace(re[t.BUILD], '');
	  debug('comp', comp, options);
	  comp = replaceCarets(comp, options);
	  debug('caret', comp);
	  comp = replaceTildes(comp, options);
	  debug('tildes', comp);
	  comp = replaceXRanges(comp, options);
	  debug('xrange', comp);
	  comp = replaceStars(comp, options);
	  debug('stars', comp);
	  return comp
	};
	const isX = id => !id || id.toLowerCase() === 'x' || id === '*';
	const invalidXRangeOrder = (M, m, p) => (
	  (isX(M) && !isX(m)) ||
	  (isX(m) && p && !isX(p))
	);
	const replaceTildes = (comp, options) => {
	  return comp
	    .trim()
	    .split(/\s+/)
	    .map((c) => replaceTilde(c, options))
	    .join(' ')
	};
	const replaceTilde = (comp, options) => {
	  const r = options.loose ? re[t.TILDELOOSE] : re[t.TILDE];
	  const z = options.includePrerelease ? '-0' : '';
	  return comp.replace(r, (_, M, m, p, pr) => {
	    debug('tilde', comp, _, M, m, p, pr);
	    let ret;
	    if (isX(M)) {
	      ret = '';
	    } else if (isX(m)) {
	      ret = `>=${M}.0.0${z} <${+M + 1}.0.0-0`;
	    } else if (isX(p)) {
	      ret = `>=${M}.${m}.0${z} <${M}.${+m + 1}.0-0`;
	    } else if (pr) {
	      debug('replaceTilde pr', pr);
	      ret = `>=${M}.${m}.${p}-${pr
	      } <${M}.${+m + 1}.0-0`;
	    } else {
	      ret = `>=${M}.${m}.${p
	      } <${M}.${+m + 1}.0-0`;
	    }
	    debug('tilde return', ret);
	    return ret
	  })
	};
	const replaceCarets = (comp, options) => {
	  return comp
	    .trim()
	    .split(/\s+/)
	    .map((c) => replaceCaret(c, options))
	    .join(' ')
	};
	const replaceCaret = (comp, options) => {
	  debug('caret', comp, options);
	  const r = options.loose ? re[t.CARETLOOSE] : re[t.CARET];
	  const z = options.includePrerelease ? '-0' : '';
	  return comp.replace(r, (_, M, m, p, pr) => {
	    debug('caret', comp, _, M, m, p, pr);
	    let ret;
	    if (isX(M)) {
	      ret = '';
	    } else if (isX(m)) {
	      ret = `>=${M}.0.0${z} <${+M + 1}.0.0-0`;
	    } else if (isX(p)) {
	      if (M === '0') {
	        ret = `>=${M}.${m}.0${z} <${M}.${+m + 1}.0-0`;
	      } else {
	        ret = `>=${M}.${m}.0${z} <${+M + 1}.0.0-0`;
	      }
	    } else if (pr) {
	      debug('replaceCaret pr', pr);
	      if (M === '0') {
	        if (m === '0') {
	          ret = `>=${M}.${m}.${p}-${pr
	          } <${M}.${m}.${+p + 1}-0`;
	        } else {
	          ret = `>=${M}.${m}.${p}-${pr
	          } <${M}.${+m + 1}.0-0`;
	        }
	      } else {
	        ret = `>=${M}.${m}.${p}-${pr
	        } <${+M + 1}.0.0-0`;
	      }
	    } else {
	      debug('no pr');
	      if (M === '0') {
	        if (m === '0') {
	          ret = `>=${M}.${m}.${p
	          } <${M}.${m}.${+p + 1}-0`;
	        } else {
	          ret = `>=${M}.${m}.${p
	          } <${M}.${+m + 1}.0-0`;
	        }
	      } else {
	        ret = `>=${M}.${m}.${p
	        } <${+M + 1}.0.0-0`;
	      }
	    }
	    debug('caret return', ret);
	    return ret
	  })
	};
	const replaceXRanges = (comp, options) => {
	  debug('replaceXRanges', comp, options);
	  return comp
	    .split(/\s+/)
	    .map((c) => replaceXRange(c, options))
	    .join(' ')
	};
	const replaceXRange = (comp, options) => {
	  comp = comp.trim();
	  const r = options.loose ? re[t.XRANGELOOSE] : re[t.XRANGE];
	  return comp.replace(r, (ret, gtlt, M, m, p, pr) => {
	    debug('xRange', comp, ret, gtlt, M, m, p, pr);
	    if (invalidXRangeOrder(M, m, p)) {
	      return comp
	    }
	    const xM = isX(M);
	    const xm = xM || isX(m);
	    const xp = xm || isX(p);
	    const anyX = xp;
	    if (gtlt === '=' && anyX) {
	      gtlt = '';
	    }
	    pr = options.includePrerelease ? '-0' : '';
	    if (xM) {
	      if (gtlt === '>' || gtlt === '<') {
	        ret = '<0.0.0-0';
	      } else {
	        ret = '*';
	      }
	    } else if (gtlt && anyX) {
	      if (xm) {
	        m = 0;
	      }
	      p = 0;
	      if (gtlt === '>') {
	        gtlt = '>=';
	        if (xm) {
	          M = +M + 1;
	          m = 0;
	          p = 0;
	        } else {
	          m = +m + 1;
	          p = 0;
	        }
	      } else if (gtlt === '<=') {
	        gtlt = '<';
	        if (xm) {
	          M = +M + 1;
	        } else {
	          m = +m + 1;
	        }
	      }
	      if (gtlt === '<') {
	        pr = '-0';
	      }
	      ret = `${gtlt + M}.${m}.${p}${pr}`;
	    } else if (xm) {
	      ret = `>=${M}.0.0${pr} <${+M + 1}.0.0-0`;
	    } else if (xp) {
	      ret = `>=${M}.${m}.0${pr
	      } <${M}.${+m + 1}.0-0`;
	    }
	    debug('xRange return', ret);
	    return ret
	  })
	};
	const replaceStars = (comp, options) => {
	  debug('replaceStars', comp, options);
	  return comp
	    .trim()
	    .replace(re[t.STAR], '')
	};
	const replaceGTE0 = (comp, options) => {
	  debug('replaceGTE0', comp, options);
	  return comp
	    .trim()
	    .replace(re[options.includePrerelease ? t.GTE0PRE : t.GTE0], '')
	};
	const hyphenReplace = incPr => ($0,
	  from, fM, fm, fp, fpr, fb,
	  to, tM, tm, tp, tpr) => {
	  if (isX(fM)) {
	    from = '';
	  } else if (isX(fm)) {
	    from = `>=${fM}.0.0${incPr ? '-0' : ''}`;
	  } else if (isX(fp)) {
	    from = `>=${fM}.${fm}.0${incPr ? '-0' : ''}`;
	  } else if (fpr) {
	    from = `>=${from}`;
	  } else {
	    from = `>=${from}${incPr ? '-0' : ''}`;
	  }
	  if (isX(tM)) {
	    to = '';
	  } else if (isX(tm)) {
	    to = `<${+tM + 1}.0.0-0`;
	  } else if (isX(tp)) {
	    to = `<${tM}.${+tm + 1}.0-0`;
	  } else if (tpr) {
	    to = `<=${tM}.${tm}.${tp}-${tpr}`;
	  } else if (incPr) {
	    to = `<${tM}.${tm}.${+tp + 1}-0`;
	  } else {
	    to = `<=${to}`;
	  }
	  return `${from} ${to}`.trim()
	};
	const testSet = (set, version, options) => {
	  for (let i = 0; i < set.length; i++) {
	    if (!set[i].test(version)) {
	      return false
	    }
	  }
	  if (version.prerelease.length && !options.includePrerelease) {
	    for (let i = 0; i < set.length; i++) {
	      debug(set[i].semver);
	      if (set[i].semver === Comparator.ANY) {
	        continue
	      }
	      if (set[i].semver.prerelease.length > 0) {
	        const allowed = set[i].semver;
	        if (allowed.major === version.major &&
	            allowed.minor === version.minor &&
	            allowed.patch === version.patch) {
	          return true
	        }
	      }
	    }
	    return false
	  }
	  return true
	};
	return range;
}

var comparator;
var hasRequiredComparator;

function requireComparator () {
	if (hasRequiredComparator) return comparator;
	hasRequiredComparator = 1;
	const ANY = Symbol('SemVer ANY');
	class Comparator {
	  static get ANY () {
	    return ANY
	  }
	  constructor (comp, options) {
	    options = parseOptions(options);
	    if (comp instanceof Comparator) {
	      if (comp.loose === !!options.loose) {
	        return comp
	      } else {
	        comp = comp.value;
	      }
	    }
	    comp = comp.trim().split(/\s+/).join(' ');
	    debug('comparator', comp, options);
	    this.options = options;
	    this.loose = !!options.loose;
	    this.parse(comp);
	    if (this.semver === ANY) {
	      this.value = '';
	    } else {
	      this.value = this.operator + this.semver.version;
	    }
	    debug('comp', this);
	  }
	  parse (comp) {
	    const r = this.options.loose ? re[t.COMPARATORLOOSE] : re[t.COMPARATOR];
	    const m = comp.match(r);
	    if (!m) {
	      throw new TypeError(`Invalid comparator: ${comp}`)
	    }
	    this.operator = m[1] !== undefined ? m[1] : '';
	    if (this.operator === '=') {
	      this.operator = '';
	    }
	    if (!m[2]) {
	      this.semver = ANY;
	    } else {
	      this.semver = new SemVer(m[2], this.options.loose);
	    }
	  }
	  toString () {
	    return this.value
	  }
	  test (version) {
	    debug('Comparator.test', version, this.options.loose);
	    if (this.semver === ANY || version === ANY) {
	      return true
	    }
	    if (typeof version === 'string') {
	      try {
	        version = new SemVer(version, this.options);
	      } catch (er) {
	        return false
	      }
	    }
	    return cmp(version, this.operator, this.semver, this.options)
	  }
	  intersects (comp, options) {
	    if (!(comp instanceof Comparator)) {
	      throw new TypeError('a Comparator is required')
	    }
	    if (this.operator === '') {
	      if (this.value === '') {
	        return true
	      }
	      return new Range(comp.value, options).test(this.value)
	    } else if (comp.operator === '') {
	      if (comp.value === '') {
	        return true
	      }
	      return new Range(this.value, options).test(comp.semver)
	    }
	    options = parseOptions(options);
	    if (options.includePrerelease &&
	      (this.value === '<0.0.0-0' || comp.value === '<0.0.0-0')) {
	      return false
	    }
	    if (!options.includePrerelease &&
	      (this.value.startsWith('<0.0.0') || comp.value.startsWith('<0.0.0'))) {
	      return false
	    }
	    if (this.operator.startsWith('>') && comp.operator.startsWith('>')) {
	      return true
	    }
	    if (this.operator.startsWith('<') && comp.operator.startsWith('<')) {
	      return true
	    }
	    if (
	      (this.semver.version === comp.semver.version) &&
	      this.operator.includes('=') && comp.operator.includes('=')) {
	      return true
	    }
	    if (cmp(this.semver, '<', comp.semver, options) &&
	      this.operator.startsWith('>') && comp.operator.startsWith('<')) {
	      return true
	    }
	    if (cmp(this.semver, '>', comp.semver, options) &&
	      this.operator.startsWith('<') && comp.operator.startsWith('>')) {
	      return true
	    }
	    return false
	  }
	}
	comparator = Comparator;
	const parseOptions = requireParseOptions();
	const { safeRe: re, t } = requireRe();
	const cmp = requireCmp();
	const debug = requireDebug();
	const SemVer = requireSemver$1();
	const Range = requireRange();
	return comparator;
}

var satisfies_1;
var hasRequiredSatisfies;

function requireSatisfies () {
	if (hasRequiredSatisfies) return satisfies_1;
	hasRequiredSatisfies = 1;
	const Range = requireRange();
	const satisfies = (version, range, options) => {
	  try {
	    range = new Range(range, options);
	  } catch (er) {
	    return false
	  }
	  return range.test(version)
	};
	satisfies_1 = satisfies;
	return satisfies_1;
}

var toComparators_1;
var hasRequiredToComparators;

function requireToComparators () {
	if (hasRequiredToComparators) return toComparators_1;
	hasRequiredToComparators = 1;
	const Range = requireRange();
	const toComparators = (range, options) =>
	  new Range(range, options).set
	    .map(comp => comp.map(c => c.value).join(' ').trim().split(' '));
	toComparators_1 = toComparators;
	return toComparators_1;
}

var maxSatisfying_1;
var hasRequiredMaxSatisfying;

function requireMaxSatisfying () {
	if (hasRequiredMaxSatisfying) return maxSatisfying_1;
	hasRequiredMaxSatisfying = 1;
	const SemVer = requireSemver$1();
	const Range = requireRange();
	const maxSatisfying = (versions, range, options) => {
	  let max = null;
	  let maxSV = null;
	  let rangeObj = null;
	  try {
	    rangeObj = new Range(range, options);
	  } catch (er) {
	    return null
	  }
	  versions.forEach((v) => {
	    if (rangeObj.test(v)) {
	      if (!max || maxSV.compare(v) === -1) {
	        max = v;
	        maxSV = new SemVer(max, options);
	      }
	    }
	  });
	  return max
	};
	maxSatisfying_1 = maxSatisfying;
	return maxSatisfying_1;
}

var minSatisfying_1;
var hasRequiredMinSatisfying;

function requireMinSatisfying () {
	if (hasRequiredMinSatisfying) return minSatisfying_1;
	hasRequiredMinSatisfying = 1;
	const SemVer = requireSemver$1();
	const Range = requireRange();
	const minSatisfying = (versions, range, options) => {
	  let min = null;
	  let minSV = null;
	  let rangeObj = null;
	  try {
	    rangeObj = new Range(range, options);
	  } catch (er) {
	    return null
	  }
	  versions.forEach((v) => {
	    if (rangeObj.test(v)) {
	      if (!min || minSV.compare(v) === 1) {
	        min = v;
	        minSV = new SemVer(min, options);
	      }
	    }
	  });
	  return min
	};
	minSatisfying_1 = minSatisfying;
	return minSatisfying_1;
}

var minVersion_1;
var hasRequiredMinVersion;

function requireMinVersion () {
	if (hasRequiredMinVersion) return minVersion_1;
	hasRequiredMinVersion = 1;
	const SemVer = requireSemver$1();
	const Range = requireRange();
	const gt = requireGt();
	const minVersion = (range, loose) => {
	  range = new Range(range, loose);
	  let minver = new SemVer('0.0.0');
	  if (range.test(minver)) {
	    return minver
	  }
	  minver = new SemVer('0.0.0-0');
	  if (range.test(minver)) {
	    return minver
	  }
	  minver = null;
	  for (let i = 0; i < range.set.length; ++i) {
	    const comparators = range.set[i];
	    let setMin = null;
	    comparators.forEach((comparator) => {
	      const compver = new SemVer(comparator.semver.version);
	      switch (comparator.operator) {
	        case '>':
	          if (compver.prerelease.length === 0) {
	            compver.patch++;
	          } else {
	            compver.prerelease.push(0);
	          }
	          compver.raw = compver.format();
	        case '':
	        case '>=':
	          if (!setMin || gt(compver, setMin)) {
	            setMin = compver;
	          }
	          break
	        case '<':
	        case '<=':
	          break
	        default:
	          throw new Error(`Unexpected operation: ${comparator.operator}`)
	      }
	    });
	    if (setMin && (!minver || gt(minver, setMin))) {
	      minver = setMin;
	    }
	  }
	  if (minver && range.test(minver)) {
	    return minver
	  }
	  return null
	};
	minVersion_1 = minVersion;
	return minVersion_1;
}

var valid;
var hasRequiredValid;

function requireValid () {
	if (hasRequiredValid) return valid;
	hasRequiredValid = 1;
	const Range = requireRange();
	const validRange = (range, options) => {
	  try {
	    return new Range(range, options).range || '*'
	  } catch (er) {
	    return null
	  }
	};
	valid = validRange;
	return valid;
}

var outside_1;
var hasRequiredOutside;

function requireOutside () {
	if (hasRequiredOutside) return outside_1;
	hasRequiredOutside = 1;
	const SemVer = requireSemver$1();
	const Comparator = requireComparator();
	const { ANY } = Comparator;
	const Range = requireRange();
	const satisfies = requireSatisfies();
	const gt = requireGt();
	const lt = requireLt();
	const lte = requireLte();
	const gte = requireGte();
	const outside = (version, range, hilo, options) => {
	  version = new SemVer(version, options);
	  range = new Range(range, options);
	  let gtfn, ltefn, ltfn, comp, ecomp;
	  switch (hilo) {
	    case '>':
	      gtfn = gt;
	      ltefn = lte;
	      ltfn = lt;
	      comp = '>';
	      ecomp = '>=';
	      break
	    case '<':
	      gtfn = lt;
	      ltefn = gte;
	      ltfn = gt;
	      comp = '<';
	      ecomp = '<=';
	      break
	    default:
	      throw new TypeError('Must provide a hilo val of "<" or ">"')
	  }
	  if (satisfies(version, range, options)) {
	    return false
	  }
	  for (let i = 0; i < range.set.length; ++i) {
	    const comparators = range.set[i];
	    let high = null;
	    let low = null;
	    comparators.forEach((comparator) => {
	      if (comparator.semver === ANY) {
	        comparator = new Comparator('>=0.0.0');
	      }
	      high = high || comparator;
	      low = low || comparator;
	      if (gtfn(comparator.semver, high.semver, options)) {
	        high = comparator;
	      } else if (ltfn(comparator.semver, low.semver, options)) {
	        low = comparator;
	      }
	    });
	    if (high.operator === comp || high.operator === ecomp) {
	      return false
	    }
	    if ((!low.operator || low.operator === comp) &&
	        ltefn(version, low.semver)) {
	      return false
	    } else if (low.operator === ecomp && ltfn(version, low.semver)) {
	      return false
	    }
	  }
	  return true
	};
	outside_1 = outside;
	return outside_1;
}

var gtr_1;
var hasRequiredGtr;

function requireGtr () {
	if (hasRequiredGtr) return gtr_1;
	hasRequiredGtr = 1;
	const outside = requireOutside();
	const gtr = (version, range, options) => outside(version, range, '>', options);
	gtr_1 = gtr;
	return gtr_1;
}

var ltr_1;
var hasRequiredLtr;

function requireLtr () {
	if (hasRequiredLtr) return ltr_1;
	hasRequiredLtr = 1;
	const outside = requireOutside();
	const ltr = (version, range, options) => outside(version, range, '<', options);
	ltr_1 = ltr;
	return ltr_1;
}

var intersects_1;
var hasRequiredIntersects;

function requireIntersects () {
	if (hasRequiredIntersects) return intersects_1;
	hasRequiredIntersects = 1;
	const Range = requireRange();
	const intersects = (r1, r2, options) => {
	  r1 = new Range(r1, options);
	  r2 = new Range(r2, options);
	  return r1.intersects(r2, options)
	};
	intersects_1 = intersects;
	return intersects_1;
}

var simplify;
var hasRequiredSimplify;

function requireSimplify () {
	if (hasRequiredSimplify) return simplify;
	hasRequiredSimplify = 1;
	const satisfies = requireSatisfies();
	const compare = requireCompare();
	simplify = (versions, range, options) => {
	  const set = [];
	  let first = null;
	  let prev = null;
	  const v = versions.sort((a, b) => compare(a, b, options));
	  for (const version of v) {
	    const included = satisfies(version, range, options);
	    if (included) {
	      prev = version;
	      if (!first) {
	        first = version;
	      }
	    } else {
	      if (prev) {
	        set.push([first, prev]);
	      }
	      prev = null;
	      first = null;
	    }
	  }
	  if (first) {
	    set.push([first, null]);
	  }
	  const ranges = [];
	  for (const [min, max] of set) {
	    if (min === max) {
	      ranges.push(min);
	    } else if (!max && min === v[0]) {
	      ranges.push('*');
	    } else if (!max) {
	      ranges.push(`>=${min}`);
	    } else if (min === v[0]) {
	      ranges.push(`<=${max}`);
	    } else {
	      ranges.push(`${min} - ${max}`);
	    }
	  }
	  const simplified = ranges.join(' || ');
	  const original = typeof range.raw === 'string' ? range.raw : String(range);
	  return simplified.length < original.length ? simplified : range
	};
	return simplify;
}

var subset_1;
var hasRequiredSubset;

function requireSubset () {
	if (hasRequiredSubset) return subset_1;
	hasRequiredSubset = 1;
	const Range = requireRange();
	const Comparator = requireComparator();
	const { ANY } = Comparator;
	const satisfies = requireSatisfies();
	const compare = requireCompare();
	const subset = (sub, dom, options = {}) => {
	  if (sub === dom) {
	    return true
	  }
	  sub = new Range(sub, options);
	  dom = new Range(dom, options);
	  let sawNonNull = false;
	  OUTER: for (const simpleSub of sub.set) {
	    for (const simpleDom of dom.set) {
	      const isSub = simpleSubset(simpleSub, simpleDom, options);
	      sawNonNull = sawNonNull || isSub !== null;
	      if (isSub) {
	        continue OUTER
	      }
	    }
	    if (sawNonNull) {
	      return false
	    }
	  }
	  return true
	};
	const minimumVersionWithPreRelease = [new Comparator('>=0.0.0-0')];
	const minimumVersion = [new Comparator('>=0.0.0')];
	const simpleSubset = (sub, dom, options) => {
	  if (sub === dom) {
	    return true
	  }
	  if (sub.length === 1 && sub[0].semver === ANY) {
	    if (dom.length === 1 && dom[0].semver === ANY) {
	      return true
	    } else if (options.includePrerelease) {
	      sub = minimumVersionWithPreRelease;
	    } else {
	      sub = minimumVersion;
	    }
	  }
	  if (dom.length === 1 && dom[0].semver === ANY) {
	    if (options.includePrerelease) {
	      return true
	    } else {
	      dom = minimumVersion;
	    }
	  }
	  const eqSet = new Set();
	  let gt, lt;
	  for (const c of sub) {
	    if (c.operator === '>' || c.operator === '>=') {
	      gt = higherGT(gt, c, options);
	    } else if (c.operator === '<' || c.operator === '<=') {
	      lt = lowerLT(lt, c, options);
	    } else {
	      eqSet.add(c.semver);
	    }
	  }
	  if (eqSet.size > 1) {
	    return null
	  }
	  let gtltComp;
	  if (gt && lt) {
	    gtltComp = compare(gt.semver, lt.semver, options);
	    if (gtltComp > 0) {
	      return null
	    } else if (gtltComp === 0 && (gt.operator !== '>=' || lt.operator !== '<=')) {
	      return null
	    }
	  }
	  for (const eq of eqSet) {
	    if (gt && !satisfies(eq, String(gt), options)) {
	      return null
	    }
	    if (lt && !satisfies(eq, String(lt), options)) {
	      return null
	    }
	    for (const c of dom) {
	      if (!satisfies(eq, String(c), options)) {
	        return false
	      }
	    }
	    return true
	  }
	  let higher, lower;
	  let hasDomLT, hasDomGT;
	  let needDomLTPre = lt &&
	    !options.includePrerelease &&
	    lt.semver.prerelease.length ? lt.semver : false;
	  let needDomGTPre = gt &&
	    !options.includePrerelease &&
	    gt.semver.prerelease.length ? gt.semver : false;
	  if (needDomLTPre && needDomLTPre.prerelease.length === 1 &&
	      lt.operator === '<' && needDomLTPre.prerelease[0] === 0) {
	    needDomLTPre = false;
	  }
	  for (const c of dom) {
	    hasDomGT = hasDomGT || c.operator === '>' || c.operator === '>=';
	    hasDomLT = hasDomLT || c.operator === '<' || c.operator === '<=';
	    if (gt) {
	      if (needDomGTPre) {
	        if (c.semver.prerelease && c.semver.prerelease.length &&
	            c.semver.major === needDomGTPre.major &&
	            c.semver.minor === needDomGTPre.minor &&
	            c.semver.patch === needDomGTPre.patch) {
	          needDomGTPre = false;
	        }
	      }
	      if (c.operator === '>' || c.operator === '>=') {
	        higher = higherGT(gt, c, options);
	        if (higher === c && higher !== gt) {
	          return false
	        }
	      } else if (gt.operator === '>=' && !c.test(gt.semver)) {
	        return false
	      }
	    }
	    if (lt) {
	      if (needDomLTPre) {
	        if (c.semver.prerelease && c.semver.prerelease.length &&
	            c.semver.major === needDomLTPre.major &&
	            c.semver.minor === needDomLTPre.minor &&
	            c.semver.patch === needDomLTPre.patch) {
	          needDomLTPre = false;
	        }
	      }
	      if (c.operator === '<' || c.operator === '<=') {
	        lower = lowerLT(lt, c, options);
	        if (lower === c && lower !== lt) {
	          return false
	        }
	      } else if (lt.operator === '<=' && !c.test(lt.semver)) {
	        return false
	      }
	    }
	    if (!c.operator && (lt || gt) && gtltComp !== 0) {
	      return false
	    }
	  }
	  if (gt && hasDomLT && !lt && gtltComp !== 0) {
	    return false
	  }
	  if (lt && hasDomGT && !gt && gtltComp !== 0) {
	    return false
	  }
	  if (needDomGTPre || needDomLTPre) {
	    return false
	  }
	  return true
	};
	const higherGT = (a, b, options) => {
	  if (!a) {
	    return b
	  }
	  const comp = compare(a.semver, b.semver, options);
	  return comp > 0 ? a
	    : comp < 0 ? b
	    : b.operator === '>' && a.operator === '>=' ? b
	    : a
	};
	const lowerLT = (a, b, options) => {
	  if (!a) {
	    return b
	  }
	  const comp = compare(a.semver, b.semver, options);
	  return comp < 0 ? a
	    : comp > 0 ? b
	    : b.operator === '<' && a.operator === '<=' ? b
	    : a
	};
	subset_1 = subset;
	return subset_1;
}

var semver;
var hasRequiredSemver;

function requireSemver () {
	if (hasRequiredSemver) return semver;
	hasRequiredSemver = 1;
	const internalRe = requireRe();
	const constants = requireConstants();
	const SemVer = requireSemver$1();
	const identifiers = requireIdentifiers();
	const parse = requireParse();
	const valid = requireValid$1();
	const clean = requireClean();
	const inc = requireInc();
	const diff = requireDiff();
	const major = requireMajor();
	const minor = requireMinor();
	const patch = requirePatch();
	const prerelease = requirePrerelease();
	const compare = requireCompare();
	const rcompare = requireRcompare();
	const compareLoose = requireCompareLoose();
	const compareBuild = requireCompareBuild();
	const sort = requireSort();
	const rsort = requireRsort();
	const gt = requireGt();
	const lt = requireLt();
	const eq = requireEq();
	const neq = requireNeq();
	const gte = requireGte();
	const lte = requireLte();
	const cmp = requireCmp();
	const coerce = requireCoerce();
	const truncate = requireTruncate();
	const Comparator = requireComparator();
	const Range = requireRange();
	const satisfies = requireSatisfies();
	const toComparators = requireToComparators();
	const maxSatisfying = requireMaxSatisfying();
	const minSatisfying = requireMinSatisfying();
	const minVersion = requireMinVersion();
	const validRange = requireValid();
	const outside = requireOutside();
	const gtr = requireGtr();
	const ltr = requireLtr();
	const intersects = requireIntersects();
	const simplifyRange = requireSimplify();
	const subset = requireSubset();
	semver = {
	  parse,
	  valid,
	  clean,
	  inc,
	  diff,
	  major,
	  minor,
	  patch,
	  prerelease,
	  compare,
	  rcompare,
	  compareLoose,
	  compareBuild,
	  sort,
	  rsort,
	  gt,
	  lt,
	  eq,
	  neq,
	  gte,
	  lte,
	  cmp,
	  coerce,
	  truncate,
	  Comparator,
	  Range,
	  satisfies,
	  toComparators,
	  maxSatisfying,
	  minSatisfying,
	  minVersion,
	  validRange,
	  outside,
	  gtr,
	  ltr,
	  intersects,
	  simplifyRange,
	  subset,
	  SemVer,
	  re: internalRe.re,
	  src: internalRe.src,
	  tokens: internalRe.t,
	  SEMVER_SPEC_VERSION: constants.SEMVER_SPEC_VERSION,
	  RELEASE_TYPES: constants.RELEASE_TYPES,
	  compareIdentifiers: identifiers.compareIdentifiers,
	  rcompareIdentifiers: identifiers.rcompareIdentifiers,
	};
	return semver;
}

var semverExports = requireSemver();
var index = /*@__PURE__*/getDefaultExportFromCjs(semverExports);

/**
 * @license
 * Copyright 2020 Google Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
!!(typeof process !== 'undefined' && process.version);

/**
 * @license
 * Copyright 2020 Google Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
const DEBUG_PREFIXES = {
    error: 'puppeteer:error'};

/**
MIT License
Copyright (c) 2021 Jason Miller
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
function mitt_default(n) {
  return { all: n = n ||  new Map(), on: function(t, e) {
    var i = n.get(t);
    i ? i.push(e) : n.set(t, [e]);
  }, off: function(t, e) {
    var i = n.get(t);
    i && (e ? i.splice(i.indexOf(e) >>> 0, 1) : n.set(t, []));
  }, emit: function(t, e) {
    var i = n.get(t);
    i && i.slice().map(function(n2) {
      n2(e);
    }), (i = n.get("*")) && i.slice().map(function(n2) {
      n2(t, e);
    });
  } };
}

/**
 * @license
 * Copyright 2023 Google Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
Symbol.dispose ??= Symbol('dispose');
Symbol.asyncDispose ??= Symbol('asyncDispose');
const disposeSymbol = Symbol.dispose;
const asyncDisposeSymbol = Symbol.asyncDispose;
class DisposableStackPolyfill {
    #disposed = false;
    #stack = [];
    get disposed() {
        return this.#disposed;
    }
    dispose() {
        this[disposeSymbol]();
    }
    use(value) {
        if (value && typeof value[disposeSymbol] === 'function') {
            this.#stack.push(value);
        }
        return value;
    }
    adopt(value, onDispose) {
        this.#stack.push({
            [disposeSymbol]() {
                onDispose(value);
            },
        });
        return value;
    }
    defer(onDispose) {
        this.#stack.push({
            [disposeSymbol]() {
                onDispose();
            },
        });
    }
    move() {
        if (this.#disposed) {
            throw new ReferenceError('A disposed stack can not use anything new');
        }
        const stack = new DisposableStackPolyfill();
        stack.#stack = this.#stack;
        this.#stack = [];
        this.#disposed = true;
        return stack;
    }
    [disposeSymbol]() {
        if (this.#disposed) {
            return;
        }
        this.#disposed = true;
        const errors = [];
        for (const resource of this.#stack.reverse()) {
            try {
                resource[disposeSymbol]();
            }
            catch (e) {
                errors.push(e);
            }
        }
        if (errors.length === 1) {
            throw errors[0];
        }
        else if (errors.length > 1) {
            let suppressed = null;
            for (const error of errors) {
                if (suppressed === null) {
                    suppressed = error;
                }
                else {
                    suppressed = new SuppressedErrorPolyfill(error, suppressed);
                }
            }
            throw suppressed;
        }
    }
    [Symbol.toStringTag] = 'DisposableStack';
}
const DisposableStack = globalThis.DisposableStack ?? DisposableStackPolyfill;
class SuppressedErrorPolyfill extends Error {
    #error;
    #suppressed;
    constructor(error, suppressed, message = 'An error was suppressed during disposal') {
        super(message);
        this.name = 'SuppressedError';
        this.#error = error;
        this.#suppressed = suppressed;
    }
    get error() {
        return this.#error;
    }
    get suppressed() {
        return this.#suppressed;
    }
}

/**
 * @license
 * Copyright 2022 Google Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
class EventEmitter {
    #emitter;
    #handlers = new Map();
    #logger;
    constructor(emitter = mitt_default(new Map()), logger) {
        this.#emitter = emitter;
        this.#logger = logger;
    }
    on(type, handler) {
        const handlers = this.#handlers.get(type);
        if (handlers === undefined) {
            this.#handlers.set(type, [handler]);
        }
        else {
            handlers.push(handler);
        }
        this.#emitter.on(type, handler);
        return this;
    }
    off(type, handler) {
        const handlers = this.#handlers.get(type) ?? [];
        if (handler === undefined) {
            for (const handler of handlers) {
                this.#emitter.off(type, handler);
            }
            this.#handlers.delete(type);
            return this;
        }
        const index = handlers.lastIndexOf(handler);
        if (index > -1) {
            this.#emitter.off(type, ...handlers.splice(index, 1));
        }
        return this;
    }
    emit(type, event) {
        this.#emitter.emit(type, event);
        return this.listenerCount(type) > 0;
    }
    once(type, handler) {
        const onceHandler = eventData => {
            handler(eventData);
            this.off(type, onceHandler);
        };
        return this.on(type, onceHandler);
    }
    listenerCount(type) {
        return this.#handlers.get(type)?.length || 0;
    }
    removeAllListeners(type) {
        if (type !== undefined) {
            return this.off(type);
        }
        this[disposeSymbol]();
        return this;
    }
    [disposeSymbol]() {
        return void this[asyncDisposeSymbol]().catch(error => {
            this.#logger?.(DEBUG_PREFIXES.error)?.(error);
        });
    }
    async [asyncDisposeSymbol]() {
        for (const [type, handlers] of this.#handlers) {
            for (const handler of handlers) {
                this.#emitter.off(type, handler);
            }
        }
        this.#handlers.clear();
    }
}

/**
 * @license
 * Copyright 2020 Google Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
const assert = (value, message) => {
    if (!value) {
        throw new Error(message);
    }
};

class PipeTransport {
    #pipeWrite;
    #subscriptions = new DisposableStack();
    #logger;
    #isClosed = false;
    #pendingMessage = [];
    onclose;
    onmessage;
    constructor(pipeWrite, pipeRead, logger) {
        this.#pipeWrite = pipeWrite;
        this.#logger = logger;
        const pipeReadEmitter = this.#subscriptions.use(
        new EventEmitter(pipeRead, logger));
        pipeReadEmitter.on('data', buffer => {
            return this.#dispatch(buffer);
        });
        pipeReadEmitter.on('close', () => {
            if (this.onclose) {
                this.onclose.call(null);
            }
        });
        pipeReadEmitter.on('error', err => {
            this.#logger?.(DEBUG_PREFIXES.error)?.(err);
        });
        const pipeWriteEmitter = this.#subscriptions.use(
        new EventEmitter(pipeWrite));
        pipeWriteEmitter.on('error', err => {
            this.#logger?.(DEBUG_PREFIXES.error)?.(err);
        });
    }
    send(message) {
        assert(!this.#isClosed, '`PipeTransport` is closed.');
        this.#pipeWrite.write(message);
        this.#pipeWrite.write('\0');
    }
    #dispatch(buffer) {
        assert(!this.#isClosed, '`PipeTransport` is closed.');
        this.#pendingMessage.push(buffer);
        if (buffer.indexOf('\0') === -1) {
            return;
        }
        const concatBuffer = Buffer.concat(this.#pendingMessage);
        let start = 0;
        let end = concatBuffer.indexOf('\0');
        while (end !== -1) {
            const message = concatBuffer.toString(undefined, start, end);
            setImmediate(() => {
                if (this.onmessage) {
                    this.onmessage.call(null, message);
                }
            });
            start = end + 1;
            end = concatBuffer.indexOf('\0', start);
        }
        if (start >= concatBuffer.length) {
            this.#pendingMessage = [];
        }
        else {
            this.#pendingMessage = [concatBuffer.subarray(start)];
        }
    }
    close() {
        this.#isClosed = true;
        this.#subscriptions.dispose();
    }
}

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
const URLPattern = globalThis.URLPattern;

export { PipeTransport, URLPattern, hideBin, index as semver, Yargs as yargs };
//# sourceMappingURL=cli.js.map
