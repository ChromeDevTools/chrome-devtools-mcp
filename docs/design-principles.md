# Design Principles

These are rough guidelines to follow when shipping features for the MCP server.
Apply them with nuance.

- **Agent-Agnostic API**: Use standards like MCP. Don't lock in to one LLM. Interoperability is key.
- **Token-Optimized**: Return semantic summaries. "LCP was 3.2s" is better than 50k lines of JSON. Files are the right location for large amounts of data.
- **Small, Deterministic Blocks**: Give agents composable tools (Click, Screenshot), not magic buttons.
- **Self-Healing Errors**: Return actionable errors that include context and potential fixes.
- **Human-Agent Collaboration**: Output must be readable by machines (structured) AND humans (summaries).
