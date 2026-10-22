export type Values = Record<string, string | boolean | number>;
export interface SerializedMessage {
    string: string;
    values: Values;
}
