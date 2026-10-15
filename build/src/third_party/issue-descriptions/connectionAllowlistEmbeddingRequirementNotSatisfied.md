# A framed document did not accept its embedder's `Connection-Allowlist`.

An embedder can require a framed document to enforce a `Connection-Allowlist` by
setting the `connectionallowlist` attribute on the frame. The framed document
must agree, in one of two ways:

*   by responding with an `Allow-Connection-Allowlist-From` header naming the
    embedder's origin (or `*` to accept any embedder), which installs the
    embedder's allowlist on the framed document, or
*   by responding with a `Connection-Allowlist` header of its own that is at
    least as strict as the one required, which is then enforced instead.

This response did neither, so it was not displayed.

For example, a document framed by an embedder requiring
`("https://cdn.example/")` may accept that requirement outright:

```
Allow-Connection-Allowlist-From: *
```

or satisfy it with an allowlist that is no more permissive:

```
Connection-Allowlist: ("https://cdn.example/")
```
