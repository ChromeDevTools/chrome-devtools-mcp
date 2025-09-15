/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

type CSSInJS = string & {_tag: 'CSS-in-JS'};
declare module '*.css.js' {
  const styles: CSSInJS;
  export default styles;
}
