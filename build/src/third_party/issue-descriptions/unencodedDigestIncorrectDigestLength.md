# An `unencoded-digest` header contains a digest with an incorrect length

[`unencoded-digest`](unencodedDigestHeader) headers contain SHA2 digests of a
response’s body. The digest delivered with this response isn’t the correct
length for the algorithm specified. SHA-256 digests should be 256 bits long,
SHA-512 digests 512 bits long. For example, if the body was "Hello, world.", the
following might be an appropriate header:

```
Unencoded-Digest: sha-256=:+MO/YqmqPm/BYZwlDkir51GTc9Pt9BvmLrXcRRma8u8=:,
                  sha-512=:S7LmUoguRQsq3IHIZ0Xhm5jjCDqH6uUQbumuj5CnrIFDk+RyBW/dWuqzEiV4mPaB:
```
