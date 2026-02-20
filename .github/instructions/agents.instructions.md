---
description: 'Guidelines for creating custom agent files for GitHub Copilot'
applyTo: '**/*.agent.md'
---

# Custom Agent File Guidelines

Instructions for creating effective and maintainable custom agent files that provide specialized expertise for specific development tasks in GitHub Copilot.

## Project Context

- Target audience: Developers creating custom agents for GitHub Copilot
- File format: Markdown with YAML frontmatter
- File naming convention: lowercase with hyphens (e.g., `test-specialist.agent.md`)
- Location: `.github/agents/` directory (repository-level) or `agents/` directory (organization/enterprise-level)
- Purpose: Define specialized agents with tailored expertise, tools, and instructions for specific tasks
- Official documentation: https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/create-custom-agents

## Required Frontmatter

Every agent file must include YAML frontmatter with the following fields:

```yaml
---
description: 'Brief description of the agent purpose and capabilities'
name: 'Agent Display Name'
tools: ['read', 'edit', 'search']
model: 'Claude Sonnet 4.5'
target: 'vscode'
infer: true
---
```

### Core Frontmatter Properties

#### **description** (REQUIRED)
- Single-quoted string, clearly stating the agent's purpose and domain expertise
- Should be concise (50-150 characters) and actionable
- Example: `'Focuses on test coverage, quality, and testing best practices'`

#### **name** (OPTIONAL)
- Display name for the agent in the UI
- If omitted, defaults to filename (without `.md` or `.agent.md`)
- Use title case and be descriptive
- Example: `'Testing Specialist'`

#### **tools** (OPTIONAL)
- List of tool names or aliases the agent can use
- Supports comma-separated string or YAML array format
- If omitted, agent has access to all available tools
- See "Tool Configuration" section below for details

#### **model** (STRONGLY RECOMMENDED)
- Specifies which AI model the agent should use
- Supported in VS Code, JetBrains IDEs, Eclipse, and Xcode
- Example: `'Claude Sonnet 4.5'`, `'gpt-4'`, `'gpt-4o'`
- Choose based on agent complexity and required capabilities

#### **target** (OPTIONAL)
- Specifies target environment: `'vscode'` or `'github-copilot'`
- If omitted, agent is available in both environments
- Use when agent has environment-specific features

#### **infer** (OPTIONAL)
- Boolean controlling whether Copilot can automatically use this agent based on context
- Default: `true` if omitted
- Set to `false` to require manual agent selection

#### **metadata** (OPTIONAL, GitHub.com only)
- Object with name-value pairs for agent annotation
- Example: `metadata: { category: 'testing', version: '1.0' }`
- Not supported in VS Code

#### **mcp-servers** (OPTIONAL, Organization/Enterprise only)
- Configure MCP servers available only to this agent
- Only supported for organization/enterprise level agents
- See "MCP Server Configuration" section below

#### **handoffs** (OPTIONAL, VS Code only)
- Enable guided sequential workflows that transition between agents with suggested next steps
- List of handoff configurations, each specifying a target agent and optional prompt
- After a chat response completes, handoff buttons appear allowing users to move to the next agent
- Only supported in VS Code (version 1.106+)
- See "Handoffs Configuration" section below for details

## Handoffs Configuration

Handoffs enable you to create guided sequential workflows that transition seamlessly between custom agents. This is useful for orchestrating multi-step development workflows where users can review and approve each step before moving to the next one.

### Common Handoff Patterns

- **Planning → Implementation**: Generate a plan in a planning agent, then hand off to an implementation agent to start coding
- **Implementation → Review**: Complete implementation, then switch to a code review agent to check for quality and security issues
- **Write Failing Tests → Write Passing Tests**: Generate failing tests, then hand off to implement the code that makes those tests pass
- **Research → Documentation**: Research a topic, then transition to a documentation agent to write guides

### Handoff Frontmatter Structure

Define handoffs in the agent file's YAML frontmatter using the `handoffs` field:

```yaml
---
description: 'Brief description of the agent'
name: 'Agent Name'
tools: ['search', 'read']
handoffs:
  - label: Start Implementation
    agent: implementation
    prompt: 'Now implement the plan outlined above.'
    send: false
  - label: Code Review
    agent: code-review
    prompt: 'Please review the implementation for quality and security issues.'
    send: false
---
```

