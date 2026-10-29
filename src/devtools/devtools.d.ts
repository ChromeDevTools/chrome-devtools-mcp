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

declare module '*.skill.js' {
  interface Skill {
    name:
      | 'styling'
      | 'network'
      | 'performance'
      | 'storage'
      | 'sources'
      | 'lighthouse';
    description: string;
    allowedTools: string[];
    instructions: string;
  }
  const skill: Skill;
  export {skill};
  export default skill;
}
