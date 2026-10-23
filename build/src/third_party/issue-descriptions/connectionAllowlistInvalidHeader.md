# The `Connection-Allowlist` header isn’t formatted as a Structured Field List

Responses’ `Connection-Allowlist` header should be formatted as a [List](sfList)
containing a single [Inner List](sfInnerList) that declares the allowed set of
[URL Patterns](urlPatternSpec) for a given context.

For example, the following header allows connections to (only)
`https://example.com/`:

```
Connection-Allowlist: ("https://example.com")
```
