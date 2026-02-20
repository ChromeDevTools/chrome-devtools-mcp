# Logging

## Overview

Logging is a server capability that allows structured log messages to be sent to clients. Clients can set log level via logging/setLevel.

## SDK API

Server side:

- Server capability: logging
- logging/setLevel request handled by Server
- mcpReq.log(level, data, logger?) helper on ServerContext

Client side:

- Client can call logging/setLevel
- Receives notifications/message with log entries

## Example

```ts
// Server-side, inside a handler
await ctx.mcpReq.log('info', { message: 'Tool executed' }, 'my-server');
```

## Log levels

LoggingLevel is validated against schema; server stores per-session log level.

## Edge cases

- If logging capability is not advertised, logging methods should not be used.
- Server filters messages below the current session log level.

## Security notes

- Avoid logging secrets.
- Consider rate-limiting verbose logs for public servers.
