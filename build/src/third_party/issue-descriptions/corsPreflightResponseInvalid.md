# Ensure preflight responses are valid

A Cross-Origin Resource Sharing (CORS) request was blocked because the response to the associated [preflight request](issueCorsPreflightRequest) failed, had an unsuccessful HTTP status code, and/or was a redirect.

To fix this issue, ensure all CORS preflight `OPTIONS` requests are answered with a successful HTTP status code (2xx) and don’t redirect.
