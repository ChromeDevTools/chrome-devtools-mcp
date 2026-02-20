---
description: 'Automatically update README.md and documentation files when application code changes require documentation updates'
applyTo: '**/*.{md,js,mjs,cjs,ts,tsx,jsx,py,java,cs,go,rb,php,rs,cpp,c,h,hpp}'
---

# Update Documentation on Code Change

## Overview

Ensure documentation stays synchronized with code changes by automatically detecting when README.md,
API documentation, configuration guides, and other documentation files need updates based on code
modifications.

## Instruction Sections and Configuration

The following parts of this section, `Instruction Sections and Configurable Instruction Sections`
and `Instruction Configuration` are only relevant to THIS instruction file, and are meant to be a
method to easily modify how the Copilot instructions are implemented. Essentially the two parts
are meant to turn portions or sections of the actual Copilot instructions on or off, and allow for
custom cases and conditions for when and how to implement certain sections of this document.

### Instruction Sections and Configurable Instruction Sections

There are several instruction sections in this document. The start of an instruction section is
indicated by a level two header. Call this an **INSTRUCTION SECTION**.  Some instruction
sections are configurable. Some are not configurable and will always be used.

Instruction sections that ARE configurable are not required, and are subject to additional context
and/or conditions. Call these **CONFIGURABLE INSTRUCTION SECTIONS**.

**Configurable instruction sections** will have the section's configuration property appended to
the level two header, wrapped in backticks (e.g., `apply-this`). Call this the
**CONFIGURABLE PROPERTY**.

The **configurable property** will be declared and defined in the **Instruction Configuration**
portion of this section. They are booleans. If `true`, then apply, utilize, and/or follow the
instructions in that section.

Each **configurable instruction section** will also have a sentence that follows the section's
level two header with the section's configuration details. Call this the **CONFIGURATION DETAIL**.

The **configuration detail** is a subset of rules that expand upon the configurable instruction
section. This allows for custom cases and/or conditions to be checked that will determine the final
implementation for that **configurable instruction section**.

Before resolving on how to apply a **configurable instruction section**, check the
**configurable property** for a nested and/or corresponding `apply-condition`, and utilize the `apply-condition` when settling on the final approach for the **configurable instruction section**. By
default the `apply-condition` for each **configurable property** is unset, but an example of a set
`apply-condition` could be something like:

    - **apply-condition** :
      ` this.parent.property = (git.branch == "master") ? this.parent.property = true : this.parent.property = false; `

The sum of all the **constant instructions sections**, and **configurable instruction sections**
will determine the complete instructions to follow. Call this the **COMPILED INSTRUCTIONS**.

The **compiled instructions** are dependent on the configuration. Each instruction section
included in the **compiled instructions** will be interpreted and utilized AS IF a separate set
of instructions that are independent of the entirety of this instruction file. Call this the
**FINAL PROCEDURE**.

### Instruction Configuration

- **apply-doc-file-structure** : true
  - **apply-condition** : unset
- **apply-doc-verification** : true
  - **apply-condition** : unset
- **apply-doc-quality-standard** : true
  - **apply-condition** : unset
- **apply-automation-tooling** : true
  - **apply-condition** : unset
- **apply-doc-patterns** : true
  - **apply-condition** : unset
- **apply-best-practices** : true
  - **apply-condition** : unset
- **apply-validation-commands** : true
  - **apply-condition** : unset
- **apply-maintenance-schedule** : true
  - **apply-condition** : unset
- **apply-git-integration** : false
  - **apply-condition** : unset

<!--
| Configuration Property         | Default | Description                                                                 | When to Enable/Disable                                      |
|-------------------------------|---------|-----------------------------------------------------------------------------|-------------------------------------------------------------|
| apply-doc-file-structure      | true    | Ensures documentation follows a consistent file structure.                  | Disable if you want to allow free-form doc organization.    |
| apply-doc-verification        | true    | Verifies that documentation matches code changes.                           | Disable if verification is handled elsewhere.               |
| apply-doc-quality-standard    | true    | Enforces documentation quality standards.                                   | Disable if quality standards are not required.              |
| apply-automation-tooling      | true    | Uses automation tools to update documentation.                              | Disable if you prefer manual documentation updates.         |
| apply-doc-patterns            | true    | Applies common documentation patterns and templates.                        | Disable for custom or unconventional documentation styles.  |
| apply-best-practices          | true    | Enforces best practices in documentation.                                   | Disable if best practices are not a priority.               |
| apply-validation-commands     | true    | Runs validation commands to check documentation correctness.                 | Disable if validation is not needed.                        |
| apply-maintenance-schedule    | true    | Schedules regular documentation maintenance.                                | Disable if maintenance is managed differently.              |
| apply-git-integration         | false   | Integrates documentation updates with Git workflows.                        | Enable if you want automatic Git integration.               |
-->
## When to Update Documentation

### Trigger Conditions

Automatically check if documentation updates are needed when:

- New features or functionality are added
- API endpoints, methods, or interfaces change
- Breaking changes are introduced
- Dependencies or requirements change
- Configuration options or environment variables are modified
- Installation or setup procedures change
- Command-line interfaces or scripts are updated
- Code examples in documentation become outdated