### Handoff Properties

Each handoff in the list must include the following properties:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `label` | string | Yes | The display text shown on the handoff button in the chat interface |
| `agent` | string | Yes | The target agent identifier to switch to (name or filename without `.agent.md`) |
| `prompt` | string | No | The prompt text to pre-fill in the target agent's chat input |
| `send` | boolean | No | If `true`, automatically submits the prompt to the target agent (default: `false`) |

### Handoff Behavior

- **Button Display**: Handoff buttons appear as interactive suggestions after a chat response completes
- **Context Preservation**: When users select a handoff button, they switch to the target agent with conversation context maintained
- **Pre-filled Prompt**: If a `prompt` is specified, it appears pre-filled in the target agent's chat input
- **Manual vs Auto**: When `send: false`, users must review and manually send the pre-filled prompt; when `send: true`, the prompt is automatically submitted

### Handoff Configuration Guidelines

#### When to Use Handoffs

- **Multi-step workflows**: Breaking down complex tasks across specialized agents
- **Quality gates**: Ensuring review steps between implementation phases
- **Guided processes**: Directing users through a structured development process
- **Skill transitions**: Moving from planning/design to implementation/testing specialists

#### Best Practices

- **Clear Labels**: Use action-oriented labels that clearly indicate the next step
  - ✅ Good: "Start Implementation", "Review for Security", "Write Tests"
  - ❌ Avoid: "Next", "Go to agent", "Do something"

- **Relevant Prompts**: Provide context-aware prompts that reference the completed work
  - ✅ Good: `'Now implement the plan outlined above.'`
  - ❌ Avoid: Generic prompts without context

- **Selective Use**: Don't create handoffs to every possible agent; focus on logical workflow transitions
  - Limit to 2-3 most relevant next steps per agent
  - Only add handoffs for agents that naturally follow in the workflow

- **Agent Dependencies**: Ensure target agents exist before creating handoffs
  - Handoffs to non-existent agents will be silently ignored
  - Test handoffs to verify they work as expected

- **Prompt Content**: Keep prompts concise and actionable
  - Refer to work from the current agent without duplicating content
  - Provide any necessary context the target agent might need

### Example: Complete Workflow

Here's an example of three agents with handoffs creating a complete workflow:

**Planning Agent** (`planner.agent.md`):
```yaml
---
description: 'Generate an implementation plan for new features or refactoring'
name: 'Planner'
tools: ['search', 'read']
handoffs:
  - label: Implement Plan
    agent: implementer
    prompt: 'Implement the plan outlined above.'
    send: false
---
# Planner Agent
You are a planning specialist. Your task is to:
1. Analyze the requirements
2. Break down the work into logical steps
3. Generate a detailed implementation plan
4. Identify testing requirements

Do not write any code - focus only on planning.
```

**Implementation Agent** (`implementer.agent.md`):
```yaml
---
description: 'Implement code based on a plan or specification'
name: 'Implementer'
tools: ['read', 'edit', 'search', 'execute']
handoffs:
  - label: Review Implementation
    agent: reviewer
    prompt: 'Please review this implementation for code quality, security, and adherence to best practices.'
    send: false
---
# Implementer Agent
You are an implementation specialist. Your task is to:
1. Follow the provided plan or specification
2. Write clean, maintainable code
3. Include appropriate comments and documentation
4. Follow project coding standards

Implement the solution completely and thoroughly.
```

**Review Agent** (`reviewer.agent.md`):
```yaml
---
description: 'Review code for quality, security, and best practices'
name: 'Reviewer'
tools: ['read', 'search']
handoffs:
  - label: Back to Planning
    agent: planner
    prompt: 'Review the feedback above and determine if a new plan is needed.'
    send: false
---
# Code Review Agent
You are a code review specialist. Your task is to:
1. Check code quality and maintainability
2. Identify security issues and vulnerabilities
3. Verify adherence to project standards
4. Suggest improvements

Provide constructive feedback on the implementation.
```

This workflow allows a developer to:
1. Start with the Planner agent to create a detailed plan
2. Hand off to the Implementer agent to write code based on the plan
3. Hand off to the Reviewer agent to check the implementation
4. Optionally hand off back to planning if significant issues are found

### Version Compatibility

