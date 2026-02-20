# Resources

## Overview

Resources are server-exposed data objects for context, not side effects. Clients discover via resources/list and retrieve via resources/read. Templates allow dynamic resources based on URI variables.

## SDK API

- McpServer.registerResource(name, uri, metadata, readCallback)
- McpServer.registerResourceTemplate(name, template, metadata, readCallback)
- Client.listResources(), Client.readResource(uri)
- Client.listResourceTemplates() (if supported)

## UriTemplate support

- Resource templates use UriTemplate (RFC 6570 style) and can match URIs.
- Templates can provide completion via completion/complete.

## Example

```ts
server.registerResource(
  'config',
  'config://app',
  { title: 'App Config', mimeType: 'text/plain' },
  async uri => ({ contents: [{ uri: uri.href, text: 'config data' }] })
);
```

## Subscriptions and notifications

- resources/subscribe is optional; servers advertise resources.subscribe.
- listChanged notifies clients to refresh list.

## Edge cases

- resources/read checks fixed resources first, then templates.
- Disabled resources are not listed and will error on read.

## Security notes

- Validate URIs and access control.
- Avoid exposing sensitive data without authorization.
