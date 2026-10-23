export interface GetErrorStackOutput {
    message: string;
    stack?: string;
}
export declare function getErrorStackOnThePage(this: Error): GetErrorStackOutput;
export declare function stringifyObjectOnThePage(this: unknown): string;
export declare function sanitizeStyleChanges(selector: string, styles: Record<string, string>): Promise<Record<string, string>>;
export declare function dispatchAiAssistanceDoneEvent(): void;