- **VS Code**: Handoffs are supported in VS Code 1.106 and later
- **GitHub.com**: Not currently supported; agent transition workflows use different mechanisms
- **Other IDEs**: Limited or no support; focus on VS Code implementations for maximum compatibility

## Tool Configuration

### Tool Specification Strategies

**Enable all tools** (default):
```yaml
# Omit tools property entirely, or use:
tools: ['*']
```

**Enable specific tools**:
```yaml
tools: ['read', 'edit', 'search', 'execute']
```

**Enable MCP server tools**:
```yaml
tools: ['read', 'edit', 'github/*', 'playwright/navigate']
```

**Disable all tools**:
```yaml
tools: []
```

### Standard Tool Aliases

All aliases are case-insensitive:

| Alias | Alternative Names | Category | Description |
|-------|------------------|----------|-------------|
| `execute` | shell, Bash, powershell | Shell execution | Execute commands in appropriate shell |
| `read` | Read, NotebookRead, view | File reading | Read file contents |
| `edit` | Edit, MultiEdit, Write, NotebookEdit | File editing | Edit and modify files |
| `search` | Grep, Glob, search | Code search | Search for files or text in files |
| `agent` | custom-agent, Task | Agent invocation | Invoke other custom agents |
| `web` | WebSearch, WebFetch | Web access | Fetch web content and search |
| `todo` | TodoWrite | Task management | Create and manage task lists (VS Code only) |

### Built-in MCP Server Tools

**GitHub MCP Server**:
```yaml
tools: ['github/*']  # All GitHub tools
tools: ['github/get_file_contents', 'github/search_repositories']  # Specific tools
```
- All read-only tools available by default
- Token scoped to source repository

**Playwright MCP Server**:
```yaml
tools: ['playwright/*']  # All Playwright tools
tools: ['playwright/navigate', 'playwright/screenshot']  # Specific tools
```
- Configured to access localhost only
- Useful for browser automation and testing

### Tool Selection Best Practices

- **Principle of Least Privilege**: Only enable tools necessary for the agent's purpose
- **Security**: Limit `execute` access unless explicitly required
- **Focus**: Fewer tools = clearer agent purpose and better performance
- **Documentation**: Comment why specific tools are required for complex configurations

## Sub-Agent Invocation (Agent Orchestration)

Agents can invoke other agents using the **agent invocation tool** (the `agent` tool) to orchestrate multi-step workflows.

The recommended approach is **prompt-based orchestration**:
- The orchestrator defines a step-by-step workflow in natural language.
- Each step is delegated to a specialized agent.
- The orchestrator passes only the essential context (e.g., base path, identifiers) and requires each sub-agent to read its own `.agent.md` spec for tools/constraints.

### How It Works

1) Enable agent invocation by including `agent` in the orchestrator's tools list:

```yaml
tools: ['read', 'edit', 'search', 'agent']
```

2) For each step, invoke a sub-agent by providing:
- **Agent name** (the identifier users select/invoke)
- **Agent spec path** (the `.agent.md` file to read and follow)
- **Minimal shared context** (e.g., `basePath`, `projectName`, `logFile`)

### Prompt Pattern (Recommended)

Use a consistent “wrapper prompt” for every step so sub-agents behave predictably:

```text
This phase must be performed as the agent "<AGENT_NAME>" defined in "<AGENT_SPEC_PATH>".

IMPORTANT:
- Read and apply the entire .agent.md spec (tools, constraints, quality standards).
- Work on "<WORK_UNIT_NAME>" with base path: "<BASE_PATH>".
- Perform the necessary reads/writes under this base path.
- Return a clear summary (actions taken + files produced/modified + issues).
```

Optional: if you need a lightweight, structured wrapper for traceability, embed a small JSON block in the prompt (still human-readable and tool-agnostic):

```text
{
  "step": "<STEP_ID>",
  "agent": "<AGENT_NAME>",
  "spec": "<AGENT_SPEC_PATH>",
  "basePath": "<BASE_PATH>"
}
```

### Orchestrator Structure (Keep It Generic)

For maintainable orchestrators, document these structural elements:

- **Dynamic parameters**: what values are extracted from the user (e.g., `projectName`, `fileName`, `basePath`).
- **Sub-agent registry**: a list/table mapping each step to `agentName` + `agentSpecPath`.
- **Step ordering**: explicit sequence (Step 1 → Step N).
- **Trigger conditions** (optional but recommended): define when a step runs vs is skipped.
- **Logging strategy** (optional but recommended): a single log/report file updated after each step.

