/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import checkLicenseRule from './check-license-rule.js';
import enforceZodSchemaRule from './enforce-zod-schema-rule.js';
import noDirectThirdPartyImportsRule from './no-direct-third-party-imports-rule.js';

export default {
  rules: {
    'check-license': checkLicenseRule,
    'no-direct-third-party-imports': noDirectThirdPartyImportsRule,
    'enforce-zod-schema': enforceZodSchemaRule,
  },
};
