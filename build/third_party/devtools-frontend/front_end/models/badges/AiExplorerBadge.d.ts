import { Badge, BadgeAction, type BadgeContext } from './Badge.js';
export declare class AiExplorerBadge extends Badge {
    #private;
    readonly name = "profiles/me/awards/developers.google.com%2Fprofile%2Fbadges%2Factivity%2Fchrome-devtools%2Fai-explorer";
    readonly title = "AI Explorer";
    readonly jslogContext = "ai-explorer";
    readonly imageUri: string;
    readonly interestedActions: readonly BadgeAction[];
    constructor(badgeContext: BadgeContext);
    handleAction(_action: BadgeAction): void;
}
