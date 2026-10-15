
export function getChromeVersion() { return ''; };
export function getRemoteBase() { return null; };
export const hostConfig = {};
export const GenAiEnterprisePolicyValue = {
  ALLOW: 0,
  ALLOW_WITHOUT_LOGGING: 1,
  DISABLE: 2,
};
export const HostConfigFreestylerExecutionMode = {
  ALL_SCRIPTS: 'ALL_SCRIPTS',
  SIDE_EFFECT_FREE_SCRIPTS_ONLY: 'SIDE_EFFECT_FREE_SCRIPTS_ONLY',
  NO_SCRIPTS: 'NO_SCRIPTS',
};
export const GdpProfilesEnterprisePolicyValue = {
  ENABLED: 0,
  ENABLED_WITHOUT_BADGES: 1,
  DISABLED: 2,
};
export const Runtime = {
  isDescriptorEnabled: () => true,
  queryParam: () => null,
}
export const experiments = {
  isEnabled: () => false,
}
export const ExperimentName = {
  ALL: '*',
  CAPTURE_NODE_CREATION_STACKS: 'capture-node-creation-stacks',
  LIVE_HEAP_PROFILE: 'live-heap-profile',
  PROTOCOL_MONITOR: 'protocol-monitor',
  SAMPLING_HEAP_PROFILER_TIMELINE: 'sampling-heap-profiler-timeline',
  SHOW_OPTION_TO_EXPOSE_INTERNALS_IN_HEAP_SNAPSHOT: 'show-option-to-expose-internals-in-heap-snapshot',
  TIMELINE_INVALIDATION_TRACKING: 'timeline-invalidation-tracking',
  TIMELINE_SHOW_ALL_EVENTS: 'timeline-show-all-events',
  TIMELINE_V8_RUNTIME_CALL_STATS: 'timeline-v8-runtime-call-stats',
  APCA: 'apca',
  FONT_EDITOR: 'font-editor',
  FULL_ACCESSIBILITY_TREE: 'full-accessibility-tree',
  CONTRAST_ISSUES: 'contrast-issues',
  EXPERIMENTAL_COOKIE_FEATURES: 'experimental-cookie-features',
  INSTRUMENTATION_BREAKPOINTS: 'instrumentation-breakpoints',
  AUTHORED_DEPLOYED_GROUPING: 'authored-deployed-grouping',
  JUST_MY_CODE: 'just-my-code',
  USE_SOURCE_MAP_SCOPES: 'use-source-map-scopes',
  TIMELINE_SHOW_POST_MESSAGE_EVENTS: 'timeline-show-postmessage-events',
  TIMELINE_DEBUG_MODE: 'timeline-debug-mode',
}
  