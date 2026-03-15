/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import checkLicenseRule from './check-license-rule.js';
import noZodNullableObjectRule from './no-zod-nullable-object-rule.js';

export default {
  rules: {
    'check-license': checkLicenseRule,
    'no-zod-nullable-object': noZodNullableObjectRule,
  },
};