## Documentation Update Rules

### README.md Updates

**Always update README.md when:**

- Adding new features or capabilities
  - Add feature description to "Features" section
  - Include usage examples if applicable
  - Update table of contents if present

- Modifying installation or setup process
  - Update "Installation" or "Getting Started" section
  - Revise dependency requirements
  - Update prerequisite lists

- Adding new CLI commands or options
  - Document command syntax and examples
  - Include option descriptions and default values
  - Add usage examples

- Changing configuration options
  - Update configuration examples
  - Document new environment variables
  - Update config file templates

### API Documentation Updates

**Sync API documentation when:**

- New endpoints are added
  - Document HTTP method, path, parameters
  - Include request/response examples
  - Update OpenAPI/Swagger specs

- Endpoint signatures change
  - Update parameter lists
  - Revise response schemas
  - Document breaking changes

- Authentication or authorization changes
  - Update authentication examples
  - Revise security requirements
  - Update API key/token documentation

### Code Example Synchronization

**Verify and update code examples when:**

- Function signatures change
  - Update all code snippets using the function
  - Verify examples still compile/run
  - Update import statements if needed

- API interfaces change
  - Update example requests and responses
  - Revise client code examples
  - Update SDK usage examples

- Best practices evolve
  - Replace outdated patterns in examples
  - Update to use current recommended approaches
  - Add deprecation notices for old patterns

### Configuration Documentation

**Update configuration docs when:**

- New environment variables are added
  - Add to .env.example file
  - Document in README.md or docs/configuration.md
  - Include default values and descriptions

- Config file structure changes
  - Update example config files
  - Document new options
  - Mark deprecated options

- Deployment configuration changes
  - Update Docker/Kubernetes configs
  - Revise deployment guides
  - Update infrastructure-as-code examples

### Migration and Breaking Changes

**Create migration guides when:**

- Breaking API changes occur
  - Document what changed
  - Provide before/after examples
  - Include step-by-step migration instructions

- Major version updates
  - List all breaking changes
  - Provide upgrade checklist
  - Include common migration issues and solutions

- Deprecating features
  - Mark deprecated features clearly
  - Suggest alternative approaches
  - Include timeline for removal

## Documentation File Structure `apply-doc-file-structure`

If `apply-doc-file-structure == true`, then apply the following configurable instruction section.

### Standard Documentation Files

Maintain these documentation files and update as needed:

