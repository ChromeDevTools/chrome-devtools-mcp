/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export type PolicyTier = 'enabled' | 'on-demand' | 'locked';

export interface DomainPack {
  id: string;
  defaultPolicy: PolicyTier;
  tools: string[];
  summary: string;
  microSkill: string;
}

export const CORE_PACK_ID = 'core';

export const DOMAIN_PACKS: DomainPack[] = [
  {
    id: CORE_PACK_ID,
    defaultPolicy: 'enabled',
    tools: [
      'navigate_page',
      'close_page',
      'new_page',
      'list_pages',
      'select_page',
      'wait_for',
      'take_snapshot',
      'take_screenshot',
      'click',
      'fill',
      'fill_form',
      'type_text',
      'press_key',
      'hover',
      'drag',
      'upload_file',
      'handle_dialog',
      'resize_page',
      'emulate',
      'evaluate_script',
      'get_console_message',
      'list_console_messages',
      'get_network_request',
      'list_network_requests',
      'get_css_styles',
    ],
    summary: 'Core tools for navigation, inspection, and interaction.',
    microSkill: 'Core tools for navigation, inspection, and interaction.',
  },
  {
    id: 'memory',
    defaultPolicy: 'on-demand',
    tools: [
      'take_heapsnapshot',
      'get_heapsnapshot_summary',
      'get_heapsnapshot_details',
      'get_heapsnapshot_class_nodes',
      'get_heapsnapshot_object_details',
      'get_heapsnapshot_edges',
      'get_heapsnapshot_retainers',
      'get_heapsnapshot_retaining_paths',
      'get_heapsnapshot_dominators',
      'get_heapsnapshot_duplicate_strings',
      'analyze_heapsnapshot_contexts',
      'compare_heapsnapshots',
      'query_heapsnapshot_objects',
      'close_heapsnapshot',
    ],
    summary: 'Heap snapshots and memory leak debugging.',
    microSkill:
      'Enable this pack to take and inspect heap snapshots. If your harness caches tools at startup, invoke these tools via `manage_capabilities` action: "call". Disable when finished to free resources.',
  },
  {
    id: 'performance',
    defaultPolicy: 'on-demand',
    tools: [
      'performance_start_trace',
      'performance_stop_trace',
      'performance_analyze_insight',
    ],
    summary: 'Performance traces and CrUX insights.',
    microSkill:
      'Enable this pack to record and analyze performance traces. If your harness caches tools at startup, invoke these tools via `manage_capabilities` action: "call". Disable when finished.',
  },
  {
    id: 'audits',
    defaultPolicy: 'on-demand',
    tools: ['lighthouse_audit'],
    summary: 'Lighthouse audits for accessibility, SEO, and best practices.',
    microSkill:
      'Enable this pack to run Lighthouse audits. If your harness caches tools at startup, invoke these tools via `manage_capabilities` action: "call". Disable when finished.',
  },
  {
    id: 'screencast',
    defaultPolicy: 'on-demand',
    tools: ['screencast_start', 'screencast_stop'],
    summary: 'Screencast recording.',
    microSkill:
      'Enable this pack to record screencasts. If your harness caches tools at startup, invoke these tools via `manage_capabilities` action: "call".',
  },
  {
    id: 'extensions',
    defaultPolicy: 'locked',
    tools: [
      'install_extension',
      'uninstall_extension',
      'list_extensions',
      'reload_extension',
      'trigger_extension_action',
    ],
    summary: 'Chrome extension management.',
    microSkill:
      'Enable this pack to manage Chrome extensions. If your harness caches tools at startup, invoke these tools via `manage_capabilities` action: "call".',
  },
  {
    id: 'pwa',
    defaultPolicy: 'on-demand',
    tools: ['install_pwa', 'uninstall_pwa', 'launch_pwa', 'get_os_app_state'],
    summary: 'PWA installation and state.',
    microSkill:
      'Enable this pack to manage PWAs. If your harness caches tools at startup, invoke these tools via `manage_capabilities` action: "call".',
  },
  {
    id: 'webmcp',
    defaultPolicy: 'on-demand',
    tools: [
      'list_webmcp_tools',
      'execute_webmcp_tool',
      'list_3p_developer_tools',
      'execute_3p_developer_tool',
    ],
    summary: 'WebMCP tools execution.',
    microSkill:
      'Enable this pack to execute WebMCP tools. If your harness caches tools at startup, invoke these tools via `manage_capabilities` action: "call".',
  },
];