Avoid embedding orchestration “code” (JavaScript, Python, etc.) inside the orchestrator prompt; prefer deterministic, tool-driven coordination.

### Basic Pattern

Structure each step invocation with:

1. **Step description**: Clear one-line purpose (used for logs and traceability)
2. **Agent identity**: `agentName` + `agentSpecPath`
3. **Context**: A small, explicit set of variables (paths, IDs, environment name)
4. **Expected outputs**: Files to create/update and where they should be written
5. **Return summary**: Ask the sub-agent to return a short, structured summary

### Example: Multi-Step Processing

```text
Step 1: Transform raw input data
Agent: data-processor
Spec: .github/agents/data-processor.agent.md
Context: projectName=${projectName}, basePath=${basePath}
Input: ${basePath}/raw/
Output: ${basePath}/processed/
Expected: write ${basePath}/processed/summary.md

Step 2: Analyze processed data (depends on Step 1 output)
Agent: data-analyst
Spec: .github/agents/data-analyst.agent.md
Context: projectName=${projectName}, basePath=${basePath}
Input: ${basePath}/processed/
Output: ${basePath}/analysis/
Expected: write ${basePath}/analysis/report.md
```

### Key Points

- **Pass variables in prompts**: Use `${variableName}` for all dynamic values
- **Keep prompts focused**: Clear, specific tasks for each sub-agent
- **Return summaries**: Each sub-agent should report what it accomplished
- **Sequential execution**: Run steps in order when dependencies exist between outputs/inputs
- **Error handling**: Check results before proceeding to dependent steps

### ⚠️ Tool Availability Requirement

**Critical**: If a sub-agent requires specific tools (e.g., `edit`, `execute`, `search`), the orchestrator must include those tools in its own `tools` list. Sub-agents cannot access tools that aren't available to their parent orchestrator.

**Example**:
```yaml
# If your sub-agents need to edit files, execute commands, or search code
tools: ['read', 'edit', 'search', 'execute', 'agent']
```

The orchestrator's tool permissions act as a ceiling for all invoked sub-agents. Plan your tool list carefully to ensure all sub-agents have the tools they need.

### ⚠️ Important Limitation

**Sub-agent orchestration is NOT suitable for large-scale data processing.** Avoid using multi-step sub-agent pipelines when:
- Processing hundreds or thousands of files
- Handling large datasets
- Performing bulk transformations on big codebases
- Orchestrating more than 5-10 sequential steps

Each sub-agent invocation adds latency and context overhead. For high-volume processing, implement logic directly in a single agent instead. Use orchestration only for coordinating specialized tasks on focused, manageable datasets.

## Agent Prompt Structure

The markdown content below the frontmatter defines the agent's behavior, expertise, and instructions. Well-structured prompts typically include:

1. **Agent Identity and Role**: Who the agent is and its primary role
2. **Core Responsibilities**: What specific tasks the agent performs
3. **Approach and Methodology**: How the agent works to accomplish tasks
4. **Guidelines and Constraints**: What to do/avoid and quality standards
5. **Output Expectations**: Expected output format and quality

### Prompt Writing Best Practices

- **Be Specific and Direct**: Use imperative mood ("Analyze", "Generate"); avoid vague terms
- **Define Boundaries**: Clearly state scope limits and constraints
- **Include Context**: Explain domain expertise and reference relevant frameworks
- **Focus on Behavior**: Describe how the agent should think and work
- **Use Structured Format**: Headers, bullets, and lists make prompts scannable

## Variable Definition and Extraction

Agents can define dynamic parameters to extract values from user input and use them throughout the agent's behavior and sub-agent communications. This enables flexible, context-aware agents that adapt to user-provided data.

### When to Use Variables

**Use variables when**:
- Agent behavior depends on user input
- Need to pass dynamic values to sub-agents
- Want to make agents reusable across different contexts
- Require parameterized workflows
- Need to track or reference user-provided context

**Examples**:
- Extract project name from user prompt
- Capture certification name for pipeline processing
- Identify file paths or directories
- Extract configuration options
- Parse feature names or module identifiers

### Variable Declaration Pattern

Define variables section early in the agent prompt to document expected parameters:

