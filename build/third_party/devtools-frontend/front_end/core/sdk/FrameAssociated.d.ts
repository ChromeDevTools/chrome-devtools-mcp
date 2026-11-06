import type { PageResourceLoadInitiator } from './PageResourceLoader.js';
import type { DebugId } from './SourceMap.js';
export interface FrameAssociated {
    createPageResourceLoadInitiator(): PageResourceLoadInitiator;
    debugId(): DebugId | null;
}
