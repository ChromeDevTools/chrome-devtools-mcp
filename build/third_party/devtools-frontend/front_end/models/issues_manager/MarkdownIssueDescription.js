// Copyright 2020 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Platform from '../../core/platform/platform.js';
import * as TextUtils from '../../core/text_utils/text_utils.js';
import * as Marked from '../../third_party/marked/marked.js';
/**
 * A lazy version of the description. Allows to specify a description as a
 * constant and at the same time delays resolution of the substitutions
 * and/or link titles to allow localization.
 */
export function resolveLazyDescription(lazyDescription) {
    function linksMap(currentLink) {
        return { link: currentLink.link, linkTitle: currentLink.linkTitle() };
    }
    const substitutionMap = new Map();
    lazyDescription.substitutions?.forEach((value, key) => {
        substitutionMap.set(key, value());
    });
    const description = {
        file: lazyDescription.file,
        title: lazyDescription.title?.(),
        links: lazyDescription.links.map(linksMap),
        substitutions: substitutionMap,
    };
    return description;
}
export async function getFileContent(url) {
    try {
        return await Platform.HostRuntime.HOST_RUNTIME.loadTextFile(url);
    }
    catch {
        throw new Error(`Markdown file ${url.toString()} not found. Make sure it is correctly listed in the relevant BUILD.gn files.`);
    }
}
export async function getMarkdownFileContent(filename) {
    return await getFileContent(new URL(`descriptions/${filename}`, import.meta.url));
}
export async function createIssueDescriptionFromMarkdown(description) {
    const markdown = await getMarkdownFileContent(description.file);
    return createIssueDescriptionFromRawMarkdown(markdown, description);
}
/**
 * This function is exported separately for unit testing.
 */
export function createIssueDescriptionFromRawMarkdown(markdown, description) {
    const markdownAst = TextUtils.Markdown.tokenizeWithPlaceholders(markdown, description.substitutions);
    const markdownTitle = findTitleFromMarkdownAst(markdownAst);
    if (!markdownTitle) {
        throw new Error('Markdown issue descriptions must start with a heading');
    }
    return {
        title: description.title ?? markdownTitle,
        markdown: markdownAst.slice(1),
        links: description.links,
        substitutions: description.substitutions,
    };
}
export function findTitleFromMarkdownAst(markdownAst) {
    if (markdownAst.length === 0 || markdownAst[0].type !== 'heading' || markdownAst[0].depth !== 1) {
        return null;
    }
    return markdownAst[0].text;
}
export async function getIssueTitleFromMarkdownDescription(description) {
    const rawMarkdown = await getMarkdownFileContent(description.file);
    const markdownAst = Marked.Marked.lexer(rawMarkdown);
    const markdownTitle = findTitleFromMarkdownAst(markdownAst);
    if (!markdownTitle) {
        return null;
    }
    return description.title ?? markdownTitle;
}
//# sourceMappingURL=MarkdownIssueDescription.js.map