```markdown
# Agent Name

## Dynamic Parameters

- **Parameter Name**: Description and usage
- **Another Parameter**: How it's extracted and used

## Your Mission

Process [PARAMETER_NAME] to accomplish [task].
```

### Variable Extraction Methods

#### 1. **Explicit User Input**
Ask the user to provide the variable if not detected in the prompt:

```markdown
## Your Mission

Process the project by analyzing your codebase.

### Step 1: Identify Project
If no project name is provided, **ASK THE USER** for:
- Project name or identifier
- Base path or directory location
- Configuration type (if applicable)

Use this information to contextualize all subsequent tasks.
```

#### 2. **Implicit Extraction from Prompt**
Automatically extract variables from the user's natural language input:

```javascript
// Example: Extract certification name from user input
const userInput = "Process My Certification";

// Extract key information
const certificationName = extractCertificationName(userInput);
// Result: "My Certification"

const basePath = `certifications/${certificationName}`;
// Result: "certifications/My Certification"
```

#### 3. **Contextual Variable Resolution**
Use file context or workspace information to derive variables:

```markdown
## Variable Resolution Strategy

1. **From User Prompt**: First, look for explicit mentions in user input
2. **From File Context**: Check current file name or path
3. **From Workspace**: Use workspace folder or active project
4. **From Settings**: Reference configuration files
5. **Ask User**: If all else fails, request missing information
```

### Using Variables in Agent Prompts

#### Variable Substitution in Instructions

Use template variables in agent prompts to make them dynamic:

```markdown
# Agent Name

## Dynamic Parameters
- **Project Name**: ${projectName}
- **Base Path**: ${basePath}
- **Output Directory**: ${outputDir}

## Your Mission

Process the **${projectName}** project located at `${basePath}`.

## Process Steps

1. Read input from: `${basePath}/input/`
2. Process files according to project configuration
3. Write results to: `${outputDir}/`
4. Generate summary report

## Quality Standards

- Maintain project-specific coding standards for **${projectName}**
- Follow directory structure: `${basePath}/[structure]`
```

#### Passing Variables to Sub-Agents

When invoking a sub-agent, pass all context through substituted variables in the prompt. Prefer passing **paths and identifiers**, not entire file contents.

Example (prompt template):

```text
This phase must be performed as the agent "documentation-writer" defined in ".github/agents/documentation-writer.agent.md".

IMPORTANT:
- Read and apply the entire .agent.md spec.
- Project: "${projectName}"
- Base path: "projects/${projectName}"
- Input: "projects/${projectName}/src/"
- Output: "projects/${projectName}/docs/"

Task:
1. Read source files under the input path.
2. Generate documentation.
3. Write outputs under the output path.
4. Return a concise summary (files created/updated, key decisions, issues).
```

The sub-agent receives all necessary context embedded in the prompt. Variables are resolved before sending the prompt, so the sub-agent works with concrete paths and values, not variable placeholders.

### Real-World Example: Code Review Orchestrator

Example of a simple orchestrator that validates code through multiple specialized agents:

1) Determine shared context:
- `repositoryName`, `prNumber`
- `basePath` (e.g., `projects/${repositoryName}/pr-${prNumber}`)

2) Invoke specialized agents sequentially (each agent reads its own `.agent.md` spec):

```text
Step 1: Security Review
Agent: security-reviewer
Spec: .github/agents/security-reviewer.agent.md
Context: repositoryName=${repositoryName}, prNumber=${prNumber}, basePath=projects/${repositoryName}/pr-${prNumber}
Output: projects/${repositoryName}/pr-${prNumber}/security-review.md

Step 2: Test Coverage
Agent: test-coverage
Spec: .github/agents/test-coverage.agent.md
Context: repositoryName=${repositoryName}, prNumber=${prNumber}, basePath=projects/${repositoryName}/pr-${prNumber}
Output: projects/${repositoryName}/pr-${prNumber}/coverage-report.md

Step 3: Aggregate
Agent: review-aggregator
Spec: .github/agents/review-aggregator.agent.md
Context: repositoryName=${repositoryName}, prNumber=${prNumber}, basePath=projects/${repositoryName}/pr-${prNumber}
Output: projects/${repositoryName}/pr-${prNumber}/final-review.md
```

#### Example: Conditional Step Orchestration (Code Review)

This example shows a more complete orchestration with **pre-flight checks**, **conditional steps**, and **required vs optional** behavior.