- **README.md**: Project overview, quick start, basic usage
- **CHANGELOG.md**: Version history and user-facing changes
- **docs/**: Detailed documentation
  - `installation.md`: Setup and installation guide
  - `configuration.md`: Configuration options and examples
  - `api.md`: API reference documentation
  - `contributing.md`: Contribution guidelines
  - `migration-guides/`: Version migration guides
- **examples/**: Working code examples and tutorials

### Changelog Management

**Add changelog entries for:**

- New features (under "Added" section)
- Bug fixes (under "Fixed" section)
- Breaking changes (under "Changed" section with **BREAKING** prefix)
- Deprecated features (under "Deprecated" section)
- Removed features (under "Removed" section)
- Security fixes (under "Security" section)

**Changelog format:**

    ```markdown
    ## [Version] - YYYY-MM-DD

    ### Added
    - New feature description with reference to PR/issue

    ### Changed
    - **BREAKING**: Description of breaking change
    - Other changes

    ### Fixed
    - Bug fix description
    ```

## Documentation Verification `apply-doc-verification`

If `apply-doc-verification == true`, then apply the following configurable instruction section.

### Before Applying Changes

**Check documentation completeness:**

1. All new public APIs are documented
2. Code examples compile and run
3. Links in documentation are valid
4. Configuration examples are accurate
5. Installation steps are current
6. README.md reflects current state

### Documentation Tests

**Include documentation validation:**

#### Example Tasks

- Verify code examples in docs compile/run
- Check for broken internal/external links
- Validate configuration examples against schemas
- Ensure API examples match current implementation

    ```bash
    # Example validation commands
    npm run docs:check         # Verify docs build
    npm run docs:test-examples # Test code examples
    npm run docs:lint         # Check for issues
    ```

## Documentation Quality Standards `apply-doc-quality-standard`

If `apply-doc-quality-standard == true`, then apply the following configurable instruction section.

### Writing Guidelines

- Use clear, concise language
- Include working code examples
- Provide both basic and advanced examples
- Use consistent terminology
- Include error handling examples
- Document edge cases and limitations

### Code Example Format

    ```markdown
    ### Example: [Clear description of what example demonstrates]

    \`\`\`language
    // Include necessary imports/setup
    import { function } from 'package';

    // Complete, runnable example
    const result = function(parameter);
    console.log(result);
    \`\`\`

    **Output:**
    \`\`\`
    expected output
    \`\`\`
    ```

### API Documentation Format

    ```markdown
    ### `functionName(param1, param2)`

    Brief description of what the function does.

    **Parameters:**
    - `param1` (type): Description of parameter
    - `param2` (type, optional): Description with default value

    **Returns:**
    - `type`: Description of return value

    **Example:**
    \`\`\`language
    const result = functionName('value', 42);
    \`\`\`

    **Throws:**
    - `ErrorType`: When and why error is thrown
    ```

## Automation and Tooling `apply-automation-tooling`

If `apply-automation-tooling == true`, then apply the following configurable instruction section.

### Documentation Generation

**Use automated tools when available:**

#### Automated Tool Examples

- JSDoc/TSDoc for JavaScript/TypeScript
- Sphinx/pdoc for Python
- Javadoc for Java
- xmldoc for C#
- godoc for Go
- rustdoc for Rust

### Documentation Linting

**Validate documentation with:**

- Markdown linters (markdownlint)
- Link checkers (markdown-link-check)
- Spell checkers (cspell)
- Code example validators

### Pre-update Hooks

**Add pre-commit checks for:**

- Documentation build succeeds
- No broken links
- Code examples are valid
- Changelog entry exists for changes

## Common Documentation Patterns `apply-doc-patterns`

If `apply-doc-patterns == true`, then apply the following configurable instruction section.

### Feature Documentation Template

    ```markdown
    ## Feature Name

    Brief description of the feature.

    ### Usage

    Basic usage example with code snippet.

    ### Configuration

    Configuration options with examples.

    ### Advanced Usage

    Complex scenarios and edge cases.

    ### Troubleshooting

    Common issues and solutions.
    ```

### API Endpoint Documentation Template

    ```markdown
    ### `HTTP_METHOD /api/endpoint`

    Description of what the endpoint does.

    **Request:**
    \`\`\`json
    {
      "param": "value"
    }
    \`\`\`

    **Response:**
    \`\`\`json
    {
      "result": "value"
    }
    \`\`\`

    **Status Codes:**
    - 200: Success
    - 400: Bad request
    - 401: Unauthorized
    ```

## Best Practices `apply-best-practices`

If `apply-best-practices == true`, then apply the following configurable instruction section.

### Do's

- ✅ Update documentation in the same commit as code changes
- ✅ Include before/after examples for changes to be reviewed before applying
- ✅ Test code examples before committing
- ✅ Use consistent formatting and terminology
- ✅ Document limitations and edge cases
- ✅ Provide migration paths for breaking changes
- ✅ Keep documentation DRY (link instead of duplicating)

### Don'ts

- ❌ Commit code changes without updating documentation
- ❌ Leave outdated examples in documentation
- ❌ Document features that don't exist yet
- ❌ Use vague or ambiguous language
- ❌ Forget to update changelog
- ❌ Ignore broken links or failing examples
- ❌ Document implementation details users don't need

## Validation Example Commands `apply-validation-commands`

If `apply-validation-commands == true`, then apply the following configurable instruction section.

Example scripts to apply to your project for documentation validation:

```json
{
  "scripts": {
    "docs:build": "Build documentation",
    "docs:test": "Test code examples in docs",
    "docs:lint": "Lint documentation files",
    "docs:links": "Check for broken links",
    "docs:spell": "Spell check documentation",
    "docs:validate": "Run all documentation checks"
  }
}
```

## Maintenance Schedule `apply-maintenance-schedule`

If `apply-maintenance-schedule == true`, then apply the following configurable instruction section.

### Regular Reviews

- **Monthly**: Review documentation for accuracy
- **Per release**: Update version numbers and examples
- **Quarterly**: Check for outdated patterns or deprecated features
- **Annually**: Comprehensive documentation audit

### Deprecation Process

When deprecating features:

1. Add deprecation notice to documentation
2. Update examples to use recommended alternatives
3. Create migration guide
4. Update changelog with deprecation notice
5. Set timeline for removal
6. In next major version, remove deprecated feature and docs

## Git Integration `apply-git-integration`

If `apply-git-integration == true`, then apply the following configurable instruction section.

### Pull Request Requirements

**Documentation must be updated in the same PR as code changes:**

- Document new features in the feature PR
- Update examples when code changes
- Add changelog entries with code changes
- Update API docs when interfaces change

### Documentation Review

**During code review, verify:**

- Documentation accurately describes the changes
- Examples are clear and complete
- No undocumented breaking changes
- Changelog entry is appropriate
- Migration guides are provided if needed

## Review Checklist

Before considering documentation complete, and concluding on the **final procedure**:

- [ ] **Compiled instructions** are based on the sum of **constant instruction sections** and
**configurable instruction sections**
- [ ] README.md reflects current project state
- [ ] All new features are documented
- [ ] Code examples are tested and work
- [ ] API documentation is complete and accurate
- [ ] Configuration examples are up to date
- [ ] Breaking changes are documented with migration guide
- [ ] CHANGELOG.md is updated
- [ ] Links are valid and not broken
- [ ] Installation instructions are current
- [ ] Environment variables are documented

## Updating Documentation on Code Change GOAL

- Keep documentation close to code when possible
- Use documentation generators for API reference
- Maintain living documentation that evolves with code
- Consider documentation as part of feature completeness
- Review documentation in code reviews
- Make documentation easy to find and navigate
