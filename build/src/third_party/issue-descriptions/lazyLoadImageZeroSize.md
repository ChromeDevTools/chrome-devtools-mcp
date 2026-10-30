# Lazy-loaded images should have explicit dimensions

An image on this page specifies `loading="lazy"` without explicit width and height dimensions or aspect ratio styling.

When lazy-loaded images lack dimensions, the browser allocates an initial 0x0 bounding box before network loading completes. As the user scrolls and the image loads, its sudden expansion triggers unexpected layout shifts (CLS) and can displace or clip surrounding content.

To stop layout shifts, always include explicit `width` and `height` attributes on lazy-loaded images, or define their aspect ratio using CSS.
