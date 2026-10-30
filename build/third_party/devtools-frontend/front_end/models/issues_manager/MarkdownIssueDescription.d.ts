import * as Marked from '../../third_party/marked/marked.js';
/**
 * The description that subclasses of `Issue` use define the issue appearance:
 * `file` specifies the markdown file, substitutions can be used to replace
 * placeholders with, e.g. URLs. The `links` property is used to specify the
 * links at the bottom of the issue.
 */
export interface MarkdownIssueDescription {
    file: string;
    title?: string;
    substitutions?: Map<string, string>;
    links: Array<{
        link: string;
        linkTitle: string;
    }>;
}
export interface LazyMarkdownIssueDescription {
    file: string;
    title?: () => string;
    substitutions?: Map<string, () => string>;
    links: Array<{
        link: string;
        linkTitle: () => string;
    }>;
}
/**
 * A lazy version of the description. Allows to specify a description as a
 * constant and at the same time delays resolution of the substitutions
 * and/or link titles to allow localization.
 */
export declare function resolveLazyDescription(lazyDescription: LazyMarkdownIssueDescription): MarkdownIssueDescription;
/**
 * A loaded and parsed issue description. This is usually obtained by loading
 * a `MarkdownIssueDescription` via `createIssueDescriptionFromMarkdown`.
 */
export interface IssueDescription {
    title: string;
    markdown: Marked.Marked.Token[];
    links: Array<{
        link: string;
        linkTitle: string;
    }>;
    substitutions?: Map<string, string>;
}
export declare function getFileContent(url: URL): Promise<string>;
export declare function getMarkdownFileContent(filename: string): Promise<string>;
export declare function createIssueDescriptionFromMarkdown(description: MarkdownIssueDescription): Promise<IssueDescription>;
/**
 * This function is exported separately for unit testing.
 */
export declare function createIssueDescriptionFromRawMarkdown(markdown: string, description: MarkdownIssueDescription): IssueDescription;
export declare function findTitleFromMarkdownAst(markdownAst: Marked.Marked.Token[]): string | null;
export declare function getIssueTitleFromMarkdownDescription(description: MarkdownIssueDescription): Promise<string | null>;
