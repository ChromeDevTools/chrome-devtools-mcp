import { Badge, BadgeAction } from './Badge.js';
export declare class StarterBadge extends Badge {
    readonly isStarterBadge: boolean;
    readonly name = "profiles/me/awards/developers.google.com%2Fprofile%2Fbadges%2Factivity%2Fchrome-devtools%2Fchrome-devtools-user";
    readonly title = "Chrome DevTools User";
    readonly jslogContext = "chrome-devtools-user";
    readonly imageUri: string;
    readonly interestedActions: readonly BadgeAction[];
    handleAction(action: BadgeAction): void;
}
