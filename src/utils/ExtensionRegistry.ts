/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import path from 'node:path';

export interface InstalledExtension {
  id: string;
  name: string;
  version: string;
  isEnabled: boolean;
  path: string;
}

export class ExtensionRegistry {
  #extensions = new Map<string, InstalledExtension>();

  async registerExtension(
    id: string,
    extensionPath: string,
  ): Promise<InstalledExtension> {
    const manifestPath = path.join(extensionPath, 'manifest.json');
    const manifestContent = await fs.readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestContent);
    const name = manifest.name ?? 'Unknown';
    const version = manifest.version ?? 'Unknown';

    const extension = {
      id,
      name,
      version,
      isEnabled: true,
      path: extensionPath,
    };
    this.#extensions.set(extension.id, extension);
    return extension;
  }

  remove(id: string): void {
    this.#extensions.delete(id);
  }

  list(): InstalledExtension[] {
    return Array.from(this.#extensions.values());
  }

  getById(id: string): InstalledExtension | undefined {
    return this.#extensions.get(id);
  }
}
