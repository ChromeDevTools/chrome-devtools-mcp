# A frame's `connectionallowlist` attribute was discarded.

An embedder can require a framed document to enforce a `Connection-Allowlist` by
setting the `connectionallowlist` attribute on the frame. When a requirement is
already in effect for the embedder itself, a nested frame's attribute may only
make that requirement stricter, never looser.

This frame's attribute allowed connections that the requirement it inherits from
an ancestor does not, so the attribute was discarded and the inherited
requirement applies unchanged.

For example, the nested frame below cannot re-admit `https://example.com/`, so
it inherits `("https://cdn.example/")` rather than the value it asked for:

```
<!-- Framed by an ancestor that requires ("https://cdn.example/"): -->
<iframe connectionallowlist='("https://cdn.example/" "https://example.com/")'
        src="..."></iframe>
```
