import { Badge, BadgeAction } from './Badge.js';
export declare class SpeedsterBadge extends Badge {
    readonly name = "profiles/me/awards/developers.google.com%2Fprofile%2Fbadges%2Factivity%2Fchrome-devtools%2Fspeedster";
    readonly title = "Speedster";
    readonly jslogContext = "speedster";
    readonly interestedActions: readonly BadgeAction[];
    readonly imageUri: string;
    handleAction(_action: BadgeAction): void;
}
