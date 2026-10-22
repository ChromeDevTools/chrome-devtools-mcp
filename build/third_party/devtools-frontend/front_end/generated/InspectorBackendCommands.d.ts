export interface CommandParameter {
    name: string;
    type: string;
    optional: boolean;
    description: string;
    typeRef: string | null;
}
export interface InspectorBackendAPI {
    registerCommand(command: string, parameters: CommandParameter[], replayArgs: string[], description: string): void;
    registerEnum(type: string, values: Record<string, string>): void;
    registerEvent(event: string, params: string[]): void;
    registerType(type: string, parameters: CommandParameter[]): void;
}
export declare function registerCommands(inspectorBackend: InspectorBackendAPI): void;
