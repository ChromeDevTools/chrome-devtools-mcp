# Tasks (Experimental)

## Overview

Tasks enable call-now, fetch-later workflows for long-running operations. The SDK exposes tasks through experimental namespaces and core protocol support. Tasks are optional and may change.

## Core task support

- ProtocolOptions.taskStore enables task handlers (tasks/get, tasks/list, tasks/result, tasks/cancel).
- TaskMessageQueue supports side-channel messages delivered via tasks/result.
- Task-related metadata is carried in _meta.io.modelcontextprotocol/related-task.

## Server APIs

- server.experimental.tasks
- registerToolTask for task-augmented tools
- taskStore implementation is required for persistence

## Client APIs

- client.experimental.tasks
- callToolStream or task-aware calls for tool execution
- getTask, getTaskResult, listTasks, cancelTask

## Task lifecycle

- working -> input_required -> completed | failed | cancelled
- pollInterval and ttl guide client polling behavior

## Example (conceptual)

```ts
// Server: enable task store
const server = new McpServer({ name: 'my-server', version: '1.0.0' }, {
  capabilities: { tasks: { list: {}, cancel: {}, requests: { tools: { call: {} } } } },
  taskStore: myTaskStore
});
```

## Edge cases

- If a tool declares taskSupport required, tools/call without task params returns error.
- tasks/result should not include related-task metadata.
- Tasks are experimental; interfaces may change.

## Security notes

- Enforce access control on tasks/get and tasks/result.
- Avoid leaking task data across sessions.
