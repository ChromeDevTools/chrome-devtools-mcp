# `Connection-Allowlist` has multiple items

Responses’ `Connection-Allowlist` header should be formatted as a [List](sfList)
containing a single [Inner List](sfInnerList) that declares the allowed set of
[URL Patterns](urlPatternSpec) for a given context. This response was a
[List](sfList) containing more than one item: all but the first have been
ignored.
