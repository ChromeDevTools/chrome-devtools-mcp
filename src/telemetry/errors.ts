/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 *
 * IMPORTANT:
 *   1. this module must only contain ErrorCode.
 *   2. do not refactor ErrorCode to elsewhere.
 *   3. prefix new enum values with "ERROR_CODE_". This makes it easier to
 *      programmtically parse this file.
 */

export enum ErrorCode {
  ERROR_CODE_UNSPECIFIED = 0,
  ERROR_CODE_PERSISTENCE_FILE_READ_FAILED = 1,
  ERROR_CODE_PERSISTENCE_FILE_SAVE_FAILED = 3,
}
