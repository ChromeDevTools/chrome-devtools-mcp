/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
let issuesEnabled = false;

export const features = {
  get issues() {
    return issuesEnabled;
  },
};

export function setIssuesEnabled(value: boolean) {
  issuesEnabled = value;
}
