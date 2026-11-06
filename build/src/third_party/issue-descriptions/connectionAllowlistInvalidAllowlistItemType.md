# An item in the `Connection-Allowlist` header is invalid

Each item in the `Connection-Allowlist`’s header’s [Inner List](sfInnerList)
must be a [String](sfString) representing a [URL Pattern](urlPatternSpec), or
the [Token](sfToken) `response-origin`.

For example, the following header allows connections to (only)
`https://example.com/` and the origin from which the response was delivered:

```
Connection-Allowlist: ("https://example.com" response-origin)
```
