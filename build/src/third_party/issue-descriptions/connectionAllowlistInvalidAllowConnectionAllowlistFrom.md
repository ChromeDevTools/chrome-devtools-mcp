# The `Allow-Connection-Allowlist-From` header is invalid.

A document that is framed by an embedder requiring a `Connection-Allowlist` can
accept that requirement by responding with an `Allow-Connection-Allowlist-From`
header. The header's value must be either `*`, or a single serialized origin
naming the embedder whose requirement it is willing to accept.

This response's header was neither, so it could not be used to accept the
embedder's requirement.

For example, both of the following are valid:

```
Allow-Connection-Allowlist-From: *
Allow-Connection-Allowlist-From: https://example.com
```

Note that an origin's serialization has no trailing slash, and carries no path,
query, or userinfo. Values like `https://example.com/` and
`https://user@example.com/path` are therefore rejected rather than being
silently reinterpreted as `https://example.com`.