**Dynamic parameters (inputs):**
- `repositoryName`, `prNumber`
- `basePath` (e.g., `projects/${repositoryName}/pr-${prNumber}`)
- `logFile` (e.g., `${basePath}/.review-log.md`)

**Pre-flight checks (recommended):**
- Verify expected folders/files exist (e.g., `${basePath}/changes/`, `${basePath}/reports/`).
- Detect high-level characteristics that influence step triggers (e.g., repo language, presence of `package.json`, `pom.xml`, `requirements.txt`, test folders).
- Log the findings once at the start.

**Step trigger conditions:**

| Step | Status | Trigger Condition | On Failure |
|------|--------|-------------------|-----------|
| 1: Security Review | **Required** | Always run | Stop pipeline |
| 2: Dependency Audit | Optional | If a dependency manifest exists (`package.json`, `pom.xml`, etc.) | Continue |
| 3: Test Coverage Check | Optional | If test projects/files are present | Continue |
| 4: Performance Checks | Optional | If perf-sensitive code changed OR a perf config exists | Continue |
| 5: Aggregate & Verdict | **Required** | Always run if Step 1 completed | Stop pipeline |

**Execution flow (natural language):**
1. Initialize `basePath` and create/update `logFile`.
2. Run pre-flight checks and record them.
3. Execute Step 1 → N sequentially.
4. For each step:
  - If trigger condition is false: mark as **SKIPPED** and continue.
  - Otherwise: invoke the sub-agent using the wrapper prompt and capture its summary.
  - Mark as **SUCCESS** or **FAILED**.
  - If the step is **Required** and failed: stop the pipeline and write a failure summary.
5. End with a final summary section (overall status, artifacts, next actions).

**Sub-agent invocation prompt (example):**

```text
This phase must be performed as the agent "security-reviewer" defined in ".github/agents/security-reviewer.agent.md".

IMPORTANT:
- Read and apply the entire .agent.md spec.
- Work on repository "${repositoryName}" PR "${prNumber}".
- Base path: "${basePath}".

Task:
1. Review the changes under "${basePath}/changes/".
2. Write findings to "${basePath}/reports/security-review.md".
3. Return a short summary with: critical findings, recommended fixes, files created/modified.
```

**Logging format (example):**

```markdown
## Step 2: Dependency Audit
**Status:** ✅ SUCCESS / ⚠️ SKIPPED / ❌ FAILED
**Trigger:** package.json present
**Started:** 2026-01-16T10:30:15Z
**Completed:** 2026-01-16T10:31:05Z
**Duration:** 00:00:50
**Artifacts:** reports/dependency-audit.md
**Summary:** [brief agent summary]
```

This pattern applies to any orchestration scenario: extract variables, call sub-agents with clear context, await results.


### Variable Best Practices

#### 1. **Clear Documentation**
Always document what variables are expected:

```markdown
## Required Variables
- **projectName**: The name of the project (string, required)
- **basePath**: Root directory for project files (path, required)

## Optional Variables
- **mode**: Processing mode - quick/standard/detailed (enum, default: standard)
- **outputFormat**: Output format - markdown/json/html (enum, default: markdown)

## Derived Variables
- **outputDir**: Automatically set to ${basePath}/output
- **logFile**: Automatically set to ${basePath}/.log.md
```

#### 2. **Consistent Naming**
Use consistent variable naming conventions:

```javascript
// Good: Clear, descriptive naming
const variables = {
  projectName,          // What project to work on
  basePath,            // Where project files are located
  outputDirectory,     // Where to save results
  processingMode,      // How to process (detail level)
  configurationPath    // Where config files are
};

// Avoid: Ambiguous or inconsistent
const bad_variables = {
  name,     // Too generic
  path,     // Unclear which path
  mode,     // Too short
  config    // Too vague
};
```

#### 3. **Validation and Constraints**
Document valid values and constraints:

```markdown
## Variable Constraints

**projectName**:
- Type: string (alphanumeric, hyphens, underscores allowed)
- Length: 1-100 characters
- Required: yes
- Pattern: `/^[a-zA-Z0-9_-]+$/`

**processingMode**:
- Type: enum
- Valid values: "quick" (< 5min), "standard" (5-15min), "detailed" (15+ min)
- Default: "standard"
- Required: no
```

## MCP Server Configuration (Organization/Enterprise Only)

