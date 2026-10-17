# An item in the `Connection-Allowlist` header isn’t a valid URL pattern

Each item in the `Connection-Allowlist` header must be a valid
[URL Pattern](urlPatternSpec) that can be used to match against the request’s
origin.

Note that our current implementation doesn’t allow regular expressions to be
used as part of the pattern.
