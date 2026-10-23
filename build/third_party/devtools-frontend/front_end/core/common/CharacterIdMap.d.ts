export declare class CharacterIdMap<T> {
    #private;
    toChar(object: T): string;
    fromChar(character: string): T | null;
}
