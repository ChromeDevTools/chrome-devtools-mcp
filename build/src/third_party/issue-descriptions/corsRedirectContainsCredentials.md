# Ensure CORS requests aren’t redirected to URLs containing credentials

A Cross-Origin Resource Sharing (CORS) request was blocked because the response was a redirect to a URL that includes credentials, i.e. redirected to a URL of the form `https://username:password@example.com`.

To fix this issue, ensure CORS requests aren’t redirected to URLs that include credentials.
