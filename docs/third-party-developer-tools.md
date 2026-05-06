# Developer Guide: Building third-party developer tools

This documentation outlines how to expose custom runtime data and tools from your web application to Chrome DevTools for Agents.

## Overview

Third-party developer tools enable your web application to expose internal state, component hierarchies, or specific debug data that cannot be deduced through static analysis. This allows Chrome DevTools for Agents to provide richer, more actionable context to AI agents during debugging sessions.

## How It Works: Tool Discovery

Chrome DevTools for Agents uses an event-based mechanism to discover tools exposed by the page. The process follows these steps:

1.  **Event Dispatch:** Chrome DevTools for Agents dispatches a `devtoolstooldiscovery` event on the global `window` object.
2.  **Listener:** Your application listens for this event and provides the tool definitions.
3.  **Response:** Your application must call `event.respondWith()` to register a `ToolGroup` object.

_Note: Chrome DevTools for Agents requests this list automatically after page navigations (e.g., `new_page`, `navigate_page`) or when explicitly requested via the `list_3p_developer_tools()` MCP tool._

## Implementation

To expose tools, implement a listener for the `devtoolstooldiscovery` event and provide a `ToolGroup` containing your tool definitions.

### Type Definitions

Your tools must follow the `ToolDefinition` and `ToolGroup` interfaces:

```typescript
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JSONSchema7;
  execute: (args: Record<string, unknown>) => unknown;
}

export interface ToolGroup {
  name: string;
  description: string;
  tools: ToolDefinition[];
}
```

### Example Implementation

```typescript
window.addEventListener(
  'devtoolstooldiscovery',
  (event: DevtoolsToolDiscoveryEvent) => {
    event.respondWith({
      name: 'Page-specific DevTools',
      description: "Provide runtime info directly from the page's JavaScript",
      tools: [
        {
          name: 'add',
          description: 'Calculates the sum of two numbers.',
          inputSchema: {
            type: 'object',
            properties: {
              a: {type: 'number'},
              b: {type: 'number'},
            },
            required: ['a', 'b'],
          },
          execute: async (input: {a: number; b: number}) => {
            return input.a + input.b;
          },
        },
      ],
    });
  },
);
```

## Tool Invocation

Once discovered, MCP clients can execute your tools through Chrome DevTools for Agents using:

- **`execute_3p_developer_tool`**: The standard way to invoke a specific registered tool by name with validated parameters.
- **`evaluate_script`**: Allows for more complex interactions by running a custom script that calls `window.__dtmcp.executeTool()` directly, enabling you to compose functionality.

## Important Considerations

- **Experimental Status:** This feature is currently experimental. APIs may change, and there are no guarantees regarding stability.
- **Security & Scope:**
  - **Context:** Third-party developer tools execute only within the context of the page that defines them. They do not persist across origins.
  - **Capabilities:** These tools do not grant expanded privileges; they can only execute code that an attacker would already be able to run on that page.
- **DOM Elements:** If your tools require DOM elements as inputs or outputs, they are handled via special UIDs referenced in the accessibility tree.
- **Flags:** The implementation is gated behind the `--categoryExperimentalThirdParty=true` command-line flag.
