import { Badge, BadgeAction } from './Badge.js';
export declare class CodeWhispererBadge extends Badge {
    readonly name = "profiles/me/awards/developers.google.com%2Fprofile%2Fbadges%2Factivity%2Fchrome-devtools%2Fcode-whisperer";
    readonly title = "Code Whisperer";
    readonly jslogContext = "code-whisperer";
    readonly imageUri: string;
    readonly interestedActions: readonly BadgeAction[];
    handleAction(_action: BadgeAction): void;
}
