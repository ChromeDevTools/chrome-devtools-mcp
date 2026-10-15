// Copyright 2025 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
/**
 * @file This files include scripts that are executed not in
 * the DevTools target but the page one.
 * They need remain isolated for importing other function so
 * bundling them for production does not create issues.
 */
export const AI_ASSISTANCE_CSS_CLASS_NAME = 'ai-style-change';
export const FREESTYLER_WORLD_NAME = 'DevTools AI Assistance';
export const FREESTYLER_WORLD_CSP = 'connect-src \'none\'';
export const FREESTYLER_BINDING_NAME = '__freestyler';
/**
 * Please see fileoverview
 */
function freestylerBindingFunc(bindingName) {
    // Executed in another world
    const global = globalThis;
    if (!global.freestyler) {
        const freestyler = (args) => {
            const { resolve, reject, promise } = Promise.withResolvers();
            freestyler.callbacks.set(freestyler.id, {
                args: JSON.stringify(args),
                element: args.element,
                resolve,
                reject,
                error: args.error,
            });
            // @ts-expect-error this is binding added though CDP
            globalThis[bindingName](String(freestyler.id));
            freestyler.id++;
            return promise;
        };
        freestyler.id = 1;
        freestyler.callbacks = new Map();
        freestyler.getElement = (callbackId) => {
            return freestyler.callbacks.get(callbackId)?.element;
        };
        freestyler.getArgs = (callbackId) => {
            return freestyler.callbacks.get(callbackId)?.args;
        };
        freestyler.respond = (callbackId, styleChangesOrError) => {
            if (typeof styleChangesOrError === 'string') {
                freestyler.callbacks.get(callbackId)?.resolve(styleChangesOrError);
            }
            else {
                const callback = freestyler.callbacks.get(callbackId);
                if (callback) {
                    callback.error.message = styleChangesOrError.message;
                    callback.reject(callback?.error);
                }
            }
            freestyler.callbacks.delete(callbackId);
        };
        global.freestyler = freestyler;
    }
}
export const freestylerBinding = `(${String(freestylerBindingFunc)})('${FREESTYLER_BINDING_NAME}')`;
export const PAGE_EXPOSED_FUNCTIONS = ['setElementStyles'];
/**
 * Please see fileoverview
 */
const setupSetElementStyles = `function setupSetElementStyles(prefix) {
  const global = globalThis;
  async function setElementStyles(el, styles) {
    let selector = el.tagName.toLowerCase();
    if (el.id) {
      selector = '#' + el.id;
    } else if (el.classList.length) {
      const parts = [];
      for (const cls of el.classList) {
        if (cls.startsWith(prefix)) {
          continue;
        }
        parts.push('.' + cls);
      }
      if (parts.length) {
        selector = parts.join('');
      }
    }

    // __freestylerClassName is not exposed to the page due to this being
    // run in the isolated world.
    const className = el.__freestylerClassName ?? \`\${prefix}-\${global.freestyler.id}\`;
    el.__freestylerClassName = className;
    el.classList.add(className);

    // Remove inline styles with the same keys so that the edit applies.
    for (const key of Object.keys(styles)) {
      // if it's kebab case.
      el.style.removeProperty(key);
      // If it's camel case.
      el.style[key] = '';
    }

    const bindingError = new Error();

    const result = await global.freestyler({
      method: 'setElementStyles',
      selector,
      className,
      styles,
      element: el,
      error: bindingError,
    });

    const rootNode = el.getRootNode();
    if (rootNode instanceof ShadowRoot) {
      const stylesheets = rootNode.adoptedStyleSheets;
      let hasAiStyleChange = false;
      let stylesheet = new CSSStyleSheet();
      for (let i = 0; i < stylesheets.length; i++) {
        const sheet = stylesheets[i];
        for (let j = 0; j < sheet.cssRules.length; j++) {
          const rule = sheet.cssRules[j];
          if (!(rule instanceof CSSStyleRule)) {
            continue;
          }

          hasAiStyleChange = rule.selectorText.startsWith(\`.\${prefix}\`);
          if (hasAiStyleChange) {
            stylesheet = sheet;
            break;
          }
        }
      }
      stylesheet.replaceSync(result);
      if (!hasAiStyleChange) {
        rootNode.adoptedStyleSheets = [...stylesheets, stylesheet];
      }
    }
  }

  global.setElementStyles = setElementStyles;
}`;
export const injectedFunctions = `(${setupSetElementStyles})('${AI_ASSISTANCE_CSS_CLASS_NAME}')`;
//# sourceMappingURL=injected.js.map