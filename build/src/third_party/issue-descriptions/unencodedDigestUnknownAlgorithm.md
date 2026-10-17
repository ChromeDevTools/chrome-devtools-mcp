# An `unencoded-digest` header contains a digest with an invalid algorithm

[`unencoded-digest`](unencodedDigestHeader) headers support only two hashing
algorithms, SHA-256, and SHA-512. The digests delivered with this response
specified an unsupported algorithm:

For example, if the body was "Hello, world.", the following would be an
appropriate header:

```
Unencoded-Digest: sha-256=:+MO/YqmqPm/BYZwlDkir51GTc9Pt9BvmLrXcRRma8u8=:,
                  sha-512=:S7LmUoguRQsq3IHIZ0Xhm5jjCDqH6uUQbumuj5CnrIFDk+RyBW/dWuqzEiV4mPaB:
```

Note also that the labels must be lower-case.
