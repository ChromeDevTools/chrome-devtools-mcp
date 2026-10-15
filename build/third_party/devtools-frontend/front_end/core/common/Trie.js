// Copyright 2016 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
export class Trie {
    #size;
    #root;
    #edges;
    #isWord;
    #wordsInSubtree;
    #freeNodes;
    #traitImpl;
    constructor(traitImpl) {
        this.#root = 0;
        this.#traitImpl = traitImpl;
        this.clear();
    }
    static newStringTrie() {
        return new Trie({
            empty: () => '',
            append: (base, appendage) => base + appendage,
            slice: (base, start, end) => base.slice(start, end),
        });
    }
    static newArrayTrie() {
        return new Trie({
            empty: () => [],
            append: (base, appendage) => base.concat([appendage]),
            slice: (base, start, end) => base.slice(start, end),
        });
    }
    add(word) {
        let node = this.#root;
        ++this.#wordsInSubtree[this.#root];
        for (let i = 0; i < word.length; ++i) {
            const edge = word[i];
            let next = this.#edges[node].get(edge);
            if (!next) {
                if (this.#freeNodes.length) {
                    next = this.#freeNodes.pop();
                }
                else {
                    next = this.#size++;
                    this.#isWord.push(false);
                    this.#wordsInSubtree.push(0);
                    this.#edges.push(new Map());
                }
                this.#edges[node].set(edge, next);
            }
            ++this.#wordsInSubtree[next];
            node = next;
        }
        this.#isWord[node] = true;
    }
    remove(word) {
        if (!this.has(word)) {
            return false;
        }
        let node = this.#root;
        --this.#wordsInSubtree[this.#root];
        for (let i = 0; i < word.length; ++i) {
            const edge = word[i];
            const next = this.#edges[node].get(edge);
            if (!--this.#wordsInSubtree[next]) {
                this.#edges[node].delete(edge);
                this.#freeNodes.push(next);
            }
            node = next;
        }
        this.#isWord[node] = false;
        return true;
    }
    has(word) {
        let node = this.#root;
        for (let i = 0; i < word.length; ++i) {
            node = this.#edges[node].get(word[i]);
            if (!node) {
                return false;
            }
        }
        return this.#isWord[node];
    }
    words(prefix) {
        prefix = prefix ?? this.#traitImpl.empty();
        let node = this.#root;
        for (let i = 0; i < prefix.length; ++i) {
            node = this.#edges[node].get(prefix[i]);
            if (!node) {
                return [];
            }
        }
        const results = [];
        this.dfs(node, prefix, results);
        return results;
    }
    dfs(node, prefix, results) {
        if (this.#isWord[node]) {
            results.push(prefix);
        }
        const edges = this.#edges[node];
        for (const [edge, node] of edges) {
            const newPrefix = this.#traitImpl.append(prefix, edge);
            this.dfs(node, newPrefix, results);
        }
    }
    longestPrefix(word, fullWordOnly) {
        let node = this.#root;
        let wordIndex = 0;
        for (let i = 0; i < word.length; ++i) {
            node = this.#edges[node].get(word[i]);
            if (!node) {
                break;
            }
            if (!fullWordOnly || this.#isWord[node]) {
                wordIndex = i + 1;
            }
        }
        return this.#traitImpl.slice(word, 0, wordIndex);
    }
    clear() {
        this.#size = 1;
        this.#root = 0;
        this.#edges = [new Map()];
        this.#isWord = [false];
        this.#wordsInSubtree = [0];
        this.#freeNodes = [];
    }
}
//# sourceMappingURL=Trie.js.map