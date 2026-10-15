# Invalid `keyid` value in a `signature-input` header

The key specified in a [`signature-input`](signatureInputHeader) header’s
[`keyid` parameter](signatureParameters) isn’t a base64-encoded
256 bit sequence, and therefore can’t be decoded as an Ed25519 public key.

Note that the `keyid` parameter’s value is a string, not a
[Byte Sequence](sfByteSequence). For example:

```
Signature-Input: signature=("unencoded-digest";sf);keyid="JrQLj5P/89iXES9+vFgrIy29clF9CC/oPPsw3c5D0bs=";tag="sri"
```