MCP servers extend agent capabilities with additional tools. Only supported for organization and enterprise-level agents.

### Configuration Format

```yaml
---
name: my-custom-agent
description: 'Agent with MCP integration'
tools: ['read', 'edit', 'custom-mcp/tool-1']
mcp-servers:
  custom-mcp:
    type: 'local'
    command: 'some-command'
    args: ['--arg1', '--arg2']
    tools: ["*"]
    env:
      ENV_VAR_NAME: ${{ secrets.API_KEY }}
---
```

### MCP Server Properties

- **type**: Server type (`'local'` or `'stdio'`)
- **command**: Command to start the MCP server
- **args**: Array of command arguments
- **tools**: Tools to enable from this server (`["*"]` for all)
- **env**: Environment variables (supports secrets)

### Environment Variables and Secrets

Secrets must be configured in repository settings under "copilot" environment.

**Supported syntax**:
```yaml
env:
  # Environment variable only
  VAR_NAME: COPILOT_MCP_ENV_VAR_VALUE

  # Variable with header
  VAR_NAME: $COPILOT_MCP_ENV_VAR_VALUE
  VAR_NAME: ${COPILOT_MCP_ENV_VAR_VALUE}

  # GitHub Actions-style (YAML only)
  VAR_NAME: ${{ secrets.COPILOT_MCP_ENV_VAR_VALUE }}
  VAR_NAME: ${{ var.COPILOT_MCP_ENV_VAR_VALUE }}
```

## File Organization and Naming

### Repository-Level Agents
- Location: `.github/agents/`
- Scope: Available only in the specific repository
- Access: Uses repository-configured MCP servers

### Organization/Enterprise-Level Agents
- Location: `.github-private/agents/` (then move to `agents/` root)
- Scope: Available across all repositories in org/enterprise
- Access: Can configure dedicated MCP servers

### Naming Conventions
- Use lowercase with hyphens: `test-specialist.agent.md`
- Name should reflect agent purpose
- Filename becomes default agent name (if `name` not specified)
- Allowed characters: `.`, `-`, `_`, `a-z`, `A-Z`, `0-9`

## Agent Processing and Behavior

### Versioning
- Based on Git commit SHAs for the agent file
- Create branches/tags for different agent versions
- Instantiated using latest version for repository/branch
- PR interactions use same agent version for consistency

### Name Conflicts
Priority (highest to lowest):
1. Repository-level agent
2. Organization-level agent
3. Enterprise-level agent

Lower-level configurations override higher-level ones with the same name.

### Tool Processing
- `tools` list filters available tools (built-in and MCP)
- No tools specified = all tools enabled
- Empty list (`[]`) = all tools disabled
- Specific list = only those tools enabled
- Unrecognized tool names are ignored (allows environment-specific tools)

### MCP Server Processing Order
1. Out-of-the-box MCP servers (e.g., GitHub MCP)
2. Custom agent MCP configuration (org/enterprise only)
3. Repository-level MCP configurations

Each level can override settings from previous levels.

## Agent Creation Checklist

### Frontmatter
- [ ] `description` field present and descriptive (50-150 chars)
- [ ] `description` wrapped in single quotes
- [ ] `name` specified (optional but recommended)
- [ ] `tools` configured appropriately (or intentionally omitted)
- [ ] `model` specified for optimal performance
- [ ] `target` set if environment-specific
- [ ] `infer` set to `false` if manual selection required

### Prompt Content
- [ ] Clear agent identity and role defined
- [ ] Core responsibilities listed explicitly
- [ ] Approach and methodology explained
- [ ] Guidelines and constraints specified
- [ ] Output expectations documented
- [ ] Examples provided where helpful
- [ ] Instructions are specific and actionable
- [ ] Scope and boundaries clearly defined
- [ ] Total content under 30,000 characters

### File Structure
- [ ] Filename follows lowercase-with-hyphens convention
- [ ] File placed in correct directory (`.github/agents/` or `agents/`)
- [ ] Filename uses only allowed characters
- [ ] File extension is `.agent.md`

### Quality Assurance
- [ ] Agent purpose is unique and not duplicative
- [ ] Tools are minimal and necessary
- [ ] Instructions are clear and unambiguous
- [ ] Agent has been tested with representative tasks
- [ ] Documentation references are current
- [ ] Security considerations addressed (if applicable)

