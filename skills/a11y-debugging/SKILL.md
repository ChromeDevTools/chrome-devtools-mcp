---
name: a11y-debugging
description: Uses Chrome DevTools MCP for accessibility (a11y) debugging and auditing based on web.dev guidelines. Use when testing semantic HTML, ARIA labels, focus states, keyboard navigation, tap targets, and color contrast.
---

## Core Concepts

**Accessibility Tree vs DOM**: Visually hiding an element (e.g., `CSS opacity: 0`) behaves differently for screen readers than `display: none` or `aria-hidden="true"`. The `take_snapshot` tool returns the accessibility tree of the page, which represents what assistive technologies "see", making it the most reliable source of truth for semantic structure.

**Reading web.dev documentation**: If you need to research specific accessibility guidelines (like `https://web.dev/articles/accessible-tap-targets`), you can append `.md.txt` to the URL (e.g., `https://web.dev/articles/accessible-tap-targets.md.txt`) to fetch the clean, raw markdown version. This is much easier to read using the `read_url_content` tool!

## Workflow Patterns

### 1. Browser Issues & Audits

Chrome automatically checks for common accessibility problems. Use `list_console_messages` to check for these native audits first:
-   `types`: `["issue"]`
-   `includePreservedMessages`: `true` (to catch issues that occurred during page load)

This often reveals missing labels, invalid ARIA attributes, and other critical errors without manual investigation.

### 2. Semantics & Structure

The accessibility tree exposes the heading hierarchy and semantic landmarks.

1.  Navigate to the page.
2.  Use `take_snapshot` to capture the accessibility tree.
3.  **Check Heading Levels**: Ensure heading levels (`h1`, `h2`, `h3`, etc.) are logical and do not skip levels. The snapshot will include heading roles.
4.  **Content Reordering**: Verify that the DOM order (which drives the accessibility tree) matches the visual reading order. Use `take_screenshot` to inspect the visual layout and compare it against the snapshot structure to catch CSS floats or absolute positioning that jumbles the logical flow.

### 3. Labels, Forms & Text Alternatives

1.  Locate buttons, inputs, and images in the `take_snapshot` output.
2.  Ensure interactive elements have an accessible name (e.g., a button should not just say `""` if it only contains an icon).
3.  **Orphaned Inputs**: Verify that all form inputs have associated labels. Use `evaluate_script` to check for inputs missing `id` (for `label[for]`) or `aria-label`:
    ```javascript
    () => {
      const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
      return inputs.filter(i => {
        const hasId = i.id && document.querySelector(`label[for="${i.id}"]`);
        const hasAria = i.getAttribute('aria-label') || i.getAttribute('aria-labelledby');
        const hasImplicitLabel = i.closest('label');
        return !hasId && !hasAria && !hasImplicitLabel;
      }).map(i => ({ tag: i.tagName, id: i.id, name: i.name, placeholder: i.placeholder }));
    }
    ```
4.  Check images for `alt` text.

### 4. Focus & Keyboard Navigation

Testing "keyboard traps" and proper focus management without visual feedback relies on precise scripting.

1.  Use `evaluate_script` to find the currently focused element:
    ```javascript
    () => {
      const active = document.activeElement;
      return { tag: active.tagName, id: active.id, className: active.className, text: active.innerText };
    }
    ```
2.  Use the `press_key` tool with `"Tab"` or `"Shift+Tab"` to move focus.
3.  Re-run the script in step 1 to ensure focus moved to the expected next interactive element.
4.  If a modal opens, focus must move into the modal and "trap" within it until closed.

### 5. Tap Targets and Visuals

According to web.dev, tap targets should be at least 48x48 pixels with sufficient spacing. Since the accessibility tree doesn't show sizes, use `evaluate_script`:

```javascript
(el) => {
  const rect = el.getBoundingClientRect();
  return { width: rect.width, height: rect.height };
}
```
*Pass the element's `uid` from the snapshot as an argument to the tool.*

### 6. Color Contrast

To verify color contrast ratios without the DevTools UI, use `evaluate_script` to compute the relative luminance of the text (`color`) and background (`backgroundColor`). 

```javascript
(el) => {
  function getRGB(colorStr) {
    const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    return match ? [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])] : [255, 255, 255];
  }
  function luminance(r, g, b) {
    const a = [r, g, b].map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
  }
  
  const style = window.getComputedStyle(el);
  const fg = getRGB(style.color);
  let bg = getRGB(style.backgroundColor);
  
  // Basic contrast calculation (Note: Doesn't account for transparency over background images)
  const l1 = luminance(fg[0], fg[1], fg[2]);
  const l2 = luminance(bg[0], bg[1], bg[2]);
  const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  
  return { color: style.color, bg: style.backgroundColor, contrastRatio: ratio.toFixed(2) };
}
```
*Pass the element's `uid` to test the contrast against WCAG AA (4.5:1 for normal text, 3:1 for large text).*

### 7. Global Page Checks

Verify document-level accessibility settings often missed in component testing:

```javascript
() => {
  return {
    lang: document.documentElement.lang || 'MISSING - Screen readers need this for pronunciation',
    title: document.title || 'MISSING - Required for context',
    viewport: document.querySelector('meta[name="viewport"]')?.content || 'MISSING - Check for user-scalable=no (bad practice)',
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'Enabled' : 'Disabled'
  };
}
```

## Troubleshooting

If standard a11y queries fail or the `evaluate_script` snippets return unexpected results:

*   **Visual Inspection**: If automated scripts cannot determine contrast (e.g., text over gradient images or complex backgrounds), use `take_screenshot` to capture the element. While models cannot measure exact contrast ratios from images, they can visually assess legibility and identifying obvious issues.
