// Copyright 2013 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { Trie } from './Trie.js';
export class TextDictionary {
    words = new Map();
    index = Trie.newStringTrie();
    addWord(word) {
        let count = this.words.get(word) || 0;
        ++count;
        this.words.set(word, count);
        this.index.add(word);
    }
    removeWord(word) {
        let count = this.words.get(word) || 0;
        if (!count) {
            return;
        }
        if (count === 1) {
            this.words.delete(word);
            this.index.remove(word);
            return;
        }
        --count;
        this.words.set(word, count);
    }
    wordsWithPrefix(prefix) {
        return this.index.words(prefix);
    }
    hasWord(word) {
        return this.words.has(word);
    }
    wordCount(word) {
        return this.words.get(word) || 0;
    }
    reset() {
        this.words.clear();
        this.index.clear();
    }
}
//# sourceMappingURL=TextDictionary.js.map