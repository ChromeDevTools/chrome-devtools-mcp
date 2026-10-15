# Ensure CORS response header values are valid

A Cross-Origin Resource Sharing (CORS) request was blocked because of invalid or missing response headers of the request or the associated [preflight request](issueCorsPreflightRequest).

To fix this issue, ensure the response to the CORS request and/or the associated [preflight request](issueCorsPreflightRequest) aren’t missing headers and use valid header values.

Note that if an opaque response is sufficient, the request’s mode can be set to `no-cors` to fetch the resource with CORS disabled; that way CORS headers aren’t required but the response content is inaccessible (opaque).
