import * as Types from '../types/types.js';
import { ScoreClassification } from './PageLoadMetricsHandler.js';
import type { HandlerName } from './types.js';
export declare const LONG_INTERACTION_THRESHOLD: Types.Timing.Micro;
export interface UserInteractionsData {
    /** All the BeginCommitCompositorFrame events we found in the trace */
    beginCommitCompositorFrameEvents: readonly Types.Events.BeginCommitCompositorFrame[];
    /** All the ParseMetaViewport events we found in the trace */
    parseMetaViewportEvents: readonly Types.Events.ParseMetaViewport[];
    /**
     * All the interaction events we found in the trace that had an
     * interactionId and a duration > 0
     **/
    interactionEvents: readonly Types.Events.SyntheticInteractionPair[];
    /**
     * If the user rapidly generates interaction events (think typing into a
     * text box), in the UI we only really want to show the user the longest
     * interaction in that set.
     * For example picture interactions like this:
     * ===[interaction A]==========
     *       =[interaction B]======
     *            =[interaction C]=
     *
     * These events all end at the same time, and so in this instance we only want
     * to show the first interaction A on the timeline, as that is the longest one
     * and the one the developer should be focusing on. So this array of events is
     * all the interaction events filtered down, removing any nested interactions
     * entirely.
     **/
    interactionEventsWithNoNesting: readonly Types.Events.SyntheticInteractionPair[];
    longestInteractionEvent: Readonly<Types.Events.SyntheticInteractionPair> | null;
    interactionsOverThreshold: Readonly<Set<Types.Events.SyntheticInteractionPair>>;
}
export declare function reset(): void;
export declare function handleEvent(event: Types.Events.Event): void;
export type InteractionCategory = 'KEYBOARD' | 'POINTER' | 'OTHER';
export declare function categoryOfInteraction(interaction: Types.Events.SyntheticInteractionPair): InteractionCategory;
/**
 * We define a set of interactions as nested where:
 * 1. Their end times align.
 * 2. The longest interaction's start time is earlier than all other
 * interactions with the same end time.
 * 3. The interactions are of the same category [each interaction is either
 * categorised as keyboard, or pointer.]
 *
 * =============A=[pointerup]=
 *        ====B=[pointerdown]=
 *        ===C=[pointerdown]==
 *         ===D=[pointerup]===
 *
 * In this example, B, C and D are all nested and therefore should not be
 * returned from this function.
 *
 * However, in this example we would only consider B nested (under A) and D
 * nested (under C). A and C both stay because they are of different types.
 * ========A=[keydown]====
 *   =======B=[keyup]=====
 *    ====C=[pointerdown]=
 *         =D=[pointerup]=
 *
 * Additionally, this method will also maximise the processing duration of the
 * events that we keep as non-nested. We want to make sure we give an accurate
 * representation of main thread activity, so if we keep an event + hide its
 * nested children, we set the top level event's processing start &
 * processing end to be the earliest processing start & the latest processing
 * end of its children. This ensures we report a more accurate main thread
 * activity time which is important as we want developers to focus on fixing
 * this.
 **/
export declare function removeNestedInteractionsAndSetProcessingTime(interactions: readonly Types.Events.SyntheticInteractionPair[]): readonly Types.Events.SyntheticInteractionPair[];
export declare function finalize(): Promise<void>;
export declare function data(): UserInteractionsData;
export declare function deps(): HandlerName[];
/**
 * Classifications sourced from
 * https://web.dev/articles/inp#good-score
 */
export declare function scoreClassificationForInteractionToNextPaint(timing: Types.Timing.Micro): ScoreClassification;
