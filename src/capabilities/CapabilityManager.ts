/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {CORE_PACK_ID, DOMAIN_PACKS, type PolicyTier} from './DomainPacks.js';

export interface CapabilityManagerOptions {
  metaFeatureSystem?: boolean;
  packPolicy?: string; // e.g., 'performance=enabled,memory=locked'
  toolPolicy?: string; // e.g., 'take_heapsnapshot=enabled'
}

export class CapabilityManager {
  #metaFeatureSystem = false;
  get isMetaFeatureSystemEnabled(): boolean {
    return this.#metaFeatureSystem;
  }
  #packPolicies = new Map<string, PolicyTier>();
  #toolPolicies = new Map<string, PolicyTier>();
  #activePacks = new Set<string>();
  #explicitlyEnabledPacks = new Set<string>();

  constructor(options: CapabilityManagerOptions = {}) {
    this.reconfigure(options);
  }

  reconfigure(options: CapabilityManagerOptions): void {
    this.#metaFeatureSystem = options.metaFeatureSystem ?? false;
    this.#packPolicies.clear();
    this.#toolPolicies.clear();
    this.#activePacks.clear();
    this.#explicitlyEnabledPacks.clear();

    if (options.packPolicy) {
      for (const pair of options.packPolicy.split(',')) {
        const [pack, policy] = pair.split('=');
        if (
          pack &&
          policy &&
          ['enabled', 'on-demand', 'locked'].includes(policy.trim())
        ) {
          this.#packPolicies.set(pack.trim(), policy.trim() as PolicyTier);
        }
      }
    }

    if (options.toolPolicy) {
      for (const pair of options.toolPolicy.split(',')) {
        const [tool, policy] = pair.split('=');
        if (
          tool &&
          policy &&
          ['enabled', 'on-demand', 'locked'].includes(policy.trim())
        ) {
          this.#toolPolicies.set(tool.trim(), policy.trim() as PolicyTier);
        }
      }
    }

    this.#initializeActivePacks();
  }

  #initializeActivePacks(): void {
    for (const pack of DOMAIN_PACKS) {
      const policy = this.getPackPolicy(pack.id);
      if (policy === 'enabled') {
        this.#activePacks.add(pack.id);
      }
    }
  }

  getPackPolicy(packId: string): PolicyTier {
    const configured = this.#packPolicies.get(packId);
    if (configured !== undefined) {
      return configured;
    }
    const pack = DOMAIN_PACKS.find(p => p.id === packId);
    if (!pack) {
      return 'locked';
    }

    if (!this.#metaFeatureSystem) {
      // Legacy behavior: when --meta-feature-system is not enabled, all packs remain enabled unless overridden by --pack-policy
      return 'enabled';
    }

    return pack.defaultPolicy;
  }

  getToolPolicy(toolName: string): PolicyTier {
    const configured = this.#toolPolicies.get(toolName);
    if (configured !== undefined) {
      return configured;
    }

    for (const pack of DOMAIN_PACKS) {
      if (pack.tools.includes(toolName)) {
        return this.getPackPolicy(pack.id);
      }
    }

    return 'enabled'; // Default for tools not managed by packs
  }

  isToolActive(toolName: string): boolean {
    const policy = this.getToolPolicy(toolName);
    if (policy === 'locked') {
      return false;
    }
    if (policy === 'enabled') {
      return true;
    }

    // Policy is on-demand
    for (const pack of DOMAIN_PACKS) {
      if (pack.tools.includes(toolName)) {
        if (
          this.#toolPolicies.get(toolName) === 'on-demand' &&
          this.getPackPolicy(pack.id) === 'enabled'
        ) {
          return this.#explicitlyEnabledPacks.has(pack.id);
        }
        return this.#activePacks.has(pack.id);
      }
    }

    return this.#explicitlyEnabledPacks.has(CORE_PACK_ID);
  }

  enablePack(packId: string): {
    success: boolean;
    error?: string;
    microSkill?: string;
  } {
    const policy = this.getPackPolicy(packId);
    if (policy === 'locked') {
      return {
        success: false,
        error: `Capability '${packId}' is locked by policy and cannot be enabled.`,
      };
    }

    const pack = DOMAIN_PACKS.find(p => p.id === packId);
    if (!pack) {
      return {success: false, error: `Unknown capability '${packId}'.`};
    }

    this.#activePacks.add(packId);
    this.#explicitlyEnabledPacks.add(packId);
    return {success: true, microSkill: pack.microSkill};
  }

  disablePack(packId: string): {success: boolean; error?: string} {
    const policy = this.getPackPolicy(packId);
    if (policy === 'locked') {
      return {
        success: false,
        error: `Capability '${packId}' is locked by policy.`,
      };
    }

    if (policy === 'enabled') {
      return {
        success: false,
        error: `Capability '${packId}' is permanently enabled by policy and cannot be disabled.`,
      };
    }

    this.#activePacks.delete(packId);
    this.#explicitlyEnabledPacks.delete(packId);
    return {success: true};
  }

  getActivePacks(): string[] {
    return Array.from(this.#activePacks);
  }
}
