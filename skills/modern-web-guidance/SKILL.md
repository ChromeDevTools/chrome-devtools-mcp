---
name: modern-web-guidance
description: |-
  Use this skill to search, retrieve, and apply Modern Web Guidance recommendations from the Chrome team. It provides modern HTML, CSS, and Web API solutions to steer coding agents away from legacy, JavaScript-heavy patterns. Use this skill when implementing new UI components or optimizing performance and accessibility after audits.
---

# Modern Web Guidance

Modern Web Guidance is a library of curated guidelines, best practices, and browser compatibility recommendations developed by the Chrome team. It helps coding agents steer away from legacy, JavaScript-heavy patterns and instead use modern HTML and CSS solutions.

## Why use it

- **Avoid legacy patterns**: AI models often default to outdated solutions (like complex JS libraries for layout, interactivity, or styling) when modern, native HTML/CSS features (like `<dialog>`, `@starting-style`, or `Popover`) provide cleaner, built-in options.
- **Accurate platform capability awareness**: Avoids incorrect or outdated information about browser support, aligning with [Baseline](https://web.dev/baseline) criteria.

## When to use it

Use this skill whenever you need modern web platform guidelines. In particular, check for guidance when:

- **Lighthouse audits identify issues**: For example, when Lighthouse flags issues with accessibility (a11y), LCP, performance, or SEO.
- **Performance traces detect bottlenecks**: For example, large render delays, render-blocking scripts, or slow page loads.
- **Implementing interactive UI components**: Like modal dialogs, tooltips, accordions, lazy loading, resource hints, or page transition animations.

## Search and retrieve guides

The CLI allows searching the guide library and retrieving specific guides by ID.

Search the guide library with a descriptive query or prompt to find relevant guidelines and their use case IDs:

```bash
# Search the guide library with a query.
npx modern-web-guidance search "animate a dialog modal backdrop"
```

Based on the `description` values in the response, choose the ID that best reflects your goal, and retrieve the full content of its guide:

```bash
# Retrieve the full content of a specific guide by its ID.
npx modern-web-guidance retrieve "animate-to-from-top-layer"
```
