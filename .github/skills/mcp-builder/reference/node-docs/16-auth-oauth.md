# Auth and OAuth

## Overview

For HTTP transports, the SDK provides OAuth 2.1 style helpers to acquire tokens and attach Authorization headers. It includes client-side OAuth flows and provider helpers.

## SDK API

Client auth module:

- OAuthClientProvider interface
- auth() orchestrator
- UnauthorizedError
- selectClientAuthMethod and client authentication helpers

Provider extensions:

- ClientCredentialsProvider
- PrivateKeyJwtProvider
- StaticPrivateKeyJwtProvider
- createPrivateKeyJwtAuth helper

Transport integration:

- StreamableHTTPClientTransport and SSEClientTransport use authProvider
- withOAuth middleware can wrap arbitrary fetches

## OAuth discovery

- Uses RFC 9728 protected resource metadata for authorization server discovery
- Uses RFC 8414 for authorization server metadata
- Supports dynamic client registration (RFC 7591)
- Uses PKCE for authorization code flows

## Example: client credentials

```ts
import { ClientCredentialsProvider, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const provider = new ClientCredentialsProvider({
  clientId: 'my-client',
  clientSecret: 'my-secret'
});

const transport = new StreamableHTTPClientTransport(new URL('https://example.com/mcp'), {
  authProvider: provider
});
```

## Edge cases

- If authProvider is missing and server requires auth, UnauthorizedError is thrown.
- Token refresh failures may trigger credential invalidation and retry.
- Some servers may only support legacy auth flows; use provider overrides if needed.

## Security notes

- Always validate resource indicators (RFC 8707).
- Never pass access tokens to downstream APIs (token passthrough is forbidden).