## Common Agent Patterns

### Testing Specialist
**Purpose**: Focus on test coverage and quality
**Tools**: All tools (for comprehensive test creation)
**Approach**: Analyze, identify gaps, write tests, avoid production code changes

### Implementation Planner
**Purpose**: Create detailed technical plans and specifications
**Tools**: Limited to `['read', 'search', 'edit']`
**Approach**: Analyze requirements, create documentation, avoid implementation

### Code Reviewer
**Purpose**: Review code quality and provide feedback
**Tools**: `['read', 'search']` only
**Approach**: Analyze, suggest improvements, no direct modifications

### Refactoring Specialist
**Purpose**: Improve code structure and maintainability
**Tools**: `['read', 'search', 'edit']`
**Approach**: Analyze patterns, propose refactorings, implement safely

### Security Auditor
**Purpose**: Identify security issues and vulnerabilities
**Tools**: `['read', 'search', 'web']`
**Approach**: Scan code, check against OWASP, report findings

## Common Mistakes to Avoid

### Frontmatter Errors
- ❌ Missing `description` field
- ❌ Description not wrapped in quotes
- ❌ Invalid tool names without checking documentation
- ❌ Incorrect YAML syntax (indentation, quotes)

### Tool Configuration Issues
- ❌ Granting excessive tool access unnecessarily
- ❌ Missing required tools for agent's purpose
- ❌ Not using tool aliases consistently
- ❌ Forgetting MCP server namespace (`server-name/tool`)

### Prompt Content Problems
- ❌ Vague, ambiguous instructions
- ❌ Conflicting or contradictory guidelines
- ❌ Lack of clear scope definition
- ❌ Missing output expectations
- ❌ Overly verbose instructions (exceeding character limits)
- ❌ No examples or context for complex tasks

### Organizational Issues
- ❌ Filename doesn't reflect agent purpose
- ❌ Wrong directory (confusing repo vs org level)
- ❌ Using spaces or special characters in filename
- ❌ Duplicate agent names causing conflicts

## Testing and Validation

### Manual Testing
1. Create the agent file with proper frontmatter
2. Reload VS Code or refresh GitHub.com
3. Select the agent from the dropdown in Copilot Chat
4. Test with representative user queries
5. Verify tool access works as expected
6. Confirm output meets expectations

### Integration Testing
- Test agent with different file types in scope
- Verify MCP server connectivity (if configured)
- Check agent behavior with missing context
- Test error handling and edge cases
- Validate agent switching and handoffs

### Quality Checks
- Run through agent creation checklist
- Review against common mistakes list
- Compare with example agents in repository
- Get peer review for complex agents
- Document any special configuration needs

## Additional Resources

### Official Documentation
- [Creating Custom Agents](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/create-custom-agents)
- [Custom Agents Configuration](https://docs.github.com/en/copilot/reference/custom-agents-configuration)
- [Custom Agents in VS Code](https://code.visualstudio.com/docs/copilot/customization/custom-agents)
- [MCP Integration](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/extend-coding-agent-with-mcp)

### Community Resources
- [Awesome Copilot Agents Collection](https://github.com/github/awesome-copilot/tree/main/agents)
- [Customization Library Examples](https://docs.github.com/en/copilot/tutorials/customization-library/custom-agents)
- [Your First Custom Agent Tutorial](https://docs.github.com/en/copilot/tutorials/customization-library/custom-agents/your-first-custom-agent)

### Related Files
- [Prompt Files Guidelines](./prompt.instructions.md) - For creating prompt files
- [Instructions Guidelines](./instructions.instructions.md) - For creating instruction files

## Version Compatibility Notes

### GitHub.com (Coding Agent)
- ✅ Fully supports all standard frontmatter properties
- ✅ Repository and org/enterprise level agents
- ✅ MCP server configuration (org/enterprise)
- ❌ Does not support `model`, `argument-hint`, `handoffs` properties

### VS Code / JetBrains / Eclipse / Xcode
- ✅ Supports `model` property for AI model selection
- ✅ Supports `argument-hint` and `handoffs` properties
- ✅ User profile and workspace-level agents
- ❌ Cannot configure MCP servers at repository level
- ⚠️ Some properties may behave differently

When creating agents for multiple environments, focus on common properties and test in all target environments. Use `target` property to create environment-specific agents when necessary.
